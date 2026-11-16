# SciBridge のセットアップ（Cloudflare）

論文・メモ・ブックマークは Cloudflare D1、意味検索のベクトルは Cloudflare Vectorize、画面と API は Cloudflare Workers です。PDF の原本はこれまでどおり Google ドライブの共有フォルダに置きます。Neon と Vercel は使いません。

秘密情報は `wrangler secret put` か、手元用の `.dev.vars` にだけ置きます。リポジトリには書きません。名前の一覧は `.env.example` です。

## 0. 先に決めておくこと

- Worker 名: `oryzae-scibridge`（`wrangler.jsonc` の `name`）
- ログインできる人: Google Workspace の `@oryzae.site` だけ
- PDF の置き場: 共有ドライブのフォルダ「既報研究（ORYZAE Scibridge）」  
  フォルダ ID `1f8kMQgoqvp9H0IIwzD6BAZ2-vcqIHHun`（`vars.DRIVE_ROOT_FOLDER_ID`）
- このフォルダは「リンクを知っている全員」にしない
- 埋め込みは Gemini `gemini-embedding-001` の **768 次元**、距離は **cosine**。索引を作ったあと次元は変えられません
- Workers AI にはしていません。日本語と英語が混ざる論文の検索は Gemini の埋め込みの方が安定で、項目抽出も同じ API キーで足ります。Workers AI の多言語モデルに乗り換えると、Vectorize の索引を作り直す必要があります

## 1. 古い Vercel について（ここでは触りません）

https://oryzae-scibridge.vercel.app は、以前の公開 CSV アプリのままです。このリポジトリを Cloudflare に移しても、Vercel のプロジェクトが Git につながったままだと、`main` へのマージで Vercel がまたビルドします。ビルドが失敗すれば古い公開アプリが残ります。ビルドが通ると、ログイン無しの経路が混ざる恐れがあります。

マージする前に、Vercel のダッシュボードでこのプロジェクトの Git 接続を外すか、プロジェクトを一時停止してください。Cloudflare 側が動いてから、その Vercel プロジェクトを削除すると、公開 CSV はインターネットから消えます。データベースは Vercel に無いので、消えるのは古い静的アプリだけです。

## 2. Cloudflare アカウントと Wrangler

```bash
npm install
npx wrangler login
```

Node.js 22 以上。課金は Workers Paid を想定しています。Free プランの CPU は 1 リクエスト 10ms で、PDF の本文抽出は足りません。Paid の既定は 30 秒で、論文 PDF の抽出と Drive 同期に足ります。

## 3. D1（論文・メモ・ブックマーク）— 済

データベース `scibridge` は作成済みです（APAC、`database_id` `3b221813-3db3-4bf6-8258-ad7380182a55`）。この ID は `wrangler.jsonc` に入っています。`npx wrangler d1 create` は再実行しないでください。

```bash
npm run db:migrate:local
npm run db:migrate
```

`migrations/0001_init.sql` がテーブルを作ります。既存 9 件の CSV は、初回アクセスで空のテーブルに入ります。`legacy_id` が同じ行は上書きしないので、メモを直したあとに再起動してもその修正は残ります。

## 4. Vectorize（意味検索）— 済

索引 `scibridge-papers` は作成済みです（768 次元、cosine）。`paperId`（string）のメタデータ索引もあります。作り直さないでください。バインディング名は `VECTORIZE` で、`wrangler.jsonc` に書いてあります。

ログイン後、一覧の「意味検索の索引」を最後まで押すと、移行した 9 件のベクトルが入ります。Vectorize への書き込みは数秒遅れて検索に出ることがあります。

## 5. Google ログイン（oryzae.site だけ）

Workspace の管理者権限がある Google Cloud プロジェクトで行います。

1. OAuth 同意画面のユーザーの種類は **内部**。
2. 認証情報 → OAuth クライアント ID → ウェブ アプリケーション。
3. 承認済みのリダイレクト URI。使わない URL は入れない。

```text
http://localhost:3000/api/auth/callback/google
https://oryzae-scibridge.<アカウントのサブドメイン>.workers.dev/api/auth/callback/google
https://<独自ドメイン>/api/auth/callback/google
```

アプリはリクエストのオリジンからリダイレクト URI を作ります。`hd` パラメータはヒントだけで、判定は ID トークンです。確認済みメールが `@oryzae.site` で、トークンの `hd` も `oryzae.site` のときだけクッキーを発行します。

```bash
npx wrangler secret put AUTH_GOOGLE_ID
npx wrangler secret put AUTH_GOOGLE_SECRET
openssl rand -base64 32
npx wrangler secret put AUTH_SECRET
```

`ALLOWED_EMAIL_DOMAIN` は `wrangler.jsonc` の `vars` で `oryzae.site` です。変えるときだけここを編集します。

## 6. Google Drive（サービスアカウント）

ユーザーごとの Drive 同意は取りません。共有ドライブを見るサービスアカウントです。

1. 同じ Google Cloud プロジェクトで **Google Drive API** を有効にする。
2. サービスアカウントを作り、JSON 鍵をダウンロードする。リポジトリには置かない。
3. JSON の `client_email` と `private_key` をシークレットにする。

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
```

`private_key` の改行は `\n` のままで構いません。アプリが実改行に戻します。

4. 共有ドライブ「既報研究（ORYZAE Scibridge）」のメンバーに、そのメールを **コンテンツ管理者** で追加する。フォルダの共有だけでは、共有ドライブでは一覧やアップロードが失敗することがあります。ドメイン全体の委任は使わない。

スコープは `https://www.googleapis.com/auth/drive` です。このアカウントを他のドライブのメンバーにしないでください。

同期は「論文を追加 → Drive → Driveを同期」。サブフォルダも辿ります。アップロードはカテゴリ名のサブフォルダに入ります。1 回の同期リクエストでは PDF を 1 件だけ読むので、画面が残り件数を見ながら繰り返します。

## 7. Gemini

https://aistudio.google.com/apikey でキーを作ります。

```bash
npx wrangler secret put GEMINI_API_KEY
```

モデル名は `vars` の `GEMINI_MODEL`（`gemini-2.5-flash`）と `GEMINI_EMBEDDING_MODEL`（`gemini-embedding-001`）です。埋め込みは 768 次元固定です。モデルを変えても `outputDimensionality` は 768 のままにしてください。次元を変えるには Vectorize の索引を削除して作り直します。

鍵が無いときもキーワード検索と手入力は動きます。

## 8. 任意: オープンアクセス PDF

```bash
npx wrangler secret put UNPAYWALL_EMAIL
npx wrangler secret put CROSSREF_MAILTO
```

`UNPAYWALL_EMAIL` が空なら、DOI 登録時に PDF は探さず書誌だけ保存します。

## 9. デプロイ

```bash
npm test
npm run build
npm run deploy
```

独自ドメインは Cloudflare ダッシュボードの Worker → 設定 → ドメイン、または

```bash
npx wrangler deploy --domain <ホスト名>
```

のあと、上のリダイレクト URI にそのホストを追加します。`workers.dev` の URL はデプロイ出力に出ます。

プレビュー URL は知っている人なら開けます。社外に見せないなら、独自ドメインと Google の「内部」同意画面に寄せ、`workers.dev` をダッシュボードで無効にすることを検討してください。

## 10. 手元で動かす

鍵なしで画面だけ見るとき:

```bash
npm run dev:mock
```

http://localhost:3000 です。起動中だけ `.dev.vars` に `SCI_BRIDGE_MOCK=1` と `AUTH_DISABLED=true` を足し、終了すると元に戻します。ログインはスキップします。D1 は Wrangler のローカルデータベースです。Vectorize はローカル模擬が無いので、意味検索のベクトルはプロセス内のテスト用ベクトルです。Drive も空の模擬なので、同期しても共有ドライブの PDF は出てきません。この二つのフラグは本番では無視されます。シークレットには入れないでください。

本番と同じ鍵で手元から見るときは `.dev.vars` に `.env.example` の項目を書き、`npm run dev` です。`.dev.vars` は git に入りません。

```bash
npm run db:migrate:local
```

## 11. PDF の大きさ

Cloudflare のゾーンが Free / Pro なら、Worker に届くリクエスト本体は 100MB までです。Worker のメモリは 128MB で、PDF の展開と本文抽出がここに載ります。アプリは **20MB まで**受け取ります。それより大きいファイルは共有ドライブに直接置き、「Driveを同期」します。以前の 4MB は Vercel の制限でした。

Free プランの CPU 10ms では本文抽出は失敗します。Workers Paid にしてください。

## 12. デプロイ後に確認すること

1. ログアウト状態ではログイン画面だけが出る。論文タイトルも Drive の URL も出ない。
2. `@oryzae.site` で入れる。`@gmail.com` は断られる。
3. 論文が 9 件ある。排便頻度の論文の DOI が `10.3390/jof7090782` で、Drive はファイル URL。
4. 「意味検索の索引」を最後まで押す。
5. 「排便の甘酒」でその論文が上に出る。
6. Drive を同期し、共有ドライブの PDF が増える。既にある DOI やファイルは二重にならない。
7. 20MB 以下の PDF をアップロードし、Drive のカテゴリフォルダにファイルがある。
8. スマホ幅で検索して開ける。

Drive が 403 のときは、サービスアカウントが共有ドライブのメンバーか、Drive API が有効かを見ます。意味検索がキーワードだけなら、`GEMINI_API_KEY` と索引の件数を見ます。

## 13. まだ実サービスに繋いでいないこと

この環境にはオリゼの Cloudflare アカウントも Google の鍵もありません。次は実装と、ローカルのテスト（D1 と同じ SQL を Node の SQLite で実行、Vectorize の代わりにメモリ上のコサイン類似）までです。

- `wrangler login` 以降の D1 作成、Vectorize 作成、シークレット、デプロイ
- Google ログインの画面遷移と、実 ID トークンの `hd`
- サービスアカウントでの共有ドライブ一覧・アップロード・ダウンロード
- Gemini の実応答
- Crossref / PubMed / Unpaywall への実リクエスト（応答の形だけ固定データでテスト）
- unpdf による実 PDF のテキスト抽出
- Workers Paid での CPU 時間と、20MB 近い PDF のメモリ
