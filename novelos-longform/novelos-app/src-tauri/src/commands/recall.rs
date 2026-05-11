use crate::commands::llm::LlmState;
// RagState removed — RAG now uses SQLite via DbState
use crate::db::DbState;
use crate::rag::RagIntentFilter;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── RCL-001~002: Recall Strategy with Token Budget ───

/// Maximum token budget for assembled recall context.
/// 1 token ≈ 2 Chinese chars, so 8000 tokens ≈ 16000 chars.
const MAX_TOKEN_BUDGET: usize = 8000;
const CHARS_PER_TOKEN: usize = 2;

/// Priority layers for recall context assembly.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum RecallPriority {
    P0 = 0, // Task card
    P1 = 1, // Hard rules
    P2 = 2, // Character states
    P3 = 3, // Recent snapshot
    P4 = 4, // Foreshadows & events
    P5 = 5, // Soft rules (trimmable)
    P6 = 6, // FTS results (trimmable)
    P7 = 7, // RAG results (trimmable)
}

#[derive(Debug, Clone)]
struct RecallItem {
    priority: RecallPriority,
    source: String,
    text: String,
}

/// Assembled recall context output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssembledRecallContext {
    pub context_text: String,
    pub token_estimate: usize,
    pub layers: RecallLayers,
    pub was_trimmed: bool,
    /// Per-layer raw text for pipeline variable injection
    pub layer_texts: RecallLayerTexts,
}

/// Per-layer raw text extracted during recall assembly.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RecallLayerTexts {
    pub task_card: String,
    pub hard_rules: String,
    pub character_states: String,
    pub snapshot: String,
    pub foreshadows_events: String,
    pub soft_rules: String,
    pub canon_rules: String,
    pub fts: String,
    pub rag: String,
    pub writing_patterns: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecallLayers {
    pub task_card_tokens: usize,
    pub hard_rules_tokens: usize,
    pub character_states_tokens: usize,
    pub snapshot_tokens: usize,
    pub foreshadows_events_tokens: usize,
    pub soft_rules_tokens: usize,
    pub fts_tokens: usize,
    pub rag_tokens: usize,
}

impl Default for RecallLayers {
    fn default() -> Self {
        Self {
            task_card_tokens: 0,
            hard_rules_tokens: 0,
            character_states_tokens: 0,
            snapshot_tokens: 0,
            foreshadows_events_tokens: 0,
            soft_rules_tokens: 0,
            fts_tokens: 0,
            rag_tokens: 0,
        }
    }
}

/// Input for the comprehensive recall command.
#[derive(Debug, Deserialize)]
pub struct RecallInput {
    pub chapter_number: i64,
    /// Character IDs to filter — only include character states for these characters.
    pub character_ids: Option<Vec<String>>,
    /// Character names for RAG intent boosting.
    pub character_names: Option<Vec<String>>,
    /// POV character name for RAG intent boosting.
    pub pov_character: Option<String>,
    /// Active foreshadow titles for RAG intent boosting.
    pub active_foreshadows: Option<Vec<String>>,
    /// Chapter range [min, max] for RAG filtering.
    pub chapter_range: Option<(i64, i64)>,
    pub fts_query: Option<String>,
    pub rag_query: Option<String>,
    pub max_tokens: Option<usize>,
}

impl RecallInput {
    /// Build a RagIntentFilter from the recall input's intent fields.
    pub fn to_rag_intent(&self) -> Option<RagIntentFilter> {
        let has_intent = self.character_names.is_some()
            || self.pov_character.is_some()
            || self.active_foreshadows.is_some()
            || self.chapter_range.is_some();
        if !has_intent {
            return None;
        }
        Some(RagIntentFilter {
            character_names: self.character_names.clone(),
            pov_character: self.pov_character.clone(),
            active_foreshadows: self.active_foreshadows.clone(),
            chapter_range: self.chapter_range,
        })
    }
}

/// RCL-001 + RCL-002: Comprehensive recall with priority-based assembly and token budget control.
#[tauri::command]
pub fn assemble_recall_context(
    db: State<'_, DbState>,
    input: RecallInput,
) -> Result<AssembledRecallContext, String> {
    let budget = input.max_tokens.unwrap_or(MAX_TOKEN_BUDGET);
    let budget_chars = budget * CHARS_PER_TOKEN;

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut items: Vec<RecallItem> = Vec::new();

    let task_card_text = fetch_task_card(conn, input.chapter_number);
    if !task_card_text.is_empty() {
        items.push(RecallItem {
            priority: RecallPriority::P0,
            source: "task_card".to_string(),
            text: task_card_text,
        });
    }

    let hard_rules_text = fetch_hard_rules(conn);
    if !hard_rules_text.is_empty() {
        items.push(RecallItem {
            priority: RecallPriority::P1,
            source: "hard_rules".to_string(),
            text: hard_rules_text,
        });
    }

    let char_states_text =
        fetch_character_states(conn, input.chapter_number, input.character_ids.as_deref());
    if !char_states_text.is_empty() {
        items.push(RecallItem {
            priority: RecallPriority::P2,
            source: "character_states".to_string(),
            text: char_states_text,
        });
    }

    let snapshot_text = fetch_recent_snapshot(conn, input.chapter_number);
    if !snapshot_text.is_empty() {
        items.push(RecallItem {
            priority: RecallPriority::P3,
            source: "snapshot".to_string(),
            text: snapshot_text,
        });
    }

    let foreshadow_events_text = fetch_foreshadows_and_events(conn, input.chapter_number);
    if !foreshadow_events_text.is_empty() {
        items.push(RecallItem {
            priority: RecallPriority::P4,
            source: "foreshadows_events".to_string(),
            text: foreshadow_events_text,
        });
    }

    let soft_rules_text = fetch_soft_rules(conn);
    if !soft_rules_text.is_empty() {
        items.push(RecallItem {
            priority: RecallPriority::P5,
            source: "soft_rules".to_string(),
            text: soft_rules_text,
        });
    }

    if let Some(ref query) = input.fts_query {
        let fts_text = fetch_fts_results(conn, query);
        if !fts_text.is_empty() {
            items.push(RecallItem {
                priority: RecallPriority::P6,
                source: "fts".to_string(),
                text: fts_text,
            });
        }
    }

    assemble_with_budget(items, budget_chars)
}

/// RCL-001~004: Full recall including async RAG semantic search.
#[tauri::command]
pub async fn full_recall_context(
    db: State<'_, DbState>,
    llm: State<'_, LlmState>,
    input: RecallInput,
) -> Result<AssembledRecallContext, String> {
    let budget = input.max_tokens.unwrap_or(MAX_TOKEN_BUDGET);
    let budget_chars = budget * CHARS_PER_TOKEN;

    // Step 1: Assemble synchronous recall (P0-P6)
    let mut result = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;

        let mut items: Vec<RecallItem> = Vec::new();

        let t = fetch_task_card(conn, input.chapter_number);
        if !t.is_empty() {
            items.push(RecallItem {
                priority: RecallPriority::P0,
                source: "task_card".to_string(),
                text: t,
            });
        }

        let t = fetch_hard_rules(conn);
        if !t.is_empty() {
            items.push(RecallItem {
                priority: RecallPriority::P1,
                source: "hard_rules".to_string(),
                text: t,
            });
        }

        let t = fetch_character_states(conn, input.chapter_number, input.character_ids.as_deref());
        if !t.is_empty() {
            items.push(RecallItem {
                priority: RecallPriority::P2,
                source: "character_states".to_string(),
                text: t,
            });
        }

        let t = fetch_recent_snapshot(conn, input.chapter_number);
        if !t.is_empty() {
            items.push(RecallItem {
                priority: RecallPriority::P3,
                source: "snapshot".to_string(),
                text: t,
            });
        }

        let t = fetch_foreshadows_and_events(conn, input.chapter_number);
        if !t.is_empty() {
            items.push(RecallItem {
                priority: RecallPriority::P4,
                source: "foreshadows_events".to_string(),
                text: t,
            });
        }

        let t = fetch_soft_rules(conn);
        if !t.is_empty() {
            items.push(RecallItem {
                priority: RecallPriority::P5,
                source: "soft_rules".to_string(),
                text: t,
            });
        }

        if let Some(ref query) = input.fts_query {
            let t = fetch_fts_results(conn, query);
            if !t.is_empty() {
                items.push(RecallItem {
                    priority: RecallPriority::P6,
                    source: "fts".to_string(),
                    text: t,
                });
            }
        }

        assemble_with_budget(items, budget_chars)?
    };

    // Step 2: RAG semantic recall (async) — RCL-004 with intent-driven filtering
    if let Some(ref rag_query) = input.rag_query {
        let intent = input.to_rag_intent();
        let rag_text = fetch_rag_results_with_intent(&db, &llm, rag_query, intent.as_ref()).await;
        if !rag_text.is_empty() {
            let remaining_chars = budget_chars.saturating_sub(result.context_text.chars().count());
            if remaining_chars > 200 {
                let rag_chars: Vec<char> = rag_text.chars().take(remaining_chars - 20).collect();
                let rag_trimmed: String = rag_chars.into_iter().collect();
                let rag_section = format!("\n\n【语义召回(RAG)】\n{}", rag_trimmed);
                result.context_text.push_str(&rag_section);
                result.layers.rag_tokens = rag_section.chars().count() / CHARS_PER_TOKEN;
                result.token_estimate = result.context_text.chars().count() / CHARS_PER_TOKEN;
            }
        }
    }

    Ok(result)
}

// ─── Data fetchers ───

pub fn fetch_task_card(conn: &rusqlite::Connection, chapter_number: i64) -> String {
    let result = conn.query_row(
        "SELECT objective, must_progress, must_recall, must_avoid, required_hooks, required_context, ending_hook FROM chapter_tasks WHERE chapter_number = ?1",
        [chapter_number],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
        )),
    );

    match result {
        Ok((
            objective,
            must_progress,
            must_recall,
            must_avoid,
            required_hooks,
            required_context,
            ending_hook,
        )) => {
            let mut text = format!("【任务卡】\n目标: {}", objective);
            if let Some(ref p) = must_progress {
                text.push_str(&format!("\n必须推进: {}", p));
            }
            if let Some(ref r) = must_recall {
                text.push_str(&format!("\n必须回顾: {}", r));
            }
            if let Some(ref a) = must_avoid {
                text.push_str(&format!("\n必须避免: {}", a));
            }
            if let Some(ref h) = required_hooks {
                text.push_str(&format!("\n必要钩子: {}", h));
            }
            if let Some(ref c) = required_context {
                text.push_str(&format!("\n必要上下文: {}", c));
            }
            if let Some(ref e) = ending_hook {
                text.push_str(&format!("\n结尾钩子: {}", e));
            }
            text
        }
        Err(_) => String::new(),
    }
}

pub fn fetch_hard_rules(conn: &rusqlite::Connection) -> String {
    let mut stmt = match conn.prepare(
        "SELECT rule_name, content FROM canon_rules WHERE status = 'active' AND is_hard = 1 ORDER BY rule_name"
    ) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let rows: Vec<(String, String)> = match stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(_) => return String::new(),
    };

    if rows.is_empty() {
        return String::new();
    }

    let mut text = String::from("【硬规则(不可违反)】\n");
    for (name, content) in &rows {
        text.push_str(&format!("- {}: {}\n", name, content));
    }
    text
}

pub fn fetch_character_states(
    conn: &rusqlite::Connection,
    chapter_number: i64,
    character_ids: Option<&[String]>,
) -> String {
    // If specific character IDs are provided, filter to only those characters
    let sql = if character_ids.map_or(false, |ids| !ids.is_empty()) {
        "SELECT c.name, cs.level_state, cs.emotion_state, cs.goal_state, cs.physical_state, cs.location_id \
         FROM characters c \
         LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.chapter_from <= ?1 AND (cs.chapter_to IS NULL OR cs.chapter_to >= ?1) \
         WHERE c.status = 'active' AND c.id IN (SELECT value FROM json_each(?2)) \
         ORDER BY c.name LIMIT 20"
    } else {
        "SELECT c.name, cs.level_state, cs.emotion_state, cs.goal_state, cs.physical_state, cs.location_id \
         FROM characters c \
         LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.chapter_from <= ?1 AND (cs.chapter_to IS NULL OR cs.chapter_to >= ?1) \
         WHERE c.status = 'active' \
         ORDER BY c.name LIMIT 20"
    };

    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let ids_json = character_ids
        .map(|ids| {
            let items: Vec<String> = ids
                .iter()
                .map(|id| format!("\"{}\"", id.replace('"', "\\\"")))
                .collect();
            format!("[{}]", items.join(","))
        })
        .unwrap_or_default();

    let rows: Vec<(
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = if character_ids.map_or(false, |ids| !ids.is_empty()) {
        match stmt.query_map(rusqlite::params![chapter_number, ids_json], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        }) {
            Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
            Err(_) => return String::new(),
        }
    } else {
        match stmt.query_map([chapter_number], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        }) {
            Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
            Err(_) => return String::new(),
        }
    };

    if rows.is_empty() {
        return String::new();
    }

    let mut text = String::from("【角色状态】\n");
    for (name, level, emotion, goal, physical, location) in &rows {
        let mut parts = vec![name.clone()];
        if let Some(ref l) = level {
            parts.push(format!("等级:{}", l));
        }
        if let Some(ref e) = emotion {
            parts.push(format!("情绪:{}", e));
        }
        if let Some(ref g) = goal {
            parts.push(format!("目标:{}", g));
        }
        if let Some(ref p) = physical {
            parts.push(format!("身体:{}", p));
        }
        if let Some(ref loc) = location {
            parts.push(format!("位置:{}", loc));
        }
        text.push_str(&format!("- {}\n", parts.join(" ")));
    }
    text
}

pub fn fetch_recent_snapshot(conn: &rusqlite::Connection, chapter_number: i64) -> String {
    let result = conn.query_row(
        "SELECT summary_json FROM snapshots WHERE chapter_end < ?1 ORDER BY chapter_end DESC LIMIT 1",
        rusqlite::params![chapter_number],
        |row| row.get::<_, String>(0),
    );

    match result {
        Ok(summary_json) => {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&summary_json) {
                let mut text = String::from("【最近快照】\n");
                if let Some(ch) = val.get("chapter_number") {
                    text.push_str(&format!("快照章节: 第{}章\n", ch));
                }
                if let Some(wc) = val.get("word_count") {
                    text.push_str(&format!("累计字数: {}\n", wc));
                }
                if let Some(chars) = val.get("characters").and_then(|c| c.as_array()) {
                    text.push_str(&format!("活跃角色({}人):\n", chars.len()));
                    for ch in chars.iter().take(8) {
                        let name = ch.get("name").and_then(|n| n.as_str()).unwrap_or("?");
                        let role = ch.get("role_type").and_then(|r| r.as_str()).unwrap_or("");
                        let level = ch.get("level").and_then(|l| l.as_str()).unwrap_or("");
                        let emotion = ch.get("emotion").and_then(|e| e.as_str()).unwrap_or("");
                        text.push_str(&format!("  - {}({}): {} {}\n", name, role, level, emotion));
                    }
                    if chars.len() > 8 {
                        text.push_str(&format!("  ...等{}人\n", chars.len()));
                    }
                }
                if let Some(fc) = val.get("active_foreshadow_count") {
                    text.push_str(&format!("活跃伏笔: {}条\n", fc));
                }
                text
            } else {
                String::new()
            }
        }
        Err(_) => String::new(),
    }
}

pub fn fetch_foreshadows_and_events(conn: &rusqlite::Connection, chapter_number: i64) -> String {
    let mut text = String::new();

    // Open foreshadows
    {
        let mut stmt = match conn.prepare(
            "SELECT title, seed_chapter, importance FROM foreshadow_items WHERE status IN ('planted', 'overdue') AND seed_chapter <= ?1 ORDER BY importance DESC NULLS LAST, seed_chapter LIMIT 10"
        ) {
            Ok(s) => s,
            Err(_) => return text,
        };
        let rows: Vec<(String, i64, Option<String>)> = match stmt
            .query_map([chapter_number], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            }) {
            Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        };

        if !rows.is_empty() {
            text.push_str("【未回收伏笔】\n");
            for (title, seed, importance) in &rows {
                let imp = importance
                    .as_ref()
                    .map(|i| format!("[重要度:{}]", i))
                    .unwrap_or_default();
                text.push_str(&format!("- {}「{}」(种子第{}章)\n", imp, title, seed));
            }
        }
    }

    // Recent timeline events
    {
        let mut stmt = match conn.prepare(
            "SELECT relative_day, summary, participants FROM timeline_nodes WHERE chapter_number <= ?1 ORDER BY relative_day DESC, chapter_number DESC LIMIT 5"
        ) {
            Ok(s) => s,
            Err(_) => return text,
        };
        let rows: Vec<(Option<i64>, String, Option<String>)> = match stmt
            .query_map([chapter_number], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            }) {
            Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
            Err(_) => Vec::new(),
        };

        if !rows.is_empty() {
            text.push_str("【近期时间线】\n");
            for (day, summary, participants) in &rows {
                let day_str = day.map(|d| format!("第{}天", d)).unwrap_or_default();
                let parts = participants.as_deref().unwrap_or("");
                text.push_str(&format!(
                    "- {} {}: {}{}\n",
                    day_str,
                    summary,
                    if parts.is_empty() { "" } else { " (" },
                    parts
                ));
            }
        }
    }

    text
}

pub fn fetch_soft_rules(conn: &rusqlite::Connection) -> String {
    let mut stmt = match conn.prepare(
        "SELECT rule_name, content FROM canon_rules WHERE status = 'active' AND is_hard = 0 ORDER BY rule_name LIMIT 8"
    ) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let rows: Vec<(String, String)> = match stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
    {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(_) => return String::new(),
    };

    if rows.is_empty() {
        return String::new();
    }

    let mut text = String::from("【软规则(参考)】\n");
    for (name, content) in &rows {
        text.push_str(&format!("- {}: {}\n", name, content));
    }
    text
}

/// RCL-003: FTS exact keyword recall using LIKE search.
fn fetch_fts_results(conn: &rusqlite::Connection, query: &str) -> String {
    if query.trim().is_empty() {
        return String::new();
    }

    let search = format!("%{}%", query.trim());

    let mut stmt = match conn.prepare(
        "SELECT chapter_number, title, COALESCE(final_text, draft_text, '') FROM chapters WHERE final_text LIKE ?1 OR draft_text LIKE ?1 ORDER BY chapter_number LIMIT 5"
    ) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let rows: Vec<(i64, Option<String>, String)> =
        match stmt.query_map([&search], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))) {
            Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
            Err(_) => return String::new(),
        };

    if rows.is_empty() {
        return String::new();
    }

    let mut text = String::from("【精确搜索(FTS)】\n");
    let query_lower = query.to_lowercase();

    for (ch_num, title, full_text) in &rows {
        let title_str = title.as_deref().unwrap_or("无标题");
        let text_lower = full_text.to_lowercase();
        if let Some(pos) = text_lower.find(&query_lower) {
            let start = if pos > 50 { pos - 50 } else { 0 };
            let end = (pos + query.len() + 100).min(full_text.len());
            let snippet = if start > 0 { "..." } else { "" }.to_string()
                + &full_text[start..end]
                + if end < full_text.len() { "..." } else { "" };
            text.push_str(&format!("- 第{}章「{}」: {}\n", ch_num, title_str, snippet));
        }
    }
    text
}

/// RCL-004: RAG semantic recall (async wrapper) with intent-driven filtering.
/// Uses SQLite-backed RAG via DbState instead of in-memory RagState.
async fn fetch_rag_results_with_intent(
    db: &DbState,
    llm: &LlmState,
    query: &str,
    intent: Option<&RagIntentFilter>,
) -> String {
    // Quick emptiness check
    {
        let guard = match db.project.lock() {
            Ok(g) => g,
            Err(_) => return String::new(),
        };
        let conn = match guard.as_ref() {
            Some(c) => c,
            None => return String::new(),
        };
        if crate::rag::is_rag_empty(conn).unwrap_or(true) {
            return String::new();
        }
    }

    let config = {
        let service = match llm.service.lock() {
            Ok(s) => s,
            Err(_) => return String::new(),
        };
        service.config.clone()
    };
    let svc = crate::llm::LlmService::new(config);
    let embedding = match svc.embed(query).await {
        Ok(e) => e,
        Err(_) => return String::new(),
    };

    let guard = match db.project.lock() {
        Ok(g) => g,
        Err(_) => return String::new(),
    };
    let conn = match guard.as_ref() {
        Some(c) => c,
        None => return String::new(),
    };
    let raw_results = match crate::rag::search_similar_sqlite(conn, &embedding, 5, intent) {
        Ok(r) => r,
        Err(_) => return String::new(),
    };

    if raw_results.is_empty() {
        return String::new();
    }

    let mut text = String::from("【语义召回(RAG)】\n");
    for (chapter_number, chunk_text, similarity) in &raw_results {
        let score = (similarity * 100.0) as i32;
        text.push_str(&format!(
            "- 第{}章(相似度:{}%): {}...\n",
            chapter_number,
            score,
            chunk_text.chars().take(200).collect::<String>()
        ));
    }
    text
}

// ─── Budget-Controlled Assembly (RCL-002) ───

fn assemble_with_budget(
    items: Vec<RecallItem>,
    budget_chars: usize,
) -> Result<AssembledRecallContext, String> {
    let mut protected_text = String::new();
    let mut trimmable_items: Vec<&RecallItem> = Vec::new();
    let mut layers = RecallLayers::default();
    let mut layer_texts = RecallLayerTexts::default();

    for item in &items {
        // Store raw text per layer regardless of budget
        match item.priority {
            RecallPriority::P0 => layer_texts.task_card = item.text.clone(),
            RecallPriority::P1 => layer_texts.hard_rules = item.text.clone(),
            RecallPriority::P2 => layer_texts.character_states = item.text.clone(),
            RecallPriority::P3 => layer_texts.snapshot = item.text.clone(),
            RecallPriority::P4 => layer_texts.foreshadows_events = item.text.clone(),
            RecallPriority::P5 => layer_texts.soft_rules = item.text.clone(),
            RecallPriority::P6 => layer_texts.fts = item.text.clone(),
            RecallPriority::P7 => layer_texts.rag = item.text.clone(),
        }

        if (item.priority as u8) <= (RecallPriority::P4 as u8) {
            let section = format!("\n\n{}", item.text);
            protected_text.push_str(&section);
            let tokens = section.chars().count() / CHARS_PER_TOKEN;
            match item.priority {
                RecallPriority::P0 => layers.task_card_tokens = tokens,
                RecallPriority::P1 => layers.hard_rules_tokens = tokens,
                RecallPriority::P2 => layers.character_states_tokens = tokens,
                RecallPriority::P3 => layers.snapshot_tokens = tokens,
                RecallPriority::P4 => layers.foreshadows_events_tokens = tokens,
                _ => {}
            }
        } else {
            trimmable_items.push(item);
        }
    }

    let protected_chars = protected_text.chars().count();
    let remaining_chars = budget_chars.saturating_sub(protected_chars);
    let was_trimmed;

    let mut trimmable_text = String::new();
    let mut chars_remaining = remaining_chars;

    if remaining_chars > 0 {
        trimmable_items.sort_by_key(|item| item.priority as u8);

        for item in &trimmable_items {
            if chars_remaining == 0 {
                break;
            }
            let section = format!("\n\n{}", item.text);
            let section_chars = section.chars().count();

            if section_chars <= chars_remaining {
                trimmable_text.push_str(&section);
                chars_remaining -= section_chars;
                let tokens = section.chars().count() / CHARS_PER_TOKEN;
                match item.priority {
                    RecallPriority::P5 => layers.soft_rules_tokens = tokens,
                    RecallPriority::P6 => layers.fts_tokens = tokens,
                    RecallPriority::P7 => layers.rag_tokens = tokens,
                    _ => {}
                }
            } else {
                let truncated: String = section
                    .chars()
                    .take(chars_remaining.saturating_sub(20))
                    .collect();
                trimmable_text.push_str(&truncated);
                trimmable_text.push_str("\n...(已截断)");
                let tokens = truncated.chars().count() / CHARS_PER_TOKEN;
                match item.priority {
                    RecallPriority::P5 => layers.soft_rules_tokens = tokens,
                    RecallPriority::P6 => layers.fts_tokens = tokens,
                    RecallPriority::P7 => layers.rag_tokens = tokens,
                    _ => {}
                }
                chars_remaining = 0;
            }
        }
    }

    was_trimmed = chars_remaining == 0 && !trimmable_items.is_empty();

    let context_text = if protected_text.starts_with("\n\n") {
        protected_text[2..].to_string() + &trimmable_text
    } else {
        protected_text.clone() + &trimmable_text
    };

    let token_estimate = context_text.chars().count() / CHARS_PER_TOKEN;

    Ok(AssembledRecallContext {
        context_text,
        token_estimate,
        layers,
        was_trimmed,
        layer_texts,
    })
}

// ─── Supplementary fetchers for pipeline variable injection ───

/// Fetch genre_id from project metadata.
pub fn fetch_genre(conn: &rusqlite::Connection) -> String {
    conn.query_row("SELECT genre_id FROM projects LIMIT 1", [], |row| {
        row.get::<_, Option<String>>(0)
    })
    .ok()
    .flatten()
    .unwrap_or_else(|| "通用".to_string())
}

fn fetch_project_setting(conn: &rusqlite::Connection, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM project_settings WHERE key = ?1 ORDER BY updated_at DESC LIMIT 1",
        [key],
        |row| row.get::<_, String>(0),
    )
    .ok()
}

fn compact_json_field(label: &str, value: &str) -> String {
    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(value) {
        if let Some(obj) = parsed.as_object() {
            let mut parts = Vec::new();
            for (key, val) in obj.iter().take(6) {
                if let Some(s) = val.as_str() {
                    parts.push(format!("{}={}", key, s));
                } else if let Some(arr) = val.as_array() {
                    let inner = arr
                        .iter()
                        .take(5)
                        .filter_map(|item| item.as_str())
                        .collect::<Vec<_>>()
                        .join("、");
                    if !inner.is_empty() {
                        parts.push(format!("{}={}", key, inner));
                    }
                } else {
                    parts.push(format!("{}={}", key, val));
                }
            }
            if !parts.is_empty() {
                return format!("- {}: {}\n", label, parts.join("；"));
            }
        }
    }
    format!("- {}: {}\n", label, value)
}

/// Fetch the applied genre template settings as generation context.
pub fn fetch_genre_template_context(conn: &rusqlite::Connection) -> String {
    let fields = [
        ("genre_name", "题材"),
        ("world_framework", "世界观框架"),
        ("volume_rhythm", "卷节奏"),
        ("character_archetypes", "角色原型"),
        ("thrill_params", "爽感参数"),
        ("taboo_rules", "题材禁忌"),
        ("naming_style", "命名风格"),
        ("naming_examples", "命名示例"),
    ];
    let mut text = String::from("【已应用题材模板】\n");
    let mut has_any = false;
    for (key, label) in fields {
        if let Some(value) = fetch_project_setting(conn, key) {
            if !value.trim().is_empty() {
                text.push_str(&compact_json_field(label, &value));
                has_any = true;
            }
        }
    }
    if has_any {
        text
    } else {
        String::new()
    }
}

/// Fetch volume outline context for the chapter's volume.
pub fn fetch_volume_outline(conn: &rusqlite::Connection, chapter_number: i64) -> String {
    // Find which volume this chapter belongs to (heuristic: 10 chapters per volume)
    let volume_number = ((chapter_number - 1) / 10) + 1;
    let result = conn.query_row(
        "SELECT title, goal, main_conflict, climax FROM volumes WHERE volume_number = ?1",
        [volume_number],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        },
    );

    match result {
        Ok((title, goal, conflict, climax)) => {
            let mut text = String::from("【卷纲】\n");
            if let Some(t) = title {
                text.push_str(&format!("卷名: {}\n", t));
            }
            if let Some(g) = goal {
                text.push_str(&format!("目标: {}\n", g));
            }
            if let Some(c) = conflict {
                text.push_str(&format!("冲突: {}\n", c));
            }
            if let Some(cl) = climax {
                text.push_str(&format!("爆点: {}\n", cl));
            }
            text
        }
        Err(_) => String::new(),
    }
}

/// Fetch recent chapter outlines for context.
pub fn fetch_chapter_outlines(conn: &rusqlite::Connection, chapter_number: i64) -> String {
    let start = (chapter_number - 3).max(1);
    let mut stmt = match conn.prepare(
        "SELECT co.chapter_number, co.content_json
         FROM chapter_outlines co
         JOIN (
             SELECT chapter_number, MAX(version) AS version
             FROM chapter_outlines
             WHERE chapter_number >= ?1
               AND chapter_number < ?2
               AND (confirmed = 1 OR status = 'generated')
             GROUP BY chapter_number
         ) latest
           ON latest.chapter_number = co.chapter_number
          AND latest.version = co.version
         ORDER BY co.chapter_number DESC
         LIMIT 3"
    ) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let rows: Vec<(i64, Option<String>)> = match stmt
        .query_map(rusqlite::params![start, chapter_number], |row| {
            Ok((row.get(0)?, row.get(1)?))
        }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(_) => return String::new(),
    };

    if rows.is_empty() {
        return String::new();
    }

    let mut text = String::from("【近期章节大纲】\n");
    for (num, outline) in &rows {
        let o = outline.as_deref().unwrap_or("(无大纲)");
        text.push_str(&format!("- 第{}章: {}\n", num, o));
    }
    text
}

/// Fetch soul templates for characters with SOUL data.
pub fn fetch_soul_templates(conn: &rusqlite::Connection) -> String {
    let mut stmt = match conn.prepare(
        "SELECT name, soul_json FROM characters WHERE status = 'active' AND soul_json IS NOT NULL AND soul_json != '{}' AND soul_json != '' LIMIT 10"
    ) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let rows: Vec<(String, String)> = match stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
    {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(_) => return String::new(),
    };

    if rows.is_empty() {
        return String::new();
    }

    let mut text = String::from("【角色SOUL档案】\n");
    for (name, soul_json) in &rows {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(soul_json) {
            text.push_str(&format!("- {}:", name));
            if let Some(speech) = val.get("speech").and_then(|s| s.as_str()) {
                text.push_str(&format!(" 语气=\"{}\"", speech));
            }
            if let Some(behavior) = val.get("behavior").and_then(|b| b.as_str()) {
                text.push_str(&format!(" 行为=\"{}\"", behavior));
            }
            text.push('\n');
        }
    }
    text
}

/// Fetch relationship states between characters.
pub fn fetch_relationship_states(conn: &rusqlite::Connection) -> String {
    let mut stmt = match conn.prepare(
        "SELECT c1.name, c2.name, rs.rel_type, rs.strength, rs.trust_score \
         FROM relationship_states rs \
         JOIN characters c1 ON rs.character_a_id = c1.id \
         JOIN characters c2 ON rs.character_b_id = c2.id \
         WHERE rs.strength IS NOT NULL \
         ORDER BY rs.strength DESC LIMIT 10",
    ) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let rows: Vec<(String, String, Option<String>, Option<i64>, Option<i64>)> = match stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        }) {
        Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
        Err(_) => return String::new(),
    };

    if rows.is_empty() {
        return String::new();
    }

    let mut text = String::from("【角色关系】\n");
    for (name_a, name_b, rel_type, strength, trust) in &rows {
        let rt = rel_type.as_deref().unwrap_or("未知");
        let s = strength
            .map(|v| v.to_string())
            .unwrap_or_else(|| "-".to_string());
        let t = trust
            .map(|v| v.to_string())
            .unwrap_or_else(|| "-".to_string());
        text.push_str(&format!(
            "- {} ↔ {} ({}): 强度={}, 信任={}\n",
            name_a, name_b, rt, s, t
        ));
    }
    text
}

/// Fetch style guide from project settings.
pub fn fetch_style_guide(conn: &rusqlite::Connection) -> String {
    if let Some(style_json) = fetch_project_setting(conn, "style_profile") {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&style_json) {
                let mut text = String::from("【文风档案】\n");
                if let Some(name) = val.get("name").and_then(|n| n.as_str()) {
                    text.push_str(&format!("风格: {}\n", name));
                }
                if let Some(desc) = val.get("description").and_then(|d| d.as_str()) {
                    text.push_str(&format!("描述: {}\n", desc));
                }
                if let Some(rules) = val.get("rules").and_then(|r| r.as_array()) {
                    text.push_str(&format!("规则({}条):\n", rules.len()));
                    for rule in rules.iter().take(5) {
                        if let Some(s) = rule.as_str() {
                            text.push_str(&format!("- {}\n", s));
                        }
                    }
                }
                text
            } else {
                String::new()
            }
    } else {
        let name = fetch_project_setting(conn, "style_profile_name");
        let preferred = fetch_project_setting(conn, "preferred_patterns");
        let anti_ai = fetch_project_setting(conn, "anti_ai_features");
        let banned = fetch_project_setting(conn, "banned_patterns");
        if name.is_none() && preferred.is_none() && anti_ai.is_none() && banned.is_none() {
            return String::new();
        }
        let mut text = String::from("【文风档案】\n");
        if let Some(value) = name {
            text.push_str(&format!("风格: {}\n", value));
        }
        if let Some(value) = preferred {
            text.push_str(&compact_json_field("偏好模式", &value));
        }
        if let Some(value) = anti_ai {
            text.push_str(&compact_json_field("反AI特征", &value));
        }
        if let Some(value) = banned {
            text.push_str(&compact_json_field("禁用模式", &value));
        }
        text
    }
}

/// Alias for generation prompts; kept separate for readability at call sites.
pub fn fetch_style_profile_context(conn: &rusqlite::Connection) -> String {
    fetch_style_guide(conn)
}

/// Fetch de-AI rules as a formatted string for voice filter / prose expert.
pub fn fetch_de_ai_rules_summary(conn: &rusqlite::Connection) -> String {
    let imported_value: Option<String> = conn
        .query_row(
            "SELECT value FROM project_settings WHERE key = 'imported_deai_rules' ORDER BY updated_at DESC LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();
    if let Some(value) = imported_value {
        let rows: Vec<(String, String, String, Option<String>, String, Option<String>)> =
            serde_json::from_str(&value).unwrap_or_default();
        if !rows.is_empty() {
            let mut text = String::from("【项目已导入去AI化规则】\n");
            for (_, category, pattern, replacement, severity, description) in rows.iter().take(20)
            {
                let desc = description.as_deref().unwrap_or("");
                let repl = replacement
                    .as_deref()
                    .map(|value| format!(" -> {}", value))
                    .unwrap_or_default();
                text.push_str(&format!(
                    "- [{}][{}] {}{}: {}\n",
                    category, severity, pattern, repl, desc
                ));
            }
            return text;
        }
    }

    let mut stmt = match conn.prepare(
        "SELECT category, pattern, description FROM de_ai_rules WHERE is_enabled = 1 ORDER BY category, pattern LIMIT 20"
    ) {
        Ok(s) => s,
        Err(_) => return "避免高频AI用词，打破模板化句式".to_string(),
    };

    let rows: Vec<(String, String, Option<String>)> =
        match stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))) {
            Ok(mapped) => mapped.filter_map(|r| r.ok()).collect(),
            Err(_) => return "避免高频AI用词，打破模板化句式".to_string(),
        };

    if rows.is_empty() {
        return "避免高频AI用词，打破模板化句式".to_string();
    }

    let mut text = String::from("【去AI化规则】\n");
    for (category, name, desc) in &rows {
        let d = desc.as_deref().unwrap_or("");
        text.push_str(&format!("- [{}] {}: {}\n", category, name, d));
    }
    text
}

/// Fetch applicable writing patterns from the global DB, optionally filtered by genre compatibility.
/// This queries the global DB, not the project DB.
pub fn fetch_writing_patterns(global_conn: &rusqlite::Connection, genre: Option<&str>) -> String {
    let sql = if genre.is_some() {
        "SELECT pattern_name, description, usage_guide FROM writing_patterns WHERE genre_compat IS NULL OR genre_compat LIKE ?1 ORDER BY pattern_name LIMIT 10"
    } else {
        "SELECT pattern_name, description, usage_guide FROM writing_patterns ORDER BY pattern_name LIMIT 10"
    };

    let mut stmt = match global_conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return String::new(),
    };

    let rows: Vec<(String, String, Option<String>)> = if let Some(g) = genre {
        let like = format!("%{}%", g);
        let mapped =
            match stmt.query_map([&like], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))) {
                Ok(m) => m,
                Err(_) => return String::new(),
            };
        mapped.filter_map(|r| r.ok()).collect()
    } else {
        let mapped = match stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))) {
            Ok(m) => m,
            Err(_) => return String::new(),
        };
        mapped.filter_map(|r| r.ok()).collect()
    };

    if rows.is_empty() {
        return String::new();
    }

    let mut text = String::from("【适用写作模式】\n");
    for (name, desc, guide) in &rows {
        text.push_str(&format!("- {}: {}\n", name, desc));
        if let Some(g) = guide {
            if !g.is_empty() {
                text.push_str(&format!("  用法: {}\n", g));
            }
        }
    }
    text
}
