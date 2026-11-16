"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { api } from "@/components/library/api";
import type { PaperDetail } from "@/lib/papers/present";

type Draft = {
  title: string;
  authors: string;
  year: string;
  journal: string;
  doi: string;
  abstract: string;
  category: string;
  background: string;
  objective: string;
  methods: string;
  results: string;
  discussion: string;
  reference: string;
};

const emptyDraft = (): Draft => ({
  title: "",
  authors: "",
  year: "",
  journal: "",
  doi: "",
  abstract: "",
  category: "",
  background: "",
  objective: "",
  methods: "",
  results: "",
  discussion: "",
  reference: "",
});

function toDraft(input: Partial<Draft> & { year?: number | string | null }): Draft {
  return {
    ...emptyDraft(),
    ...input,
    year: input.year == null ? "" : String(input.year),
  };
}

function payload(draft: Draft) {
  const year = draft.year.trim() ? Number(draft.year) : null;
  return { ...draft, year: Number.isInteger(year) ? year : null };
}

export function AddDialog({
  categories,
  onClose,
  onSaved,
  onSynced,
}: {
  categories: string[];
  onClose: () => void;
  onSaved: (paper: PaperDetail, warning?: string) => void;
  onSynced: () => void;
}) {
  const [tab, setTab] = useState<"pdf" | "citation" | "drive">("pdf");
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [citation, setCitation] = useState("");
  const [savePdf, setSavePdf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [log, setLog] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function preview(next: File) {
    if (next.size > 20 * 1024 * 1024) {
      setError("PDFは20MBまでです。それより大きいファイルは共有ドライブに置いて同期してください。");
      setFile(null);
      setDraft(null);
      return;
    }
    setFile(next);
    setError(null);
    setDraft(toDraft({ title: next.name.replace(/\.pdf$/i, "") }));
    setNote("保存すると本文を読み、空欄を補います。先に直したい欄だけ入力してください。");
  }

  async function fileToBase64(next: File): Promise<string> {
    const bytes = new Uint8Array(await next.arrayBuffer());
    let binary = "";
    const step = 0x8000;
    for (let index = 0; index < bytes.length; index += step) {
      binary += String.fromCharCode(...bytes.subarray(index, index + step));
    }
    return btoa(binary);
  }

  async function savePdfFile() {
    if (!file || !draft?.title.trim()) {
      setError("タイトルを入れてください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const encoded = await fileToBase64(file);
      const result = await api<{ paper: PaperDetail; warning?: string }>("/api/papers/from-pdf", {
        method: "POST",
        body: encoded,
        headers: {
          "content-type": "text/plain",
          "x-filename": encodeURIComponent(file.name),
          "x-metadata": encodeURIComponent(JSON.stringify(payload(draft))),
        },
      });
      onSaved(result.paper, result.warning);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした");
      setBusy(false);
    }
  }

  async function lookup() {
    setBusy(true);
    setError(null);
    setDraft(null);
    try {
      const result = await api<{ draft: Draft & { year?: number | null } }>("/api/metadata/lookup", {
        method: "POST",
        body: JSON.stringify({ input: citation }),
      });
      setDraft(toDraft(result.draft));
      setNote("近い文献です。タイトルを確認してから保存してください。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "見つかりませんでした");
    } finally {
      setBusy(false);
    }
  }

  async function saveCitation() {
    if (!draft?.title.trim()) {
      setError("タイトルを入れてください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ paper: PaperDetail; warning?: string }>("/api/papers/from-citation", {
        method: "POST",
        body: JSON.stringify({ ...payload(draft), saveOpenAccessPdf: savePdf }),
      });
      onSaved(result.paper, result.warning);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存できませんでした");
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setError(null);
    const lines: string[] = [];
    try {
      let remaining = 1;
      let guard = 0;
      while (remaining > 0 && guard < 30) {
        guard += 1;
        const result = await api<{ indexed: number; attached: number; remaining: number; seen: number; errors: string[] }>("/api/drive/sync", { method: "POST" });
        lines.push(`確認 ${result.seen} 件 / 新規 ${result.indexed} / 既存に紐付け ${result.attached} / 残り ${result.remaining}`);
        if (result.errors.length) lines.push(...result.errors);
        setLog(lines.join("\n"));
        remaining = result.remaining;
        if (result.indexed + result.attached === 0 && result.errors.length) break;
        if (result.indexed + result.attached === 0 && result.remaining > 0 && result.errors.length === 0) break;
      }
      onSynced();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "同期できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="add-title">
        <div className="dialog-head">
          <div>
            <h2 id="add-title">論文を追加</h2>
            <p className="muted">PDF、DOI、チャットからコピーした引用文。Drive に直接置いた PDF もここから取り込めます。</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="閉じる"><X /></button>
        </div>
        <div className="tabs" role="tablist">
          <button type="button" className={tab === "pdf" ? "active" : ""} onClick={() => setTab("pdf")}>PDF</button>
          <button type="button" className={tab === "citation" ? "active" : ""} onClick={() => setTab("citation")}>DOI・引用</button>
          <button type="button" className={tab === "drive" ? "active" : ""} onClick={() => setTab("drive")}>Drive</button>
        </div>
        {error && <p className="error-banner">{error}</p>}
        {note && <p className="warning-banner">{note}</p>}

        {tab === "pdf" && (
          <div className="stack-form">
            <label className="dropzone">
              <input type="file" accept="application/pdf,.pdf" hidden onChange={(event) => { const next = event.target.files?.[0]; if (next) void preview(next); }} />
              <span><strong>{file ? file.name : "PDFを選ぶ"}</strong><br />20MBまで。それより大きいファイルは Drive に置いて同期します。</span>
            </label>
            {busy && <p className="state-message"><LoaderCircle className="spin" /> 読んでいます</p>}
            {draft && <DraftForm draft={draft} categories={categories} onChange={update} />}
            {draft && <button className="primary-button" type="button" disabled={busy} onClick={() => void savePdfFile()}>ライブラリに保存</button>}
          </div>
        )}

        {tab === "citation" && (
          <div className="stack-form">
            <label className="field">
              DOI・URL・引用文
              <textarea value={citation} onChange={(event) => setCitation(event.target.value)} placeholder="10.3390/jof7090782 や、チャットに貼られた引用" />
            </label>
            <button className="ghost-button" type="button" disabled={busy || citation.trim().length < 4} onClick={() => void lookup()}>書誌を取得</button>
            <label className="check">
              <input type="checkbox" checked={savePdf} onChange={(event) => setSavePdf(event.target.checked)} />
              <span>オープンアクセスの PDF があれば、共有ドライブにも保存する</span>
            </label>
            {draft && <DraftForm draft={draft} categories={categories} onChange={update} />}
            {draft && <button className="primary-button" type="button" disabled={busy} onClick={() => void saveCitation()}>ライブラリに保存</button>}
          </div>
        )}

        {tab === "drive" && (
          <div className="stack-form">
            <p className="muted">共有ドライブ「既報研究（ORYZAE Scibridge）」の PDF を取り込みます。カテゴリのサブフォルダも見ます。すでに登録済みのファイルは二重に作りません。</p>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void sync()}>{busy ? "同期しています" : "Driveを同期"}</button>
            {log && <div className="sync-log">{log}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function DraftForm({
  draft,
  categories,
  onChange,
}: {
  draft: Draft;
  categories: string[];
  onChange: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
}) {
  return (
    <div className="grid-form">
      <label className="field wide">タイトル<input value={draft.title} onChange={(event) => onChange("title", event.target.value)} /></label>
      <label className="field wide">著者<input value={draft.authors} onChange={(event) => onChange("authors", event.target.value)} /></label>
      <label className="field">年<input inputMode="numeric" value={draft.year} onChange={(event) => onChange("year", event.target.value)} /></label>
      <label className="field">雑誌<input value={draft.journal} onChange={(event) => onChange("journal", event.target.value)} /></label>
      <label className="field">DOI<input value={draft.doi} onChange={(event) => onChange("doi", event.target.value)} /></label>
      <label className="field">カテゴリ
        <input list="categories" value={draft.category} onChange={(event) => onChange("category", event.target.value)} />
        <datalist id="categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
      </label>
      <label className="field wide">要旨<textarea value={draft.abstract} onChange={(event) => onChange("abstract", event.target.value)} /></label>
    </div>
  );
}
