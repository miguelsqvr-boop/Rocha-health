import Link from "next/link";
import type { ReactNode } from "react";
import type { Viewer } from "@/lib/auth/viewer";
import { ActionButton } from "@/components/client/ActionButton";
import { Avatar } from "@/components/ui";

const ADMIN_NAV = [
  { href: "/admin", label: "Family Health" },
  { href: "/admin/overview", label: "Family Overview" },
  { href: "/admin/upload", label: "Upload" },
  { href: "/admin/documents", label: "Documents" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/permissions", label: "Permissions" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
];

/**
 * Page chrome. The Family Admin navigation is rendered only for an active
 * Super Admin who is not in "View as"; the pages behind it check again on the
 * server and the data behind them is protected by RLS.
 */
export function AppShell({ viewer, children }: { viewer: Viewer & { member: NonNullable<Viewer["member"]> }; children: ReactNode }) {
  const showAdmin = viewer.isSuperAdmin && !viewer.viewAs;
  return (
    <div className="min-h-screen">
      {viewer.viewAs && (
        <div role="alert" className="sticky top-0 z-30 border-b-2 border-warning bg-warning/20 px-4 py-2">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink">
              <strong>Viewing as {viewer.viewAs.display_name}.</strong>{" "}
              <span className="text-ink-2">You see exactly what {viewer.viewAs.display_name} sees. Changes are disabled and this session is logged.</span>
            </p>
            <ActionButton method="DELETE" url="/api/view-as" variant="primary">Return to Super Admin</ActionButton>
          </div>
        </div>
      )}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
            <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden><rect width="32" height="32" rx="8" fill="var(--accent)" /><path d="M16 24s-7-4.4-7-9.5A3.9 3.9 0 0 1 16 12a3.9 3.9 0 0 1 7 2.5C23 19.6 16 24 16 24z" fill="var(--accent-fg)" /></svg>
            <span>{viewer.familyName ? `${viewer.familyName} Health` : "Rocha Health"}</span>
          </Link>
          <div className="flex items-center gap-3">
            {!viewer.viewAs && (
              <Link href={`/m/${viewer.member.id}`} className="hidden text-sm text-ink-2 hover:text-ink sm:inline">My Health</Link>
            )}
            <span className="flex items-center gap-2 text-sm text-ink-2">
              <Avatar name={viewer.member.display_name} color={viewer.member.avatar_color} size="sm" />
              <span className="hidden sm:inline">{viewer.member.display_name}{viewer.isSuperAdmin && " · Super Admin"}</span>
            </span>
            <form action="/auth/signout" method="post">
              <button className="text-sm text-ink-2 hover:text-ink">Sign out</button>
            </form>
          </div>
        </div>
        {showAdmin && (
          <nav aria-label="Family Admin" className="mx-auto max-w-7xl overflow-x-auto px-4">
            <ul className="flex gap-1 pb-2">
              {ADMIN_NAV.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
