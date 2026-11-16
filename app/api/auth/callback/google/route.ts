import { NextResponse } from "next/server";
import { allowedDomain } from "@/lib/config";
import { verifyGoogleIdToken } from "@/lib/auth/google";
import { sessionCookieOptions, signSession, SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = await runtimeEnv();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const cookie = request.headers.get("cookie") ?? "";
  const expected = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("scibridge_oauth_state="))?.slice("scibridge_oauth_state=".length);
  if (!state || !expected || state !== decodeURIComponent(expected)) {
    return NextResponse.redirect(new URL("/login?error=OAuthCallback", url));
  }
  const code = url.searchParams.get("code");
  const clientId = env.AUTH_GOOGLE_ID ?? "";
  const clientSecret = env.AUTH_GOOGLE_SECRET ?? "";
  const secret = env.AUTH_SECRET ?? "";
  if (!code || !clientId || !clientSecret || !secret) {
    return NextResponse.redirect(new URL("/login?error=Configuration", url));
  }
  const redirectUri = new URL("/api/auth/callback/google", url).toString();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) return NextResponse.redirect(new URL("/login?error=OAuthCallback", url));
  const tokens = await tokenResponse.json() as { id_token?: string };
  if (!tokens.id_token) return NextResponse.redirect(new URL("/login?error=OAuthCallback", url));
  try {
    const claims = await verifyGoogleIdToken(tokens.id_token, clientId, allowedDomain(env));
    const session = await signSession({
      email: (claims.email ?? "").toLowerCase(),
      name: claims.name || claims.email || "",
      hd: claims.hd || allowedDomain(env),
    }, secret);
    const response = NextResponse.redirect(new URL("/", url));
    response.cookies.set(SESSION_COOKIE, session, sessionCookieOptions(url.protocol === "https:"));
    response.cookies.set("scibridge_oauth_state", "", { path: "/", maxAge: 0 });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=AccessDenied", url));
  }
}
