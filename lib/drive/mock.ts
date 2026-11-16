import { paperFilename } from "@/lib/drive/filename";
import type { DriveClient, DrivePdf } from "@/lib/drive/types";

type StoredFile = DrivePdf & { bytes: Uint8Array; category: string };

export function createMockDrive(initial: Array<{ id: string; name: string; category: string; bytes: Uint8Array }> = []): DriveClient {
  const files = new Map<string, StoredFile>();
  for (const file of initial) {
    files.set(file.id, {
      id: file.id,
      name: file.name,
      parentId: `folder-${file.category}`,
      parentName: file.category,
      webViewLink: `https://drive.google.com/file/d/${file.id}/view`,
      bytes: file.bytes,
      category: file.category,
    });
  }
  return {
    configured: true,
    async listPdfs() {
      return [...files.values()].map(({ id, name, parentId, parentName, webViewLink }) => ({ id, name, parentId, parentName, webViewLink }));
    },
    async download(fileId) {
      const file = files.get(fileId);
      if (!file) throw new Error("モックDriveにファイルがありません");
      return file.bytes;
    },
    async uploadPdf(input) {
      const id = `mock-${files.size + 1}-${Math.random().toString(36).slice(2, 8)}`;
      const name = paperFilename(input.filename, null);
      const stored: StoredFile = {
        id,
        name,
        parentId: `folder-${input.category}`,
        parentName: input.category,
        webViewLink: `https://drive.google.com/file/d/${id}/view`,
        bytes: input.bytes,
        category: input.category || "未分類",
      };
      files.set(id, stored);
      return { id, webViewLink: stored.webViewLink };
    },
  };
}

export function createDisabledDrive(message: string): DriveClient {
  const fail = async () => {
    const { AppError } = await import("@/lib/app-error");
    throw new AppError(message, 503, "setup");
  };
  return { configured: false, listPdfs: fail, download: fail, uploadPdf: fail };
}
