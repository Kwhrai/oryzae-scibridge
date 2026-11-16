import { cookies } from "next/headers";
import { allowedDomain, authBypassEnabled } from "@/lib/config";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { runtimeEnv } from "@/lib/runtime-env";

export type SessionUser = { email: string; name: string };

export async function requireUser(): Promise<SessionUser | null> {
  const env = await runtimeEnv();
  if (authBypassEnabled(env)) return { email: "dev@oryzae.site", name: "開発ユーザー" };
  const secret = env.AUTH_SECRET;
  if (!secret) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await readSession(token, secret, { domain: allowedDomain(env) });
  if (!session) return null;
  return { email: session.email, name: session.name };
}
