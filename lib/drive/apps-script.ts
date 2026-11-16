import { AppError } from "@/lib/app-error";
import type { DriveClient, DrivePdf, IngestedPdf } from "@/lib/drive/types";

type ScriptEnv = Record<string, string | undefined>;

let resolvedUrl: string | null = null;

export function clearAppsScriptUrlCache(): void {
  resolvedUrl = null;
}

function withQuery(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function resolveExecUrl(base: string, secret: string, fetchImpl: typeof fetch): Promise<string> {
  if (resolvedUrl) return resolvedUrl;
  const probe = await fetchImpl(withQuery(base, { secret, action: "ping" }), { method: "GET", redirect: "manual" });
  const location = probe.headers.get("location");
  if (!location && !probe.ok) throw new AppError("Apps Script のURLを確認できませんでした", 502);
  resolvedUrl = location ? new URL(location, base).toString() : base;
  return resolvedUrl;
}

async function callScript(env: ScriptEnv, fetchImpl: typeof fetch, action: string, params: Record<string, string>, body?: BodyInit, size?: number): Promise<Record<string, unknown>> {
  const base = env.APPS_SCRIPT_URL?.trim();
  const secret = env.APPS_SCRIPT_SECRET?.trim();
  if (!base || !secret) throw new AppError("Apps Script が未設定です", 503, "setup");
  const target = await resolveExecUrl(base, secret, fetchImpl);
  const url = withQuery(target, { secret, action, ...params });
  const init: RequestInit = { method: body ? "POST" : "GET" };
  if (body) {
    init.body = body;
    init.headers = { "content-type": "text/plain", ...(size ? { "content-length": String(size) } : {}) };
    if (typeof body !== "string") (init as RequestInit & { duplex?: "half" }).duplex = "half";
  }
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new AppError(`Apps Script が失敗しました (${response.status})`, 502);
  const payload = await response.json() as { ok?: boolean; error?: string; files?: DrivePdf[]; result?: IngestedPdf };
  if (!payload.ok) throw new AppError(payload.error || "Apps Script が拒否しました", 502);
  return payload;
}

export function createAppsScriptDrive(env: ScriptEnv, fetchImpl: typeof fetch = fetch): DriveClient {
  return {
    configured: true,
    async listPdfs(rootFolderId) {
      const payload = await callScript(env, fetchImpl, "list", { folderId: rootFolderId });
      return (payload.files as DrivePdf[] | undefined) ?? [];
    },
    async ingest(fileId) {
      const payload = await callScript(env, fetchImpl, "ingest", { fileId });
      return payload.result as IngestedPdf;
    },
    async importUrl(url, category) {
      const payload = await callScript(env, fetchImpl, "importUrl", { url, category });
      return payload.result as IngestedPdf;
    },
    async savePdf(input) {
      const payload = await callScript(env, fetchImpl, "upload", {
        name: input.filename,
        category: input.category,
      }, input.body, input.size);
      return payload.result as IngestedPdf;
    },
    async uploadPdf() {
      throw new AppError("アップロードは savePdf を使います", 400);
    },
  };
}
