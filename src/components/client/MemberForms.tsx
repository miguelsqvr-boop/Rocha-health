"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, inputClass } from "@/components/ui";
import { callApi } from "./api";

interface Profile {
  displayName: string;
  legalName: string;
  aliases: string;
  dateOfBirth: string;
  sex: string;
  email: string;
}

const EMPTY: Profile = { displayName: "", legalName: "", aliases: "", dateOfBirth: "", sex: "", email: "" };

/** Create (no memberId) or edit a family member profile (Super Admin). */
export function MemberProfileForm({ memberId, initial }: { memberId?: string; initial?: Partial<Profile> }) {
  const router = useRouter();
  const [form, setForm] = useState<Profile>({ ...EMPTY, ...initial });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const body = {
      displayName: form.displayName,
      legalName: form.legalName || null,
      aliases: form.aliases.split(",").map((a) => a.trim()).filter(Boolean),
      dateOfBirth: form.dateOfBirth || null,
      sex: form.sex || null,
      email: form.email || null,
    };
    const result = memberId
      ? await callApi("PATCH", `/api/members/${memberId}`, body)
      : await callApi<{ id: string }>("POST", "/api/members", body);
    setBusy(false);
    if (!result.ok) return setMessage({ ok: false, text: result.data.error ?? "Could not save." });
    if (!memberId) {
      setForm(EMPTY);
      router.push(`/admin/members/${(result.data as { id: string }).id}`);
    } else setMessage({ ok: true, text: "Saved." });
    router.refresh();
  }

  const field = (key: keyof Profile, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="text-sm">
      <span className="mb-1 block text-ink-2">{label}</span>
      <input {...props} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className={inputClass} />
    </label>
  );

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      {field("displayName", "Name the family uses", { required: true, placeholder: "Santi" })}
      {field("legalName", "Full name on medical documents", { placeholder: "Santiago Rocha" })}
      {field("dateOfBirth", "Date of birth", { type: "date" })}
      <label className="text-sm">
        <span className="mb-1 block text-ink-2">Sex (for screening guidance)</span>
        <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} className={inputClass}>
          <option value="">Not set</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
        </select>
      </label>
      {field("aliases", "Other names on documents (comma separated)", { placeholder: "Santiago M. Rocha" })}
      {field("email", "Email", { type: "email" })}
      <p className="text-xs text-ink-2 sm:col-span-2">Full name, aliases and date of birth are used to check every uploaded document belongs to the right person.</p>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={busy} className={buttonClass.primary}>{memberId ? "Save profile" : "Create family member"}</button>
        {message && <span role="status" className={message.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"}>{message.text}</span>}
      </div>
    </form>
  );
}

export function InviteForm({ memberId, defaultEmail, displayName }: { memberId: string; defaultEmail: string | null; displayName: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [result, setResult] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    const response = await callApi<{ link: string; message: string }>("POST", `/api/members/${memberId}/invite`, { email });
    if (!response.ok) return setResult({ ok: false, text: response.data.error ?? "Could not create the invitation." });
    setResult({ ok: true, text: response.data.message, link: response.data.link });
    router.refresh();
  }

  return (
    <form onSubmit={invite} className="space-y-3">
      <p className="text-sm text-ink-2">{displayName} will get their own private login and will only see their own health information.</p>
      <div className="flex flex-wrap gap-2">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className={`${inputClass} max-w-xs`} />
        <button className={buttonClass.primary}>Send invitation</button>
      </div>
      {result && (
        <div role="status" className={result.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"}>
          <p>{result.text}</p>
          {result.link && (
            <p className="mt-1 break-all rounded-lg bg-surface-2 p-2 text-xs text-ink">
              {result.link}
              <button type="button" className="ml-2 text-accent" onClick={() => navigator.clipboard.writeText(result.link!)}>Copy</button>
            </p>
          )}
          {result.link && <p className="mt-1 text-xs text-ink-2">The link expires in 7 days and only works for {email}.</p>}
        </div>
      )}
    </form>
  );
}
