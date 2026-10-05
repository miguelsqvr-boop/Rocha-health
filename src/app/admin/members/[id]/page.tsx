import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MEMBER_COLUMNS, type MemberRow } from "@/lib/data/types";
import { formatDateTime } from "@/lib/format";
import { Avatar, Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/ActionButton";
import { InviteForm, MemberProfileForm } from "@/components/client/MemberForms";

export const metadata: Metadata = { title: "Family member" };

export default async function MemberAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireSuperAdmin();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("family_members").select(MEMBER_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const member = data as MemberRow;
  const isSelf = member.id === viewer.member.id;

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><Avatar name={member.display_name} color={member.avatar_color} />{member.display_name}</span>}
        subtitle={member.role === "super_admin" ? "Super Admin" : "Family member"}
        actions={
          <>
            <ButtonLink href={`/m/${member.id}`} variant="secondary">Open health profile</ButtonLink>
            {!isSelf && member.status !== "deactivated" && (
              <ActionButton method="POST" url="/api/view-as" body={{ memberId: member.id }} variant="primary">View as {member.display_name}</ActionButton>
            )}
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Profile" className="lg:col-span-2">
          <MemberProfileForm
            memberId={member.id}
            initial={{
              displayName: member.display_name,
              legalName: member.legal_name ?? "",
              aliases: (member.name_aliases ?? []).join(", "),
              dateOfBirth: member.date_of_birth ?? "",
              sex: member.sex ?? "",
              email: member.email ?? "",
            }}
          />
        </Card>
        <div className="space-y-4">
          <Card title="Account">
            <p className="text-sm text-ink">
              {member.status === "active" && <Badge tone="good">Active</Badge>}
              {member.status === "invited" && <Badge>Invited · {formatDateTime(member.invited_at)}</Badge>}
              {member.status === "not_invited" && <Badge>No login yet</Badge>}
              {member.status === "deactivated" && <Badge tone="critical">Deactivated</Badge>}
            </p>
            {member.user_id === null && member.status !== "deactivated" && (
              <div className="mt-4"><InviteForm memberId={member.id} defaultEmail={member.email} displayName={member.display_name} /></div>
            )}
            {!isSelf && (
              <div className="mt-4 flex flex-wrap gap-2">
                {member.status !== "deactivated" ? (
                  <ActionButton method="PATCH" url={`/api/members/${member.id}`} body={{ status: "deactivated" }} variant="danger"
                    confirm={`Deactivate ${member.display_name}? They will immediately lose access to everything, including their own records. Their records are kept.`}>
                    Deactivate account
                  </ActionButton>
                ) : (
                  <ActionButton method="PATCH" url={`/api/members/${member.id}`} body={{ status: member.user_id ? "active" : "not_invited" }}>
                    Reactivate
                  </ActionButton>
                )}
              </div>
            )}
          </Card>
          <Card title="Access">
            <p className="text-sm text-ink-2">
              {member.role === "super_admin"
                ? "Full access to the whole family's health records, settings and audit log."
                : "Full access to their own records only. Cannot see anyone else's information."}
            </p>
            {!isSelf && member.status === "active" && (
              <div className="mt-3">
                {member.role === "super_admin" ? (
                  <ActionButton method="PATCH" url={`/api/members/${member.id}`} body={{ role: "member" }}
                    confirm={`Remove Super Admin access from ${member.display_name}?`}>Make regular member</ActionButton>
                ) : (
                  <ActionButton method="PATCH" url={`/api/members/${member.id}`} body={{ role: "super_admin" }}
                    confirm={`Make ${member.display_name} a Super Admin? They will see every family member's health records.`}>Make Super Admin</ActionButton>
                )}
              </div>
            )}
            <p className="mt-3 text-xs text-muted">See <Link href="/admin/permissions" className="text-accent">Permissions</Link> for the whole family.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
