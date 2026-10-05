import { z } from "zod";
import { json, readJson, route, throwIfDbError } from "@/lib/api";
import { env } from "@/lib/env";
import { sendInvitationEmail } from "@/lib/supabase/admin";

/**
 * Super Admin: invite a member to create their own login. The invitation is
 * created by create_invitation() with the Super Admin's session (permission
 * check + audit); only then is Supabase Auth asked to send the email. The link
 * only works for the invited email address.
 */
export const POST = route({ mutates: true, superAdmin: true }, async ({ supabase }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { email } = await readJson(request, (v) => z.object({ email: z.string().trim().email() }).parse(v));
  const { data: token, error } = await supabase.rpc("create_invitation", { p_member_id: id, p_email: email });
  throwIfDbError(error);

  const link = `${env.siteUrl()}/invite/accept?token=${encodeURIComponent(token as string)}`;
  let emailed = false;
  try {
    const { error: mailError } = await sendInvitationEmail(email, link);
    emailed = !mailError;
  } catch {
    emailed = false;
  }
  return json({
    link,
    emailed,
    message: emailed
      ? `Invitation sent to ${email}.`
      : `Invitation created. Email could not be sent automatically, so share this link with them directly.`,
  });
});
