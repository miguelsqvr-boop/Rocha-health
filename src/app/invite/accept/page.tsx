import type { Metadata } from "next";
import { AcceptInvitation } from "./AcceptInvitation";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function AcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold text-ink">Join your family's health records</h1>
        <p className="mt-1 text-sm text-ink-2">
          Your account is private: only you and the family's Super Admin can see your health information.
        </p>
        <AcceptInvitation token={token ?? ""} />
      </div>
    </main>
  );
}
