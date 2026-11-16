export const SCHEMA_STATEMENTS = [
  "CREATE EXTENSION IF NOT EXISTS vector",
  `CREATE TABLE IF NOT EXISTS papers (
    id TEXT PRIMARY KEY,
    legacy_id TEXT UNIQUE,
    title TEXT NOT NULL,
    authors TEXT NOT NULL DEFAULT '',
    year INTEGER,
    journal TEXT NOT NULL DEFAULT '',
    doi TEXT NOT NULL DEFAULT '',
    abstract TEXT NOT NULL DEFAULT '',
    reference TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '未分類',
    background TEXT NOT NULL DEFAULT '',
    objective TEXT NOT NULL DEFAULT '',
    methods TEXT NOT NULL DEFAULT '',
    results TEXT NOT NULL DEFAULT '',
    discussion TEXT NOT NULL DEFAULT '',
    rd_note TEXT NOT NULL DEFAULT '',
    crm_note TEXT NOT NULL DEFAULT '',
    line_plan BOOLEAN NOT NULL DEFAULT FALSE,
    yakki BOOLEAN NOT NULL DEFAULT FALSE,
    drive_file_id TEXT UNIQUE,
    drive_url TEXT NOT NULL DEFAULT '',
    pdf_text TEXT NOT NULL DEFAULT '',
    search_text TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS paper_chunks (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS bookmarks (
    user_email TEXT NOT NULL,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_email, paper_id)
  )`,
  "CREATE INDEX IF NOT EXISTS papers_category_idx ON papers (category)",
  "CREATE INDEX IF NOT EXISTS papers_legacy_idx ON papers (legacy_id)",
];

export const OPTIONAL_INDEX_STATEMENTS = [
  "CREATE INDEX IF NOT EXISTS paper_chunks_embedding_idx ON paper_chunks USING hnsw (embedding vector_cosine_ops)",
];
