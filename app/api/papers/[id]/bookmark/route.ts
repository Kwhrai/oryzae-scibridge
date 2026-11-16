import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/app-error";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const body = await request.json();
    if (typeof body?.bookmarked !== "boolean") throw new AppError("bookmarked が必要です");
    const { id } = await params;
    const ctx = await getContext();
    await ctx.store.setBookmark(id, user.email, body.bookmarked);
    return json({ bookmarked: body.bookmarked });
  } catch (error) {
    return errorResponse(error);
  }
}
