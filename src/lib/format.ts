// Display formatting: "12 Sep 2026". Month names are fixed rather than taken
// from the runtime's locale data, which varies ("Sep" vs "Sept").

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toDate(value: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function formatMonthYear(value: string): string {
  const date = toDate(value);
  return `${MONTHS_SHORT[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}, ${time}`;
}

export function formatValue(value: number | null, text: string | null, unit: string | null): string {
  const shown = value !== null ? String(Number(value.toPrecision(6))) : (text ?? "—");
  return unit ? `${shown} ${unit}` : shown;
}

export function formatRange(low: number | null, high: number | null, text: string | null): string {
  if (low !== null && high !== null) return `${low}–${high}`;
  if (low !== null) return `≥ ${low}`;
  if (high !== null) return `≤ ${high}`;
  return text ?? "";
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function daysAgo(value: string | null | undefined, today = new Date()): number | null {
  if (!value) return null;
  const t = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value).getTime();
  return Number.isNaN(t) ? null : Math.floor((today.getTime() - t) / 86_400_000);
}

export function relativeDays(value: string | null | undefined): string {
  const days = daysAgo(value);
  if (days === null) return "No data yet";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 31) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}
