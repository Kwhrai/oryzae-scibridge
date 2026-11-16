import { requireUser } from "@/lib/auth/session";
import { allowedDomain, driveConfigured, llmConfigured, mockModeEnabled } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const mock = mockModeEnabled();
    return json({
      ok: true,
      mock,
      database: mock || Boolean(process.env.DATABASE_URL),
      llm: mock || llmConfigured(),
      drive: mock || driveConfigured(),
      domain: allowedDomain(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
