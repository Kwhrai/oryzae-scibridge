import { driveFileIdFromUrl, isDoi, normalizeDoi, yearFromText } from "@/lib/papers/doi";

/**
 * papers.csv はヘッダー11列に対し、9件中7件が12列。
 * 余剰の TRUE/FALSE が yakki と doi のあいだに入り、素朴に列番号で読むと
 * doi が TRUE/FALSE、drive が DOI になる。
 * ヘッダー側の列位置（lineP, yakki）は維持し、drive URL の直前にある余分な真偽値だけ落とす。
 */
const HEADERS = ["id", "category", "title", "abstract", "reference", "commentary", "crm", "lineP", "yakki", "doi", "drive"] as const;

export type MigratedPaper = {
  legacyId: string;
  category: string;
  title: string;
  abstract: string;
  reference: string;
  rdNote: string;
  crmNote: string;
  linePlan: boolean;
  yakki: boolean;
  doi: string;
  driveUrl: string;
  driveFileId: string | null;
  year: number | null;
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(value.trim());
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value.trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function isBool(value: string): boolean {
  return /^(true|false)$/i.test(value);
}

function isDriveUrl(value: string): boolean {
  return /drive\.google\.com/i.test(value);
}

export function alignCsvRow(row: string[]): string[] {
  if (row.length !== HEADERS.length + 1) return row;
  const drive = row.at(-1) ?? "";
  const doi = row.at(-2) ?? "";
  const extra = row.at(-3) ?? "";
  if (isDriveUrl(drive) && (doi === "" || isDoi(doi)) && isBool(extra)) {
    return [...row.slice(0, -3), doi, drive];
  }
  return row;
}

function bool(value: string | undefined): boolean {
  return /^true$/i.test(value ?? "");
}

export function papersFromCsv(text: string): MigratedPaper[] {
  const [header = [], ...records] = parseCsv(text);
  if (header.join(",") !== HEADERS.join(",")) {
    throw new Error("papers.csv のヘッダーが想定と違います");
  }
  return records.map((record) => {
    const aligned = alignCsvRow(record);
    const cell = (name: (typeof HEADERS)[number]) => aligned[HEADERS.indexOf(name)] ?? "";
    const doi = cell("doi") && isDoi(cell("doi")) ? normalizeDoi(cell("doi")) : "";
    const driveUrl = cell("drive");
    return {
      legacyId: cell("id"),
      category: cell("category") || "未分類",
      title: cell("title"),
      abstract: cell("abstract"),
      reference: cell("reference"),
      rdNote: cell("commentary"),
      crmNote: cell("crm"),
      linePlan: bool(cell("lineP")),
      yakki: bool(cell("yakki")),
      doi,
      driveUrl,
      driveFileId: driveFileIdFromUrl(driveUrl),
      year: yearFromText(cell("reference")),
    };
  }).filter((paper) => paper.title);
}
