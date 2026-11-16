import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/current-user";
import { errorResponse, json } from "@/lib/http";
import { seedNext } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    return json(await seedNext(await getContext()));
  } catch (error) {
    return errorResponse(error);
  }
}
