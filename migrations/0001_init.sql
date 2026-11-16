CREATE TABLE IF NOT EXISTS papers (
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
  line_plan INTEGER NOT NULL DEFAULT 0,
  yakki INTEGER NOT NULL DEFAULT 0,
  drive_file_id TEXT UNIQUE,
  drive_url TEXT NOT NULL DEFAULT '',
  pdf_text TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  confirmed INTEGER NOT NULL DEFAULT 0,
  embedded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_email TEXT NOT NULL,
  paper_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_email, paper_id)
);

CREATE TABLE IF NOT EXISTS paper_vectors (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS papers_category_idx ON papers (category);
CREATE INDEX IF NOT EXISTS paper_vectors_paper_idx ON paper_vectors (paper_id);
CREATE INDEX IF NOT EXISTS papers_doi_idx ON papers (doi);
