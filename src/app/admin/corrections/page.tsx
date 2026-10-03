import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMembers } from "@/lib/data/queries";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/client/ActionButton";

export const metadata: Metadata = { title: "Correction requests" };

export default async function CorrectionsPage() {
  await requireSuperAdmin();
  const supabase = await createSupabaseServerClient();
  const [members, { data }] = await Promise.all([
    listMembers(supabase),
    supabase.from("correction_requests").select("id, member_id, entity_type, entity_id, message, status, resolution_note, created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  const names = new Map(members.map((m) => [m.id, m.display_name]));
  return (
    <>
      <PageHeader title="Correction requests" subtitle="Family members can ask for their records to be corrected." />
      <Card>
        {(data ?? []).length === 0 ? <EmptyState title="No correction requests" /> : (
          <ul className="divide-y divide-border">
            {(data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink"><strong>{names.get(c.member_id)}</strong>: {c.message}</p>
                  <p className="text-xs text-ink-2">
                    {formatDateTime(c.created_at)} · {c.entity_type.replace("_", " ")}
                    {c.entity_type === "document" && c.entity_id && <> · <Link className="text-accent" href={`/admin/documents/${c.entity_id}`}>open document</Link></>}
                    {c.entity_type === "health_result" && <> · <Link className="text-accent" href={`/m/${c.member_id}/labs`}>open lab results</Link></>}
                  </p>
                </div>
                {c.status === "open" ? (
                  <span className="flex gap-2">
                    <ActionButton method="PATCH" url={`/api/corrections/${c.id}`} body={{ status: "resolved", resolutionNote: null }} variant="primary">Mark corrected</ActionButton>
                    <ActionButton method="PATCH" url={`/api/corrections/${c.id}`} body={{ status: "rejected", resolutionNote: null }}>Decline</ActionButton>
                  </span>
                ) : <Badge tone={c.status === "resolved" ? "good" : "neutral"}>{c.status}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
