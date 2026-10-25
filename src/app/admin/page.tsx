import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { familySnapshot } from "@/lib/data/family";
import { formatDate, formatValue } from "@/lib/format";
import { resultKey } from "@/lib/domain/health-summary";
import { Avatar, Badge, ButtonLink, Card, PageHeader, StatusPill } from "@/components/ui";
import { attentionLabel } from "@/components/member/NeedsAttention";

export const metadata: Metadata = { title: "Family Health" };

export default async function FamilyAdminDashboard() {
  await requireSuperAdmin();
  const supabase = await createSupabaseServerClient();
  const [snapshots, pending] = await Promise.all([
    familySnapshot(supabase),
    supabase.from("documents").select("id", { count: "exact", head: true }).neq("status", "filed"),
  ]);

  return (
    <>
      <PageHeader
        title="Family Health"
        subtitle="Each person's own health at a glance. Open anyone to see their complete profile."
        actions={
          <>
            <ButtonLink href="/admin/overview" variant="secondary">Family Overview</ButtonLink>
            <ButtonLink href="/admin/upload">+ Upload Health Document</ButtonLink>
          </>
        }
      />
      {(pending.count ?? 0) > 0 && (
        <Link href="/admin/documents?view=review" className="mb-6 flex items-center justify-between rounded-2xl border border-warning bg-warning/10 px-5 py-3 text-sm text-ink">
          <span><strong>{pending.count}</strong> uploaded document{pending.count === 1 ? "" : "s"} waiting for your review</span>
          <span className="text-accent">Review →</span>
        </Link>
      )}
      {snapshots.some((s) => s.attention.length > 0) && (
        <section aria-labelledby="family-attention" className="mb-6 rounded-2xl border-2 border-serious bg-serious/5 p-5">
          <h2 id="family-attention" className="text-base font-semibold text-ink"><span aria-hidden>⚠ </span>Results that need attention</h2>
          <p className="mt-1 text-xs text-ink-2">Each person&apos;s latest results outside the lab&apos;s reference range, in the family&apos;s usual order. Not a diagnosis.</p>
          <ul className="mt-3 space-y-3">
            {snapshots.filter((s) => s.attention.length > 0).map(({ member, attention }) => (
              <li key={member.id} className="text-sm">
                <Link href={`/m/${member.id}`} className="flex items-center gap-2 font-medium text-ink hover:text-accent">
                  <Avatar name={member.display_name} color={member.avatar_color} size="sm" />
                  {member.display_name}
                  <Badge tone="serious">{attention.length}</Badge>
                </Link>
                <ul className="mt-1 flex flex-wrap gap-2 pl-10">
                  {attention.slice(0, 6).map((item) => {
                    const label = attentionLabel(item);
                    const r = item.result;
                    return (
                      <li key={r.id}>
                        <Link href={`/m/${member.id}/trends?test=${encodeURIComponent(resultKey(r))}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 hover:border-accent">
                          <span className="text-ink">{r.biomarker?.name ?? r.analyte_name}</span>
                          <span className="tabular text-ink-2">{formatValue(r.value_numeric, r.value_text, r.unit)}</span>
                          <Badge tone={label.tone}>{label.text}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                  {attention.length > 6 && <li className="self-center text-xs text-ink-2"><Link href={`/m/${member.id}/labs`} className="text-accent">+{attention.length - 6} more</Link></li>}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {snapshots.map(({ member, latestBloodTest, latestRecord, statuses, attention }) => (
          <Link key={member.id} href={`/m/${member.id}`} className="group block">
            <Card className="h-full transition group-hover:border-accent">
              <div className="flex items-center gap-3">
                <Avatar name={member.display_name} color={member.avatar_color} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{member.display_name}</p>
                  <p className="text-xs text-ink-2">
                    {latestBloodTest ? <>Latest blood test · {formatDate(latestBloodTest)}</>
                      : latestRecord ? <>Latest health record · {formatDate(latestRecord.date)}</>
                      : "No records yet"}
                  </p>
                </div>
                <div className="ml-auto flex flex-col items-end gap-1">
                  {member.role === "super_admin" && <Badge tone="accent">Super Admin</Badge>}
                  {attention.length > 0 && <Badge tone={attention.some((i) => i.level === "far") ? "critical" : "serious"}><span aria-hidden>⚠</span>{attention.length} need{attention.length === 1 ? "s" : ""} attention</Badge>}
                  {member.status !== "active" && <Badge>{member.status === "deactivated" ? "Deactivated" : member.status === "invited" ? "Invited" : "No login"}</Badge>}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {statuses.map((s) => (
                  <div key={s.label}>
                    <dt className="text-xs text-ink-2">{s.label}</dt>
                    <dd className="mt-0.5"><StatusPill status={s.status} /></dd>
                  </div>
                ))}
              </dl>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">
        Statuses compare each person only with their own previous results and the lab's reference ranges. They are not a diagnosis.
      </p>
    </>
  );
}
