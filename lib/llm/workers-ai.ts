import { AppError } from "@/lib/app-error";
import { EMBEDDING_DIM, workersAiEmbeddingModel, workersAiModel } from "@/lib/config";
import { extractionPrompt, normalizeExtraction, parseModelJson, structurePrompt } from "@/lib/papers/model-json";
import { isDoi, normalizeDoi } from "@/lib/papers/doi";
import type { WorkersAiBinding } from "@/lib/runtime-env";
import type { LlmClient } from "@/lib/llm/types";

type Env = Record<string, string | undefined>;

async function complete(ai: WorkersAiBinding, env: Env, prompt: string): Promise<string> {
  const result = await ai.run(workersAiModel(env), {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 900,
  }) as { response?: string };
  return result.response ?? "";
}

export function createWorkersAiClient(ai: WorkersAiBinding, env: Env): LlmClient {
  return {
    configured: true,
    async readPdf() {
      throw new AppError("PDFの読み取りは Apps Script 側で行います。Gemini のキーが無い場合は、書誌を手で補ってください。", 422);
    },
    async extractMetadata(text, hints) {
      const raw = await complete(ai, env, extractionPrompt(text.slice(0, 4000), hints));
      let extracted;
      try {
        extracted = normalizeExtraction(parseModelJson(raw));
      } catch {
        throw new AppError("Workers AI の応答を読み取れませんでした", 502);
      }
      if (extracted.doi && !isDoi(extracted.doi)) extracted.doi = "";
      if (extracted.doi) extracted.doi = normalizeDoi(extracted.doi);
      if (!extracted.title) throw new AppError("タイトルを抽出できませんでした", 422);
      return extracted;
    },
    async structurePaper(input) {
      const raw = await complete(ai, env, structurePrompt({
        title: input.title,
        abstract: input.abstract,
        pdfText: input.pdfText.slice(0, 4000),
      }));
      const extracted = normalizeExtraction(parseModelJson(raw));
      return {
        background: extracted.background,
        objective: extracted.objective,
        methods: extracted.methods,
        results: extracted.results,
        discussion: extracted.discussion,
      };
    },
    async embed(texts) {
      if (texts.length === 0) return [];
      const result = await ai.run(workersAiEmbeddingModel(env), { text: texts.map((text) => text.slice(0, 800)) }) as { data?: number[][]; result?: { data?: number[][] } };
      const vectors = result.data ?? result.result?.data ?? [];
      if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== EMBEDDING_DIM)) {
        throw new AppError(`埋め込みの次元が ${EMBEDDING_DIM} ではありません。Workers AI のモデルと Vectorize の索引を揃えてください。`, 502);
      }
      return vectors;
    },
  };
}
