import { authBypassEnabled } from "@/lib/config";
import { runtimeEnv } from "@/lib/runtime-env";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const env = await runtimeEnv();
  if (authBypassEnabled(env)) {
    return (
      <main className="login-screen">
        <section>
          <p className="eyebrow">ORYZAE SciBridge</p>
          <h1>開発モード</h1>
          <p>認証を省略しています。</p>
          <a className="primary-button" href="/">ライブラリを開く</a>
        </section>
      </main>
    );
  }
  return (
    <main className="login-screen">
      <section>
        <p className="eyebrow">ORYZAE R&D</p>
        <h1>社内の論文ライブラリです</h1>
        <p>入口は Cloudflare Access です。会社のメールアドレスに届くワンタイムPINで入れます。</p>
        <a className="primary-button" href="/">ライブラリを開く</a>
      </section>
    </main>
  );
}
