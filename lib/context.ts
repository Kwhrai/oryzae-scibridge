import { AppError } from "@/lib/app-error";
import { authBypassEnabled, driveRootFolderId, mockModeEnabled } from "@/lib/config";
import { createD1Sql, createNodeSqlite, type Sql } from "@/lib/db/sql";
import { createPaperStore, type PaperStore } from "@/lib/db/paper-store";
import { createAppsScriptDrive } from "@/lib/drive/apps-script";
import { createDisabledDrive, createMockDrive } from "@/lib/drive/mock";
import type { DriveClient } from "@/lib/drive/types";
import { verifyAccessJwt, type AccessIdentity } from "@/lib/auth/access";
import type { AppContext } from "@/lib/library";
import { createGeminiClient } from "@/lib/llm/gemini";
import { createMockLlm } from "@/lib/llm/mock";
import { createWorkersAiClient } from "@/lib/llm/workers-ai";
import type { LlmClient } from "@/lib/llm/types";
import { fetchOpenAccessPdf, lookupCitation } from "@/lib/metadata/lookup";
import { runtimeEnv, type RuntimeEnv } from "@/lib/runtime-env";
import { createMemoryVectorIndex, createVectorizeIndex, type VectorIndex } from "@/lib/vectors";

export type CurrentUser = AccessIdentity;

let cachedSql: Sql | null = null;
let cachedStore: PaperStore | null = null;
let cachedVectors: VectorIndex | null = null;

function unconfiguredLlm(): LlmClient {
  const fail = async () => {
    throw new AppError("GEMINI_API_KEY も Workers AI も未設定です。意味検索とAI抽出を使うにはどちらかを設定してください。", 503, "setup");
  };
  return { configured: false, readPdf: fail, extractMetadata: fail, structurePaper: fail, embed: async () => [] };
}

function llmFor(env: RuntimeEnv, mock: boolean): LlmClient {
  if (mock) return createMockLlm();
  const provider = (env.LLM_PROVIDER || "auto").trim();
  const gemini = Boolean(env.GEMINI_API_KEY?.trim());
  if ((provider === "auto" || provider === "gemini") && gemini) return createGeminiClient(env);
  if ((provider === "auto" || provider === "workers-ai") && env.AI) return createWorkersAiClient(env.AI, env);
  return unconfiguredLlm();
}

function driveFor(env: RuntimeEnv, mock: boolean): DriveClient {
  if (mock) return createMockDrive();
  if (env.APPS_SCRIPT_URL?.trim() && env.APPS_SCRIPT_SECRET?.trim()) return createAppsScriptDrive(env);
  return createDisabledDrive("Drive は Apps Script 経由です。APPS_SCRIPT_URL と APPS_SCRIPT_SECRET を設定してください。");
}

async function database(env: RuntimeEnv, mock: boolean): Promise<{ sql: Sql; vectors: VectorIndex }> {
  if (!cachedSql) {
    if (env.DB) cachedSql = createD1Sql(env.DB);
    else if (mock) cachedSql = await createNodeSqlite();
    else throw new Error("D1 バインディング DB がありません");
  }
  if (!cachedVectors) {
    cachedVectors = !mock && env.VECTORIZE ? createVectorizeIndex(env.VECTORIZE) : createMemoryVectorIndex();
  }
  return { sql: cachedSql, vectors: cachedVectors };
}

export async function getContext(): Promise<AppContext> {
  const env = await runtimeEnv();
  const mock = mockModeEnabled(env);
  const { sql, vectors } = await database(env, mock);
  if (!cachedStore) cachedStore = createPaperStore(sql, vectors);
  const llm = llmFor(env, mock);
  const drive = driveFor(env, mock);
  return {
    store: cachedStore,
    drive,
    llm,
    lookup: (input) => lookupCitation(input),
    fetchOpenAccessPdf: (doi) => fetchOpenAccessPdf(doi),
    driveRootId: driveRootFolderId(env),
    mock,
    llmConfigured: llm.configured,
    driveConfigured: drive.configured,
  };
}

export async function currentUser(request: Request): Promise<CurrentUser | null> {
  const env = await runtimeEnv();
  if (authBypassEnabled(env)) return { email: "dev@oryzae.site", name: "開発ユーザー" };
  return verifyAccessJwt(request.headers.get("cf-access-jwt-assertion"), env);
}

export function resetRuntimeForTests(): void {
  cachedSql = null;
  cachedStore = null;
  cachedVectors = null;
}
