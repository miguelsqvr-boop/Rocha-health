import { z } from "zod";
import { json, readJson, route, throwIfDbError } from "@/lib/api";
import { categoryLabels } from "@/lib/data/queries";
import { buildFilingPath, categoryForType, DOCUMENT_TYPE_CODES } from "@/lib/domain/taxonomy";

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
});

/**
 * Step 7–8: the uploader confirms who the document belongs to. The database
 * re-checks permission and refuses (409) to file under a member whose identity
 * check did not match unless acknowledgeIdentity is true.
 */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const input = await readJson(request, (v) => ConfirmInput.parse(v));
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
  });
  throwIfDbError(error);
  return json(data);
});
