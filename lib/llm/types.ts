import type { ExtractedPaper } from "@/lib/papers/model-json";

export type StructuredNote = Pick<ExtractedPaper, "background" | "objective" | "methods" | "results" | "discussion">;

export type LlmClient = {
  configured: boolean;
  extractMetadata(text: string, hints?: { filename?: string; categories?: string[] }): Promise<ExtractedPaper>;
  structurePaper(input: { title: string; abstract: string; pdfText: string }): Promise<StructuredNote>;
  embed(texts: string[]): Promise<number[][]>;
};
