import { ApiError, json, route, throwIfDbError } from "@/lib/api";
import { BUCKET } from "@/lib/documents/pipeline";

const ALLOWED = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BYTES = 20 * 1024 * 1024;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Upload one file. `memberId` is a family member id, or "auto" to let the
 * system identify the patient (Super Admin only; the database enforces it).
 * The document row reserves a private storage path; the file is then written
 * there with the uploader's own session.
 */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request) => {
  const form = await request.formData();
  const file = form.get("file");
  const memberIdRaw = String(form.get("memberId") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "Choose a file to upload.");
  if (!ALLOWED.has(file.type)) throw new ApiError(400, "Upload a PDF or an image (JPEG, PNG, WebP).");
  if (file.size === 0 || file.size > MAX_BYTES) throw new ApiError(400, "Each file must be smaller than 20 MB.");
  const memberId = memberIdRaw === "auto" ? null : memberIdRaw;
  if (memberId !== null && !UUID.test(memberId)) throw new ApiError(400, "Choose who this document is for.");

  const { data, error } = await supabase.rpc("create_document_upload", {
    p_member_id: memberId,
    p_original_filename: file.name,
    p_mime_type: file.type,
    p_size_bytes: file.size,
  });
  throwIfDbError(error);
  const { document_id: documentId, storage_path: storagePath } = data as { document_id: string; storage_path: string };

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    await supabase.rpc("delete_document", { p_document_id: documentId, p_reason: "Upload failed" });
    throw new ApiError(502, "The file could not be stored. Please try again.");
  }
  return json({ documentId, filename: file.name }, 201);
});
