import { cleanText } from "@/lib/papers/text";

export function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = cleanText(text);
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length && chunks.length < 40) {
    const end = Math.min(clean.length, start + size);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export function embeddingDocuments(input: { title: string; searchText: string; pdfText: string }): string[] {
  const title = cleanText(input.title);
  const profile = cleanText(input.searchText).slice(0, 6000);
  const pdfChunks = chunkText(cleanText(input.pdfText).slice(0, 50_000)).slice(0, 24);
  const documents = [
    profile ? `${title}\n${profile}` : title,
    ...pdfChunks.map((chunk) => (title ? `${title}\n${chunk}` : chunk)),
  ].map((item) => item.trim()).filter(Boolean);
  return documents.slice(0, 28);
}
