import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, json } from "@/lib/http";
import { reindex } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const ctx = await getContext();
    const result = await reindex(ctx, 2);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
