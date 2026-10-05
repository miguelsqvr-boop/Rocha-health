import { MedicationsPage } from "@/components/member/MedicationsPage";

export default function Page({ params }: { params: Promise<{ memberId: string }> }) {
  return <MedicationsPage params={params} kind="supplement" />;
}
