import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { listMembers, listPreventiveRules } from "./queries";
import type { MemberRow } from "./types";
import { LAB_DOMAINS, fitnessStatus, labDomainStatus, sleepStatus, type DomainStatus, type ResultPoint } from "@/lib/domain/health-summary";
import { preventiveItems, type PreventiveItem } from "@/lib/domain/preventive";
import { completeness, type CompletenessCheck } from "@/lib/domain/completeness";

export interface MemberSnapshot {
  member: MemberRow;
  latestBloodTest: string | null;
  latestRecord: { date: string; title: string } | null;
  latestActivity: string | null;
  statuses: { label: string; status: DomainStatus | string }[];
  preventive: PreventiveItem[];
  completeness: { percent: number; checks: CompletenessCheck[] };
  documentCount: number;
}

/**
 * Snapshot of every member the viewer can see (the whole family for the
 * Super Admin). Each member is summarised only against their own history;
 * results are returned in the family's own order, never sorted by health.
 */
export async function familySnapshot(supabase: ServerSupabase): Promise<MemberSnapshot[]> {
  const members = await listMembers(supabase);
  if (members.length === 0) return [];
  const ids = members.map((m) => m.id);
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString();

  const [docs, results, wellness, meds, wearables, completions, rules] = await Promise.all([
    supabase.from("documents").select("member_id, document_type, document_date, title, filed_at").in("member_id", ids).eq("status", "filed"),
    supabase
      .from("health_results")
      .select("member_id, analyte_name, result_date, value_numeric, reference_low, reference_high, biomarker:biomarkers(code, category)")
      .in("member_id", ids),
    supabase.from("wellness_entries").select("member_id, metric, value, recorded_at").in("member_id", ids).gte("recorded_at", since),
    supabase.from("medications").select("member_id").in("member_id", ids),
    supabase.from("wearable_connections").select("member_id, status").in("member_id", ids),
    supabase.from("preventive_care_completions").select("member_id, rule_code, completed_on").in("member_id", ids),
    listPreventiveRules(supabase),
  ]);

  return members.map((member) => {
    const myDocs = (docs.data ?? []).filter((d) => d.member_id === member.id);
    const myResults = ((results.data ?? []) as unknown as {
      member_id: string; analyte_name: string; result_date: string; value_numeric: number | null;
      reference_low: number | null; reference_high: number | null; biomarker: { code: string; category: string } | null;
    }[]).filter((r) => r.member_id === member.id);
    const myWellness = (wellness.data ?? []).filter((w) => w.member_id === member.id);

    const points: ResultPoint[] = myResults.map((r) => ({
      biomarker_code: r.biomarker?.code ?? null,
      analyte_name: r.analyte_name,
      category: r.biomarker?.category ?? null,
      result_date: r.result_date,
      value: r.value_numeric,
      low: r.reference_low,
      high: r.reference_high,
    }));

    const datedDocs = myDocs
      .map((d) => ({ date: d.document_date ?? d.filed_at?.slice(0, 10) ?? "", title: d.title ?? "Health record", type: d.document_type }))
      .filter((d) => d.date)
      .sort((a, b) => b.date.localeCompare(a.date));
    const latestBloodTest = datedDocs.find((d) => d.type === "blood_test")?.date ?? null;
    const latestWellness = myWellness.map((w) => w.recorded_at).sort().at(-1) ?? null;
    const latestActivity = [datedDocs[0]?.date, latestWellness?.slice(0, 10)].filter(Boolean).sort().at(-1) ?? null;

    const lab = (code: string) => labDomainStatus(points.filter((p) => p.category === code));
    const statuses = [
      { label: "Cardiovascular", status: lab("cardiovascular") },
      { label: "Metabolic", status: lab("metabolic") },
      { label: "Sleep", status: sleepStatus(myWellness) },
      { label: "Fitness", status: fitnessStatus(myWellness) },
    ];

    return {
      member,
      latestBloodTest,
      latestRecord: datedDocs[0] ? { date: datedDocs[0].date, title: datedDocs[0].title } : null,
      latestActivity,
      statuses,
      preventive: preventiveItems({
        member,
        rules,
        documents: myDocs,
        results: points.map((p) => ({ biomarker_code: p.biomarker_code, result_date: p.result_date })),
        completions: (completions.data ?? []).filter((c) => c.member_id === member.id),
      }),
      completeness: completeness({
        hasLogin: member.status === "active",
        hasDateOfBirth: Boolean(member.date_of_birth),
        latestBloodTest,
        latestWellness,
        medicationsRecorded: (meds.data ?? []).some((m) => m.member_id === member.id),
        wearableConnected: (wearables.data ?? []).some((w) => w.member_id === member.id && w.status === "connected"),
      }),
      documentCount: myDocs.length,
    };
  });
}

export { LAB_DOMAINS };
