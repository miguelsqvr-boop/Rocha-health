import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { documentReview, loadDocument } from "@/lib/documents/pipeline";
import { listMembers, memberResults } from "@/lib/data/queries";
import { ApiError } from "@/lib/api";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { formatDate, formatDateTime, formatRange, formatValue } from "@/lib/format";
import { Badge, Card, FlagBadge, PageHeader, buttonClass } from "@/components/ui";
import { ActionButton } from "@/components/client/ActionButton";
import { DetailsEditor, MoveDocumentForm, ResultEditor, ReviewPanel } from "@/components/client/DocumentAdmin";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSuperAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const doc = await loadDocument(supabase, id).catch((e) => { if (e instanceof ApiError) notFound(); throw e; });
  const members = await listMembers(supabase);
  const owner = members.find((m) => m.id === doc.member_id);

  if (doc.status !== "filed") {
    const review = await documentReview(supabase, viewer, id);
    return (
      <>
        <PageHeader title={`Review: ${doc.original_filename}`} subtitle={`Uploaded by ${doc.uploaded_by_name ?? "—"} on ${formatDateTime(doc.created_at)}`}
          actions={<a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className={buttonClass.secondary}>Open original</a>} />
        <Card>
          {doc.status === "processing" ? (
            <div className="space-y-3 text-sm text-ink-2">
              <p>This document hasn't been read yet.</p>
              <ActionButton method="POST" url={`/api/documents/${doc.id}/process`} variant="primary">Read and identify now</ActionButton>
            </div>
          ) : (
            <ReviewPanel review={review} donePath="/admin/documents?view=review" />
          )}
        </Card>
      </>
    );
  }

  const results = (await memberResults(supabase, doc.member_id!)).filter((r) => r.source_document_id === doc.id);
  return (
    <>
      <PageHeader
        title={`${doc.title ?? documentTypeInfo(doc.document_type).label} — ${owner?.display_name ?? "—"} — ${formatDate(doc.document_date)}`}
        subtitle={[owner?.display_name, ...doc.filing_path].join(" → ")}
        actions={
          <>
            <a href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer" className={buttonClass.secondary}>Open</a>
            <a href={`/api/documents/${doc.id}/file?download=1`} className={buttonClass.secondary}>Download</a>
            <ActionButton method="DELETE" url={`/api/documents/${doc.id}`} variant="danger" body={{ reason: "Deleted by Super Admin" }}
              confirm="Delete this document and its results? The file is removed; the audit log keeps a record.">Delete</ActionButton>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DetailsEditor documentId={doc.id} documentType={doc.document_type} title={doc.title} documentDate={doc.document_date} provider={doc.provider} />
        </Card>
        <Card title="Identity">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-ink-2">Patient on document</dt><dd className="text-ink">{doc.extracted_patient_name ?? "Not found"}{doc.extracted_date_of_birth && ` · born ${formatDate(doc.extracted_date_of_birth)}`}</dd></div>
            <div><dt className="text-ink-2">Filed under</dt><dd className="text-ink">{owner?.display_name}</dd></div>
            <div><dt className="text-ink-2">Identity check</dt><dd>
              {doc.identity_status === "match" ? <Badge tone="good">✓ Matched</Badge> : <Badge tone="warning">Confirmed manually</Badge>}
            </dd></div>
            <div><dt className="text-ink-2">Uploaded</dt><dd className="text-ink">{doc.uploaded_by_name} · {formatDateTime(doc.created_at)}</dd></div>
          </dl>
        </Card>
        <Card title={`Results (${results.length})`} className="lg:col-span-2">
          {results.length === 0 ? <p className="text-sm text-ink-2">No structured results for this document.</p> : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {results.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3 text-ink">{r.biomarker?.name ?? r.analyte_name}</td>
                    <td className="py-2 pr-3 tabular text-ink">{formatValue(r.value_numeric, r.value_text, r.unit)}</td>
                    <td className="py-2 pr-3 tabular text-ink-2">{formatRange(r.reference_low, r.reference_high, r.reference_text)}</td>
                    <td className="py-2 pr-3"><FlagBadge flag={r.flag} /></td>
                    <td className="py-2 text-right"><ResultEditor resultId={r.id} value={r.value_numeric} text={r.value_text} unit={r.unit} low={r.reference_low} high={r.reference_high} flag={r.flag} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Wrong person?">
          <p className="mb-3 text-sm text-ink-2">Move this document and its results to the right family member. Access changes immediately.</p>
          <MoveDocumentForm documentId={doc.id} currentMemberId={doc.member_id!} members={members.map((m) => ({ id: m.id, display_name: m.display_name }))} identity={doc.identity_assessment} />
        </Card>
      </div>
      <p className="mt-6 text-sm"><Link href="/admin/documents" className="text-accent">← All documents</Link></p>
    </>
  );
}
