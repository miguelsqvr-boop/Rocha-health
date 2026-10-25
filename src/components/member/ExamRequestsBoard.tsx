import Link from "next/link";
import type { ExamRequestRow } from "@/lib/data/types";
import {
  doctorKey,
  examTypeLabel,
  EXAM_TYPE_CODES,
  filterExamRequests,
  groupExamRequests,
  specialtyLabel,
  type ExamRequestFilters,
  type ExamRequestGrouping,
} from "@/lib/domain/exams";
import { formatDate } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, cx } from "@/components/ui";

export interface ExamRequestParams extends ExamRequestFilters {
  by?: string;
}

const GROUPINGS: { by: ExamRequestGrouping; label: string }[] = [
  { by: "date", label: "Date" },
  { by: "specialty", label: "Specialty" },
  { by: "doctor", label: "Doctor" },
  { by: "type", label: "Exam type" },
];

const chip = (active: boolean) =>
  cx("tap rounded-full border px-3 py-1 text-xs", active ? "border-accent bg-accent-soft text-accent" : "border-border text-ink-2 hover:text-ink");

/**
 * Exam requests, sorted by date, specialty, doctor or type of exam, with
 * filters for each. Everything comes from the URL (?by=, ?specialty=,
 * ?doctor=, ?type=, ?member=), so a view can be bookmarked or shared within
 * the family. The rows were read through RLS by the page.
 */
export function ExamRequestsBoard(props: {
  requests: ExamRequestRow[];
  basePath: string;
  params: ExamRequestParams;
  /** Family view: show whose request each one is, and filter by person. */
  members?: { id: string; display_name: string; avatar_color: string | null }[];
  /** Super Admin: link each request to its edit page. */
  canEdit: boolean;
}) {
  const { requests, basePath, params, members } = props;
  const by: ExamRequestGrouping = GROUPINGS.some((g) => g.by === params.by) ? (params.by as ExamRequestGrouping) : "date";
  const filters: ExamRequestFilters = { member: params.member, specialty: params.specialty, doctor: params.doctor, type: params.type };
  const shown = filterExamRequests(requests, filters);
  const sections = groupExamRequests(shown, by);
  const filtered = Boolean(filters.member || filters.specialty || filters.doctor || filters.type);

  const href = (patch: Partial<ExamRequestParams>) => {
    const next = { ...params, ...patch };
    const query = new URLSearchParams(Object.entries(next).filter((e): e is [string, string] => Boolean(e[1])));
    if (query.get("by") === "date") query.delete("by");
    const qs = query.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const toggle = (key: keyof ExamRequestFilters, value: string) => href({ [key]: filters[key] === value ? undefined : value });

  // Filter choices: only what appears in this person's (or family's) requests.
  const specialties = [...new Set(requests.map((r) => r.specialty ?? "none"))]
    .map((code) => ({ code, label: code === "none" ? "Not stated" : specialtyLabel(code) }))
    .sort((a, b) => (a.code === "none" ? 1 : b.code === "none" ? -1 : a.label.localeCompare(b.label)));
  const doctors = [...new Map(requests.map((r) => [doctorKey(r.doctor_name) || "none", r.doctor_name?.trim() || "Not stated"])).entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
  const types = EXAM_TYPE_CODES.filter((code) => requests.some((r) => r.requested_exams.some((e) => e.exam_type === code)));
  const names = new Map(members?.map((m) => [m.id, m]) ?? []);
  const examCount = shown.reduce((n, r) => n + r.requested_exams.length, 0);

  if (requests.length === 0) {
    return (
      <EmptyState title="No exam requests yet">
        Upload a doctor&apos;s exam request (requisição de exames). It is read, filed under the person it names, and listed here by
        specialty, date, doctor and type of exam.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-ink-2">
          {shown.length === 1 ? "1 request" : `${shown.length} requests`} · {examCount === 1 ? "1 exam" : `${examCount} exams`}
          {filtered && <> · <Link href={href({ member: undefined, specialty: undefined, doctor: undefined, type: undefined })} className="text-accent">Show all</Link></>}
        </p>
        <FilterRow label="Organise by">
          {GROUPINGS.map((g) => <Link key={g.by} href={href({ by: g.by })} className={chip(by === g.by)}>{g.label}</Link>)}
        </FilterRow>
        {members && members.length > 1 && (
          <FilterRow label="Person">
            {members.filter((m) => requests.some((r) => r.member_id === m.id)).map((m) => (
              <Link key={m.id} href={toggle("member", m.id)} className={chip(filters.member === m.id)}>{m.display_name}</Link>
            ))}
          </FilterRow>
        )}
        <FilterRow label="Specialty">
          {specialties.map((s) => <Link key={s.code} href={toggle("specialty", s.code)} className={chip(filters.specialty === s.code)}>{s.label}</Link>)}
        </FilterRow>
        <FilterRow label="Doctor">
          {doctors.map((d) => <Link key={d.key} href={toggle("doctor", d.key)} className={chip(filters.doctor === d.key)}>{d.label}</Link>)}
        </FilterRow>
        {types.length > 0 && (
          <FilterRow label="Exam type">
            {types.map((t) => <Link key={t} href={toggle("type", t)} className={chip(filters.type === t)}>{examTypeLabel(t)}</Link>)}
          </FilterRow>
        )}
      </div>

      {sections.length === 0 ? (
        <EmptyState title="No requests match these filters">
          <Link href={href({ member: undefined, specialty: undefined, doctor: undefined, type: undefined })} className="text-accent">Show all requests</Link>
        </EmptyState>
      ) : (
        sections.map((section) => (
          <section key={section.key || "none"} aria-labelledby={`exam-section-${section.key || "none"}`} className="space-y-3">
            <h2 id={`exam-section-${section.key || "none"}`} className="text-base font-semibold text-ink">
              {section.label} <span className="text-sm font-normal text-muted">{section.requests.length}</span>
            </h2>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {section.requests.map((r) => {
                const person = names.get(r.member_id);
                return (
                  <Card key={r.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-ink">
                          {person && <Avatar name={person.display_name} color={person.avatar_color} size="sm" />}
                          {person && <span>{person.display_name} ·</span>}
                          <span>{formatDate(r.document_date)}</span>
                        </p>
                        <p className="mt-1 text-sm text-ink-2">
                          {r.doctor_name ?? "Doctor not stated"} · {specialtyLabel(r.specialty)}
                          {r.provider && ` · ${r.provider}`}
                        </p>
                      </div>
                      <p className="flex gap-3 text-sm">
                        <a href={`/api/documents/${r.id}/file`} target="_blank" rel="noreferrer" className="tap text-accent">View</a>
                        <a href={`/api/documents/${r.id}/file?download=1`} className="tap text-accent">Download</a>
                        {props.canEdit && <Link href={`/admin/documents/${r.id}`} className="tap text-accent">Edit</Link>}
                      </p>
                    </div>
                    {r.requested_exams.length === 0 ? (
                      <p className="mt-3 text-sm text-ink-2">No exams were listed for this request.</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-border text-sm">
                        {r.requested_exams.map((e) => (
                          <li key={e.id} className={cx("flex flex-wrap items-center gap-2 py-1.5", filters.type && e.exam_type !== filters.type && "opacity-60")}>
                            <span className="text-ink">{e.exam_name}</span>
                            {e.body_site && <span className="text-ink-2">· {e.body_site}</span>}
                            <span className="ml-auto"><Badge tone={filters.type === e.exam_type ? "accent" : "neutral"}>{examTypeLabel(e.exam_type)}</Badge></span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-24 shrink-0 text-xs font-medium text-ink-2">{label}</span>
      {children}
    </div>
  );
}
