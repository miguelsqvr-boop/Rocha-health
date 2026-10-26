"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { describeProgress, EXAM_STATUSES, type ExamProgressValue, type ExamStatus } from "@/lib/domain/exams";
import { Badge, buttonClass, cx, inputClass } from "@/components/ui";
import { callApi } from "./api";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local time

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  if (status === "done") return <Badge tone="good"><span aria-hidden>✓</span>Done</Badge>;
  if (status === "scheduled") return <Badge tone="accent"><span aria-hidden>◷</span>Booked</Badge>;
  return <Badge><span aria-hidden>○</span>To do</Badge>;
}

/**
 * One requested exam: its status, when and where, and (for the person and
 * the Super Admin) a quick way to change them: tap Done or Booked, adjust the
 * date and place, Save.
 */
export function ExamProgressRow(props: {
  examId: string;
  name: string;
  typeLabel: string;
  bodySite: string | null;
  value: ExamProgressValue;
  places: string[];
  canUpdate: boolean;
  dimmed?: boolean;
}) {
  const [editing, setEditing] = useState<ExamStatus | null>(null);
  const v = props.value;
  return (
    <li className={cx("py-2", props.dimmed && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ExamStatusBadge status={v.status} />
        <span className="text-ink">{props.name}</span>
        {props.bodySite && <span className="text-ink-2">· {props.bodySite}</span>}
        <span className="ml-auto"><Badge>{props.typeLabel}</Badge></span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-xs text-ink-2">
        <span>{describeProgress(v, { withStatus: false })}</span>
        {v.notes && <span className="italic">“{v.notes}”</span>}
        {props.canUpdate && !editing && (
          <span className="ml-auto flex gap-1">
            {v.status !== "done" && (
              <button type="button" className="tap rounded-lg px-2 text-accent" onClick={() => setEditing("done")}>Mark done</button>
            )}
            {v.status === "to_do" && (
              <button type="button" className="tap rounded-lg px-2 text-accent" onClick={() => setEditing("scheduled")}>Booked</button>
            )}
            {v.status !== "to_do" && (
              <button type="button" className="tap rounded-lg px-2 text-accent" onClick={() => setEditing(v.status)}>Change</button>
            )}
          </span>
        )}
      </div>
      {editing && (
        <ProgressForm
          examIds={[props.examId]}
          initial={{ ...v, status: editing, event_date: v.event_date ?? (editing === "done" ? today() : null) }}
          places={props.places}
          onClose={() => setEditing(null)}
        />
      )}
    </li>
  );
}

/** "Mark all done" for the exams of one request that aren't done yet. */
export function MarkAllDone({ examIds, places }: { examIds: string[]; places: string[] }) {
  const [open, setOpen] = useState(false);
  if (examIds.length < 2) return null;
  return open ? (
    <ProgressForm
      examIds={examIds}
      initial={{ status: "done", event_date: today(), event_time: null, place: null, notes: null }}
      places={places}
      onClose={() => setOpen(false)}
      title={`All ${examIds.length} remaining exams`}
      keepNotes
    />
  ) : (
    <button type="button" className="tap mt-1 rounded-lg px-2 text-sm text-accent" onClick={() => setOpen(true)}>
      Mark all {examIds.length} as done…
    </button>
  );
}

function ProgressForm(props: {
  examIds: string[];
  initial: ExamProgressValue;
  places: string[];
  onClose: () => void;
  title?: string;
  /** Several exams at once: don't touch their individual notes. */
  keepNotes?: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const [status, setStatus] = useState<ExamStatus>(props.initial.status);
  const [date, setDate] = useState(props.initial.event_date ?? "");
  const [time, setTime] = useState(props.initial.event_time?.slice(0, 5) ?? "");
  const [place, setPlace] = useState(props.initial.place ?? "");
  const [notes, setNotes] = useState(props.initial.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const future = status === "done" && date > today();

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (future) return setError("An exam can't be done on a future date. Choose Booked instead.");
    setSaving(true);
    setError(null);
    const result = await callApi("POST", "/api/exams/progress", {
      examIds: props.examIds,
      status,
      date: status === "to_do" ? null : date || null,
      time: status === "scheduled" ? time || null : null,
      place: status === "to_do" ? null : place.trim() || null,
      ...(props.keepNotes ? {} : { notes: notes.trim() }),
    });
    setSaving(false);
    if (!result.ok) return setError(result.data.error ?? "Could not save.");
    props.onClose();
    router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-2 space-y-3 rounded-xl border border-border bg-surface-2 p-3 text-sm">
      {props.title && <p className="font-medium text-ink">{props.title}</p>}
      <div role="radiogroup" aria-label="Status" className="flex gap-1">
        {(["to_do", "scheduled", "done"] as const).map((s) => (
          <button
            key={s} type="button" role="radio" aria-checked={status === s}
            onClick={() => { setStatus(s); if (s === "done" && !date) setDate(today()); }}
            className={cx("tap flex-1 justify-center rounded-lg border px-3", status === s ? "border-accent bg-accent-soft font-medium text-accent" : "border-border bg-surface text-ink-2")}
          >
            {EXAM_STATUSES[s]}
          </button>
        ))}
      </div>
      {status !== "to_do" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[10rem_7rem_minmax(0,1fr)]">
          <label>
            <span className="mb-1 block text-xs text-ink-2">{status === "done" ? "Done on" : "Appointment"}</span>
            <input type="date" value={date} max={status === "done" ? today() : undefined} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          {status === "scheduled" ? (
            <label>
              <span className="mb-1 block text-xs text-ink-2">Time</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </label>
          ) : <span className="hidden sm:block" />}
          <label className="col-span-2 sm:col-span-1">
            <span className="mb-1 block text-xs text-ink-2">Where</span>
            <input list={listId} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Hospital, clinic or lab" className={inputClass} />
            <datalist id={listId}>{props.places.map((p) => <option key={p} value={p} />)}</datalist>
          </label>
        </div>
      )}
      {!props.keepNotes && (
        <label className="block">
          <span className="mb-1 block text-xs text-ink-2">Note (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fasting, bring the request, results by email" maxLength={500} className={inputClass} />
        </label>
      )}
      {error && <p role="alert" className="text-critical-ink">{error}</p>}
      <div className="flex gap-2">
        <button disabled={saving} className={buttonClass.primary}>{saving ? "Saving…" : "Save"}</button>
        <button type="button" onClick={props.onClose} className={buttonClass.secondary}>Cancel</button>
      </div>
    </form>
  );
}
