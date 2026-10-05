"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "@/components/client/api";
import { buttonClass, inputClass } from "@/components/ui";

export function SetupForm() {
  const router = useRouter();
  const [form, setForm] = useState({ familyName: "Rocha", displayName: "", legalName: "", dateOfBirth: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await callApi<{ redirectTo: string }>("POST", "/api/setup", {
      familyName: form.familyName,
      displayName: form.displayName,
      legalName: form.legalName || null,
      dateOfBirth: form.dateOfBirth || null,
    });
    setBusy(false);
    if (!result.ok) return setError(result.data.error ?? "Setup failed.");
    router.push(result.data.redirectTo);
    router.refresh();
  }

  const field = (key: keyof typeof form, label: string, type = "text", required = false) => (
    <label className="block text-sm">
      <span className="mb-1 block text-ink-2">{label}</span>
      <input type={type} required={required} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
    </label>
  );

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
      {field("familyName", "Family name", "text", true)}
      {field("displayName", "Your name (as the family calls you)", "text", true)}
      {field("legalName", "Full name (as on medical documents)")}
      {field("dateOfBirth", "Date of birth", "date")}
      <div className="sm:col-span-2">
        <button disabled={busy} className={buttonClass.primary}>Set up family as Super Admin</button>
        {error && <p role="alert" className="mt-2 text-sm text-critical-ink">{error}</p>}
      </div>
    </form>
  );
}
