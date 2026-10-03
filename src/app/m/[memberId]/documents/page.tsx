import Link from "next/link";
import { memberPage } from "@/lib/member-page";
import { memberDocuments } from "@/lib/data/queries";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { formatDate } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { RequestCorrection } from "@/components/client/MemberForms2";
import { UploadWizard } from "@/components/client/UploadWizard";

export default async function DocumentsPage({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ upload?: string }> }) {
  const { subject, supabase, viewer, canWrite, isSelf } = await memberPage(params);
  const { upload } = await searchParams;
  const all = await memberDocuments(supabase, subject.id, { filedOnly: false });
  const filed = all.filter((d) => d.status === "filed");
  const pending = all.filter((d) => d.status !== "filed");
  const isAdmin = viewer.isSuperAdmin && !viewer.viewAs;

  return (
    <div className="space-y-4">
      {canWrite && (
        <Card title="Upload documents" action={!upload && (isAdmin && !isSelf
          ? <ButtonLink href="/admin/upload">+ Upload Health Document</ButtonLink>
          : <ButtonLink href="?upload=1">+ Upload</ButtonLink>)}>
          {upload && (!isAdmin || isSelf) ? (
            <UploadWizard members={[{ id: subject.id, display_name: subject.display_name, avatar_color: subject.avatar_color }]} allowAuto={false} lockedMemberId={subject.id} />
          ) : (
            <p className="text-sm text-ink-2">Upload blood tests, scans, prescriptions or any medical document. They are read, checked and filed automatically.</p>
          )}
        </Card>
      )}
      {pending.length > 0 && (
        <Card title="Waiting for confirmation">
          <ul className="divide-y divide-border text-sm">
            {pending.map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2">
                <span className="text-ink">{d.original_filename}</span>
                <Badge tone="warning">{d.status === "failed" ? "Needs details" : "Needs review"}</Badge>
                {isAdmin && <Link className="ml-auto text-accent" href={`/admin/documents/${d.id}`}>Review</Link>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={`Documents (${filed.length})`}>
        {filed.length === 0 ? <EmptyState title="No documents yet" /> : (
          <ul className="divide-y divide-border">
            {filed.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{d.title ?? documentTypeInfo(d.document_type).label}</p>
                  <p className="text-xs text-ink-2">{formatDate(d.document_date)}{d.provider && ` · ${d.provider}`} · {d.filing_path.slice(1).join(" → ")}</p>
                  {d.uploaded_by_name && <p className="text-xs text-muted">Uploaded by {d.uploaded_by_name}</p>}
                </div>
                <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer" className="text-accent">View</a>
                <a href={`/api/documents/${d.id}/file?download=1`} className="text-accent">Download</a>
                {isAdmin ? <Link href={`/admin/documents/${d.id}`} className="text-accent">Edit / move</Link>
                  : canWrite && <RequestCorrection memberId={subject.id} entityType="document" entityId={d.id} label={`${d.title ?? "Document"} on ${formatDate(d.document_date)}`} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
