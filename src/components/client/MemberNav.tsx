"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const SECTIONS = [
  ["", "Overview"],
  ["records", "Health Records"],
  ["labs", "Lab Results"],
  ["trends", "Trends"],
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
  const base = `/m/${memberId}`;
  return (
    <nav aria-label="Health sections">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col">
        {SECTIONS.map(([slug, label]) => {
          const href = slug ? `${base}/${slug}` : base;
          const active = slug ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm",
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
