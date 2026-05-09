-- Agent prompt templates storage
-- Allows runtime editing of agent prompts without recompilation
CREATE TABLE IF NOT EXISTS agent_prompts (
    agent_name TEXT PRIMARY KEY,
    system_prompt TEXT NOT NULL,
    user_template TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
