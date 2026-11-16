import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import { AppError } from "@/lib/app-error";
import { normalizePrivateKey } from "@/lib/config";
import { escapeDriveQuery, sanitizeFilename } from "@/lib/drive/filename";
import type { DriveClient, DrivePdf } from "@/lib/drive/types";

type DriveFile = drive_v3.Schema$File;

function webLink(file: DriveFile): string {
  return file.webViewLink || (file.id ? `https://drive.google.com/file/d/${file.id}/view` : "");
}

export function createGoogleDriveClient(): DriveClient {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !key) {
    throw new AppError("Google Drive のサービスアカウントが未設定です", 503, "setup");
  }
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: normalizePrivateKey(key) },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  const drive = google.drive({ version: "v3", auth });
  const folderCache = new Map<string, string>();

  async function listChildren(folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const response = await drive.files.list({
        q: `'${escapeDriveQuery(folderId)}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, webViewLink, parents)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: "allDrives",
        pageSize: 100,
        pageToken,
      });
      files.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
    return files;
  }

  async function ensureSubfolder(rootFolderId: string, category: string): Promise<string> {
    const name = category.trim() || "未分類";
    const cacheKey = `${rootFolderId}:${name}`;
    const cached = folderCache.get(cacheKey);
    if (cached) return cached;
    const children = await listChildren(rootFolderId);
    const existing = children.find((file) => file.mimeType === "application/vnd.google-apps.folder" && file.name === name && file.id);
    if (existing?.id) {
      folderCache.set(cacheKey, existing.id);
      return existing.id;
    }
    const created = await drive.files.create({
      requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [rootFolderId] },
      supportsAllDrives: true,
      fields: "id",
    });
    if (!created.data.id) throw new AppError("Drive にカテゴリフォルダを作れませんでした", 502);
    folderCache.set(cacheKey, created.data.id);
    return created.data.id;
  }

  return {
    configured: true,
    async listPdfs(rootFolderId) {
      const pdfs: DrivePdf[] = [];
      const walk = async (folderId: string, parentName: string | null) => {
        const children = await listChildren(folderId);
        for (const file of children) {
          if (!file.id || !file.name) continue;
          if (file.mimeType === "application/vnd.google-apps.folder") {
            await walk(file.id, file.name);
          } else if (file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
            pdfs.push({
              id: file.id,
              name: file.name,
              parentId: folderId,
              parentName: parentName,
              webViewLink: webLink(file),
            });
          }
        }
      };
      await walk(rootFolderId, null);
      return pdfs;
    },
    async download(fileId) {
      const response = await drive.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
      return new Uint8Array(response.data as ArrayBuffer);
    },
    async uploadPdf(input) {
      const parent = await ensureSubfolder(input.rootFolderId, input.category);
      const created = await drive.files.create({
        requestBody: { name: sanitizeFilename(input.filename), parents: [parent], mimeType: "application/pdf" },
        media: { mimeType: "application/pdf", body: Readable.from(Buffer.from(input.bytes)) },
        supportsAllDrives: true,
        fields: "id, webViewLink",
      });
      if (!created.data.id) throw new AppError("Drive へのアップロードに失敗しました", 502);
      return { id: created.data.id, webViewLink: webLink(created.data) };
    },
  };
}
