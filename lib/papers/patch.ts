import { AppError } from "@/lib/app-error";
import type { PaperPatch } from "@/lib/db/types";

const TEXT_FIELDS = [
  "title",
  "authors",
  "journal",
  "doi",
  "abstract",
  "reference",
  "category",
  "background",
  "objective",
  "methods",
  "results",
  "discussion",
  "rdNote",
  "crmNote",
] as const;

export function readPatch(body: unknown): PaperPatch {
  if (!body || typeof body !== "object") throw new AppError("更新内容が空です");
  const record = body as Record<string, unknown>;
  const patch: PaperPatch = {};
  for (const key of TEXT_FIELDS) {
    if (!(key in record)) continue;
    if (typeof record[key] !== "string") throw new AppError("更新内容の型が違います");
    patch[key] = record[key];
  }
  if ("year" in record) {
    if (record.year == null || record.year === "") patch.year = null;
    else if (typeof record.year === "number" && Number.isInteger(record.year)) patch.year = record.year;
    else throw new AppError("年は数値で指定してください");
  }
  if ("confirmed" in record) {
    if (typeof record.confirmed !== "boolean") throw new AppError("確認状態が不正です");
    patch.confirmed = record.confirmed;
  }
  if (patch.title !== undefined && !patch.title.trim()) throw new AppError("タイトルは空にできません");
  if (Object.keys(patch).length === 0) throw new AppError("更新する項目がありません");
  return patch;
}

export function readExtracted(body: unknown) {
  if (!body || typeof body !== "object") throw new AppError("書誌情報がありません");
  const record = body as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? record[key] : "");
  const year = typeof record.year === "number" && Number.isInteger(record.year) ? record.year : null;
  return {
    title: text("title"),
    authors: text("authors"),
    year,
    journal: text("journal"),
    doi: text("doi"),
    abstract: text("abstract"),
    category: text("category"),
    background: text("background"),
    objective: text("objective"),
    methods: text("methods"),
    results: text("results"),
    discussion: text("discussion"),
    summary: text("summary"),
    bodyText: text("bodyText"),
  };
}
