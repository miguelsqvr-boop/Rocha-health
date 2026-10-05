import { memberPage } from "@/lib/member-page";
import { memberMedications } from "@/lib/data/queries";
import { formatDate } from "@/lib/format";
import { Card, EmptyState } from "@/components/ui";
import { AddMedicationForm } from "@/components/client/MemberForms2";

export async function MedicationsPage({ params, kind }: { params: Promise<{ memberId: string }>; kind: "medication" | "supplement" }) {
  const { subject, supabase, canWrite } = await memberPage(params);
  const all = (await memberMedications(supabase, subject.id)).filter((m) => m.kind === kind);
  const current = all.filter((m) => !m.ended_on);
  const past = all.filter((m) => m.ended_on);
  const label = kind === "medication" ? "Medications" : "Supplements";
  return (
    <div className="space-y-4">
      <Card title={`Current ${label.toLowerCase()}`}>
        {current.length === 0 ? <EmptyState title={`No ${label.toLowerCase()} recorded`} /> : (
          <ul className="divide-y divide-border text-sm">
            {current.map((m) => (
              <li key={m.id} className="flex flex-wrap gap-2 py-2">
                <span className="font-medium text-ink">{m.name}</span>
                <span className="text-ink-2">{[m.dose, m.frequency].filter(Boolean).join(" · ")}</span>
                {m.started_on && <span className="ml-auto text-xs text-ink-2">since {formatDate(m.started_on)}</span>}
              </li>
            ))}
          </ul>
        )}
        {canWrite && <div className="mt-4"><AddMedicationForm memberId={subject.id} kind={kind} /></div>}
      </Card>
      {past.length > 0 && (
        <Card title={`Past ${label.toLowerCase()}`}>
          <ul className="divide-y divide-border text-sm">
            {past.map((m) => (
              <li key={m.id} className="flex gap-2 py-2 text-ink-2">
                <span className="text-ink">{m.name}</span>{m.dose}
                <span className="ml-auto text-xs">{formatDate(m.started_on)} – {formatDate(m.ended_on)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
