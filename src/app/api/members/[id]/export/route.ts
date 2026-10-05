import { ApiError, route } from "@/lib/api";
import {
  memberDocuments,
  memberMedications,
  memberPreventiveCompletions,
  memberResults,
  memberWellness,
} from "@/lib/data/queries";
import { MEMBER_COLUMNS } from "@/lib/data/types";

/**
 * Export one person's records as JSON. Everything is read through RLS, so a
 * member can only export themselves; the Super Admin can export anyone in the
 * family. Every export is audited.
 */
export const GET = route({ mutates: false }, async ({ supabase }, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const { data: member } = await supabase.from("family_members").select(MEMBER_COLUMNS).eq("id", id).maybeSingle();
  if (!member) throw new ApiError(404, "Family member not found.");

  const { error: logError } = await supabase.rpc("log_access", {
    p_action: "records.export",
    p_target_member_id: id,
    p_entity_type: "family_member",
    p_entity_id: id,
    p_summary: `Exported health records of ${member.display_name}`,
  });
  if (logError) throw new ApiError(403, "Export is not allowed.");

  const [documents, results, medications, wellness, preventive] = await Promise.all([
    memberDocuments(supabase, id),
    memberResults(supabase, id),
    memberMedications(supabase, id),
    memberWellness(supabase, id, 3650),
    memberPreventiveCompletions(supabase, id),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    profile: member,
    documents: documents.map(({ storage_path: _path, ...doc }) => doc),
    lab_results: results,
    medications,
    wellness,
    preventive_care: preventive,
    note: "Original files are not included. Download them individually from Documents.",
  };
  const filename = `health-records-${member.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
