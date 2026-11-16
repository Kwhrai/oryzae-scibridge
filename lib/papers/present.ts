import type { PaperRecord } from "@/lib/db/types";

export type PaperSummary = {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  doi: string;
  category: string;
  abstract: string;
  reference: string;
  confirmed: boolean;
  bookmarked: boolean;
  driveUrl: string;
  hasPdf: boolean;
  hasEmbedding: boolean;
  score?: number;
  snippet?: string;
  updatedAt: string;
};

export type PaperDetail = PaperSummary & {
  background: string;
  objective: string;
  methods: string;
  results: string;
  discussion: string;
  rdNote: string;
  crmNote: string;
  linePlan: boolean;
  yakki: boolean;
  pdfChars: number;
  source: string;
};

export function toSummary(paper: PaperRecord): PaperSummary {
  return {
    id: paper.id,
    title: paper.title,
    authors: paper.authors,
    year: paper.year,
    journal: paper.journal,
    doi: paper.doi,
    category: paper.category,
    abstract: paper.abstract.slice(0, 500),
    reference: paper.reference,
    confirmed: paper.confirmed,
    bookmarked: paper.bookmarked,
    driveUrl: paper.driveUrl,
    hasPdf: Boolean(paper.driveFileId || paper.pdfText),
    hasEmbedding: paper.hasEmbedding,
    score: paper.score,
    snippet: paper.snippet,
    updatedAt: paper.updatedAt,
  };
}

export function toDetail(paper: PaperRecord): PaperDetail {
  return {
    ...toSummary(paper),
    abstract: paper.abstract,
    background: paper.background,
    objective: paper.objective,
    methods: paper.methods,
    results: paper.results,
    discussion: paper.discussion,
    rdNote: paper.rdNote,
    crmNote: paper.crmNote,
    linePlan: paper.linePlan,
    yakki: paper.yakki,
    pdfChars: paper.pdfText.length,
    source: paper.source,
  };
}
