export const EMBEDDING_DIM = 768;
export const DEFAULT_DOMAIN = "oryzae.site";
export const DEFAULT_DRIVE_FOLDER_ID = "1f8kMQgoqvp9H0IIwzD6BAZ2-vcqIHHun";

type Env = Record<string, string | undefined>;

export function allowedDomain(env: Env = process.env): string {
  return (env.ALLOWED_EMAIL_DOMAIN || DEFAULT_DOMAIN).trim().toLowerCase();
}

export function driveRootFolderId(env: Env = process.env): string {
  return (env.DRIVE_ROOT_FOLDER_ID || DEFAULT_DRIVE_FOLDER_ID).trim();
}

export function geminiModel(env: Env = process.env): string {
  return (env.GEMINI_MODEL || "gemini-2.5-flash").trim();
}

export function embeddingModel(env: Env = process.env): string {
  return (env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001").trim();
}

export function authBypassEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production") return false;
  return env.AUTH_DISABLED === "true";
}

export function mockModeEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.VERCEL_ENV === "production") return false;
  return env.SCI_BRIDGE_MOCK === "1";
}

export function driveConfigured(env: Env = process.env): boolean {
  return Boolean(env.APPS_SCRIPT_URL?.trim() && env.APPS_SCRIPT_SECRET?.trim());
}

export function accessConfigured(env: Env = process.env): boolean {
  return Boolean(env.CF_ACCESS_TEAM_DOMAIN?.trim() && env.CF_ACCESS_AUD?.trim());
}

export function workersAiModel(env: Env = process.env): string {
  return (env.WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct").trim();
}

export function workersAiEmbeddingModel(env: Env = process.env): string {
  return (env.WORKERS_AI_EMBEDDING_MODEL || "@cf/baai/bge-base-en-v1.5").trim();
}

export function llmConfigured(env: Env = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim());
}
