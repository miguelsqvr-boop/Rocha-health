// Per-member summaries for dashboards: domain status from lab results and
// wellness data. These describe one person's own trend over time. They are
// never used to compare or rank family members.

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
