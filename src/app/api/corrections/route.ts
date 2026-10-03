import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";

const CorrectionInput = z.object({
  memberId: z.string().uuid(),
  entityType: z.enum(["document", "health_result", "profile", "other"]),
  entityId: z.string().uuid().nullable(),
  message: z.string().trim().min(3).max(1000),
});

/** Ask the Super Admin to correct something in your records. */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request) => {
  const input = await readJson(request, (v) => CorrectionInput.parse(v));
  const { data: member } = await supabase.from("family_members").select("id, family_id").eq("id", input.memberId).maybeSingle();
  if (!member) throw new ApiError(404, "Family member not found.");
  const { error } = await supabase.from("correction_requests").insert({
    family_id: member.family_id,
    member_id: member.id,
    entity_type: input.entityType,
    entity_id: input.entityId,
    message: input.message,
  });
  throwIfDbError(error);
  return json({ ok: true }, 201);
});
