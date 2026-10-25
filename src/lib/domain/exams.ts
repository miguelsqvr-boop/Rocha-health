// Exam requests (requisições / pedidos de exames): the doctor's specialty and
// the type of each requested exam, and how the Exam Requests page sorts them.
// Codes are stored in the database (documents.specialty,
// requested_exams.exam_type); labels can change freely.

import { normalizeText } from "./names";

export const SPECIALTIES = {
  general_practice: "General practice / family medicine",
  internal_medicine: "Internal medicine",
  pediatrics: "Paediatrics",
  cardiology: "Cardiology",
  dermatology: "Dermatology",
  endocrinology: "Endocrinology",
  gastroenterology: "Gastroenterology",
  gynecology: "Gynaecology & obstetrics",
  hematology: "Haematology",
  infectious_diseases: "Infectious diseases",
  nephrology: "Nephrology",
  neurology: "Neurology",
  oncology: "Oncology",
  ophthalmology: "Ophthalmology",
  orthopedics: "Orthopaedics",
  otolaryngology: "Ear, nose & throat (ENT)",
  psychiatry: "Psychiatry",
  pulmonology: "Pulmonology",
  rheumatology: "Rheumatology",
  urology: "Urology",
  allergy: "Allergy & immunology",
  physical_medicine: "Physical medicine & rehabilitation",
  sports_medicine: "Sports medicine",
  occupational_health: "Occupational health",
  surgery: "Surgery",
  dentistry: "Dentistry",
  nutrition: "Nutrition",
  other: "Other",
} as const;

export type Specialty = keyof typeof SPECIALTIES;
export const SPECIALTY_CODES = Object.keys(SPECIALTIES) as Specialty[];

export function isSpecialty(value: unknown): value is Specialty {
  return typeof value === "string" && value in SPECIALTIES;
}

export function specialtyLabel(code: string | null | undefined): string {
  return isSpecialty(code) ? SPECIALTIES[code] : "Specialty not stated";
}

export const EXAM_GROUPS = {
  lab: "Lab tests",
  imaging: "Imaging",
  heart: "Heart",
  other: "Other exams",
} as const;

export const EXAM_TYPES = {
  blood_test: { label: "Blood test", group: "lab" },
  urine_test: { label: "Urine test", group: "lab" },
  other_lab: { label: "Other lab test", group: "lab" },
  xray: { label: "X-ray", group: "imaging" },
  ultrasound: { label: "Ultrasound", group: "imaging" },
  ct_scan: { label: "CT scan", group: "imaging" },
  mri: { label: "MRI", group: "imaging" },
  mammogram: { label: "Mammogram", group: "imaging" },
  dexa_scan: { label: "Bone density (DEXA)", group: "imaging" },
  other_imaging: { label: "Other imaging", group: "imaging" },
  ecg: { label: "ECG", group: "heart" },
  echocardiogram: { label: "Echocardiogram", group: "heart" },
  holter: { label: "Holter / BP monitoring", group: "heart" },
  stress_test: { label: "Stress test", group: "heart" },
  endoscopy: { label: "Endoscopy / colonoscopy", group: "other" },
  pathology: { label: "Biopsy / cytology", group: "other" },
  pulmonary_function: { label: "Lung function", group: "other" },
  eye_exam: { label: "Eye exam", group: "other" },
  hearing_test: { label: "Hearing test", group: "other" },
  sleep_study: { label: "Sleep study", group: "other" },
  other: { label: "Other", group: "other" },
} as const satisfies Record<string, { label: string; group: keyof typeof EXAM_GROUPS }>;

export type ExamType = keyof typeof EXAM_TYPES;
export const EXAM_TYPE_CODES = Object.keys(EXAM_TYPES) as ExamType[];

export function isExamType(value: unknown): value is ExamType {
  return typeof value === "string" && value in EXAM_TYPES;
}

export function examTypeLabel(code: string | null | undefined): string {
  return isExamType(code) ? EXAM_TYPES[code].label : EXAM_TYPES.other.label;
}

/** "Dra. Ana  Costa" and "ana costa" are the same doctor. */
export function doctorKey(name: string | null | undefined): string {
  const words = normalizeText(name ?? "").split(" ").filter((w) => w && !["dr", "dra", "prof", "professor", "doutor", "doutora"].includes(w));
  return words.join(" ");
}

export interface RequestedExamLike {
  exam_name: string;
  exam_type: string;
  body_site: string | null;
}

export interface ExamRequestLike {
  id: string;
  member_id: string;
  document_date: string | null;
  doctor_name: string | null;
  specialty: string | null;
  requested_exams: RequestedExamLike[];
}

export type ExamRequestGrouping = "date" | "specialty" | "doctor" | "type";

export interface ExamRequestFilters {
  member?: string;
  specialty?: string;
  doctor?: string;
  type?: string;
}

/** Requests that match every filter given (a doctor filter is a doctorKey). */
export function filterExamRequests<R extends ExamRequestLike>(requests: R[], filters: ExamRequestFilters): R[] {
  return requests.filter((r) =>
    (!filters.member || r.member_id === filters.member) &&
    (!filters.specialty || (r.specialty ?? "") === (filters.specialty === "none" ? "" : filters.specialty)) &&
    (!filters.doctor || doctorKey(r.doctor_name) === (filters.doctor === "none" ? "" : filters.doctor)) &&
    (!filters.type || r.requested_exams.some((e) => e.exam_type === filters.type)),
  );
}

export interface ExamRequestSection<R> {
  key: string;
  label: string;
  requests: R[];
}

/**
 * Sections for the Exam Requests page. Requests stay newest first inside each
 * section. By type, a request appears under every type it asks for.
 */
export function groupExamRequests<R extends ExamRequestLike>(requests: R[], by: ExamRequestGrouping): ExamRequestSection<R>[] {
  const sorted = [...requests].sort((a, b) => (b.document_date ?? "").localeCompare(a.document_date ?? ""));
  const sections = new Map<string, ExamRequestSection<R>>();
  const add = (key: string, label: string, request: R) => {
    const section = sections.get(key) ?? { key, label, requests: [] };
    if (!section.requests.includes(request)) section.requests.push(request);
    sections.set(key, section);
  };
  for (const r of sorted) {
    if (by === "date") {
      const year = r.document_date?.slice(0, 4);
      add(year ?? "undated", year ?? "Undated", r);
    } else if (by === "specialty") {
      add(r.specialty ?? "", specialtyLabel(r.specialty), r);
    } else if (by === "doctor") {
      add(doctorKey(r.doctor_name), r.doctor_name?.trim() || "Doctor not stated", r);
    } else {
      const types: ExamType[] = r.requested_exams.length ? r.requested_exams.map((e) => (isExamType(e.exam_type) ? e.exam_type : "other")) : ["other"];
      for (const t of types) add(t, EXAM_TYPES[t].label, r);
    }
  }
  const list = [...sections.values()];
  if (by === "date") return list.sort((a, b) => (a.key === "undated" ? 1 : b.key === "undated" ? -1 : b.key.localeCompare(a.key)));
  if (by === "type") return list.sort((a, b) => EXAM_TYPE_CODES.indexOf(a.key as ExamType) - EXAM_TYPE_CODES.indexOf(b.key as ExamType));
  // Specialty and doctor: alphabetical, "not stated" last.
  return list.sort((a, b) => (a.key === "" ? 1 : b.key === "" ? -1 : a.label.localeCompare(b.label)));
}
