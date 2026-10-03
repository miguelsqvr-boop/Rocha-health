import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client. Deliberately narrow: it is used only to ask Supabase
 * Auth to email an invitation, after the Super Admin has created the invitation
 * through create_invitation() with their own session. It is never used to read
 * or write health data, documents or the audit log.
 */
export async function sendInvitationEmail(email: string, redirectTo: string) {
  const admin = createClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin.auth.admin.inviteUserByEmail(email, { redirectTo });
}
