import { memberPage } from "@/lib/member-page";
import { memberResults, memberWellness } from "@/lib/data/queries";
import { formatDate, formatRange, formatValue } from "@/lib/format";
import { WELLNESS_METRICS } from "@/lib/domain/wellness";
import { Card, EmptyState, FlagBadge } from "@/components/ui";

// Markers commonly tracked for long-term (cardiometabolic) health.
const LAB_MARKERS = ["apob", "lipoprotein_a", "ldl_cholesterol", "hba1c", "glucose_fasting", "insulin_fasting", "hs_crp", "homocysteine", "egfr", "vitamin_d", "triglycerides", "hdl_cholesterol"];
const WELLNESS_MARKERS = ["vo2max", "resting_hr", "sleep_hours", "body_fat", "muscle_mass", "hrv"] as const;

export default async function LongevityPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { subject, supabase } = await memberPage(params);
  const [results, wellness] = await Promise.all([memberResults(supabase, subject.id), memberWellness(supabase, subject.id, 365)]);
  const latestLab = LAB_MARKERS.map((code) => results.find((r) => r.biomarker?.code === code)).filter(Boolean);
  const latestWellness = WELLNESS_MARKERS.map((m) => wellness.find((w) => w.metric === m)).filter(Boolean);
  return (
    <div className="space-y-4">
      <Card title="Longevity markers">
        <p className="mb-3 text-sm text-ink-2">Lab markers and fitness measures often tracked for long-term health. Track them over time and discuss targets with a doctor.</p>
        {latestLab.length === 0 && latestWellness.length === 0 ? <EmptyState title="No longevity markers recorded yet" /> : (
          <ul className="divide-y divide-border text-sm">
            {latestLab.map((r) => r && (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-48 text-ink">{r.biomarker?.name}</span>
                <span className="tabular text-ink">{formatValue(r.value_numeric, r.value_text, r.unit)}</span>
                <FlagBadge flag={r.flag} />
                <span className="text-xs text-ink-2">ref {formatRange(r.reference_low, r.reference_high, r.reference_text)}</span>
                <span className="ml-auto text-xs text-ink-2">{formatDate(r.result_date)}</span>
              </li>
            ))}
            {latestWellness.map((w) => w && (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-48 text-ink">{WELLNESS_METRICS[w.metric as keyof typeof WELLNESS_METRICS]?.label ?? w.metric}</span>
                <span className="tabular text-ink">{w.value} {w.unit}</span>
                <span className="ml-auto text-xs text-ink-2">{formatDate(w.recorded_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
