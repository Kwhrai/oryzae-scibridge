import { readFileSync } from "node:fs";
import { createNeonDb } from "../lib/db/neon";
import { createPaperStore } from "../lib/db/paper-store";
import { papersFromCsv } from "../lib/papers/csv";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL がありません。.env.local を確認してください。");
  process.exit(1);
}

const store = createPaperStore(createNeonDb(url));
const csv = readFileSync(new URL("../data/papers.csv", import.meta.url), "utf8");
const inserted = await store.seedMigrated(papersFromCsv(csv));
const stats = await store.stats();
console.log(`追加 ${inserted} 件 / 合計 ${stats.total} 件（既存の legacy_id は上書きしません）`);
