import { AppError } from "@/lib/app-error";
import { driveConfigured, driveRootFolderId, llmConfigured, mockModeEnabled } from "@/lib/config";
import { createPaperStore } from "@/lib/db/paper-store";
import { createD1Sql, type D1Like } from "@/lib/db/sql";
import { createDisabledDrive, createMockDrive } from "@/lib/drive/mock";
import { createGoogleDriveClient } from "@/lib/drive/google-drive";
import { createDisabledLlm, createGeminiClient } from "@/lib/llm/gemini";
import { createMockLlm } from "@/lib/llm/mock";
import { reindex, type AppContext } from "@/lib/library";
import { fetchOpenAccessPdf, lookupCitation } from "@/lib/metadata/lookup";
import { papersFromCsv } from "@/lib/papers/csv";
import { extractPdfText } from "@/lib/pdf/extract";
import { runtimeEnv } from "@/lib/runtime-env";
import bundledCsv from "../data/papers.csv?raw";
import { createMemoryVectorIndex, createVectorizeIndex } from "@/lib/vectors";

const globalForApp = globalThis as { scibridge?: Promise<AppContext> };

async function buildContext(): Promise<AppContext> {
  const env = await runtimeEnv();
  const mock = mockModeEnabled(env);
  if (!env.DB) {
    throw new AppError("D1 が未接続です。wrangler.jsonc の DB バインディングとマイグレーションを確認してください。手順は docs/SETUP.md です。", 503, "setup");
  }
  // Local wrangler does not simulate Vectorize. Mock mode keeps vectors in memory.
  const vectors = !mock && env.VECTORIZE ? createVectorizeIndex(env.VECTORIZE) : createMemoryVectorIndex();
  const store = createPaperStore(createD1Sql(env.DB as D1Like), vectors);
  await store.ensureSchema();
  await store.seedMigrated(papersFromCsv(bundledCsv));
  const llm = mock ? createMockLlm() : llmConfigured(env) ? createGeminiClient(env) : createDisabledLlm();
  const drive = mock
    ? createMockDrive()
    : driveConfigured(env)
      ? createGoogleDriveClient(env)
      : createDisabledDrive("Google Drive が未設定です。サービスアカウントを共有ドライブのメンバーにしてください。");
  const ctx: AppContext = {
    store,
    llm,
    drive,
    extractText: extractPdfText,
    lookup: lookupCitation,
    fetchOpenAccessPdf,
    driveRootId: driveRootFolderId(env),
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
