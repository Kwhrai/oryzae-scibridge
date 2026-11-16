import { authBypassEnabled } from "@/lib/config";
import { runtimeEnv } from "@/lib/runtime-env";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = await runtimeEnv();
  if (authBypassEnabled(env)) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.redirect(new URL("/cdn-cgi/access/logout", request.url));
}
