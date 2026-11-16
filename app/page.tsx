import { headers } from "next/headers";
import { LibraryApp } from "@/components/library/library-app";
import { mockModeEnabled } from "@/lib/config";
import { currentUser } from "@/lib/context";
import { runtimeEnv } from "@/lib/runtime-env";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const env = await runtimeEnv();
  const incoming = await headers();
  const requestHeaders = new Headers();
  incoming.forEach((value, key) => requestHeaders.set(key, value));
  const user = await currentUser(new Request("https://scibridge.local", { headers: requestHeaders }));
  if (!user) redirect("/login");
  return <LibraryApp userName={user.name} mock={mockModeEnabled(env)} />;
}
