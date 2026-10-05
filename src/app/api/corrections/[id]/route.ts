import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";

const Resolve = z.object({
  status: z.enum(["resolved", "rejected"]),
  resolutionNote: z.string().trim().max(1000).nullable(),
});

/** Super Admin: resolve a correction request. */
export const PATCH = route({ mutates: true, superAdmin: true }, async ({ supabase, viewer }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await readJson(request, (v) => Resolve.parse(v));
  const { data, error } = await supabase
    .from("correction_requests")
    .update({ status: input.status, resolution_note: input.resolutionNote, resolved_by: viewer.userId, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new ApiError(404, "Request not found.");
  return json({ ok: true });
});
