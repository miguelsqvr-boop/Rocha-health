import { ApiError, route, throwIfDbError } from "@/lib/api";
import { BUCKET } from "@/lib/documents/pipeline";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { formatDate } from "@/lib/format";

const SIGNED_URL_SECONDS = 60;

/**
 * Opens a document: 1) the user is authenticated (route), 2–3) the document
 * row is read through RLS, so family membership and permission for that
 * member are checked by the database, 4) a 60-second signed URL is created
 * with the user's own session (storage policies apply again), 5) the view or
 * download is written to the audit log, then the browser is redirected.
 */
export const GET = route({ mutates: false }, async ({ supabase }, request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const download = new URL(request.url).searchParams.get("download") === "1";

  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, member_id, storage_path, original_filename, title, document_type, document_date")
    .eq("id", id)
    .maybeSingle();
  throwIfDbError(error);
  if (!doc) throw new ApiError(404, "Document not found.");

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, SIGNED_URL_SECONDS, download ? { download: doc.original_filename } : undefined);
  if (signError || !signed) throw new ApiError(404, "Document not found.");

  const label = `${doc.title ?? documentTypeInfo(doc.document_type).label} — ${doc.document_date ? formatDate(doc.document_date) : "undated"}`;
  const { error: logError } = await supabase.rpc("log_access", {
    p_action: download ? "document.download" : "document.view",
    p_target_member_id: doc.member_id,
    p_entity_type: "document",
    p_entity_id: doc.id,
    p_summary: label,
  });
  // No audit entry, no document.
  if (logError) throw new ApiError(403, "This document could not be opened.");

  return new Response(null, {
    status: 303,
    headers: { Location: signed.signedUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
});
