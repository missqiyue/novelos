CREATE TABLE IF NOT EXISTS llm_stream_events (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    project_id TEXT,
    agent_name TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    kind TEXT NOT NULL,
    delta TEXT NOT NULL DEFAULT '',
    reasoning_delta TEXT NOT NULL DEFAULT '',
    done INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
