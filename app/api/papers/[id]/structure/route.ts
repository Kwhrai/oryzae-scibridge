import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/current-user";
import { errorResponse, json } from "@/lib/http";
import { structurePaper } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const { id } = await params;
    const ctx = await getContext();
    const paper = await structurePaper(ctx, user.email, id);
    return json({ paper });
  } catch (error) {
    return errorResponse(error);
  }
}
