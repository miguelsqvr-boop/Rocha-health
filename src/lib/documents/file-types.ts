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

// Password-protected Word files (and old .doc files renamed to .docx) are
// OLE compound files rather than the zip a .docx normally is, so their text
// can't be read.
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

export const PROTECTED_WORD_MESSAGE =
  "This Word file is password-protected (or in the old .doc format), so it can't be read. Open it in Word, remove the password (File → Info → Protect Document → Encrypt with Password, then clear it), save it as .docx or PDF and upload that.";

/** True for a file that claims to be .docx but is encrypted or an old .doc. */
export function isProtectedWordFile(firstBytes: Uint8Array): boolean {
  return OLE_SIGNATURE.every((byte, i) => firstBytes[i] === byte);
}

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
