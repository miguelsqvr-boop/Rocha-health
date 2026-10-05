import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";
import { isoDate } from "@/lib/validation";

const MedicationInput = z.object({
  kind: z.enum(["medication", "supplement"]),
  name: z.string().trim().min(1).max(120),
  dose: z.string().trim().max(80).nullable(),
  frequency: z.string().trim().max(80).nullable(),
  startedOn: isoDate.nullable(),
  endedOn: isoDate.nullable(),
  notes: z.string().trim().max(500).nullable(),
});

/** Add a medication or supplement. RLS: the member themself or the Super Admin. */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await readJson(request, (v) => MedicationInput.parse(v));
  const { data: member } = await supabase.from("family_members").select("id, family_id").eq("id", id).maybeSingle();
  if (!member) throw new ApiError(404, "Family member not found.");
  const { error } = await supabase.from("medications").insert({
    family_id: member.family_id,
    member_id: member.id,
    kind: input.kind,
    name: input.name,
    dose: input.dose || null,
    frequency: input.frequency || null,
    started_on: input.startedOn,
    ended_on: input.endedOn,
    notes: input.notes || null,
  });
  throwIfDbError(error);
  return json({ ok: true }, 201);
});
