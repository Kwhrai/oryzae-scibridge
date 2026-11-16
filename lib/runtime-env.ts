export type RuntimeEnv = Record<string, string | undefined> & {
  DB?: D1Binding;
  VECTORIZE?: VectorizeBinding;
};

type D1Binding = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results?: T[] }>;
      run(): Promise<unknown>;
    };
    all<T>(): Promise<{ results?: T[] }>;
    run(): Promise<unknown>;
  };
  batch(statements: unknown[]): Promise<unknown>;
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
    if (env.DB && typeof env.DB === "object") merged.DB = env.DB as D1Binding;
    if (env.VECTORIZE && typeof env.VECTORIZE === "object") merged.VECTORIZE = env.VECTORIZE as VectorizeBinding;
  } catch {
    // Vitest and plain Node have no Workers binding.
  }
  return merged;
}
