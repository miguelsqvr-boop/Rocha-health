import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * A document's own date (collection, exam or report date) can't be later than
 * today. One day of slack so a document dated "today" in Lisbon is never
 * rejected while it is still yesterday in UTC.
 */
export function isFutureDate(iso: string, now = new Date()): boolean {
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  return iso > tomorrow;
}

export const MemberProfileInput = z.object({
  displayName: z.string().trim().min(1).max(60),
  legalName: z.string().trim().max(120).nullable().optional(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(10).optional(),
  dateOfBirth: isoDate.nullable().optional(),
  sex: z.enum(["female", "male", "other"]).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
});
