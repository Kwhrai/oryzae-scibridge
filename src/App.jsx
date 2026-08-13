import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  Check,
  ChevronRight,
  Database,
  FileSearch,
  FileText,
  Filter,
  FlaskConical,
  Globe2,
  Lightbulb,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

const CSV_URL = '/papers.csv'

function parseCSV(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]

    if (character === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(value.trim())
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1
      row.push(value.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }

  if (value || row.length) {
    row.push(value.trim())
    rows.push(row)
  }

  const [headers = [], ...records] = rows
  return records.map((record, index) => {
    const item = Object.fromEntries(headers.map((header, column) => [header, record[column] || '']))
    const doi = item.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
    const year = item.reference?.match(/\((19|20)\d{2}\)/)?.[0]?.replace(/[()]/g, '') || '年不明'
    return {
      id: item.id || `paper-${index + 1}`,
      type: 'paper',
      category: item.category || '未分類',
      title: item.title,
      summary: item.abstract,
      reference: item.reference,
      rdNote: item.commentary,
      doi,
      drive: item.drive,
      year,
      reviewStatus: index < 2 ? 'reviewed' : 'unreviewed',
    }
  }).filter((item) => item.title)
}

const paperSections = [
  { id: 'overview', label: '概要' },
  { id: 'background', label: '背景' },
  { id: 'objective', label: '目的' },
  { id: 'methods', label: '方法' },
  { id: 'results', label: '結果' },
  { id: 'discussion', label: '考察' },
]

const patentSections = [
  { id: 'overview', label: '概要' },
  { id: 'novelty', label: '新規性' },
  { id: 'claims', label: '請求項' },
  { id: 'examples', label: '実施例' },
]

function EmptyField({ label }) {
  return (
    <div className="empty-field">
      <Sparkles size={15} />
      <div>
        <strong>{label}は未整理です</strong>
        <span>次のフェーズで、原文を根拠にAIが整理候補を作成します。</span>
      </div>
    </div>
  )
}

function App() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [libraryType, setLibraryType] = useState('paper')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('すべて')
  const [selectedId, setSelectedId] = useState(null)
  const [section, setSection] = useState('overview')
  const [bookmarks, setBookmarks] = useState(new Set())

  useEffect(() => {
    fetch(CSV_URL)
      .then((response) => {
        if (!response.ok) throw new Error('CSVを取得できませんでした')
        return response.text()
      })
      .then((text) => {
        const papers = parseCSV(text)
        setRecords(papers)
        setSelectedId(papers[0]?.id || null)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const categories = useMemo(
    () => ['すべて', ...new Set(records.map((record) => record.category))],
    [records],
  )

  const visibleRecords = useMemo(() => {
    if (libraryType === 'patent') return []
    const normalizedQuery = query.toLowerCase().trim()
    return records.filter((record) => {
      const matchesCategory = category === 'すべて' || record.category === category
      const searchable = `${record.title} ${record.summary} ${record.reference} ${record.category}`.toLowerCase()
      return matchesCategory && (!normalizedQuery || searchable.includes(normalizedQuery))
    })
  }, [category, libraryType, query, records])

  const selectedRecord = records.find((record) => record.id === selectedId)
  const sections = libraryType === 'paper' ? paperSections : patentSections

  function changeLibrary(type) {
    setLibraryType(type)
    setSection('overview')
    setCategory('すべて')
    if (type === 'paper') setSelectedId(records[0]?.id || null)
    else setSelectedId(null)
  }

  function toggleBookmark(id) {
    setBookmarks((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><FlaskConical size={19} /></div>
          <div>
            <strong>ORYZAE SciBridge</strong>
            <span>Research Intelligence Library</span>
          </div>
        </div>
        <div className="top-actions">
          <span className="sync-status"><span /> 文献CSVと同期済み</span>
          <button className="primary-button"><Plus size={16} /> 資料を追加</button>
        </div>
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-label">ライブラリ</div>
          <nav className="library-switch" aria-label="資料種別">
            <button className={libraryType === 'paper' ? 'active' : ''} onClick={() => changeLibrary('paper')}>
              <BookOpen size={17} /><span>論文</span><b>{records.length}</b>
            </button>
            <button className={libraryType === 'patent' ? 'active' : ''} onClick={() => changeLibrary('patent')}>
              <ShieldCheck size={17} /><span>特許</span><b>0</b>
            </button>
          </nav>

          <div className="sidebar-label filter-title"><Filter size={13} /> 研究テーマ</div>
          <div className="category-list">
            {categories.map((item) => (
              <button key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>
                <span>{item}</span>
                {item === 'すべて' && <small>{records.length}</small>}
              </button>
            ))}
          </div>

          <div className="research-focus">
            <span className="focus-kicker"><Lightbulb size={13} /> 探索テーマ</span>
            <strong>低GA・高α-AMY株</strong>
            <p>糖組成と酵素活性から、次の培養条件を検討する</p>
            <button>関連資料を見る <ChevronRight size={14} /></button>
          </div>
        </aside>

        <section className="library-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">{libraryType === 'paper' ? 'PAPER LIBRARY' : 'PATENT LIBRARY'}</span>
              <h1>{libraryType === 'paper' ? '論文を読み、知識に変える' : '特許から技術境界を読む'}</h1>
              <p>{libraryType === 'paper' ? '背景から考察まで、研究判断に必要な情報を一つに。' : '新規性・出願日・請求項を、研究テーマと結びつけて整理します。'}</p>
            </div>
          </div>

          <div className="search-row">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={libraryType === 'paper' ? 'タイトル、菌株、酵素、研究テーマで検索' : '発明名称、出願人、請求項で検索'}
            />
            <kbd>⌘ K</kbd>
          </div>

          <div className="result-bar">
            <span>{libraryType === 'paper' ? `${visibleRecords.length}件の論文` : '0件の特許'}</span>
            <button>更新順 <ChevronRight size={13} /></button>
          </div>

          <div className="record-list">
            {loading && <div className="state-message"><LoaderCircle className="spin" /> 文献を読み込んでいます</div>}
            {error && <div className="state-message error">文献データを読み込めませんでした。CSVファイルを確認してください。</div>}
            {!loading && libraryType === 'patent' && (
              <div className="patent-empty">
                <div className="empty-illustration"><FileSearch size={34} /></div>
                <span>特許ライブラリ</span>
                <h2>最初の特許を登録する</h2>
                <p>特許番号またはPDFから、出願日・優先日・新規性・請求項・実施例を整理します。</p>
                <button className="primary-button"><Plus size={16} /> 特許を追加</button>
              </div>
            )}
            {!loading && libraryType === 'paper' && visibleRecords.map((record) => (
              <article
                key={record.id}
                className={`record-card ${selectedId === record.id ? 'selected' : ''}`}
                onClick={() => { setSelectedId(record.id); setSection('overview') }}
              >
                <div className="record-meta">
                  <span className="type-chip"><FileText size={12} /> 論文</span>
                  <span>{record.category}</span>
                  <span>{record.year}</span>
                  <span className={`review-chip ${record.reviewStatus}`}>
                    {record.reviewStatus === 'reviewed' ? <><Check size={11} /> 確認済み</> : '未確認'}
                  </span>
                </div>
                <h2>{record.title}</h2>
                <p>{record.summary}</p>
                <div className="record-footer">
                  <span>{record.reference}</span>
                  <button
                    aria-label="ブックマーク"
                    className={bookmarks.has(record.id) ? 'bookmarked' : ''}
                    onClick={(event) => { event.stopPropagation(); toggleBookmark(record.id) }}
                  ><Bookmark size={16} fill={bookmarks.has(record.id) ? 'currentColor' : 'none'} /></button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="detail-panel">
          {selectedRecord && libraryType === 'paper' ? (
            <>
              <div className="detail-head">
                <span>STRUCTURED NOTE</span>
                <h2>{selectedRecord.title}</h2>
                <div className="detail-links">
                  {selectedRecord.doi && <a href={`https://doi.org/${selectedRecord.doi}`} target="_blank" rel="noreferrer"><Globe2 size={14} /> 原文 <ArrowUpRight size={12} /></a>}
                  {selectedRecord.drive && <a href={selectedRecord.drive} target="_blank" rel="noreferrer"><Link2 size={14} /> Drive <ArrowUpRight size={12} /></a>}
                </div>
              </div>

              <div className="section-tabs" role="tablist">
                {sections.map((item) => (
                  <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>{item.label}</button>
                ))}
              </div>

              <div className="detail-content">
                {section === 'overview' ? (
                  <>
                    <div className="note-block accent-note">
                      <span>既存データの概要</span>
                      <p>{selectedRecord.summary}</p>
                    </div>
                    <div className="note-block">
                      <span>R&Dメモ</span>
                      <p>{selectedRecord.rdNote || 'R&Dメモはまだ登録されていません。'}</p>
                    </div>
                    <div className="source-box">
                      <Database size={15} />
                      <div><strong>出典</strong><p>{selectedRecord.reference}</p></div>
                    </div>
                  </>
                ) : (
                  <EmptyField label={sections.find((item) => item.id === section)?.label} />
                )}
              </div>

              <div className="detail-footer">
                <span><Check size={13} /> 原文確認前の項目を含みます</span>
                <button><Sparkles size={15} /> AIで構造化</button>
              </div>
            </>
          ) : (
            <div className="no-selection">
              <BookOpen size={25} />
              <p>資料を選ぶと、構造化された内容をここで確認できます。</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}

export default App
