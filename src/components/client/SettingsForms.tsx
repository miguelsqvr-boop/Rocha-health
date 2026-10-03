"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass, inputClass } from "@/components/ui";
import { callApi } from "./api";

function useSubmit(url: string) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(body: unknown) {
    const result = await callApi("POST", url, body);
    setMessage(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.data.error ?? "Could not save." });
    if (result.ok) router.refresh();
    return result.ok;
  }
  const status = message && <span role="status" className={message.ok ? "text-sm text-good-ink" : "text-sm text-critical-ink"}>{message.text}</span>;
  return { submit, status };
}

export function CategoryLabelForm({ code, label }: { code: string; label: string }) {
  const [value, setValue] = useState(label);
  const { submit, status } = useSubmit("/api/settings/categories");
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit({ code, label: value }); }} className="flex items-center gap-2">
      <input aria-label={`Label for ${code}`} value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} max-w-xs`} />
      {value !== label && <button className={buttonClass.secondary}>Rename</button>}
      {status}
    </form>
  );
}

export function BiomarkerForm() {
  const [form, setForm] = useState({ code: "", name: "", category: "metabolic", defaultUnit: "", referenceLow: "", referenceHigh: "", synonyms: "" });
  const { submit, status } = useSubmit("/api/settings/biomarkers");
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await submit({
          code: form.code, name: form.name, category: form.category, defaultUnit: form.defaultUnit || null,
          referenceLow: num(form.referenceLow), referenceHigh: num(form.referenceHigh),
          synonyms: form.synonyms.split(",").map((s) => s.trim()).filter(Boolean),
        });
        if (ok) setForm({ code: "", name: "", category: "metabolic", defaultUnit: "", referenceLow: "", referenceHigh: "", synonyms: "" });
      }}
      className="grid gap-2 sm:grid-cols-4"
    >
      <input required placeholder="code (e.g. omega3_index)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} />
      <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
      <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
        {["cardiovascular", "metabolic", "kidney", "liver", "blood_count", "thyroid", "vitamins_minerals", "hormones", "inflammation", "other"].map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
      </select>
      <input placeholder="Unit" value={form.defaultUnit} onChange={(e) => setForm({ ...form, defaultUnit: e.target.value })} className={inputClass} />
      <input placeholder="Reference low" inputMode="decimal" value={form.referenceLow} onChange={(e) => setForm({ ...form, referenceLow: e.target.value })} className={inputClass} />
      <input placeholder="Reference high" inputMode="decimal" value={form.referenceHigh} onChange={(e) => setForm({ ...form, referenceHigh: e.target.value })} className={inputClass} />
      <input placeholder="Other names on lab reports, comma separated" value={form.synonyms} onChange={(e) => setForm({ ...form, synonyms: e.target.value })} className={`${inputClass} sm:col-span-2`} />
      <div className="flex items-center gap-3 sm:col-span-4"><button className={buttonClass.primary}>Add biomarker</button>{status}</div>
    </form>
  );
}

export function PreventiveRuleForm() {
  const empty = { code: "", title: "", description: "", sex: "", minAge: "", maxAge: "", intervalMonths: "12", documentTypes: "", biomarkerCodes: "" };
  const [form, setForm] = useState(empty);
  const { submit, status } = useSubmit("/api/settings/preventive-rules");
  const int = (v: string) => (v.trim() === "" ? null : Number.parseInt(v, 10));
  const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await submit({
          code: form.code, title: form.title, description: form.description || null, sex: form.sex || null,
          minAge: int(form.minAge), maxAge: int(form.maxAge), intervalMonths: int(form.intervalMonths) ?? 12,
          documentTypes: list(form.documentTypes), biomarkerCodes: list(form.biomarkerCodes), active: true,
        });
        if (ok) setForm(empty);
      }}
      className="grid gap-2 sm:grid-cols-4"
    >
      <input required placeholder="code (e.g. skin_check)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={inputClass} />
      <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
      <input placeholder="Every N months" inputMode="numeric" value={form.intervalMonths} onChange={(e) => setForm({ ...form, intervalMonths: e.target.value })} className={inputClass} />
      <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} className={inputClass}>
        <option value="">Everyone</option><option value="female">Female</option><option value="male">Male</option>
      </select>
      <input placeholder="Min age" inputMode="numeric" value={form.minAge} onChange={(e) => setForm({ ...form, minAge: e.target.value })} className={inputClass} />
      <input placeholder="Max age" inputMode="numeric" value={form.maxAge} onChange={(e) => setForm({ ...form, maxAge: e.target.value })} className={inputClass} />
      <input placeholder="Done by document types (e.g. consultation_note)" value={form.documentTypes} onChange={(e) => setForm({ ...form, documentTypes: e.target.value })} className={`${inputClass} sm:col-span-2`} />
      <input placeholder="…or by biomarkers (e.g. hba1c)" value={form.biomarkerCodes} onChange={(e) => setForm({ ...form, biomarkerCodes: e.target.value })} className={`${inputClass} sm:col-span-2`} />
      <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inputClass} sm:col-span-2`} />
      <div className="flex items-center gap-3 sm:col-span-4"><button className={buttonClass.primary}>Add rule</button>{status}</div>
    </form>
  );
}
