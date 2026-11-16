import { NextResponse } from "next/server";
import { authBypassEnabled } from "@/lib/config";
import { runtimeEnv } from "@/lib/runtime-env";

export async function middleware(request: Request) {
  const env = await runtimeEnv();
  if (authBypassEnabled(env)) return NextResponse.next();
  const url = new URL(request.url);
  if (url.pathname === "/login") return NextResponse.next();
  if (request.headers.get("cf-access-jwt-assertion")) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
