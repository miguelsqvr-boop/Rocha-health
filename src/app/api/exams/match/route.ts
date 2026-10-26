import { z } from "zod";
import { ApiError, json, readJson, route } from "@/lib/api";
import { linkExamResults } from "@/lib/documents/exam-results";

export const maxDuration = 60;

const MatchInput = z.object({ requestId: z.string().uuid() });

/**
 * "Find results" on an exam request: looks for the results of its open exams
 * among the person's filed documents and links them. The request is read
 * through RLS; links are written by link_exam_results(), which checks write
 * access and audits.
 */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request) => {
  const { requestId } = await readJson(request, (v) => MatchInput.parse(v));
  const { data: doc } = await supabase
    .from("documents")
    .select("id, member_id, document_type")
    .eq("id", requestId)
    .eq("status", "filed")
    .maybeSingle();
  if (!doc || doc.document_type !== "exam_request" || !doc.member_id) throw new ApiError(404, "Exam request not found.");
  const { data: exams } = await supabase.from("requested_exams").select("id").eq("source_document_id", doc.id);
  const linked = await linkExamResults(supabase, { memberId: doc.member_id, examIds: (exams ?? []).map((e) => e.id) });
  return json({ linked });
});
