import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { familySnapshot } from "@/lib/data/family";
import { formatDate } from "@/lib/format";
import { Avatar, Badge, ButtonLink, Card, PageHeader, StatusPill } from "@/components/ui";

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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {snapshots.map(({ member, latestBloodTest, latestRecord, statuses }) => (
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
