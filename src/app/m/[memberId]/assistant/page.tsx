import { memberPage } from "@/lib/member-page";
import { env } from "@/lib/env";
import { Card, EmptyState } from "@/components/ui";
import { AssistantChat } from "@/components/client/AssistantChat";

export default async function AssistantPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { subject, viewer, ownView } = await memberPage(params);
  if (!env.anthropicConfigured()) {
    return <Card title="Health assistant"><EmptyState title="The assistant isn't configured yet">Add an Anthropic API key to enable it.</EmptyState></Card>;
  }
  const familyScope = viewer.isSuperAdmin && !viewer.viewAs;
  const suggestions = ownView
    ? ["Show me my latest blood tests", "Is anything outside the reference range?", "What preventive care is due?"]
    : [`Show ${subject.display_name}'s latest blood test`, `What's due for ${subject.display_name}?`, "Compare the family's latest blood tests"];
  return (
    <Card title="Health assistant">
      <AssistantChat
        suggestions={suggestions}
        intro={familyScope
          ? "Ask about any family member's records. Answers use only the records you can access as Super Admin."
          : "Ask about your own health records. The assistant can only see your information."}
      />
    </Card>
  );
}
