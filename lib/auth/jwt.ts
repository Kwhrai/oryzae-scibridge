function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  return base64UrlToBytes(body.replaceAll("+", "-").replaceAll("/", "_"));
}

export async function signRs256Jwt(privateKeyPem: string, payload: Record<string, unknown>, kid?: string): Promise<string> {
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT", ...(kid ? { kid } : {}) })));
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsigned = `${header}.${body}`;
  const der = pemToDer(privateKeyPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  ));
  return `${unsigned}.${bytesToBase64Url(signature)}`;
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function verifyRs256Jwt(token: string, key: CryptoKey): Promise<Record<string, unknown> | null> {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const signatureBytes = base64UrlToBytes(signature);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signatureBytes.buffer.slice(signatureBytes.byteOffset, signatureBytes.byteOffset + signatureBytes.byteLength) as ArrayBuffer,
    new TextEncoder().encode(`${header}.${body}`),
  );
  if (!valid) return null;
  return decodeJwtPayload(token);
}

export function derToPem(der: ArrayBuffer, label: string): string {
  const b64 = bytesToBase64Url(new Uint8Array(der)).replaceAll("-", "+").replaceAll("_", "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const lines = padded.match(/.{1,64}/g)?.join("\n") ?? padded;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}
