import { headers } from "next/headers";
import { currentUser } from "@/lib/context";

export type SessionUser = { email: string; name: string };

export async function requireUser(): Promise<SessionUser | null> {
  const incoming = await headers();
  const requestHeaders = new Headers();
  incoming.forEach((value, key) => requestHeaders.set(key, value));
  return currentUser(new Request("https://scibridge.local", { headers: requestHeaders }));
}
