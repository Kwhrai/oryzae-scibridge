import { signOut } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await signOut({ redirectTo: "/login" });
}
