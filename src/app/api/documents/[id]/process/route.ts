import { json, route } from "@/lib/api";
import { processDocument } from "@/lib/documents/pipeline";

export const maxDuration = 300;

export const POST = route({ mutates: true }, async ({ supabase, viewer }, _request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return json(await processDocument(supabase, viewer, id));
});
