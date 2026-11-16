import { getContext } from "@/lib/context";
import { requireUser } from "@/lib/auth/session";
import { errorResponse, json } from "@/lib/http";
import { addCitation } from "@/lib/library";
import type { CitationDraft } from "@/lib/metadata/crossref";
import { readExtracted } from "@/lib/papers/patch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const body = await request.json();
    const extracted = readExtracted(body);
    const reference = typeof body?.reference === "string" ? body.reference : "";
    const draft: CitationDraft = { ...extracted, reference, url: extracted.doi ? `https://doi.org/${extracted.doi}` : "" };
    const ctx = await getContext();
    const result = await addCitation(ctx, user.email, draft, body?.saveOpenAccessPdf !== false);
    return json(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
