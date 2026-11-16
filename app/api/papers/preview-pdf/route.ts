import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/app-error";
import { errorResponse, json } from "@/lib/http";
import { previewPdf } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("PDFファイルを選んでください");
    const ctx = await getContext();
    const result = await previewPdf(ctx, new Uint8Array(await file.arrayBuffer()), file.name);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
