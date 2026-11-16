export type ScoredId = { id: string; score: number };

export function keywordScore(tokens: string[], phrase: string, haystack: string): number {
  if (!haystack) return 0;
  const hay = haystack.toLowerCase();
  const phraseNorm = phrase.trim().toLowerCase();
  let score = 0;
  if (phraseNorm.length >= 2 && hay.includes(phraseNorm)) score += 5;
  if (tokens.length === 0) return score;
  let hits = 0;
  const titleZone = hay.slice(0, 500);
  for (const token of tokens) {
    const needle = token.toLowerCase();
    if (!hay.includes(needle)) continue;
    hits += 1;
    score += 2;
    if (titleZone.includes(needle)) score += 1.5;
  }
  score += hits / tokens.length;
  return score;
}

export function mergeScores(keyword: ScoredId[], vector: ScoredId[]): ScoredId[] {
  const keywordMax = Math.max(1, ...keyword.map((item) => item.score));
  const byId = new Map<string, { keyword: number; vector: number }>();
  for (const item of keyword) {
    byId.set(item.id, { keyword: item.score, vector: 0 });
  }
  for (const item of vector) {
    const current = byId.get(item.id) ?? { keyword: 0, vector: 0 };
    current.vector = item.score;
    byId.set(item.id, current);
  }
  const useVector = vector.length > 0;
  const merged: ScoredId[] = [];
  for (const [id, scores] of byId) {
    const keywordNorm = scores.keyword / keywordMax;
    const vectorNorm = Math.max(0, Math.min(1, scores.vector));
    const score = useVector ? 0.72 * vectorNorm + 0.28 * keywordNorm : keywordNorm;
    if (score > 0) merged.push({ id, score });
  }
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

/** テストとモック用。同じ語を含む文が近くなる決定的なベクトル。本番の意味検索は Gemini。 */
export function hashEmbedding(text: string, dim = 768): number[] {
  const vector = new Array<number>(dim).fill(0);
  const tokens = text.normalize("NFKC").toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}\p{Script=Katakana}]{2}/gu) ?? [];
  for (const token of tokens) {
    let hash = 2166136261;
    for (let index = 0; index < token.length; index += 1) {
      hash ^= token.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    const slot = Math.abs(hash) % dim;
    vector[slot] += hash % 2 === 0 ? 1 : -1;
  }
  let norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    vector[0] = 1;
    norm = 1;
  }
  return vector.map((value) => value / norm);
}
