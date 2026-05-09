-- V004: RAG vector chunks stored in SQLite (replaces in-memory .bin index)
-- Each row = one text chunk with its embedding blob and metadata

CREATE TABLE IF NOT EXISTS rag_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_number INTEGER NOT NULL,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding BLOB NOT NULL,
    characters TEXT,
    pov TEXT,
    foreshadows TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(chapter_number, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_chapter ON rag_chunks(chapter_number);
