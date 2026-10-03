"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { callApi } from "./api";
import { buttonClass } from "@/components/ui";

export function ActionButton(props: {
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  children: ReactNode;
  confirm?: string;
  variant?: keyof typeof buttonClass;
  className?: string;
  successMessage?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    if (props.confirm && !window.confirm(props.confirm)) return;
    setMessage(null);
    const result = await callApi<{ redirectTo?: string }>(props.method, props.url, props.body);
    if (!result.ok) {
      setMessage({ ok: false, text: result.data.error ?? "Something went wrong." });
      return;
    }
    if (props.successMessage) setMessage({ ok: true, text: props.successMessage });
    startTransition(() => {
      if (result.data.redirectTo) router.push(result.data.redirectTo);
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" onClick={run} disabled={pending} className={props.className ?? buttonClass[props.variant ?? "secondary"]}>
        {props.children}
      </button>
      {message && <span role="status" className={message.ok ? "text-xs text-good-ink" : "text-xs text-critical-ink"}>{message.text}</span>}
    </span>
  );
}
