import { MemberProfileInput } from "@/lib/validation";
import { json, readJson, route, throwIfDbError } from "@/lib/api";

/** Super Admin: create a family member profile (no login until invited). */
export const POST = route({ mutates: true, superAdmin: true }, async ({ supabase, viewer }, request: Request) => {
  const input = await readJson(request, (v) => MemberProfileInput.parse(v));
  const { data: last } = await supabase.from("family_members").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("family_members")
    .insert({
      family_id: viewer.member.family_id,
      display_name: input.displayName,
      legal_name: input.legalName || null,
      name_aliases: input.aliases ?? [],
      date_of_birth: input.dateOfBirth ?? null,
      sex: input.sex ?? null,
      email: input.email?.toLowerCase() || null,
      sort_order: (last?.sort_order ?? 0) + 1,
    })
    .select("id")
    .single();
  throwIfDbError(error);
  return json({ id: data!.id }, 201);
});
