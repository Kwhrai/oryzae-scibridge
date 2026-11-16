import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createPaperStore, type PaperStore } from "@/lib/db/paper-store";
import { createPgliteDb } from "@/lib/db/pglite";
import { papersFromCsv } from "@/lib/papers/csv";
import { hashEmbedding } from "@/lib/papers/rank";
import { createMockDrive } from "@/lib/drive/mock";
import { createMockLlm } from "@/lib/llm/mock";
import { addCitation, addPdf, searchLibrary, syncDrive, type AppContext } from "@/lib/library";

let store: PaperStore;

beforeAll(async () => {
  store = createPaperStore(await createPgliteDb());
  const csv = readFileSync(new URL("../data/papers.csv", import.meta.url), "utf8");
  const inserted = await store.seedMigrated(papersFromCsv(csv));
  expect(inserted).toBe(9);
  expect(await store.seedMigrated(papersFromCsv(csv))).toBe(0);
});

describe("paper store", () => {
  it("searches the migrated library by a half-remembered Japanese phrase", async () => {
    const result = await store.search({
      userEmail: "member@oryzae.site",
      query: "あの排便の甘酒の論文",
      category: null,
      embedding: null,
    });
    expect(result.mode).toBe("keyword");
    expect(result.papers[0]?.legacyId).toBe("3");
    expect(result.papers[0]?.doi).toBe("10.3390/jof7090782");
  });

  it("filters by category and stores bookmarks per person", async () => {
    const enzyme = await store.search({ userEmail: "member@oryzae.site", query: "", category: "糖化酵素", embedding: null });
    expect(enzyme.papers).toHaveLength(1);
    expect(enzyme.papers[0]?.legacyId).toBe("1");
    await store.setBookmark("csv-1", "member@oryzae.site", true);
    const mine = await store.get("csv-1", "member@oryzae.site");
    const other = await store.get("csv-1", "other@oryzae.site");
    expect(mine?.bookmarked).toBe(true);
    expect(other?.bookmarked).toBe(false);
    expect(mine?.rdNote).toContain("耐熱性");
  });

  it("uses a vector hit even when the query words are not in the paper", async () => {
    const paper = await store.insert({
      title: "社内コードネーム資料",
      abstract: "本文には検索語を入れない",
      source: "manual",
    });
    const vector = hashEmbedding("unique-koji-signal");
    await store.replaceChunks(paper.id, [{ content: "unique-koji-signal", embedding: vector }]);
    const result = await store.search({
      userEmail: "member@oryzae.site",
      query: "zzzz-not-in-the-library",
      category: null,
      embedding: vector,
    });
    expect(result.mode).toBe("hybrid");
    expect(result.papers[0]?.id).toBe(paper.id);
  });
});

describe("adding and drive sync", () => {
  function context(overrides: Partial<AppContext>): AppContext {
    return {
      store,
      llm: createMockLlm(),
      drive: createMockDrive(),
      extractText: async () => "Koji amazake study",
      lookup: async () => ({
        title: "New Koji Review",
        authors: "Seidler Y",
        year: 2024,
        journal: "Frontiers in Microbiology",
        doi: "10.9999/test.review",
        abstract: "A narrative review.",
        reference: "Seidler Y (2024). New Koji Review.",
        url: "https://doi.org/10.9999/test.review",
      }),
      fetchOpenAccessPdf: async () => null,
      driveRootId: "root",
      mock: true,
      llmConfigured: true,
      driveConfigured: true,
      ...overrides,
    };
  }

  it("saves an uploaded PDF into Drive and the library", async () => {
    const ctx = context({
      drive: createMockDrive(),
      extractText: async () => "Thermotolerant koji enzyme. doi 10.1111/uploaded.1",
    });
    const saved = await addPdf(ctx, "member@oryzae.site", new Uint8Array([0x25, 0x50, 0x44, 0x46]), "enzyme.pdf", {
      title: "アップロードした酵素論文",
      authors: "Oryzae Lab",
      year: 2023,
      journal: "Test",
      doi: "10.1111/uploaded.1",
      abstract: "耐熱性の酵素",
      category: "糖化酵素",
      background: "背景",
      objective: "",
      methods: "",
      results: "",
      discussion: "",
    });
    expect(saved.driveSaved).toBe(true);
    expect(saved.paper.doi).toBe("10.1111/uploaded.1");
    expect(saved.paper.driveUrl).toContain("drive.google.com");
    expect(saved.embedded).toBe(true);
    const again = addPdf(ctx, "member@oryzae.site", new Uint8Array([0x25, 0x50, 0x44, 0x46]), "enzyme.pdf", {
      title: "二重",
      authors: "",
      year: null,
      journal: "",
      doi: "10.1111/uploaded.1",
      abstract: "",
      category: "",
      background: "",
      objective: "",
      methods: "",
      results: "",
      discussion: "",
    });
    await expect(again).rejects.toThrow(/同じ DOI/);
  });

  it("registers a citation and links a Drive PDF that contains a known DOI", async () => {
    const ctx = context({});
    const saved = await addCitation(ctx, "member@oryzae.site", {
      title: "New Koji Review",
      authors: "Seidler Y",
      year: 2024,
      journal: "Frontiers in Microbiology",
      doi: "10.9999/test.review",
      abstract: "A narrative review.",
      reference: "Seidler Y (2024). New Koji Review.",
      url: "https://doi.org/10.9999/test.review",
    }, false);
    expect(saved.paper.title).toBe("New Koji Review");
    expect(saved.driveSaved).toBe(false);

    const drive = createMockDrive([
      { id: "drive-enzyme", name: "Thermostable α-Amylases and Laccases from Koji Mold.pdf", category: "糖化酵素", bytes: new TextEncoder().encode("no doi in this file") },
      { id: "drive-new", name: "新しい代謝産物.pdf", category: "麹菌由来の代謝産物", bytes: new TextEncoder().encode("A brand new metabolite paper with no doi") },
    ]);
    const synced = await syncDrive(context({
      drive,
      extractText: async (bytes) => new TextDecoder().decode(bytes),
    }), 5);
    expect(synced.attached).toBe(1);
    expect(synced.indexed).toBe(1);
    const known = await store.get("csv-1", "member@oryzae.site");
    expect(known?.driveFileId).toBe("drive-enzyme");
    const found = await searchLibrary(context({}), "member@oryzae.site", "代謝産物", null);
    expect(found.papers.some((paper) => paper.title.includes("代謝産物") || paper.title.includes("新しい"))).toBe(true);
  });
});
