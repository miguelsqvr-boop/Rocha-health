import { memberPage } from "@/lib/member-page";
import { examRequests } from "@/lib/data/queries";
import { ButtonLink, Card } from "@/components/ui";
import { UploadWizard } from "@/components/client/UploadWizard";
import { ExamRequestsBoard, type ExamRequestParams } from "@/components/member/ExamRequestsBoard";

/** One person's exam requests, organised by date, specialty, doctor or type of exam. */
export default async function ExamRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<ExamRequestParams & { upload?: string }>;
}) {
  const { subject, supabase, viewer, canWrite, isSelf } = await memberPage(params);
  const { upload, ...filters } = await searchParams;
  const requests = await examRequests(supabase, subject.id);
  const isAdmin = viewer.isSuperAdmin && !viewer.viewAs;

  return (
    <div className="space-y-4">
      <Card
        title="Exam Requests"
        action={canWrite && !upload && (isAdmin && !isSelf
          ? <ButtonLink href="/admin/upload">+ Upload exam request</ButtonLink>
          : <ButtonLink href="?upload=1">+ Upload exam request</ButtonLink>)}
      >
        {canWrite && upload && (!isAdmin || isSelf) ? (
          <UploadWizard members={[{ id: subject.id, display_name: subject.display_name, avatar_color: subject.avatar_color }]} allowAuto={false} lockedMemberId={subject.id} />
        ) : (
          <p className="text-sm text-ink-2">
            Exams a doctor has asked for (requisições de exames). Upload the request as a PDF, photo or Word file: the doctor,
            specialty, date and each exam are read from it, and you check them before it is saved.
          </p>
        )}
      </Card>
      <ExamRequestsBoard requests={requests} basePath={`/m/${subject.id}/exam-requests`} params={filters} canEdit={isAdmin} canUpdate={() => canWrite} />
    </div>
  );
}
