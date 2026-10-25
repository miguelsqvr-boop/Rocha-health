import Link from "next/link";
import { memberPage } from "@/lib/member-page";
import { memberResults } from "@/lib/data/queries";
import { seriesReference, trendGroups } from "@/lib/domain/health-summary";
import { ageOn } from "@/lib/domain/preventive";
import { formatDate } from "@/lib/format";
import { Card, EmptyState, cx } from "@/components/ui";
import { TrendChart } from "@/components/client/TrendChart";

/**
 * Every numeric lab result over time, one chart per test, grouped by
 * category. Filter by category (?category=) or open one test (?test=).
 */
export default async function TrendsPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ test?: string; category?: string }>;
}) {
  const { subject, supabase } = await memberPage(params);
  const { test, category } = await searchParams;
  const groups = trendGroups(await memberResults(supabase, subject.id));
  // Typical (catalogue) ranges are adult ranges: never shown for children.
  const adult = subject.date_of_birth ? ageOn(subject.date_of_birth, new Date()) >= 18 : false;

  if (groups.length === 0) {
    return (
      <Card title="Trends">
        <EmptyState title="No results to chart yet">Charts appear here when a lab document with results is filed.</EmptyState>
      </Card>
    );
  }

  const testGroup = test ? groups.find((g) => g.series.some((s) => s.key === test)) : undefined;
  const activeCategory = testGroup?.code ?? (groups.some((g) => g.code === category) ? category : undefined);
  const shown = groups
    .filter((g) => !activeCategory || g.code === activeCategory)
    .map((g) => ({ ...g, series: testGroup ? g.series.filter((s) => s.key === test) : g.series }));
  const base = `/m/${subject.id}/trends`;
  const chip = (active: boolean) =>
    cx("rounded-full border px-3 py-1 text-xs", active ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-2 hover:text-ink");

  return (
    <div className="space-y-4">
      <Card title="Trends">
        <nav aria-label="Categories" className="flex flex-wrap gap-1.5">
          <Link href={base} className={chip(!activeCategory)}>All</Link>
          {groups.map((g) => (
            <Link key={g.code} href={`${base}?category=${g.code}`} className={chip(activeCategory === g.code)}>
              {g.label} <span className="text-muted">{g.series.length}</span>
            </Link>
          ))}
        </nav>
        <p className="mt-3 text-xs text-ink-2">
          One chart per test with every result on record. The shaded band is the reference range the lab printed;
          when the latest report has none, the chart says where its band comes from.
        </p>
      </Card>

      {shown.map((g) => (
        <section key={g.code} aria-labelledby={`trends-${g.code}`} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id={`trends-${g.code}`} className="text-base font-semibold text-ink">{g.label}</h2>
            {testGroup && <Link href={`${base}?category=${g.code}`} className="text-sm text-accent">All {g.label.toLowerCase()} tests</Link>}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {g.series.map((s) => {
              const latest = s.rows[0];
              const ref = seriesReference(s.rows, latest.biomarker, { adult });
              return (
                <Card key={s.key}>
                  <TrendChart
                    title={s.name}
                    unit={s.unit}
                    low={ref.low}
                    high={ref.high}
                    rangeKind={ref.source === "typical" ? "typical" : "lab"}
                    rangeLabel={ref.source === "earlier" ? `Range from the ${formatDate(ref.fromDate)} report` : ref.source === "typical" ? "Typical adult range" : "Reference range"}
                    points={s.rows.map((r) => ({ date: r.result_date, value: Number(r.value_numeric), flag: r.flag }))}
                  />
                  {ref.text && <p className="mt-1 text-xs text-ink-2">Lab&apos;s reference: {ref.text}</p>}
                  {ref.source === "earlier" && (
                    <p className="mt-1 text-xs text-ink-2">The latest report printed no range for this test, so the band is the one printed on the {formatDate(ref.fromDate)} report.</p>
                  )}
                  {ref.source === "typical" && (
                    <p className="mt-1 text-xs text-ink-2">No report printed a range for this test. The dashed band is a typical adult range, not your lab&apos;s.</p>
                  )}
                  {ref.source === null && !ref.text && <p className="mt-1 text-xs text-ink-2">The lab printed no reference range for this test.</p>}
                  <p className="mt-1 text-xs text-ink-2">
                    {s.rows.length === 1 ? "1 result" : `${s.rows.length} results`}
                    {!testGroup && <> · <Link href={`${base}?test=${encodeURIComponent(s.key)}`} className="text-accent">Open</Link></>}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
