"use client";

import type { ReviewRequestedExam } from "@/lib/documents/review";
import { EXAM_GROUPS, EXAM_TYPE_CODES, EXAM_TYPES, SPECIALTIES, SPECIALTY_CODES } from "@/lib/domain/exams";
import { inputClass } from "@/components/ui";

/** Doctor and specialty, shown when reviewing or editing any document. */
export function DoctorFields(props: {
  doctorName: string;
  specialty: string;
  onChange: (patch: { doctorName?: string; specialty?: string }) => void;
}) {
  return (
    <>
      <label className="text-sm">
        <span className="mb-1 block text-ink-2">Doctor</span>
        <input value={props.doctorName} onChange={(e) => props.onChange({ doctorName: e.target.value })} placeholder="Who requested or wrote it" className={inputClass} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-ink-2">Specialty</span>
        <select value={props.specialty} onChange={(e) => props.onChange({ specialty: e.target.value })} className={inputClass}>
          <option value="">Not stated</option>
          {SPECIALTY_CODES.map((code) => <option key={code} value={code}>{SPECIALTIES[code]}</option>)}
        </select>
      </label>
    </>
  );
}

const EXAM_ROW_COLUMNS = "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_auto]";

/** The exams an exam request asks for: name, type and body area, editable. */
export function ExamListEditor({ exams, onChange }: { exams: ReviewRequestedExam[]; onChange: (exams: ReviewRequestedExam[]) => void }) {
  const update = (index: number, patch: Partial<ReviewRequestedExam>) =>
    onChange(exams.map((exam, i) => (i === index ? { ...exam, ...patch } : exam)));

  return (
    <div>
      <p className="mb-2 text-sm text-ink">
        <strong>{exams.length === 1 ? "1 exam requested." : `${exams.length} exams requested.`}</strong>{" "}
        <span className="text-ink-2">Check each name and type; they are used to organise your exam requests.</span>
      </p>
      {exams.length > 0 && (
        // Columns on wider screens; on phones each exam stacks: name, then type and body area.
        <div className="rounded-xl border border-border text-sm">
          <div className={`hidden gap-3 rounded-t-xl bg-surface-2 px-3 py-2 text-xs font-medium text-ink-2 sm:grid ${EXAM_ROW_COLUMNS}`}>
            <span>Exam</span><span>Type</span><span>Body area</span><span className="sr-only">Actions</span>
          </div>
          <ul className="divide-y divide-border">
            {exams.map((exam, i) => (
              <li key={i} className={`grid grid-cols-2 items-center gap-2 p-3 sm:gap-3 sm:px-3 sm:py-2 ${EXAM_ROW_COLUMNS}`}>
                <input
                  aria-label={`Exam ${i + 1}`} placeholder="Exam name" value={exam.exam_name}
                  onChange={(e) => update(i, { exam_name: e.target.value })}
                  className={`${inputClass} col-span-2 sm:col-span-1`}
                />
                <select aria-label={`Type of exam ${i + 1}`} value={exam.exam_type} onChange={(e) => update(i, { exam_type: e.target.value })} className={`${inputClass} col-span-2 sm:col-span-1`}>
                  {Object.entries(EXAM_GROUPS).map(([group, label]) => (
                    <optgroup key={group} label={label}>
                      {EXAM_TYPE_CODES.filter((code) => EXAM_TYPES[code].group === group).map((code) => (
                        <option key={code} value={code}>{EXAM_TYPES[code].label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  aria-label={`Body area for exam ${i + 1}`} placeholder="Body area" value={exam.body_site ?? ""}
                  onChange={(e) => update(i, { body_site: e.target.value || null })}
                  className={inputClass}
                />
                <button type="button" className="justify-self-end text-xs text-ink-2 hover:text-critical-ink" onClick={() => onChange(exams.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" className="mt-2 text-sm text-accent" onClick={() => onChange([...exams, { exam_name: "", exam_type: "blood_test", body_site: null }])}>
        + Add exam
      </button>
    </div>
  );
}

/** Exams as the API expects them: named ones only, trimmed. */
export function cleanExams(exams: ReviewRequestedExam[]): ReviewRequestedExam[] {
  return exams
    .map((e) => ({ exam_name: e.exam_name.trim(), exam_type: e.exam_type, body_site: e.body_site?.trim() || null }))
    .filter((e) => e.exam_name);
}
