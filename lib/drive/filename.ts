export function sanitizeFilename(name: string): string {
  const cleaned = Array.from(name).map((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || "\\/:*?\"<>|".includes(char) ? " " : char;
  }).join("").replace(/\s+/g, " ").trim();
  const base = (cleaned || "paper").replace(/\.pdf$/i, "");
  return `${base.slice(0, 80)}.pdf`;
}

export function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function paperFilename(title: string, year: number | null): string {
  const prefix = year ? `${year}-` : "";
  return sanitizeFilename(`${prefix}${title}`);
}
