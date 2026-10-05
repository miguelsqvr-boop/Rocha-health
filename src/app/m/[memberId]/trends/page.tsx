import Link from "next/link";
import { memberPage } from "@/lib/member-page";
import { memberResults } from "@/lib/data/queries";
import { Card, EmptyState, cx } from "@/components/ui";
import { TrendChart } from "@/components/client/TrendChart";

export default async function TrendsPage({ params, searchParams }: { params: Promise<{ memberId: string }>; searchParams: Promise<{ test?: string }> }) {
  const { subject, supabase } = await memberPage(params);
  const { test } = await searchParams;
  const results = (await memberResults(supabase, subject.id)).filter((r) => r.value_numeric !== null);

  const series = new Map<string, { name: string; unit: string | null; rows: typeof results }>();
  for (const r of results) {
    const key = r.biomarker?.code ?? r.analyte_name;
    const entry = series.get(key) ?? { name: r.biomarker?.name ?? r.analyte_name, unit: r.unit, rows: [] };
    // Only chart values in the same unit as the most recent one.
    if (entry.unit === r.unit) entry.rows.push(r);
    series.set(key, entry);
  }
  const keys = [...series.keys()].sort((a, b) => series.get(b)!.rows.length - series.get(a)!.rows.length);
  const selected = test && series.has(test) ? [test] : keys.filter((k) => series.get(k)!.rows.length > 1).slice(0, 6);

  if (keys.length === 0) return <Card title="Trends"><EmptyState title="No results to chart yet" /></Card>;
  return (
    <div className="space-y-4">
      <Card title="Trends">
        <div className="flex flex-wrap gap-1.5">
          {keys.map((k) => (
            <Link key={k} href={`?test=${encodeURIComponent(k)}`} className={cx("rounded-full border px-3 py-1 text-xs", selected.includes(k) && test ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-2 hover:text-ink")}>
              {series.get(k)!.name} <span className="text-muted">{series.get(k)!.rows.length}</span>
            </Link>
          ))}
        </div>
        {!test && <p className="mt-3 text-xs text-ink-2">Showing measures with more than one result. Choose any test to see its history.</p>}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {selected.map((k) => {
          const s = series.get(k)!;
          const latest = s.rows[0];
          return (
            <Card key={k}>
              <TrendChart
                title={s.name}
                unit={s.unit}
                low={latest.reference_low}
                high={latest.reference_high}
                points={s.rows.map((r) => ({ date: r.result_date, value: Number(r.value_numeric), flag: r.flag }))}
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
}
