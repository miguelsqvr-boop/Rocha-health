import mammoth from "mammoth";

/**
 * Plain text of a Word (.docx) document for the document reader: paragraphs
 * on their own lines, table rows as "cell | cell | cell" so lab result tables
 * keep their columns. Embedded images are dropped.
 */
export async function wordDocumentText(bytes: Uint8Array): Promise<string> {
  const { value } = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    { convertImage: mammoth.images.imgElement(async () => ({ src: "" })) },
  );
  return htmlToPlainText(value);
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<img[^>]*>/gi, "")
    // Word puts each cell's text in paragraphs; keep a cell on its row's line.
    .replace(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi, (_cell, tag: string, attrs: string, inner: string) =>
      `<${tag}${attrs}>${inner.replace(/<\/p>\s*<p[^>]*>/gi, " ").replace(/<\/?p[^>]*>/gi, "")}</${tag}>`)
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/ \| \n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
