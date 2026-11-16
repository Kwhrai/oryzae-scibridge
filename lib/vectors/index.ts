import { EMBEDDING_DIM } from "@/lib/config";
import { cosineSimilarity } from "@/lib/papers/rank";

export type VectorHit = { paperId: string; score: number };

export type VectorPoint = { id: string; values: number[]; paperId: string };

export type VectorIndex = {
  upsert(points: VectorPoint[]): Promise<void>;
  query(values: number[], topK: number): Promise<VectorHit[]>;
  deleteByIds(ids: string[]): Promise<void>;
};

type VectorizeBinding = {
  upsert(vectors: { id: string; values: number[]; metadata?: Record<string, string> }[]): Promise<unknown>;
  query(vector: number[], options: { topK: number; returnMetadata?: "all" | "none" | "indexed" }): Promise<{
    matches?: { id: string; score: number; metadata?: Record<string, unknown> | null }[];
  }>;
  deleteByIds(ids: string[]): Promise<unknown>;
};

export function assertEmbedding(values: number[]): void {
  if (values.length !== EMBEDDING_DIM) {
    throw new Error(`埋め込みの次元が ${values.length} です。Vectorize の索引は ${EMBEDDING_DIM} 次元です`);
  }
}

export function createMemoryVectorIndex(): VectorIndex {
  const rows = new Map<string, { values: number[]; paperId: string }>();
  return {
    async upsert(points) {
      for (const point of points) {
        assertEmbedding(point.values);
        rows.set(point.id, { values: point.values, paperId: point.paperId });
      }
    },
    async deleteByIds(ids) {
      for (const id of ids) rows.delete(id);
    },
    async query(values, topK) {
      assertEmbedding(values);
      const best = new Map<string, number>();
      for (const row of rows.values()) {
        const score = cosineSimilarity(values, row.values);
        best.set(row.paperId, Math.max(best.get(row.paperId) ?? -1, score));
      }
      return [...best.entries()]
        .map(([paperId, score]) => ({ paperId, score }))
        .sort((left, right) => right.score - left.score)
        .slice(0, topK);
    },
  };
}

export function createVectorizeIndex(index: VectorizeBinding): VectorIndex {
  return {
    async upsert(points) {
      if (points.length === 0) return;
      for (const point of points) assertEmbedding(point.values);
      await index.upsert(points.map((point) => ({
        id: point.id,
        values: point.values,
        metadata: { paperId: point.paperId },
      })));
    },
    async deleteByIds(ids) {
      if (ids.length === 0) return;
      await index.deleteByIds(ids);
    },
    async query(values, topK) {
      assertEmbedding(values);
      const result = await index.query(values, { topK, returnMetadata: "all" });
      const best = new Map<string, number>();
      for (const match of result.matches ?? []) {
        const paperId = typeof match.metadata?.paperId === "string" ? match.metadata.paperId : "";
        if (!paperId) continue;
        best.set(paperId, Math.max(best.get(paperId) ?? -1, match.score));
      }
      return [...best.entries()]
        .map(([paperId, score]) => ({ paperId, score }))
        .sort((left, right) => right.score - left.score);
    },
  };
}
