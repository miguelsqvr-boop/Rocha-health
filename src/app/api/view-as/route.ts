import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";
import { VIEW_AS_COOKIE } from "@/lib/supabase/server";

/**
 * "View as": the Super Admin previews a member's own view. No session or
 * password of the member is ever used: the Super Admin keeps their own
 * session, the app narrows what it shows to that member, changes are blocked,
 * a banner is always visible, and start/end are audited.
 */
export const POST = route({ mutates: true, superAdmin: true }, async ({ supabase, viewer }, request: Request) => {
  const { memberId } = await readJson(request, (v) => z.object({ memberId: z.string().uuid() }).parse(v));
  if (memberId === viewer.member.id) throw new ApiError(400, "You are already viewing your own profile.");
  const { data: member } = await supabase.from("family_members").select("id, display_name").eq("id", memberId).maybeSingle();
  if (!member) throw new ApiError(404, "Family member not found.");
  const { error } = await supabase.rpc("log_access", {
    p_action: "view_as.start",
    p_target_member_id: memberId,
    p_entity_type: "family_member",
    p_entity_id: memberId,
    p_summary: `Started viewing as ${member.display_name}`,
  });
  throwIfDbError(error);
  (await cookies()).set(VIEW_AS_COOKIE, memberId, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60,
  });
  return json({ redirectTo: `/m/${memberId}` });
});

export const DELETE = async () => {
  const handler = route({ mutates: false }, async ({ supabase, viewer }) => {
    if (viewer.viewAs) {
      await supabase.rpc("log_access", {
        p_action: "view_as.end",
        p_target_member_id: viewer.viewAs.id,
        p_entity_type: "family_member",
        p_entity_id: viewer.viewAs.id,
        p_summary: `Stopped viewing as ${viewer.viewAs.display_name}`,
      });
    }
    (await cookies()).delete(VIEW_AS_COOKIE);
    return json({ redirectTo: "/admin" });
  });
  return handler();
};
