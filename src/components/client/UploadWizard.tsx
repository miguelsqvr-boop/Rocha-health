"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DocumentReview } from "@/lib/documents/review";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { formatDate } from "@/lib/format";
import {
  BUCKET, DOCX_MIME, isProtectedWordFile, MAX_UPLOAD_BYTES as MAX_BYTES, PROTECTED_WORD_MESSAGE, sha256Hex, UPLOAD_ACCEPT, UPLOAD_TYPES_LABEL, uploadMimeType,
} from "@/lib/documents/file-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Avatar, Badge, buttonClass, cx } from "@/components/ui";
import { callApi } from "./api";
import { ReviewForm } from "./ReviewForm";

interface MemberCard {
  id: string;
  display_name: string;
  avatar_color: string | null;
}

type Item =
  | { key: string; file: File; state: "queued" | "uploading" | "reading"; documentId?: string }
  | { key: string; file: File; state: "error"; error: string; documentId?: string }
  | { key: string; file: File; state: "review"; documentId: string; review: DocumentReview }
  | { key: string; file: File; state: "saved"; documentId: string; summary: string }
  | { key: string; file: File; state: "removed" };


/**
 * Upload workflow: 1 "+ Upload" → 2 who is it for (or let AI identify) →
 * 3 files → 4–5 processing and identification → 6 ready to save →
 * 7 confirm → 8 stored, filed and searchable.
 */
export function UploadWizard({ members, allowAuto, lockedMemberId, manualReviewPath }: { members: MemberCard[]; allowAuto: boolean; lockedMemberId?: string; manualReviewPath?: string }) {
  const router = useRouter();
  // By default every document is filed under the person it names (name and
  // date of birth); choosing a person up front is the exception.
  const [target, setTarget] = useState<string | "auto" | null>(lockedMemberId ?? (allowAuto ? "auto" : null));
  const [items, setItems] = useState<Item[]>([]);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const update = (key: string, next: Item) => setItems((list) => list.map((i) => (i.key === key ? next : i)));

  async function processFile(item: Item & { state: "queued" }, memberId: string | "auto") {
    const mimeType = uploadMimeType(item.file);
    if (!mimeType) {
      return update(item.key, { key: item.key, file: item.file, state: "error", error: `Only ${UPLOAD_TYPES_LABEL} can be uploaded.` });
    }
    if (mimeType === DOCX_MIME && isProtectedWordFile(new Uint8Array(await item.file.slice(0, 8).arrayBuffer()))) {
      return update(item.key, { key: item.key, file: item.file, state: "error", error: PROTECTED_WORD_MESSAGE });
    }
    if (item.file.size > MAX_BYTES) {
      return update(item.key, { key: item.key, file: item.file, state: "error", error: "This file is larger than 20 MB." });
    }
    update(item.key, { ...item, state: "uploading" });
    // 1. Register the file (name, type, size, fingerprint): duplicates are
    //    refused here, and a private storage path is reserved for it.
    const bytes = await item.file.arrayBuffer();
    const reserved = await callApi<{ documentId: string; storagePath: string }>("POST", "/api/documents", {
      filename: item.file.name,
      mimeType,
      size: item.file.size,
      contentHash: await sha256Hex(bytes),
      memberId,
    });
    if (!reserved.ok) {
      return update(item.key, { key: item.key, file: item.file, state: "error", error: reserved.data.error ?? "Upload failed." });
    }
    const { documentId, storagePath } = reserved.data;
    // 2. Send the file straight to private storage with the uploader's own
    //    session (storage policies accept it only at the reserved path). Raw
    //    bytes, so the stored type is the one resolved above even when the
    //    browser didn't know it (Word files on some computers).
    const { error: storageError } = await createSupabaseBrowserClient()
      .storage.from(BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (storageError) {
      await callApi("DELETE", `/api/documents/${documentId}`, { reason: "Upload failed" });
      return update(item.key, { key: item.key, file: item.file, state: "error", error: "The file could not be sent. Check your connection and try again." });
    }
    update(item.key, { key: item.key, file: item.file, state: "reading", documentId });
    const processed = await callApi<DocumentReview>("POST", `/api/documents/${documentId}/process`);
    if (!processed.ok) {
      return update(item.key, { key: item.key, file: item.file, state: "error", documentId, error: processed.data.error ?? "Processing failed." });
    }
    update(item.key, { key: item.key, file: item.file, state: "review", documentId, review: processed.data });
  }

  async function addFiles(files: FileList | File[]) {
    if (!target) return;
    const fresh = Array.from(files).map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, state: "queued" as const }));
    setItems((list) => [...list, ...fresh]);
    // Two at a time keeps large batches moving without overloading anything.
    const queue = [...fresh];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await processFile(next, target);
    };
    await Promise.all([worker(), worker()]);
  }

  const selectedName = target === "auto" ? "the person named on each document" : members.find((m) => m.id === target)?.display_name;
  const active = items.filter((i) => i.state !== "removed");

  if (!target) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-ink">Who is this for?</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {members.map((m) => (
            <button key={m.id} type="button" onClick={() => setTarget(m.id)} className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-6 text-ink transition hover:border-accent hover:bg-accent-soft">
              <Avatar name={m.display_name} color={m.avatar_color} size="lg" />
              <span className="text-lg font-semibold">{m.display_name}</span>
            </button>
          ))}
          {allowAuto && (
            <button type="button" onClick={() => setTarget("auto")} className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-accent bg-surface px-4 py-6 text-center text-ink transition hover:bg-accent-soft">
              <span className="text-2xl" aria-hidden>✦</span>
              <span className="text-lg font-semibold">Let AI identify automatically</span>
              <span className="text-xs text-ink-2">For a mixed pile of documents. You'll confirm each one.</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink-2">Uploading for <strong className="text-ink">{selectedName}</strong></p>
        {!lockedMemberId && active.length === 0 && (
          <button type="button" className="text-sm text-accent" onClick={() => setTarget(null)}>{target === "auto" ? "Choose a person instead" : "Change"}</button>
        )}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={cx("rounded-2xl border-2 border-dashed px-6 py-10 text-center", dragging ? "border-accent bg-accent-soft" : "border-border bg-surface")}
      >
        <p className="font-medium text-ink">
          <span className="pointer-coarse:hidden">Drop medical documents here</span>
          <span className="hidden pointer-coarse:inline">Add medical documents</span>
        </p>
        <p className="mt-1 text-sm text-ink-2">{UPLOAD_TYPES_LABEL}, one or many. Up to 20 MB each.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {/* Phones and tablets: photograph a paper document straight from the camera. */}
          <span className="hidden pointer-coarse:inline-flex">
            <button type="button" className={buttonClass.secondary} onClick={() => cameraRef.current?.click()}>Take a photo</button>
          </span>
          <button type="button" className={buttonClass.primary} onClick={() => inputRef.current?.click()}>Choose files</button>
        </div>
        <input ref={inputRef} type="file" multiple accept={UPLOAD_ACCEPT} className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        {/* JPEG/PNG only, so iPhones convert HEIC photos to JPEG. */}
        <input ref={cameraRef} type="file" accept="image/jpeg,image/png" capture="environment" className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        <p className="mt-3 hidden text-xs text-ink-2 pointer-coarse:block">For a document with several pages, a PDF from a scanner app keeps the pages together.</p>
      </div>

      {active.length > 0 && (
        <ul className="space-y-3">
          {active.map((item) => (
            <li key={item.key} className="rounded-2xl border border-border bg-surface p-4">
              <ItemHeader item={item} members={members} manualReviewPath={manualReviewPath} open={openKey === item.key} onToggle={() => setOpenKey(openKey === item.key ? null : item.key)} />
              {item.state === "review" && openKey === item.key && (
                <div className="mt-4 border-t border-border pt-4">
                  <ReviewForm
                    review={item.review}
                    selectedMemberId={target === "auto" ? null : target}
                    onSaved={({ memberName, title, outOfRange }) => {
                      const flagged = outOfRange === 0 ? "" : ` · ⚠ ${outOfRange} result${outOfRange === 1 ? "" : "s"} outside the reference range`;
                      update(item.key, { key: item.key, file: item.file, state: "saved", documentId: item.documentId, summary: `${memberName} — ${title}${flagged}` });
                      setOpenKey(null);
                      router.refresh();
                    }}
                    onCancelled={() => update(item.key, { key: item.key, file: item.file, state: "removed" })}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemHeader({ item, members, manualReviewPath, open, onToggle }: { item: Item; members: MemberCard[]; manualReviewPath?: string; open: boolean; onToggle: () => void }) {
  if (item.state === "removed") return null;
  const name = item.file.name;
  if (item.state === "queued" || item.state === "uploading" || item.state === "reading") {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="h-3 w-3 animate-pulse rounded-full bg-accent" aria-hidden />
        <span className="text-ink">{name}</span>
        <span className="ml-auto text-ink-2">{item.state === "queued" ? "Waiting…" : item.state === "uploading" ? "Uploading securely…" : "Reading and identifying…"}</span>
      </div>
    );
  }
  if (item.state === "error") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-ink">{name}</span>
        <span className="ml-auto text-critical-ink">{item.error}</span>
        {item.documentId && manualReviewPath && <a className="text-accent" href={`${manualReviewPath}${item.documentId}`}>Enter details manually</a>}
      </div>
    );
  }
  if (item.state === "saved") {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="text-good-ink" aria-hidden>✓</span>
        <span className="text-ink">Saved and organized: {item.summary}</span>
        <span className="ml-auto text-ink-2">{name}</span>
      </div>
    );
  }
  if (item.state !== "review") return null;
  const review = item.review;
  const extraction = review.extraction;
  const suggestedId = review.identity?.suggested_member_id ?? null;
  const memberName = members.find((m) => m.id === (review.member_id ?? suggestedId))?.display_name ?? "Unidentified";
  const results = extraction?.results ?? [];
  const toReview = results.filter((r) => r.confidence === "needs_review").length;
  const identityStatus = review.member_id ? review.identity?.by_member[review.member_id]?.status : suggestedId ? "match" : undefined;
  return (
    <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-3 text-left" aria-expanded={open}>
      <div className="min-w-0">
        <p className="font-medium text-ink">
          {review.status === "failed" ? `${name} — needs details` : `${memberName} — ${review.title ?? documentTypeInfo(review.document_type).label} — ${formatDate(review.document_date)}`}
        </p>
        {results.length > 0 && (
          <p className="text-sm text-ink-2">
            {results.length} results found · {results.length - toReview} high confidence{toReview > 0 && ` · ${toReview} need review`}
          </p>
        )}
      </div>
      <span className="ml-auto flex items-center gap-2">
        {identityStatus === "match" ? <Badge tone="good">✓ Identity matches</Badge> : <Badge tone="serious">⚠ Check identity</Badge>}
        <span className={buttonClass.secondary}>{open ? "Close" : "Review & save"}</span>
      </span>
    </button>
  );
}
