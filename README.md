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
| アプリ | Next.js（App Router）を Vercel に載せる | ログインの裏側でデータと Drive に触れる。以前の Vite 単体では CSV も Drive リンクも公開されていた |
| ログイン | Auth.js の Google ログイン | `hd` と確認済みメールが `@oryzae.site` のときだけ通す。画面の `hd` ヒントだけでは判定しない |
| データ | Neon Postgres + pgvector | 論文とベクトルを一つの無料枠に置ける。ベクトル専用のサービスを増やさない |
| 意味検索・抽出 | Gemini API（`gemini-2.5-flash` と `gemini-embedding-001`、768次元） | 日本語が強く、件数が少ない社内利用なら費用が小さい。モデル名は環境変数で変えられる |
| 原本 | Drive API（サービスアカウント） | 共有ドライブ「既報研究（ORYZAE Scibridge）」に、人が置いた PDF もアプリが置いた PDF も同じフォルダで見る |
| 書誌 | Crossref と PubMed。OA PDF は Unpaywall | 鍵なしで取れる。Unpaywall だけ連絡用メールが要る |

秘密情報は環境変数だけです。値の取り方は [docs/SETUP.md](docs/SETUP.md) に全部書いてあります。

## ローカル

```bash
npm install
npm test
npm run dev:mock
```

`dev:mock` はデータベースも Google も使わず、9件の論文が入った状態で画面を開きます。ログインはスキップします。このモードは本番では無視されます。

本番と同じ経路で動かすときは `.env.local` を SETUP の手順どおりに作り、`npm run dev` です。初回起動でテーブル作成と 9件の取り込みをします。意味検索の索引は画面の「意味検索の索引」から作ります。

```bash
npm run build
npm run seed
```

## データの置き場所

- 移行元の CSV は `data/papers.csv`（公開ディレクトリには置かない）
- 列ずれの直し方は `lib/papers/csv.ts` のコメント
- 論文本文のテキストとメモは Postgres。PDF のファイル自体は Drive
