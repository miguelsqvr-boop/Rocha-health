import "server-only";
import { ApiError, throwIfDbError } from "@/lib/api";
import type { ServerSupabase } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/auth/viewer";
import { extractDocument, ExtractionError, EXTRACTION_MODEL } from "@/lib/ai/extract";
import { assessIdentity, type IdentityAssessment } from "@/lib/domain/identity";
import { buildBiomarkerIndex, computeFlag, effectiveRange, parseNumeric, resultConfidence } from "@/lib/domain/biomarkers";
import { categoryForType, isDocumentType } from "@/lib/domain/taxonomy";
import { listBiomarkers, listMembers } from "@/lib/data/queries";
import { DOCUMENT_COLUMNS, type DocumentRow, type MemberRow } from "@/lib/data/types";
import type { DocumentReview, ReviewResult, StoredExtraction } from "./review";

export const BUCKET = "health-documents";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoOrNull(value: string | null | undefined): string | null {
  return value && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

/**
 * Who this uploader may file documents for. Read through RLS: the Super Admin
 * gets the family, a member gets only themselves.
 */
async function fileableMembers(supabase: ServerSupabase, viewer: Viewer): Promise<MemberRow[]> {
  const members = await listMembers(supabase);
  return viewer.isSuperAdmin ? members.filter((m) => m.status !== "deactivated") : members.filter((m) => m.id === viewer.member?.id);
}

export async function loadDocument(supabase: ServerSupabase, documentId: string) {
  const { data, error } = await supabase
    .from("documents")
    .select(`${DOCUMENT_COLUMNS}, extraction, identity_assessment`)
    .eq("id", documentId)
    .maybeSingle();
  throwIfDbError(error);
  if (!data) throw new ApiError(404, "Document not found.");
  return data as DocumentRow & { extraction: StoredExtraction | null; identity_assessment: IdentityAssessment | null };
}

export async function documentReview(supabase: ServerSupabase, viewer: Viewer, documentId: string): Promise<DocumentReview> {
  const doc = await loadDocument(supabase, documentId);
  const candidates = await fileableMembers(supabase, viewer);
  return {
    id: doc.id,
    status: doc.status,
    original_filename: doc.original_filename,
    member_id: doc.member_id,
    document_type: doc.document_type,
    title: doc.title,
    document_date: doc.document_date,
    provider: doc.provider,
    processing_error: doc.processing_error,
    extraction: doc.extraction,
    identity: doc.identity_assessment,
    candidates: candidates.map((m) => ({ id: m.id, display_name: m.display_name, legal_name: m.legal_name })),
  };
}

/**
 * Step 4–5 of the upload workflow: read the file (with the uploader's own
 * session, so storage policies apply), extract it, check identity against
 * every member the uploader may file for, match biomarkers, and store the
 * result for review. Nothing is filed until a person confirms.
 */
export async function processDocument(supabase: ServerSupabase, viewer: Viewer, documentId: string): Promise<DocumentReview> {
  const doc = await loadDocument(supabase, documentId);
  if (doc.status === "filed") throw new ApiError(409, "This document has already been filed.");

  try {
    const { data: file, error: downloadError } = await supabase.storage.from(BUCKET).download(doc.storage_path);
    if (downloadError || !file) throw new ExtractionError("The uploaded file could not be read back. Please upload it again.");

    const biomarkers = await listBiomarkers(supabase);
    const extraction = await extractDocument({
      bytes: new Uint8Array(await file.arrayBuffer()),
      mimeType: doc.mime_type,
      filename: doc.original_filename,
      biomarkers,
    });

    const index = buildBiomarkerIndex(biomarkers);
    const documentDate = isoOrNull(extraction.document_date);
    const results: ReviewResult[] = extraction.results.map((r) => {
      const definition = index.match(r.analyte_name, r.biomarker_code);
      const value = parseNumeric(r.value);
      const range = effectiveRange(
        { reference_low: r.reference_low, reference_high: r.reference_high, unit: r.unit },
        definition,
      );
      return {
        analyte_name: r.analyte_name.slice(0, 200),
        biomarker_id: definition?.id ?? null,
        biomarker_code: definition?.code ?? null,
        biomarker_name: definition?.name ?? null,
        value_numeric: value,
        value_text: value === null ? r.value : null,
        unit: r.unit,
        reference_low: r.reference_low,
        reference_high: r.reference_high,
        reference_text: r.reference_range,
        flag: r.lab_flag ?? computeFlag(value, range.low, range.high),
        confidence: resultConfidence({ definition, value, unit: r.unit, extractorConfident: r.confident }),
        result_date: isoOrNull(r.result_date),
      };
    });

    const candidates = await fileableMembers(supabase, viewer);
    const identity = assessIdentity(
      { patientName: extraction.patient_name, dateOfBirth: isoOrNull(extraction.patient_date_of_birth) },
      candidates.map((m) => ({
        id: m.id,
        displayName: m.display_name,
        legalName: m.legal_name,
        aliases: m.name_aliases ?? [],
        dateOfBirth: m.date_of_birth,
      })),
    );

    const stored: StoredExtraction = {
      model: EXTRACTION_MODEL,
      extracted_at: new Date().toISOString(),
      is_health_document: extraction.is_health_document,
      summary: extraction.summary,
      patient_name: extraction.patient_name,
      patient_date_of_birth: isoOrNull(extraction.patient_date_of_birth),
      results,
    };
    const documentType = isDocumentType(extraction.document_type) ? extraction.document_type : "other";

    const { error } = await supabase.rpc("record_document_extraction", {
      p_document_id: doc.id,
      p_extraction: stored,
      p_identity_assessment: identity,
      p_document_type: documentType,
      p_title: extraction.title.slice(0, 120),
      p_document_date: documentDate,
      p_provider: extraction.provider?.slice(0, 120) ?? null,
      p_category: categoryForType(documentType),
      p_patient_name: extraction.patient_name,
      p_patient_date_of_birth: isoOrNull(extraction.patient_date_of_birth),
    });
    throwIfDbError(error);
  } catch (error) {
    if (error instanceof ExtractionError) {
      await supabase.rpc("mark_document_failed", { p_document_id: doc.id, p_error: error.message });
    } else {
      await supabase.rpc("mark_document_failed", { p_document_id: doc.id, p_error: "Processing failed. You can retry or enter the details manually." });
      throw error;
    }
  }
  return documentReview(supabase, viewer, documentId);
}
