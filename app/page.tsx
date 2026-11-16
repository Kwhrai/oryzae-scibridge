import { cookies } from "next/headers";
import { LibraryApp } from "@/components/library/library-app";
import { allowedDomain, authBypassEnabled } from "@/lib/config";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { runtimeEnv } from "@/lib/runtime-env";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const env = await runtimeEnv();
  if (authBypassEnabled(env)) {
    return <LibraryApp userName="開発ユーザー" mock />;
  }
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await readSession(token, env.AUTH_SECRET ?? "", { domain: allowedDomain(env) });
  if (!session) redirect("/login");
  return (
    <LibraryApp
      userName={session.name || session.email}
      mock={false}
      logout={<a className="user-chip" href="/api/auth/logout">{session.name || session.email} / ログアウト</a>}
    />
  );
}
