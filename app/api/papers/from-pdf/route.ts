import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/app-error";
import { errorResponse, json } from "@/lib/http";
import { addPdf } from "@/lib/library";
import { readExtracted } from "@/lib/papers/patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const form = await request.formData();
    const file = form.get("file");
    const raw = form.get("metadata");
    if (!(file instanceof File)) throw new AppError("PDFファイルを選んでください");
    if (typeof raw !== "string") throw new AppError("書誌情報がありません");
    const meta = readExtracted(JSON.parse(raw));
    const ctx = await getContext();
    const result = await addPdf(ctx, user.email, new Uint8Array(await file.arrayBuffer()), file.name, meta);
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
