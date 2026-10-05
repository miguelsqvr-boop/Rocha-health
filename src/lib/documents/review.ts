// Shapes shared by the upload/review API and the review screen (no server
// imports, so client components can use them).

import type { IdentityAssessment } from "@/lib/domain/identity";

export interface ReviewResult {
  analyte_name: string;
  biomarker_id: string | null;
  biomarker_code: string | null;
  biomarker_name: string | null;
  value_numeric: number | null;
  value_text: string | null;
  unit: string | null;
  reference_low: number | null;
  reference_high: number | null;
  reference_text: string | null;
  flag: "low" | "normal" | "high" | "abnormal" | null;
  confidence: "high" | "needs_review";
  result_date: string | null;
}

export interface StoredExtraction {
  model: string;
  extracted_at: string;
  is_health_document: boolean;
  summary: string;
  patient_name: string | null;
  patient_date_of_birth: string | null;
  results: ReviewResult[];
}

export interface ReviewCandidate {
  id: string;
  display_name: string;
  legal_name: string | null;
}

export interface DocumentReview {
  id: string;
  status: "processing" | "ready_for_review" | "filed" | "failed";
  original_filename: string;
  member_id: string | null;
  document_type: string | null;
  title: string | null;
  document_date: string | null;
  provider: string | null;
  processing_error: string | null;
  extraction: StoredExtraction | null;
  identity: IdentityAssessment | null;
  candidates: ReviewCandidate[];
}
