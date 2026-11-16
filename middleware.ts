import { NextResponse, type NextRequest } from "next/server";
import { allowedDomain, authBypassEnabled } from "@/lib/config";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { runtimeEnv } from "@/lib/runtime-env";

export async function middleware(request: NextRequest) {
  const env = await runtimeEnv();
  if (authBypassEnabled(env)) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/auth")) return NextResponse.next();
  const secret = env.AUTH_SECRET ?? "";
  const session = await readSession(request.cookies.get(SESSION_COOKIE)?.value, secret, { domain: allowedDomain(env) });
  if (path.startsWith("/login")) {
    if (session) return NextResponse.redirect(new URL("/", request.nextUrl));
    return NextResponse.next();
  }
  if (!session) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.nextUrl));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
