"use client";

import { useMemo, useState } from "react";
import type { DocumentReview, ReviewResult } from "@/lib/documents/review";
import { describeCheck } from "@/lib/domain/identity";
import { buildFilingPath, DOCUMENT_TYPE_CODES, DOCUMENT_TYPES, documentTypeInfo } from "@/lib/domain/taxonomy";
import { parseNumeric } from "@/lib/domain/biomarkers";
import { formatDate, formatRange } from "@/lib/format";
import { buttonClass, inputClass } from "@/components/ui";
import { callApi } from "./api";

interface Props {
  review: DocumentReview;
  /** Member chosen in "Who is this for?" (null = let AI identify). */
  selectedMemberId: string | null;
  onSaved: (summary: { memberName: string; title: string }) => void;
  onCancelled?: () => void;
}

/**
 * Review & confirm one document. Wrong-person protection: when the identity
 * check for the chosen person is not a clean match, saving requires an
 * explicit choice, and the server refuses without it.
 */
export function ReviewForm({ review, selectedMemberId, onSaved, onCancelled }: Props) {
  const identity = review.identity;
  const extraction = review.extraction;
  const candidates = review.candidates;
  const nameOf = (id: string | null) => candidates.find((c) => c.id === id);

  const initialMember = selectedMemberId ?? identity?.suggested_member_id ?? (candidates.length === 1 ? candidates[0].id : null);
  const [memberId, setMemberId] = useState<string | null>(initialMember);
  const [acknowledged, setAcknowledged] = useState(false);
  const [documentType, setDocumentType] = useState(review.document_type ?? "other");
  const [title, setTitle] = useState(review.title ?? documentTypeInfo(review.document_type).label);
  const [documentDate, setDocumentDate] = useState(review.document_date ?? "");
  const [provider, setProvider] = useState(review.provider ?? "");
  const [results, setResults] = useState<ReviewResult[]>(() =>
    [...(extraction?.results ?? [])].sort((a, b) => Number(b.confidence === "needs_review") - Number(a.confidence === "needs_review")),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = memberId ? identity?.by_member[memberId] : undefined;
  const status = check?.status ?? "unchecked";
  const selected = nameOf(memberId);
  const suggested = identity?.suggested_member_id && identity.suggested_member_id !== memberId ? nameOf(identity.suggested_member_id) : undefined;
  const needsReview = results.filter((r) => r.confidence === "needs_review").length;
  const filing = useMemo(() => buildFilingPath(documentType, documentDate || null), [documentType, documentDate]);

  async function save(targetId: string, acknowledge: boolean) {
    setSaving(true);
    setError(null);
    const result = await callApi("POST", `/api/documents/${review.id}/confirm`, {
      memberId: targetId,
      acknowledgeIdentity: acknowledge,
      documentType,
      title: title.trim() || documentTypeInfo(documentType).label,
      documentDate: documentDate || null,
      provider: provider.trim() || null,
      results,
    });
    setSaving(false);
    if (result.ok) return onSaved({ memberName: nameOf(targetId)?.display_name ?? "", title });
    if (result.status === 409 && result.data.detail?.code === "identity_confirmation_required") {
      setError("Please confirm who this document belongs to before saving.");
    } else {
      setError(result.data.error ?? "The document could not be saved.");
    }
  }

  async function cancel() {
    if (!window.confirm("Remove this upload? The file will be deleted.")) return;
    await callApi("DELETE", `/api/documents/${review.id}`, { reason: "Cancelled during review" });
    onCancelled?.();
  }

  function updateResult(index: number, patch: Partial<ReviewResult>) {
    setResults((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  const printedName = identity?.extracted.patientName;
  const printedDob = identity?.extracted.dateOfBirth;

  return (
    <div className="space-y-5">
      {/* Identity */}
      {review.status === "failed" && (
        <div className="rounded-xl border border-warning bg-warning/10 p-4 text-sm text-ink">
          <strong>We couldn't read this document automatically.</strong> {review.processing_error} You can still file it by entering the details below.
        </div>
      )}

      {memberId && status === "match" ? (
        <div className="rounded-xl border border-good/40 bg-good/10 p-4">
          <p className="font-medium text-ink">Document appears to belong to {selected?.display_name}</p>
          <ul className="mt-2 space-y-1 text-sm">
            {describeCheck(check).map((line) => (
              <li key={line.text} className={line.ok ? "text-good-ink" : "text-ink-2"}>
                <span aria-hidden>{line.ok ? "✓ " : "• "}</span>{line.text}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div role="alert" className="rounded-xl border-2 border-serious bg-serious/10 p-4">
          <p className="font-semibold text-ink">
            <span aria-hidden>⚠ </span>
            {status === "mismatch" ? "Patient mismatch" : "We couldn't confirm who this document belongs to"}
          </p>
          <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <p className="text-ink-2">You selected</p>
              <p className="font-medium text-ink">{selected ? selected.legal_name ?? selected.display_name : "No one yet"}</p>
            </div>
            <div>
              <p className="text-ink-2">The document {printedName ? "appears to belong to" : "shows"}</p>
              <p className="font-medium text-ink">
                {printedName ?? "No patient name found"}
                {printedDob && <span className="text-ink-2"> · born {formatDate(printedDob)}</span>}
              </p>
            </div>
          </div>
          {check && (
            <ul className="mt-2 space-y-1 text-sm text-ink-2">
              {describeCheck(check).map((line) => <li key={line.text}><span aria-hidden>{line.ok ? "✓ " : "• "}</span>{line.text}</li>)}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {selected && (
              <button type="button" disabled={saving} className={buttonClass.secondary} onClick={() => save(selected.id, true)}>
                Assign to {selected.display_name}
              </button>
            )}
            {suggested && (
              <button type="button" disabled={saving} className={buttonClass.primary} onClick={() => save(suggested.id, identity?.by_member[suggested.id]?.status !== "match")}>
                Assign to {suggested.display_name}
              </button>
            )}
            <button type="button" className={buttonClass.secondary} onClick={cancel}>Cancel</button>
          </div>
          {!suggested && candidates.length > 1 && (
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              Someone else:
              <select value={memberId ?? ""} onChange={(e) => { setMemberId(e.target.value || null); setAcknowledged(false); }} className={`${inputClass} w-auto`}>
                <option value="">Choose…</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
              </select>
            </label>
          )}
          {selected && (
            <label className="mt-3 flex items-start gap-2 text-sm text-ink">
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
              I have checked this document and confirm it belongs to {selected.display_name}.
            </label>
          )}
        </div>
      )}

      {/* Details */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-ink-2">Type</span>
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className={inputClass}>
            {DOCUMENT_TYPE_CODES.map((code) => <option key={code} value={code}>{DOCUMENT_TYPES[code].label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-2">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-2">Date</span>
          <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} className={inputClass} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-2">Laboratory / provider</span>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} className={inputClass} />
        </label>
      </div>
      <p className="text-sm text-ink-2">
        Will be filed as: <span className="text-ink">{[selected?.display_name ?? "…", ...filing].join(" → ")}</span>
      </p>
      {extraction?.summary && <p className="text-sm text-ink-2">{extraction.summary}</p>}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-ink">
            <strong>{results.length} results found.</strong> {results.length - needsReview} high confidence
            {needsReview > 0 && <>, <span className="text-serious-ink">{needsReview} need review</span></>}.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs text-ink-2">
                <tr>
                  <th className="px-3 py-2 font-medium">Test</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Unit</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 font-medium">Check</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r, i) => (
                  <tr key={i} className={r.confidence === "needs_review" ? "bg-warning/10" : undefined}>
                    <td className="px-3 py-2">
                      <p className="text-ink">{r.biomarker_name ?? r.analyte_name}</p>
                      {r.biomarker_name && r.biomarker_name !== r.analyte_name && <p className="text-xs text-ink-2">{r.analyte_name}</p>}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Value for ${r.analyte_name}`}
                        defaultValue={r.value_numeric ?? r.value_text ?? ""}
                        onBlur={(e) => {
                          const numeric = parseNumeric(e.target.value);
                          updateResult(i, { value_numeric: numeric, value_text: numeric === null ? e.target.value : null });
                        }}
                        className={`${inputClass} w-24 tabular`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input aria-label={`Unit for ${r.analyte_name}`} defaultValue={r.unit ?? ""} onBlur={(e) => updateResult(i, { unit: e.target.value || null })} className={`${inputClass} w-24`} />
                    </td>
                    <td className="px-3 py-2 text-ink-2 tabular">
                      {formatRange(r.reference_low, r.reference_high, r.reference_text)}
                      {r.flag && r.flag !== "normal" && <span className="ml-2 text-serious-ink">{r.flag === "low" ? "▼ Low" : r.flag === "high" ? "▲ High" : "! Abnormal"}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {r.confidence === "needs_review" ? (
                        <button type="button" className="text-xs text-accent" onClick={() => updateResult(i, { confidence: "high" })}>Mark as checked</button>
                      ) : (
                        <span className="text-xs text-good-ink">✓ OK</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="text-xs text-ink-2 hover:text-critical-ink" onClick={() => setResults((rows) => rows.filter((_, j) => j !== i))}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-critical-ink">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || !memberId || (status !== "match" && !acknowledged)}
          className={buttonClass.primary}
          onClick={() => memberId && save(memberId, status !== "match")}
        >
          {saving ? "Saving…" : "Save & Organize"}
        </button>
        {status === "match" && <button type="button" className={buttonClass.secondary} onClick={cancel}>Remove upload</button>}
      </div>
    </div>
  );
}
