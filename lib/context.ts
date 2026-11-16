import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "@/lib/app-error";
import { driveConfigured, driveRootFolderId, llmConfigured, mockModeEnabled } from "@/lib/config";
import { createPaperStore } from "@/lib/db/paper-store";
import { createNeonDb } from "@/lib/db/neon";
import { createDisabledDrive, createMockDrive } from "@/lib/drive/mock";
import { createGoogleDriveClient } from "@/lib/drive/google-drive";
import { createDisabledLlm, createGeminiClient } from "@/lib/llm/gemini";
import { createMockLlm } from "@/lib/llm/mock";
import { reindex, type AppContext } from "@/lib/library";
import { fetchOpenAccessPdf, lookupCitation } from "@/lib/metadata/lookup";
import { papersFromCsv } from "@/lib/papers/csv";
import { extractPdfText } from "@/lib/pdf/extract";

const globalForApp = globalThis as { scibridge?: Promise<AppContext> };

function loadSeedCsv(): string {
  return readFileSync(join(process.cwd(), "data", "papers.csv"), "utf8");
}

async function buildContext(): Promise<AppContext> {
  const mock = mockModeEnabled();
  if (!mock && !process.env.DATABASE_URL) {
    throw new AppError("データベースが未設定です。DATABASE_URL を設定してください。手順は docs/SETUP.md です。", 503, "setup");
  }
  const db = mock ? await (await import("@/lib/db/pglite")).createPgliteDb() : createNeonDb(process.env.DATABASE_URL!);
  const store = createPaperStore(db);
  await store.ensureSchema();
  await store.seedMigrated(papersFromCsv(loadSeedCsv()));
  const llm = mock ? createMockLlm() : llmConfigured() ? createGeminiClient(process.env.GEMINI_API_KEY!) : createDisabledLlm();
  const drive = mock
    ? createMockDrive()
    : driveConfigured()
      ? createGoogleDriveClient()
      : createDisabledDrive("Google Drive が未設定です。サービスアカウントを共有ドライブのメンバーにしてください。");
  const ctx: AppContext = {
    store,
    llm,
    drive,
    extractText: extractPdfText,
    lookup: lookupCitation,
    fetchOpenAccessPdf,
    driveRootId: driveRootFolderId(),
    mock,
    llmConfigured: llm.configured,
    driveConfigured: drive.configured,
  };
  if (mock) await reindex(ctx, 20);
  return ctx;
}

export function getContext(): Promise<AppContext> {
  if (!globalForApp.scibridge) {
    globalForApp.scibridge = buildContext().catch((error) => {
      globalForApp.scibridge = undefined;
      throw error;
    });
  }
  return globalForApp.scibridge;
}
