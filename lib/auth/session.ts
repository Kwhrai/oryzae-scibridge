import { auth } from "@/auth";
import { allowedDomain, authBypassEnabled } from "@/lib/config";

export type SessionUser = { email: string; name: string };

export async function requireUser(): Promise<SessionUser | null> {
  if (authBypassEnabled()) return { email: "dev@oryzae.site", name: "開発ユーザー" };
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) return null;
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() ?? "";
  const allowed = Boolean((session?.user as { allowed?: boolean } | undefined)?.allowed);
  const domain = allowedDomain();
  if (!allowed || !email.endsWith(`@${domain}`)) return null;
  return { email, name: session?.user?.name || email };
}
