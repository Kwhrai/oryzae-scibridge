export const SESSION_COOKIE = "scibridge_session";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionPayload = { email: string; name: string; hd: string; exp: number };

function encode(value: string): string {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function decode(value: string): string {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return atob(padded);
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export async function signSession(payload: Omit<SessionPayload, "exp">, secret: string, now = Date.now()): Promise<string> {
  const body = encode(JSON.stringify({ ...payload, exp: now + SESSION_MS }));
  return `${body}.${await sign(secret, body)}`;
}

export async function readSession(
  token: string | undefined,
  secret: string,
  options: { now?: number; domain: string } = { domain: "oryzae.site" },
): Promise<SessionPayload | null> {
  const now = options.now ?? Date.now();
  if (!token || !secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await sign(secret, body);
  if (expected.length !== signature.length) return null;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  if (mismatch !== 0) return null;
  try {
    const payload = JSON.parse(decode(body)) as SessionPayload;
    if (!payload.email || !payload.exp || payload.exp < now) return null;
    const domain = options.domain.toLowerCase();
    if (!payload.email.toLowerCase().endsWith(`@${domain}`)) return null;
    if (payload.hd?.toLowerCase() !== domain) return null;
    return { ...payload, email: payload.email.toLowerCase() };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_MS / 1000,
  };
}
