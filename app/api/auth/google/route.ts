import { NextResponse } from "next/server";
import { allowedDomain } from "@/lib/config";
import { googleAuthorizeUrl } from "@/lib/auth/google";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = await runtimeEnv();
  const clientId = env.AUTH_GOOGLE_ID;
  if (!clientId || !env.AUTH_GOOGLE_SECRET || !env.AUTH_SECRET) {
    return NextResponse.redirect(new URL("/login?error=Configuration", request.url));
  }
  const state = crypto.randomUUID();
  const redirectUri = new URL("/api/auth/callback/google", request.url).toString();
  const response = NextResponse.redirect(googleAuthorizeUrl({
    clientId,
    redirectUri,
    state,
    domain: allowedDomain(env),
  }));
  response.cookies.set("scibridge_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: 600,
  });
  return response;
}
