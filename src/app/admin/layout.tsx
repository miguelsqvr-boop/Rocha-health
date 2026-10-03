import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { requireSuperAdmin } from "@/lib/auth/viewer";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await requireSuperAdmin();
  return <AppShell viewer={viewer}>{children}</AppShell>;
}
