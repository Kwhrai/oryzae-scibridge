import { AppError } from "@/lib/app-error";
import { extractDoi, extractPmid, normalizeDoi } from "@/lib/papers/doi";
import { pubmedSummaryToDraft, type CitationDraft, workToDraft } from "@/lib/metadata/crossref";

type FetchLike = typeof fetch;

function mailto(env: Record<string, string | undefined> = process.env): string {
  return env.CROSSREF_MAILTO || env.UNPAYWALL_EMAIL || "scibridge@oryzae.site";
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new AppError(`文献メタデータの取得に失敗しました (${response.status})`, 502);
  return response.json();
}

export async function lookupCitation(input: string, fetchImpl: FetchLike = fetch): Promise<CitationDraft> {
  const trimmed = input.trim();
  if (trimmed.length < 4) throw new AppError("DOI、URL、または引用文を貼ってください");
  const doi = extractDoi(trimmed);
  if (doi) return lookupDoi(doi, fetchImpl);
  const pmid = extractPmid(trimmed);
  if (pmid) return lookupPmid(pmid, fetchImpl);
  return lookupBibliographic(trimmed, fetchImpl);
}

async function lookupDoi(doi: string, fetchImpl: FetchLike): Promise<CitationDraft> {
  const response = await fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(normalizeDoi(doi))}`, {
    headers: { "User-Agent": `ORYZAE-SciBridge/1.0 (mailto:${mailto()})` },
  });
  const payload = (await readJson(response)) as { message?: Parameters<typeof workToDraft>[0] };
  if (!payload.message) throw new AppError("Crossref にこの DOI がありません", 404);
  return workToDraft(payload.message);
}

async function lookupBibliographic(query: string, fetchImpl: FetchLike): Promise<CitationDraft> {
  const url = new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic", query.slice(0, 500));
  url.searchParams.set("rows", "1");
  const response = await fetchImpl(url, { headers: { "User-Agent": `ORYZAE-SciBridge/1.0 (mailto:${mailto()})` } });
  const payload = (await readJson(response)) as { message?: { items?: Parameters<typeof workToDraft>[0][] } };
  const work = payload.message?.items?.[0];
  if (!work) throw new AppError("近い文献が見つかりませんでした。DOI があると確実です", 404);
  return workToDraft(work);
}

async function lookupPmid(pmid: string, fetchImpl: FetchLike): Promise<CitationDraft> {
  const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=json`;
  const summaryResponse = await fetchImpl(summaryUrl);
  const summaryJson = (await readJson(summaryResponse)) as { result?: Record<string, unknown> };
  const summary = summaryJson.result?.[pmid];
  if (!summary || typeof summary !== "object") throw new AppError("PubMed にこの PMID がありません", 404);
  let abstract = "";
  try {
    const abstractResponse = await fetchImpl(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${encodeURIComponent(pmid)}&retmode=text&rettype=abstract`,
    );
    if (abstractResponse.ok) abstract = await abstractResponse.text();
  } catch {
    abstract = "";
  }
  return pubmedSummaryToDraft(summary as Parameters<typeof pubmedSummaryToDraft>[0], abstract);
}

export async function fetchOpenAccessPdf(doi: string, fetchImpl: FetchLike = fetch): Promise<string | null> {
  const email = process.env.UNPAYWALL_EMAIL?.trim();
  if (!email || !doi) return null;
  const response = await fetchImpl(`https://api.unpaywall.org/v2/${encodeURIComponent(normalizeDoi(doi))}?email=${encodeURIComponent(email)}`);
  if (!response.ok) return null;
  const payload = await response.json();
  const { unpaywallPdfUrl } = await import("@/lib/metadata/crossref");
  return unpaywallPdfUrl(payload);
}
