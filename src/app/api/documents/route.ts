import { createHash } from "node:crypto";
import { z } from "zod";
import { ApiError, json, readJson, route, throwIfDbError } from "@/lib/api";
import {
  BUCKET, DOCX_MIME, isProtectedWordFile, isUploadMimeType, MAX_UPLOAD_BYTES as MAX_BYTES, PROTECTED_WORD_MESSAGE, UPLOAD_TYPES_LABEL, uploadMimeType,
} from "@/lib/documents/file-types";

const UUID = /^[0-9a-f-]{36}$/i;

const Reservation = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string(),
  size: z.number().int().positive(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  memberId: z.string(),
});

/**
 * Upload one file. `memberId` is a family member id, or "auto" to let the
 * system identify the patient (Super Admin only; the database enforces it).
 * The document row reserves a private storage path; the file is then written
 * there with the uploader's own session.
 *
 * JSON body (the app): only reserves the path, from the file's name, type,
 * size and SHA-256. The browser then uploads the file to storage itself, so
 * files up to 20 MB work although the host limits request bodies to 4.5 MB;
 * storage policies only accept it at the reserved path, from the uploader,
 * and processing checks its size and fingerprint.
 * Multipart body (app versions before this): the file comes through here.
 */
export const POST = route({ mutates: true }, async ({ supabase }, request: Request) => {
  if (request.headers.get("content-type")?.startsWith("application/json")) {
    const input = await readJson(request, (v) => Reservation.parse(v));
    if (!isUploadMimeType(input.mimeType)) throw new ApiError(400, `Upload ${UPLOAD_TYPES_LABEL}.`);
    if (input.size > MAX_BYTES) throw new ApiError(400, "Each file must be smaller than 20 MB.");
    const memberId = input.memberId === "auto" ? null : input.memberId;
    if (memberId !== null && !UUID.test(memberId)) throw new ApiError(400, "Choose who this document is for.");
    const { data, error } = await supabase.rpc("create_document_upload", {
      p_member_id: memberId,
      p_original_filename: input.filename,
      p_mime_type: input.mimeType,
      p_size_bytes: input.size,
      p_content_hash: input.contentHash,
    });
    throwIfDbError(error);
    const { document_id: documentId, storage_path: storagePath } = data as { document_id: string; storage_path: string };
    return json({ documentId, storagePath }, 201);
  }

  const form = await request.formData();
  const file = form.get("file");
  const memberIdRaw = String(form.get("memberId") ?? "");
  if (!(file instanceof File)) throw new ApiError(400, "Choose a file to upload.");
  const mimeType = uploadMimeType(file);
  if (!mimeType) throw new ApiError(400, `Upload ${UPLOAD_TYPES_LABEL}.`);
  if (file.size === 0 || file.size > MAX_BYTES) throw new ApiError(400, "Each file must be smaller than 20 MB.");
  const memberId = memberIdRaw === "auto" ? null : memberIdRaw;
  if (memberId !== null && !UUID.test(memberId)) throw new ApiError(400, "Choose who this document is for.");

  const bytes = Buffer.from(await file.arrayBuffer());
  if (mimeType === DOCX_MIME && isProtectedWordFile(bytes)) throw new ApiError(400, PROTECTED_WORD_MESSAGE);
  // Fingerprint of the bytes: the database refuses a file the family already has.
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const { data, error } = await supabase.rpc("create_document_upload", {
    p_member_id: memberId,
    p_original_filename: file.name,
    p_mime_type: mimeType,
    p_size_bytes: file.size,
    p_content_hash: contentHash,
  });
  throwIfDbError(error);
  const { document_id: documentId, storage_path: storagePath } = data as { document_id: string; storage_path: string };

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: mimeType, upsert: false });
  if (uploadError) {
    await supabase.rpc("delete_document", { p_document_id: documentId, p_reason: "Upload failed" });
    throw new ApiError(502, "The file could not be stored. Please try again.");
  }
  return json({ documentId, filename: file.name }, 201);
});
