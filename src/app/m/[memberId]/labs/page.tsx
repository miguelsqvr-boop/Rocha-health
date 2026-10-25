import Link from "next/link";
import { memberPage } from "@/lib/member-page";
import { memberResults } from "@/lib/data/queries";
import { LAB_DOMAINS, needsAttention, resultKey, seriesReference } from "@/lib/domain/health-summary";
import { ageOn } from "@/lib/domain/preventive";
import { describeReference, formatDate, formatRange, formatValue } from "@/lib/format";
import { Card, EmptyState, FlagBadge, cx } from "@/components/ui";
import { ExplainResult } from "@/components/client/ExplainResult";
import { NeedsAttention } from "@/components/member/NeedsAttention";
import { ResultEditor } from "@/components/client/DocumentAdmin";
import { RequestCorrection } from "@/components/client/MemberForms2";

export default async function LabsPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { subject, supabase, viewer, canWrite } = await memberPage(params);
  const results = await memberResults(supabase, subject.id);
  // Every result per test and unit, newest first; the table shows the latest.
  const series = new Map<string, typeof results>();
  for (const r of results) {
    const key = resultKey(r);
    series.set(key, [...(series.get(key) ?? []), r]);
  }
  const latest = new Map([...series].map(([key, rows]) => [key, rows[0]]));
  const adult = subject.date_of_birth ? ageOn(subject.date_of_birth, new Date()) >= 18 : false;
  function reference(r: (typeof results)[number]) {
    if (r.value_numeric === null) return { range: formatRange(r.reference_low, r.reference_high, r.reference_text) || "—", note: null };
    return describeReference(seriesReference(series.get(resultKey(r))!, r.biomarker, { adult }));
  }
  const groups = [...LAB_DOMAINS, { code: "other", label: "Other results" }].map((d) => ({
    ...d,
    rows: [...latest.values()].filter((r) => (r.biomarker?.category ?? "other") === d.code || (d.code === "other" && !LAB_DOMAINS.some((x) => x.code === r.biomarker?.category))),
  })).filter((g) => g.rows.length > 0);
  const isAdmin = viewer.isSuperAdmin && !viewer.viewAs;
  const attention = needsAttention(results);
  const flagged = new Set(attention.map((i) => i.result.id));

  if (results.length === 0) return <Card title="Lab Results"><EmptyState title="No lab results yet">Results appear here when a lab document is filed.</EmptyState></Card>;
  return (
    <div className="space-y-4">
      <NeedsAttention items={attention} memberId={subject.id} />
      {groups.map((g) => (
        <Card key={g.code} title={g.label}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr><th className="py-1.5 pr-3 font-medium">Test</th><th className="py-1.5 pr-3 font-medium">Latest</th><th className="py-1.5 pr-3 font-medium">Reference</th><th className="py-1.5 pr-3 font-medium">Date</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {g.rows.map((r) => (
                  <tr key={r.id} className={cx(flagged.has(r.id) && "bg-serious/5")}>
                    <td className="py-2 pr-3">
                      <Link href={`/m/${subject.id}/trends?test=${encodeURIComponent(resultKey(r))}`} className="text-ink hover:text-accent">{r.biomarker?.name ?? r.analyte_name}</Link>
                      {flagged.has(r.id) && <ExplainResult resultId={r.id} testName={r.biomarker?.name ?? r.analyte_name} />}
                    </td>
                    <td className="py-2 pr-3 tabular text-ink"><span className="mr-2">{formatValue(r.value_numeric, r.value_text, r.unit)}</span><FlagBadge flag={r.flag} /></td>
                    <td className="py-2 pr-3 tabular text-ink-2">
                      {(() => {
                        const ref = reference(r);
                        return <>{ref.range}{ref.note && <span className="block text-xs text-muted">{ref.note}</span>}</>;
                      })()}
                    </td>
                    <td className="py-2 pr-3 text-ink-2">{formatDate(r.result_date)}</td>
                    <td className="py-2 text-right">
                      {isAdmin ? <ResultEditor resultId={r.id} value={r.value_numeric} text={r.value_text} unit={r.unit} low={r.reference_low} high={r.reference_high} flag={r.flag} />
                        : canWrite ? <RequestCorrection memberId={subject.id} entityType="health_result" entityId={r.id} label={`${r.biomarker?.name ?? r.analyte_name} on ${formatDate(r.result_date)}`} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
