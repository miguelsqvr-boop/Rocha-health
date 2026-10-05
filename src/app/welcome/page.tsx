import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { SetupForm } from "./SetupForm";

export const metadata: Metadata = { title: "Welcome" };

/**
 * Signed in but not (or no longer) an active family member. The app cannot
 * tell this person whether a family exists; first-time setup is offered and
 * the database refuses it if the family is already set up.
 */
export default async function WelcomePage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.member) redirect("/");
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold text-ink">Welcome to Rocha Health</h1>
      <p className="mt-2 text-sm text-ink-2">
        You're signed in as {viewer.email}. Your login isn't linked to a family member yet.
      </p>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-ink">Were you invited?</h2>
        <p className="mt-1 text-sm text-ink-2">
          Open the invitation link from your email while signed in with this address. If your account was deactivated, ask the family's Super Admin.
        </p>
      </div>
      <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
        <h2 className="font-semibold text-ink">Setting up for the first time?</h2>
        <p className="mt-1 text-sm text-ink-2">
          The first person to set up the family becomes its Super Admin and can then add and invite everyone else.
        </p>
        <SetupForm />
      </div>
      <form action="/auth/signout" method="post" className="mt-6">
        <button className="text-sm text-ink-2 hover:text-ink">Sign out</button>
      </form>
    </main>
  );
}
