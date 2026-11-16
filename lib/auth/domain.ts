export type WorkspaceIdentity = {
  email?: string | null;
  hd?: string | null;
  emailVerified?: boolean | null;
  domain: string;
};

export function isAllowedWorkspaceUser(identity: WorkspaceIdentity): boolean {
  const domain = identity.domain.trim().toLowerCase();
  const email = identity.email?.trim().toLowerCase() ?? "";
  const hd = identity.hd?.trim().toLowerCase() ?? "";
  if (!domain || !email || !email.endsWith(`@${domain}`)) return false;
  if (identity.emailVerified !== true) return false;
  if (hd !== domain) return false;
  return true;
}

/** Auth.js が検証済みの ID トークンから hd を読む。署名の再検証はしない。 */
export function hostedDomainFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  const part = idToken.split(".")[1];
  if (!part) return undefined;
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      Array.from(atob(padded))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
    const payload = JSON.parse(json) as { hd?: unknown };
    return typeof payload.hd === "string" ? payload.hd : undefined;
  } catch {
    return undefined;
  }
}
