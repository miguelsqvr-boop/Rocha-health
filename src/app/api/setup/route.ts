import { z } from "zod";
import { ApiError, fromDbError, json, readJson } from "@/lib/api";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SetupInput = z.object({
  familyName: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(60),
  legalName: z.string().trim().max(120).nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

/**
 * First-run setup: the first signed-in person creates the family and becomes
 * its Super Admin. The database refuses once a family exists.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new ApiError(401, "Please sign in.");
    const input = await readJson(request, (v) => SetupInput.parse(v));
    const { data: memberId, error } = await supabase.rpc("bootstrap_family", {
      p_family_name: input.familyName,
      p_display_name: input.displayName,
      p_legal_name: input.legalName,
      p_date_of_birth: input.dateOfBirth,
    });
    const apiError = fromDbError(error);
    if (apiError) throw apiError;
    return json({ memberId, redirectTo: "/admin" }, 201);
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
