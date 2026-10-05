import { z } from "zod";
import { json, readJson, route, throwIfDbError } from "@/lib/api";

const CategoryInput = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1).max(60),
});

/** Super Admin: rename a built-in category for this family, or add a new one. */
export const POST = route({ mutates: true, superAdmin: true }, async ({ supabase, viewer }, request: Request) => {
  const input = await readJson(request, (v) => CategoryInput.parse(v));
  const { error } = await supabase
    .from("health_categories")
    .upsert({ family_id: viewer.member.family_id, code: input.code, label: input.label }, { onConflict: "family_id,code" });
  throwIfDbError(error);
  return json({ ok: true });
});
