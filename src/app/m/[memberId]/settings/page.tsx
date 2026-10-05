import { memberPage } from "@/lib/member-page";
import { listMembers, memberWearables } from "@/lib/data/queries";
import { formatDate } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { SelfProfileForm } from "@/components/client/MemberForms2";

const WEARABLES = ["Apple Health", "Oura", "WHOOP", "Garmin", "Fitbit", "Withings", "Polar"];

export default async function MemberSettings({ params }: { params: Promise<{ memberId: string }> }) {
  const { subject, supabase, viewer, isSelf, ownView } = await memberPage(params);
  const [wearables, visible] = await Promise.all([memberWearables(supabase, subject.id), listMembers(supabase)]);
  const admins = viewer.isSuperAdmin && !viewer.viewAs ? visible.filter((m) => m.role === "super_admin" && m.status === "active").map((m) => m.display_name) : [];

  return (
    <div className="space-y-4">
      <Card title="Profile">
        {isSelf && !viewer.viewAs ? (
          <SelfProfileForm memberId={subject.id} displayName={subject.display_name} phone={subject.phone} />
        ) : (
          <p className="text-sm text-ink-2">{subject.display_name} edits their own display name and phone.</p>
        )}
        <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-ink-2">Full name</dt><dd className="text-ink">{subject.legal_name ?? "—"}</dd></div>
          <div><dt className="text-ink-2">Date of birth</dt><dd className="text-ink">{formatDate(subject.date_of_birth)}</dd></div>
          <div><dt className="text-ink-2">Email</dt><dd className="text-ink">{subject.email ?? "—"}</dd></div>
        </dl>
        {ownView && <p className="mt-3 text-xs text-muted">Name, date of birth and email are used to match documents to you. Ask the Super Admin to change them.</p>}
      </Card>
      <Card title="Who can see this information">
        <p className="text-sm text-ink-2">
          {subject.display_name} and the family's Super Admin{admins.length > 0 && ` (${admins.join(", ")})`}. No other family member can see it.
          Every view, download and change is recorded.
        </p>
      </Card>
      <Card title="Wearables">
        <ul className="space-y-2 text-sm">
          {WEARABLES.map((w) => {
            const connection = wearables.find((c) => c.provider === w.toLowerCase().replace(" ", "_"));
            return (
              <li key={w} className="flex items-center justify-between">
                <span className="text-ink">{w}</span>
                {connection ? <Badge tone="good">Connected</Badge> : <Badge>Not yet available</Badge>}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">Wearable data is private to {ownView ? "you" : subject.display_name} and the Super Admin, like the rest of the profile.</p>
      </Card>
      <Card title="Export">
        <p className="mb-3 text-sm text-ink-2">Download all structured records (documents list, lab results, medications, wellness) as a JSON file. Exports are logged.</p>
        <a href={`/api/members/${subject.id}/export`} className="inline-flex rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-2">Export health records</a>
      </Card>
    </div>
  );
}
