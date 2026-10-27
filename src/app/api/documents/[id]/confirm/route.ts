import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";
import { categoryLabels } from "@/lib/data/queries";
import { buildFilingPath, categoryForType, DOCUMENT_TYPE_CODES } from "@/lib/domain/taxonomy";
import { DoctorInput, RequestedExamInput } from "@/lib/documents/inputs";
import { linkExamResults } from "@/lib/documents/exam-results";
import { isFutureDate } from "@/lib/validation";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const ResultInput = z.object({
  analyte_name: z.string().trim().min(1).max(200),
  biomarker_id: z.string().uuid().nullable(),
  value_numeric: z.number().finite().nullable(),
  value_text: z.string().max(200).nullable(),
  unit: z.string().max(40).nullable(),
  reference_low: z.number().finite().nullable(),
  reference_high: z.number().finite().nullable(),
  reference_text: z.string().max(200).nullable(),
  flag: z.enum(["low", "normal", "high", "abnormal"]).nullable(),
  confidence: z.enum(["high", "needs_review"]),
  result_date: isoDate.nullable(),
}).refine((r) => r.value_numeric !== null || (r.value_text ?? "").trim() !== "", "A value is required");

const ConfirmInput = z.object({
  memberId: z.string().uuid(),
  acknowledgeIdentity: z.boolean(),
  documentType: z.enum(DOCUMENT_TYPE_CODES as [string, ...string[]]),
  title: z.string().trim().min(1).max(120),
  documentDate: isoDate.nullable(),
  provider: z.string().trim().max(120).nullable(),
  results: z.array(ResultInput).max(500),
  ...DoctorInput,
  requestedExams: z.array(RequestedExamInput).max(100).optional(),
});

export const maxDuration = 60;

/**
 * Step 7–8: the uploader confirms who the document belongs to. The database
 * re-checks permission and refuses (409) to file under a member whose identity
 * check did not match unless acknowledgeIdentity is true. Once filed, a
 * result is linked to the person's open exam requests it reports, and a new
 * request to results already on file.
 */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await readJson(request, (v) => ConfirmInput.parse(v));
  // Records are dated by the document itself, never by when it was uploaded.
  if (!input.documentDate) throw new ApiError(400, "Enter the date printed on the document before saving.");
  if (isFutureDate(input.documentDate)) throw new ApiError(400, "The document's date can't be in the future.");
  const labels = await categoryLabels(supabase);
  const { data, error } = await supabase.rpc("confirm_document", {
    p_document_id: id,
    p_member_id: input.memberId,
    p_identity_acknowledged: input.acknowledgeIdentity,
    p_document_type: input.documentType,
    p_title: input.title,
    p_document_date: input.documentDate,
    p_provider: input.provider || null,
    p_category: categoryForType(input.documentType),
    p_filing_path: buildFilingPath(input.documentType, input.documentDate, labels),
    p_results: input.results,
    p_doctor_name: input.doctorName || null,
    p_specialty: input.specialty ?? null,
    // Exams are kept only for exam requests.
    p_requested_exams: input.documentType === "exam_request" ? (input.requestedExams ?? []) : [],
  });
  throwIfDbError(error);
  const linked = await linkExamResults(
    supabase,
    input.documentType === "exam_request"
      ? { memberId: input.memberId, examIds: await requestExamIds(supabase, id) }
      : { memberId: input.memberId, documentIds: [id] },
  );
  return json({ ...(data as object), linked });
});

async function requestExamIds(supabase: Parameters<typeof linkExamResults>[0], documentId: string): Promise<string[]> {
  const { data } = await supabase.from("requested_exams").select("id").eq("source_document_id", documentId);
  return (data ?? []).map((e) => e.id);
}
