// Document types and how documents are filed. The filing path is what the
// family sees, e.g. Miguel → Health Records → Laboratory → Blood Tests → 2026 → September.
// Category labels can be renamed by the Super Admin (health_categories table);
// the defaults below are used when no override exists.

export const CATEGORY_LABELS = {
  laboratory: "Laboratory",
  imaging: "Imaging",
  cardiology: "Cardiology",
  consultations: "Consultations",
  procedures: "Procedures",
  prescriptions: "Medications & Prescriptions",
  vaccinations: "Vaccinations",
  dental: "Dental",
  vision: "Vision",
  sleep: "Sleep",
  fitness: "Fitness & Body Composition",
  other: "Other",
} as const;

export type CategoryCode = keyof typeof CATEGORY_LABELS;

interface DocumentTypeInfo {
  label: string;
  plural: string;
  category: CategoryCode;
  /** Whether this document type usually contains numeric results to extract. */
  hasResults: boolean;
}

export const DOCUMENT_TYPES = {
  blood_test: { label: "Blood Test", plural: "Blood Tests", category: "laboratory", hasResults: true },
  urine_test: { label: "Urine Test", plural: "Urine Tests", category: "laboratory", hasResults: true },
  pathology: { label: "Pathology Report", plural: "Pathology", category: "laboratory", hasResults: false },
  genetic_test: { label: "Genetic Test", plural: "Genetic Tests", category: "laboratory", hasResults: false },
  xray: { label: "X-ray", plural: "X-rays", category: "imaging", hasResults: false },
  ultrasound: { label: "Ultrasound", plural: "Ultrasounds", category: "imaging", hasResults: false },
  mri: { label: "MRI", plural: "MRI Scans", category: "imaging", hasResults: false },
  ct_scan: { label: "CT Scan", plural: "CT Scans", category: "imaging", hasResults: false },
  mammogram: { label: "Mammogram", plural: "Mammograms", category: "imaging", hasResults: false },
  dexa_scan: { label: "DEXA Scan", plural: "DEXA Scans", category: "imaging", hasResults: true },
  ecg: { label: "ECG", plural: "ECGs", category: "cardiology", hasResults: true },
  echocardiogram: { label: "Echocardiogram", plural: "Echocardiograms", category: "cardiology", hasResults: false },
  stress_test: { label: "Stress Test", plural: "Stress Tests", category: "cardiology", hasResults: true },
  holter: { label: "Holter Monitor", plural: "Holter Monitoring", category: "cardiology", hasResults: false },
  consultation_note: { label: "Consultation Note", plural: "Consultation Notes", category: "consultations", hasResults: false },
  referral: { label: "Referral", plural: "Referrals", category: "consultations", hasResults: false },
  discharge_summary: { label: "Discharge Summary", plural: "Discharge Summaries", category: "consultations", hasResults: false },
  endoscopy: { label: "Endoscopy Report", plural: "Endoscopies", category: "procedures", hasResults: false },
  prescription: { label: "Prescription", plural: "Prescriptions", category: "prescriptions", hasResults: false },
  vaccination_record: { label: "Vaccination Record", plural: "Vaccination Records", category: "vaccinations", hasResults: false },
  dental_record: { label: "Dental Record", plural: "Dental Records", category: "dental", hasResults: false },
  eye_exam: { label: "Eye Exam", plural: "Eye Exams", category: "vision", hasResults: false },
  sleep_study: { label: "Sleep Study", plural: "Sleep Studies", category: "sleep", hasResults: true },
  body_composition_scan: { label: "Body Composition Scan", plural: "Body Composition Scans", category: "fitness", hasResults: true },
  fitness_test: { label: "Fitness Test", plural: "Fitness Tests", category: "fitness", hasResults: true },
  other: { label: "Health Document", plural: "Other Documents", category: "other", hasResults: false },
} as const satisfies Record<string, DocumentTypeInfo>;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

export const DOCUMENT_TYPE_CODES = Object.keys(DOCUMENT_TYPES) as DocumentType[];

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && value in DOCUMENT_TYPES;
}

export function documentTypeInfo(type: string | null | undefined): DocumentTypeInfo {
  return isDocumentType(type) ? DOCUMENT_TYPES[type] : DOCUMENT_TYPES.other;
}

export function categoryForType(type: string | null | undefined): CategoryCode {
  return documentTypeInfo(type).category;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Where a document lives in a member's records. The member is the root and is
 * not part of the stored path, so moving a document to another member never
 * requires re-filing it.
 */
export function buildFilingPath(
  documentType: string | null | undefined,
  documentDate: string | null | undefined,
  categoryLabels: Partial<Record<string, string>> = {},
): string[] {
  const info = documentTypeInfo(documentType);
  const path = ["Health Records", categoryLabels[info.category] ?? CATEGORY_LABELS[info.category], info.plural];
  const match = documentDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(documentDate) : null;
  if (!match) {
    path.push("Undated");
    return path;
  }
  const month = Number(match[2]);
  path.push(match[1], MONTHS[month - 1] ?? "Undated");
  return path;
}
