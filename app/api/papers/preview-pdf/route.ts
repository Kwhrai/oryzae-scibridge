import { requireUser } from "@/lib/auth/current-user";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const body = await request.json().catch(() => ({})) as { filename?: string };
    const filename = body.filename?.replace(/\.pdf$/i, "") || "無題";
    return json({
      ai: false,
      warning: "保存すると Apps Script が本文を読みます。先に直したい欄だけ入力してください。",
      draft: {
        title: filename,
        authors: "",
        year: null,
        journal: "",
        doi: "",
        abstract: "",
        category: "",
        background: "",
        objective: "",
        methods: "",
        results: "",
        discussion: "",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
