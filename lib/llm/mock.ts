import { EMBEDDING_DIM } from "@/lib/config";
import { hashEmbedding } from "@/lib/papers/rank";
import { extractDoi } from "@/lib/papers/doi";
import { yearFromText } from "@/lib/papers/doi";
import type { LlmClient } from "@/lib/llm/types";

function firstLine(text: string): string {
  return text.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 180) ?? "";
}

export function createMockLlm(): LlmClient {
  return {
    configured: true,
    async extractMetadata(text, hints) {
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      return {
        title: hints?.filename?.replace(/\.pdf$/i, "") || firstLine(text) || "無題",
        authors: "",
        year: yearFromText(text),
        journal: "",
        doi: extractDoi(text) ?? "",
        abstract: lines.slice(0, 3).join(" ").slice(0, 800),
        category: hints?.categories?.[0] ?? "未分類",
        background: lines[0] ? `（モック抽出）背景: ${lines[0].slice(0, 180)}` : "",
        objective: "",
        methods: "",
        results: lines[1] ? `（モック抽出）結果: ${lines[1].slice(0, 180)}` : "",
        discussion: "",
      };
    },
    async structurePaper(input) {
      const source = (input.pdfText || input.abstract || input.title).replace(/\s+/g, " ").trim();
      const slice = (start: number) => source.slice(start, start + 160);
      return {
        background: source ? `背景: ${slice(0)}` : "",
        objective: source.length > 40 ? `目的: ${slice(40)}` : "",
        methods: source.length > 80 ? `方法: ${slice(80)}` : "",
        results: source.length > 120 ? `結果: ${slice(120)}` : "",
        discussion: source.length > 160 ? `考察: ${slice(160)}` : "",
      };
    },
    async embed(texts) {
      return texts.map((text) => hashEmbedding(text, EMBEDDING_DIM));
    },
  };
}
