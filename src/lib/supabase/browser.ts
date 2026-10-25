"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client, with the signed-in user's own session: authentication
// (sign-in, sign-out, accepting an invitation link) and sending an uploaded
// file to the storage path the server reserved for it. Health data is always
// read through the server.
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
