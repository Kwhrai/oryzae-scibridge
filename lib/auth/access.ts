import { allowedDomain } from "@/lib/config";
import { verifyRs256Jwt } from "@/lib/auth/jwt";

export type AccessIdentity = { email: string; name: string };

type AccessClaims = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  name?: string;
};

type Jwk = JsonWebKey & { kid?: string };

const certCache = new Map<string, { keys: Jwk[]; expires: number }>();
const identityCache = new Map<string, { identity: AccessIdentity; expires: number }>();

export function accessHost(team: string): string {
  const trimmed = team.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return trimmed.includes(".") ? trimmed : `${trimmed}.cloudflareaccess.com`;
}

export function accessCertUrl(team: string): string {
  return `https://${accessHost(team)}/cdn-cgi/access/certs`;
}

export function accessClaimsAllowed(claims: AccessClaims, input: { aud: string; team: string; domain: string; now?: number }): boolean {
  const now = input.now ?? Date.now();
  const issuer = `https://${accessHost(input.team)}`;
  if (claims.iss !== issuer) return false;
  const audience = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
  if (!audience.includes(input.aud)) return false;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) return false;
  const email = claims.email?.trim().toLowerCase() ?? "";
  const domain = input.domain.trim().toLowerCase();
  return Boolean(email && domain && email.endsWith(`@${domain}`));
}

function headerKid(token: string): string {
  try {
    const part = token.split(".")[0] ?? "";
    const padded = part.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (part.length % 4)) % 4);
    const header = JSON.parse(atob(padded)) as { kid?: string };
    return header.kid ?? "";
  } catch {
    return "";
  }
}

export async function verifyAccessJwt(token: string | null | undefined, env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): Promise<AccessIdentity | null> {
  const team = env.CF_ACCESS_TEAM_DOMAIN?.trim() ?? "";
  const aud = env.CF_ACCESS_AUD?.trim() ?? "";
  if (!token || !team || !aud) return null;
  const cached = identityCache.get(token);
  if (cached && cached.expires > Date.now()) return cached.identity;
  const keys = await accessKeys(team, fetchImpl);
  const kid = headerKid(token);
  const jwk = keys.find((key) => key.kid === kid) ?? keys[0];
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const claims = await verifyRs256Jwt(token, key) as AccessClaims | null;
  if (!claims || !accessClaimsAllowed(claims, { aud, team, domain: allowedDomain(env) })) return null;
  const identity = { email: claims.email!.trim().toLowerCase(), name: claims.name || claims.email! };
  identityCache.set(token, { identity, expires: Math.min(claims.exp! * 1000, Date.now() + 5 * 60 * 1000) });
  return identity;
}

async function accessKeys(team: string, fetchImpl: typeof fetch): Promise<Jwk[]> {
  const cached = certCache.get(team);
  if (cached && cached.expires > Date.now()) return cached.keys;
  const response = await fetchImpl(accessCertUrl(team));
  if (!response.ok) return [];
  const payload = await response.json() as { keys?: Jwk[] };
  const keys = payload.keys ?? [];
  certCache.set(team, { keys, expires: Date.now() + 60 * 60 * 1000 });
  return keys;
}
