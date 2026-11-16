import { neon } from "@neondatabase/serverless";
import type { Db } from "@/lib/db/types";

export function createNeonDb(connectionString: string): Db {
  const sql = neon(connectionString);
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const rows = await sql.query(text, params);
      return rows as T[];
    },
    async batch(queries) {
      if (queries.length === 0) return;
      await sql.transaction(queries.map((query) => sql.query(query.text, query.params ?? [])));
    },
  };
}
