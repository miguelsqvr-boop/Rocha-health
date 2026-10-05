"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WELLNESS_METRICS, type WellnessMetric } from "@/lib/domain/wellness";
import { buttonClass, inputClass } from "@/components/ui";
import { callApi } from "./api";

function useStatus() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const node = message && <span role="status" className={message.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"}>{message.text}</span>;
  return { setMessage, node };
}

/** Members can't edit their records directly; they ask the Super Admin. */
export function RequestCorrection({ memberId, entityType, entityId, label }: { memberId: string; entityType: "document" | "health_result" | "profile" | "other"; entityId: string | null; label: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { setMessage, node } = useStatus();
  if (!open) return <button type="button" className="text-xs text-accent" onClick={() => setOpen(true)}>Request correction</button>;
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await callApi("POST", "/api/corrections", { memberId, entityType, entityId, message: `${label}: ${text}` });
        setMessage(result.ok ? { ok: true, text: "Sent to the Super Admin." } : { ok: false, text: result.data.error ?? "Could not send." });
        if (result.ok) { setText(""); setOpen(false); }
      }}
    >
      <input required minLength={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="What should be corrected?" className={`${inputClass} w-64`} />
      <button className={buttonClass.secondary}>Send</button>
      <button type="button" className="text-xs text-ink-2" onClick={() => setOpen(false)}>Cancel</button>
      {node}
    </form>
  );
}

export function AddMedicationForm({ memberId, kind }: { memberId: string; kind: "medication" | "supplement" }) {
  const router = useRouter();
  const empty = { name: "", dose: "", frequency: "", startedOn: "", notes: "" };
  const [form, setForm] = useState(empty);
  const { setMessage, node } = useStatus();
  return (
    <form
      className="grid gap-2 sm:grid-cols-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await callApi("POST", `/api/members/${memberId}/medications`, {
          kind, name: form.name, dose: form.dose || null, frequency: form.frequency || null,
          startedOn: form.startedOn || null, endedOn: null, notes: form.notes || null,
        });
        setMessage(result.ok ? { ok: true, text: "Added." } : { ok: false, text: result.data.error ?? "Could not add." });
        if (result.ok) { setForm(empty); router.refresh(); }
      }}
    >
      <input required placeholder={kind === "medication" ? "Medication" : "Supplement"} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
      <input placeholder="Dose" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} className={inputClass} />
      <input placeholder="How often" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className={inputClass} />
      <input type="date" aria-label="Started on" value={form.startedOn} onChange={(e) => setForm({ ...form, startedOn: e.target.value })} className={inputClass} />
      <button className={buttonClass.primary}>Add</button>
      <div className="sm:col-span-5">{node}</div>
    </form>
  );
}

export function AddWellnessForm({ memberId, metrics }: { memberId: string; metrics: readonly WellnessMetric[] }) {
  const router = useRouter();
  const [metric, setMetric] = useState<WellnessMetric>(metrics[0]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { setMessage, node } = useStatus();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await callApi("POST", `/api/members/${memberId}/wellness`, { metric, value: Number(value.replace(",", ".")), recordedAt: date });
        setMessage(result.ok ? { ok: true, text: "Added." } : { ok: false, text: result.data.error ?? "Could not add." });
        if (result.ok) { setValue(""); router.refresh(); }
      }}
    >
      <select value={metric} onChange={(e) => setMetric(e.target.value as WellnessMetric)} className={`${inputClass} w-auto`}>
        {metrics.map((m) => <option key={m} value={m}>{WELLNESS_METRICS[m].label}</option>)}
      </select>
      <input required inputMode="decimal" placeholder={WELLNESS_METRICS[metric].unit} value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} w-28`} />
      <input type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} w-auto`} />
      <button className={buttonClass.primary}>Add</button>
      {node}
    </form>
  );
}

export function SelfProfileForm({ memberId, displayName, phone }: { memberId: string; displayName: string; phone: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({ displayName, phone: phone ?? "" });
  const { setMessage, node } = useStatus();
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await callApi("PATCH", `/api/members/${memberId}`, { displayName: form.displayName, phone: form.phone || null });
        setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.data.error ?? "Could not save." });
        if (result.ok) router.refresh();
      }}
    >
      <label className="text-sm"><span className="mb-1 block text-ink-2">Display name</span>
        <input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} className={inputClass} />
      </label>
      <label className="text-sm"><span className="mb-1 block text-ink-2">Phone</span>
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2"><button className={buttonClass.primary}>Save</button>{node}</div>
    </form>
  );
}
