# ORYZAE SciBridge

株式会社オリゼの研究開発ライブラリです。論文の原本 PDF は Google ドライブの共有フォルダに置き、検索・メモ・書誌はこのアプリの中だけに置きます。`oryzae.site` の Google アカウントでログインした人だけが読めます。

## できること

- うろ覚えの日本語・英語から論文を探す（キーワードに加え、Gemini の埋め込みによる意味検索）
- PDF をアップロードすると、タイトル・著者・年・雑誌・DOI・要旨を読み取り、カテゴリのサブフォルダへ Drive に保存する
- DOI、論文 URL、チャットからコピーした引用文から書誌を取る（Crossref / PubMed）。オープンアクセス PDF があれば Drive に置ける
- Drive に直接置いた PDF を「Driveを同期」で取り込む
- 論文ごとに背景・目的・方法・結果・考察と R&D メモを残す。PDF 本文から AI で下書きできる
- 既存の `papers.csv` 9件を、列ずれを直したうえで初回起動時に取り込む

特許ライブラリは今回の対象外です。ボタンだけ残すことはしていません。

## 構成

| 役割 | 選び | 理由 |
| --- | --- | --- |
| アプリ | Next.js を vinext で Cloudflare Workers に載せる | ログインの裏側でデータと Drive に触れる。Vercel には置かない |
| ログイン | Google OAuth と署名付きクッキー | 確認済みメールが `@oryzae.site` で、ID トークンの `hd` も同じときだけ通す |
| 記録 | Cloudflare D1 | 論文、メモ、ブックマーク、確認済み |
| 意味検索 | Vectorize と Gemini 埋め込み（768次元、cosine） | うろ覚えの日本語と英語。Workers AI にはしていない |
| 原本 | Drive REST（サービスアカウント） | Workers 上で Web Crypto の JWT。共有ドライブのフォルダは同じ |
| 書誌 | Crossref と PubMed。OA PDF は Unpaywall | 鍵なしで取れる。Unpaywall だけ連絡用メールが要る |

秘密情報は環境変数だけです。値の取り方は [docs/SETUP.md](docs/SETUP.md) に全部書いてあります。

## ローカル

```bash
npm install
npm test
npm run dev:mock
```

`dev:mock` はログインを飛ばし、Gemini と Drive の代わりにローカルの模擬を使います。D1 と Vectorize は Wrangler のローカル模擬です。このフラグは本番では無視されます。

本番と同じ経路は `docs/SETUP.md` の `.dev.vars` と `npm run dev` です。意味検索の索引は画面の「意味検索の索引」から作ります。

```bash
npm run build
npm run deploy
```

以前の公開サイト https://oryzae-scibridge.vercel.app は Vercel に残っています。マージ前に Vercel の Git 接続を外してください。手順は SETUP にあります。このリポジトリからは Vercel を操作しません。

## データの置き場所

- 移行元の CSV は `data/papers.csv`（公開ディレクトリには置かない）
- 列ずれの直し方は `lib/papers/csv.ts` のコメント
- 論文本文のテキストとメモは D1。ベクトルは Vectorize。PDF のファイル自体は Drive
