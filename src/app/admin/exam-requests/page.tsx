import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { examRequests, listMembers, resultDocuments } from "@/lib/data/queries";
import { ButtonLink, PageHeader } from "@/components/ui";
import { ExamRequestsBoard, type ExamRequestParams } from "@/components/member/ExamRequestsBoard";

export const metadata: Metadata = { title: "Exam Requests" };

/** Every exam request in the family, organised by date, specialty, doctor or type of exam. */
export default async function FamilyExamRequestsPage({ searchParams }: { searchParams: Promise<ExamRequestParams> }) {
  const viewer = await requireSuperAdmin();
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [requests, members, results] = await Promise.all([examRequests(supabase), listMembers(supabase), resultDocuments(supabase)]);

  return (
    <>
      <PageHeader
        title="Exam Requests"
        subtitle="Exams the family's doctors have asked for. Upload a request and it is read, filed under the person it names and listed here."
        actions={<ButtonLink href="/admin/upload">+ Upload exam request</ButtonLink>}
      />
      <ExamRequestsBoard
        requests={requests}
        basePath="/admin/exam-requests"
        params={params}
        members={members.map((m) => ({ id: m.id, display_name: m.display_name, avatar_color: m.avatar_color }))}
        canEdit
        canUpdate={() => !viewer.viewAs}
        results={results}
      />
    </>
  );
}
