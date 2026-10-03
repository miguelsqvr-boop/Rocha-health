import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMembers } from "@/lib/data/queries";
import { DOCUMENT_COLUMNS, type DocumentRow } from "@/lib/data/types";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { formatDate } from "@/lib/format";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, cx, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Documents" };

const STATUS = {
  processing: { label: "Processing", tone: "neutral" },
  ready_for_review: { label: "Ready to review", tone: "warning" },
  failed: { label: "Needs details", tone: "serious" },
  filed: { label: "Filed", tone: "good" },
} as const;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ view?: string; member?: string; q?: string }> }) {
  await requireSuperAdmin();
  const { view = "all", member, q } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const members = await listMembers(supabase);
  const names = new Map(members.map((m) => [m.id, m.display_name]));

  let query = supabase.from("documents").select(DOCUMENT_COLUMNS).order("created_at", { ascending: false }).limit(200);
  if (view === "review") query = query.neq("status", "filed");
  if (view === "filed") query = query.eq("status", "filed");
  if (member) query = query.eq("member_id", member);
  if (q) {
    const term = q.replace(/[%_,()]/g, " ").trim();
    query = query.or(`title.ilike.%${term}%,provider.ilike.%${term}%,original_filename.ilike.%${term}%,document_type.ilike.%${term}%`);
  }
  const { data } = await query;
  const docs = (data ?? []) as DocumentRow[];

  return (
    <>
      <PageHeader title="Documents" subtitle="Every document in the family's records." actions={<ButtonLink href="/admin/upload">+ Upload Health Document</ButtonLink>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="view" defaultValue={view} className={cx(inputClass, "w-auto")}>
          <option value="all">All</option>
          <option value="review">Waiting for review</option>
          <option value="filed">Filed</option>
        </select>
        <select name="member" defaultValue={member ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Everyone</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Search title, lab, file name…" className={cx(inputClass, "w-64")} />
        <button className="rounded-xl border border-border bg-surface px-4 py-2 text-sm">Filter</button>
      </form>
      <Card>
        {docs.length === 0 ? (
          <EmptyState title="No documents match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-2 pr-3 font-medium">Document</th>
                  <th className="py-2 pr-3 font-medium">Person</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Filed under</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/documents/${d.id}`} className="font-medium text-ink hover:text-accent">
                        {d.title ?? documentTypeInfo(d.document_type).label}
                      </Link>
                      <p className="text-xs text-ink-2">{d.provider ? `${d.provider} · ` : ""}{d.original_filename}</p>
                    </td>
                    <td className="py-2 pr-3 text-ink">{d.member_id ? names.get(d.member_id) : <span className="text-ink-2">Unassigned</span>}</td>
                    <td className="py-2 pr-3 text-ink-2 tabular">{formatDate(d.document_date)}</td>
                    <td className="py-2 pr-3 text-xs text-ink-2">{d.filing_path.slice(1).join(" → ")}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS[d.status].tone}>{STATUS[d.status].label}</Badge>
                      {d.identity_confirmed_by && <span className="ml-1"><Badge tone="warning">Identity confirmed manually</Badge></span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
