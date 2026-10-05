import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMembers } from "@/lib/data/queries";
import { accessSummary } from "@/lib/domain/permissions";
import { formatDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Permissions" };

export default async function PermissionsPage() {
  await requireSuperAdmin();
  const supabase = await createSupabaseServerClient();
  const [members, grants] = await Promise.all([
    listMembers(supabase),
    supabase.from("member_access_grants").select("id, subject_member_id, access_level, relationship, expires_at, revoked_at").is("revoked_at", null),
  ]);
  const names = new Map(members.map((m) => [m.id, m.display_name]));

  return (
    <>
      <PageHeader
        title="Family member access"
        subtitle="The Super Admin can manage the family's health data. Every family member owns their own health profile."
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-4 font-medium">Member</th>
                <th className="py-2 pr-4 font-medium">Own data</th>
                <th className="py-2 pr-4 font-medium">Family data</th>
                <th className="py-2 pr-4 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => {
                const access = accessSummary(m.role, m.status);
                return (
                  <tr key={m.id}>
                    <td className="py-2 pr-4 font-medium text-ink">{m.display_name}</td>
                    <td className="py-2 pr-4 text-ink">{access.ownData}</td>
                    <td className="py-2 pr-4 text-ink">{access.familyData}</td>
                    <td className="py-2 pr-4 text-ink">{access.admin ? "✓" : "No"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="How access is enforced">
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>Every record carries a family and a member. The database itself (row-level security) only returns rows the signed-in person may see. Hiding a menu is never the only protection.</li>
            <li>Medical files are in private storage. Each opening creates a link that expires after 60 seconds, after the same permission check.</li>
            <li>The health assistant uses the same permissions: it can only read what the person asking can read.</li>
            <li>Every upload, view, download, correction, move, export and "View as" is in the audit log.</li>
            <li>Deactivating an account removes all of that person's access immediately; their records are kept.</li>
          </ul>
        </Card>
        <Card title="Granular sharing (coming later)">
          <p className="text-sm text-ink-2">
            The data model already supports view-only, upload-only, full and temporary access, including for caregivers and doctors.
            For now there are two roles: Super Admin and individual family member.
          </p>
          {(grants.data ?? []).length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-ink">
              {(grants.data ?? []).map((g) => (
                <li key={g.id}>{g.relationship} has {g.access_level} access to {names.get(g.subject_member_id)}{g.expires_at && ` until ${formatDate(g.expires_at.slice(0, 10))}`}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
