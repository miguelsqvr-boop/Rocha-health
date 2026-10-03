import Link from "next/link";
import type { ReactNode } from "react";
import { initials } from "@/lib/format";

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cx("rounded-2xl border border-border bg-surface p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ButtonLink({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: "primary" | "secondary"; className?: string }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
        variant === "primary" ? "bg-accent text-accent-fg hover:opacity-90" : "border border-border bg-surface text-ink hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export const buttonClass = {
  primary: "inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50",
  secondary: "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-surface-2 disabled:opacity-50",
  danger: "inline-flex items-center justify-center gap-2 rounded-xl border border-critical/40 bg-surface px-4 py-2 text-sm font-medium text-critical-ink transition hover:bg-critical/10 disabled:opacity-50",
};

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warning" | "serious" | "critical" }) {
  const tones = {
    neutral: "bg-surface-2 text-ink-2",
    accent: "bg-accent-soft text-accent",
    good: "bg-good/10 text-good-ink",
    warning: "bg-warning/15 text-warning-ink",
    serious: "bg-serious/15 text-serious-ink",
    critical: "bg-critical/10 text-critical-ink",
  };
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

const STATUS_STYLE: Record<string, { tone: "good" | "warning" | "serious" | "neutral" | "accent"; icon: string }> = {
  "In range": { tone: "good", icon: "✓" },
  Stable: { tone: "good", icon: "✓" },
  Good: { tone: "good", icon: "✓" },
  Improving: { tone: "accent", icon: "↗" },
  Fair: { tone: "warning", icon: "•" },
  Low: { tone: "serious", icon: "!" },
  Declining: { tone: "serious", icon: "↘" },
  "Needs attention": { tone: "serious", icon: "!" },
  "—": { tone: "neutral", icon: "" },
};

/** Status always pairs an icon and a word with its colour. */
export function StatusPill({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? { tone: "neutral" as const, icon: "" };
  return (
    <Badge tone={style.tone}>
      {style.icon && <span aria-hidden>{style.icon}</span>}
      {status === "—" ? "No data" : status}
    </Badge>
  );
}

export function FlagBadge({ flag }: { flag: string | null }) {
  if (!flag || flag === "normal") return null;
  const label = flag === "high" ? "High" : flag === "low" ? "Low" : "Abnormal";
  return <Badge tone="serious"><span aria-hidden>{flag === "high" ? "▲" : flag === "low" ? "▼" : "!"}</span>{label}</Badge>;
}

export function Avatar({ name, color, size = "md" }: { name: string; color?: string | null; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-16 w-16 text-xl" };
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", sizes[size], !color && "bg-accent-soft text-accent")}
      style={color ? { background: color, color: "#fff" } : undefined}
    >
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value}</p>
      {hint && <p className="text-xs text-ink-2">{hint}</p>}
    </div>
  );
}
