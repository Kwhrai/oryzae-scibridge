import { GoogleGenAI } from "@google/genai";
import { AppError } from "@/lib/app-error";
import { EMBEDDING_DIM, embeddingModel, geminiModel } from "@/lib/config";
import { extractionPrompt, normalizeExtraction, parseModelJson, structurePrompt } from "@/lib/papers/model-json";
import { normalizeDoi, isDoi } from "@/lib/papers/doi";
import type { LlmClient } from "@/lib/llm/types";

export function createGeminiClient(apiKey: string): LlmClient {
  const ai = new GoogleGenAI({ apiKey });

  async function generateJson(prompt: string): Promise<unknown> {
    const response = await ai.models.generateContent({
      model: geminiModel(),
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.2 },
    });
    const text = response.text;
    if (!text) throw new AppError("モデルから空の応答が返りました", 502);
    try {
      return parseModelJson(text);
    } catch {
      throw new AppError("モデルの応答を読み取れませんでした", 502);
    }
  }

  return {
    configured: true,
    async extractMetadata(text, hints) {
      const extracted = normalizeExtraction(await generateJson(extractionPrompt(text, hints)));
      if (extracted.doi && !isDoi(extracted.doi)) extracted.doi = "";
      if (extracted.doi) extracted.doi = normalizeDoi(extracted.doi);
      if (!extracted.title) throw new AppError("タイトルを抽出できませんでした", 422);
      return extracted;
    },
    async structurePaper(input) {
      const extracted = normalizeExtraction(await generateJson(structurePrompt(input)));
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
      const response = await ai.models.embedContent({
        model: embeddingModel(),
        contents: texts,
        config: { outputDimensionality: EMBEDDING_DIM },
      });
      const vectors = (response.embeddings ?? []).map((item) => item.values ?? []);
      if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== EMBEDDING_DIM)) {
        throw new AppError(`埋め込みの次元が ${EMBEDDING_DIM} ではありません。GEMINI_EMBEDDING_MODEL を確認してください`, 502);
      }
      return vectors;
    },
  };
}

export function createDisabledLlm(): LlmClient {
  const fail = async () => {
    throw new AppError("GEMINI_API_KEY が未設定です。意味検索とAI抽出を使うには設定してください。", 503, "setup");
  };
  return { configured: false, extractMetadata: fail, structurePaper: fail, embed: fail };
}
