"use client";

import { useState } from "react";
import { callApi } from "./api";

interface Explanation {
  summary: string;
  common_causes: string[];
  symptoms: string[];
  what_doctors_do: string[];
  seek_care_promptly_if: string[];
  questions_for_doctor: string[];
}

/**
 * "Why might this be?" under a result outside its range: general information
 * on causes, symptoms and what doctors usually do, written on request for this
 * one result. Not a diagnosis, and it says so.
 */
export function ExplainResult({ resultId, testName }: { resultId: string; testName: string }) {
  const [state, setState] = useState<{ open: boolean; loading: boolean; error: string | null; data: Explanation | null }>({
    open: false, loading: false, error: null, data: null,
  });

  async function toggle() {
    if (state.open) return setState({ ...state, open: false });
    if (state.data) return setState({ ...state, open: true });
    setState({ open: true, loading: true, error: null, data: null });
    const result = await callApi<Explanation>("POST", `/api/results/${resultId}/explain`);
    setState({ open: true, loading: false, error: result.ok ? null : (result.data.error ?? "No explanation is available right now."), data: result.ok ? result.data : null });
  }

  return (
    <div className="text-sm">
      <button type="button" onClick={toggle} aria-expanded={state.open} className="text-xs font-medium text-accent">
        {state.open ? "Hide explanation" : "Why might this be?"}
      </button>
      {state.open && (
        <div className="mt-2 space-y-3 rounded-xl border border-border bg-surface-2 p-4" aria-live="polite">
          {state.loading && <p className="text-ink-2">Preparing a plain-language explanation of {testName}…</p>}
          {state.error && <p role="alert" className="text-critical-ink">{state.error}</p>}
          {state.data && (
            <>
              <p className="text-ink">{state.data.summary}</p>
              <Section title="Common reasons" items={state.data.common_causes} />
              <Section title="Symptoms people may notice" items={state.data.symptoms} />
              <Section title="What doctors usually do" items={state.data.what_doctors_do} />
              {state.data.seek_care_promptly_if.length > 0 && (
                <div className="rounded-lg border border-serious/40 bg-serious/10 p-3">
                  <Section title="Get medical care promptly if" items={state.data.seek_care_promptly_if} />
                </div>
              )}
              <Section title="Questions to ask your doctor" items={state.data.questions_for_doctor} />
              <p className="text-xs text-muted">
                General information written by AI for this result, not a diagnosis or treatment advice. Only your doctor can say what it
                means for you. In an emergency, call 112.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="font-medium text-ink">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}
