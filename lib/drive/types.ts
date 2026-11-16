export type DrivePdf = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  webViewLink: string;
};

export type DriveClient = {
  configured: boolean;
  listPdfs(rootFolderId: string): Promise<DrivePdf[]>;
  download(fileId: string): Promise<Uint8Array>;
  uploadPdf(input: { rootFolderId: string; category: string; filename: string; bytes: Uint8Array }): Promise<{ id: string; webViewLink: string }>;
};
