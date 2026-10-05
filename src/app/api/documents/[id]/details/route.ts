import { z } from "zod";
import { json, readJson, route, throwIfDbError } from "@/lib/api";
import { categoryLabels } from "@/lib/data/queries";
import { buildFilingPath, categoryForType, DOCUMENT_TYPE_CODES } from "@/lib/domain/taxonomy";

const DetailsInput = z.object({
  documentType: z.enum(DOCUMENT_TYPE_CODES as [string, ...string[]]),
  title: z.string().trim().min(1).max(120),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  provider: z.string().trim().max(120).nullable(),
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
  });
  throwIfDbError(error);
  return json({ ok: true });
});
