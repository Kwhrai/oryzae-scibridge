import { randomUUID } from "node:crypto";
import { AppError } from "@/lib/app-error";
import { OPTIONAL_INDEX_STATEMENTS, SCHEMA_STATEMENTS } from "@/lib/db/schema";
import { mapPaper, toVectorLiteral } from "@/lib/db/map";
import type { Db, PaperDraft, PaperPatch, PaperRecord } from "@/lib/db/types";
import type { MigratedPaper } from "@/lib/papers/csv";
import { buildSearchText, likePattern, queryTokens, snippetAround } from "@/lib/papers/text";
import { keywordScore, mergeScores } from "@/lib/papers/rank";
import { normalizeDoi } from "@/lib/papers/doi";

const PAPER_COLUMNS = `
  p.id, p.legacy_id, p.title, p.authors, p.year, p.journal, p.doi, p.abstract, p.reference,
  p.category, p.background, p.objective, p.methods, p.results, p.discussion, p.rd_note, p.crm_note,
  p.line_plan, p.yakki, p.drive_file_id, p.drive_url, p.pdf_text, p.search_text, p.source, p.confirmed,
  p.created_at, p.updated_at
`;

function selectPapers(extra: string): string {
  return `
    SELECT ${PAPER_COLUMNS},
      EXISTS (SELECT 1 FROM bookmarks b WHERE b.paper_id = p.id AND b.user_email = $USER) AS bookmarked,
      EXISTS (SELECT 1 FROM paper_chunks c WHERE c.paper_id = p.id) AS has_embedding
      ${extra}
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

export function createPaperStore(db: Db): PaperStore {
  let ready = false;

  async function ensureSchema() {
    if (ready) return;
    try {
      for (const statement of SCHEMA_STATEMENTS) await db.query(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/vector/i.test(message)) {
        throw new AppError("Postgres に pgvector がありません。Neon の SQL エディタで CREATE EXTENSION vector; を実行してください。", 503, "setup");
      }
      throw error;
    }
    for (const statement of OPTIONAL_INDEX_STATEMENTS) {
      try {
        await db.query(statement);
      } catch (error) {
        console.warn("ベクトル索引を作れませんでした。検索は続行します。", error);
      }
    }
    ready = true;
  }

  async function get(id: string, userEmail: string): Promise<PaperRecord | null> {
    const sql = selectPapers("").replace("$USER", "$2") + " WHERE p.id = $1";
    const rows = await db.query<Record<string, unknown>>(sql, [id, userEmail]);
    return rows[0] ? mapPaper(rows[0]) : null;
  }

  return {
    ensureSchema,
    async stats() {
      const [row] = await db.query<{ total: number; embedded: number; with_pdf: number }>(`
        SELECT
          (SELECT COUNT(*)::int FROM papers) AS total,
          (SELECT COUNT(DISTINCT paper_id)::int FROM paper_chunks) AS embedded,
          (SELECT COUNT(*)::int FROM papers WHERE pdf_text <> '' OR drive_file_id IS NOT NULL) AS with_pdf
      `);
      return {
        total: Number(row?.total ?? 0),
        embedded: Number(row?.embedded ?? 0),
        withPdf: Number(row?.with_pdf ?? 0),
      };
    },
    async categories() {
      const rows = await db.query<{ category: string; count: number }>(
        "SELECT category, COUNT(*)::int AS count FROM papers GROUP BY category ORDER BY count DESC, category",
      );
      return rows.map((row) => ({ name: row.category, count: Number(row.count) }));
    },
    async seedMigrated(papers) {
      await ensureSchema();
      let inserted = 0;
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
        const rows = await db.query<{ id: string }>(
          `INSERT INTO papers (
            id, legacy_id, title, abstract, reference, category, rd_note, crm_note, line_plan, yakki,
            doi, drive_url, drive_file_id, year, search_text, source
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, 'csv'
          )
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
            paper.linePlan,
            paper.yakki,
            paper.doi,
            paper.driveUrl,
            paper.driveFileId,
            paper.year,
            searchText,
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
          where = ` WHERE p.category = $${params.length}`;
        }
        const sql = selectPapers("").replace("$USER", "$1") + where + " ORDER BY p.year DESC NULLS LAST, p.updated_at DESC LIMIT " + String(safeLimit);
        const rows = await db.query<Record<string, unknown>>(sql, params);
        return { papers: rows.map((row) => mapPaper(row)), mode: "browse" as const };
      }

      const keywordParams: unknown[] = [userEmail];
      const tokenClauses: string[] = [];
      for (const token of tokens) {
        keywordParams.push(likePattern(token));
        tokenClauses.push(`p.search_text ILIKE $${keywordParams.length} ESCAPE '\\'`);
      }
      let keywordSql = selectPapers("").replace("$USER", "$1");
      const filters: string[] = [];
      if (category) {
        keywordParams.push(category);
        filters.push(`p.category = $${keywordParams.length}`);
      }
      if (tokenClauses.length) filters.push(`(${tokenClauses.join(" OR ")})`);
      if (filters.length) keywordSql += ` WHERE ${filters.join(" AND ")}`;
      keywordSql += " LIMIT 80";
      const keywordRows = tokens.length
        ? await db.query<Record<string, unknown>>(keywordSql, keywordParams)
        : [];
      const keywordPapers = keywordRows.map((row) => mapPaper(row));

      let vectorScores: { id: string; score: number }[] = [];
      if (embedding) {
        const params: unknown[] = [toVectorLiteral(embedding)];
        let categorySql = "";
        if (category) {
          params.push(category);
          categorySql = ` AND p.category = $${params.length}`;
        }
        const rows = await db.query<{ paper_id: string; score: number }>(
          `SELECT c.paper_id, MAX(1 - (c.embedding <=> $1::vector)) AS score
           FROM paper_chunks c
           JOIN papers p ON p.id = c.paper_id
           WHERE TRUE ${categorySql}
           GROUP BY c.paper_id
           ORDER BY score DESC
           LIMIT 30`,
          params,
        );
        vectorScores = rows.map((row) => ({ id: row.paper_id, score: Number(row.score) })).filter((row) => Number.isFinite(row.score));
      }

      const byId = new Map(keywordPapers.map((paper) => [paper.id, paper]));
      const missing = vectorScores.map((item) => item.id).filter((id) => !byId.has(id));
      if (missing.length) {
        const placeholders = missing.map((_, index) => `$${index + 2}`).join(", ");
        const sql = selectPapers("").replace("$USER", "$1") + ` WHERE p.id IN (${placeholders})`;
        const rows = await db.query<Record<string, unknown>>(sql, [userEmail, ...missing]);
        for (const row of rows) {
          const paper = mapPaper(row);
          byId.set(paper.id, paper);
        }
      }

      const keywordRanked = [...byId.values()].map((paper) => ({
        id: paper.id,
        score: keywordScore(tokens, phrase, paper.searchText),
      })).filter((item) => item.score > 0);
      const merged = mergeScores(keywordRanked, vectorScores);
      const mode = embedding && vectorScores.length ? "hybrid" as const : "keyword" as const;
      const papers = merged.slice(0, safeLimit).flatMap((item) => {
        const paper = byId.get(item.id);
        if (!paper) return [];
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
      const rows = await db.query<{ id: string; title: string }>(
        "SELECT id, title FROM papers WHERE lower(doi) = lower($1) LIMIT 1",
        [normalized],
      );
      return rows[0] ?? null;
    },
    async listForDriveMatch() {
      const rows = await db.query<{ id: string; title: string; doi: string; drive_file_id: string | null }>(
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
      const id = randomUUID();
      const searchText = searchTextOf(input);
      await db.query(
        `INSERT INTO papers (
          id, legacy_id, title, authors, year, journal, doi, abstract, reference, category,
          background, objective, methods, results, discussion, rd_note, crm_note, line_plan, yakki,
          drive_file_id, drive_url, pdf_text, search_text, source, confirmed
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,
          $20,$21,$22,$23,$24,$25
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
          input.linePlan ?? false,
          input.yakki ?? false,
          input.driveFileId || null,
          input.driveUrl ?? "",
          input.pdfText ?? "",
          searchText,
          input.source ?? "manual",
          input.confirmed ?? false,
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
      const searchText = searchTextOf(next);
      await db.query(
        `UPDATE papers SET
          title = $2, authors = $3, year = $4, journal = $5, doi = $6, abstract = $7, reference = $8,
          category = $9, background = $10, objective = $11, methods = $12, results = $13, discussion = $14,
          rd_note = $15, crm_note = $16, line_plan = $17, yakki = $18, drive_file_id = $19, drive_url = $20,
          pdf_text = $21, search_text = $22, confirmed = $23, updated_at = NOW()
         WHERE id = $1`,
        [
          id,
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
          next.linePlan,
          next.yakki,
          next.driveFileId,
          next.driveUrl,
          next.pdfText,
          searchText,
          next.confirmed,
        ],
      );
      return get(id, "");
    },
    async setBookmark(id, userEmail, bookmarked) {
      const existing = await get(id, userEmail);
      if (!existing) throw new AppError("論文が見つかりません", 404);
      if (bookmarked) {
        await db.query(
          "INSERT INTO bookmarks (user_email, paper_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [userEmail, id],
        );
      } else {
        await db.query("DELETE FROM bookmarks WHERE user_email = $1 AND paper_id = $2", [userEmail, id]);
      }
    },
    async replaceChunks(paperId, chunks) {
      const queries = [
        { text: "DELETE FROM paper_chunks WHERE paper_id = $1", params: [paperId] },
        ...chunks.map((chunk, index) => ({
          text: "INSERT INTO paper_chunks (id, paper_id, chunk_index, content, embedding) VALUES ($1, $2, $3, $4, $5::vector)",
          params: [randomUUID(), paperId, index, chunk.content, toVectorLiteral(chunk.embedding)],
        })),
      ];
      await db.batch(queries);
    },
    async listMissingEmbeddings(limit) {
      const rows = await db.query<{ id: string; title: string; search_text: string; pdf_text: string }>(
        `SELECT p.id, p.title, p.search_text, p.pdf_text
         FROM papers p
         WHERE NOT EXISTS (SELECT 1 FROM paper_chunks c WHERE c.paper_id = p.id)
         ORDER BY p.created_at
         LIMIT $1`,
        [limit],
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
