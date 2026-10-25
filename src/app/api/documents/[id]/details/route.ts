import { z } from "zod";
import { json, readJson, route, throwIfDbError } from "@/lib/api";
import { categoryLabels } from "@/lib/data/queries";
import { buildFilingPath, categoryForType, DOCUMENT_TYPE_CODES } from "@/lib/domain/taxonomy";
import { DoctorInput, RequestedExamInput } from "@/lib/documents/inputs";

const DetailsInput = z.object({
  documentType: z.enum(DOCUMENT_TYPE_CODES as [string, ...string[]]),
  title: z.string().trim().min(1).max(120),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  provider: z.string().trim().max(120).nullable(),
  // Left out: unchanged. Null or empty: cleared.
  ...DoctorInput,
  // Left out: unchanged. An array replaces the exams of an exam request.
  requestedExams: z.array(RequestedExamInput).max(100).optional(),
});

/** Super Admin: correct a filed document's extracted details (audited with before/after). */
export const PATCH = route({ mutates: true, superAdmin: true }, async ({ supabase }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await readJson(request, (v) => DetailsInput.parse(v));
  const labels = await categoryLabels(supabase);
  const { error } = await supabase.rpc("update_document_details", {
    p_document_id: id,
    p_document_type: input.documentType,
    p_title: input.title,
    p_document_date: input.documentDate,
    p_provider: input.provider || null,
    p_category: categoryForType(input.documentType),
    p_filing_path: buildFilingPath(input.documentType, input.documentDate, labels),
    p_doctor_name: input.doctorName === undefined ? null : (input.doctorName ?? ""),
    p_specialty: input.specialty === undefined ? null : (input.specialty ?? ""),
    p_requested_exams: input.requestedExams ?? null,
  });
  throwIfDbError(error);
  return json({ ok: true });
});
