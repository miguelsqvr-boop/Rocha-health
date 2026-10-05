"use client";

import { useState } from "react";
import { buttonClass, inputClass } from "@/components/ui";
import { callApi } from "./api";

interface Turn { role: "user" | "assistant"; content: string; people?: string[] }

export function AssistantChat({ suggestions, intro }: { suggestions: string[]; intro: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const next: Turn[] = [...turns, { role: "user", content: question.trim() }];
    setTurns(next);
    setInput("");
    setBusy(true);
    setError(null);
    const result = await callApi<{ answer: string; peopleAccessed: string[] }>("POST", "/api/assistant", {
      messages: next.slice(-20).map(({ role, content }) => ({ role, content })),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.data.error ?? "The assistant couldn't answer.");
      setTurns(turns);
      setInput(question);
      return;
    }
    setTurns([...next, { role: "assistant", content: result.data.answer, people: result.data.peopleAccessed }]);
  }

  return (
    <div className="flex flex-col gap-4">
      {turns.length === 0 && (
        <div>
          <p className="text-sm text-ink-2">{intro}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((s) => <button key={s} type="button" onClick={() => ask(s)} className={buttonClass.secondary}>{s}</button>)}
          </div>
        </div>
      )}
      <ol className="space-y-3" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className={t.role === "user" ? "ml-auto max-w-[85%] rounded-2xl bg-accent px-4 py-2 text-sm text-accent-fg" : "max-w-[85%] rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-ink"}>
            <p className="whitespace-pre-wrap">{t.content}</p>
            {t.people && t.people.length > 0 && <p className="mt-2 text-xs text-muted">Read records of: {t.people.join(", ")}</p>}
          </li>
        ))}
        {busy && <li className="text-sm text-ink-2">Looking through the records…</li>}
      </ol>
      {error && <p role="alert" className="text-sm text-critical-ink">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about health records…" className={inputClass} maxLength={4000} />
        <button disabled={busy} className={buttonClass.primary}>Ask</button>
      </form>
      <p className="text-xs text-muted">The assistant can only read records you're allowed to see. It isn't a doctor.</p>
    </div>
  );
}
