// Per-member summaries for dashboards: domain status from lab results and
// wellness data. These describe one person's own trend over time. They are
// never used to compare or rank family members.

import { computeFlag, unitKey } from "./biomarkers";

export interface ResultPoint {
  biomarker_code: string | null;
  analyte_name: string;
  category: string | null;
  result_date: string;
  value: number | null;
  low: number | null;
  high: number | null;
}

export type DomainStatus = "In range" | "Stable" | "Improving" | "Needs attention" | "—";

export const LAB_DOMAINS = [
  { code: "cardiovascular", label: "Cardiovascular" },
  { code: "metabolic", label: "Metabolic" },
  { code: "kidney", label: "Kidney" },
  { code: "liver", label: "Liver" },
  { code: "blood_count", label: "Blood count" },
  { code: "thyroid", label: "Thyroid" },
  { code: "vitamins_minerals", label: "Vitamins & minerals" },
  { code: "hormones", label: "Hormones" },
  { code: "inflammation", label: "Inflammation" },
] as const;

/** Minimal shape of a stored lab result, as the result pages read it. */
export interface LabResultLike {
  analyte_name: string;
  unit: string | null;
  value_numeric: number | string | null;
  biomarker: { code: string; name: string; category: string } | null;
}

/**
 * One key per test and unit: the catalogue code (or the printed name ignoring
 * case) plus the unit, with equivalent spellings merged ("x10^3/µl" and
 * "10^9/L"). A test reported both as a percentage and an absolute count, or
 * in mg/dL and mmol/L, is two series rather than one mixed chart.
 */
export function resultKey(r: Pick<LabResultLike, "analyte_name" | "biomarker" | "unit">): string {
  const test = r.biomarker?.code ?? r.analyte_name.trim().toLowerCase().replace(/\s+/g, " ");
  const unit = unitKey(r.unit);
  return unit ? `${test}|${unit}` : test;
}

export interface TrendSeries<R> {
  key: string;
  name: string;
  unit: string | null;
  rows: R[];
}

export interface TrendGroup<R> {
  code: string;
  label: string;
  series: TrendSeries<R>[];
}

/**
 * Charts for one person's numeric results, grouped by category in a fixed
 * order (tests outside the catalogue go under "Other results"). One series
 * per test and unit (see resultKey). Expects newest first.
 */
export function trendGroups<R extends LabResultLike>(results: R[]): TrendGroup<R>[] {
  const series = new Map<string, TrendSeries<R> & { category: string }>();
  for (const r of results) {
    if (r.value_numeric === null) continue;
    const key = resultKey(r);
    let entry = series.get(key);
    if (!entry) {
      const category = LAB_DOMAINS.some((d) => d.code === r.biomarker?.category) ? r.biomarker!.category : "other";
      entry = { key, name: r.biomarker?.name ?? r.analyte_name.trim(), unit: r.unit, rows: [], category };
      series.set(key, entry);
    }
    entry.rows.push(r);
  }
  return [...LAB_DOMAINS, { code: "other", label: "Other results" }]
    .map((d) => ({
      code: d.code,
      label: d.label,
      series: [...series.values()]
        .filter((s) => s.category === d.code)
        .sort((a, b) => a.name.localeCompare(b.name) || (a.unit ?? "").localeCompare(b.unit ?? ""))
        .map(({ category: _category, ...rest }) => rest),
    }))
    .filter((g) => g.series.length > 0);
}

/** What the result pages know about a stored result's reference range. */
export interface RangedResult {
  result_date: string;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
}

export interface SeriesReference {
  low: number | null;
  high: number | null;
  /**
   * lab: printed with the latest result. earlier: printed for the same test
   * on an earlier report (fromDate). typical: the catalogue's typical adult
   * range, because no report printed one. null: no range to draw.
   */
  source: "lab" | "earlier" | "typical" | null;
  fromDate: string | null;
  /** The latest result's range when the lab printed it only as text (risk levels, time of day). */
  text: string | null;
}

const hasRange = (r: RangedResult) => r.reference_low != null || r.reference_high != null;

/**
 * The reference range to show for one test, from one person's own results
 * (newest first, one unit). The lab's range always wins; a range from an
 * earlier report of the same test comes next, because labs often print it on
 * only one of a test's two lines. The catalogue's typical range is used only
 * for adults and only in its own unit: adult ranges don't apply to children.
 */
export function seriesReference(
  rows: RangedResult[],
  definition: { default_unit: string | null; reference_low: number | null; reference_high: number | null } | null,
  options: { adult: boolean },
): SeriesReference {
  const latest = rows[0];
  const none: SeriesReference = { low: null, high: null, source: null, fromDate: null, text: null };
  if (!latest) return none;
  if (hasRange(latest)) return { ...none, low: latest.reference_low, high: latest.reference_high, source: "lab" };
  const text = latest.reference_text?.trim() || null;
  const earlier = rows.find(hasRange);
  if (earlier) return { low: earlier.reference_low, high: earlier.reference_high, source: "earlier", fromDate: earlier.result_date, text };
  if (
    options.adult && definition &&
    (definition.reference_low != null || definition.reference_high != null) &&
    unitKey(definition.default_unit) === unitKey(latest.unit)
  ) {
    return { low: definition.reference_low, high: definition.reference_high, source: "typical", fromDate: null, text };
  }
  return { ...none, text };
}

/**
 * far: at least twice the upper limit, or at most half the lower limit.
 * outside: outside the range, by less. abnormal: a result the lab marked
 * abnormal that has no number to compare (e.g. a positive culture).
 */
export type AttentionLevel = "far" | "outside" | "abnormal";

export interface AttentionItem<R> {
  result: R;
  level: AttentionLevel;
  direction: "high" | "low" | null;
}

const LEVEL_ORDER: Record<AttentionLevel, number> = { far: 0, abnormal: 1, outside: 2 };

/**
 * One person's results that need attention: for each test (and unit), its
 * latest result when that is outside the reference range or marked abnormal.
 * A test that was out of range but has since come back in range is not
 * listed. Furthest out first, then newest. Expects newest first.
 */
export function needsAttention<R extends LabResultLike & RangedResult & { flag: string | null }>(results: R[]): AttentionItem<R>[] {
  const seen = new Set<string>();
  const items: AttentionItem<R>[] = [];
  for (const r of results) {
    const key = resultKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    const value = r.value_numeric === null ? null : Number(r.value_numeric);
    const flag = r.flag ?? computeFlag(value, r.reference_low, r.reference_high);
    if (!flag || flag === "normal") continue;
    if (flag === "abnormal" || value === null) {
      items.push({ result: r, level: "abnormal", direction: null });
      continue;
    }
    const far = flag === "high"
      ? r.reference_high != null && r.reference_high > 0 && value >= 2 * r.reference_high
      : r.reference_low != null && r.reference_low > 0 && value <= r.reference_low / 2;
    items.push({ result: r, level: far ? "far" : "outside", direction: flag === "low" ? "low" : "high" });
  }
  return items.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.result.result_date.localeCompare(a.result.result_date));
}

/** How far a value sits outside its range, relative to the range edge (0 = inside). */
export function distanceOutside(value: number, low: number | null, high: number | null): number {
  if (low != null && value < low) return (low - value) / Math.max(Math.abs(low), 1e-9);
  if (high != null && value > high) return (value - high) / Math.max(Math.abs(high), 1e-9);
  return 0;
}

/** Latest and previous value per biomarker, newest first. */
export function seriesByBiomarker(points: ResultPoint[]): Map<string, ResultPoint[]> {
  const series = new Map<string, ResultPoint[]>();
  for (const p of points) {
    if (p.value === null) continue;
    const k = p.biomarker_code ?? p.analyte_name.toLowerCase();
    const list = series.get(k) ?? [];
    list.push(p);
    series.set(k, list);
  }
  for (const list of series.values()) list.sort((a, b) => b.result_date.localeCompare(a.result_date));
  return series;
}

export function labDomainStatus(points: ResultPoint[]): DomainStatus {
  const series = [...seriesByBiomarker(points).values()].filter((s) => s.some((p) => p.low != null || p.high != null));
  if (series.length === 0) return "—";

  let outOfRange = 0;
  let improved = 0;
  let worsened = 0;
  let withHistory = 0;
  for (const s of series) {
    const [latest, previous] = s;
    const now = distanceOutside(latest.value!, latest.low, latest.high);
    if (now > 0) outOfRange++;
    if (!previous || previous.result_date === latest.result_date) continue;
    withHistory++;
    const before = distanceOutside(previous.value!, previous.low, previous.high);
    if (now < before - 0.02) improved++;
    else if (now > before + 0.02) worsened++;
  }

  if (worsened > 0) return "Needs attention";
  if (improved > 0) return "Improving";
  if (outOfRange > 0) return "Needs attention";
  return withHistory > 0 ? "Stable" : "In range";
}

export interface WellnessPoint {
  metric: string;
  value: number;
  recorded_at: string;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function window(points: WellnessPoint[], metric: string, fromDaysAgo: number, toDaysAgo: number, today: Date) {
  const start = today.getTime() - fromDaysAgo * 86_400_000;
  const end = today.getTime() - toDaysAgo * 86_400_000;
  return points
    .filter((p) => p.metric === metric)
    .filter((p) => {
      const t = new Date(p.recorded_at).getTime();
      return t > start && t <= end;
    })
    .map((p) => p.value);
}

export function sleepStatus(points: WellnessPoint[], today = new Date()): "Good" | "Fair" | "Low" | "—" {
  const avg = average(window(points, "sleep_hours", 14, 0, today));
  if (avg === null) return "—";
  if (avg >= 7) return "Good";
  if (avg >= 6) return "Fair";
  return "Low";
}

/** Compares the last 14 days with the 14 before, using steps or active minutes. */
export function fitnessStatus(points: WellnessPoint[], today = new Date()): "Improving" | "Stable" | "Declining" | "—" {
  for (const metric of ["active_minutes", "steps"]) {
    const recent = average(window(points, metric, 14, 0, today));
    const before = average(window(points, metric, 28, 14, today));
    if (recent === null) continue;
    if (before === null || before === 0) return "Stable";
    const change = (recent - before) / before;
    if (change > 0.1) return "Improving";
    if (change < -0.1) return "Declining";
    return "Stable";
  }
  return "—";
}
