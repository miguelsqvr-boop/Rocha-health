import { z } from "zod";
import { json, readJson, route, throwIfDbError } from "@/lib/api";

const BiomarkerInput = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/),
  name: z.string().trim().min(1).max(80),
  category: z.enum(["cardiovascular", "metabolic", "kidney", "liver", "blood_count", "thyroid", "vitamins_minerals", "hormones", "inflammation", "other"]),
  defaultUnit: z.string().trim().max(30).nullable(),
  referenceLow: z.number().finite().nullable(),
  referenceHigh: z.number().finite().nullable(),
  synonyms: z.array(z.string().trim().min(1).max(80)).max(20),
});

/** Super Admin: add a biomarker definition, or override a built-in one for this family. */
export const POST = route({ mutates: true, superAdmin: true }, async ({ supabase, viewer }, request: Request) => {
  const input = await readJson(request, (v) => BiomarkerInput.parse(v));
  const { error } = await supabase.from("biomarkers").upsert(
    {
      family_id: viewer.member.family_id,
      code: input.code,
      name: input.name,
      category: input.category,
      default_unit: input.defaultUnit,
      reference_low: input.referenceLow,
      reference_high: input.referenceHigh,
      synonyms: input.synonyms,
    },
    { onConflict: "family_id,code" },
  );
  throwIfDbError(error);
  return json({ ok: true });
});
