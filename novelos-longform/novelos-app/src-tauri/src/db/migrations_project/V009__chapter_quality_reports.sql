CREATE TABLE IF NOT EXISTS chapter_quality_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    chapter_number INTEGER NOT NULL,
    report_type TEXT NOT NULL,
    content_hash TEXT,
    overall TEXT NOT NULL,
    summary TEXT,
    report_json TEXT NOT NULL,
    cached INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapter_quality_reports_chapter
    ON chapter_quality_reports(chapter_number, report_type, created_at DESC);
