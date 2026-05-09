-- Compiler rule configuration storage
-- Allows runtime editing of compiler keyword lists and thresholds
CREATE TABLE IF NOT EXISTS compiler_rule_config (
    checker_name TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
