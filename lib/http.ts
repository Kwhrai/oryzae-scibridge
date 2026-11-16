import { NextResponse } from "next/server";
import { AppError } from "@/lib/app-error";

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  const message = error instanceof Error && /D1|no such table|SQLITE/i.test(error.message)
    ? "データベースに接続できません。D1 のバインディングとマイグレーションを確認してください。"
    : "サーバーで問題が起きました";
  return NextResponse.json({ error: message }, { status: 500 });
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
