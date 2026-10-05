// UI-side mirror of app.member_ids_with() in the database. Used to decide
// what to show and to reject obviously unauthorised requests early. It is
// never the enforcement point: every read and write is checked again by
// row-level security and the RPCs, whatever this function returns.

export type Capability = "read" | "upload" | "write";
export type MemberRole = "super_admin" | "member";
export type MemberStatus = "not_invited" | "invited" | "active" | "deactivated";

export interface ViewerIdentity {
  memberId: string;
  familyId: string;
  role: MemberRole;
  status: MemberStatus;
}

export interface MemberRef {
  id: string;
  family_id: string;
}

export function isSuperAdmin(viewer: ViewerIdentity | null): boolean {
  return viewer?.status === "active" && viewer.role === "super_admin";
}

export function canAccessMember(viewer: ViewerIdentity | null, member: MemberRef, _capability: Capability): boolean {
  if (!viewer || viewer.status !== "active") return false;
  if (viewer.familyId !== member.family_id) return false;
  if (viewer.role === "super_admin") return true;
  // Initially there are two roles only; granular grants are enforced in the
  // database and will be mirrored here when the sharing UI ships.
  return viewer.memberId === member.id;
}

/** Access summary shown on the Super Admin's permissions screen. */
export function accessSummary(role: MemberRole, status: MemberStatus) {
  if (status === "deactivated") return { ownData: "None", familyData: "None", admin: false };
  if (status !== "active") return { ownData: "Pending invite", familyData: "None", admin: false };
  return role === "super_admin"
    ? { ownData: "Full", familyData: "Full", admin: true }
    : { ownData: "Full", familyData: "None", admin: false };
}
