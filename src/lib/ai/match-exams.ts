import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { formatDate } from "@/lib/format";
import { examTypeLabel } from "@/lib/domain/exams";
import { documentTypeInfo } from "@/lib/domain/taxonomy";

export const MATCH_MODEL = "claude-opus-5-5";

const MatchSchema = z.object({
  matches: z.array(z.object({
    exam: z.string().describe("Exam label, e.g. E1"),
    document: z.string().describe("Document label, e.g. D2"),
  })).describe("Only pairs where the document clearly reports that requested exam"),
});

export interface ExamToMatch {
  id: string;
  name: string;
  exam_type: string;
  body_site: string | null;
  requested_on: string | null;
  doctor: string | null;
}

export interface DocumentToMatch {
  id: string;
  document_type: string | null;
  title: string | null;
  document_date: string | null;
  provider: string | null;
  summary: string | null;
  /** Test names reported, for lab documents. */
  tests: string[];
}

const SYSTEM = `You match exams a doctor requested with the documents that report their results, in one person's private health record.

For each requested exam, decide which of the listed documents, if any, is its result: the report of that same exam (same kind of test and, for imaging, the same body area). A lab report is the result of each requested analysis it contains: "Hemograma" or "Hemograma completo" is reported by blood count values (haemoglobin, leukocytes, platelets), "Perfil lipídico" by cholesterol and triglycerides, and so on. Names may be in Portuguese or English.

Be conservative: only return a pair when the document clearly reports that exam. Leave an exam out when unsure. Only use the pairs offered.`;

/**
 * Which documents report which requested exams, among the pairs allowed (by
 * type and date). Only names, types, dates and test names are sent, for this
 * request only.
 */
export async function matchExamsToResults(input: {
  exams: ExamToMatch[];
  documents: DocumentToMatch[];
  allowed: { examId: string; documentId: string }[];
}): Promise<{ examId: string; documentId: string }[]> {
  const examLabel = new Map(input.exams.map((e, i) => [e.id, `E${i + 1}`]));
  const docLabel = new Map(input.documents.map((d, i) => [d.id, `D${i + 1}`]));
  const allowed = new Set(input.allowed.map((p) => `${examLabel.get(p.examId)}|${docLabel.get(p.documentId)}`));

  const lines = [
    "Requested exams:",
    ...input.exams.map((e) => `${examLabel.get(e.id)}: ${e.name}${e.body_site ? ` (${e.body_site})` : ""} — ${examTypeLabel(e.exam_type)}; requested ${formatDate(e.requested_on)}${e.doctor ? ` by ${e.doctor}` : ""}`),
    "",
    "Documents:",
    ...input.documents.map((d) => [
      `${docLabel.get(d.id)}: ${d.title ?? documentTypeInfo(d.document_type).label} — ${documentTypeInfo(d.document_type).label}, ${formatDate(d.document_date)}${d.provider ? `, ${d.provider}` : ""}`,
      d.summary ? `   Summary: ${d.summary}` : null,
      d.tests.length ? `   Tests reported: ${d.tests.slice(0, 60).join("; ")}` : null,
    ].filter(Boolean).join("\n")),
    "",
    `Pairs you may return: ${[...allowed].join(", ")}`,
  ];

  const client = new Anthropic();
  const message = await client.beta.messages.parse({
    model: MATCH_MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(MatchSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: lines.join("\n") }],
  });
  const examByLabel = new Map([...examLabel].map(([id, label]) => [label, id]));
  const docByLabel = new Map([...docLabel].map(([id, label]) => [label, id]));
  return (message.parsed_output?.matches ?? [])
    .filter((m) => allowed.has(`${m.exam}|${m.document}`))
    .map((m) => ({ examId: examByLabel.get(m.exam)!, documentId: docByLabel.get(m.document)! }));
}
