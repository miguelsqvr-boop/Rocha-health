import { z } from "zod";
import { json, readJson, route, throwIfDbError } from "@/lib/api";
import { DOCUMENT_TYPE_CODES } from "@/lib/domain/taxonomy";

const RuleInput = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).nullable(),
  sex: z.enum(["female", "male"]).nullable(),
  minAge: z.number().int().min(0).max(120).nullable(),
  maxAge: z.number().int().min(0).max(120).nullable(),
  intervalMonths: z.number().int().min(1).max(240),
  documentTypes: z.array(z.enum(DOCUMENT_TYPE_CODES as [string, ...string[]])).max(10),
  biomarkerCodes: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/)).max(10),
  active: z.boolean(),
});

/** Super Admin: add or override a preventive-care rule for this family. */
export const POST = route({ mutates: true, superAdmin: true }, async ({ supabase, viewer }, request: Request) => {
  const input = await readJson(request, (v) => RuleInput.parse(v));
  const { error } = await supabase.from("preventive_care_rules").upsert(
    {
      family_id: viewer.member.family_id,
      code: input.code,
      title: input.title,
      description: input.description,
      sex: input.sex,
      min_age: input.minAge,
      max_age: input.maxAge,
      interval_months: input.intervalMonths,
      document_types: input.documentTypes,
      biomarker_codes: input.biomarkerCodes,
      active: input.active,
    },
    { onConflict: "family_id,code" },
  );
  throwIfDbError(error);
  return json({ ok: true });
});
