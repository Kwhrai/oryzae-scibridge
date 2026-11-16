import { AppError } from "@/lib/app-error";
import { assertPdf, cleanText } from "@/lib/papers/text";

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    assertPdf(bytes);
  } catch {
    throw new AppError("PDFファイルではありません");
  }
  try {
    const { extractText } = await import("unpdf");
    const result = await extractText(bytes, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    return cleanText(text ?? "").slice(0, 80_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDFの本文を読めませんでした";
    throw new AppError(`PDFの本文を読めませんでした: ${message}`, 422);
  }
}
