"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buttonClass, inputClass } from "@/components/ui";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    const supabase = createSupabaseBrowserClient();
    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setStatus({ ok: false, text: "Email or password is incorrect." });
      router.push(next);
      router.refresh();
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
      });
      setBusy(false);
      setStatus(error ? { ok: false, text: "We couldn't send a link to that address." } : { ok: true, text: "Check your email for a sign-in link." });
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block text-ink-2">Email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </label>
      {mode === "password" && (
        <label className="block text-sm">
          <span className="mb-1 block text-ink-2">Password</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </label>
      )}
      <button type="submit" disabled={busy} className={`${buttonClass.primary} w-full`}>
        {mode === "password" ? "Sign in" : "Email me a sign-in link"}
      </button>
      <button type="button" onClick={() => setMode(mode === "password" ? "link" : "password")} className="w-full text-sm text-accent">
        {mode === "password" ? "Use an email link instead" : "Use a password instead"}
      </button>
      {status && <p role="status" className={status.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"}>{status.text}</p>}
    </form>
  );
}
