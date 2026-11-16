import { FlaskConical } from "lucide-react";
import { signIn } from "@/auth";
import { authBypassEnabled } from "@/lib/config";
import { redirect } from "next/navigation";

const errorCopy: Record<string, string> = {
  AccessDenied: "oryzae.site の Google アカウントだけが利用できます。",
  Configuration: "Google ログインの設定が未完了です。AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET / AUTH_SECRET を確認してください。",
  OAuthSignin: "Google への接続を開始できませんでした。",
  OAuthCallback: "Google からの戻りに失敗しました。リダイレクト URL を確認してください。",
  Default: "ログインできませんでした。",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (authBypassEnabled()) redirect("/");
  const params = await searchParams;
  const ready = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);
  const error = params.error ? (errorCopy[params.error] ?? errorCopy.Default) : null;

  return (
    <main className="login-wrap">
      <section className="login-card">
        <div className="brand">
          <div className="brand-mark"><FlaskConical size={18} /></div>
          <div>
            <strong>ORYZAE SciBridge</strong>
            <span>研究開発ライブラリ</span>
          </div>
        </div>
        <h1>オリゼの論文庫</h1>
        <p className="muted">oryzae.site の Google アカウントで入ります。社外のアカウントや、ログインしていない状態では論文・メモ・Drive のリンクは見えません。</p>
        {error && <p className="error-banner">{error}</p>}
        {ready ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className="primary-button" type="submit">Google でログイン</button>
          </form>
        ) : (
          <div className="warning-banner">
            ログインの秘密情報がまだありません。docs/SETUP.md の Google OAuth と AUTH_SECRET を Vercel（または .env.local）に設定してください。
          </div>
        )}
      </section>
    </main>
  );
}
