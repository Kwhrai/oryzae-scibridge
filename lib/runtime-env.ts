import type { D1Like } from "@/lib/db/sql";

export type WorkersAiBinding = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

export type RuntimeEnv = Record<string, string | undefined> & {
  DB?: D1Like;
  VECTORIZE?: VectorizeBinding;
  AI?: WorkersAiBinding;
};

type VectorizeBinding = {
  upsert(vectors: { id: string; values: number[]; metadata?: Record<string, string> }[]): Promise<unknown>;
  query(vector: number[], options: { topK: number; returnMetadata?: "all" | "none" | "indexed" }): Promise<{
    matches?: { id: string; score: number; metadata?: Record<string, unknown> | null }[];
  }>;
  deleteByIds(ids: string[]): Promise<unknown>;
};

export async function runtimeEnv(): Promise<RuntimeEnv> {
  const merged: RuntimeEnv = { ...process.env };
  try {
    const loaded = await import("cloudflare:workers") as { env?: Record<string, unknown> };
    const env = loaded.env ?? {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") merged[key] = value;
    }
    if (env.DB && typeof env.DB === "object") merged.DB = env.DB as D1Like;
    if (env.VECTORIZE && typeof env.VECTORIZE === "object") merged.VECTORIZE = env.VECTORIZE as VectorizeBinding;
    if (env.AI && typeof env.AI === "object" && "run" in (env.AI as object)) merged.AI = env.AI as WorkersAiBinding;
  } catch {
    // Vitest and plain Node have no Workers binding.
  }
  return merged;
}
