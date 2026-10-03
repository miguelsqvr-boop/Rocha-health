import { json, readJson, route, throwIfDbError } from "@/lib/api";
import { BUCKET, documentReview } from "@/lib/documents/pipeline";
import { z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route({ mutates: false }, async ({ supabase, viewer }, _request: Request, { params }: Ctx) => {
  const { id } = await params;
  return json(await documentReview(supabase, viewer, id));
});

/**
 * Delete a document: the RPC checks permission (Super Admin, or the uploader
 * before filing), removes its results and writes the audit entry; the file is
 * then removed from private storage with the same user session.
 */
export const DELETE = route({ mutates: true }, async ({ supabase }, request: Request, { params }: Ctx) => {
  const { id } = await params;
  const body = await readJson(request, (v) => z.object({ reason: z.string().max(500).optional() }).parse(v ?? {})).catch(() => ({ reason: undefined }));
  const { data: storagePath, error } = await supabase.rpc("delete_document", { p_document_id: id, p_reason: body.reason ?? null });
  throwIfDbError(error);
  await supabase.storage.from(BUCKET).remove([storagePath as string]);
  return json({ ok: true });
});
