import { extractDoi } from "@/lib/papers/doi";

export type DriveCandidate = {
  id: string;
  title: string;
  doi: string;
  driveFileId: string | null;
};

export type DrivePlan =
  | { action: "skip" }
  | { action: "attach"; id: string }
  | { action: "create" };

function compact(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\.pdf$/i, "").replace(/[\s_-]+/g, "");
}

export function planDriveFile(file: { id: string; name: string; text: string }, papers: DriveCandidate[]): DrivePlan {
  if (papers.some((paper) => paper.driveFileId === file.id)) return { action: "skip" };
  const doi = extractDoi(file.text) || extractDoi(file.name);
  if (doi) {
    const found = papers.find((paper) => paper.doi && paper.doi.toLowerCase() === doi.toLowerCase());
    if (found?.driveFileId) return { action: "skip" };
    if (found) return { action: "attach", id: found.id };
  }
  const fileName = compact(file.name);
  if (fileName.length < 8) return { action: "create" };
  for (const paper of papers) {
    if (paper.driveFileId) continue;
    const parts = paper.title.split(/[／/|]/).map(compact).filter((part) => part.length >= 8);
    const matched = parts.some((part) => {
      const probe = part.slice(0, 32);
      return fileName.includes(probe) || part.includes(fileName.slice(0, 32));
    });
    if (matched) return { action: "attach", id: paper.id };
  }
  return { action: "create" };
}
