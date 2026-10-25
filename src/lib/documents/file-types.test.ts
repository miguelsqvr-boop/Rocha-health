import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { isUploadMimeType, sha256Hex, uploadMimeType } from "./file-types";

describe("upload file types and fingerprints", () => {
  it("fingerprints files in the browser exactly as the server does", async () => {
    const bytes = new TextEncoder().encode("Relatório de alta — ablação");
    expect(await sha256Hex(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("accepts only the supported types", () => {
    expect(isUploadMimeType("application/pdf")).toBe(true);
    expect(isUploadMimeType("image/heic")).toBe(false);
    expect(uploadMimeType({ type: "", name: "DOC004.PDF" })).toBe("application/pdf");
  });
});
