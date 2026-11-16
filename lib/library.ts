import { AppError } from "@/lib/app-error";
import type { PaperPatch, PaperRecord } from "@/lib/db/types";
import type { PaperStore } from "@/lib/db/paper-store";
import type { DriveClient } from "@/lib/drive/types";
import { planDriveFile, type DriveCandidate } from "@/lib/drive/match";
import { paperFilename } from "@/lib/drive/filename";
import type { LlmClient } from "@/lib/llm/types";
import type { CitationDraft } from "@/lib/metadata/crossref";
import { extractDoi, normalizeDoi, yearFromText } from "@/lib/papers/doi";
import type { IngestedPdf } from "@/lib/drive/types";
import type { ExtractedPaper } from "@/lib/papers/model-json";
import { bundledPapers } from "@/lib/papers/bundled";
import { toDetail, toSummary, type PaperDetail, type PaperSummary } from "@/lib/papers/present";

const PDF_LIMIT = 20 * 1024 * 1024;

export type AppContext = {
  store: PaperStore;
  llm: LlmClient;
  drive: DriveClient;
  lookup: (input: string) => Promise<CitationDraft>;
  fetchOpenAccessPdf: (doi: string) => Promise<string | null>;
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

function embedSource(paper: { title: string; abstract?: string; pdfText?: string }): string {
  return [paper.title, paper.abstract, paper.pdfText].filter(Boolean).join("\n").slice(0, 2000);
}

async function embedRecord(ctx: AppContext, paper: { id: string; title: string; abstract?: string; pdfText?: string }): Promise<boolean> {
  if (!ctx.llm.configured) return false;
  const text = embedSource(paper);
  if (!text) return false;
  const [vector] = await ctx.llm.embed([text]);
  if (!vector) return false;
  await ctx.store.replaceChunks(paper.id, [{ content: text, embedding: vector }]);
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
      const [vector] = await ctx.llm.embed([query.trim().slice(0, 400)]);
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

export async function seedNext(ctx: AppContext): Promise<{ inserted: number; remaining: number }> {
  const papers = bundledPapers();
  const have = new Set(await ctx.store.listLegacyIds());
  const next = papers.find((paper) => paper.legacyId && !have.has(paper.legacyId));
  if (!next) return { inserted: 0, remaining: 0 };
  const inserted = await ctx.store.seedMigrated([next]);
  return { inserted, remaining: papers.length - have.size - inserted };
}

export async function reindex(ctx: AppContext, _limit = 1) {
  if (!ctx.llm.configured) {
    const stats = await ctx.store.stats();
    return {
      indexed: 0,
      remaining: Math.max(0, stats.total - stats.embedded),
      warning: "埋め込みの設定が無いため、意味検索の索引を作れません",
    };
  }
  const [paper] = await ctx.store.listMissingEmbeddings(1);
  if (!paper) {
    const stats = await ctx.store.stats();
    return { indexed: 0, remaining: Math.max(0, stats.total - stats.embedded) };
  }
  await embedRecord(ctx, paper);
  const stats = await ctx.store.stats();
  return { indexed: 1, remaining: Math.max(0, stats.total - stats.embedded) };
}

function draftFromExtraction(extracted: ExtractedPaper, fallbackText: string): ExtractedPaper {
  return {
    ...extracted,
    title: extracted.title || fallbackText.split("\n").find((line) => line.trim())?.slice(0, 180) || "無題",
    doi: extracted.doi || extractDoi(fallbackText) || "",
    year: extracted.year ?? yearFromText(fallbackText),
  };
}

export async function previewPdf(ctx: AppContext, input: { filename: string; size: number; body: ReadableStream<Uint8Array> | null; bytes?: Uint8Array }) {
  if (input.size > PDF_LIMIT) {
    throw new AppError("PDFは20MBまでです。それより大きいファイルは共有ドライブに置いてから「Driveを同期」してください。", 413);
  }
  if (!ctx.llm.configured) {
    return {
      ai: false,
      warning: "AIの設定が無いため、本文からの自動抽出は行っていません。タイトルなどを手で補ってください。",
      draft: draftFromExtraction({
        title: input.filename.replace(/\.pdf$/i, ""),
        authors: "",
        year: null,
        journal: "",
        doi: "",
        abstract: "",
        category: "",
        background: "",
        objective: "",
        methods: "",
        results: "",
        discussion: "",
        summary: "",
        bodyText: "",
      }, ""),
    };
  }
  const categories = (await ctx.store.categories()).map((item) => item.name);
  const extracted = await ctx.llm.readPdf({ ...input, categories });
  return { ai: true, draft: draftFromExtraction(extracted, extracted.bodyText || extracted.summary) };
}

async function storePdf(ctx: AppContext, bytes: Uint8Array, title: string, year: number | null, category: string): Promise<{ id: string; webViewLink: string } | { warning: string }> {
  if (bytes.byteLength > PDF_LIMIT) {
    return { warning: "PDFは20MBまでです。それより大きいファイルは共有ドライブに置いてから同期してください。" };
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
  return {
    paper: toDetail(paper),
    driveSaved,
    embedded: false,
    warning: [warning, "意味検索の索引は、一覧の「意味検索の索引」で1件ずつ作ります。"].filter(Boolean).join(" "),
  };
}

export async function addPdf(ctx: AppContext, userEmail: string, bytes: Uint8Array, _filename: string, meta: ExtractedPaper): Promise<SaveResult> {
  if (bytes.byteLength > PDF_LIMIT) {
    throw new AppError("PDFは20MBまでです。それより大きいファイルは共有ドライブに置いてから同期してください。", 413);
  }
  const text = meta.bodyText || "";
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

function prefer(user: string | undefined, fallback: string | undefined): string {
  const value = user?.trim();
  return value ? value : (fallback ?? "");
}

export async function addUploadedPdf(ctx: AppContext, userEmail: string, input: {
  filename: string;
  size: number;
  body: BodyInit;
  meta: ExtractedPaper;
}): Promise<SaveResult> {
  const encodedLimit = Math.ceil(PDF_LIMIT / 3) * 4 + 64 * 1024;
  if (input.size > encodedLimit) {
    throw new AppError("PDFは20MBまでです。それより大きいファイルは共有ドライブに置いてから同期してください。", 413);
  }
  let warning: string | undefined;
  let ingested: IngestedPdf | null = null;
  if (!ctx.drive.configured) {
    warning = "Drive が未設定のため、PDFファイルはクラウドに置いていません。";
  } else {
    try {
      ingested = await ctx.drive.savePdf({
        filename: paperFilename(input.meta.title || input.filename, input.meta.year),
        category: input.meta.category.trim() || "未分類",
        body: input.body,
        size: input.size,
      });
    } catch (error) {
      warning = `${error instanceof Error ? error.message : "Drive への保存に失敗しました"} 論文データはライブラリに残します。`;
    }
  }
  let extracted = ingested?.extraction ?? null;
  if (!extracted?.title && ingested?.plainText && ctx.llm.configured) {
    try {
      extracted = await ctx.llm.extractMetadata(ingested.plainText.slice(0, 4000), { filename: input.filename });
    } catch (error) {
      warning = [warning, error instanceof Error ? error.message : ""].filter(Boolean).join(" ");
    }
  }
  const title = prefer(input.meta.title, extracted?.title) || input.filename.replace(/\.pdf$/i, "");
  const doi = normalizeDoi(prefer(input.meta.doi, extracted?.doi));
  if (doi) {
    const existing = await ctx.store.findByDoi(doi);
    if (existing) throw new AppError(`同じ DOI の論文が既にあります: ${existing.title}`, 409);
  }
  const paper = await ctx.store.insert({
    title,
    authors: prefer(input.meta.authors, extracted?.authors),
    year: input.meta.year ?? extracted?.year ?? null,
    journal: prefer(input.meta.journal, extracted?.journal),
    doi,
    abstract: prefer(input.meta.abstract, extracted?.abstract),
    category: prefer(input.meta.category, extracted?.category || ingested?.category) || "未分類",
    background: prefer(input.meta.background, extracted?.background),
    objective: prefer(input.meta.objective, extracted?.objective),
    methods: prefer(input.meta.methods, extracted?.methods),
    results: prefer(input.meta.results, extracted?.results),
    discussion: prefer(input.meta.discussion, extracted?.discussion),
    reference: referenceOf({ title, doi, authors: prefer(input.meta.authors, extracted?.authors), year: input.meta.year ?? extracted?.year }),
    pdfText: extracted?.bodyText || ingested?.plainText || "",
    driveFileId: ingested?.driveFileId || null,
    driveUrl: ingested?.driveUrl || "",
    source: "upload",
  });
  return finishSave(ctx, userEmail, paper.id, Boolean(ingested?.driveFileId), warning);
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
  let sections: Partial<ExtractedPaper> = {};
  if (saveOpenAccessPdf && doi) {
    if (!process.env.UNPAYWALL_EMAIL && !ctx.mock) {
      warning = "UNPAYWALL_EMAIL が未設定のため、オープンアクセスPDFは探していません。";
    } else if (!ctx.drive.configured) {
      warning = "Drive が未設定のため、書誌だけ登録します。";
    } else {
      try {
        const url = await ctx.fetchOpenAccessPdf(doi);
        if (!url) {
          warning = "オープンアクセスのPDFは見つかりませんでした。書誌だけ登録します。";
        } else {
          const ingested = await ctx.drive.importUrl(url, "未分類");
          if (ingested.driveFileId) {
            driveSaved = true;
            driveFileId = ingested.driveFileId;
            driveUrl = ingested.driveUrl;
            pdfText = ingested.extraction?.bodyText || ingested.plainText || "";
            sections = ingested.extraction ?? {};
          }
        }
      } catch (error) {
        warning = error instanceof Error ? error.message : "PDFの取得に失敗しました";
      }
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
  if (textChanged) await ctx.store.replaceChunks(id, []);
  return toDetail(await reload(ctx, id, userEmail));
}

export async function structurePaper(ctx: AppContext, userEmail: string, id: string): Promise<PaperDetail> {
  const paper = await reload(ctx, id, userEmail);
  const source = paper.pdfText || paper.abstract;
  if (!source.trim()) throw new AppError("要旨もPDF本文も無いので、構造化できません", 422);
  const note = await ctx.llm.structurePaper({ title: paper.title, abstract: paper.abstract, pdfText: paper.pdfText });
  return updatePaper(ctx, userEmail, id, note);
}

async function materializeIngest(ctx: AppContext, ingested: IngestedPdf, filename: string): Promise<ExtractedPaper | null> {
  if (ingested.extraction?.title || ingested.extraction?.bodyText || ingested.extraction?.abstract) return ingested.extraction;
  const text = ingested.plainText.trim();
  if (!text || !ctx.llm.configured) return null;
  return ctx.llm.extractMetadata(text.slice(0, 4000), { filename, categories: (await ctx.store.categories()).map((item) => item.name) });
}

export async function syncDrive(ctx: AppContext, _limit = 1) {
  const files = await ctx.drive.listPdfs(ctx.driveRootId);
  const known = await ctx.store.listForDriveMatch();
  const candidates: DriveCandidate[] = known.map((paper) => ({ ...paper }));
  const queue = files.filter((file) => !candidates.some((paper) => paper.driveFileId === file.id));
  const file = queue[0];
  if (!file) return { seen: files.length, indexed: 0, attached: 0, skipped: 0, errors: [] as string[], remaining: 0 };
  try {
    const ingested = await ctx.drive.ingest(file.id);
    const extracted = await materializeIngest(ctx, ingested, file.name);
    const text = extracted?.bodyText || ingested.plainText || "";
    const plan = planDriveFile({ id: file.id, name: file.name, text }, candidates);
    if (plan.action === "skip") {
      return { seen: files.length, indexed: 0, attached: 0, skipped: 1, errors: [] as string[], remaining: Math.max(0, queue.length - 1) };
    }
    if (plan.action === "attach") {
      await ctx.store.update(plan.id, {
        driveFileId: file.id,
        driveUrl: ingested.driveUrl || file.webViewLink,
        ...(text ? { pdfText: text } : {}),
        ...(extracted?.abstract ? { abstract: extracted.abstract } : {}),
        ...(extracted?.background ? { background: extracted.background } : {}),
        ...(extracted?.objective ? { objective: extracted.objective } : {}),
        ...(extracted?.methods ? { methods: extracted.methods } : {}),
        ...(extracted?.results ? { results: extracted.results } : {}),
        ...(extracted?.discussion ? { discussion: extracted.discussion } : {}),
      });
      return { seen: files.length, indexed: 0, attached: 1, skipped: 0, errors: [] as string[], remaining: Math.max(0, queue.length - 1) };
    }
    const doi = extracted?.doi || extractDoi(text) || "";
    const existing = doi ? candidates.find((paper) => paper.doi && paper.doi.toLowerCase() === doi.toLowerCase()) : undefined;
    if (existing && !existing.driveFileId) {
      await ctx.store.update(existing.id, { driveFileId: file.id, driveUrl: ingested.driveUrl || file.webViewLink, ...(text ? { pdfText: text } : {}) });
      return { seen: files.length, indexed: 0, attached: 1, skipped: 0, errors: [] as string[], remaining: Math.max(0, queue.length - 1) };
    }
    if (existing?.driveFileId) {
      return { seen: files.length, indexed: 0, attached: 0, skipped: 1, errors: [] as string[], remaining: Math.max(0, queue.length - 1) };
    }
    const title = extracted?.title || file.name.replace(/\.pdf$/i, "");
    await ctx.store.insert({
      title,
      authors: extracted?.authors,
      year: extracted?.year,
      journal: extracted?.journal,
      doi,
      abstract: extracted?.abstract || text.slice(0, 600),
      category: file.parentName || extracted?.category || ingested.category || "未分類",
      background: extracted?.background,
      objective: extracted?.objective,
      methods: extracted?.methods,
      results: extracted?.results,
      discussion: extracted?.discussion,
      reference: referenceOf({ ...(extracted ?? { title }), title, doi }),
      pdfText: text,
      driveFileId: file.id,
      driveUrl: ingested.driveUrl || file.webViewLink,
      source: "drive",
    });
    return { seen: files.length, indexed: 1, attached: 0, skipped: 0, errors: [] as string[], remaining: Math.max(0, queue.length - 1) };
  } catch (error) {
    return {
      seen: files.length,
      indexed: 0,
      attached: 0,
      skipped: 0,
      errors: [`${file.name}: ${error instanceof Error ? error.message : "取り込めませんでした"}`],
      remaining: queue.length,
    };
  }
}

export type { PaperSummary, PaperDetail };
