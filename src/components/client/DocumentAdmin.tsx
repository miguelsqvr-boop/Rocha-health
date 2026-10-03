"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DocumentReview } from "@/lib/documents/review";
import type { IdentityAssessment } from "@/lib/domain/identity";
import { describeCheck } from "@/lib/domain/identity";
import { DOCUMENT_TYPE_CODES, DOCUMENT_TYPES } from "@/lib/domain/taxonomy";
import { parseNumeric } from "@/lib/domain/biomarkers";
import { buttonClass, inputClass } from "@/components/ui";
import { callApi } from "./api";
import { ReviewForm } from "./ReviewForm";

export function ReviewPanel({ review, donePath }: { review: DocumentReview; donePath: string }) {
  const router = useRouter();
  return (
    <ReviewForm
      review={review}
      selectedMemberId={review.member_id}
      onSaved={() => { router.push(donePath); router.refresh(); }}
      onCancelled={() => { router.push(donePath); router.refresh(); }}
    />
  );
}

export function DetailsEditor(props: { documentId: string; documentType: string | null; title: string | null; documentDate: string | null; provider: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    documentType: props.documentType ?? "other",
    title: props.title ?? "",
    documentDate: props.documentDate ?? "",
    provider: props.provider ?? "",
  });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const result = await callApi("PATCH", `/api/documents/${props.documentId}/details`, {
      documentType: form.documentType,
      title: form.title || DOCUMENT_TYPES[form.documentType as keyof typeof DOCUMENT_TYPES]?.label || "Document",
      documentDate: form.documentDate || null,
      provider: form.provider || null,
    });
    setMessage(result.ok ? { ok: true, text: "Saved. The document has been re-filed." } : { ok: false, text: result.data.error ?? "Could not save." });
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm"><span className="mb-1 block text-ink-2">Type</span>
        <select value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} className={inputClass}>
          {DOCUMENT_TYPE_CODES.map((code) => <option key={code} value={code}>{DOCUMENT_TYPES[code].label}</option>)}
        </select>
      </label>
      <label className="text-sm"><span className="mb-1 block text-ink-2">Title</span>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
      </label>
      <label className="text-sm"><span className="mb-1 block text-ink-2">Date</span>
        <input type="date" value={form.documentDate} onChange={(e) => setForm({ ...form, documentDate: e.target.value })} className={inputClass} />
      </label>
      <label className="text-sm"><span className="mb-1 block text-ink-2">Laboratory / provider</span>
        <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className={inputClass} />
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className={buttonClass.secondary}>Save details</button>
        {message && <span role="status" className={message.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"}>{message.text}</span>}
      </div>
    </form>
  );
}

/** Super Admin: move a filed document to the right person, with the same identity safeguard. */
export function MoveDocumentForm(props: {
  documentId: string;
  currentMemberId: string;
  members: { id: string; display_name: string }[];
  identity: IdentityAssessment | null;
}) {
  const router = useRouter();
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = to ? props.identity?.by_member[to] : undefined;
  const matches = check?.status === "match";
  const target = props.members.find((m) => m.id === to);

  async function move(event: React.FormEvent) {
    event.preventDefault();
    const result = await callApi("POST", `/api/documents/${props.documentId}/move`, { toMemberId: to, acknowledgeIdentity: !matches && acknowledged, reason: reason || undefined });
    if (!result.ok) return setError(result.data.error ?? "Could not move the document.");
    router.refresh();
  }

  return (
    <form onSubmit={move} className="space-y-3">
      <label className="block text-sm"><span className="mb-1 block text-ink-2">Move to</span>
        <select value={to} onChange={(e) => { setTo(e.target.value); setAcknowledged(false); }} className={inputClass}>
          <option value="">Choose a family member…</option>
          {props.members.filter((m) => m.id !== props.currentMemberId).map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
      </label>
      {target && (
        matches ? (
          <p className="text-sm text-good-ink">✓ The document's patient details match {target.display_name}.</p>
        ) : (
          <div role="alert" className="rounded-xl border-2 border-serious bg-serious/10 p-3 text-sm">
            <p className="font-medium text-ink">⚠ This document was not confirmed as {target.display_name}'s.</p>
            <ul className="mt-1 text-ink-2">{describeCheck(check).map((l) => <li key={l.text}>• {l.text}</li>)}</ul>
            <label className="mt-2 flex items-start gap-2 text-ink">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
              I have checked and this document belongs to {target.display_name}.
            </label>
          </div>
        )
      )}
      <label className="block text-sm"><span className="mb-1 block text-ink-2">Reason (recorded in the audit log)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Uploaded under the wrong person" className={inputClass} />
      </label>
      <button disabled={!to || (!matches && !acknowledged)} className={buttonClass.primary}>Move document</button>
      {error && <p role="alert" className="text-sm text-critical-ink">{error}</p>}
    </form>
  );
}

/** Inline correction of one extracted value (Super Admin). Audited as "HbA1c 5.6 → 5.4". */
export function ResultEditor(props: { resultId: string; value: number | null; text: string | null; unit: string | null; low: number | null; high: number | null; flag: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(props.value ?? props.text ?? ""));
  const [unit, setUnit] = useState(props.unit ?? "");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const numeric = parseNumeric(value);
    const low = props.low, high = props.high;
    const flag = numeric === null ? props.flag : low !== null && numeric < low ? "low" : high !== null && numeric > high ? "high" : low !== null || high !== null ? "normal" : null;
    const result = await callApi("PATCH", `/api/results/${props.resultId}`, {
      value_numeric: numeric, value_text: numeric === null ? value : null, unit: unit || null,
      reference_low: low, reference_high: high, flag,
    });
    if (!result.ok) return setError(result.data.error ?? "Could not save.");
    setEditing(false);
    router.refresh();
  }

  if (!editing) return <button type="button" className="text-xs text-accent" onClick={() => setEditing(true)}>Correct</button>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} w-20`} />
      <input aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} className={`${inputClass} w-20`} />
      <button type="button" className="text-xs text-accent" onClick={save}>Save</button>
      <button type="button" className="text-xs text-ink-2" onClick={() => setEditing(false)}>Cancel</button>
      {error && <span className="text-xs text-critical-ink">{error}</span>}
    </span>
  );
}
