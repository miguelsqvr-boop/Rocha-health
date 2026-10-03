import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { CATEGORY_LABELS } from "@/lib/domain/taxonomy";
import type { BiomarkerDefinition } from "@/lib/domain/biomarkers";
import type { PreventiveRule } from "@/lib/domain/preventive";
import {
  DOCUMENT_COLUMNS,
  MEMBER_COLUMNS,
  RESULT_COLUMNS,
  type DocumentRow,
  type MedicationRow,
  type MemberRow,
  type ResultRow,
  type WellnessRow,
} from "./types";

// Every function here runs with the signed-in user's client: RLS decides
// which rows come back. Member-scoped helpers additionally filter by member_id
// so a Super Admin's view of one person never mixes in anyone else.

export async function listMembers(supabase: ServerSupabase): Promise<MemberRow[]> {
  const { data } = await supabase.from("family_members").select(MEMBER_COLUMNS).order("sort_order").order("display_name");
  return (data ?? []) as MemberRow[];
}

export async function listBiomarkers(supabase: ServerSupabase): Promise<BiomarkerDefinition[]> {
  const { data } = await supabase
    .from("biomarkers")
    .select("id, code, name, category, default_unit, synonyms, reference_low, reference_high, higher_is_better, family_id")
    .order("sort_order");
  // A family's own definition overrides a built-in one with the same code.
  const byCode = new Map<string, BiomarkerDefinition & { family_id: string | null }>();
  for (const row of (data ?? []) as (BiomarkerDefinition & { family_id: string | null })[]) {
    const existing = byCode.get(row.code);
    if (!existing || (existing.family_id === null && row.family_id !== null)) byCode.set(row.code, row);
  }
  return [...byCode.values()];
}

export async function categoryLabels(supabase: ServerSupabase): Promise<Record<string, string>> {
  const { data } = await supabase.from("health_categories").select("code, label, family_id");
  const labels: Record<string, string> = { ...CATEGORY_LABELS };
  for (const row of (data ?? []).sort((a, b) => Number(a.family_id !== null) - Number(b.family_id !== null))) {
    labels[row.code] = row.label;
  }
  return labels;
}

export async function listPreventiveRules(supabase: ServerSupabase): Promise<PreventiveRule[]> {
  const { data } = await supabase
    .from("preventive_care_rules")
    .select("code, title, description, sex, min_age, max_age, interval_months, document_types, biomarker_codes, active, family_id")
    .order("sort_order");
  const byCode = new Map<string, PreventiveRule & { family_id: string | null }>();
  for (const row of (data ?? []) as (PreventiveRule & { family_id: string | null })[]) {
    const existing = byCode.get(row.code);
    if (!existing || (existing.family_id === null && row.family_id !== null)) byCode.set(row.code, row);
  }
  return [...byCode.values()];
}

export async function memberDocuments(supabase: ServerSupabase, memberId: string, opts: { filedOnly?: boolean } = {}) {
  let query = supabase.from("documents").select(DOCUMENT_COLUMNS).eq("member_id", memberId);
  if (opts.filedOnly ?? true) query = query.eq("status", "filed");
  const { data } = await query.order("document_date", { ascending: false, nullsFirst: false });
  return (data ?? []) as DocumentRow[];
}

export async function memberResults(supabase: ServerSupabase, memberId: string): Promise<ResultRow[]> {
  const { data } = await supabase
    .from("health_results")
    .select(RESULT_COLUMNS)
    .eq("member_id", memberId)
    .order("result_date", { ascending: false });
  return (data ?? []) as unknown as ResultRow[];
}

export async function memberMedications(supabase: ServerSupabase, memberId: string): Promise<MedicationRow[]> {
  const { data } = await supabase
    .from("medications")
    .select("id, member_id, kind, name, dose, frequency, started_on, ended_on, prescriber, notes")
    .eq("member_id", memberId)
    .order("started_on", { ascending: false, nullsFirst: false });
  return (data ?? []) as MedicationRow[];
}

export async function memberWellness(supabase: ServerSupabase, memberId: string, days = 120): Promise<WellnessRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data } = await supabase
    .from("wellness_entries")
    .select("id, member_id, domain, metric, value, unit, recorded_at, source")
    .eq("member_id", memberId)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false });
  return (data ?? []) as WellnessRow[];
}

export async function memberPreventiveCompletions(supabase: ServerSupabase, memberId: string) {
  const { data } = await supabase
    .from("preventive_care_completions")
    .select("id, rule_code, completed_on, note")
    .eq("member_id", memberId);
  return data ?? [];
}

export async function memberWearables(supabase: ServerSupabase, memberId: string) {
  const { data } = await supabase
    .from("wearable_connections")
    .select("id, provider, status, connected_at, last_synced_at")
    .eq("member_id", memberId);
  return data ?? [];
}

export async function memberTimeline(supabase: ServerSupabase, memberId: string, limit = 50) {
  const { data } = await supabase
    .from("member_timeline")
    .select("event_date, kind, ref_id, title, detail, category")
    .eq("member_id", memberId)
    .order("event_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

export async function unreadNotifications(supabase: ServerSupabase, memberId: string) {
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, link, created_at, read_at")
    .eq("recipient_member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(20);
  return data ?? [];
}
