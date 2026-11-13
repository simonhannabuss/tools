import { NextResponse, type NextRequest } from "next/server";

// Paths reachable without signing in. Everything else needs a session cookie here,
// and a fully verified (password + 2FA) session in requireUser() on the server.
const PUBLIC = ["/login", "/oauth/callback/", "/media/s/", "/health", "/_next/", "/favicon"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("st_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
