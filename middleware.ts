import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { authBypassEnabled } from "@/lib/config";

export default auth((request) => {
  if (authBypassEnabled()) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/auth")) return NextResponse.next();
  const loggedIn = Boolean(request.auth?.user);
  if (path.startsWith("/login")) {
    if (loggedIn) return NextResponse.redirect(new URL("/", request.nextUrl));
    return NextResponse.next();
  }
  if (!loggedIn) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    const url = new URL("/login", request.nextUrl);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
