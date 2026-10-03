import { memberPage } from "@/lib/member-page";
import { memberWellness } from "@/lib/data/queries";
import { WELLNESS_DOMAINS, WELLNESS_METRICS, type WellnessDomain } from "@/lib/domain/wellness";
import { fitnessStatus, sleepStatus } from "@/lib/domain/health-summary";
import { formatDate } from "@/lib/format";
import { Card, EmptyState, StatusPill } from "@/components/ui";
import { TrendChart } from "@/components/client/TrendChart";
import { AddWellnessForm } from "@/components/client/MemberForms2";

export async function WellnessDomainPage({ params, domain }: { params: Promise<{ memberId: string }>; domain: WellnessDomain }) {
  const { subject, supabase, canWrite } = await memberPage(params);
  const config = WELLNESS_DOMAINS[domain];
  const entries = (await memberWellness(supabase, subject.id, 180)).filter((e) => (config.metrics as readonly string[]).includes(e.metric));
  const status = domain === "sleep" ? sleepStatus(entries) : domain === "fitness" ? fitnessStatus(entries) : null;

  return (
    <div className="space-y-4">
      <Card title={config.label} action={status && <StatusPill status={status} />}>
        {canWrite && <AddWellnessForm memberId={subject.id} metrics={config.metrics} />}
        {entries.length === 0 && <div className="mt-4"><EmptyState title={`No ${config.label.toLowerCase()} data yet`}>Add entries manually; wearable sync is coming.</EmptyState></div>}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {config.metrics.map((metric) => {
          const rows = entries.filter((e) => e.metric === metric);
          if (rows.length === 0) return null;
          const def = WELLNESS_METRICS[metric];
          return (
            <Card key={metric}>
              {rows.length > 1 ? (
                <TrendChart title={def.label} unit={def.unit} points={rows.map((r) => ({ date: r.recorded_at, value: Number(r.value) }))} />
              ) : (
                <p className="text-sm text-ink">{def.label}: <strong className="tabular">{rows[0].value} {def.unit}</strong> <span className="text-ink-2">· {formatDate(rows[0].recorded_at)}</span></p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
