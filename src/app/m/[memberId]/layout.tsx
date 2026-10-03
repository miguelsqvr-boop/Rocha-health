import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Avatar, Badge } from "@/components/ui";
import { MemberNav } from "@/components/client/MemberNav";
import { ActionButton } from "@/components/client/ActionButton";
import { requireMemberAccess } from "@/lib/auth/viewer";

/**
 * A person's complete health profile. The same pages serve the member
 * ("My Health"), the Super Admin opening someone's profile, and "View as".
 * requireMemberAccess() reads the member through RLS, so anyone else gets 404.
 */
export default async function MemberLayout({ children, params }: { children: ReactNode; params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  const { viewer, subject, supabase, isSelf } = await requireMemberAccess(memberId);
  const ownView = isSelf || Boolean(viewer.viewAs);

  if (!ownView) {
    await supabase.rpc("log_access", {
      p_action: "profile.view",
      p_target_member_id: subject.id,
      p_entity_type: "family_member",
      p_entity_id: subject.id,
      p_summary: `Opened ${subject.display_name}'s health profile`,
    });
  }

  return (
    <AppShell viewer={viewer}>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Avatar name={subject.display_name} color={subject.avatar_color} />
        <div>
          <h1 className="text-xl font-semibold text-ink">{ownView ? "My Health" : `${subject.display_name}'s Health`}</h1>
          {!ownView && <p className="text-sm text-ink-2">You're viewing this profile as the family's Super Admin.</p>}
        </div>
        {!ownView && subject.status === "deactivated" && <Badge tone="critical">Account deactivated</Badge>}
        {!ownView && viewer.isSuperAdmin && subject.status !== "deactivated" && (
          <span className="ml-auto">
            <ActionButton method="POST" url="/api/view-as" body={{ memberId: subject.id }}>View as {subject.display_name}</ActionButton>
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="min-w-0"><MemberNav memberId={subject.id} /></aside>
        <div className="min-w-0">{children}</div>
      </div>
    </AppShell>
  );
}
