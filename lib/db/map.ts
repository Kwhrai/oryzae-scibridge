import type { PaperRecord } from "@/lib/db/types";

function asString(value: unknown): string {
  return value == null ? "" : String(value);
}

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function asYear(value: unknown): number | null {
  if (value == null || value === "") return null;
  const year = Number(value);
  return Number.isFinite(year) ? year : null;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date(0).toISOString();
}

export function mapPaper(row: Record<string, unknown>): PaperRecord {
  return {
    id: asString(row.id),
    legacyId: row.legacy_id == null || row.legacy_id === "" ? null : asString(row.legacy_id),
    title: asString(row.title),
    authors: asString(row.authors),
    year: asYear(row.year),
    journal: asString(row.journal),
    doi: asString(row.doi),
    abstract: asString(row.abstract),
    reference: asString(row.reference),
    category: asString(row.category) || "未分類",
    background: asString(row.background),
    objective: asString(row.objective),
    methods: asString(row.methods),
    results: asString(row.results),
    discussion: asString(row.discussion),
    rdNote: asString(row.rd_note),
    crmNote: asString(row.crm_note),
    linePlan: asBool(row.line_plan),
    yakki: asBool(row.yakki),
    driveFileId: row.drive_file_id == null || row.drive_file_id === "" ? null : asString(row.drive_file_id),
    driveUrl: asString(row.drive_url),
    pdfText: asString(row.pdf_text),
    searchText: asString(row.search_text),
    source: asString(row.source),
    confirmed: asBool(row.confirmed),
    bookmarked: asBool(row.bookmarked),
    hasEmbedding: asBool(row.has_embedding),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
    score: row.score == null ? undefined : Number(row.score),
    snippet: row.snippet == null ? undefined : asString(row.snippet),
  };
}

export function toVectorLiteral(values: number[]): string {
  if (values.length !== 768) {
    throw new Error(`埋め込みの次元が ${values.length} です。768 が必要です`);
  }
  return `[${values.map((value) => (Number.isFinite(value) ? Number(value).toFixed(7) : "0")).join(",")}]`;
}
