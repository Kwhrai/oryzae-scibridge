import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/session";
import { AppError } from "@/lib/app-error";
import { errorResponse, json } from "@/lib/http";
import { lookupMetadata } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const body = await request.json();
    if (typeof body?.input !== "string") throw new AppError("DOI、URL、または引用文を貼ってください");
    const ctx = await getContext();
    const draft = await lookupMetadata(ctx, body.input);
    return json({ draft });
  } catch (error) {
    return errorResponse(error);
  }
}
