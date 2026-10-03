import "server-only";
import { requireMemberAccess } from "@/lib/auth/viewer";
import { canAccessMember } from "@/lib/domain/permissions";

/** Common context for /m/[memberId] pages. */
export async function memberPage(params: Promise<{ memberId: string }>) {
  const { memberId } = await params;
  const ctx = await requireMemberAccess(memberId);
  const ownView = ctx.isSelf || Boolean(ctx.viewer.viewAs);
  // "View as" is a read-only preview. Otherwise mirror the database rule
  // (self or Super Admin); the database enforces it regardless.
  const canWrite = !ctx.viewer.viewAs && canAccessMember(ctx.viewer.identity, ctx.subject, "write");
  return { ...ctx, ownView, canWrite };
}
