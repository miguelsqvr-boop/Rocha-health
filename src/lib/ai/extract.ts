import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { DOCUMENT_TYPE_CODES, DOCUMENT_TYPES } from "@/lib/domain/taxonomy";
import type { BiomarkerDefinition } from "@/lib/domain/biomarkers";

export const EXTRACTION_MODEL = "claude-opus-5-5";

const ResultSchema = z.object({
  analyte_name: z.string().describe("Test name exactly as printed"),
  biomarker_code: z.string().nullable().describe("Code from the catalogue if it is clearly the same test, else null"),
  value: z.string().describe("Value exactly as printed, e.g. '5,6', '< 0.5', 'Negativo'"),
  unit: z.string().nullable(),
  reference_range: z.string().nullable().describe("Reference range as printed"),
  reference_low: z.number().nullable(),
  reference_high: z.number().nullable(),
  lab_flag: z.enum(["low", "high", "abnormal", "normal"]).nullable().describe("Only if the document itself marks it"),
  result_date: z.string().nullable().describe("YYYY-MM-DD if different from the document date"),
  confident: z.boolean().describe("False if the value, unit or name was hard to read or ambiguous"),
});

export const ExtractionSchema = z.object({
  is_health_document: z.boolean(),
  patient_name: z.string().nullable().describe("Patient name exactly as printed; null if absent"),
  patient_date_of_birth: z.string().nullable().describe("YYYY-MM-DD; null if absent"),
  document_type: z.enum(DOCUMENT_TYPE_CODES as [string, ...string[]]),
  title: z.string().describe("Short English title, e.g. 'Blood Test', 'Chest X-ray'"),
  document_date: z.string().nullable().describe("YYYY-MM-DD: collection/exam date, else report date"),
  provider: z.string().nullable().describe("Laboratory, hospital or clinic, e.g. 'CUF'"),
  summary: z.string().describe("One or two neutral sentences describing what the document contains"),
  results: z.array(ResultSchema),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

function systemPrompt(biomarkers: BiomarkerDefinition[]): string {
  const types = DOCUMENT_TYPE_CODES.map((code) => `- ${code}: ${DOCUMENT_TYPES[code].label}`).join("\n");
  const catalogue = biomarkers.map((b) => `- ${b.code}: ${b.name} (${b.default_unit ?? "no unit"})`).join("\n");
  return `You read medical documents for a private family health record and return structured data.

The family files documents from many countries and languages (often Portuguese). Transcribe what is printed; do not interpret, diagnose or add advice.

Patient identity matters: the app uses patient_name and patient_date_of_birth to make sure a document is filed under the right family member. Copy them exactly as printed. If they are not on the document, return null rather than guessing.

Dates: return YYYY-MM-DD. Portuguese and European documents write dates day-first (12/09/2026 is 12 September 2026).

Results: include every measured test value (blood, urine, ECG measurements, body composition, etc.). Keep values exactly as printed in "value". Use biomarker_code only when the test clearly is one of the catalogue entries; otherwise null. Copy the reference range and split it into reference_low / reference_high when it is numeric. Set confident=false for anything hard to read.

Document types:
${types}

Biomarker catalogue:
${catalogue}`;
}

export class ExtractionError extends Error {}

/**
 * Extracts identity, classification and results from one document. The file
 * is sent to the Claude API for this request only; nothing is stored there.
 */
export async function extractDocument(input: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  biomarkers: BiomarkerDefinition[];
}): Promise<Extraction> {
  const client = new Anthropic();
  const data = Buffer.from(input.bytes).toString("base64");
  const source =
    input.mimeType === "application/pdf"
      ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: input.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
        } as const);

  let message;
  try {
    message = await client.beta.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      // If a safety classifier declines, retry on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(ExtractionSchema) },
      system: systemPrompt(input.biomarkers),
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: `File name: ${input.filename}\nExtract this document.` }],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new ExtractionError("The document reader is busy. Try again in a minute.");
    if (error instanceof Anthropic.BadRequestError) throw new ExtractionError("This file could not be read. Is it a valid PDF or image?");
    if (error instanceof Anthropic.AuthenticationError) throw new ExtractionError("Document reading is not configured (Anthropic API key).");
    if (error instanceof Anthropic.APIError) throw new ExtractionError("The document reader is unavailable right now. Try again shortly.");
    throw error;
  }

  if (message.stop_reason === "refusal") throw new ExtractionError("This document could not be processed automatically.");
  if (message.stop_reason === "max_tokens") throw new ExtractionError("This document is too long to process in one go.");
  if (!message.parsed_output) throw new ExtractionError("The document could not be read.");
  return message.parsed_output;
}
