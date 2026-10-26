import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";
import { EXAM_STATUS_CODES } from "@/lib/domain/exams";
import { isFutureDate } from "@/lib/validation";

const ProgressInput = z.object({
  examIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(EXAM_STATUS_CODES as [string, ...string[]]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  place: z.string().trim().max(120).nullable(),
  // Left out: the note stays as it is. Empty: cleared.
  notes: z.string().trim().max(500).nullable().optional(),
});

/**
 * Record how requested exams are going: to do, booked or done, when and
 * where. The person themselves and the Super Admin may do this; the database
 * checks it (update_requested_exams) and audits each change.
 */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request) => {
  const input = await readJson(request, (v) => ProgressInput.parse(v));
  if (input.status === "done" && input.date && isFutureDate(input.date)) {
    throw new ApiError(400, "An exam can't be done on a future date. Mark it as booked instead.");
  }
  const { data, error } = await supabase.rpc("update_requested_exams", {
    p_exam_ids: input.examIds,
    p_status: input.status,
    p_event_date: input.date,
    p_event_time: input.status === "scheduled" ? input.time : null,
    p_place: input.place || null,
    p_notes: input.notes === undefined ? null : (input.notes ?? ""),
  });
  throwIfDbError(error);
  return json({ updated: data });
});
