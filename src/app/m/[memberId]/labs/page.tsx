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

const LAB_ROW_COLUMNS = "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.6fr)_7rem_auto]";

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
  function reference(r: (typeof results)[number]): { range: string; note: string | null } {
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
          {/* A table on wider screens; on phones each test stacks: name and value, then range, date and actions. */}
          <div className="text-sm">
            <div className={cx("hidden gap-3 pb-1.5 text-xs font-medium text-ink-2 sm:grid", LAB_ROW_COLUMNS)}>
              <span>Test</span><span>Latest</span><span>Reference</span><span>Date</span><span />
            </div>
            <ul className="divide-y divide-border">
              {g.rows.map((r) => {
                const ref = reference(r);
                const name = r.biomarker?.name ?? r.analyte_name;
                return (
                  <li key={r.id} className={cx("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 sm:items-start", LAB_ROW_COLUMNS, flagged.has(r.id) && "-mx-2 rounded-lg bg-serious/5 px-2")}>
                    <Link href={`/m/${subject.id}/trends?test=${encodeURIComponent(resultKey(r))}`} className="tap min-w-0 font-medium text-ink hover:text-accent sm:font-normal">{name}</Link>
                    <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 tabular text-ink sm:justify-start">
                      {formatValue(r.value_numeric, r.value_text, r.unit)}<FlagBadge flag={r.flag} />
                    </span>
                    <span className={cx("col-span-2 tabular text-xs text-ink-2 sm:col-span-1 sm:block sm:text-sm", ref.range === "—" && !ref.note && "hidden")}>
                      <span className="sm:hidden">{ref.range && ref.range !== "—" && "Reference "}</span>{ref.range}
                      {ref.note && <span className="text-xs text-muted sm:block"><span className="sm:hidden">{ref.range ? " · " : ""}</span>{ref.note}</span>}
                    </span>
                    <span className="text-xs text-ink-2 sm:text-sm">{formatDate(r.result_date)}</span>
                    <span className="text-right">
                      {isAdmin ? <ResultEditor resultId={r.id} value={r.value_numeric} text={r.value_text} unit={r.unit} low={r.reference_low} high={r.reference_high} flag={r.flag} />
                        : canWrite ? <RequestCorrection memberId={subject.id} entityType="health_result" entityId={r.id} label={`${name} on ${formatDate(r.result_date)}`} /> : null}
                    </span>
                    {flagged.has(r.id) && <div className="col-span-2 sm:col-span-5"><ExplainResult resultId={r.id} testName={name} /></div>}
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      ))}
    </div>
  );
}
