import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Protect `/knowledge-bases` and `/chat`.
 * `/login`, `/api/auth`, `/api/register`, and static assets are not matched.
 */
export default auth((req) => {
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/knowledge-bases/:path*", "/chat/:path*"],
};
