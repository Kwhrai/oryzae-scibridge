import type { ExtractedPaper } from "@/lib/papers/model-json";

export type DrivePdf = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  webViewLink: string;
  size: number;
};

export type IngestedPdf = {
  driveFileId: string;
  driveUrl: string;
  category: string;
  name: string;
  size: number;
  extraction: ExtractedPaper | null;
  plainText: string;
};

export type DriveClient = {
  configured: boolean;
  listPdfs(rootFolderId: string): Promise<DrivePdf[]>;
  ingest(fileId: string): Promise<IngestedPdf>;
  importUrl(url: string, category: string): Promise<IngestedPdf>;
  savePdf(input: { filename: string; category: string; body: BodyInit; size: number }): Promise<IngestedPdf>;
  uploadPdf(input: { rootFolderId: string; category: string; filename: string; bytes: Uint8Array }): Promise<{ id: string; webViewLink: string }>;
};
