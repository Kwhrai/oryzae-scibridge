"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bookmark, Check, FlaskConical, LoaderCircle, Plus, Search } from "lucide-react";
import { AddDialog } from "@/components/library/add-dialog";
import { api } from "@/components/library/api";
import { DetailPanel } from "@/components/library/detail-panel";
import type { PaperDetail, PaperSummary } from "@/lib/papers/present";

type SearchResponse = {
  papers: PaperSummary[];
  categories: { name: string; count: number }[];
  total: number;
  embedded: number;
  withPdf: number;
  mode: "browse" | "keyword" | "hybrid";
  warning?: string;
};

export function LibraryApp({
  userName,
  mock,
  logout,
}: {
  userName: string;
  mock: boolean;
  logout?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [papers, setPapers] = useState<PaperSummary[]>([]);
  const [categories, setCategories] = useState<{ name: string; count: number }[]>([]);
  const [stats, setStats] = useState({ total: 0, embedded: 0, withPdf: 0 });
  const [mode, setMode] = useState<SearchResponse["mode"]>("browse");
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PaperDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const seeded = useRef(false);
  const load = useCallback(async (nextQuery: string, nextCategory: string | null) => {
    const id = ++requestId.current;
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextCategory) params.set("category", nextCategory);
    try {
      if (!seeded.current) {
        for (let step = 0; step < 12; step += 1) {
          const seed = await api<{ inserted: number; remaining: number }>("/api/seed", { method: "POST" });
          if (seed.remaining <= 0) break;
        }
        seeded.current = true;
      }
      if (id !== requestId.current) return;
      const data = await api<SearchResponse>(`/api/papers?${params.toString()}`);
      if (id !== requestId.current) return;
      setSetup(false);
      setPapers(data.papers);
      setCategories(data.categories);
      setStats({ total: data.total, embedded: data.embedded, withPdf: data.withPdf });
      setMode(data.mode);
      setWarning(data.warning ?? null);
      setError(null);
    } catch (caught) {
      if (id !== requestId.current) return;
      const coded = caught as Error & { code?: string };
      setSetup(coded.code === "setup");
      setError(coded.message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    const handle = setTimeout(() => {
      void load(query, category).finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(handle);
  }, [query, category, load]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function openPaper(id: string, mobile: boolean) {
    setSelectedId(id);
    if (mobile) setMobileDetail(true);
    setDetailLoading(true);
    try {
      const data = await api<{ paper: PaperDetail }>(`/api/papers/${id}`);
      setDetail(data.paper);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "開けませんでした");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!papers.length) return;
    if (selectedId && papers.some((paper) => paper.id === selectedId)) return;
    if (window.matchMedia("(min-width: 961px)").matches) void openPaper(papers[0].id, false);
  }, [papers, selectedId]);

  async function toggleBookmark(paper: { id: string; bookmarked: boolean }) {
    const next = !paper.bookmarked;
    setPapers((current) => current.map((item) => item.id === paper.id ? { ...item, bookmarked: next } : item));
    setDetail((current) => current && current.id === paper.id ? { ...current, bookmarked: next } : current);
    try {
      await api(`/api/papers/${paper.id}/bookmark`, { method: "POST", body: JSON.stringify({ bookmarked: next }) });
    } catch (caught) {
      setPapers((current) => current.map((item) => item.id === paper.id ? { ...item, bookmarked: paper.bookmarked } : item));
      setError(caught instanceof Error ? caught.message : "ブックマークを保存できませんでした");
    }
  }

  async function reindex() {
    setBusy("意味検索の索引を作っています");
    try {
      let remaining = 1;
      let guard = 0;
      while (remaining > 0 && guard < 30) {
        guard += 1;
        const result = await api<{ indexed: number; remaining: number; warning?: string }>("/api/search/reindex", { method: "POST" });
        remaining = result.remaining;
        if (result.warning) setWarning(result.warning);
        if (result.indexed === 0) break;
      }
      await load(query, category);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "索引を作れませんでした");
    } finally {
      setBusy(null);
    }
  }

  if (setup) {
    return (
      <main className="login-wrap">
        <section className="setup">
          <div className="brand"><div className="brand-mark"><FlaskConical size={18} /></div><strong>ORYZAE SciBridge</strong></div>
          <h1>準備がまだです</h1>
          <p className="muted">{error}</p>
          <ol className="muted">
            <li>Cloudflare Access で @oryzae.site のワンタイムPINを付ける</li>
            <li>Apps Script をデプロイし、wrangler secret に URL と共有秘密を入れる</li>
            <li>意味検索は Gemini か Workers AI。索引は画面のボタンで1件ずつ作る</li>
          </ol>
          <p className="muted">手順はリポジトリの docs/SETUP.md にまとめてあります。鍵なしで画面だけ見るときは <code>npm run dev:mock</code> です。</p>
        </section>
      </main>
    );
  }

  const categoryNames = categories.map((item) => item.name);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><FlaskConical size={18} /></div>
          <div>
            <strong>ORYZAE SciBridge</strong>
            <span>{mock ? "モックモード" : userName}</span>
          </div>
        </div>
        <div className="top-actions">
          {logout}
          <button className="primary-button" type="button" onClick={() => setAddOpen(true)}><Plus size={16} /> 論文を追加</button>
        </div>
      </header>
      <main className="workspace">
        <aside className="sidebar">
          <p className="sidebar-label">研究テーマ</p>
          <div className="category-list">
            <button type="button" className={category === null ? "active" : ""} onClick={() => setCategory(null)}>
              <span>すべて</span><small>{stats.total}</small>
            </button>
            {categories.map((item) => (
              <button key={item.name} type="button" className={category === item.name ? "active" : ""} onClick={() => setCategory(item.name)}>
                <span>{item.name}</span><small>{item.count}</small>
              </button>
            ))}
          </div>
          <div className="hint-card">
            <strong>探し方</strong>
            <p>「排便が良くなる甘酒」のように、覚えている言葉をそのまま入れてください。タイトルが違っていても、要旨とメモから当たります。</p>
          </div>
        </aside>
        <section className="library-panel">
          <div className="panel-heading">
            <h1>あの論文、あったっけ</h1>
            <p>日本語でも英語でも、うろ覚えのまま検索できます。</p>
          </div>
          <label className="search-row">
            <Search size={18} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="排便の甘酒、耐熱性アミラーゼ…"
              aria-label="論文を検索"
            />
            <kbd>⌘K</kbd>
          </label>
          <div className="category-chips">
            <button type="button" className={`chip ${category === null ? "active" : ""}`} onClick={() => setCategory(null)}>すべて</button>
            {categories.map((item) => (
              <button key={item.name} type="button" className={`chip ${category === item.name ? "active" : ""}`} onClick={() => setCategory(item.name)}>{item.name}</button>
            ))}
          </div>
          <div className="meta-row">
            <span>{loading ? "検索しています" : query.trim() ? `${papers.length}件` : `${stats.total}件`}</span>
            <span>{mode === "hybrid" ? "意味検索" : mode === "keyword" ? "キーワード" : "新しい年"}</span>
            {stats.embedded < stats.total && (
              <button className="text-button" type="button" onClick={() => void reindex()}>意味検索の索引 {stats.embedded}/{stats.total}</button>
            )}
            {busy && <span>{busy}</span>}
          </div>
          {warning && <p className="warning-banner">{warning}</p>}
          {error && !setup && <p className="error-banner">{error}</p>}
          <div className="record-list">
            {loading && papers.length === 0 && <div className="state-message"><LoaderCircle className="spin" /> 文献を読み込んでいます</div>}
            {!loading && papers.length === 0 && <div className="state-message">該当する論文がありません。別の言い方で探すか、論文を追加してください。</div>}
            {papers.map((paper) => (
              <article key={paper.id} className={`record-card ${selectedId === paper.id ? "selected" : ""}`}>
                <button type="button" className="record-open" onClick={() => void openPaper(paper.id, true)}>
                  <div className="record-meta">
                    <span>{paper.category}</span>
                    <span>{paper.year ?? "年不明"}</span>
                    {paper.hasEmbedding && <span>意味検索</span>}
                    <span className={`review-chip ${paper.confirmed ? "reviewed" : ""}`}>{paper.confirmed ? <><Check size={12} /> 確認済み</> : "未確認"}</span>
                  </div>
                  <h2>{paper.title}</h2>
                  <p>{paper.snippet || paper.abstract}</p>
                </button>
                <div className="record-footer">
                  <span>{paper.reference || paper.authors || paper.doi}</span>
                  <button className={`icon-button ${paper.bookmarked ? "bookmarked" : ""}`} type="button" aria-label="ブックマーク" onClick={() => void toggleBookmark(paper)}>
                    <Bookmark size={16} fill={paper.bookmarked ? "currentColor" : "none"} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <DetailPanel
          paper={detail && detail.id === selectedId ? detail : null}
          loading={detailLoading}
          open={mobileDetail}
          categories={categoryNames}
          onClose={() => setMobileDetail(false)}
          onPaper={(next) => {
            setDetail(next);
            setPapers((current) => current.map((item) => item.id === next.id ? { ...item, ...next, abstract: next.abstract.slice(0, 500) } : item));
          }}
          onBookmark={() => { if (detail) void toggleBookmark(detail); }}
          onError={setError}
        />
      </main>
      {addOpen && (
        <AddDialog
          categories={categoryNames}
          onClose={() => setAddOpen(false)}
          onSynced={() => void load(query, category)}
          onSaved={(paper, message) => {
            setAddOpen(false);
            if (message) setWarning(message);
            void load(query, category).then(() => {
              if (paper.id) void openPaper(paper.id, true);
            });
          }}
        />
      )}
    </div>
  );
}
