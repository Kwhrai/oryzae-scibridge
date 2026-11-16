import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, json } from "@/lib/http";
import { AppError } from "@/lib/app-error";
import { updatePaper } from "@/lib/library";
import { toDetail } from "@/lib/papers/present";
import { readPatch } from "@/lib/papers/patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Args = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Args) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const { id } = await params;
    const ctx = await getContext();
    const paper = await ctx.store.get(id, user.email);
    if (!paper) throw new AppError("論文が見つかりません", 404);
    return json({ paper: toDetail(paper) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: Args) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const { id } = await params;
    const patch = readPatch(await request.json());
    const ctx = await getContext();
    const paper = await updatePaper(ctx, user.email, id, patch);
    return json({ paper });
  } catch (error) {
    return errorResponse(error);
  }
}
