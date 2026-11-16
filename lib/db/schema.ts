import migrationSql from "../../migrations/0001_init.sql?raw";

export function migrationStatements(source = migrationSql): string[] {
  return source
    .split(";")
    .map((statement) => statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim())
    .filter(Boolean);
}
