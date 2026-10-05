import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { createSupabaseServerClient, type ServerSupabase } from "@/lib/supabase/server";
import type { MemberRow } from "@/lib/data/types";

export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Translate database errors raised by RLS and the RPCs into HTTP responses. */
export function fromDbError(error: PostgrestError | null): ApiError | null {
  if (!error) return null;
  if (error.message === "identity_confirmation_required") {
    return new ApiError(409, "Identity confirmation required", { code: "identity_confirmation_required", detail: error.details });
  }
  switch (error.code) {
    case "42501":
      return new ApiError(403, error.message.includes("row-level security") ? "You do not have permission to do that." : error.message);
    case "28000":
      return new ApiError(401, "Please sign in.");
    case "P0002":
      return new ApiError(404, error.message);
    case "22023":
    case "22P02":
    case "23514":
      return new ApiError(400, error.message);
    case "55000":
      return new ApiError(409, error.message);
    default:
      return new ApiError(500, "Something went wrong. Please try again.");
  }
}

export function throwIfDbError(error: PostgrestError | null) {
  const apiError = fromDbError(error);
  if (apiError) throw apiError;
}

interface HandlerContext {
  viewer: Viewer & { member: MemberRow };
  supabase: ServerSupabase;
}

/**
 * Wraps a route handler: requires an active member, and refuses changes while
 * a Super Admin is in "View as" mode (it is a read-only preview). Permission
 * to touch a specific member's data is then enforced by RLS and the RPCs.
 */
export function route<Args extends unknown[]>(
  options: { mutates: boolean; superAdmin?: boolean },
  handler: (ctx: HandlerContext, ...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      const viewer = await getViewer();
      if (!viewer) throw new ApiError(401, "Please sign in.");
      if (!viewer.member) throw new ApiError(403, "Your account is not active.");
      if (options.superAdmin && !viewer.isSuperAdmin) throw new ApiError(403, "Only the Super Admin can do that.");
      if (options.mutates && viewer.viewAs) {
        throw new ApiError(403, `You are viewing as ${viewer.viewAs.display_name}. Return to Super Admin to make changes.`);
      }
      const supabase = await createSupabaseServerClient();
      return await handler({ viewer: viewer as HandlerContext["viewer"], supabase }, ...args);
    } catch (error) {
      if (error instanceof ApiError) return json({ error: error.message, detail: error.detail }, error.status);
      console.error(error);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}

export async function readJson<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Invalid request body.");
  }
  try {
    return parse(body);
  } catch {
    throw new ApiError(400, "Invalid request.");
  }
}
