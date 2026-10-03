// Row shapes returned by the queries in this folder (subset of the schema).

import type { MemberRole, MemberStatus } from "@/lib/domain/permissions";

export interface MemberRow {
  id: string;
  family_id: string;
  user_id: string | null;
  role: MemberRole;
  status: MemberStatus;
  display_name: string;
  legal_name: string | null;
  name_aliases: string[];
  date_of_birth: string | null;
  sex: "female" | "male" | "other" | null;
  email: string | null;
  phone: string | null;
  avatar_color: string | null;
  sort_order: number;
  invited_at: string | null;
  activated_at: string | null;
}

export const MEMBER_COLUMNS =
  "id, family_id, user_id, role, status, display_name, legal_name, name_aliases, date_of_birth, sex, email, phone, avatar_color, sort_order, invited_at, activated_at";

export type DocumentStatus = "processing" | "ready_for_review" | "filed" | "failed";
export type IdentityStatusValue = "match" | "mismatch" | "uncertain" | "unchecked";

export interface DocumentRow {
  id: string;
  family_id: string;
  member_id: string | null;
  uploaded_by: string;
  uploaded_by_name: string | null;
  status: DocumentStatus;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  document_type: string | null;
  category: string | null;
  title: string | null;
  document_date: string | null;
  provider: string | null;
  filing_path: string[];
  extracted_patient_name: string | null;
  extracted_date_of_birth: string | null;
  identity_status: IdentityStatusValue;
  identity_confirmed_by: string | null;
  processing_error: string | null;
  filed_at: string | null;
  created_at: string;
}

export const DOCUMENT_COLUMNS =
  "id, family_id, member_id, uploaded_by, uploaded_by_name, status, original_filename, mime_type, size_bytes, storage_path, document_type, category, title, document_date, provider, filing_path, extracted_patient_name, extracted_date_of_birth, identity_status, identity_confirmed_by, processing_error, filed_at, created_at";

export interface ResultRow {
  id: string;
  member_id: string;
  biomarker_id: string | null;
  analyte_name: string;
  source_document_id: string | null;
  result_date: string;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  flag: "low" | "normal" | "high" | "abnormal" | null;
  confidence: "high" | "needs_review";
  biomarker: { code: string; name: string; category: string } | null;
}

export const RESULT_COLUMNS =
  "id, member_id, biomarker_id, analyte_name, source_document_id, result_date, value_numeric, value_text, unit, reference_low, reference_high, reference_text, flag, confidence, biomarker:biomarkers(code, name, category)";

export interface MedicationRow {
  id: string;
  member_id: string;
  kind: "medication" | "supplement";
  name: string;
  dose: string | null;
  frequency: string | null;
  started_on: string | null;
  ended_on: string | null;
  prescriber: string | null;
  notes: string | null;
}

export interface WellnessRow {
  id: string;
  member_id: string;
  domain: string;
  metric: string;
  value: number;
  unit: string | null;
  recorded_at: string;
  source: string;
}

export interface AuditRow {
  id: number;
  occurred_at: string;
  actor_name: string | null;
  acting_as_member_id: string | null;
  action: string;
  target_member_id: string | null;
  target_member_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
}
