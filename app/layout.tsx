import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ORYZAE SciBridge",
  description: "株式会社オリゼの研究開発ライブラリ",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
