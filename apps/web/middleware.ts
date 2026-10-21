import { type NextRequest, NextResponse } from "next/server";

const PUBLIC = ["/sign-in"];
const PUBLIC_EXACT = ["/"]; // the landing page

// Cheap gate only: the API verifies the token on every call.
export function middleware(req: NextRequest) {
  const signedIn = req.cookies.has("cs_session");
  const path = req.nextUrl.pathname;
  const isPublic = PUBLIC_EXACT.includes(path) || PUBLIC.some((p) => path.startsWith(p));
  if (!signedIn && !isPublic) return NextResponse.redirect(new URL("/sign-in", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|icons|favicon.ico|logo.svg).*)"] };
