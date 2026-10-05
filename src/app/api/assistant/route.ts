import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ApiError, json, readJson, route } from "@/lib/api";
import { runAssistant } from "@/lib/ai/assistant";
import { env } from "@/lib/env";

export const maxDuration = 120;

const ChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(30)
    .refine((m) => m[0]!.role === "user" && m[m.length - 1]!.role === "user", "Conversation must start and end with a user message"),
});

/** The health assistant. Works in "View as" too, scoped to the viewed member. */
export const POST = route({ mutates: false }, async ({ supabase, viewer }, request: Request) => {
  if (!env.anthropicConfigured()) throw new ApiError(503, "The assistant is not configured (missing Anthropic API key).");
  const { messages } = await readJson(request, (v) => ChatInput.parse(v));
  try {
    return json(await runAssistant({ supabase, viewer, history: messages }));
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new ApiError(429, "The assistant is busy. Try again in a minute.");
    if (error instanceof Anthropic.APIError) throw new ApiError(502, "The assistant is unavailable right now.");
    throw error;
  }
});
