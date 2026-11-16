import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/current-user";
import { AppError } from "@/lib/app-error";
import { errorResponse, json } from "@/lib/http";
import { addUploadedPdf } from "@/lib/library";
import { readExtracted } from "@/lib/papers/patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const filename = decodeURIComponent(request.headers.get("x-filename") || "paper.pdf");
    const rawMeta = request.headers.get("x-metadata");
    const meta = readExtracted(rawMeta ? JSON.parse(decodeURIComponent(rawMeta)) : {});
    const size = Number(request.headers.get("content-length") || "0");
    if (!request.body) throw new AppError("PDFがありません");
    const ctx = await getContext();
    const result = await addUploadedPdf(ctx, user.email, { filename, size, body: request.body, meta });
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
