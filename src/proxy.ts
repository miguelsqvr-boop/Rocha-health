import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Keeps the Supabase session fresh for page requests and sends signed-out
 * visitors to the sign-in page. This is a convenience only: authorization is
 * enforced by the data layer and the database, never here.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  const publicPath = ["/login", "/auth", "/invite"].some((p) => request.nextUrl.pathname.startsWith(p));
  if (!data.user && !publicPath) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = request.nextUrl.pathname === "/" ? "" : `?next=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // API routes authenticate themselves (and must not have upload bodies buffered here).
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
