import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { familySnapshot } from "@/lib/data/family";
import { DOCUMENT_COLUMNS, type AuditRow, type DocumentRow } from "@/lib/data/types";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { formatDate, formatDateTime, relativeDays } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Family Overview" };

const PREVENTIVE_LABEL = { overdue: "Overdue", due_soon: "Due soon", no_record: "No record", up_to_date: "Up to date" } as const;

/**
 * A record-keeping view: who has recent data, what is missing, what was
 * uploaded, what is coming up. It never ranks or compares people's health;
 * everyone appears in the family's own order.
 */
export default async function FamilyOverview() {
  await requireSuperAdmin();
  const supabase = await createSupabaseServerClient();
  const [snapshots, uploads, activity, corrections] = await Promise.all([
    familySnapshot(supabase),
    supabase.from("documents").select(DOCUMENT_COLUMNS).order("created_at", { ascending: false }).limit(8),
    supabase.from("audit_log").select("id, occurred_at, actor_name, action, target_member_name, summary").order("occurred_at", { ascending: false }).limit(12),
    supabase.from("correction_requests").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  const names = new Map(snapshots.map((s) => [s.member.id, s.member.display_name]));
  const upcoming = snapshots
    .flatMap((s) => s.preventive.filter((p) => p.status === "overdue" || p.status === "due_soon").map((p) => ({ ...p, member: s.member })))
    .sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));

  return (
    <>
      <PageHeader
        title="Family Overview"
        subtitle="Keeping everyone's records complete and up to date. This is not a comparison of anyone's health."
      />
      {(corrections.count ?? 0) > 0 && (
        <Link href="/admin/corrections" className="mb-6 block rounded-2xl border border-border bg-surface px-5 py-3 text-sm text-ink hover:border-accent">
          <strong>{corrections.count}</strong> correction request{corrections.count === 1 ? "" : "s"} from family members →
        </Link>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Recent data and what's missing">
          <ul className="divide-y divide-border">
            {snapshots.map((s) => {
              const missing = s.completeness.checks.filter((c) => !c.done);
              return (
                <li key={s.member.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={s.member.display_name} color={s.member.avatar_color} size="sm" />
                    <Link href={`/m/${s.member.id}`} className="font-medium text-ink hover:text-accent">{s.member.display_name}</Link>
                    <span className="ml-auto text-sm text-ink-2">Last data: {relativeDays(s.latestActivity)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-1.5 flex-1 rounded-full bg-surface-2" role="img" aria-label={`Records ${s.completeness.percent}% complete`}>
                      <div className="h-1.5 rounded-full bg-accent" style={{ width: `${s.completeness.percent}%` }} />
                    </div>
                    <span className="w-24 text-right text-xs text-ink-2 tabular">{s.completeness.percent}% complete</span>
                  </div>
                  {missing.length > 0 && (
                    <p className="mt-1 text-xs text-ink-2">Missing: {missing.map((c) => c.label).join(", ")}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Upcoming preventive care">
          {upcoming.length === 0 ? (
            <EmptyState title="Nothing due in the next two months" />
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.slice(0, 12).map((item) => (
                <li key={`${item.member.id}-${item.rule.code}`} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-20 shrink-0 font-medium text-ink">{item.member.display_name}</span>
                  <span className="text-ink">{item.rule.title}</span>
                  <span className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-ink-2">{formatDate(item.dueOn)}</span>
                    <Badge tone={item.status === "overdue" ? "serious" : "warning"}>{PREVENTIVE_LABEL[item.status]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {snapshots.some((s) => s.preventive.some((p) => p.status === "no_record")) && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">No record yet</p>
              <ul className="mt-2 space-y-1 text-sm">
                {snapshots.filter((s) => s.preventive.some((p) => p.status === "no_record")).map((s) => (
                  <li key={s.member.id}>
                    <span className="font-medium text-ink">{s.member.display_name}:</span>{" "}
                    <span className="text-ink-2">{s.preventive.filter((p) => p.status === "no_record").map((p) => p.rule.title).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">General screening guidance, adjustable in Settings. Confirm timing with your doctors.</p>
        </Card>

        <Card title="Recent uploads" action={<Link href="/admin/documents" className="text-sm text-accent">All documents</Link>}>
          {(uploads.data ?? []).length === 0 ? (
            <EmptyState title="No documents yet"><Link className="text-accent" href="/admin/upload">Upload the first one</Link></EmptyState>
          ) : (
            <ul className="divide-y divide-border">
              {((uploads.data ?? []) as DocumentRow[]).map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link href={`/admin/documents/${d.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-accent">
                    {d.title ?? documentTypeInfo(d.document_type).label}
                    <span className="text-ink-2"> · {d.member_id ? names.get(d.member_id) ?? "—" : "Unassigned"}</span>
                  </Link>
                  {d.status !== "filed" && <Badge tone="warning">{d.status === "failed" ? "Needs details" : d.status === "processing" ? "Processing" : "Review"}</Badge>}
                  <span className="text-xs text-ink-2">{formatDate(d.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent health-record activity" action={<Link href="/admin/audit" className="text-sm text-accent">Audit log</Link>}>
          <ul className="divide-y divide-border">
            {((activity.data ?? []) as Pick<AuditRow, "id" | "occurred_at" | "actor_name" | "action" | "target_member_name" | "summary">[]).map((a) => (
              <li key={a.id} className="py-2 text-sm">
                <p className="text-ink">
                  <strong>{a.actor_name ?? "System"}</strong> {a.summary ?? a.action}
                  {a.target_member_name && !(a.summary ?? "").includes(a.target_member_name) && <span className="text-ink-2"> · {a.target_member_name}</span>}
                </p>
                <p className="text-xs text-ink-2">{formatDateTime(a.occurred_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
