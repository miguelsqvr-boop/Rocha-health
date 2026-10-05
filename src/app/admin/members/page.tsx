import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMembers } from "@/lib/data/queries";
import { formatDate } from "@/lib/format";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui";
import { MemberProfileForm } from "@/components/client/MemberForms";

export const metadata: Metadata = { title: "Members" };

const STATUS_LABEL = { not_invited: "No login yet", invited: "Invited", active: "Active", deactivated: "Deactivated" } as const;

export default async function MembersPage() {
  await requireSuperAdmin();
  const supabase = await createSupabaseServerClient();
  const members = await listMembers(supabase);
  return (
    <>
      <PageHeader title="Family members" subtitle="Each person has their own private account and owns their own health profile." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/members/${m.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:text-accent">
                  <Avatar name={m.display_name} color={m.avatar_color} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{m.display_name} {m.legal_name && <span className="font-normal text-ink-2">· {m.legal_name}</span>}</p>
                    <p className="text-xs text-ink-2">{m.email ?? "No email"}{m.date_of_birth && ` · born ${formatDate(m.date_of_birth)}`}</p>
                  </div>
                  {m.role === "super_admin" && <Badge tone="accent">Super Admin</Badge>}
                  <Badge tone={m.status === "active" ? "good" : m.status === "deactivated" ? "critical" : "neutral"}>{STATUS_LABEL[m.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Add a family member" className="lg:col-span-2">
          <MemberProfileForm />
        </Card>
      </div>
    </>
  );
}
