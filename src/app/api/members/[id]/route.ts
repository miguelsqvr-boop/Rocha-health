import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";
import { MemberProfileInput } from "@/lib/validation";

const AdminUpdate = MemberProfileInput.partial().extend({
  role: z.enum(["super_admin", "member"]).optional(),
  status: z.enum(["not_invited", "invited", "active", "deactivated"]).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  avatarColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
});

const SelfUpdate = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  avatarColor: z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
});

/**
 * Edit a profile. The Super Admin can edit any profile in the family; a member
 * can edit only their own permitted fields. The database guard trigger
 * enforces the same split (and keeps at least one active Super Admin).
 */
export const PATCH = route({ mutates: true }, async ({ supabase, viewer }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const isAdmin = viewer.isSuperAdmin;
  if (!isAdmin && id !== viewer.member.id) throw new ApiError(404, "Family member not found.");
  const input = await readJson(request, (v) => (isAdmin ? AdminUpdate : SelfUpdate).parse(v)) as z.infer<typeof AdminUpdate>;

  const update: Record<string, unknown> = {};
  if (input.displayName !== undefined) update.display_name = input.displayName;
  if (input.phone !== undefined) update.phone = input.phone || null;
  if (input.avatarColor !== undefined) update.avatar_color = input.avatarColor;
  if (isAdmin) {
    if (input.legalName !== undefined) update.legal_name = input.legalName || null;
    if (input.aliases !== undefined) update.name_aliases = input.aliases;
    if (input.dateOfBirth !== undefined) update.date_of_birth = input.dateOfBirth;
    if (input.sex !== undefined) update.sex = input.sex;
    if (input.email !== undefined) update.email = input.email?.toLowerCase() || null;
    if (input.role !== undefined) update.role = input.role;
    if (input.status !== undefined) update.status = input.status;
  }
  if (Object.keys(update).length === 0) return json({ ok: true });

  const { data, error } = await supabase.from("family_members").update(update).eq("id", id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new ApiError(404, "Family member not found.");
  return json({ ok: true });
});
