import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { formatDate, formatRange, formatValue } from "@/lib/format";

export const EXPLAIN_MODEL = "claude-opus-5-5";

export const ExplanationSchema = z.object({
  summary: z.string().describe("Two or three plain sentences: what the test measures and what a value like this generally means"),
  common_causes: z.array(z.string()).describe("Common reasons for a value like this, the most frequent and least serious first"),
  symptoms: z.array(z.string()).describe("Symptoms people may notice with a value like this; say so if it usually causes none"),
  what_doctors_do: z.array(z.string()).describe("What doctors usually do next: repeat the test, other tests, lifestyle changes, treatments they may consider (no doses)"),
  seek_care_promptly_if: z.array(z.string()).describe("Warning signs that mean getting medical care promptly or urgently"),
  questions_for_doctor: z.array(z.string()).describe("Two to four useful questions to ask the doctor"),
});

export type Explanation = z.infer<typeof ExplanationSchema>;

export interface ExplainInput {
  test: string;
  printedName: string;
  value: number | null;
  valueText: string | null;
  unit: string | null;
  low: number | null;
  high: number | null;
  rangeText: string | null;
  flag: string;
  date: string;
  age: number | null;
  sex: string | null;
  /** The same person's earlier results for this test, newest first. */
  history: { date: string; value: number | null; valueText: string | null; unit: string | null }[];
}

const SYSTEM = `You explain one lab result to a family member reading their own private health record. They are not a clinician.

Give general, accurate health information in plain English. You are not diagnosing: never say the person has a condition; say what a value like this can be associated with. Put the most common and least serious explanations first, and say when a value slightly outside the range is often not significant, or can come from things like recent exercise, food or fasting, hydration, a recent illness, medicines or supplements, pregnancy, or differences between labs. Use the lab's range, the person's age and sex, and their own earlier results when given (a value that is stable over years means something different from a new change). If the person is a child, say that children's ranges differ by age and keep to what applies to children.

Treatment: describe what doctors usually do and the kinds of treatment they may consider, without medicine doses, and without telling the person to start or stop any medicine. Always include the warning signs that need prompt or urgent medical care, when there are any. Keep every list item to one short sentence. Write in English.`;

export class ExplanationError extends Error {}

/**
 * A general explanation of one out-of-range result: possible causes, symptoms,
 * what doctors usually do and when to seek care. Only this result, the
 * person's age and sex and their earlier values for the same test are sent
 * (no name or other identifiers), for this request only.
 */
export async function explainResult(input: ExplainInput): Promise<Explanation> {
  const client = new Anthropic();
  const direction = input.flag === "high" ? "above" : input.flag === "low" ? "below" : "outside";
  const lines = [
    `Test: ${input.test}${input.printedName !== input.test ? ` (printed as "${input.printedName}")` : ""}`,
    `Result on ${formatDate(input.date)}: ${formatValue(input.value, input.valueText, input.unit)}`,
    `Lab's reference range: ${formatRange(input.low, input.high, input.rangeText) || "not printed"}`,
    input.flag === "abnormal" ? "The lab marked this result as abnormal." : `The result is ${direction} the reference range.`,
    `Person: ${input.age !== null ? `${input.age} years old` : "age unknown"}, ${input.sex ?? "sex not recorded"}`,
    input.history.length
      ? `Earlier results for the same test: ${input.history.map((h) => `${formatDate(h.date)}: ${formatValue(h.value, h.valueText, h.unit)}`).join("; ")}`
      : "No earlier results for this test.",
  ];

  let message;
  try {
    message = await client.beta.messages.parse({
      model: EXPLAIN_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ExplanationSchema) },
      system: SYSTEM,
      messages: [{ role: "user", content: lines.join("\n") }],
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new ExplanationError("The explainer is busy. Try again in a minute.");
    if (error instanceof Anthropic.APIError) throw new ExplanationError("The explainer is unavailable right now. Try again shortly.");
    throw error;
  }
  if (message.stop_reason === "refusal" || !message.parsed_output) {
    throw new ExplanationError("An explanation isn't available for this result. Please ask your doctor about it.");
  }
  return message.parsed_output;
}
