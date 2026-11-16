import { NextResponse } from "next/server";
import { AppError } from "@/lib/app-error";

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  const message = error instanceof Error && /vector|DATABASE_URL|ECONNREFUSED|password authentication/i.test(error.message)
    ? "データベースに接続できません。DATABASE_URL と pgvector を確認してください。"
    : "サーバーで問題が起きました";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
