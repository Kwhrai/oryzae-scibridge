import type { Db } from "@/lib/db/types";

export async function createPgliteDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite/vector");
  const pg = new PGlite({ extensions: { vector } });
  await pg.waitReady;
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const result = await pg.query<T>(text, params);
      return result.rows;
    },
    async batch(queries) {
      if (queries.length === 0) return;
      await pg.exec("BEGIN");
      try {
        for (const query of queries) await pg.query(query.text, query.params ?? []);
        await pg.exec("COMMIT");
      } catch (error) {
        await pg.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
