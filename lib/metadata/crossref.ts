import { extractDoi, normalizeDoi, yearFromText } from "@/lib/papers/doi";

export type CitationDraft = {
  title: string;
  authors: string;
  year: number | null;
  journal: string;
  doi: string;
  abstract: string;
  reference: string;
  url: string;
};

type CrossrefAuthor = { given?: string; family?: string; name?: string };
type CrossrefWork = {
  title?: string[];
  author?: CrossrefAuthor[];
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  DOI?: string;
  abstract?: string;
  URL?: string;
};

export function stripMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

export function formatAuthors(authors: CrossrefAuthor[] | undefined): string {
  if (!authors?.length) return "";
  return authors
    .map((author) => author.name || [author.family, author.given].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
}

export function workToDraft(work: CrossrefWork): CitationDraft {
  const title = stripMarkup(work.title?.[0] ?? "");
  const authors = formatAuthors(work.author);
  const year = work.issued?.["date-parts"]?.[0]?.[0] ?? null;
  const journal = work["container-title"]?.[0] ?? "";
  const doi = work.DOI ? normalizeDoi(work.DOI) : "";
  const abstract = work.abstract ? stripMarkup(work.abstract) : "";
  const reference = [authors, year ? `(${year})` : "", title, journal, doi ? `https://doi.org/${doi}` : ""]
    .filter(Boolean)
    .join(". ")
    .replace(/\s+\./g, ".");
  return { title, authors, year, journal, doi, abstract, reference, url: work.URL || (doi ? `https://doi.org/${doi}` : "") };
}

export function pubmedSummaryToDraft(summary: {
  title?: string;
  authors?: { name?: string }[];
  pubdate?: string;
  fulljournalname?: string;
  source?: string;
  elocationid?: string;
  articleids?: { idtype?: string; value?: string }[];
}, abstract = ""): CitationDraft {
  const doiFromIds = summary.articleids?.find((item) => item.idtype === "doi")?.value;
  const doi = normalizeDoi(doiFromIds || extractDoi(summary.elocationid ?? "") || "");
  const year = yearFromText(summary.pubdate ?? "");
  const authors = (summary.authors ?? []).map((author) => author.name ?? "").filter(Boolean).join(", ");
  const title = stripMarkup(summary.title ?? "");
  const journal = summary.fulljournalname || summary.source || "";
  const reference = [authors, year ? `(${year})` : "", title, journal, doi ? `https://doi.org/${doi}` : ""].filter(Boolean).join(". ");
  return { title, authors, year, journal, doi, abstract: stripMarkup(abstract), reference, url: doi ? `https://doi.org/${doi}` : "" };
}

export function unpaywallPdfUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { best_oa_location?: { url_for_pdf?: string | null } | null };
  const url = record.best_oa_location?.url_for_pdf;
  return url && /^https?:\/\//i.test(url) ? url : null;
}
