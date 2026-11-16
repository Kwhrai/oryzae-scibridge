# SciBridge のセットアップ

このアプリを本番（https://oryzae-scibridge.vercel.app ）で使うために、外で一度だけ作るものと、Vercel に入れる環境変数です。コードの中に鍵は置きません。`.env.example` が名前の一覧です。

所要は、Google Cloud のプロジェクトが一つ、Neon のデータベースが一つ、Gemini の API キーが一つです。

## 0. 先に決めておくこと

- 本番 URL: `https://oryzae-scibridge.vercel.app`（変える場合は以下のリダイレクト URL も合わせる）
- ログインできる人: Google Workspace の `@oryzae.site` だけ
- PDF の置き場: 共有ドライブのフォルダ「既報研究（ORYZAE Scibridge）」  
  フォルダ ID `1f8kMQgoqvp9H0IIwzD6BAZ2-vcqIHHun`
- このフォルダは「リンクを知っている全員」にしない。オリゼのメンバーと、このあと作るサービスアカウントだけにする

## 1. Neon（論文と検索ベクトル）

1. https://neon.tech でプロジェクトを作る。リージョンは東京が近ければ `aws-ap-northeast-1`。
2. Postgres 16 以上。無料枠で足りる（論文数十件と 768 次元のベクトルが対象）。
3. SQL エディタで次を実行する。

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

アプリの起動時にも同じ文を出します。権限で失敗したときのための保険です。

4. 接続文字列は **Pooled connection** をコピーする。Vercel のサーバーレス関数はこちらの方が安定します。`DATABASE_URL` に入れる。

テーブルはアプリが初回アクセスで作ります。手元から先に入れたいときは、`.env.local` に `DATABASE_URL` を書いたうえで

```bash
npm run seed
```

既存の 9件は `legacy_id` が同じなら上書きしません。メモを直したあとに seed を再実行しても、その修正は残ります。

## 2. Google ログイン（oryzae.site だけ）

Workspace の管理者権限がある Google Cloud プロジェクトで行います。

1. https://console.cloud.google.com でプロジェクトを作るか、既存の社内プロジェクトを選ぶ。
2. 「API とサービス」→「OAuth 同意画面」。
   - ユーザーの種類は **内部**。これで `oryzae.site` のユーザー以外には同意画面が出ません。
   - アプリ名は `ORYZAE SciBridge`。
   - スコープは追加しなくてよい（openid、email、profile はログイン用として後から付きます）。Drive のスコープはユーザーログインには付けません。Drive は次のサービスアカウントが使います。
3. 「認証情報」→「認証情報を作成」→「OAuth クライアント ID」→ ウェブ アプリケーション。
4. 承認済みのリダイレクト URI に、両方入れる。

```text
https://oryzae-scibridge.vercel.app/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

5. クライアント ID を `AUTH_GOOGLE_ID`、クライアント シークレットを `AUTH_GOOGLE_SECRET` にする。
6. `AUTH_SECRET` を作る。

```bash
openssl rand -base64 32
```

7. `AUTH_URL` は本番では `https://oryzae-scibridge.vercel.app`（末尾のスラッシュなし）。ローカルは `http://localhost:3000`。
8. `ALLOWED_EMAIL_DOMAIN` は `oryzae.site`。

アプリ側では、Google が返す確認済みメールが `@oryzae.site` で、かつ ID トークンの `hd` が `oryzae.site` のときだけセッションを作ります。同意画面の「内部」と、この判定の両方が必要です。`hd` パラメータをログイン URL に付けるだけでは足りません。

## 3. Google Drive（サービスアカウント）

人がフォルダに置いた PDF も、アプリが保存した PDF も、同じ共有ドライブを見るためのアカウントです。ユーザーごとの Drive 同意は取りません。

1. 同じ Google Cloud プロジェクトで「API とサービス」→「ライブラリ」から **Google Drive API** を有効にする。
2. 「認証情報」→「認証情報を作成」→「サービス アカウント」。名前は `scibridge-drive` など。
3. サービスアカウントを開く →「鍵」→「鍵を追加」→ JSON。ダウンロードしたファイルはリポジトリに置かない。
4. JSON の `client_email` を `GOOGLE_SERVICE_ACCOUNT_EMAIL` にする。
5. JSON の `private_key` を `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` にする。改行は `\n` のままでよい。Vercel の入力欄では、鍵全体をダブルクォートで囲む。

```text
"-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

6. 共有ドライブ「既報研究（ORYZAE Scibridge）」のメンバーに、その `client_email` を **コンテンツ管理者** で追加する。
   - フォルダの「共有」だけだと、共有ドライブではアップロードや一覧が失敗することがあります。ドライブ自体のメンバーに入れます。
   - ドメイン全体の委任（domain-wide delegation）は使わない。権限が広すぎます。
7. `DRIVE_ROOT_FOLDER_ID` は `1f8kMQgoqvp9H0IIwzD6BAZ2-vcqIHHun`。変えないならそのままでよい。アプリはこの値を既定にしています。

サービスアカウントに渡しているスコープは `https://www.googleapis.com/auth/drive` です。見える範囲は、このアカウントがメンバーになっているドライブに限られます。別のドライブには追加しないでください。

同期は画面の「論文を追加 → Drive → Driveを同期」です。サブフォルダ（麹菌由来の代謝産物、甘酒・健康機能効果、米関連、米麹・その他、糖化酵素、麹菌,ゲノム など）も辿ります。新しい PDF のカテゴリは、入っていたフォルダ名になります。アップロードするときはカテゴリ名のサブフォルダを作り、そこに PDF を置きます。

直接アップロードは約 4MB までです（Vercel のリクエストサイズ）。それより大きい PDF は、ドライブのフォルダに置いてから同期します。

## 4. Gemini（意味検索と、PDF からの項目抽出）

1. https://aistudio.google.com/apikey で API キーを作る。社内の Google アカウントでよい。
2. `GEMINI_API_KEY` に入れる。
3. 既定のモデル:
   - 文章: `gemini-2.5-flash`（`GEMINI_MODEL`）
   - 埋め込み: `gemini-embedding-001`（`GEMINI_EMBEDDING_MODEL`）
4. ベクトルは **768 次元固定**です。モデルを変えるときは、768 次元を返せるものにしてください。次元を変えるにはテーブル `paper_chunks` を作り直す必要があります。

鍵が無いときも、キーワード検索と書誌の手入力は動きます。意味検索と「AIで構造化」は、画面に設定不足と出ます。

索引は論文を追加したときにその1件だけ作ります。移行した9件は、ログイン後に一覧の「意味検索の索引」を押すと数件ずつ作ります。

## 5. 任意: オープンアクセス PDF

DOI から登録するとき、「オープンアクセスの PDF があれば Drive に保存」にチェックすると Unpaywall を見ます。

- `UNPAYWALL_EMAIL`: Unpaywall が求める連絡先。実在するオリゼのメールにする（例: 研究担当のアドレス）。空なら PDF は探さず、書誌だけ保存します。
- `CROSSREF_MAILTO`: 空なら `UNPAYWALL_EMAIL`、それも空なら `scibridge@oryzae.site` を Crossref の User-Agent に使います。届けなくてよい識別子です。

## 6. Vercel に入れる環境変数

プロジェクト `oryzae-scibridge` の Settings → Environment Variables。Production と Preview の両方に入れます。Preview を社外に見せないなら、Preview には入れず、Production だけにします。

| 名前 | 必須 | 例・メモ |
| --- | --- | --- |
| `AUTH_SECRET` | はい | `openssl rand -base64 32` |
| `AUTH_URL` | はい | `https://oryzae-scibridge.vercel.app` |
| `AUTH_GOOGLE_ID` | はい | OAuth クライアント ID |
| `AUTH_GOOGLE_SECRET` | はい | OAuth クライアント シークレット |
| `ALLOWED_EMAIL_DOMAIN` | はい | `oryzae.site` |
| `DATABASE_URL` | はい | Neon の pooled 接続文字列 |
| `GEMINI_API_KEY` | 意味検索を使うなら | AI Studio のキー |
| `GEMINI_MODEL` | いいえ | `gemini-2.5-flash` |
| `GEMINI_EMBEDDING_MODEL` | いいえ | `gemini-embedding-001` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Drive を使うなら | JSON の client_email |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Drive を使うなら | JSON の private_key |
| `DRIVE_ROOT_FOLDER_ID` | いいえ | 既定は既報研究フォルダ |
| `UNPAYWALL_EMAIL` | OA PDF を取るなら | 連絡用メール |
| `CROSSREF_MAILTO` | いいえ | 同上でよい |

入れてはいけないもの:

- `AUTH_DISABLED=true`
- `SCI_BRIDGE_MOCK=1`

この二つはローカルの画面確認用で、`NODE_ENV=production` または `VERCEL_ENV=production` ではコードが無視します。それでも本番の環境変数には置かないでください。

Node.js は 22 以上です。Vercel の Project Settings → General → Node.js Version を 22.x にしてください。

保存したら再デプロイします。`main` へのマージでデプロイされる設定なら、このブランチをマージしたときに新しい環境変数が効きます。

## 7. デプロイ後に確認すること

1. ログアウトした状態でトップを開くと、ログイン画面だけが出る。論文タイトルや Drive の URL は HTML にも API にも出ない。
2. `@oryzae.site` でログインできる。`@gmail.com` は「oryzae.site の Google アカウントだけ」と出て入れない。
3. 論文が 9 件ある。3件目の DOI が `10.3390/jof7090782` で、Drive リンクがファイル URL になっている（以前は DOI の位置に TRUE/FALSE が入っていた）。
4. 「意味検索の索引」を最後まで押す。
5. 「排便の甘酒」で、甘酒の排便頻度の論文が上に出る。
6. 「論文を追加 → Drive → Driveを同期」で、共有ドライブの PDF が増える。既に紐づいているファイルは二重にならない。
7. 小さい PDF をアップロードし、書誌を確認して保存する。Drive のカテゴリフォルダにファイルができている。
8. スマホの幅で、検索 → 論文を開く → 一覧へ戻る、ができる。

ログインできないときは、リダイレクト URI、OAuth が「内部」であること、`AUTH_URL` の末尾スラッシュ、`AUTH_SECRET` の有無を見ます。Drive が 403 のときは、サービスアカウントが共有ドライブのメンバーか、Drive API が有効かを見ます。意味検索がキーワードだけになるときは、`GEMINI_API_KEY` と、索引が 9/9 まで進んだかを見ます。

## 8. ローカル開発

```bash
cp .env.example .env.local
# 値を入れる。本番の鍵を使うなら取り扱いに注意
npm install
npm test
npm run dev
```

鍵がまだ無いとき:

```bash
npm run dev:mock
```

http://localhost:3000 が、ログインなしのモックです。検索のベクトルは Gemini ではなく、テスト用の決定的なベクトルです。意味の近さは本番より粗いです。Drive も空のモックなので、同期しても共有ドライブの PDF は出てきません。

`npm test` は Postgres も Google も呼びません。CSV の列修復、検索の順位、PGlite（pgvector 付きの埋め込み Postgres）への保存、Drive 同期の紐付けを見ます。

## 9. まだ本番のサービスに繋いで確認していないこと

このリポジトリを書いた環境には、オリゼの OAuth クライアント、サービスアカウント、Neon、Gemini の鍵がありません。次は実装してテストで守っていますが、実サービスへの通信は未実施です。

- Google ログインの画面遷移と、Workspace の `hd` がトークンに入ること
- サービスアカウントでの共有ドライブ一覧・アップロード・ダウンロード
- Neon への実際の接続（SQL は PGlite で実行）
- Gemini の抽出と埋め込みの応答形式（次元が違うときはアプリがエラーにする）
- Crossref / PubMed / Unpaywall への実リクエスト（応答の読み取りだけ固定データでテスト）
- unpdf による実 PDF のテキスト抽出（壊れた PDF はエラーにし、同期はファイル名だけで登録して続行する）
- Vercel へのデプロイそのもの

鍵を入れたあとの確認は、上の「デプロイ後に確認すること」です。
