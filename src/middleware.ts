import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie set by AuthContext on login, cleared on logout.
// This is a redirect gate for page navigation — NOT a cryptographic auth check.
// Real auth enforcement lives in API routes (Firebase token) and Firestore security rules.
const SESSION_COOKIE = "__session";

export function middleware(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE);
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/chat/:path*",
    "/admin/:path*",
    "/account/:path*",
    "/references/:path*",
  ],
};
