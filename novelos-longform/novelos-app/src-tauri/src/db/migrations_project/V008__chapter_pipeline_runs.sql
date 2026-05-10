CREATE TABLE IF NOT EXISTS chapter_pipeline_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    chapter_number INTEGER NOT NULL,
    run_id TEXT NOT NULL,
    result_json TEXT NOT NULL,
    chapter_status TEXT NOT NULL,
    compiler_score INTEGER,
    review_verdict TEXT,
    review_score REAL,
    total_duration_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chapter_pipeline_runs_chapter
    ON chapter_pipeline_runs(chapter_number, created_at DESC);
