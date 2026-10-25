"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { MEMBER_SECTIONS } from "./MemberNav";

interface NavLink {
  href: string;
  label: string;
}

// Links and the Menu button share one shape so their icons and labels line up.
const TAB = "flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] leading-none";

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {path}
  </svg>
);
const ICONS = {
  home: icon(<><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>),
  family: icon(<><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M15 14.5c2.8-.6 6 1.4 6 5.5" /></>),
  results: icon(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  upload: icon(<><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v4h16v-4" /></>),
  exams: icon(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" /></>),
  menu: icon(<><path d="M4 7h16M4 12h16M4 17h16" /></>),
};

/**
 * Phone navigation: a bar along the bottom with the main destinations, and a
 * Menu sheet with everything else. Larger screens use the header and side
 * navigation instead. Links only: every page checks access on the server.
 */
export function MobileNav({ selfId, admin, adminLinks }: { selfId: string; admin: boolean; adminLinks: NavLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const me = `/m/${selfId}`;

  // Close the menu after navigating, and with the Escape key.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const tabs = admin
    ? [
        { href: "/admin", label: "Family", icon: ICONS.family, exact: true },
        { href: me, label: "My Health", icon: ICONS.home, exact: false },
        { href: "/admin/upload", label: "Upload", icon: ICONS.upload, exact: true },
        { href: "/admin/exam-requests", label: "Exams", icon: ICONS.exams, exact: false },
      ]
    : [
        { href: me, label: "Home", icon: ICONS.home, exact: true },
        { href: `${me}/labs`, label: "Results", icon: ICONS.results, exact: false },
        { href: `${me}/documents?upload=1`, label: "Upload", icon: ICONS.upload, exact: false },
        { href: `${me}/exam-requests`, label: "Exams", icon: ICONS.exams, exact: false },
      ];
  // The most specific tab that matches the current page is the active one.
  const matches = (t: (typeof tabs)[number]) => {
    const path = t.href.split("?")[0];
    return t.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  };
  const activeHref = tabs.filter(matches).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((t) => {
            const active = t.href === activeHref;
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(TAB, active ? "text-accent" : "text-ink-2")}
                >
                  {t.icon}
                  {t.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              className={cx(TAB, open ? "text-accent" : "text-ink-2")}
            >
              {ICONS.menu}
              Menu
            </button>
          </li>
        </ul>
      </nav>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="mobile-menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-surface p-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-base font-semibold text-ink">Menu</p>
              <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl px-3 text-sm text-accent">Close</button>
            </div>
            {admin && <MenuSection title="Family Admin" links={adminLinks} pathname={pathname} />}
            <MenuSection
              title="My Health"
              links={MEMBER_SECTIONS.map(([slug, label]) => ({ href: slug ? `${me}/${slug}` : me, label }))}
              pathname={pathname}
            />
            <form action="/auth/signout" method="post" className="mt-3 border-t border-border pt-3">
              <button className="min-h-11 w-full rounded-xl px-3 text-left text-sm text-ink-2">Sign out</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function MenuSection({ title, links, pathname }: { title: string; links: NavLink[]; pathname: string }) {
  return (
    <section className="mt-3">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">{title}</h2>
      <ul className="mt-1 grid grid-cols-2 gap-1">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={pathname === l.href ? "page" : undefined}
              className={cx("flex min-h-11 items-center rounded-xl px-3 text-sm", pathname === l.href ? "bg-accent-soft font-medium text-accent" : "text-ink hover:bg-surface-2")}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
