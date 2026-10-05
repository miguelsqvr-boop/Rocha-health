import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import type { MemberRow } from "@/lib/data/types";
import {
  listMembers,
  listPreventiveRules,
  memberDocuments,
  memberMedications,
  memberPreventiveCompletions,
  memberResults,
  memberWellness,
} from "@/lib/data/queries";
import { LAB_DOMAINS, fitnessStatus, labDomainStatus, sleepStatus } from "@/lib/domain/health-summary";
import { preventiveItems } from "@/lib/domain/preventive";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { metricLabel } from "@/lib/domain/wellness";
import { normalizeText } from "@/lib/domain/names";

export const ASSISTANT_MODEL = "claude-opus-5-5";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * The assistant obeys exactly the same permissions as the rest of the app:
 *  - the people it may discuss are the rows RLS returns for this user
 *    (narrowed to one person during "View as"),
 *  - every tool re-resolves the person against that list and queries with the
 *    user's own Supabase client, so the database applies RLS again,
 *  - each person whose records are read is written to the audit log.
 * There is no service-role access anywhere in this path.
 */
export async function runAssistant(params: {
  supabase: ServerSupabase;
  viewer: Viewer & { member: MemberRow };
  history: ChatTurn[];
}): Promise<{ answer: string; peopleAccessed: string[] }> {
  const { supabase, viewer } = params;
  const visible = await listMembers(supabase);
  const people = viewer.viewAs ? visible.filter((m) => m.id === viewer.viewAs!.id) : visible;
  const self = viewer.viewAs ? people[0] : viewer.member;
  const accessed = new Set<string>();

  function resolve(person: string): MemberRow | string {
    const wanted = normalizeText(person);
    if (["me", "myself", "i", "my", "mine", "eu"].includes(wanted) && self) return self;
    const match = people.find((m) =>
      [m.display_name, m.legal_name, ...(m.name_aliases ?? [])]
        .filter((n): n is string => Boolean(n))
        .some((n) => normalizeText(n) === wanted || normalizeText(n).split(" ")[0] === wanted),
    );
    if (match) return match;
    return `Permission denied: you can only access health information for ${people.map((p) => p.display_name).join(", ")}. Do not say whether anyone else has records.`;
  }

  async function audit(member: MemberRow, tool: string) {
    if (accessed.has(`${member.id}:${tool}`)) return;
    accessed.add(`${member.id}:${tool}`);
    await supabase.rpc("log_access", {
      p_action: "assistant.query",
      p_target_member_id: member.id,
      p_entity_type: "family_member",
      p_entity_id: member.id,
      p_summary: `Health assistant read ${tool.replace(/_/g, " ")} for ${member.display_name}`,
      p_metadata: { tool },
    });
  }

  const personField = z.string().describe('Name of the person, or "me"');

  const tools = [
    betaZodTool({
      name: "list_people",
      description: "List the people whose health information this user is allowed to access.",
      inputSchema: z.object({}),
      run: async () =>
        JSON.stringify(people.map((p) => ({ name: p.display_name, full_name: p.legal_name, is_current_user: p.id === self?.id }))),
    }),
    betaZodTool({
      name: "get_lab_results",
      description: "Lab results for one person, newest first. Optionally filter by test name (e.g. 'HbA1c', 'cholesterol').",
      inputSchema: z.object({ person: personField, test: z.string().optional(), latest_only: z.boolean().optional() }),
      run: async ({ person, test, latest_only }) => {
        const member = resolve(person);
        if (typeof member === "string") return member;
        await audit(member, "lab_results");
        let rows = await memberResults(supabase, member.id);
        if (test) {
          const t = normalizeText(test);
          rows = rows.filter((r) => normalizeText(`${r.analyte_name} ${r.biomarker?.name ?? ""} ${r.biomarker?.code ?? ""}`).includes(t));
        }
        if (latest_only) {
          const seen = new Set<string>();
          rows = rows.filter((r) => {
            const k = r.biomarker?.code ?? r.analyte_name;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
        return JSON.stringify({
          person: member.display_name,
          results: rows.slice(0, 200).map((r) => ({
            date: r.result_date, test: r.biomarker?.name ?? r.analyte_name, value: r.value_numeric ?? r.value_text,
            unit: r.unit, reference: [r.reference_low, r.reference_high], flag: r.flag, category: r.biomarker?.category,
          })),
        });
      },
    }),
    betaZodTool({
      name: "get_documents",
      description: "Filed health documents for one person (type, date, provider), newest first.",
      inputSchema: z.object({ person: personField }),
      run: async ({ person }) => {
        const member = resolve(person);
        if (typeof member === "string") return member;
        await audit(member, "documents");
        const docs = await memberDocuments(supabase, member.id);
        return JSON.stringify({
          person: member.display_name,
          documents: docs.map((d) => ({ date: d.document_date, title: d.title ?? documentTypeInfo(d.document_type).label, type: d.document_type, provider: d.provider })),
        });
      },
    }),
    betaZodTool({
      name: "get_health_overview",
      description: "One person's overview: status by health area, medications and supplements, and preventive care that is due.",
      inputSchema: z.object({ person: personField }),
      run: async ({ person }) => {
        const member = resolve(person);
        if (typeof member === "string") return member;
        await audit(member, "health_overview");
        const [results, meds, wellness, docs, rules, completions] = await Promise.all([
          memberResults(supabase, member.id),
          memberMedications(supabase, member.id),
          memberWellness(supabase, member.id, 60),
          memberDocuments(supabase, member.id),
          listPreventiveRules(supabase),
          memberPreventiveCompletions(supabase, member.id),
        ]);
        const points = results.map((r) => ({
          biomarker_code: r.biomarker?.code ?? null, analyte_name: r.analyte_name, category: r.biomarker?.category ?? null,
          result_date: r.result_date, value: r.value_numeric, low: r.reference_low, high: r.reference_high,
        }));
        return JSON.stringify({
          person: member.display_name,
          areas: Object.fromEntries(LAB_DOMAINS.map((d) => [d.label, labDomainStatus(points.filter((p) => p.category === d.code))])),
          sleep: sleepStatus(wellness),
          fitness: fitnessStatus(wellness),
          medications: meds.filter((m) => !m.ended_on).map((m) => ({ kind: m.kind, name: m.name, dose: m.dose, frequency: m.frequency })),
          preventive_care: preventiveItems({
            member, rules,
            documents: docs,
            results: results.map((r) => ({ biomarker_code: r.biomarker?.code ?? null, result_date: r.result_date })),
            completions,
          }).filter((i) => i.status !== "up_to_date").map((i) => ({ item: i.rule.title, status: i.status, last_done: i.lastDone, due: i.dueOn })),
        });
      },
    }),
    betaZodTool({
      name: "get_wellness",
      description: "Recent wellness data for one person (sleep, steps, weight, etc.).",
      inputSchema: z.object({ person: personField, days: z.number().int().min(1).max(365).optional() }),
      run: async ({ person, days }) => {
        const member = resolve(person);
        if (typeof member === "string") return member;
        await audit(member, "wellness");
        const rows = await memberWellness(supabase, member.id, days ?? 30);
        return JSON.stringify({
          person: member.display_name,
          entries: rows.slice(0, 300).map((r) => ({ metric: metricLabel(r.metric), value: r.value, unit: r.unit, at: r.recorded_at })),
        });
      },
    }),
  ];

  const roleLine = viewer.viewAs
    ? `The Super Admin (${viewer.member.display_name}) is previewing the app as ${self?.display_name}. Answer exactly as you would for ${self?.display_name}.`
    : viewer.isSuperAdmin
      ? `You are talking to ${viewer.member.display_name}, the family's Super Admin.`
      : `You are talking to ${viewer.member.display_name}, a family member.`;

  const system = `You are the private health assistant in Rocha Health, a family health-records app.

${roleLine}
This user may access health information for exactly these people: ${people.map((p) => p.display_name).join(", ")}. That list comes from the app's permission rules and is complete. If they ask about anyone else, say plainly that they don't have permission to see that person's health information. Do not guess, and do not reveal whether that person has any records.

Use the tools for every fact about someone's health; never invent or estimate values. Health information is private and sensitive: only discuss the people above. When the user may see several people, comparing their results is fine if asked, but don't rank family members or frame health as a competition.

You are not a doctor. Explain results in plain language, point out values outside the lab's reference range, and suggest discussing anything concerning with a doctor. Don't diagnose. Keep answers short, use dates like "12 Sep 2026", and use simple lists or tables for results.`;

  const client = new Anthropic();
  const runner = client.beta.messages.toolRunner({
    model: ASSISTANT_MODEL,
    max_tokens: 16000,
    max_iterations: 8,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system,
    tools,
    messages: params.history.map((turn) => ({ role: turn.role, content: turn.content })),
  });
  const final = await runner.runUntilDone();

  if (final.stop_reason === "refusal") {
    return { answer: "I can't help with that request.", peopleAccessed: [] };
  }
  const answer = final.content
    .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  const names = new Set([...accessed].map((key) => people.find((p) => key.startsWith(p.id))?.display_name).filter(Boolean) as string[]);
  return { answer: answer || "I couldn't find an answer to that.", peopleAccessed: [...names] };
}
