"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cx } from "@/components/ui";

export const MEMBER_SECTIONS = [
  ["", "Overview"],
  ["records", "Health Records"],
  ["labs", "Lab Results"],
  ["trends", "Trends"],
  ["exam-requests", "Exam Requests"],
  ["sleep", "Sleep"],
  ["fitness", "Fitness"],
  ["body-composition", "Body Composition"],
  ["medications", "Medications"],
  ["supplements", "Supplements"],
  ["preventive-care", "Preventive Care"],
  ["longevity", "Longevity"],
  ["documents", "Documents"],
  ["assistant", "Assistant"],
  ["settings", "Settings"],
] as const;

export function MemberNav({ memberId }: { memberId: string }) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const base = `/m/${memberId}`;

  // On phones the sections scroll sideways: keep the current one in view.
  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>("[aria-current=page]");
    if (list && current && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
    }
  }, [pathname]);

  return (
    <nav aria-label="Health sections">
      <ul ref={listRef} className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:px-0">
        {MEMBER_SECTIONS.map(([slug, label]) => {
          const href = slug ? `${base}/${slug}` : base;
          const active = slug ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 text-sm lg:min-h-0 lg:py-1.5",
                  active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
