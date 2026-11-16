const STOP_TOKENS = new Set([
  "あの",
  "その",
  "この",
  "論文",
  "あった",
  "あったっけ",
  "について",
  "みたいな",
  "みたい",
  "よう",
  "ような",
  "もの",
  "こと",
  "the",
  "and",
  "for",
  "with",
]);

export function cleanText(value: string): string {
  return value.replaceAll("\u0000", "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
}

export function normalizeForSearch(value: string): string {
  return cleanText(value).normalize("NFKC").toLowerCase();
}

export function buildSearchText(parts: Array<string | null | undefined>): string {
  return normalizeForSearch(
    parts
      .map((part) => part ?? "")
      .filter((part) => part.trim())
      .join("\n"),
  ).slice(0, 20_000);
}

export function queryTokens(query: string): string[] {
  const cleaned = normalizeForSearch(query);
  const runs = cleaned.match(/[a-z0-9][a-z0-9.+-]{1,}|[\p{Script=Han}]{2,}|[\p{Script=Katakana}]{2,}|[\p{Script=Hiragana}]{2,}/gu) ?? [];
  const tokens = runs.filter((token) => token.length >= 2 && !STOP_TOKENS.has(token));
  return [...new Set(tokens)].slice(0, 12);
}

export function likePattern(token: string): string {
  const escaped = token.replace(/[\\%_]/g, (mark) => `\\${mark}`);
  return `%${escaped}%`;
}

export function snippetAround(text: string, tokens: string[], radius = 72): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return "";
  const lower = compact.toLowerCase();
  let index = -1;
  for (const token of tokens) {
    const found = lower.indexOf(token.toLowerCase());
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  if (index < 0) return compact.slice(0, radius * 2);
  let start = Math.max(0, index - radius);
  if (start > 0) {
    const space = compact.lastIndexOf(" ", index);
    if (space >= start) start = space + 1;
  }
  const end = Math.min(compact.length, index + tokenLength(tokens, index, lower) + radius);
  const slice = compact.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${slice}${end < compact.length ? "…" : ""}`;
}

function tokenLength(tokens: string[], index: number, lower: string): number {
  for (const token of tokens) {
    if (lower.startsWith(token.toLowerCase(), index)) return token.length;
  }
  return 8;
}

export function assertPdf(bytes: Uint8Array): void {
  const head = new TextDecoder().decode(bytes.slice(0, 5));
  if (!head.startsWith("%PDF")) {
    throw new Error("PDFファイルではありません");
  }
}
