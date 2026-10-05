import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { categoryLabels, listBiomarkers, listPreventiveRules } from "@/lib/data/queries";
import { CATEGORY_LABELS } from "@/lib/domain/taxonomy";
import { formatRange } from "@/lib/format";
import { env } from "@/lib/env";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { BiomarkerForm, CategoryLabelForm, PreventiveRuleForm } from "@/components/client/SettingsForms";

export const metadata: Metadata = { title: "Settings" };

const WEARABLES = ["Apple Health", "Oura", "WHOOP", "Garmin", "Fitbit", "Withings", "Polar"];

export default async function SettingsPage() {
  await requireSuperAdmin();
  const supabase = await createSupabaseServerClient();
  const [labels, biomarkers, rules] = await Promise.all([categoryLabels(supabase), listBiomarkers(supabase), listPreventiveRules(supabase)]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Health-data categories, biomarker definitions, preventive-care rules and integrations." />
      <div className="space-y-4">
        <Card title="Health-data categories">
          <p className="mb-3 text-sm text-ink-2">Documents are filed under these categories automatically. Rename them to suit the family.</p>
          <ul className="space-y-2">
            {Object.keys(CATEGORY_LABELS).map((code) => (
              <li key={code} className="flex items-center gap-3"><span className="w-32 text-xs text-muted">{code}</span><CategoryLabelForm code={code} label={labels[code] ?? code} /></li>
            ))}
          </ul>
        </Card>

        <Card title={`Biomarker definitions (${biomarkers.length})`}>
          <p className="mb-3 text-sm text-ink-2">Used to recognise lab results (including Portuguese names) and to chart trends. Lab-printed reference ranges always take precedence.</p>
          <details className="mb-4">
            <summary className="cursor-pointer text-sm text-accent">Show all definitions</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-border">
                  {biomarkers.map((b) => (
                    <tr key={b.code}>
                      <td className="py-1.5 pr-3 text-ink">{b.name}</td>
                      <td className="py-1.5 pr-3 text-xs text-ink-2">{b.category.replace("_", " ")}</td>
                      <td className="py-1.5 pr-3 tabular text-ink-2">{formatRange(b.reference_low, b.reference_high, null)} {b.default_unit}</td>
                      <td className="py-1.5 text-xs text-muted">{b.synonyms.slice(0, 4).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <BiomarkerForm />
        </Card>

        <Card title="Preventive-care rules">
          <p className="mb-3 text-sm text-ink-2">General screening guidance, used to suggest upcoming care. Adjust it with your doctors' advice.</p>
          <ul className="mb-4 divide-y divide-border text-sm">
            {rules.map((r) => (
              <li key={r.code} className="flex flex-wrap gap-2 py-1.5">
                <span className="text-ink">{r.title}</span>
                <span className="text-ink-2">every {r.interval_months} months</span>
                {r.sex && <Badge>{r.sex}</Badge>}
                {(r.min_age !== null || r.max_age !== null) && <Badge>{r.min_age ?? 0}–{r.max_age ?? "∞"} years</Badge>}
                {!r.active && <Badge tone="warning">off</Badge>}
              </li>
            ))}
          </ul>
          <PreventiveRuleForm />
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Integrations">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between"><span className="text-ink">Document reading (Claude)</span>{env.anthropicConfigured() ? <Badge tone="good">✓ Configured</Badge> : <Badge tone="serious">Missing API key</Badge>}</li>
              {WEARABLES.map((w) => (
                <li key={w} className="flex items-center justify-between"><span className="text-ink">{w}</span><Badge>Not yet available</Badge></li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Each member will connect their own wearables from their Settings. Connection tokens are stored where no signed-in user, including the Super Admin, can read them.</p>
          </Card>
          <Card title="Data imports & exports">
            <p className="text-sm text-ink-2">Bulk-import a pile of documents with the uploader; each person's records can be exported from their profile settings.</p>
            <div className="mt-3"><ButtonLink href="/admin/upload">Bulk upload documents</ButtonLink></div>
          </Card>
        </div>
      </div>
    </>
  );
}
