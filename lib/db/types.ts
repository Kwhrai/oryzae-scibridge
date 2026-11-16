export type SqlQuery = { text: string; params?: unknown[] };

export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  batch(queries: SqlQuery[]): Promise<void>;
};

export type PaperRecord = {
  id: string;
  legacyId: string | null;
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  doi: string;
  abstract: string;
  reference: string;
  category: string;
  background: string;
  objective: string;
  methods: string;
  results: string;
  discussion: string;
  rdNote: string;
  crmNote: string;
  linePlan: boolean;
  yakki: boolean;
  driveFileId: string | null;
  driveUrl: string;
  pdfText: string;
  searchText: string;
  source: string;
  confirmed: boolean;
  bookmarked: boolean;
  hasEmbedding: boolean;
  createdAt: string;
  updatedAt: string;
  score?: number;
  snippet?: string;
};

export type PaperDraft = {
  title: string;
  authors?: string;
  year?: number | null;
  journal?: string;
  doi?: string;
  abstract?: string;
  reference?: string;
  category?: string;
  background?: string;
  objective?: string;
  methods?: string;
  results?: string;
  discussion?: string;
  rdNote?: string;
  crmNote?: string;
  linePlan?: boolean;
  yakki?: boolean;
  driveFileId?: string | null;
  driveUrl?: string;
  pdfText?: string;
  source?: string;
  confirmed?: boolean;
  legacyId?: string | null;
};

export type PaperPatch = Partial<Omit<PaperDraft, "legacyId" | "source">>;
