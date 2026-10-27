import "server-only";
import type { ServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { possibleResultPairs } from "@/lib/domain/exams";
import { documentTypeInfo } from "@/lib/domain/taxonomy";
import { matchExamsToResults, type DocumentToMatch, type ExamToMatch } from "@/lib/ai/match-exams";

export interface LinkedResult {
  exam_name: string;
  document_title: string;
  document_date: string | null;
}

interface OpenExamRow {
  id: string;
  exam_name: string;
  exam_type: string;
  body_site: string | null;
  request: { document_date: string | null; doctor_name: string | null } | null;
}

/**
 * Finds the results of a person's open requested exams among their filed
 * documents and links them (marking the exams done). Scope it to the exams of
 * one request, or to newly filed documents. Everything is read and written
 * with the caller's own session; links are written by link_exam_results(),
 * which checks access and audits. Never throws: linking is a convenience,
 * filing must not depend on it.
 */
export async function linkExamResults(
  supabase: ServerSupabase,
  scope: { memberId: string; examIds?: string[]; documentIds?: string[] },
): Promise<LinkedResult[]> {
  try {
    if (!env.anthropicConfigured()) return [];

    let examQuery = supabase
      .from("requested_exams")
      .select("id, exam_name, exam_type, body_site, request:documents(document_date, doctor_name)")
      .eq("member_id", scope.memberId)
      .in("status", ["to_do", "scheduled"]);
    if (scope.examIds) examQuery = examQuery.in("id", scope.examIds);
    const { data: examData } = await examQuery;
    const exams = (examData ?? []) as unknown as OpenExamRow[];
    if (exams.length === 0) return [];

    let docQuery = supabase
      .from("documents")
      .select("id, document_type, title, document_date, provider, summary:extraction->>summary")
      .eq("member_id", scope.memberId)
      .eq("status", "filed")
      .neq("document_type", "exam_request");
    if (scope.documentIds) docQuery = docQuery.in("id", scope.documentIds);
    const { data: docData } = await docQuery.order("document_date", { ascending: false, nullsFirst: false }).limit(200);
    const docs = (docData ?? []) as { id: string; document_type: string | null; title: string | null; document_date: string | null; provider: string | null; summary: string | null }[];

    const pairs = possibleResultPairs(
      exams.map((e) => ({ id: e.id, exam_type: e.exam_type, requested_on: e.request?.document_date ?? null })),
      docs,
    );
    if (pairs.length === 0) return [];

    const docIds = [...new Set(pairs.map((p) => p.documentId))];
    const { data: tests } = await supabase.from("health_results").select("source_document_id, analyte_name").in("source_document_id", docIds);
    const testsByDoc = new Map<string, string[]>();
    for (const t of tests ?? []) testsByDoc.set(t.source_document_id!, [...(testsByDoc.get(t.source_document_id!) ?? []), t.analyte_name]);

    const examIds = new Set(pairs.map((p) => p.examId));
    const toMatchExams: ExamToMatch[] = exams.filter((e) => examIds.has(e.id)).map((e) => ({
      id: e.id, name: e.exam_name, exam_type: e.exam_type, body_site: e.body_site,
      requested_on: e.request?.document_date ?? null, doctor: e.request?.doctor_name ?? null,
    }));
    const toMatchDocs: DocumentToMatch[] = docs.filter((d) => docIds.includes(d.id)).map((d) => ({ ...d, tests: testsByDoc.get(d.id) ?? [] }));

    const matches = await matchExamsToResults({ exams: toMatchExams, documents: toMatchDocs, allowed: pairs });
    // One exam, one result: the most recent matching document.
    const byExam = new Map<string, string>();
    for (const m of matches) {
      const current = byExam.get(m.examId);
      const date = (id: string) => docs.find((d) => d.id === id)?.document_date ?? "";
      if (!current || date(m.documentId) > date(current)) byExam.set(m.examId, m.documentId);
    }
    const byDoc = new Map<string, string[]>();
    for (const [examId, docId] of byExam) byDoc.set(docId, [...(byDoc.get(docId) ?? []), examId]);

    const linked: LinkedResult[] = [];
    for (const [docId, ids] of byDoc) {
      const { error } = await supabase.rpc("link_exam_results", { p_exam_ids: ids, p_document_id: docId, p_automatic: true });
      if (error) continue;
      const doc = docs.find((d) => d.id === docId)!;
      for (const id of ids) {
        linked.push({
          exam_name: exams.find((e) => e.id === id)!.exam_name,
          document_title: doc.title ?? documentTypeInfo(doc.document_type).label,
          document_date: doc.document_date,
        });
      }
    }
    return linked;
  } catch (error) {
    console.error("Linking exam results failed", error);
    return [];
  }
}
