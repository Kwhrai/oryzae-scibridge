import { paperFilename } from "@/lib/drive/filename";
import type { DriveClient, DrivePdf, IngestedPdf } from "@/lib/drive/types";

type StoredFile = DrivePdf & { bytes: Uint8Array; category: string };

function asIngest(file: StoredFile): IngestedPdf {
  return {
    driveFileId: file.id,
    driveUrl: file.webViewLink,
    category: file.category,
    name: file.name,
    size: file.bytes.byteLength,
    extraction: null,
    plainText: new TextDecoder().decode(file.bytes),
  };
}

export function createMockDrive(initial: Array<{ id: string; name: string; category: string; bytes: Uint8Array }> = []): DriveClient {
  const files = new Map<string, StoredFile>();
  const client: DriveClient = {
    configured: true,
    async listPdfs() {
      return [...files.values()].map(({ id, name, parentId, parentName, webViewLink, size }) => ({
        id, name, parentId, parentName, webViewLink, size,
      }));
    },
    async ingest(fileId) {
      const file = files.get(fileId);
      if (!file) throw new Error("モックDriveにファイルがありません");
      return asIngest(file);
    },
    async importUrl() {
      return {
        driveFileId: "",
        driveUrl: "",
        category: "",
        name: "",
        size: 0,
        extraction: null,
        plainText: "",
      };
    },
    async savePdf(input) {
      const encoded = typeof input.body === "string" ? input.body : await new Response(input.body).text();
      const bytes = Uint8Array.from(atob(encoded.replace(/\s+/g, "")), (char) => char.charCodeAt(0));
      const saved = await client.uploadPdf({
        rootFolderId: "root",
        category: input.category,
        filename: input.filename,
        bytes,
      });
      return asIngest(files.get(saved.id)!);
    },
    async uploadPdf(input) {
      const id = `mock-${files.size + 1}-${Math.random().toString(36).slice(2, 8)}`;
      const stored: StoredFile = {
        id,
        name: paperFilename(input.filename, null),
        parentId: `folder-${input.category}`,
        parentName: input.category,
        webViewLink: `https://drive.google.com/file/d/${id}/view`,
        size: input.bytes.byteLength,
        bytes: input.bytes,
        category: input.category || "未分類",
      };
      files.set(id, stored);
      return { id, webViewLink: stored.webViewLink };
    },
  };
  for (const file of initial) {
    files.set(file.id, {
      id: file.id,
      name: file.name,
      parentId: `folder-${file.category}`,
      parentName: file.category,
      webViewLink: `https://drive.google.com/file/d/${file.id}/view`,
      size: file.bytes.byteLength,
      bytes: file.bytes,
      category: file.category,
    });
  }
  return client;
}

export function createDisabledDrive(message: string): DriveClient {
  const fail = async () => {
    const { AppError } = await import("@/lib/app-error");
    throw new AppError(message, 503, "setup");
  };
  return { configured: false, listPdfs: fail, ingest: fail, importUrl: fail, savePdf: fail, uploadPdf: fail };
}
