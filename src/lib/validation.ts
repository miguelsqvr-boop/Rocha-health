import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MemberProfileInput = z.object({
  displayName: z.string().trim().min(1).max(60),
  legalName: z.string().trim().max(120).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
  dateOfBirth: isoDate.nullable().optional(),
  sex: z.enum(["female", "male", "other"]).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
});
