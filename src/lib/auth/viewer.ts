import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, VIEW_AS_COOKIE } from "@/lib/supabase/server";
import { MEMBER_COLUMNS, type MemberRow } from "@/lib/data/types";
import type { ViewerIdentity } from "@/lib/domain/permissions";

export interface Viewer {
  userId: string;
  email: string | null;
  /** The signed-in person's own member profile (null until set up / invited). */
  member: MemberRow | null;
  familyName: string | null;
  isSuperAdmin: boolean;
  /** Set while a Super Admin is using "View as". Validated on every request. */
  viewAs: Pick<MemberRow, "id" | "display_name"> | null;
  identity: ViewerIdentity | null;
}

/**
 * Who is making this request. Authentication is verified with Supabase Auth
 * (getUser), and the member profile is read through RLS, so a deactivated
 * account or a forged cookie yields no member and no access.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const user = data.user;

  const { data: member } = await supabase
    .from("family_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", user.id)
    .maybeSingle<MemberRow>();

  const activeMember = member && member.status === "active" ? member : null;
  const isSuperAdmin = activeMember?.role === "super_admin";

  let familyName: string | null = null;
  if (activeMember) {
    const { data: family } = await supabase.from("families").select("name").eq("id", activeMember.family_id).maybeSingle();
    familyName = family?.name ?? null;
  }

  let viewAs: Viewer["viewAs"] = null;
  const viewAsId = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (viewAsId && isSuperAdmin && viewAsId !== activeMember?.id) {
    const { data: target } = await supabase
      .from("family_members")
      .select("id, display_name, family_id")
      .eq("id", viewAsId)
      .maybeSingle();
    if (target && target.family_id === activeMember?.family_id) {
      viewAs = { id: target.id, display_name: target.display_name };
    }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    member: activeMember,
    familyName,
    isSuperAdmin,
    viewAs,
    identity: activeMember
      ? { memberId: activeMember.id, familyId: activeMember.family_id, role: activeMember.role, status: activeMember.status }
      : null,
  };
});

/** Signed in with an active family membership; otherwise sent to sign in / set up. */
export async function requireMember(): Promise<Viewer & { member: MemberRow }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.member) redirect("/welcome");
  return viewer as Viewer & { member: MemberRow };
}

/**
 * Super Admin pages. While "View as" is active the Super Admin sees exactly
 * what that member sees, so admin pages send them back to that view (the
 * banner offers "Return to Super Admin").
 */
export async function requireSuperAdmin(): Promise<Viewer & { member: MemberRow }> {
  const viewer = await requireMember();
  if (!viewer.isSuperAdmin) redirect(`/m/${viewer.member.id}`);
  if (viewer.viewAs) redirect(`/m/${viewer.viewAs.id}`);
  return viewer;
}

/**
 * The member whose health profile is being opened. Read through RLS: if the
 * viewer may not see this member the row simply is not returned and the page
 * 404s (it does not reveal whether the member exists).
 */
export async function requireMemberAccess(memberId: string) {
  const viewer = await requireMember();
  if (viewer.viewAs && viewer.viewAs.id !== memberId) redirect(`/m/${viewer.viewAs.id}`);
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: subject } = await supabase
    .from("family_members")
    .select(MEMBER_COLUMNS)
    .eq("id", memberId)
    .maybeSingle<MemberRow>();
  if (!subject) notFound();
  return { viewer, subject, supabase, isSelf: subject.id === viewer.member.id };
}
