"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client: used only for authentication (sign-in, sign-out, accepting
// an invitation link). Health data is always loaded through the server.
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
