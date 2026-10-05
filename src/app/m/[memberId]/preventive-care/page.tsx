import { memberPage } from "@/lib/member-page";
import { listPreventiveRules, memberDocuments, memberPreventiveCompletions, memberResults } from "@/lib/data/queries";
import { preventiveItems } from "@/lib/domain/preventive";
import { formatDate } from "@/lib/format";
import { Badge, Card, EmptyState } from "@/components/ui";

const STATUS = {
  overdue: { label: "Overdue", tone: "serious" },
  due_soon: { label: "Due soon", tone: "warning" },
  no_record: { label: "No record yet", tone: "neutral" },
  up_to_date: { label: "Up to date", tone: "good" },
} as const;

export default async function PreventiveCarePage({ params }: { params: Promise<{ memberId: string }> }) {
  const { subject, supabase } = await memberPage(params);
  const [rules, docs, results, completions] = await Promise.all([
    listPreventiveRules(supabase), memberDocuments(supabase, subject.id), memberResults(supabase, subject.id), memberPreventiveCompletions(supabase, subject.id),
  ]);
  const items = preventiveItems({
    member: subject, rules, documents: docs,
    results: results.map((r) => ({ biomarker_code: r.biomarker?.code ?? null, result_date: r.result_date })),
    completions,
  });
  return (
    <Card title="Preventive care">
      {!subject.date_of_birth && <p className="mb-3 text-sm text-warning-ink">Add a date of birth to the profile to see age-based screening.</p>}
      {items.length === 0 ? <EmptyState title="No preventive-care items apply" /> : (
        <ul className="divide-y divide-border text-sm">
          {items.map((i) => (
            <li key={i.rule.code} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{i.rule.title}</p>
                <p className="text-xs text-ink-2">{i.rule.description} Every {i.rule.interval_months} months.</p>
              </div>
              <div className="text-right text-xs text-ink-2">
                <p>Last: {i.lastDone ? formatDate(i.lastDone) : "—"}</p>
                {i.dueOn && <p>Next: {formatDate(i.dueOn)}</p>}
              </div>
              <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted">Dates come from filed documents and lab results. General guidance only; follow your doctors' advice.</p>
    </Card>
  );
}
