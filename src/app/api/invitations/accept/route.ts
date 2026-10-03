import { z } from "zod";
import { cookies } from "next/headers";
import { fromDbError, json, readJson, ApiError } from "@/lib/api";
import { createSupabaseServerClient, VIEW_AS_COOKIE } from "@/lib/supabase/server";

/** A newly signed-in person claims the profile they were invited to. */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new ApiError(401, "Sign in with the email address your invitation was sent to.");
    const { token } = await readJson(request, (v) => z.object({ token: z.string().min(10).max(200) }).parse(v));
    const { data: memberId, error } = await supabase.rpc("accept_invitation", { p_token: token });
    const apiError = fromDbError(error);
    if (apiError) throw apiError;
    (await cookies()).delete(VIEW_AS_COOKIE);
    return json({ memberId, redirectTo: `/m/${memberId}` });
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
