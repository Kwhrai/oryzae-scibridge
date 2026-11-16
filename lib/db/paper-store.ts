import { AppError } from "@/lib/app-error";
import { applyMigrations, type Sql } from "@/lib/db/sql";
import { mapPaper } from "@/lib/db/map";
import type { PaperDraft, PaperPatch, PaperRecord } from "@/lib/db/types";
import type { MigratedPaper } from "@/lib/papers/csv";
import { buildSearchText, likePattern, queryTokens, snippetAround } from "@/lib/papers/text";
import { keywordScore, mergeScores } from "@/lib/papers/rank";
import { normalizeDoi } from "@/lib/papers/doi";
import type { VectorIndex } from "@/lib/vectors";

const PAPER_COLUMNS = `
  p.id, p.legacy_id, p.title, p.authors, p.year, p.journal, p.doi, p.abstract, p.reference,
  p.category, p.background, p.objective, p.methods, p.results, p.discussion, p.rd_note, p.crm_note,
  p.line_plan, p.yakki, p.drive_file_id, p.drive_url, p.pdf_text, p.search_text, p.source, p.confirmed,
  p.created_at, p.updated_at
`;

function selectPapers(): string {
  return `
    SELECT ${PAPER_COLUMNS},
      EXISTS (SELECT 1 FROM bookmarks b WHERE b.paper_id = p.id AND b.user_email = ?) AS bookmarked,
      p.embedded AS has_embedding
    FROM papers p
  `;
}

function searchTextOf(input: PaperDraft | PaperRecord): string {
  return buildSearchText([
    input.title,
    input.authors,
    input.journal,
    input.doi,
    input.category,
    input.abstract,
    input.reference,
    input.background,
    input.objective,
    input.methods,
    input.results,
    input.discussion,
    input.rdNote,
    input.crmNote,
    (input.pdfText ?? "").slice(0, 8000),
  ]);
}

function bit(value: boolean | undefined): number {
  return value ? 1 : 0;
}

function now(): string {
  return new Date().toISOString();
}

export type PaperStore = {
  ensureSchema(): Promise<void>;
  stats(): Promise<{ total: number; embedded: number; withPdf: number }>;
  categories(): Promise<{ name: string; count: number }[]>;
  seedMigrated(papers: MigratedPaper[]): Promise<number>;
  search(args: { userEmail: string; query: string; category: string | null; embedding: number[] | null; limit?: number }): Promise<{ papers: PaperRecord[]; mode: "browse" | "keyword" | "hybrid" }>;
  get(id: string, userEmail: string): Promise<PaperRecord | null>;
  findByDoi(doi: string): Promise<{ id: string; title: string } | null>;
  listForDriveMatch(): Promise<{ id: string; title: string; doi: string; driveFileId: string | null }[]>;
  insert(input: PaperDraft): Promise<PaperRecord>;
  update(id: string, patch: PaperPatch): Promise<PaperRecord | null>;
  setBookmark(id: string, userEmail: string, bookmarked: boolean): Promise<void>;
  replaceChunks(paperId: string, chunks: { content: string; embedding: number[] }[]): Promise<void>;
  listMissingEmbeddings(limit: number): Promise<{ id: string; title: string; searchText: string; pdfText: string }[]>;
};

export function createPaperStore(sql: Sql, vectors: VectorIndex): PaperStore {
  let ready = false;

  async function ensureSchema() {
    if (ready) return;
    try {
      await applyMigrations(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      throw new AppError(`D1 のテーブルを用意できませんでした。${message}`, 503, "setup");
    }
    ready = true;
  }

  async function get(id: string, userEmail: string): Promise<PaperRecord | null> {
    const rows = await sql.all<Record<string, unknown>>(`${selectPapers()} WHERE p.id = ?`, [userEmail, id]);
    return rows[0] ? mapPaper(rows[0]) : null;
  }

  return {
    ensureSchema,
    async stats() {
      const [row] = await sql.all<{ total: number; embedded: number; with_pdf: number }>(`
        SELECT
          (SELECT COUNT(*) FROM papers) AS total,
          (SELECT COUNT(*) FROM papers WHERE embedded = 1) AS embedded,
          (SELECT COUNT(*) FROM papers WHERE pdf_text <> '' OR drive_file_id IS NOT NULL) AS with_pdf
      `);
      return {
        total: Number(row?.total ?? 0),
        embedded: Number(row?.embedded ?? 0),
        withPdf: Number(row?.with_pdf ?? 0),
      };
    },
    async categories() {
      const rows = await sql.all<{ category: string; count: number }>(
        "SELECT category, COUNT(*) AS count FROM papers GROUP BY category ORDER BY count DESC, category",
      );
      return rows.map((row) => ({ name: row.category, count: Number(row.count) }));
    },
    async seedMigrated(papers) {
      await ensureSchema();
      let inserted = 0;
      const timestamp = now();
      for (const paper of papers) {
        const id = `csv-${paper.legacyId}`;
        const searchText = searchTextOf({
          title: paper.title,
          abstract: paper.abstract,
          reference: paper.reference,
          category: paper.category,
          rdNote: paper.rdNote,
          crmNote: paper.crmNote,
          doi: paper.doi,
        });
        const rows = await sql.all<{ id: string }>(
          `INSERT INTO papers (
            id, legacy_id, title, abstract, reference, category, rd_note, crm_note, line_plan, yakki,
            doi, drive_url, drive_file_id, year, search_text, source, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv', ?, ?)
          ON CONFLICT (legacy_id) DO NOTHING
          RETURNING id`,
          [
            id,
            paper.legacyId,
            paper.title,
            paper.abstract,
            paper.reference,
            paper.category,
            paper.rdNote,
            paper.crmNote,
            bit(paper.linePlan),
            bit(paper.yakki),
            paper.doi,
            paper.driveUrl,
            paper.driveFileId,
            paper.year,
            searchText,
            timestamp,
            timestamp,
          ],
        );
        if (rows[0]) inserted += 1;
      }
      return inserted;
    },
    async search({ userEmail, query, category, embedding, limit = 50 }) {
      await ensureSchema();
      const safeLimit = Math.min(100, Math.max(1, Math.floor(limit)));
      const tokens = queryTokens(query);
      const phrase = query.trim();
      if (!phrase) {
        const params: unknown[] = [userEmail];
        let where = "";
        if (category) {
          params.push(category);
          where = " WHERE p.category = ?";
        }
        const rows = await sql.all<Record<string, unknown>>(
          `${selectPapers()}${where} ORDER BY (p.year IS NULL), p.year DESC, p.updated_at DESC LIMIT ${safeLimit}`,
          params,
        );
        return { papers: rows.map((row) => mapPaper(row)), mode: "browse" as const };
      }

      const keywordParams: unknown[] = [userEmail];
      const tokenClauses: string[] = [];
      for (const token of tokens) {
        keywordParams.push(likePattern(token));
        tokenClauses.push("p.search_text LIKE ? ESCAPE '\\'");
      }
      const filters: string[] = [];
      if (category) {
        keywordParams.push(category);
        filters.push("p.category = ?");
      }
      if (tokenClauses.length) filters.push(`(${tokenClauses.join(" OR ")})`);
      const keywordSql = `${selectPapers()}${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""} LIMIT 80`;
      const keywordPapers = tokens.length
        ? (await sql.all<Record<string, unknown>>(keywordSql, keywordParams)).map((row) => mapPaper(row))
        : [];

      let vectorScores: { id: string; score: number }[] = [];
      if (embedding) {
        try {
          const hits = await vectors.query(embedding, 30);
          vectorScores = hits
            .filter((hit) => Number.isFinite(hit.score))
            .map((hit) => ({ id: hit.paperId, score: hit.score }));
        } catch (error) {
          console.error(error);
          vectorScores = [];
        }
      }

      const byId = new Map(keywordPapers.map((paper) => [paper.id, paper]));
      const missing = vectorScores.map((item) => item.id).filter((id) => !byId.has(id));
      if (missing.length) {
        const params: unknown[] = [userEmail, ...missing];
        let extra = "";
        if (category) {
          params.push(category);
          extra = " AND p.category = ?";
        }
        const placeholders = missing.map(() => "?").join(", ");
        const rows = await sql.all<Record<string, unknown>>(
          `${selectPapers()} WHERE p.id IN (${placeholders})${extra}`,
          params,
        );
        for (const row of rows) {
          const paper = mapPaper(row);
          byId.set(paper.id, paper);
        }
      }

      const keywordRanked = [...byId.values()].map((paper) => ({
        id: paper.id,
        score: keywordScore(tokens, phrase, paper.searchText),
      })).filter((item) => item.score > 0);
      const merged = mergeScores(keywordRanked, vectorScores.map((item) => ({ id: item.id, score: item.score })));
      const mode = embedding && vectorScores.length ? "hybrid" as const : "keyword" as const;
      const papers = merged.slice(0, safeLimit).flatMap((item) => {
        const paper = byId.get(item.id);
        if (!paper) return [];
        if (category && paper.category !== category) return [];
        return [{
          ...paper,
          score: item.score,
          snippet: snippetAround([paper.title, paper.abstract, paper.rdNote].filter(Boolean).join("\n"), tokens),
        }];
      });
      return { papers, mode };
    },
    get,
    async findByDoi(doi) {
      const normalized = normalizeDoi(doi);
      if (!normalized) return null;
      const rows = await sql.all<{ id: string; title: string }>(
        "SELECT id, title FROM papers WHERE lower(doi) = lower(?) LIMIT 1",
        [normalized],
      );
      return rows[0] ?? null;
    },
    async listForDriveMatch() {
      const rows = await sql.all<{ id: string; title: string; doi: string; drive_file_id: string | null }>(
        "SELECT id, title, doi, drive_file_id FROM papers",
      );
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        doi: row.doi,
        driveFileId: row.drive_file_id,
      }));
    },
    async insert(input) {
      await ensureSchema();
      const id = crypto.randomUUID();
      const timestamp = now();
      const searchText = searchTextOf(input);
      await sql.run(
        `INSERT INTO papers (
          id, legacy_id, title, authors, year, journal, doi, abstract, reference, category,
          background, objective, methods, results, discussion, rd_note, crm_note, line_plan, yakki,
          drive_file_id, drive_url, pdf_text, search_text, source, confirmed, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?
        )`,
        [
          id,
          input.legacyId ?? null,
          input.title,
          input.authors ?? "",
          input.year ?? null,
          input.journal ?? "",
          input.doi ? normalizeDoi(input.doi) : "",
          input.abstract ?? "",
          input.reference ?? "",
          input.category?.trim() || "未分類",
          input.background ?? "",
          input.objective ?? "",
          input.methods ?? "",
          input.results ?? "",
          input.discussion ?? "",
          input.rdNote ?? "",
          input.crmNote ?? "",
          bit(input.linePlan),
          bit(input.yakki),
          input.driveFileId || null,
          input.driveUrl ?? "",
          input.pdfText ?? "",
          searchText,
          input.source ?? "manual",
          bit(input.confirmed),
          timestamp,
          timestamp,
        ],
      );
      const created = await get(id, "");
      if (!created) throw new AppError("論文を保存したあと読めませんでした", 500);
      return created;
    },
    async update(id, patch) {
      const current = await get(id, "");
      if (!current) return null;
      const next: PaperRecord = {
        ...current,
        ...patch,
        doi: patch.doi != null ? (patch.doi ? normalizeDoi(patch.doi) : "") : current.doi,
        category: patch.category != null ? patch.category.trim() || "未分類" : current.category,
        driveFileId: patch.driveFileId !== undefined ? patch.driveFileId || null : current.driveFileId,
      };
      await sql.run(
        `UPDATE papers SET
          title = ?, authors = ?, year = ?, journal = ?, doi = ?, abstract = ?, reference = ?,
          category = ?, background = ?, objective = ?, methods = ?, results = ?, discussion = ?,
          rd_note = ?, crm_note = ?, line_plan = ?, yakki = ?, drive_file_id = ?, drive_url = ?,
          pdf_text = ?, search_text = ?, confirmed = ?, updated_at = ?
         WHERE id = ?`,
        [
          next.title,
          next.authors,
          next.year,
          next.journal,
          next.doi,
          next.abstract,
          next.reference,
          next.category,
          next.background,
          next.objective,
          next.methods,
          next.results,
          next.discussion,
          next.rdNote,
          next.crmNote,
          bit(next.linePlan),
          bit(next.yakki),
          next.driveFileId,
          next.driveUrl,
          next.pdfText,
          searchTextOf(next),
          bit(next.confirmed),
          now(),
          id,
        ],
      );
      return get(id, "");
    },
    async setBookmark(id, userEmail, bookmarked) {
      const existing = await get(id, userEmail);
      if (!existing) throw new AppError("論文が見つかりません", 404);
      if (bookmarked) {
        await sql.run(
          "INSERT INTO bookmarks (user_email, paper_id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_email, paper_id) DO NOTHING",
          [userEmail, id, now()],
        );
      } else {
        await sql.run("DELETE FROM bookmarks WHERE user_email = ? AND paper_id = ?", [userEmail, id]);
      }
    },
    async replaceChunks(paperId, chunks) {
      const existing = await sql.all<{ id: string }>("SELECT id FROM paper_vectors WHERE paper_id = ?", [paperId]);
      const ids = chunks.map(() => crypto.randomUUID());
      await sql.batch([
        { sql: "DELETE FROM paper_vectors WHERE paper_id = ?", params: [paperId] },
        ...ids.map((id, index) => ({
          sql: "INSERT INTO paper_vectors (id, paper_id, chunk_index) VALUES (?, ?, ?)",
          params: [id, paperId, index],
        })),
        { sql: "UPDATE papers SET embedded = 0 WHERE id = ?", params: [paperId] },
      ]);
      if (existing.length) await vectors.deleteByIds(existing.map((row) => row.id));
      if (!chunks.length) return;
      await vectors.upsert(chunks.map((chunk, index) => ({
        id: ids[index]!,
        values: chunk.embedding,
        paperId,
      })));
      await sql.run("UPDATE papers SET embedded = 1 WHERE id = ?", [paperId]);
    },
    async listMissingEmbeddings(limit) {
      const rows = await sql.all<{ id: string; title: string; search_text: string; pdf_text: string }>(
        `SELECT id, title, search_text, pdf_text FROM papers WHERE embedded = 0 ORDER BY created_at LIMIT ?`,
        [Math.min(20, Math.max(1, Math.floor(limit)))],
      );
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        searchText: row.search_text,
        pdfText: row.pdf_text,
      }));
    },
  };
}
