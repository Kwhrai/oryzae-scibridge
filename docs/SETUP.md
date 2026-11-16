# SciBridge のセットアップ

Cloud Console は使いません。Workspace の管理者が 2 段階認証を有効にしていないため、コンソールも OAuth クライアントもサービスアカウントも作れません。ログインは Cloudflare Access、PDF は自分の Google アカウントで動く Apps Script、記録は D1、意味検索は Vectorize です。

秘密は `wrangler secret put` か手元の `.dev.vars` だけに置きます。名前の一覧は `.env.example` です。

## 0. 先に決めておくこと

- Worker 名は `oryzae-scibridge` です。
- 入れる人は `@oryzae.site` のメールだけです。入口は Cloudflare Access のワンタイム PIN です。
- PDF の置き場は共有ドライブのフォルダ「既報研究（ORYZAE Scibridge）」です。フォルダ ID は `1f8kMQgoqvp9H0IIwzD6BAZ2-vcqIHHun` で、`wrangler.jsonc` に入っています。このフォルダを「リンクを知っている全員」にはしないでください。
- 埋め込みは **768 次元、cosine** のままです。既にある索引 `scibridge-papers` は作り直さなくてよいです。
- Gemini の埋め込みが使えないときは Workers AI の `@cf/baai/bge-base-en-v1.5`（これも 768 次元）に落ちます。`@cf/baai/bge-m3` は 1024 次元なので、それに替えるときだけ索引を削除して作り直します。
- Gemini と Workers AI のベクトルは同じ 768 個でも別の空間です。途中で切り替えたら、画面の「意味検索の索引」をやり直す前に、古いベクトルを消してください。索引そのものは残してよいです。

## 1. 古い Vercel について（ここでは触りません）

https://oryzae-scibridge.vercel.app は、以前の公開 CSV アプリのままです。この作業では Vercel を操作しません。`main` へマージする前に、Vercel のダッシュボードで Git 接続を外すか、プロジェクトを止めてください。Cloudflare 側が動いてからそのプロジェクトを削除すると、公開 CSV はインターネットから消えます。Vercel にデータベースは無いので、消えるのは古い静的アプリだけです。

## 2. Cloudflare にログインする

Node.js 22 以上です。

```bash
npm install
npx wrangler login
```

最初は Workers の無料プランで動かす想定です。1 リクエストの CPU は 10ms です。PDF の読み取りと Gemini への送信は Apps Script がやるので、Worker は待っているあいだ CPU を使いません。画面に `1102` や `Worker exceeded CPU time limit` が出て、待っても直らないときだけ Workers Paid（月 5 ドル）へ上げてください。Paid は任意です。

## 3. D1 — 済

データベース `scibridge` は作成済みです（APAC、`database_id` `3b221813-3db3-4bf6-8258-ad7380182a55`）。`wrangler.jsonc` に入っています。`wrangler d1 create` は再実行しないでください。

まだ一度も流していない場合だけ、テーブルを作ります。

```bash
npm run db:migrate
```

9 件の CSV は、デプロイ後に画面を開くと 1 件ずつ入ります。起動の瞬間に 9 件まとめては入れません。

## 4. Vectorize — 済

索引 `scibridge-papers` は作成済みです。768 次元、cosine、メタデータの `paperId` も付いています。作り直さないでください。

Workers AI の `@cf/baai/bge-m3` に替える場合だけ、次元が 1024 になるので索引を削除して作り直します。既定のフォールバック `@cf/baai/bge-base-en-v1.5` は 768 のままです。

## 5. Cloudflare Access（ログイン）

Zero Trust の無料枠で足ります。Google の OAuth クライアントは作りません。

1. [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) を開く。チーム名を決める。例: `oryzae`。この名前が `https://oryzae.cloudflareaccess.com` になります。
2. Settings → Authentication で、One-time PIN を有効にする。
3. Access → Applications → Add an application → Self-hosted。
4. アプリケーション名は `SciBridge`。ドメインは、このあとデプロイする Worker のホスト名（`oryzae-scibridge.<アカウント>.workers.dev` か、付けた独自ドメイン）にする。まだデプロイ前なら、ホスト名を先に決めてからここに書く。
5. ポリシーは Allow。Include の Selector を Emails ending in にして、値を `oryzae.site` にする。他の条件は足さない。
6. 身份の方法は One-time PIN。
7. 保存したあと、アプリケーションの設定にある **Application Audience (AUD) Tag** をコピーする。
8. 秘密を入れる。

```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
# 例: oryzae
npx wrangler secret put CF_ACCESS_AUD
# コピーした AUD タグ
```

アプリはリクエストの `Cf-Access-Jwt-Assertion` を、`https://<チーム>.cloudflareaccess.com/cdn-cgi/access/certs` の公開鍵で検証します。AUD が一致し、メールが `@oryzae.site` で終わるときだけ通します。証明書と検証済みトークンは Worker のメモリに少しのあいだ覚えます。

ログアウトは `/cdn-cgi/access/logout` です。

`workers.dev` のプレビュー URL を Access の対象に入れ忘れると、その URL は公開されたままです。使うホストはすべて Access のアプリケーションに入れてください。

## 6. Apps Script（Drive と PDF の読み取り）

自分の Google アカウントで [script.google.com](https://script.google.com) を開きます。共有ドライブのフォルダを見られるアカウントで作ってください。

1. 新しいプロジェクトを作る。
2. `apps-script/Code.gs` の中身を、エディタの `コード.gs` に貼る。
3. プロジェクト設定の「appsscript.json を表示」をオンにし、`apps-script/appsscript.json` の中身を貼る。
4. 左の「サービス」から **Drive API**（高度なサービス）を追加する。Gemini のキーが無いときのテキスト抜き出しに使います。追加できなくても、Gemini のキーがあれば PDF の読み取りは動きます。追加に失敗しても Cloud Console は開かないでください。
5. プロジェクトの設定 → スクリプト プロパティ。
   - `APPS_SCRIPT_SECRET`: `openssl rand -base64 32` の結果。Worker と同じ値。
   - `GEMINI_API_KEY`: 手順 7 で取れたときだけ。取れなければ空のまま。
6. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」。
   - 実行ユーザー: **自分**
   - アクセスできるユーザー: **全員**
7. 表示された URL（`https://script.google.com/macros/s/.../exec`）をコピーする。

```bash
npx wrangler secret put APPS_SCRIPT_URL
npx wrangler secret put APPS_SCRIPT_SECRET
```

ブラウザはこの秘密を知りません。アップロードはブラウザが PDF を base64 にし、Worker がその文字列を Apps Script へ流します。秘密は Worker がクエリに付けます。Apps Script は独自の HTTP ヘッダーを読めず、`/exec` への POST はリダイレクトで本文が落ちるため、Worker は最初に小さな GET で転送先を覚え、そこへ本文を送ります。

Apps Script が PDF を読み、Gemini が使えるときは項目の JSON だけを Worker に返します。大きな PDF と base64 は Worker の 10ms に載せません。

公開クォータ（[Google の一覧](https://developers.google.com/apps-script/guides/services/quotas)、2026-09 時点。予告なく変わります）:

- 1 回の実行は 6 分
- UrlFetch の POST と応答はそれぞれ 50MB。20MB の PDF を base64 にすると約 27MB なので、この上限の内側です
- UrlFetch の URL は 2KB
- UrlFetch は、コンシューマ アカウントで 1 日 2 万回、Workspace アカウントで 1 日 10 万回（そのユーザーの全部のスクリプトで共有）

1 日に数十本の論文を入れる分には足ります。毎日何千本も流す使い方は想定していません。

## 7. Gemini のキー（AI Studio）

[Google AI Studio](https://aistudio.google.com/apikey) で API キーを作ります。Cloud Console は経由しません。

取れたら、Worker と Apps Script の両方に置きます。Worker は意味検索の埋め込み（`gemini-embedding-001`、768 次元）に使います。Apps Script は PDF の項目抽出に使います。

```bash
npx wrangler secret put GEMINI_API_KEY
```

Apps Script 側は手順 6 のスクリプト プロパティ `GEMINI_API_KEY` です。モデル名は変えない限り、スクリプトプロパティ `GEMINI_MODEL` は空でよいです（既定 `gemini-2.5-flash`）。

AI Studio も同じ 2 段階認証の制限で開けない場合は、キーを空のままにします。そのときの動きは次のとおりです。

- 埋め込みと、短いテキストからの項目整理は Workers AI です。埋め込みは `@cf/baai/bge-base-en-v1.5`（768 次元）。文章の整理は `@cf/meta/llama-3.1-8b-instruct`。Workers AI には 1 日の無料枠があります。
- PDF そのものは Workers AI に送りません。Apps Script が Drive の「Google ドキュメントへコピー」でテキストを抜けるときだけ、その短いテキストを Worker が整理します。高度な Drive サービスが使えないときは、ファイル名と手入力のメモだけになります。
- 日本語のうろ覚え検索は、Gemini の埋め込みより弱くなります。次元は 768 のままなので、索引の作り直しは不要です。
- 強制するときは `npx wrangler secret put LLM_PROVIDER` に `workers-ai` と入れます。未設定の `auto` は、`GEMINI_API_KEY` があれば Gemini、無ければ Workers AI です。

`bge-base-en-v1.5` の入力はおおよそ 512 トークンです。Worker は埋め込みに渡す文章を 800 字に切っています。

## 8. 任意の連絡用メール

オープンアクセスの PDF を DOI から探すときだけ使います。Worker は URL を見つけるだけで、ファイルのダウンロードは Apps Script がします。

```bash
npx wrangler secret put UNPAYWALL_EMAIL
npx wrangler secret put CROSSREF_MAILTO
```

空でも、書誌の検索自体は動きます。PDF の自動保存だけがスキップされます。

## 9. デプロイ

```bash
npm test
npm run build
npm run deploy
```

デプロイしたホスト名を、手順 5 の Access アプリケーションに入れます。入れたあと、その URL を開くとメールのワンタイム PIN を聞かれます。PIN の宛先が `@oryzae.site` でない人は入れません。

## 10. 最初の索引

1. Access を通って画面を開く。CSV の 9 件が 1 件ずつ入ります。
2. 「Driveを同期」を押す。共有ドライブの PDF を 1 件ずつ取り込みます。ボタンは残りが無くなるまで繰り返します。
3. 「意味検索の索引」を押す。1 件ずつベクトルを作ります。`0/9` のような表示が `9/9` になるまで待ちます。

キーワード検索は索引の前から使えます。意味検索は索引のあとです。

## 11. 手元で画面だけ見る

```bash
npm run dev:mock
```

http://localhost:3000 です。起動中だけ `.dev.vars` に `SCI_BRIDGE_MOCK=1` と `AUTH_DISABLED=true` を足し、終了すると元に戻します。ログインは飛ばします。Drive と Gemini は空の模擬です。Vectorize のローカル模擬は無いので、意味検索のベクトルはこのプロセスの中だけにあります。Workers AI のバインディングも外します。このバインディングはローカル模擬が無く、残すと Wrangler が Cloudflare へのログインを要求するためです。この二つのフラグは本番では無視されます。シークレットには入れないでください。

`npm run dev` は `wrangler.jsonc` の Workers AI バインディングを残します。ローカル模擬が無いので、`npx wrangler login` 済みでないと起動時にログインを聞きます。モックで画面を見るだけなら `dev:mock` で足ります。

本番と同じ経路を手元で見るときは、`.dev.vars` に手順 5 から 8 の値を書いて `npm run dev` です。Access の JWT は localhost には付かないので、画面を通すには `AUTH_DISABLED=true` が要ります。

## 12. アップロードの大きさ

ブラウザで選ぶ PDF は 20MB までです。それより大きいファイルは共有ドライブのカテゴリフォルダに置いてから「Driveを同期」します。20MB は base64 で約 27MB になり、Workers 無料プランのリクエスト本文（100MB）と Apps Script の POST（50MB）のどちらにも収まります。

## 13. デプロイ後の確認

- `@oryzae.site` 以外のメールでは PIN のあと入れない
- 一覧に移行した 9 件が出る。DOI が `TRUE` や `FALSE` の行は無い
- 「排便」で麹甘酒の論文に届く
- ブックマークは自分のメールアドレスだけに残る
- PDF を 1 件保存すると、共有ドライブのカテゴリフォルダにファイルができ、詳細に Drive のリンクが出る
- `1102` が出たら、手順 2 の Paid を検討する

## 14. ここまでで実機確認していないこと

- Cloudflare Access の実 JWT
- デプロイした Apps Script と、共有ドライブへの書き込み
- AI Studio のキー、およびキーが取れないときの Workers AI
- `npm run db:migrate` がリモート D1 に適用済みかどうか。未適用なら手順 3 を一度だけ実行する
- 本番の Vectorize への投入。索引の作成自体は済んでいます
