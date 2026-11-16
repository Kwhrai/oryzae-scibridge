const DOI_PATTERN = /10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i;

export function normalizeDoi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/[.)\],;]+$/g, "");
}

export function extractDoi(value: string): string | null {
  const match = value.match(DOI_PATTERN);
  if (!match) return null;
  const doi = normalizeDoi(match[0]);
  return DOI_PATTERN.test(doi) ? doi : null;
}

export function isDoi(value: string): boolean {
  return DOI_PATTERN.test(normalizeDoi(value));
}

export function extractPmid(value: string): string | null {
  const url = value.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i);
  if (url) return url[1];
  const labeled = value.match(/\bPMID\s*[:#]?\s*(\d{4,9})\b/i);
  return labeled ? labeled[1] : null;
}

export function driveFileIdFromUrl(url: string): string | null {
  if (!url || url.includes("/folders/")) return null;
  const file = url.match(/\/file\/d\/([^/?#]+)/);
  if (file) return file[1];
  const query = url.match(/[?&]id=([^&#]+)/);
  return query ? query[1] : null;
}

export function yearFromText(value: string): number | null {
  const match = value.match(/\((19|20)\d{2}\)/) ?? value.match(/\b(19|20)\d{2}\b/);
  if (!match) return null;
  const year = Number(match[0].replace(/[()]/g, ""));
  if (year < 1900 || year > 2100) return null;
  return year;
}
