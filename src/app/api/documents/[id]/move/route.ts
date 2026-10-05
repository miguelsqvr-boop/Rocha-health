import { z } from "zod";
import { json, readJson, route, throwIfDbError } from "@/lib/api";

const MoveInput = z.object({
  toMemberId: z.string().uuid(),
  acknowledgeIdentity: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

/** Super Admin: reassign a filed document (and its results) to another member. */
export const POST = route({ mutates: true, superAdmin: true }, async ({ supabase }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await readJson(request, (v) => MoveInput.parse(v));
  const { error } = await supabase.rpc("move_document", {
    p_document_id: id,
    p_to_member_id: input.toMemberId,
    p_identity_acknowledged: input.acknowledgeIdentity,
    p_reason: input.reason ?? null,
  });
  throwIfDbError(error);
  return json({ ok: true });
});
