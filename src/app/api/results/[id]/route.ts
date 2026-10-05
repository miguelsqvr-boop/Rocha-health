import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";

const Correction = z.object({
  value_numeric: z.number().finite().nullable(),
  value_text: z.string().max(200).nullable(),
  unit: z.string().max(40).nullable(),
  reference_low: z.number().finite().nullable(),
  reference_high: z.number().finite().nullable(),
  flag: z.enum(["low", "normal", "high", "abnormal"]).nullable(),
});

/**
 * Correct an extracted lab value. RLS allows this for the Super Admin (and
 * for a member's own manually-entered results); the audit trigger records the
 * before/after values, e.g. "HbA1c 5.6 → 5.4".
 */
export const PATCH = route({ mutates: true }, async ({ supabase, viewer }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await readJson(request, (v) => Correction.parse(v));
  const { data, error } = await supabase
    .from("health_results")
    .update({ ...input, confidence: "high", reviewed_by: viewer.userId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new ApiError(403, "You can't edit this result. Request a correction instead.");
  return json({ ok: true });
});
