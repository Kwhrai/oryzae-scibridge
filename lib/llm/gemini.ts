import { AppError } from "@/lib/app-error";
import { EMBEDDING_DIM, embeddingModel, geminiModel } from "@/lib/config";
import { extractionPrompt, normalizeExtraction, parseModelJson, structurePrompt } from "@/lib/papers/model-json";
import { isDoi, normalizeDoi } from "@/lib/papers/doi";
import type { LlmClient } from "@/lib/llm/types";

type Env = Record<string, string | undefined>;

async function gemini(env: Env, path: string, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) throw new AppError("GEMINI_API_KEY が未設定です。意味検索とAI抽出を使うには設定してください。", 503, "setup");
  const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new AppError(`Gemini API が失敗しました (${response.status})`, 502);
  return response.json();
}

function textOf(payload: unknown): string {
  const record = payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return record.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

export function createGeminiClient(env: Env, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    configured: true,
    async extractMetadata(text, hints) {
      const payload = await gemini(env, `models/${geminiModel(env)}:generateContent`, {
        contents: [{ role: "user", parts: [{ text: extractionPrompt(text, hints) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }, fetchImpl);
      const raw = textOf(payload);
      if (!raw) throw new AppError("モデルから空の応答が返りました", 502);
      let extracted;
      try {
        extracted = normalizeExtraction(parseModelJson(raw));
      } catch {
        throw new AppError("モデルの応答を読み取れませんでした", 502);
      }
      if (extracted.doi && !isDoi(extracted.doi)) extracted.doi = "";
      if (extracted.doi) extracted.doi = normalizeDoi(extracted.doi);
      if (!extracted.title) throw new AppError("タイトルを抽出できませんでした", 422);
      return extracted;
    },
    async structurePaper(input) {
      const payload = await gemini(env, `models/${geminiModel(env)}:generateContent`, {
        contents: [{ role: "user", parts: [{ text: structurePrompt(input) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }, fetchImpl);
      const raw = textOf(payload);
      if (!raw) throw new AppError("モデルから空の応答が返りました", 502);
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
      const model = embeddingModel(env);
      const payload = await gemini(env, `models/${model}:batchEmbedContents`, {
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIM,
        })),
      }, fetchImpl) as { embeddings?: { values?: number[] }[] };
      const vectors = (payload.embeddings ?? []).map((item) => item.values ?? []);
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
