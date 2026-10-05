import Link from "next/link";
import { memberPage } from "@/lib/member-page";
import { memberResults } from "@/lib/data/queries";
import { LAB_DOMAINS } from "@/lib/domain/health-summary";
import { formatDate, formatRange, formatValue } from "@/lib/format";
import { Card, EmptyState, FlagBadge } from "@/components/ui";
import { ResultEditor } from "@/components/client/DocumentAdmin";
import { RequestCorrection } from "@/components/client/MemberForms2";

export default async function LabsPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { subject, supabase, viewer, canWrite } = await memberPage(params);
  const results = await memberResults(supabase, subject.id);
  const latest = new Map<string, (typeof results)[number]>();
  for (const r of results) {
    const key = r.biomarker?.code ?? r.analyte_name.toLowerCase();
    if (!latest.has(key)) latest.set(key, r);
  }
  const groups = [...LAB_DOMAINS, { code: "other", label: "Other results" }].map((d) => ({
    ...d,
    rows: [...latest.values()].filter((r) => (r.biomarker?.category ?? "other") === d.code || (d.code === "other" && !LAB_DOMAINS.some((x) => x.code === r.biomarker?.category))),
  })).filter((g) => g.rows.length > 0);
  const isAdmin = viewer.isSuperAdmin && !viewer.viewAs;

  if (results.length === 0) return <Card title="Lab Results"><EmptyState title="No lab results yet">Results appear here when a lab document is filed.</EmptyState></Card>;
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <Card key={g.code} title={g.label}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr><th className="py-1.5 pr-3 font-medium">Test</th><th className="py-1.5 pr-3 font-medium">Latest</th><th className="py-1.5 pr-3 font-medium">Reference</th><th className="py-1.5 pr-3 font-medium">Date</th><th /></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {g.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/m/${subject.id}/trends?test=${encodeURIComponent(r.biomarker?.code ?? r.analyte_name)}`} className="text-ink hover:text-accent">{r.biomarker?.name ?? r.analyte_name}</Link>
                    </td>
                    <td className="py-2 pr-3 tabular text-ink"><span className="mr-2">{formatValue(r.value_numeric, r.value_text, r.unit)}</span><FlagBadge flag={r.flag} /></td>
                    <td className="py-2 pr-3 tabular text-ink-2">{formatRange(r.reference_low, r.reference_high, r.reference_text)}</td>
                    <td className="py-2 pr-3 text-ink-2">{formatDate(r.result_date)}</td>
                    <td className="py-2 text-right">
                      {isAdmin ? <ResultEditor resultId={r.id} value={r.value_numeric} text={r.value_text} unit={r.unit} low={r.reference_low} high={r.reference_high} flag={r.flag} />
                        : canWrite ? <RequestCorrection memberId={subject.id} entityType="health_result" entityId={r.id} label={`${r.biomarker?.name ?? r.analyte_name} on ${formatDate(r.result_date)}`} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  );
}
