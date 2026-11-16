import { requireUser } from "@/lib/auth/current-user";
import { allowedDomain, driveConfigured, llmConfigured, mockModeEnabled } from "@/lib/config";
import { errorResponse, json } from "@/lib/http";
import { runtimeEnv } from "@/lib/runtime-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    if (!user) return json({ error: "ログインが必要です" }, 401);
    const env = await runtimeEnv();
    const mock = mockModeEnabled(env);
    return json({
      ok: true,
      mock,
      database: Boolean(env.DB),
      vectorize: Boolean(env.VECTORIZE),
      llm: mock || llmConfigured(env),
      drive: mock || driveConfigured(env),
      domain: allowedDomain(env),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
