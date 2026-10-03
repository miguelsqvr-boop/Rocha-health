import { WellnessDomainPage } from "@/components/member/WellnessDomainPage";

export default function Page({ params }: { params: Promise<{ memberId: string }> }) {
  return <WellnessDomainPage params={params} domain="fitness" />;
}
