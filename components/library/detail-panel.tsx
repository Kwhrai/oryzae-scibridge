"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Bookmark, Check, ChevronLeft, Globe2, Link2, LoaderCircle, Sparkles } from "lucide-react";
import { api } from "@/components/library/api";
import type { PaperDetail } from "@/lib/papers/present";

const sections = [
  { id: "overview", label: "概要" },
  { id: "background", label: "背景" },
  { id: "objective", label: "目的" },
  { id: "methods", label: "方法" },
  { id: "results", label: "結果" },
  { id: "discussion", label: "考察" },
  { id: "rdNote", label: "R&Dメモ" },
] as const;

type SectionId = (typeof sections)[number]["id"];
type NoteKey = "abstract" | "background" | "objective" | "methods" | "results" | "discussion" | "rdNote";

export function DetailPanel({
  paper,
  loading,
  open,
  categories,
  onClose,
  onPaper,
  onBookmark,
  onError,
}: {
  paper: PaperDetail | null;
  loading: boolean;
  open: boolean;
  categories: string[];
  onClose: () => void;
  onPaper: (paper: PaperDetail) => void;
  onBookmark: () => void;
  onError: (message: string) => void;
}) {
  const [section, setSection] = useState<SectionId>("overview");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [bib, setBib] = useState({ authors: "", year: "", journal: "", doi: "", category: "" });

  useEffect(() => {
    setSection("overview");
    setEditing(false);
  }, [paper?.id]);

  useEffect(() => {
    if (!paper) return;
    setBib({
      authors: paper.authors,
      year: paper.year ? String(paper.year) : "",
      journal: paper.journal,
      doi: paper.doi,
      category: paper.category,
    });
  }, [paper]);

  async function patch(body: Record<string, unknown>) {
    if (!paper) return;
    setBusy(true);
    try {
      const result = await api<{ paper: PaperDetail }>(`/api/papers/${paper.id}`, { method: "PATCH", body: JSON.stringify(body) });
      onPaper(result.paper);
      setEditing(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function structure() {
    if (!paper) return;
    setBusy(true);
    try {
      const result = await api<{ paper: PaperDetail }>(`/api/papers/${paper.id}/structure`, { method: "POST" });
      onPaper(result.paper);
      setSection("background");
    } catch (error) {
      onError(error instanceof Error ? error.message : "構造化できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const noteKey: NoteKey | null = section === "overview" ? "abstract" : section;
  const noteValue = paper && noteKey ? paper[noteKey] : "";

  return (
    <aside className={`detail-panel ${open ? "open" : ""}`}>
      <button className="detail-back ghost-button" type="button" onClick={onClose}><ChevronLeft size={16} /> 一覧へ</button>
      {loading && <div className="state-message"><LoaderCircle className="spin" /> 開いています</div>}
      {!loading && !paper && <div className="no-selection">論文を選ぶと、要旨とメモがここに出ます。</div>}
      {paper && !loading && (
        <>
          <div className="detail-head">
            <div className="record-meta">
              <span className="detail-kicker">{paper.category}</span>
              <span>{paper.year ?? "年不明"}</span>
              <button className={`icon-button ${paper.bookmarked ? "bookmarked" : ""}`} type="button" aria-label="ブックマーク" onClick={onBookmark}>
                <Bookmark size={16} fill={paper.bookmarked ? "currentColor" : "none"} />
              </button>
            </div>
            <h2>{paper.title}</h2>
            <div className="detail-links">
              {paper.doi && <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer"><Globe2 size={14} /> 原文 <ArrowUpRight size={12} /></a>}
              {paper.driveUrl && <a href={paper.driveUrl} target="_blank" rel="noreferrer"><Link2 size={14} /> Drive <ArrowUpRight size={12} /></a>}
              {!paper.hasPdf && <span className="flag">PDF未登録</span>}
            </div>
            <div className="flag-row" style={{ marginTop: 8 }}>
              {paper.linePlan && <span className="flag">LINE企画</span>}
              {paper.yakki && <span className="flag">薬機メモあり</span>}
              {paper.pdfChars > 0 && <span className="flag">本文 {paper.pdfChars.toLocaleString("ja-JP")} 字</span>}
            </div>
          </div>
          <div className="section-tabs" role="tablist">
            {sections.map((item) => (
              <button key={item.id} type="button" className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setEditing(false); }}>{item.label}</button>
            ))}
          </div>
          <div className="detail-content">
            {section === "overview" && (
              <>
                <section className="note-block">
                  <h3>要旨</h3>
                  {editing ? (
                    <Editor value={draft} onChange={setDraft} onCancel={() => setEditing(false)} onSave={() => void patch({ abstract: draft })} busy={busy} />
                  ) : (
                    <>
                      <p className="prose">{paper.abstract || "要旨はまだありません。"}</p>
                      <button className="text-button" type="button" onClick={() => { setDraft(paper.abstract); setEditing(true); }}>編集</button>
                    </>
                  )}
                </section>
                {paper.rdNote && <section className="note-block"><h3>R&Dメモ</h3><p className="prose">{paper.rdNote}</p></section>}
                {paper.crmNote && <section className="note-block"><h3>活用メモ（移行データ）</h3><p className="prose">{paper.crmNote}</p></section>}
                {paper.reference && <section className="note-block"><h3>出典</h3><p className="prose">{paper.reference}</p></section>}
              </>
            )}
            {section !== "overview" && (
              <section className="note-block">
                <h3>{sections.find((item) => item.id === section)?.label}</h3>
                {editing ? (
                  <Editor value={draft} onChange={setDraft} onCancel={() => setEditing(false)} onSave={() => void patch({ [noteKey]: draft })} busy={busy} />
                ) : (
                  <>
                    <p className="prose">{noteValue || "まだありません。AIで構造化するか、自分で書けます。"}</p>
                    <button className="text-button" type="button" onClick={() => { setDraft(noteValue); setEditing(true); }}>編集</button>
                  </>
                )}
              </section>
            )}
            <details className="bib">
              <summary>書誌を直す</summary>
              <div className="grid-form">
                <label className="field wide">著者<input value={bib.authors} onChange={(event) => setBib({ ...bib, authors: event.target.value })} /></label>
                <label className="field">年<input value={bib.year} onChange={(event) => setBib({ ...bib, year: event.target.value })} /></label>
                <label className="field">雑誌<input value={bib.journal} onChange={(event) => setBib({ ...bib, journal: event.target.value })} /></label>
                <label className="field">DOI<input value={bib.doi} onChange={(event) => setBib({ ...bib, doi: event.target.value })} /></label>
                <label className="field">カテゴリ
                  <input list="detail-categories" value={bib.category} onChange={(event) => setBib({ ...bib, category: event.target.value })} />
                  <datalist id="detail-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
                </label>
              </div>
              <div className="inline-actions">
                <button className="primary-button" type="button" disabled={busy} onClick={() => void patch({ ...bib, year: bib.year.trim() ? Number(bib.year) : null })}>書誌を保存</button>
              </div>
            </details>
          </div>
          <div className="detail-footer">
            <button className="ghost-button" type="button" onClick={() => void patch({ confirmed: !paper.confirmed })}>
              {paper.confirmed ? <><Check size={14} /> 確認済み</> : "未確認"}
            </button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void structure()}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} AIで構造化
            </button>
          </div>
        </>
      )}
    </aside>
  );
}

function Editor({
  value,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
      <div className="inline-actions">
        <button className="primary-button" type="button" disabled={busy} onClick={onSave}>保存</button>
        <button className="ghost-button" type="button" onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  );
}
