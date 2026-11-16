import { AppError } from "@/lib/app-error";
import type { PaperPatch, PaperRecord } from "@/lib/db/types";
import type { PaperStore } from "@/lib/db/paper-store";
import type { DriveClient } from "@/lib/drive/types";
import { planDriveFile, type DriveCandidate } from "@/lib/drive/match";
import { paperFilename } from "@/lib/drive/filename";
import type { LlmClient } from "@/lib/llm/types";
import type { CitationDraft } from "@/lib/metadata/crossref";
import { extractDoi, normalizeDoi, yearFromText } from "@/lib/papers/doi";
import { embeddingDocuments } from "@/lib/papers/chunk";
import type { ExtractedPaper } from "@/lib/papers/model-json";
import { toDetail, toSummary, type PaperDetail, type PaperSummary } from "@/lib/papers/present";

const PDF_LIMIT = 4_000_000;

export type AppContext = {
  store: PaperStore;
  llm: LlmClient;
  drive: DriveClient;
  extractText: (bytes: Uint8Array) => Promise<string>;
  lookup: (input: string) => Promise<CitationDraft>;
  fetchOpenAccessPdf: (doi: string) => Promise<Uint8Array | null>;
  driveRootId: string;
  mock: boolean;
  llmConfigured: boolean;
  driveConfigured: boolean;
};

export type SaveResult = {
  paper: PaperDetail;
  driveSaved: boolean;
  embedded: boolean;
  warning?: string;
};

function referenceOf(input: { authors?: string; year?: number | null; title: string; journal?: string; doi?: string; reference?: string }): string {
  if (input.reference?.trim()) return input.reference.trim();
  return [input.authors, input.year ? `(${input.year})` : "", input.title, input.journal, input.doi ? `https://doi.org/${input.doi}` : ""]
    .filter(Boolean)
    .join(". ");
}

async function embedRecord(ctx: AppContext, paper: PaperRecord): Promise<boolean> {
  if (!ctx.llm.configured) return false;
  const documents = embeddingDocuments({ title: paper.title, searchText: paper.searchText, pdfText: paper.pdfText });
  if (documents.length === 0) return false;
  const vectors = await ctx.llm.embed(documents);
  await ctx.store.replaceChunks(paper.id, documents.map((content, index) => ({ content, embedding: vectors[index] })));
  return true;
}

async function reload(ctx: AppContext, id: string, userEmail: string): Promise<PaperRecord> {
  const paper = await ctx.store.get(id, userEmail);
  if (!paper) throw new AppError("論文が見つかりません", 404);
  return paper;
}

export async function searchLibrary(ctx: AppContext, userEmail: string, query: string, category: string | null) {
  let embedding: number[] | null = null;
  let warning: string | undefined;
  if (query.trim() && ctx.llm.configured) {
    try {
      const [vector] = await ctx.llm.embed([query.trim()]);
      embedding = vector ?? null;
    } catch (error) {
      console.error(error);
      warning = "意味検索が使えなかったため、キーワード検索だけを行いました";
    }
  }
  let result: Awaited<ReturnType<PaperStore["search"]>>;
  try {
    result = await ctx.store.search({ userEmail, query, category, embedding, limit: 50 });
  } catch (error) {
    if (!embedding) throw error;
    console.error(error);
    warning = "意味検索が使えなかったため、キーワード検索だけを行いました";
    result = await ctx.store.search({ userEmail, query, category, embedding: null, limit: 50 });
  }
  const [categories, stats] = await Promise.all([ctx.store.categories(), ctx.store.stats()]);
  return {
    papers: result.papers.map(toSummary),
    mode: result.mode,
    categories,
    total: stats.total,
    embedded: stats.embedded,
    withPdf: stats.withPdf,
    warning,
  };
}

export async function reindex(ctx: AppContext, limit: number) {
  const bounded = Math.min(20, Math.max(1, limit));
  if (!ctx.llm.configured) {
    const stats = await ctx.store.stats();
    return {
      indexed: 0,
      remaining: Math.max(0, stats.total - stats.embedded),
      warning: "GEMINI_API_KEY が未設定のため、意味検索の索引を作れません",
    };
  }
  const missing = await ctx.store.listMissingEmbeddings(bounded);
  let indexed = 0;
  for (const paper of missing) {
    const documents = embeddingDocuments(paper);
    if (documents.length === 0) continue;
    const vectors = await ctx.llm.embed(documents);
    await ctx.store.replaceChunks(paper.id, documents.map((content, index) => ({ content, embedding: vectors[index] })));
    indexed += 1;
  }
  const stats = await ctx.store.stats();
  return { indexed, remaining: Math.max(0, stats.total - stats.embedded) };
}

function draftFromExtraction(extracted: ExtractedPaper, fallbackText: string): ExtractedPaper {
  return {
    ...extracted,
    title: extracted.title || fallbackText.split("\n").find((line) => line.trim())?.slice(0, 180) || "無題",
    doi: extracted.doi || extractDoi(fallbackText) || "",
    year: extracted.year ?? yearFromText(fallbackText),
  };
}

export async function previewPdf(ctx: AppContext, bytes: Uint8Array, filename: string) {
  if (bytes.byteLength > PDF_LIMIT) {
    throw new AppError("PDFが4MBを超えています。共有ドライブのフォルダに直接置いてから「Driveを同期」してください。", 413);
  }
  const text = await ctx.extractText(bytes);
  const categories = (await ctx.store.categories()).map((item) => item.name);
  if (!ctx.llm.configured) {
    return {
      ai: false,
      warning: "GEMINI_API_KEY が無いため、本文からの自動抽出は行っていません。タイトルなどを手で補ってください。",
      draft: draftFromExtraction({
        title: filename.replace(/\.pdf$/i, ""),
        authors: "",
        year: yearFromText(text),
        journal: "",
        doi: extractDoi(text) ?? "",
        abstract: text.slice(0, 600),
        category: "",
        background: "",
        objective: "",
        methods: "",
        results: "",
        discussion: "",
      }, text),
    };
  }
  const extracted = draftFromExtraction(await ctx.llm.extractMetadata(text, { filename, categories }), text);
  return { ai: true, draft: extracted };
}

async function storePdf(ctx: AppContext, bytes: Uint8Array, title: string, year: number | null, category: string): Promise<{ id: string; webViewLink: string } | { warning: string }> {
  if (bytes.byteLength > PDF_LIMIT) {
    return { warning: "PDFが4MBを超えたため Drive には置いていません。フォルダへ直接入れて同期してください。" };
  }
  if (!ctx.drive.configured) {
    return { warning: "Drive が未設定のため、PDFファイルはクラウドに置いていません。本文テキストだけ検索対象になります。" };
  }
  try {
    const uploaded = await ctx.drive.uploadPdf({
      rootFolderId: ctx.driveRootId,
      category: category || "未分類",
      filename: paperFilename(title, year),
      bytes,
    });
    return uploaded;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Drive への保存に失敗しました";
    return { warning: `${message} 論文データはライブラリに残します。` };
  }
}

async function finishSave(ctx: AppContext, userEmail: string, id: string, driveSaved: boolean, warning?: string): Promise<SaveResult> {
  const paper = await reload(ctx, id, userEmail);
  let embedded = false;
  try {
    embedded = await embedRecord(ctx, paper);
  } catch (error) {
    console.error(error);
    warning = [warning, "意味検索の索引はまだです。あとから「索引を作成」を押してください。"].filter(Boolean).join(" ");
  }
  const fresh = await reload(ctx, id, userEmail);
  return { paper: toDetail(fresh), driveSaved, embedded, warning };
}

export async function addPdf(ctx: AppContext, userEmail: string, bytes: Uint8Array, _filename: string, meta: ExtractedPaper): Promise<SaveResult> {
  if (bytes.byteLength > PDF_LIMIT) {
    throw new AppError("PDFが4MBを超えています。共有ドライブに直接置いてから同期してください。", 413);
  }
  const text = await safeText(ctx, bytes);
  const title = meta.title.trim();
  if (!title) throw new AppError("タイトルは必須です");
  const doi = meta.doi ? normalizeDoi(meta.doi) : extractDoi(text) || "";
  if (doi) {
    const existing = await ctx.store.findByDoi(doi);
    if (existing) throw new AppError(`同じ DOI の論文が既にあります: ${existing.title}`, 409);
  }
  const category = meta.category.trim() || "未分類";
  const stored = await storePdf(ctx, bytes, title, meta.year, category);
  const driveSaved = "id" in stored;
  const paper = await ctx.store.insert({
    ...meta,
    title,
    doi,
    category,
    reference: referenceOf({ ...meta, title, doi }),
    pdfText: text,
    driveFileId: driveSaved ? stored.id : null,
    driveUrl: driveSaved ? stored.webViewLink : "",
    source: "upload",
  });
  return finishSave(ctx, userEmail, paper.id, driveSaved, "warning" in stored ? stored.warning : undefined);
}

async function safeText(ctx: AppContext, bytes: Uint8Array): Promise<string> {
  try {
    return await ctx.extractText(bytes);
  } catch {
    return "";
  }
}

export async function lookupMetadata(ctx: AppContext, input: string): Promise<CitationDraft> {
  return ctx.lookup(input);
}

export async function addCitation(ctx: AppContext, userEmail: string, draft: CitationDraft, saveOpenAccessPdf: boolean): Promise<SaveResult> {
  const title = draft.title.trim();
  if (!title) throw new AppError("タイトルは必須です");
  const doi = draft.doi ? normalizeDoi(draft.doi) : "";
  if (doi) {
    const existing = await ctx.store.findByDoi(doi);
    if (existing) throw new AppError(`同じ DOI の論文が既にあります: ${existing.title}`, 409);
  }
  let pdfText = "";
  let warning: string | undefined;
  let driveSaved = false;
  let driveFileId: string | null = null;
  let driveUrl = "";
  if (saveOpenAccessPdf && doi) {
    if (!process.env.UNPAYWALL_EMAIL && !ctx.mock) {
      warning = "UNPAYWALL_EMAIL が未設定のため、オープンアクセスPDFは探していません。";
    } else {
      try {
        const bytes = await ctx.fetchOpenAccessPdf(doi);
        if (!bytes) {
          warning = "オープンアクセスのPDFは見つかりませんでした。書誌だけ登録します。";
        } else {
          pdfText = await safeText(ctx, bytes);
          const stored = await storePdf(ctx, bytes, title, draft.year, "未分類");
          if ("id" in stored) {
            driveSaved = true;
            driveFileId = stored.id;
            driveUrl = stored.webViewLink;
          } else {
            warning = stored.warning;
          }
        }
      } catch (error) {
        warning = error instanceof Error ? error.message : "PDFの取得に失敗しました";
      }
    }
  }
  let sections: Partial<ExtractedPaper> = {};
  if (pdfText && ctx.llm.configured) {
    try {
      sections = await ctx.llm.structurePaper({ title, abstract: draft.abstract, pdfText });
    } catch (error) {
      console.error(error);
    }
  }
  const paper = await ctx.store.insert({
    title,
    authors: draft.authors,
    year: draft.year,
    journal: draft.journal,
    doi,
    abstract: draft.abstract,
    reference: draft.reference || referenceOf({ ...draft, title, doi }),
    category: "未分類",
    pdfText,
    driveFileId,
    driveUrl,
    source: "citation",
    ...sections,
  });
  return finishSave(ctx, userEmail, paper.id, driveSaved, warning);
}

export async function updatePaper(ctx: AppContext, userEmail: string, id: string, patch: PaperPatch): Promise<PaperDetail> {
  const updated = await ctx.store.update(id, patch);
  if (!updated) throw new AppError("論文が見つかりません", 404);
  const textChanged = ["title", "abstract", "rdNote", "background", "objective", "methods", "results", "discussion", "crmNote", "pdfText", "authors", "doi"].some((key) => key in patch);
  if (textChanged) {
    try {
      await embedRecord(ctx, updated);
    } catch (error) {
      console.error(error);
    }
  }
  return toDetail(await reload(ctx, id, userEmail));
}

export async function structurePaper(ctx: AppContext, userEmail: string, id: string): Promise<PaperDetail> {
  const paper = await reload(ctx, id, userEmail);
  const source = paper.pdfText || paper.abstract;
  if (!source.trim()) throw new AppError("要旨もPDF本文も無いので、構造化できません", 422);
  const note = await ctx.llm.structurePaper({ title: paper.title, abstract: paper.abstract, pdfText: paper.pdfText });
  return updatePaper(ctx, userEmail, id, note);
}

export async function syncDrive(ctx: AppContext, limit = 2) {
  const bounded = Math.min(5, Math.max(1, limit));
  const files = await ctx.drive.listPdfs(ctx.driveRootId);
  const known = await ctx.store.listForDriveMatch();
  const candidates: DriveCandidate[] = known.map((paper) => ({ ...paper }));
  const queue = files.filter((file) => !candidates.some((paper) => paper.driveFileId === file.id));
  const batch = queue.slice(0, bounded);
  let indexed = 0;
  let attached = 0;
  let skipped = 0;
  const errors: string[] = [];
  const categories = (await ctx.store.categories()).map((item) => item.name);

  for (const file of batch) {
    try {
      const bytes = await ctx.drive.download(file.id);
      const text = await safeText(ctx, bytes);
      const plan = planDriveFile({ id: file.id, name: file.name, text }, candidates);
      if (plan.action === "skip") {
        skipped += 1;
        continue;
      }
      if (plan.action === "attach") {
        const patch: PaperPatch = { driveFileId: file.id, driveUrl: file.webViewLink };
        if (text) patch.pdfText = text;
        const updated = await ctx.store.update(plan.id, patch);
        if (updated) {
          candidates.forEach((paper) => {
            if (paper.id === plan.id) paper.driveFileId = file.id;
          });
          try {
            await embedRecord(ctx, updated);
          } catch (error) {
            console.error(error);
          }
        }
        attached += 1;
        continue;
      }
      let extracted: ExtractedPaper | null = null;
      if (text && ctx.llm.configured) {
        try {
          extracted = await ctx.llm.extractMetadata(text, { filename: file.name, categories });
        } catch (error) {
          console.error(error);
        }
      }
      const doi = extracted?.doi || extractDoi(text) || "";
      if (doi) {
        const existing = candidates.find((paper) => paper.doi && paper.doi.toLowerCase() === doi.toLowerCase());
        if (existing && !existing.driveFileId) {
          const updated = await ctx.store.update(existing.id, { driveFileId: file.id, driveUrl: file.webViewLink, ...(text ? { pdfText: text } : {}) });
          existing.driveFileId = file.id;
          if (updated) {
            try { await embedRecord(ctx, updated); } catch (error) { console.error(error); }
          }
          attached += 1;
          continue;
        }
        if (existing?.driveFileId) {
          skipped += 1;
          continue;
        }
      }
      const title = extracted?.title || file.name.replace(/\.pdf$/i, "");
      const category = file.parentName || extracted?.category || "未分類";
      const created = await ctx.store.insert({
        title,
        authors: extracted?.authors,
        year: extracted?.year,
        journal: extracted?.journal,
        doi,
        abstract: extracted?.abstract || text.slice(0, 600),
        category,
        background: extracted?.background,
        objective: extracted?.objective,
        methods: extracted?.methods,
        results: extracted?.results,
        discussion: extracted?.discussion,
        reference: referenceOf({ ...(extracted ?? { title }), title, doi }),
        pdfText: text,
        driveFileId: file.id,
        driveUrl: file.webViewLink,
        source: "drive",
      });
      candidates.push({ id: created.id, title: created.title, doi: created.doi, driveFileId: file.id });
      try { await embedRecord(ctx, created); } catch (error) { console.error(error); }
      indexed += 1;
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "取り込めませんでした"}`);
    }
  }

  return {
    seen: files.length,
    indexed,
    attached,
    skipped,
    errors,
    remaining: Math.max(0, queue.length - batch.length),
  };
}

export type { PaperSummary, PaperDetail };
