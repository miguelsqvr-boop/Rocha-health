import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";

export default async function Home() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.member) redirect("/welcome");
  if (viewer.viewAs) redirect(`/m/${viewer.viewAs.id}`);
  redirect(viewer.isSuperAdmin ? "/admin" : `/m/${viewer.member.id}`);
}
