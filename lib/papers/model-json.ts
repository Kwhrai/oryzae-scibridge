export type ExtractedPaper = {
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  doi: string;
  abstract: string;
  category: string;
  background: string;
  objective: string;
  methods: string;
  results: string;
  discussion: string;
};

export function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) {
    throw new Error("モデルの応答がJSONではありません");
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeExtraction(value: unknown): ExtractedPaper {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const yearRaw = record.year;
  const yearNumber = typeof yearRaw === "number" ? yearRaw : typeof yearRaw === "string" && yearRaw.trim() ? Number(yearRaw) : NaN;
  const year = Number.isInteger(yearNumber) && yearNumber >= 1900 && yearNumber <= 2100 ? yearNumber : null;
  return {
    title: asString(record.title),
    authors: asString(record.authors),
    year,
    journal: asString(record.journal),
    doi: asString(record.doi),
    abstract: asString(record.abstract),
    category: asString(record.category),
    background: asString(record.background),
    objective: asString(record.objective),
    methods: asString(record.methods),
    results: asString(record.results),
    discussion: asString(record.discussion),
  };
}

export function extractionPrompt(text: string, hints?: { filename?: string; categories?: string[] }): string {
  const categories = hints?.categories?.filter(Boolean).join("、") || "（既存カテゴリなし。短い日本語の研究テーマ名を提案）";
  return [
    "あなたは米麹・麹菌・甘酒を扱う食品R&Dの司書です。次の論文テキストから書誌と読み物メモを抽出し、JSONだけを返してください。",
    "本文に明示されていない項目は空文字、year は null。推測で埋めない。",
    "category は可能なら次の既存名から選ぶ: " + categories,
    "フィールド: title, authors, year, journal, doi, abstract, category, background, objective, methods, results, discussion",
    "background=背景, objective=目的, methods=方法, results=結果, discussion=考察。各200〜400字程度。日本語で書く（原文が英語でも日本語に要約）。",
    "abstract は要旨。日本語が本文にあればそれを優先し、なければ日本語で要約。",
    "doi は 10.xxxx/xxxx の形だけ。無ければ空文字。",
    hints?.filename ? `ファイル名: ${hints.filename}` : "",
    "本文:",
    text.slice(0, 12_000),
  ].filter(Boolean).join("\n\n");
}

export function structurePrompt(input: { title: string; abstract: string; pdfText: string }): string {
  return [
    "論文を、社内R&Dが判断に使う構造化メモにしてください。JSONだけを返す。",
    "フィールド: background, objective, methods, results, discussion",
    "それぞれ日本語。本文に無いことは空文字。数値や比較がある結果は残す。各250字前後。",
    `タイトル: ${input.title}`,
    `要旨: ${input.abstract}`,
    "本文:",
    (input.pdfText || input.abstract).slice(0, 14_000),
  ].join("\n\n");
}
