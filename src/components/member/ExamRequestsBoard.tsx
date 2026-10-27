import Link from "next/link";
import type { ExamRequestRow, ResultDocumentRow } from "@/lib/data/types";
import {
  doctorKey,
  examStatusCounts,
  examTypeLabel,
  EXAM_STATUS_CODES,
  EXAM_STATUSES,
  EXAM_TYPE_CODES,
  filterExamRequests,
  groupExamRequests,
  specialtyLabel,
  type ExamRequestFilters,
  type ExamRequestGrouping,
} from "@/lib/domain/exams";
import { formatDate } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, cx } from "@/components/ui";
import { ExamProgressRow, FindResults, MarkAllDone, type ResultChoice } from "@/components/client/ExamProgress";
import { documentTypeInfo } from "@/lib/domain/taxonomy";

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
 * filters for each and for progress (to do, booked, done). Everything comes
 * from the URL (?by=, ?specialty=, ?doctor=, ?type=, ?status=, ?member=), so
 * a view can be bookmarked. The rows were read through RLS by the page. Each
 * exam shows whether it was done, when and where, and can be updated in place.
 */
export function ExamRequestsBoard(props: {
  requests: ExamRequestRow[];
  basePath: string;
  params: ExamRequestParams;
  /** Family view: show whose request each one is, and filter by person. */
  members?: { id: string; display_name: string; avatar_color: string | null }[];
  /** Super Admin: link each request to its edit page. */
  canEdit: boolean;
  /** Who may record progress, by member id (the person and the Super Admin). */
  canUpdate: (memberId: string) => boolean;
  /** Filed documents that can be results (to show and choose linked results). */
  results: ResultDocumentRow[];
}) {
  const { requests, basePath, params, members } = props;
  const by: ExamRequestGrouping = GROUPINGS.some((g) => g.by === params.by) ? (params.by as ExamRequestGrouping) : "date";
  const filters: ExamRequestFilters = { member: params.member, specialty: params.specialty, doctor: params.doctor, type: params.type, status: params.status };
  const shown = filterExamRequests(requests, filters);
  const sections = groupExamRequests(shown, by);
  const filtered = Boolean(filters.member || filters.specialty || filters.doctor || filters.type || filters.status);
  const clearFilters = { member: undefined, specialty: undefined, doctor: undefined, type: undefined, status: undefined };

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
  const choice = (d: ResultDocumentRow): ResultChoice => ({ id: d.id, label: d.title ?? documentTypeInfo(d.document_type).label, document_date: d.document_date });
  const resultById = new Map(props.results.map((d) => [d.id, choice(d)]));
  // A request's possible results: the person's documents from a week before it on.
  const choicesFor = (r: ExamRequestRow) => {
    const from = r.document_date ? new Date(Date.parse(`${r.document_date}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10) : "";
    return props.results.filter((d) => d.member_id === r.member_id && (!from || (d.document_date ?? "") >= from)).map(choice);
  };
  const examCount = shown.reduce((n, r) => n + r.requested_exams.length, 0);
  const progress = examStatusCounts(shown.flatMap((r) => r.requested_exams));
  // Places already used, so "where" is usually one tap.
  const places = [...new Set([
    ...requests.flatMap((r) => r.requested_exams.map((e) => e.place)),
    ...requests.map((r) => r.provider),
  ].filter((p): p is string => Boolean(p?.trim())))].sort((a, b) => a.localeCompare(b));

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
          {shown.length === 1 ? "1 request" : `${shown.length} requests`} · {examCount === 1 ? "1 exam" : `${examCount} exams`}:{" "}
          <strong className="font-medium text-ink">{progress.to_do} to do</strong>, {progress.scheduled} booked, {progress.done} done
          {filtered && <> · <Link href={href(clearFilters)} className="text-accent">Show all</Link></>}
        </p>
        <FilterRow label="Progress">
          {EXAM_STATUS_CODES.map((s) => (
            <Link key={s} href={toggle("status", s)} className={chip(filters.status === s)}>
              {EXAM_STATUSES[s]} <span className="ml-1 text-muted">{examStatusCounts(requests.flatMap((r) => r.requested_exams))[s]}</span>
            </Link>
          ))}
        </FilterRow>
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
          <Link href={href(clearFilters)} className="text-accent">Show all requests</Link>
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
                const counts = examStatusCounts(r.requested_exams);
                const total = r.requested_exams.length;
                const canUpdate = props.canUpdate(r.member_id);
                const choices = choicesFor(r);
                const open = r.requested_exams.filter((e) => e.status !== "done");
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
                        {total > 0 && (
                          <p className="mt-1">
                            {counts.done === total
                              ? <Badge tone="good"><span aria-hidden>✓</span>All done</Badge>
                              : <Badge tone={counts.to_do > 0 ? "warning" : "accent"}>{counts.done} of {total} done{counts.scheduled > 0 && ` · ${counts.scheduled} booked`}</Badge>}
                          </p>
                        )}
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
                      <>
                        <ul className="mt-3 divide-y divide-border text-sm">
                          {r.requested_exams.map((e) => (
                            <ExamProgressRow
                              key={e.id}
                              examId={e.id}
                              name={e.exam_name}
                              typeLabel={examTypeLabel(e.exam_type)}
                              bodySite={e.body_site}
                              value={{ status: e.status, event_date: e.event_date, event_time: e.event_time, place: e.place, notes: e.notes }}
                              places={places}
                              canUpdate={canUpdate}
                              dimmed={Boolean((filters.type && e.exam_type !== filters.type) || (filters.status && e.status !== filters.status))}
                              resultDocumentId={e.result_document_id}
                              result={e.result_document_id ? (resultById.get(e.result_document_id) ?? null) : null}
                              resultChoices={choices}
                            />
                          ))}
                        </ul>
                        {canUpdate && open.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <FindResults requestId={r.id} />
                            <MarkAllDone examIds={open.map((e) => e.id)} places={places} />
                          </div>
                        )}
                      </>
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
