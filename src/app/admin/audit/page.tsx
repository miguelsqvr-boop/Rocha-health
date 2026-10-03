import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMembers } from "@/lib/data/queries";
import type { AuditRow } from "@/lib/data/types";
import { formatDateTime } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, cx, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Audit Log" };

const ACTION_GROUPS: Record<string, string> = {
  "": "All actions",
  "document.": "Documents (upload, file, move, delete)",
  "document.view": "Document views",
  "document.download": "Downloads",
  "health_result.": "Result corrections",
  "family_member.": "Profile changes",
  "member.": "Invitations & activation",
  "view_as.": "View as",
  "records.export": "Exports",
  "assistant.query": "Health assistant",
};

function device(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const os = /iPhone|iPad/.test(userAgent) ? "iPhone/iPad" : /Android/.test(userAgent) ? "Android" : /Mac OS X/.test(userAgent) ? "Mac" : /Windows/.test(userAgent) ? "Windows" : /Linux/.test(userAgent) ? "Linux" : null;
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox" : /Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : null;
  return [browser, os].filter(Boolean).join(" on ") || "Unknown device";
}

/** Before → after for edits. New rows are described by the summary alone; ids and bookkeeping columns are hidden. */
function Changes({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before) return null;
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .filter((k) => k !== "id" && !k.endsWith("_id") && !k.endsWith("_by") && !["created_at", "updated_at", "reviewed_at"].includes(k))
    .slice(0, 8);
  if (keys.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
      {keys.map((k) => (
        <li key={k}><span className="text-muted">{k.replace(/_/g, " ")}:</span> {before && k in before ? String(before[k] ?? "—") : "—"} → {after && k in after ? String(after[k] ?? "—") : "—"}</li>
      ))}
    </ul>
  );
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ member?: string; action?: string }> }) {
  await requireSuperAdmin();
  const { member, action = "" } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const members = await listMembers(supabase);
  const names = new Map(members.map((m) => [m.id, m.display_name]));

  let query = supabase
    .from("audit_log")
    .select("id, occurred_at, actor_name, acting_as_member_id, action, target_member_id, target_member_name, entity_type, entity_id, summary, before_data, after_data, metadata, ip_address, user_agent")
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (member) query = query.eq("target_member_id", member);
  if (action && action in ACTION_GROUPS) query = action.endsWith(".") ? query.like("action", `${action}%`) : query.eq("action", action);
  const { data } = await query;
  const rows = (data ?? []) as AuditRow[];

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every sensitive action in the family's records. Entries cannot be edited or deleted." />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="member" defaultValue={member ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">About anyone</option>
          {members.map((m) => <option key={m.id} value={m.id}>About {m.display_name}</option>)}
        </select>
        <select name="action" defaultValue={action} className={cx(inputClass, "w-auto")}>
          {Object.entries(ACTION_GROUPS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="rounded-xl border border-border bg-surface px-4 py-2 text-sm">Filter</button>
      </form>
      <Card>
        {rows.length === 0 ? <EmptyState title="No matching entries" /> : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="text-sm text-ink">
                    <strong>{r.actor_name ?? "System"}</strong>
                    {r.acting_as_member_id && <> <Badge tone="warning">viewing as {names.get(r.acting_as_member_id) ?? "member"}</Badge></>}
                    {" "}{r.summary ?? r.action}
                  </p>
                  <span className="ml-auto text-xs text-ink-2 tabular">{formatDateTime(r.occurred_at)}</span>
                </div>
                <p className="text-xs text-muted">
                  {r.action}{r.target_member_name && ` · about ${r.target_member_name}`}
                  {r.ip_address && ` · ${r.ip_address}`}{r.user_agent && <span title={r.user_agent}> · {device(r.user_agent)}</span>}
                  {typeof r.metadata?.reason === "string" && ` · reason: ${r.metadata.reason}`}
                  {r.metadata?.identity_override === true && " · identity confirmed manually"}
                </p>
                <Changes before={r.before_data} after={r.after_data} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
