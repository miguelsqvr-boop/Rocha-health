"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { callApi } from "@/components/client/api";
import { buttonClass, inputClass } from "@/components/ui";

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<"checking" | "signed-out" | "ready" | "done">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      // Supabase invitation emails sign the person in by putting the session
      // in the URL fragment (implicit flow), which the cookie-based client
      // does not pick up by itself. Store it, then remove it from the address bar.
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setEmail(data.user.email ?? "");
        setState("ready");
      } else setState("signed-out");
    })();
  }, []);

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    const next = `/invite/accept?token=${encodeURIComponent(token)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setMessage(error ? { ok: false, text: "We couldn't send a sign-in link." } : { ok: true, text: "Check your email and open the link to continue." });
  }

  async function accept(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    if (password) {
      const { error } = await createSupabaseBrowserClient().auth.updateUser({ password });
      if (error) {
        setBusy(false);
        return setMessage({ ok: false, text: "Choose a stronger password (at least 8 characters)." });
      }
    }
    const result = await callApi<{ redirectTo: string }>("POST", "/api/invitations/accept", { token });
    setBusy(false);
    if (!result.ok) return setMessage({ ok: false, text: result.data.error ?? "This invitation could not be accepted." });
    setState("done");
    router.push(result.data.redirectTo);
    router.refresh();
  }

  if (!token) return <p className="mt-4 text-sm text-critical-ink">This invitation link is incomplete.</p>;
  if (state === "checking") return <p className="mt-4 text-sm text-ink-2">Checking your sign-in…</p>;
  if (state === "signed-out") {
    return (
      <form onSubmit={sendLink} className="mt-5 space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">The email address your invitation was sent to</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </label>
        <button className={`${buttonClass.primary} w-full`}>Email me a sign-in link</button>
        {message && <p role="status" className={message.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"}>{message.text}</p>}
      </form>
    );
  }
  return (
    <form onSubmit={accept} className="mt-5 space-y-3">
      <p className="text-sm text-ink-2">Signed in as <strong className="text-ink">{email}</strong>.</p>
      <label className="block text-sm">
        <span className="mb-1 block text-ink-2">Set a password (optional, you can also sign in with email links)</span>
        <input type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </label>
      <button disabled={busy || state === "done"} className={`${buttonClass.primary} w-full`}>Accept invitation</button>
      {message && <p role="alert" className={message.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"}>{message.text}</p>}
    </form>
  );
}
