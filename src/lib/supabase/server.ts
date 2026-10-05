import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export const VIEW_AS_COOKIE = "rh_view_as";

function clientIp(h: Headers): string {
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
}

/**
 * Supabase client acting as the signed-in user. Every query and RPC runs with
 * the user's own JWT, so row-level security applies to everything this app
 * reads or writes. Request context (IP, device, "View as" member) is forwarded
 * for the audit log; the database validates the "View as" value itself.
 */
export const createSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();
  const h = await headers();
  const viewAs = cookieStore.get(VIEW_AS_COOKIE)?.value ?? "";

  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // proxy refreshes the session on every request instead.
        }
      },
    },
    global: {
      headers: {
        "x-rh-client-ip": clientIp(h),
        "x-rh-user-agent": (h.get("user-agent") ?? "").slice(0, 512),
        ...(viewAs ? { "x-rh-view-as": viewAs } : {}),
      },
    },
  });
});

export type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
