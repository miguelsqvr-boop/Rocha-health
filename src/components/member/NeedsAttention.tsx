import Link from "next/link";
import type { AttentionItem } from "@/lib/domain/health-summary";
import { resultKey } from "@/lib/domain/health-summary";
import { formatDate, formatRange, formatValue } from "@/lib/format";
import type { ResultRow } from "@/lib/data/types";
import { Badge } from "@/components/ui";
import { ExplainResult } from "@/components/client/ExplainResult";

export function attentionLabel(item: Pick<AttentionItem<unknown>, "level" | "direction">): { text: string; tone: "critical" | "serious" } {
  if (item.level === "abnormal") return { text: "Marked abnormal by the lab", tone: "serious" };
  const side = item.direction === "low" ? "below" : "above";
  return item.level === "far" ? { text: `Far ${side} range`, tone: "critical" } : { text: `${side === "below" ? "Below" : "Above"} range`, tone: "serious" };
}

/**
 * The person's latest results outside the reference range, at the top of
 * their pages so they are never missed. Each one links to its trend and can
 * explain possible causes on request.
 */
export function NeedsAttention({ items, memberId }: { items: AttentionItem<ResultRow>[]; memberId: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-good/40 bg-good/10 px-5 py-3 text-sm text-ink">
        <span aria-hidden>✓ </span>No results need attention: every latest result is within the lab&apos;s reference range.
      </p>
    );
  }
  const far = items.filter((i) => i.level === "far").length;
  return (
    <section aria-labelledby="needs-attention" className="rounded-2xl border-2 border-serious bg-serious/5 p-5">
      <h2 id="needs-attention" className="flex flex-wrap items-center gap-2 text-base font-semibold text-ink">
        <span aria-hidden>⚠</span> Needs attention
        <Badge tone="serious">{items.length === 1 ? "1 result" : `${items.length} results`}</Badge>
        {far > 0 && <Badge tone="critical">{far} far outside the range</Badge>}
      </h2>
      <ul className="mt-3 divide-y divide-serious/20">
        {items.map((item) => {
          const r = item.result;
          const label = attentionLabel(item);
          const range = formatRange(r.reference_low, r.reference_high, r.reference_text);
          return (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Link href={`/m/${memberId}/trends?test=${encodeURIComponent(resultKey(r))}`} className="font-medium text-ink hover:text-accent">
                  {r.biomarker?.name ?? r.analyte_name}
                </Link>
                <span className="tabular font-semibold text-ink">{formatValue(r.value_numeric, r.value_text, r.unit)}</span>
                <Badge tone={label.tone}>
                  <span aria-hidden>{item.direction === "low" ? "▼" : item.direction === "high" ? "▲" : "!"}</span>{label.text}
                </Badge>
                {range && <span className="text-xs text-ink-2">Range {range}</span>}
                <span className="ml-auto text-xs text-ink-2">{formatDate(r.result_date)}</span>
              </div>
              <div className="mt-1"><ExplainResult resultId={r.id} testName={r.biomarker?.name ?? r.analyte_name} /></div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-ink-2">
        The latest result of each test that is outside the lab&apos;s reference range. Not a diagnosis: share these with your doctor, and
        sooner for anything far outside the range.
      </p>
    </section>
  );
}
