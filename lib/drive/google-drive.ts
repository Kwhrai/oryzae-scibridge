import { AppError } from "@/lib/app-error";
import { normalizePrivateKey } from "@/lib/config";
import { escapeDriveQuery, sanitizeFilename } from "@/lib/drive/filename";
import type { DriveClient, DrivePdf } from "@/lib/drive/types";
import { signRs256Jwt } from "@/lib/auth/jwt";

type DriveFile = { id?: string; name?: string; mimeType?: string; webViewLink?: string };

let tokenCache: { token: string; expires: number; key: string } | null = null;

async function accessToken(email: string, privateKey: string, fetchImpl: typeof fetch): Promise<string> {
  const cacheKey = `${email}:${privateKey.slice(0, 40)}`;
  if (tokenCache && tokenCache.key === cacheKey && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signRs256Jwt(privateKey, {
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new AppError("Drive のアクセストークンを取得できませんでした", 502);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new AppError("Drive のアクセストークンが空です", 502);
  tokenCache = { token: payload.access_token, expires: Date.now() + 50 * 60 * 1000, key: cacheKey };
  return payload.access_token;
}

function webLink(file: DriveFile): string {
  return file.webViewLink || (file.id ? `https://drive.google.com/file/d/${file.id}/view` : "");
}

export function createGoogleDriveClient(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): DriveClient {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ? normalizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) : "";
  if (!email || !key) throw new AppError("Google Drive のサービスアカウントが未設定です", 503, "setup");

  async function driveFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await accessToken(email!, key, fetchImpl);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetchImpl(`https://www.googleapis.com${path}`, { ...init, headers });
  }

  async function listChildren(folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken = "";
    do {
      const query = new URLSearchParams({
        q: `'${escapeDriveQuery(folderId)}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
        supportsAllDrives: "true",
        includeItemsFromAllDrives: "true",
        corpora: "allDrives",
        pageSize: "100",
      });
      if (pageToken) query.set("pageToken", pageToken);
      const response = await driveFetch(`/drive/v3/files?${query}`);
      if (!response.ok) throw new AppError("Drive の一覧を取得できませんでした", 502);
      const payload = await response.json() as { files?: DriveFile[]; nextPageToken?: string };
      files.push(...(payload.files ?? []));
      pageToken = payload.nextPageToken ?? "";
    } while (pageToken);
    return files;
  }

  const folderCache = new Map<string, string>();

  async function ensureSubfolder(rootFolderId: string, category: string): Promise<string> {
    const name = category.trim() || "未分類";
    const cacheKey = `${rootFolderId}:${name}`;
    const cached = folderCache.get(cacheKey);
    if (cached) return cached;
    const existing = (await listChildren(rootFolderId)).find((file) => file.mimeType === "application/vnd.google-apps.folder" && file.name === name && file.id);
    if (existing?.id) {
      folderCache.set(cacheKey, existing.id);
      return existing.id;
    }
    const response = await driveFetch("/drive/v3/files?supportsAllDrives=true&fields=id", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [rootFolderId] }),
    });
    if (!response.ok) throw new AppError("Drive にカテゴリフォルダを作れませんでした", 502);
    const created = await response.json() as { id?: string };
    if (!created.id) throw new AppError("Drive にカテゴリフォルダを作れませんでした", 502);
    folderCache.set(cacheKey, created.id);
    return created.id;
  }

  return {
    configured: true,
    async listPdfs(rootFolderId) {
      const pdfs: DrivePdf[] = [];
      const walk = async (folderId: string, parentName: string | null) => {
        for (const file of await listChildren(folderId)) {
          if (!file.id || !file.name) continue;
          if (file.mimeType === "application/vnd.google-apps.folder") await walk(file.id, file.name);
          else if (file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
            pdfs.push({ id: file.id, name: file.name, parentId: folderId, parentName, webViewLink: webLink(file) });
          }
        }
      };
      await walk(rootFolderId, null);
      return pdfs;
    },
    async download(fileId) {
      const response = await driveFetch(`/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
      if (!response.ok) throw new AppError("Drive から PDF をダウンロードできませんでした", 502);
      return new Uint8Array(await response.arrayBuffer());
    },
    async uploadPdf(input) {
      const parent = await ensureSubfolder(input.rootFolderId, input.category);
      const metadata = { name: sanitizeFilename(input.filename), parents: [parent], mimeType: "application/pdf" };
      const form = new FormData();
      form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
      const fileBytes = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
      form.append("file", new Blob([fileBytes], { type: "application/pdf" }), metadata.name);
      const response = await driveFetch("/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new AppError("Drive へのアップロードに失敗しました", 502);
      const created = await response.json() as DriveFile;
      if (!created.id) throw new AppError("Drive へのアップロードに失敗しました", 502);
      return { id: created.id, webViewLink: webLink(created) };
    },
  };
}
