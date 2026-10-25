import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { DOCUMENT_TYPE_CODES, DOCUMENT_TYPES } from "@/lib/domain/taxonomy";
import { EXAM_TYPE_CODES, EXAM_TYPES, SPECIALTIES, SPECIALTY_CODES } from "@/lib/domain/exams";
import type { BiomarkerDefinition } from "@/lib/domain/biomarkers";
import { env } from "@/lib/env";
import { DOCX_MIME } from "@/lib/documents/file-types";
import { WordDocumentError, wordDocumentText } from "@/lib/documents/word";

export const EXTRACTION_MODEL = "claude-opus-5-5";

const ResultSchema = z.object({
  analyte_name: z.string().describe("Test name exactly as printed"),
  specimen: z.enum(["blood", "urine", "stool", "other"]).nullable().describe("Sample the test was done on; null if not clear"),
  biomarker_code: z.string().nullable().describe("Catalogue code if it is clearly the same blood test, in a compatible unit; else null"),
  value: z.string().describe("Value exactly as printed, e.g. '5,6', '< 0.5', 'Negativo'"),
  unit: z.string().nullable(),
  reference_range: z.string().nullable().describe("Reference range printed for this line, exactly as printed; null if this line has none"),
  reference_low: z.number().nullable(),
  reference_high: z.number().nullable(),
  lab_flag: z.enum(["low", "high", "abnormal", "normal"]).nullable().describe("Only if the document itself marks it"),
  result_date: z.string().nullable().describe("YYYY-MM-DD if different from the document date"),
  confident: z.boolean().describe("False if the value, unit or name was hard to read or ambiguous"),
});

const RequestedExamSchema = z.object({
  name: z.string().describe("Exam as printed, e.g. 'Ecografia abdominal', 'Hemograma completo'"),
  exam_type: z.enum(EXAM_TYPE_CODES as [string, ...string[]]),
  body_site: z.string().nullable().describe("Body area if printed, e.g. 'Abdómen', 'Joelho esquerdo'"),
});

export const ExtractionSchema = z.object({
  is_health_document: z.boolean(),
  patient_name: z.string().nullable().describe("Patient name exactly as printed; null if absent"),
  patient_date_of_birth: z.string().nullable().describe("YYYY-MM-DD; null if absent"),
  document_type: z.enum(DOCUMENT_TYPE_CODES as [string, ...string[]]),
  title: z.string().describe("Short English title, e.g. 'Blood Test', 'Chest X-ray'; for a surgery, the procedure, e.g. 'Catheter ablation of accessory pathway'"),
  document_date: z.string().nullable().describe("YYYY-MM-DD: collection/exam/procedure date, else report date"),
  provider: z.string().nullable().describe("Laboratory, hospital or clinic, e.g. 'CUF'"),
  summary: z.string().describe("One or two neutral sentences describing what the document contains"),
  doctor_name: z.string().nullable().describe("Doctor who requested, prescribed or wrote the document, without 'Dr.'/'Dra.'; null if absent"),
  specialty: z.enum(SPECIALTY_CODES as [string, ...string[]]).nullable().describe("That doctor's specialty or service; null if not stated"),
  results: z.array(ResultSchema),
  requested_exams: z.array(RequestedExamSchema).describe("Exams the document asks to be done (exam requests); empty otherwise"),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

function systemPrompt(biomarkers: BiomarkerDefinition[]): string {
  const types = DOCUMENT_TYPE_CODES.map((code) => `- ${code}: ${DOCUMENT_TYPES[code].label}`).join("\n");
  const catalogue = biomarkers.map((b) => `- ${b.code}: ${b.name} (${b.default_unit ?? "no unit"})`).join("\n");
  const specialties = SPECIALTY_CODES.map((code) => `- ${code}: ${SPECIALTIES[code]}`).join("\n");
  const examTypes = EXAM_TYPE_CODES.map((code) => `- ${code}: ${EXAM_TYPES[code].label}`).join("\n");
  return `You read medical documents for a private family health record and return structured data.

The family files documents from many countries and languages (often Portuguese). Transcribe what is printed; do not interpret, diagnose or add advice.

Patient identity matters: the app uses patient_name and patient_date_of_birth to make sure a document is filed under the right family member. Copy them exactly as printed. If they are not on the document, return null rather than guessing.

Dates: return YYYY-MM-DD. Portuguese and European documents write dates day-first (12/09/2026 is 12 September 2026). document_date is the date the document itself records: the sample collection, exam or procedure date, otherwise the report or issue date. Never use today's date or guess one; return null if no date is printed.

Results: include every measured test value (blood, urine, ECG measurements, body composition, etc.). Keep values exactly as printed in "value". Set specimen from the section or test name (urine strip, urine sediment and urine culture are urine; parasitology is stool). The catalogue lists blood tests: use biomarker_code only for a blood result that clearly is that test, with a number as its value and a unit compatible with the catalogue's (a percentage only for a test measured in %); otherwise null. A word result such as "Negativo", or any urine or stool result, never gets a code.

Reference ranges: copy the range printed on the same line as the value into reference_range, and split it into reference_low / reference_high when it is a plain interval or limit ("3.5 - 5.0", "< 32", "> 60"). Labs often print one test twice, as a percentage and an absolute count, or in % and g/dL, with a range on only one of the two lines: give each line only its own range and leave the other null. Never copy a range from another line or fill one in from general knowledge. When the range is written as levels or cases (risk levels, time of day, posture, age or sex), copy all of the text into reference_range; set reference_low / reference_high only when the document shows which case applies to this patient.

Surgeries and procedures: an operation or procedure report (surgery, catheterisation, ablation, pacemaker, biopsy under anaesthesia, …), and a discharge note or summary from a hospital stay for a surgery or procedure (look at the reason for admission), is a surgery document. Its title names the procedure in English, and its document_date is the date of the procedure, else the admission date, not the discharge date. A discharge summary from a stay without a procedure (observation, illness) stays a discharge_summary. Endoscopies keep their own type.

Exam requests: a document asking for exams to be done (requisição or pedido de exames, credencial, MCDT, prescription of analyses or imaging) is an exam_request. It has no results: list each requested exam in requested_exams with its type, and leave results empty. doctor_name is the requesting or prescribing doctor (for any document, the doctor who wrote it or is responsible for it; not a lab's technical director, and not a nurse or technician: null if no doctor is named). Set specialty from the doctor's specialty or service when it is printed.

Document types:
${types}

Specialties:
${specialties}

Exam types:
${examTypes}

Biomarker catalogue (blood tests):
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
  // The SDK constructor throws a generic error without a key; say what is wrong.
  if (!env.anthropicConfigured()) {
    throw new ExtractionError("Document reading isn't set up yet (the Anthropic API key is missing).");
  }
  const client = new Anthropic();
  const data = Buffer.from(input.bytes).toString("base64");
  let source;
  if (input.mimeType === DOCX_MIME) {
    // Word files go in as their text and tables.
    const text = await wordDocumentText(input.bytes).catch((error: unknown) => {
      throw new ExtractionError(
        error instanceof WordDocumentError ? error.message : "This Word file could not be opened. Is it a valid .docx file?",
      );
    });
    if (text.replace(/\s/g, "").length < 20) {
      throw new ExtractionError("This Word file has no readable text (it may only contain a scanned image). Save it as PDF and upload that instead.");
    }
    source = { type: "document", source: { type: "text", media_type: "text/plain", data: text } } as const;
  } else if (input.mimeType === "application/pdf") {
    source = { type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const;
  } else {
    source = {
      type: "image",
      source: { type: "base64", media_type: input.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
    } as const;
  }

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
