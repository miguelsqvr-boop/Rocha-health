import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/viewer";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMembers } from "@/lib/data/queries";
import { PageHeader } from "@/components/ui";
import { UploadWizard } from "@/components/client/UploadWizard";

export const metadata: Metadata = { title: "Upload Health Document" };

export default async function UploadPage() {
  await requireSuperAdmin();
  const supabase = await createSupabaseServerClient();
  const members = (await listMembers(supabase)).filter((m) => m.status !== "deactivated");
  return (
    <>
      <PageHeader
        title="Upload Health Documents"
        subtitle="Upload a pile of documents. Each one is read, matched to the right person, classified and filed. You confirm before anything is saved."
      />
      <UploadWizard
        members={members.map((m) => ({ id: m.id, display_name: m.display_name, avatar_color: m.avatar_color }))}
        allowAuto
        manualReviewPath="/admin/documents/"
      />
    </>
  );
}
