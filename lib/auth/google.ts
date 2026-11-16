import { isAllowedWorkspaceUser } from "@/lib/auth/domain";
import { verifyRs256Jwt } from "@/lib/auth/jwt";

export type GoogleIdClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
};

type Jwk = JsonWebKey & { kid?: string };

let cachedCerts: { keys: Jwk[]; expires: number } | null = null;

export function googleIdClaimsAllowed(claims: GoogleIdClaims, clientId: string, domain: string, now = Date.now()): boolean {
  const issuer = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  const audience = Array.isArray(claims.aud) ? claims.aud.includes(clientId) : claims.aud === clientId;
  if (!issuer || !audience) return false;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return false;
  return isAllowedWorkspaceUser({
    email: claims.email,
    hd: claims.hd,
    emailVerified: claims.email_verified === true,
    domain,
  });
}

export function googleAuthorizeUrl(input: { clientId: string; redirectUri: string; state: string; domain: string }): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("hd", input.domain);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", input.state);
  return url.toString();
}

async function googleCerts(fetchImpl: typeof fetch): Promise<Jwk[]> {
  if (cachedCerts && cachedCerts.expires > Date.now()) return cachedCerts.keys;
  const response = await fetchImpl("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("Google の公開鍵を取得できませんでした");
  const payload = await response.json() as { keys?: Jwk[] };
  cachedCerts = { keys: payload.keys ?? [], expires: Date.now() + 60 * 60 * 1000 };
  return cachedCerts.keys;
}

export async function verifyGoogleIdToken(token: string, clientId: string, domain: string, fetchImpl: typeof fetch = fetch): Promise<GoogleIdClaims> {
  const headerJson = JSON.parse(new TextDecoder().decode(base64UrlToBytes(token.split(".")[0] ?? ""))) as { kid?: string };
  const keys = await googleCerts(fetchImpl);
  const jwk = keys.find((key) => key.kid === headerJson.kid);
  if (!jwk) throw new Error("ID トークンの署名鍵が見つかりません");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const claims = await verifyRs256Jwt(token, key);
  if (!claims || !googleIdClaimsAllowed(claims as GoogleIdClaims, clientId, domain)) {
    throw new Error("この Google アカウントでは利用できません");
  }
  return claims as GoogleIdClaims;
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
