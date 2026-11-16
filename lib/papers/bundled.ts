import bundledCsv from "../../data/papers.csv?raw";
import { papersFromCsv, type MigratedPaper } from "@/lib/papers/csv";

let cached: MigratedPaper[] | null = null;

export function bundledPapers(): MigratedPaper[] {
  if (!cached) cached = papersFromCsv(bundledCsv);
  return cached;
}
