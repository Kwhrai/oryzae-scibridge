import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
