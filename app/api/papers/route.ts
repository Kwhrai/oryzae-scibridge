import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/current-user";
import { errorResponse, json } from "@/lib/http";
import { searchLibrary } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const url = new URL(request.url);
    const query = url.searchParams.get("q") ?? "";
    const category = url.searchParams.get("category") || null;
    const ctx = await getContext();
    const result = await searchLibrary(ctx, user.email, query, category);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
