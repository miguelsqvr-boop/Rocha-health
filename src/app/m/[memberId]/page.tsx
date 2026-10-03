import Link from "next/link";
import { memberPage } from "@/lib/member-page";
import {
  listPreventiveRules, memberDocuments, memberPreventiveCompletions, memberResults, memberTimeline, memberWellness, unreadNotifications,
} from "@/lib/data/queries";
import { LAB_DOMAINS, fitnessStatus, labDomainStatus, sleepStatus, seriesByBiomarker } from "@/lib/domain/health-summary";
import { preventiveItems } from "@/lib/domain/preventive";
import { formatDate, formatValue } from "@/lib/format";
import { Badge, Card, EmptyState, FlagBadge, StatusPill } from "@/components/ui";

export default async function MemberOverview({ params }: { params: Promise<{ memberId: string }> }) {
  const { subject, supabase, ownView } = await memberPage(params);
  const [results, wellness, docs, rules, completions, timeline, notifications] = await Promise.all([
    memberResults(supabase, subject.id),
    memberWellness(supabase, subject.id, 60),
    memberDocuments(supabase, subject.id),
    listPreventiveRules(supabase),
    memberPreventiveCompletions(supabase, subject.id),
    memberTimeline(supabase, subject.id, 8),
    ownView ? unreadNotifications(supabase, subject.id) : Promise.resolve([]),
  ]);
  const points = results.map((r) => ({
    biomarker_code: r.biomarker?.code ?? null, analyte_name: r.analyte_name, category: r.biomarker?.category ?? null,
    result_date: r.result_date, value: r.value_numeric, low: r.reference_low, high: r.reference_high,
  }));
  const latestFlagged = [...seriesByBiomarker(points).values()].map((s) => s[0])
    .map((p) => results.find((r) => r.result_date === p.result_date && (r.biomarker?.code ?? r.analyte_name.toLowerCase()) === (p.biomarker_code ?? p.analyte_name.toLowerCase())))
    .filter((r) => r && r.flag && r.flag !== "normal");
  const due = preventiveItems({
    member: subject, rules, documents: docs,
    results: points.map((p) => ({ biomarker_code: p.biomarker_code, result_date: p.result_date })),
    completions,
  }).filter((i) => i.status !== "up_to_date");
  const base = `/m/${subject.id}`;

  return (
    <div className="space-y-4">
      {notifications.filter((n) => !n.read_at).length > 0 && (
        <Card title="New in your records">
          <ul className="space-y-1 text-sm">
            {notifications.filter((n) => !n.read_at).slice(0, 5).map((n) => (
              <li key={n.id}><Link href={n.link ?? base} className="text-ink hover:text-accent">{n.title}</Link> <span className="text-xs text-ink-2">· {formatDate(n.created_at)}</span></li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="Health areas">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {LAB_DOMAINS.map((d) => (
            <div key={d.code} className="flex items-center justify-between gap-2">
              <dt className="text-sm text-ink-2">{d.label}</dt>
              <dd><StatusPill status={labDomainStatus(points.filter((p) => p.category === d.code))} /></dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2"><dt className="text-sm text-ink-2">Sleep</dt><dd><StatusPill status={sleepStatus(wellness)} /></dd></div>
          <div className="flex items-center justify-between gap-2"><dt className="text-sm text-ink-2">Fitness</dt><dd><StatusPill status={fitnessStatus(wellness)} /></dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">Based on lab reference ranges and your own previous results. Not a diagnosis.</p>
      </Card>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Latest results outside the reference range" action={<Link href={`${base}/labs`} className="text-sm text-accent">All results</Link>}>
          {latestFlagged.length === 0 ? <EmptyState title="Nothing outside the reference range" /> : (
            <ul className="divide-y divide-border text-sm">
              {latestFlagged.map((r) => r && (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <span className="text-ink">{r.biomarker?.name ?? r.analyte_name}</span>
                  <span className="tabular text-ink">{formatValue(r.value_numeric, r.value_text, r.unit)}</span>
                  <FlagBadge flag={r.flag} />
                  <span className="ml-auto text-xs text-ink-2">{formatDate(r.result_date)}</span>
                </li>
              ))}
            </ul>
          )}
          {latestFlagged.length > 0 && <p className="mt-3 text-xs text-muted">Worth discussing with a doctor, especially if it persists.</p>}
        </Card>
        <Card title="Preventive care" action={<Link href={`${base}/preventive-care`} className="text-sm text-accent">See all</Link>}>
          {due.length === 0 ? <EmptyState title="All up to date" /> : (
            <ul className="divide-y divide-border text-sm">
              {due.slice(0, 6).map((i) => (
                <li key={i.rule.code} className="flex items-center gap-3 py-2">
                  <span className="text-ink">{i.rule.title}</span>
                  <span className="ml-auto">
                    {i.status === "overdue" && <Badge tone="serious">Overdue · {formatDate(i.dueOn)}</Badge>}
                    {i.status === "due_soon" && <Badge tone="warning">Due {formatDate(i.dueOn)}</Badge>}
                    {i.status === "no_record" && <Badge>No record yet</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Timeline" className="lg:col-span-2" action={<Link href={`${base}/records`} className="text-sm text-accent">Health records</Link>}>
          {timeline.length === 0 ? <EmptyState title="No records yet" /> : (
            <ol className="relative space-y-3 border-l border-border pl-4">
              {timeline.map((e) => (
                <li key={`${e.kind}-${e.ref_id}`} className="text-sm">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-surface bg-accent" aria-hidden />
                  <p className="text-ink">{e.title}{e.detail && <span className="text-ink-2"> · {e.detail}</span>}</p>
                  <p className="text-xs text-ink-2">{formatDate(e.event_date)} · {String(e.kind).replace(/_/g, " ")}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
