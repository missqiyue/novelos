// V002: Project database tables (FTS5 virtual tables omitted — sql.js doesn't support FTS5)
export const sql = `
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    genre_id TEXT,
    style_profile_id TEXT,
    logline TEXT,
    target_words INTEGER,
    target_volumes INTEGER,
    min_chapter_words INTEGER NOT NULL DEFAULT 2000,
    max_chapter_words INTEGER NOT NULL DEFAULT 5000,
    mode TEXT NOT NULL DEFAULT 'longform',
    status TEXT NOT NULL DEFAULT 'planning',
    reference_work_ids TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canon_rules (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    rule_key TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL DEFAULT 'soft_rule',
    scope_type TEXT NOT NULL,
    scope_ref TEXT,
    content TEXT NOT NULL,
    is_hard INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    version INTEGER NOT NULL DEFAULT 1,
    source_type TEXT,
    source_ref TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canon_rule_versions (
    id TEXT PRIMARY KEY,
    canon_rule_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    change_reason TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    alias TEXT,
    role_type TEXT NOT NULL DEFAULT 'supporting',
    identity_core TEXT,
    persona_core TEXT,
    soul_template_id TEXT,
    soul_json TEXT NOT NULL DEFAULT '{}',
    taboo_rules TEXT,
    core_motivation TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS character_states (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    snapshot_id TEXT,
    chapter_from INTEGER,
    chapter_to INTEGER,
    level_state TEXT,
    physical_state TEXT,
    emotion_state TEXT,
    goal_state TEXT,
    location_id TEXT,
    resource_state TEXT,
    known_info TEXT,
    secret_info TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationship_states (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    source_character_id TEXT NOT NULL,
    target_character_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    strength INTEGER,
    trust_score INTEGER,
    conflict_score INTEGER,
    chapter_from INTEGER,
    chapter_to INTEGER,
    trigger_event_id TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location_type TEXT,
    owner_faction_id TEXT,
    danger_level INTEGER,
    status TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS factions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    faction_type TEXT,
    goal TEXT,
    resource_summary TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS ability_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    name TEXT NOT NULL,
    owner_character_id TEXT,
    source_rule_id TEXT,
    cost_rule TEXT,
    cooldown_rule TEXT,
    limit_rule TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS volumes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    volume_number INTEGER NOT NULL,
    title TEXT,
    chapter_start INTEGER,
    chapter_end INTEGER,
    goal TEXT,
    main_conflict TEXT,
    climax TEXT,
    settlement TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS arcs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    volume_id TEXT,
    arc_type TEXT NOT NULL,
    title TEXT,
    chapter_start INTEGER,
    chapter_end INTEGER,
    goal TEXT,
    status TEXT,
    priority INTEGER
);

CREATE TABLE IF NOT EXISTS chapter_tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    volume_id TEXT,
    arc_id TEXT,
    objective TEXT NOT NULL,
    must_progress TEXT,
    must_recall TEXT,
    must_avoid TEXT,
    required_hooks TEXT,
    required_context TEXT,
    ending_hook TEXT,
    status TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    title TEXT,
    status TEXT NOT NULL DEFAULT 'task_ready',
    draft_text TEXT,
    final_text TEXT,
    word_count INTEGER,
    task_id TEXT,
    compiler_status TEXT,
    review_status TEXT,
    snapshot_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapter_versions (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    content_type TEXT NOT NULL,
    content TEXT NOT NULL,
    diff_summary TEXT,
    created_by TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    arc_id TEXT,
    chapter_number INTEGER,
    event_type TEXT,
    summary TEXT NOT NULL,
    cause_refs TEXT,
    effect_refs TEXT,
    participants TEXT,
    impact_scope TEXT,
    status TEXT
);

CREATE TABLE IF NOT EXISTS foreshadow_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    seed_chapter INTEGER NOT NULL,
    expected_volume_id TEXT,
    title TEXT NOT NULL,
    maturity_condition TEXT,
    payoff_type TEXT,
    status TEXT NOT NULL DEFAULT 'planted',
    resolved_chapter INTEGER,
    importance INTEGER,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS timeline_nodes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_number INTEGER,
    world_date TEXT,
    relative_day INTEGER,
    location_id TEXT,
    summary TEXT NOT NULL,
    participants TEXT,
    dependencies TEXT
);

CREATE TABLE IF NOT EXISTS knowledge_visibility (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    knowledge_key TEXT NOT NULL,
    holder_type TEXT NOT NULL,
    holder_ref TEXT NOT NULL,
    visibility_state TEXT NOT NULL,
    chapter_acquired INTEGER,
    source_event_id TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    snapshot_type TEXT NOT NULL,
    chapter_start INTEGER,
    chapter_end INTEGER,
    volume_id TEXT,
    arc_id TEXT,
    summary_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS compiler_reports (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    report_type TEXT NOT NULL,
    status TEXT NOT NULL,
    issues_json TEXT NOT NULL,
    score REAL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retcon_requests (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_ref TEXT NOT NULL,
    reason TEXT NOT NULL,
    impact_summary TEXT,
    risk_level TEXT,
    strategy TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    scheme TEXT,
    approved_at TEXT,
    rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS retcon_impacts (
    id TEXT PRIMARY KEY,
    retcon_request_id TEXT NOT NULL,
    affected_type TEXT NOT NULL,
    affected_ref TEXT NOT NULL,
    impact_reason TEXT,
    impact_level TEXT
);

CREATE TABLE IF NOT EXISTS reader_comments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    source TEXT NOT NULL,
    chapter_range TEXT,
    content TEXT NOT NULL,
    sentiment TEXT,
    cluster_id TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comment_analyses (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    cluster_id TEXT NOT NULL,
    cluster_label TEXT NOT NULL,
    sentiment_summary TEXT NOT NULL,
    revision_suggestion TEXT,
    affected_chapters TEXT,
    affected_characters TEXT,
    priority TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS book_outlines (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    content_json TEXT NOT NULL,
    change_reason TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS volume_outlines (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    volume_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    content_json TEXT NOT NULL,
    change_reason TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapter_outlines (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_number INTEGER NOT NULL,
    task_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    content_json TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0,
    change_reason TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,
    related_entity_type TEXT,
    related_entity_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_execution_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    agent_name TEXT NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    status TEXT NOT NULL DEFAULT 'success',
    duration_ms INTEGER,
    token_usage INTEGER,
    error_message TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_api_calls (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    agent_name TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    latency_ms INTEGER,
    cost_usd REAL,
    status TEXT NOT NULL DEFAULT 'success',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_settings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS writing_sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT,
    words_written INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chapter_word_stats (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    paragraph_count INTEGER NOT NULL DEFAULT 0,
    dialogue_ratio REAL,
    description_ratio REAL,
    action_ratio REAL,
    recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS volume_word_stats (
    id TEXT PRIMARY KEY,
    volume_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    total_words INTEGER NOT NULL,
    chapter_count INTEGER NOT NULL,
    avg_chapter_words REAL NOT NULL,
    recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_word_stats (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    total_words INTEGER NOT NULL,
    archived_chapters INTEGER NOT NULL DEFAULT 0,
    avg_chapter_words REAL NOT NULL,
    recorded_at TEXT NOT NULL
);

-- Indexes (same as Rust side, FTS5 tables skipped)
CREATE INDEX IF NOT EXISTS idx_canon_rules_project_rule_key ON canon_rules(project_id, rule_key);
CREATE INDEX IF NOT EXISTS idx_canon_rules_project_scope ON canon_rules(project_id, scope_type);
CREATE INDEX IF NOT EXISTS idx_canon_rules_hard_rules ON canon_rules(project_id, is_hard);
CREATE INDEX IF NOT EXISTS idx_characters_project_name ON characters(project_id, name);
CREATE INDEX IF NOT EXISTS idx_characters_soul_template ON characters(soul_template_id);
CREATE INDEX IF NOT EXISTS idx_character_states_project_character ON character_states(project_id, character_id);
CREATE INDEX IF NOT EXISTS idx_character_states_chapter_range ON character_states(chapter_from, chapter_to);
CREATE INDEX IF NOT EXISTS idx_relationship_pair ON relationship_states(source_character_id, target_character_id);
CREATE INDEX IF NOT EXISTS idx_relationship_range ON relationship_states(chapter_from, chapter_to);
CREATE INDEX IF NOT EXISTS idx_volumes_project_number ON volumes(project_id, volume_number);
CREATE INDEX IF NOT EXISTS idx_arcs_project_range ON arcs(project_id, chapter_start, chapter_end);
CREATE INDEX IF NOT EXISTS idx_chapter_tasks_project_chapter ON chapter_tasks(project_id, chapter_number);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_chapters_project_number ON chapters(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_chapters_status ON chapters(status);
CREATE INDEX IF NOT EXISTS idx_event_nodes_project_chapter ON event_nodes(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_foreshadow_project_status ON foreshadow_items(project_id, status);
CREATE INDEX IF NOT EXISTS idx_foreshadow_seed_chapter ON foreshadow_items(seed_chapter);
CREATE INDEX IF NOT EXISTS idx_timeline_project_relative_day ON timeline_nodes(project_id, relative_day);
CREATE INDEX IF NOT EXISTS idx_timeline_project_chapter ON timeline_nodes(project_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_visibility_holder ON knowledge_visibility(holder_type, holder_ref);
CREATE INDEX IF NOT EXISTS idx_visibility_knowledge_key ON knowledge_visibility(knowledge_key);
CREATE INDEX IF NOT EXISTS idx_snapshots_project_type ON snapshots(project_id, snapshot_type);
CREATE INDEX IF NOT EXISTS idx_snapshots_project_range ON snapshots(project_id, chapter_start, chapter_end);
CREATE INDEX IF NOT EXISTS idx_compiler_reports_chapter ON compiler_reports(chapter_id);
CREATE INDEX IF NOT EXISTS idx_retcon_project_status ON retcon_requests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);

CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
INSERT INTO _migrations (version, name, applied_at) VALUES (2, 'project_tables', datetime('now'));
`;
