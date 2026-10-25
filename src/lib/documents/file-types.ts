// File types that can be uploaded, shared by the upload screen and the API.
// The database (create_document_upload) and the storage bucket enforce the
// same list.

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  docx: DOCX_MIME,
};

const ALLOWED = new Set(Object.values(BY_EXTENSION));

/** For the file picker. */
export const UPLOAD_ACCEPT = [...ALLOWED, ...Object.keys(BY_EXTENSION).map((ext) => `.${ext}`)].join(",");

export const UPLOAD_TYPES_LABEL = "PDFs, Word documents (.docx) or photos";

/**
 * The type to store a file as, or null if it can't be uploaded. Some systems
 * report no type (or a generic one) for Word files, so fall back to the
 * extension.
 */
export function uploadMimeType(file: { type: string; name: string }): string | null {
  if (ALLOWED.has(file.type)) return file.type;
  if (file.type && file.type !== "application/octet-stream") return null;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return BY_EXTENSION[extension] ?? null;
}
