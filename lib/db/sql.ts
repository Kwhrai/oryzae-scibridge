import { migrationStatements } from "@/lib/db/schema";

export type SqlStatement = { sql: string; params?: unknown[] };

export type Sql = {
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<void>;
  batch(statements: SqlStatement[]): Promise<void>;
};

export type D1Like = {
  prepare(query: string): D1LikeStatement;
  batch(statements: D1LikeStatement[]): Promise<unknown>;
};

type D1LikeStatement = {
  bind(...values: unknown[]): D1LikeStatement;
  all<T>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

function bound(db: D1Like, query: string, params: unknown[] = []) {
  const statement = db.prepare(query);
  return params.length ? statement.bind(...params) : statement;
}

export function createD1Sql(db: D1Like): Sql {
  return {
    async all<T>(query: string, params: unknown[] = []) {
      const result = await bound(db, query, params).all<T>();
      return result.results ?? [];
    },
    async run(query: string, params: unknown[] = []) {
      await bound(db, query, params).run();
    },
    async batch(statements) {
      if (statements.length === 0) return;
      await db.batch(statements.map((statement) => bound(db, statement.sql, statement.params ?? [])));
    },
  };
}

export async function createNodeSqlite(): Promise<Sql> {
  // Tests only. The Worker uses D1 and must not import this module.
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  return {
    async all<T>(query: string, params: unknown[] = []) {
      return db.prepare(query).all(...(params as import("node:sqlite").SQLInputValue[])) as T[];
    },
    async run(query: string, params: unknown[] = []) {
      db.prepare(query).run(...(params as import("node:sqlite").SQLInputValue[]));
    },
    async batch(statements) {
      if (statements.length === 0) return;
      db.exec("BEGIN");
      try {
        for (const statement of statements) {
          db.prepare(statement.sql).run(...((statement.params ?? []) as import("node:sqlite").SQLInputValue[]));
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

export async function applyMigrations(sql: Sql): Promise<void> {
  for (const statement of migrationStatements()) {
    await sql.run(statement);
  }
}
