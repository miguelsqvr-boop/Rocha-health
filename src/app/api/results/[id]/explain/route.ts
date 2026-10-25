import { ApiError, json, route } from "@/lib/api";
import { memberResults } from "@/lib/data/queries";
import { MEMBER_COLUMNS, RESULT_COLUMNS, type MemberRow, type ResultRow } from "@/lib/data/types";
import { resultKey } from "@/lib/domain/health-summary";
import { computeFlag } from "@/lib/domain/biomarkers";
import { ageOn } from "@/lib/domain/preventive";
import { explainResult, ExplanationError } from "@/lib/ai/explain";
import { env } from "@/lib/env";

export const maxDuration = 60;

/**
 * "Why might this be?" for one result outside its range. The result, the
 * person and their earlier values are read with the viewer's own session, so
 * only someone who can see the result can ask; each request is audited.
 * Read-only, so it also works in "View as".
 */
export const POST = route({ mutates: false }, async ({ supabase }, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  if (!env.anthropicConfigured()) throw new ApiError(503, "Explanations aren't set up yet (the Anthropic API key is missing).");
  const { data } = await supabase.from("health_results").select(RESULT_COLUMNS).eq("id", id).maybeSingle();
  const result = data as unknown as ResultRow | null;
  if (!result) throw new ApiError(404, "Result not found.");
  // Same rule as the "Needs attention" list.
  const flag = result.flag ?? computeFlag(result.value_numeric, result.reference_low, result.reference_high);
  if (!flag || flag === "normal") throw new ApiError(400, "This result is within its reference range.");
  const { data: member } = await supabase.from("family_members").select(MEMBER_COLUMNS).eq("id", result.member_id).maybeSingle();
  const person = member as MemberRow | null;
  if (!person) throw new ApiError(404, "Result not found.");

  const name = result.biomarker?.name ?? result.analyte_name;
  const { error: logError } = await supabase.rpc("log_access", {
    p_action: "assistant.query",
    p_target_member_id: person.id,
    p_entity_type: "health_result",
    p_entity_id: result.id,
    p_summary: `Asked why ${name} was ${flag}`,
  });
  if (logError) throw new ApiError(403, "You do not have access to this person's records.");

  const key = resultKey(result);
  const history = (await memberResults(supabase, person.id))
    .filter((r) => r.id !== result.id && r.result_date <= result.result_date && resultKey(r) === key)
    .slice(0, 6)
    .map((r) => ({ date: r.result_date, value: r.value_numeric, valueText: r.value_text, unit: r.unit }));

  try {
    const explanation = await explainResult({
      test: name,
      printedName: result.analyte_name,
      value: result.value_numeric,
      valueText: result.value_text,
      unit: result.unit,
      low: result.reference_low,
      high: result.reference_high,
      rangeText: result.reference_text,
      flag,
      date: result.result_date,
      age: person.date_of_birth ? ageOn(person.date_of_birth, new Date(`${result.result_date}T12:00:00Z`)) : null,
      sex: person.sex,
      history,
    });
    return json(explanation);
  } catch (error) {
    if (error instanceof ExplanationError) throw new ApiError(502, error.message);
    throw error;
  }
});
