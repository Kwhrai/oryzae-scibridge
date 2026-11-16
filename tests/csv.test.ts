import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { papersFromCsv } from "@/lib/papers/csv";

const csv = readFileSync(new URL("../data/papers.csv", import.meta.url), "utf8");

describe("papers.csv migration", () => {
  const papers = papersFromCsv(csv);

  it("keeps all 9 papers and repairs the shifted DOI and Drive columns", () => {
    expect(papers).toHaveLength(9);
    expect(papers.map((paper) => paper.doi)).not.toContain("TRUE");
    expect(papers.map((paper) => paper.doi)).not.toContain("FALSE");
    expect(papers.every((paper) => paper.driveUrl.includes("drive.google.com"))).toBe(true);
  });

  it("puts the real DOI and file link on the rows that had an extra boolean", () => {
    const amazake = papers.find((paper) => paper.legacyId === "3");
    expect(amazake?.doi).toBe("10.3390/jof7090782");
    expect(amazake?.driveUrl).toContain("/file/d/1bwgASMAZMZLQKduav9dPXKgQSMy34j2K");
    expect(amazake?.driveFileId).toBe("1bwgASMAZMZLQKduav9dPXKgQSMy34j2K");
    expect(amazake?.year).toBe(2021);
    expect(amazake?.linePlan).toBe(false);
    expect(amazake?.yakki).toBe(true);
    expect(amazake?.rdNote).toContain("ヒトRCT");

    const review = papers.find((paper) => paper.legacyId === "4");
    expect(review?.doi).toBe("10.3389/fmicb.2024.1452725");
    expect(review?.driveUrl).toContain("/file/d/1n4YtHleroBQ_5F9m645lPBtfq32fFqBN");

    const genome = papers.find((paper) => paper.legacyId === "7");
    expect(genome?.doi).toBe("10.1038/nature04300");
    expect(genome?.driveFileId).toBeNull();
    expect(genome?.driveUrl).toContain("/folders/");
  });

  it("leaves the already-aligned rows alone", () => {
    const first = papers.find((paper) => paper.legacyId === "1");
    expect(first?.doi).toBe("");
    expect(first?.year).toBe(2014);
    expect(first?.category).toBe("糖化酵素");
    expect(first?.crmNote).toContain("天然の消化酵素");
    expect(first?.driveFileId).toBeNull();
  });
});
