// V001: Global database tables
export const sql = `
CREATE TABLE IF NOT EXISTS genre_templates (
    id TEXT PRIMARY KEY,
    genre_id TEXT NOT NULL,
    genre_name TEXT NOT NULL,
    world_framework TEXT,
    volume_rhythm TEXT,
    character_archetypes TEXT,
    thrill_params TEXT,
    taboo_rules TEXT,
    default_style_id TEXT,
    default_min_chapter_words INTEGER NOT NULL DEFAULT 2000,
    default_max_chapter_words INTEGER NOT NULL DEFAULT 5000,
    trope_library TEXT,
    sub_genres TEXT,
    naming_style TEXT,
    naming_examples TEXT
);

CREATE TABLE IF NOT EXISTS style_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    metrics TEXT NOT NULL,
    preferred_patterns TEXT NOT NULL,
    anti_ai_features TEXT NOT NULL,
    sample_paragraphs TEXT NOT NULL,
    banned_patterns TEXT NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS de_ai_rules (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    pattern TEXT NOT NULL,
    replacement TEXT,
    severity TEXT NOT NULL DEFAULT 'medium',
    is_enabled INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writing_patterns (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_ref TEXT,
    pattern_name TEXT NOT NULL,
    genre_compat TEXT,
    description TEXT NOT NULL,
    usage_guide TEXT,
    sample_text TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reference_works (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT,
    genre TEXT NOT NULL,
    platform TEXT,
    key_patterns TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS banned_names (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_work TEXT,
    source_genre TEXT,
    ban_level TEXT NOT NULL DEFAULT 'soft_warn',
    affected_genres TEXT,
    is_user_added INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS soul_templates (
    id TEXT PRIMARY KEY,
    soul_name TEXT NOT NULL,
    category TEXT NOT NULL,
    genre_compat TEXT,
    personality_json TEXT NOT NULL,
    speech_json TEXT NOT NULL,
    behavior_json TEXT NOT NULL,
    relationships_json TEXT,
    is_builtin INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS banned_book_titles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source_platform TEXT,
    source_genre TEXT,
    popularity TEXT NOT NULL DEFAULT 'normal',
    ban_level TEXT NOT NULL DEFAULT 'soft_warn',
    is_user_added INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookshelf (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    genre_name TEXT,
    status TEXT NOT NULL DEFAULT 'planning',
    display_order INTEGER NOT NULL DEFAULT 0,
    cover_image TEXT,
    last_opened_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_banned_names_name ON banned_names(name);
CREATE INDEX IF NOT EXISTS idx_banned_names_genre_level ON banned_names(source_genre, ban_level);
CREATE INDEX IF NOT EXISTS idx_soul_templates_category ON soul_templates(category);
CREATE INDEX IF NOT EXISTS idx_soul_templates_builtin ON soul_templates(is_builtin);
CREATE INDEX IF NOT EXISTS idx_banned_book_titles_title ON banned_book_titles(title);
CREATE INDEX IF NOT EXISTS idx_banned_book_titles_genre_level ON banned_book_titles(source_genre, ban_level);

CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
INSERT INTO _migrations (version, name, applied_at) VALUES (1, 'global_tables', datetime('now'));
`;
