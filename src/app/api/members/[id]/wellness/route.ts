import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";
import { WELLNESS_METRICS } from "@/lib/domain/wellness";

const WellnessInput = z.object({
  metric: z.enum(Object.keys(WELLNESS_METRICS) as [string, ...string[]]),
  value: z.number().finite(),
  recordedAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

/** Add a manual wellness entry (sleep, steps, weight…). RLS: self or Super Admin. */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await readJson(request, (v) => WellnessInput.parse(v));
  const metric = WELLNESS_METRICS[input.metric as keyof typeof WELLNESS_METRICS];
  const { data: member } = await supabase.from("family_members").select("id, family_id").eq("id", id).maybeSingle();
  if (!member) throw new ApiError(404, "Family member not found.");
  const { error } = await supabase.from("wellness_entries").insert({
    family_id: member.family_id,
    member_id: member.id,
    domain: metric.domain,
    metric: input.metric,
    value: input.value,
    unit: metric.unit,
    recorded_at: new Date(input.recordedAt).toISOString(),
    source: "manual",
  });
  throwIfDbError(error);
  return json({ ok: true }, 201);
});
