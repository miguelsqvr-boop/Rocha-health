import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOCX_MIME, isProtectedWordFile, uploadMimeType } from "./file-types";
import { htmlToPlainText, wordDocumentText } from "./word";

// A made-up lab report (no real person) saved as .docx.
const sample = readFileSync(new URL("./__fixtures__/sample-lab-report.docx", import.meta.url));

describe("Word documents", () => {
  it("reads paragraphs and keeps lab tables as rows of cells", async () => {
    const text = await wordDocumentText(new Uint8Array(sample));
    expect(text).toContain("Nome: Utente de Teste");
    expect(text).toContain("Data da colheita: 30/08/2024");
    expect(text).toContain("Análise | Resultado | Unidade | Valores de referência");
    expect(text).toContain("Colesterol LDL | 104 | mg/dL | < 130");
    expect(text).toContain("Hemoglobina glicada | 5,4 | % | 4,0 - 5,6");
    expect(text).toContain("Dr. Exemplo & Associados");
  });

  it("drops images and decodes entities", () => {
    expect(htmlToPlainText('<p>A<img src="data:image/png;base64,AAAA"/></p><p>x &lt; 5 &amp; y</p>')).toBe("A\nx < 5 & y");
    expect(htmlToPlainText("<table><tr><td><p>Glicose</p><p>(jejum)</p></td><td><p>92</p></td></tr></table>")).toBe("Glicose (jejum) | 92");
  });

  it("explains password-protected Word files instead of failing vaguely", async () => {
    const encrypted = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect(isProtectedWordFile(encrypted)).toBe(true);
    expect(isProtectedWordFile(new Uint8Array(sample))).toBe(false);
    await expect(wordDocumentText(encrypted)).rejects.toThrow(/password-protected/);
  });

  it("rejects a file that isn't a Word document", async () => {
    await expect(wordDocumentText(new TextEncoder().encode("not a docx"))).rejects.toThrow();
  });
});

describe("upload file types", () => {
  it("accepts PDFs, images and .docx, by type or by extension when the type is missing", () => {
    expect(uploadMimeType({ type: "application/pdf", name: "a.pdf" })).toBe("application/pdf");
    expect(uploadMimeType({ type: DOCX_MIME, name: "a.docx" })).toBe(DOCX_MIME);
    expect(uploadMimeType({ type: "", name: "Análises 2024.DOCX" })).toBe(DOCX_MIME);
    expect(uploadMimeType({ type: "application/octet-stream", name: "scan.jpeg" })).toBe("image/jpeg");
  });

  it("refuses old .doc files and other types, even when renamed", () => {
    expect(uploadMimeType({ type: "application/msword", name: "old.doc" })).toBeNull();
    expect(uploadMimeType({ type: "", name: "old.doc" })).toBeNull();
    expect(uploadMimeType({ type: "text/plain", name: "notes.docx" })).toBeNull();
  });
});
