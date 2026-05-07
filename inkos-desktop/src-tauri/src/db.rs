use rusqlite::{Connection, Result};
use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::collections::{HashMap, HashSet};
use regex::Regex;

pub struct DbState {
    pub workspace_conn: Mutex<Connection>,
    pub book_conn: Mutex<Option<Connection>>,
    pub app_data_dir: std::path::PathBuf,
}

#[derive(Serialize, Deserialize)]
pub struct AppConfig {
    pub api_key: String,
    pub base_url: String,
    pub model_name: String,
    pub anti_ai_rules_md: String,
}

#[derive(Serialize, Deserialize)]
pub struct BookMeta {
    pub title: String,
    pub genre: String,
    pub logline: String,
    pub full_outline: String,
}

#[derive(Serialize, Deserialize)]
pub struct Chapter {
    pub id: i32,
    pub chapter_number: i32,
    pub title: String,
    pub outline: String,
    pub content: Option<String>,
    pub draft_raw: Option<String>,
    pub status: String,
}

#[derive(Serialize, Deserialize)]
pub struct PlanningContextPlan {
    pub one_liner: String,
    pub tags: Vec<String>,
    pub cast_refs: Vec<String>,
    pub thread_refs: Vec<String>,
    pub locked: bool,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct PlanningContextCheckpoint {
    pub id: i32,
    pub version_id: i32,
    pub start_chapter: i32,
    pub end_chapter: i32,
    pub checkpoint: serde_json::Value,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct PlanningContext {
    pub chapter_number: i32,
    pub version_id: Option<i32>,
    pub book: BookMeta,
    pub plan: PlanningContextPlan,
    pub checkpoint: Option<PlanningContextCheckpoint>,
    pub recent_context: String,
    pub open_hooks: Vec<PendingHook>,
    pub warnings: Vec<String>,
}

#[derive(Serialize, Deserialize)]
pub struct CharacterBible {
    pub id: i32,
    pub name: String,
    pub core_belief: String,
    pub catchphrase: String,
    pub forbidden_knowledge: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct WorldLocation {
    pub id: i32,
    pub name: String,
    pub description: String,
}

#[derive(Serialize, Deserialize)]
pub struct WorldItem {
    pub id: i32,
    pub name: String,
    pub description: String,
}

#[derive(Serialize, Deserialize)]
pub struct WorldFactProposal {
    pub id: i32,
    pub entity_type: String,
    pub entity_name: String,
    pub fact_key: String,
    pub fact_value: String,
    pub confidence: f64,
    pub source_chapter: i32,
    pub source_span: String,
    pub status: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ProposalItem {
    pub id: i32,
    pub proposal_type: String,
    pub payload: serde_json::Value,
    pub source_chapter: Option<i32>,
    pub status: String,
    pub confidence: f64,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct TemporalState {
    pub id: i32,
    pub entity_id: String,
    pub entity_type: String,
    pub state_key: String,
    pub state_value: String,
    pub valid_from_chapter: i32,
    pub valid_to_chapter: Option<i32>,
}

#[derive(Serialize, Deserialize)]
pub struct OutlineRow {
    pub chapter_number: i32,
    pub one_liner: String,
    pub tags: Vec<String>,
    pub cast_refs: Vec<String>,
    pub thread_refs: Vec<String>,
    pub locked: bool,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct OutlinePatch {
    pub chapter_number: i32,
    pub one_liner: Option<String>,
    pub tags: Option<Vec<String>>,
    pub cast_refs: Option<Vec<String>>,
    pub thread_refs: Option<Vec<String>>,
    pub locked: Option<bool>,
}

#[derive(Serialize, Deserialize)]
pub struct StagePlanItem {
    pub stage_id: i32,
    pub start_chapter: i32,
    pub end_chapter: i32,
    pub stage_goal: String,
    pub main_conflict: String,
    pub turning_point: String,
    pub climax: String,
    pub settlement: String,
    pub threads: serde_json::Value,
    pub cast_focus: serde_json::Value,
    pub system_usage: String,
}

#[derive(Serialize, Deserialize)]
pub struct OutlineCheckpointItem {
    pub id: i32,
    pub version_id: Option<i32>,
    pub start_chapter: i32,
    pub end_chapter: i32,
    pub checkpoint: serde_json::Value,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct StoryThread {
    pub id: i32,
    pub thread_key: String,
    pub r#type: String,
    pub title: String,
    pub goal: String,
    pub stakes: String,
    pub status: String,
    pub owner_characters: Vec<String>,
    pub start_chapter: Option<i32>,
    pub end_chapter: Option<i32>,
    pub milestones: Vec<String>,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct StoryThreadUpsert {
    pub id: Option<i32>,
    pub thread_key: Option<String>,
    pub r#type: String,
    pub title: String,
    pub goal: String,
    pub stakes: String,
    pub status: String,
    pub owner_characters: Vec<String>,
    pub start_chapter: Option<i32>,
    pub end_chapter: Option<i32>,
    pub milestones: Vec<String>,
    pub notes: String,
}

#[derive(Serialize, Deserialize)]
pub struct SoulTimelineItem {
    pub id: i32,
    pub character_name: String,
    pub valid_from_chapter: i32,
    pub valid_to_chapter: Option<i32>,
    pub soul_state: serde_json::Value,
    pub reason_span: String,
    pub source: String,
    pub confidence: f64,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct SoulTimelineUpsert {
    pub id: Option<i32>,
    pub character_name: String,
    pub valid_from_chapter: i32,
    pub valid_to_chapter: Option<i32>,
    pub soul_state: serde_json::Value,
    pub reason_span: String,
    pub source: String,
    pub confidence: Option<f64>,
}

#[derive(Serialize, Deserialize)]
pub struct CharacterRelationItem {
    pub id: i32,
    pub source_name: String,
    pub target_name: String,
    pub relation_type: String,
    pub strength: i32,
    pub valid_from_chapter: i32,
    pub valid_to_chapter: Option<i32>,
    pub note: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct CharacterRelationUpsert {
    pub id: Option<i32>,
    pub source_name: String,
    pub target_name: String,
    pub relation_type: String,
    pub strength: i32,
    pub valid_from_chapter: i32,
    pub valid_to_chapter: Option<i32>,
    pub note: String,
}

#[derive(Serialize, Deserialize)]
pub struct CharacterCoreItem {
    pub name: String,
    pub role_type: String,
    pub soul_core: serde_json::Value,
    pub notes: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct PendingHook {
    pub id: i32,
    pub hook_desc: String,
    pub created_at_chapter: i32,
    pub staleness: i32,
    pub is_resolved: bool,
    pub resolved_at_chapter: Option<i32>,
}

#[derive(Serialize)]
pub struct Consequence {
    pub id: i32,
    pub chapter_number: i32,
    pub upgrade_desc: String,
    pub consequence_hook: String,
    pub is_resolved: bool,
}

#[derive(Serialize)]
pub struct FailedReview {
    pub chapter_number: i32,
    pub created_at: String,
    pub review_summary: String,
}

#[derive(Serialize)]
pub struct BoardTotals {
    pub total_chars: usize,
    pub chapter_count: usize,
    pub open_hooks_count: usize,
    pub open_consequences_count: usize,
    pub failed_reviews_recent: usize,
}

#[derive(Serialize)]
pub struct BoardBook {
    pub title: String,
    pub genre: String,
    pub logline: String,
}

#[derive(Serialize)]
pub struct BoardOverview {
    pub book: BoardBook,
    pub totals: BoardTotals,
    pub stale_hooks: Vec<PendingHook>,
    pub open_consequences: Vec<Consequence>,
    pub failed_reviews: Vec<FailedReview>,
}

#[derive(Serialize)]
pub struct CharacterGraphNode {
    pub id: String,
    pub label: String,
    pub mentions: i32,
}

#[derive(Serialize)]
pub struct CharacterGraphEdge {
    pub source: String,
    pub target: String,
    pub weight: i32,
}

#[derive(Serialize)]
pub struct CharacterGraph {
    pub nodes: Vec<CharacterGraphNode>,
    pub edges: Vec<CharacterGraphEdge>,
}

fn extract_hooks_from_outline(outline: &str) -> Vec<String> {
    let text = outline.trim();
    if text.is_empty() {
        return vec![];
    }

    let mut hooks: Vec<String> = Vec::new();

    let section = if let Ok(re) = Regex::new(r"(?s)(?:【章末钩子】|章末钩子[：:])\s*(.*?)(?:【|$)") {
        re.captures(text)
            .and_then(|caps| caps.get(1).map(|m| m.as_str().trim().to_string()))
            .unwrap_or_default()
    } else {
        String::new()
    };

    if section.is_empty() {
        return hooks;
    }

    for part in section
        .split(|c| c == '\n' || c == '；' || c == ';' || c == '。' || c == '!' || c == '！')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        if hooks.len() >= 2 {
            break;
        }
        let len = part.chars().count();
        if len >= 6 && len <= 30 && !hooks.iter().any(|h| h == part) {
            hooks.push(part.to_string());
        }
    }

    hooks
}

pub(crate) fn refresh_hook_staleness(conn: &Connection, current_chapter: i32) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE pending_hooks SET staleness = (?1 - created_at_chapter) WHERE is_resolved = FALSE",
        rusqlite::params![current_chapter],
    )?;
    Ok(())
}

pub(crate) fn upsert_hooks_from_outline(conn: &Connection, chapter_number: i32, outline: &str) -> rusqlite::Result<()> {
    for hook_desc in extract_hooks_from_outline(outline) {
        conn.execute(
            "INSERT OR IGNORE INTO pending_hooks (hook_desc, created_at_chapter, staleness, is_resolved) VALUES (?1, ?2, 0, FALSE)",
            rusqlite::params![hook_desc, chapter_number],
        )?;
    }
    Ok(())
}

fn normalize_for_match(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || ('\u{4e00}'..='\u{9fff}').contains(c))
        .collect::<String>()
        .to_lowercase()
}

fn hook_signature(hook_desc: &str) -> String {
    let s = normalize_for_match(hook_desc);
    let mut chars = s.chars();
    let mut out = String::new();
    for _ in 0..12 {
        if let Some(c) = chars.next() {
            out.push(c);
        } else {
            break;
        }
    }
    out
}

pub(crate) fn auto_resolve_hooks_from_content(conn: &Connection, chapter_number: i32, content: &str) -> rusqlite::Result<()> {
    let content_norm = normalize_for_match(content);
    if content_norm.is_empty() {
        return Ok(());
    }

    let mut stmt = conn.prepare("SELECT id, hook_desc FROM pending_hooks WHERE is_resolved = FALSE AND created_at_chapter <= ?1")?;
    let iter = stmt.query_map([chapter_number], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?)))?;

    for item in iter {
        let (id, desc) = item?;
        let sig = hook_signature(&desc);
        if sig.chars().count() >= 4 && content_norm.contains(&sig) {
            conn.execute(
                "UPDATE pending_hooks SET is_resolved = TRUE, resolved_at_chapter = ?1 WHERE id = ?2",
                rusqlite::params![chapter_number, id],
            )?;
        }
    }

    Ok(())
}

fn guess_world_entity_type(name: &str) -> &'static str {
    let n = name.trim();
    if n.is_empty() {
        return "unknown";
    }
    let location_suffix = ["宗", "门", "派", "城", "国", "府", "山", "谷", "岭", "湖", "海", "殿", "宫", "院", "堡", "寨", "界", "域"];
    for s in location_suffix {
        if n.ends_with(s) {
            return "location";
        }
    }
    let item_suffix = ["诀", "经", "功", "法", "术", "阵", "剑", "刀", "枪", "弓", "印", "珠", "丹", "图", "符", "令", "钟", "鼎", "碑", "骨", "血", "砂"];
    for s in item_suffix {
        if n.ends_with(s) {
            return "item";
        }
    }
    "unknown"
}

fn slice_around(text: &str, idx: usize, len: usize, radius: usize) -> String {
    if text.is_empty() {
        return String::new();
    }
    let mut start = idx.saturating_sub(radius);
    let mut end = (idx + len + radius).min(text.len());
    while start > 0 && !text.is_char_boundary(start) {
        start -= 1;
    }
    while end < text.len() && !text.is_char_boundary(end) {
        end += 1;
    }
    text.get(start..end).unwrap_or("").to_string()
}

fn normalize_item_name(candidate: &str) -> Option<String> {
    let c = candidate.trim();
    if c.is_empty() {
        return None;
    }

    let brackets = Regex::new(r"《(?P<name>[\p{Han}]{2,8})》").unwrap();
    if let Some(caps) = brackets.captures(c) {
        let n = caps.name("name").map(|m| m.as_str()).unwrap_or("").trim();
        if n.chars().count() >= 2 {
            return Some(n.to_string());
        }
    }

    let ban_fragments = ["黄阶", "玄阶", "地阶", "天阶", "上品", "中品", "下品", "凡阶", "圣阶", "神阶", "身法", "步法", "拳法", "掌法", "指法", "剑法", "刀法", "枪法"];
    if ban_fragments.iter().any(|b| c.contains(b)) {
        return None;
    }

    let prefixes = ["手握", "手持", "握着", "拿着", "提着", "扛着", "祭出", "取出", "拔出", "挥动", "催动", "施展", "运转"];
    let mut s = c.to_string();
    for p in prefixes {
        if s.starts_with(p) {
            s = s.trim_start_matches(p).to_string();
        }
    }
    let s = s.trim();

    let core = Regex::new(r"[\p{Han}]{2,10}(诀|经|功|法|术|阵|剑|刀|枪|弓|印|珠|丹|图|符|令|钟|鼎|碑|骨|血|砂)").unwrap();
    let mut last: Option<String> = None;
    for m in core.find_iter(s) {
        last = Some(m.as_str().to_string());
    }
    last
}

fn normalize_location_name(candidate: &str) -> Option<String> {
    let c = candidate.trim();
    if c.is_empty() {
        return None;
    }
    let core = Regex::new(r"[\p{Han}]{2,10}(宗|门|派|城|国|府|山|谷|岭|湖|海|殿|宫|院|堡|寨|界|域)$").unwrap();
    if core.is_match(c) {
        return Some(c.to_string());
    }
    None
}

pub(crate) fn propose_world_entities_from_text(conn: &Connection, chapter_number: i32, text: &str) -> rusqlite::Result<()> {
    let t = text.trim();
    if t.is_empty() {
        return Ok(());
    }

    let mut known: HashMap<String, bool> = HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT name FROM character_bibles")?;
        let iter = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for n in iter.flatten() {
            known.insert(n, true);
        }
    }
    {
        let mut stmt = conn.prepare("SELECT name FROM world_locations")?;
        let iter = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for n in iter.flatten() {
            known.insert(n, true);
        }
    }
    {
        let mut stmt = conn.prepare("SELECT name FROM world_items")?;
        let iter = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for n in iter.flatten() {
            known.insert(n, true);
        }
    }
    {
        let mut stmt = conn.prepare("SELECT entity_name FROM world_facts_proposals WHERE status = 'pending'")?;
        let iter = stmt.query_map([], |row| row.get::<_, String>(0))?;
        for n in iter.flatten() {
            known.insert(n, true);
        }
    }

    let sentence_re = Regex::new(r"[^\n。！？!?]{2,160}[。！？!?]?").unwrap();
    let owner_re_1 = Regex::new(r"(?P<owner>[\p{Han}]{2,4}).{0,8}(得|获得|拿到|得到|拾起|收起|祭出).{0,8}(?P<item>[\p{Han}]{2,10}(诀|经|功|法|术|阵|剑|刀|枪|弓|印|珠|丹|图|符|令|钟|鼎|碑))").unwrap();
    let owner_re_2 = Regex::new(r"(?P<item>[\p{Han}]{2,10}(诀|经|功|法|术|阵|剑|刀|枪|弓|印|珠|丹|图|符|令|钟|鼎|碑)).{0,8}(落入|归于|到了).{0,6}(?P<owner>[\p{Han}]{2,4})").unwrap();
    let death_re = Regex::new(r"(?P<char>[\p{Han}]{2,4}).{0,6}(死|陨落|身亡)").unwrap();
    let injury_re = Regex::new(r"(?P<char>[\p{Han}]{2,4}).{0,10}(重伤|昏迷|吐血)").unwrap();
    let bracket_re = Regex::new(r"《(?P<name>[\p{Han}]{2,8})》").unwrap();

    for m in sentence_re.find_iter(t) {
        let s = m.as_str().trim();
        if s.is_empty() {
            continue;
        }

        if let Some(caps) = bracket_re.captures(s) {
            let name = caps.name("name").map(|m| m.as_str()).unwrap_or("").trim().to_string();
            if name.chars().count() >= 2 && !known.contains_key(&name) {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                     VALUES ('item', ?1, 'description', ?2, 0.55, ?3, ?4, 'pending')",
                    rusqlite::params![name, s, chapter_number, s],
                )?;
            }
        }

        if let Some(caps) = owner_re_1.captures(s) {
            let owner = caps.name("owner").map(|m| m.as_str()).unwrap_or("").to_string();
            let raw_item = caps.name("item").map(|m| m.as_str()).unwrap_or("").to_string();
            if owner.len() >= 2 && raw_item.len() >= 2 {
                if let Some(item) = normalize_item_name(&raw_item) {
                    if known.contains_key(&item) {
                        continue;
                    }
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                     VALUES ('item', ?1, 'owner', ?2, 0.65, ?3, ?4, 'pending')",
                    rusqlite::params![item, owner, chapter_number, s],
                )?;
                }
            }
        }
        if let Some(caps) = owner_re_2.captures(s) {
            let owner = caps.name("owner").map(|m| m.as_str()).unwrap_or("").to_string();
            let raw_item = caps.name("item").map(|m| m.as_str()).unwrap_or("").to_string();
            if owner.len() >= 2 && raw_item.len() >= 2 {
                if let Some(item) = normalize_item_name(&raw_item) {
                    if known.contains_key(&item) {
                        continue;
                    }
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                     VALUES ('item', ?1, 'owner', ?2, 0.65, ?3, ?4, 'pending')",
                    rusqlite::params![item, owner, chapter_number, s],
                )?;
                }
            }
        }
        if let Some(caps) = death_re.captures(s) {
            let c = caps.name("char").map(|m| m.as_str()).unwrap_or("").to_string();
            if c.len() >= 2 {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                     VALUES ('character', ?1, 'status', 'dead', 0.7, ?2, ?3, 'pending')",
                    rusqlite::params![c, chapter_number, s],
                )?;
            }
        }
        if let Some(caps) = injury_re.captures(s) {
            let c = caps.name("char").map(|m| m.as_str()).unwrap_or("").to_string();
            if c.len() >= 2 {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                     VALUES ('character', ?1, 'status', 'injured', 0.55, ?2, ?3, 'pending')",
                    rusqlite::params![c, chapter_number, s],
                )?;
            }
        }
    }

    let re = Regex::new(r"[\p{Han}]{2,6}").unwrap();
    let stop = [
        "因此", "于是", "但是", "然后", "如果", "因为", "没有", "不是", "一种", "一个", "我们", "他们", "自己", "这里", "那里", "时候",
        "什么", "怎么", "不会", "不能", "已经", "还有", "只是", "此刻", "突然", "缓缓", "同时", "目光", "声音", "心中", "片刻", "直到",
        "而是", "只是", "其实", "仿佛", "几乎", "依旧", "不由", "看见", "听见", "说道", "沉默", "点头", "摇头",
    ];
    let stop_set: HashMap<&str, bool> = stop.iter().map(|s| (*s, true)).collect();
    let bad_chars = [
        '的', '了', '在', '是', '不', '有', '而', '与', '及', '或', '和', '把', '被', '让', '着', '地', '得', '一', '这', '那', '你', '我',
        '他', '她', '它', '们', '将', '会', '要', '就', '却', '还', '又', '更', '最', '也', '都',
    ];

    let mut counts: HashMap<String, i32> = HashMap::new();
    for m in re.find_iter(t) {
        let s = m.as_str();
        if stop_set.contains_key(s) {
            continue;
        }
        if s.chars().count() < 2 {
            continue;
        }
        *counts.entry(s.to_string()).or_insert(0) += 1;
    }

    let mut items: Vec<(String, i32)> = counts.into_iter().collect();
    items.sort_by(|a, b| b.1.cmp(&a.1));
    if items.len() > 30 {
        items.truncate(30);
    }

    for (name, cnt) in items {
        if known.contains_key(&name) {
            continue;
        }
        if name.chars().any(|c| bad_chars.contains(&c)) {
            continue;
        }
        let entity_type = guess_world_entity_type(&name);
        let final_name = match entity_type {
            "item" => {
                if cnt < 2 {
                    continue;
                }
                normalize_item_name(&name)
            }
            "location" => {
                if cnt < 2 {
                    continue;
                }
                normalize_location_name(&name)
            }
            _ => None,
        };
        let final_name = match final_name {
            Some(v) => v,
            None => continue,
        };
        if known.contains_key(&final_name) {
            continue;
        }
        if let Some(idx) = t.find(&final_name).or_else(|| t.find(&name)) {
            let snippet = slice_around(t, idx, final_name.len(), 28);
            let _ = conn.execute(
                "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                 VALUES (?1, ?2, 'description', ?3, 0.35, ?4, ?5, 'pending')",
                rusqlite::params![entity_type, final_name, snippet, chapter_number, snippet],
            )?;
        }
    }

    Ok(())
}

pub(crate) fn upsert_temporal_state(
    conn: &Connection,
    entity_id: &str,
    entity_type: &str,
    state_key: &str,
    state_value: &str,
    chapter_number: i32,
) -> rusqlite::Result<()> {
    let current: Result<String, _> = conn.query_row(
        "SELECT state_value FROM temporal_states
         WHERE entity_id = ?1 AND entity_type = ?2 AND state_key = ?3 AND valid_to_chapter IS NULL
         ORDER BY valid_from_chapter DESC, id DESC LIMIT 1",
        rusqlite::params![entity_id, entity_type, state_key],
        |row| row.get(0),
    );

    if let Ok(v) = current {
        if v == state_value {
            return Ok(());
        }
    }

    conn.execute(
        "UPDATE temporal_states
         SET valid_to_chapter = ?1
         WHERE entity_id = ?2 AND entity_type = ?3 AND state_key = ?4
           AND valid_from_chapter < ?5
           AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?5)",
        rusqlite::params![chapter_number - 1, entity_id, entity_type, state_key, chapter_number],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO temporal_states (entity_id, entity_type, state_key, state_value, valid_from_chapter, valid_to_chapter)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL)",
        rusqlite::params![entity_id, entity_type, state_key, state_value, chapter_number],
    )?;

    Ok(())
}

pub fn init_workspace_db(db_path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(db_path)?;

    {
        let mut stmt = conn.prepare("PRAGMA table_info(app_config)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let cols: Vec<String> = rows.flatten().collect();

        let has_kv = cols.iter().any(|c| c == "key") && cols.iter().any(|c| c == "value");
        let has_api_base_url = cols.iter().any(|c| c == "api_base_url");
        let has_api_key = cols.iter().any(|c| c == "api_key");
        let has_model_name = cols.iter().any(|c| c == "model_name");
        let has_anti_ai_prompt = cols.iter().any(|c| c == "anti_ai_prompt");
        let has_anti_ai_rules_md = cols.iter().any(|c| c == "anti_ai_rules_md");

        if has_kv {
            let mut kv_stmt = conn.prepare("SELECT key, value FROM app_config")?;
            let iter = kv_stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
            let mut kv: HashMap<String, String> = HashMap::new();
            for (k, v) in iter.flatten() {
                kv.insert(k, v);
            }
            let api_key = kv.get("api_key").cloned().unwrap_or_default();
            let api_base_url = kv
                .get("base_url")
                .or_else(|| kv.get("api_base_url"))
                .cloned()
                .unwrap_or_else(|| "https://api.deepseek.com/v1".to_string());
            let model_name = kv.get("model_name").cloned().unwrap_or_else(|| "deepseek-chat".to_string());
            let anti_ai_prompt = kv
                .get("anti_ai_rules_md")
                .or_else(|| kv.get("anti_ai_prompt"))
                .cloned()
                .unwrap_or_default();

            conn.execute("ALTER TABLE app_config RENAME TO app_config_old", [])?;
            conn.execute(
                "CREATE TABLE IF NOT EXISTS app_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    api_base_url TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    anti_ai_prompt TEXT NOT NULL DEFAULT ''
                )",
                [],
            )?;
            conn.execute(
                "INSERT OR REPLACE INTO app_config (id, api_base_url, api_key, model_name, anti_ai_prompt)
                 VALUES (1, ?1, ?2, ?3, ?4)",
                rusqlite::params![api_base_url, api_key, model_name, anti_ai_prompt],
            )?;
            conn.execute("DROP TABLE app_config_old", [])?;
        } else if !cols.is_empty() && has_api_base_url && has_api_key && has_model_name && (!has_anti_ai_prompt || has_anti_ai_rules_md) {
            conn.execute("ALTER TABLE app_config RENAME TO app_config_old", [])?;
            conn.execute(
                "CREATE TABLE IF NOT EXISTS app_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    api_base_url TEXT NOT NULL,
                    api_key TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    anti_ai_prompt TEXT NOT NULL DEFAULT ''
                )",
                [],
            )?;
            if has_anti_ai_rules_md {
                conn.execute(
                    "INSERT OR REPLACE INTO app_config (id, api_base_url, api_key, model_name, anti_ai_prompt)
                     SELECT id, api_base_url, api_key, model_name, COALESCE(anti_ai_rules_md, '') FROM app_config_old",
                    [],
                )?;
            } else {
                conn.execute(
                    "INSERT OR REPLACE INTO app_config (id, api_base_url, api_key, model_name, anti_ai_prompt)
                     SELECT id, api_base_url, api_key, model_name, COALESCE(anti_ai_prompt, '') FROM app_config_old",
                    [],
                )?;
            }
            conn.execute("DROP TABLE app_config_old", [])?;
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            api_base_url TEXT NOT NULL,
            api_key TEXT NOT NULL,
            model_name TEXT NOT NULL,
            anti_ai_prompt TEXT NOT NULL DEFAULT ''
        )",
        [],
    )?;

    // workspace_books table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS workspace_books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            db_file TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_opened DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "INSERT OR IGNORE INTO app_config (id, api_base_url, api_key, model_name) VALUES (1, 'https://api.deepseek.com/v1', '', 'deepseek-chat')",
        [],
    )?;

    let user_version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);
    if user_version < 3 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proposal_type TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                source_chapter INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                confidence REAL NOT NULL DEFAULT 0.6,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_proposals_source ON proposals(source_chapter)", [])?;
        conn.execute("PRAGMA user_version = 3", [])?;
    }

    Ok(conn)
}

pub fn init_book_db(db_path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(db_path)?;

    {
        let mut stmt = conn.prepare("PRAGMA table_info(temporal_states)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let cols: Vec<String> = rows.flatten().collect();
        if !cols.is_empty() && !cols.iter().any(|c| c == "valid_from_chapter") {
            conn.execute("ALTER TABLE temporal_states RENAME TO temporal_states_old", [])?;
            conn.execute(
                "CREATE TABLE IF NOT EXISTS temporal_states (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_id TEXT NOT NULL,
                    entity_type TEXT NOT NULL,
                    state_key TEXT NOT NULL,
                    state_value TEXT NOT NULL,
                    valid_from_chapter INTEGER NOT NULL,
                    valid_to_chapter INTEGER
                )",
                [],
            )?;
            conn.execute(
                "INSERT INTO temporal_states (entity_id, entity_type, state_key, state_value, valid_from_chapter, valid_to_chapter)
                 SELECT entity_name, entity_type, state_key, state_value, chapter_number, NULL FROM temporal_states_old",
                [],
            )?;
            conn.execute("DROP TABLE temporal_states_old", [])?;
        }
    }

    {
        let mut needs_migration = false;
        let mut idx_stmt = conn.prepare("PRAGMA index_list(world_facts_proposals)")?;
        let idx_iter = idx_stmt.query_map([], |row| Ok((row.get::<_, String>(1)?, row.get::<_, i32>(2)?)))?;
        for item in idx_iter.flatten() {
            let (name, unique) = item;
            if unique != 1 {
                continue;
            }
            let mut info_stmt = conn.prepare(&format!("PRAGMA index_info({})", name))?;
            let cols_iter = info_stmt.query_map([], |row| row.get::<_, String>(2))?;
            let cols: Vec<String> = cols_iter.flatten().collect();
            let has_source_chapter = cols.iter().any(|c| c == "source_chapter");
            let has_status = cols.iter().any(|c| c == "status");
            if has_source_chapter && !has_status {
                needs_migration = false;
                break;
            }
            needs_migration = true;
        }
        if needs_migration {
            conn.execute("ALTER TABLE world_facts_proposals RENAME TO world_facts_proposals_old", [])?;
            conn.execute(
                "CREATE TABLE IF NOT EXISTS world_facts_proposals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_type TEXT NOT NULL,
                    entity_name TEXT NOT NULL,
                    fact_key TEXT NOT NULL,
                    fact_value TEXT NOT NULL,
                    confidence REAL NOT NULL DEFAULT 0.3,
                    source_chapter INTEGER NOT NULL,
                    source_span TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(entity_type, entity_name, fact_key, source_chapter)
                )",
                [],
            )?;
            conn.execute(
                "INSERT OR IGNORE INTO world_facts_proposals (id, entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status, created_at)
                 SELECT id, entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status, created_at
                 FROM world_facts_proposals_old
                 WHERE status = 'accepted'",
                [],
            )?;
            conn.execute(
                "INSERT OR IGNORE INTO world_facts_proposals (id, entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status, created_at)
                 SELECT id, entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status, created_at
                 FROM world_facts_proposals_old
                 WHERE status = 'pending'",
                [],
            )?;
            conn.execute(
                "INSERT OR IGNORE INTO world_facts_proposals (id, entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status, created_at)
                 SELECT id, entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status, created_at
                 FROM world_facts_proposals_old
                 WHERE status = 'rejected'",
                [],
            )?;
            conn.execute("DROP TABLE world_facts_proposals_old", [])?;
        }
    }
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS book_meta (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            title TEXT NOT NULL,
            genre TEXT NOT NULL,
            logline TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS book_settings (
            key TEXT NOT NULL PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_number INTEGER NOT NULL UNIQUE,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            outline TEXT NOT NULL,
            status TEXT NOT NULL,
            draft_raw TEXT NOT NULL DEFAULT ''
        )",
        [],
    )?;

    {
        let mut stmt = conn.prepare("PRAGMA table_info(chapters)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        let cols: Vec<String> = rows.flatten().collect();
        if !cols.iter().any(|c| c == "draft_raw") {
            conn.execute("ALTER TABLE chapters ADD COLUMN draft_raw TEXT NOT NULL DEFAULT ''", [])?;
        }
    }

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chapter_compliance_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_number INTEGER NOT NULL,
            overall TEXT NOT NULL,
            report_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chapter_compliance_chapter ON chapter_compliance_reports(chapter_number)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_chapter_compliance_overall ON chapter_compliance_reports(overall)", [])?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS character_bibles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            core_belief TEXT NOT NULL,
            catchphrase TEXT NOT NULL,
            forbidden_knowledge TEXT NOT NULL,
            viewpoint_interception TEXT NOT NULL DEFAULT ''
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS world_locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS world_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS temporal_states (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            state_key TEXT NOT NULL,
            state_value TEXT NOT NULL,
            valid_from_chapter INTEGER NOT NULL,
            valid_to_chapter INTEGER
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS pending_hooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hook_desc TEXT NOT NULL,
            created_at_chapter INTEGER NOT NULL,
            staleness INTEGER NOT NULL DEFAULT 0,
            is_resolved BOOLEAN NOT NULL DEFAULT 0,
            resolved_at_chapter INTEGER
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS hook_process_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_number INTEGER NOT NULL,
            action TEXT NOT NULL,
            hook_desc TEXT NOT NULL,
            reason TEXT NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS review_cache (
            chapter_number INTEGER PRIMARY KEY,
            outline_hash TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            is_passed BOOLEAN NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chapter_review_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_number INTEGER NOT NULL,
            review_json TEXT NOT NULL,
            passed BOOLEAN NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chapter_valence (
            chapter_number INTEGER PRIMARY KEY,
            start_valence INTEGER NOT NULL,
            end_valence INTEGER NOT NULL
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS consequence_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_number INTEGER NOT NULL,
            upgrade_desc TEXT NOT NULL,
            consequence_hook TEXT NOT NULL,
            is_resolved BOOLEAN NOT NULL DEFAULT 0,
            resolved_at_chapter INTEGER
        )",
        [],
    )?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS world_facts_proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_name TEXT NOT NULL,
            fact_key TEXT NOT NULL,
            fact_value TEXT NOT NULL,
            confidence REAL NOT NULL DEFAULT 0.3,
            source_chapter INTEGER NOT NULL,
            source_span TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(entity_type, entity_name, fact_key, source_chapter)
        )",
        [],
    )?;

    let mut user_version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);
    if user_version < 2 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS book_plan_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                status TEXT NOT NULL DEFAULT 'draft',
                stage_size INTEGER NOT NULL DEFAULT 100,
                first_generate_chapters INTEGER NOT NULL DEFAULT 400,
                book_input_json TEXT NOT NULL DEFAULT '{}',
                cast_json TEXT NOT NULL DEFAULT '[]',
                system_json TEXT NOT NULL DEFAULT '{}',
                meta_json TEXT NOT NULL DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS stage_plan (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_id INTEGER NOT NULL,
                stage_id INTEGER NOT NULL,
                start_chapter INTEGER NOT NULL,
                end_chapter INTEGER NOT NULL,
                stage_goal TEXT NOT NULL DEFAULT '',
                main_conflict TEXT NOT NULL DEFAULT '',
                turning_point TEXT NOT NULL DEFAULT '',
                climax TEXT NOT NULL DEFAULT '',
                settlement TEXT NOT NULL DEFAULT '',
                threads_json TEXT NOT NULL DEFAULT '[]',
                cast_focus_json TEXT NOT NULL DEFAULT '[]',
                system_usage TEXT NOT NULL DEFAULT '',
                UNIQUE(version_id, stage_id)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS chapter_outline_one_liners_current (
                chapter_number INTEGER PRIMARY KEY,
                one_liner TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                cast_refs_json TEXT NOT NULL DEFAULT '[]',
                thread_refs_json TEXT NOT NULL DEFAULT '[]',
                locked BOOLEAN NOT NULL DEFAULT 0,
                source_version_id INTEGER,
                source_batch_id INTEGER,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS chapter_outline_one_liners_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_id INTEGER NOT NULL,
                chapter_number INTEGER NOT NULL,
                one_liner TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                cast_refs_json TEXT NOT NULL DEFAULT '[]',
                thread_refs_json TEXT NOT NULL DEFAULT '[]',
                locked BOOLEAN NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(version_id, chapter_number)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS outline_checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version_id INTEGER,
                start_chapter INTEGER NOT NULL,
                end_chapter INTEGER NOT NULL,
                checkpoint_json TEXT NOT NULL DEFAULT '{}',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(version_id, start_chapter, end_chapter)
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS characters_core (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                role_type TEXT NOT NULL DEFAULT '',
                soul_core_json TEXT NOT NULL DEFAULT '{}',
                notes TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS character_soul_timeline (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_name TEXT NOT NULL,
                valid_from_chapter INTEGER NOT NULL,
                valid_to_chapter INTEGER,
                soul_state_json TEXT NOT NULL DEFAULT '{}',
                reason_span TEXT NOT NULL DEFAULT '',
                source TEXT NOT NULL DEFAULT 'ai',
                confidence REAL NOT NULL DEFAULT 0.6,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS character_relations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_name TEXT NOT NULL,
                target_name TEXT NOT NULL,
                relation_type TEXT NOT NULL DEFAULT '',
                strength INTEGER NOT NULL DEFAULT 3,
                valid_from_chapter INTEGER NOT NULL DEFAULT 1,
                valid_to_chapter INTEGER,
                note TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS story_threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_key TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL DEFAULT 'sub',
                title TEXT NOT NULL,
                goal TEXT NOT NULL DEFAULT '',
                stakes TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'todo',
                owner_characters_json TEXT NOT NULL DEFAULT '[]',
                start_chapter INTEGER,
                end_chapter INTEGER,
                milestones_json TEXT NOT NULL DEFAULT '[]',
                notes TEXT NOT NULL DEFAULT '',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        conn.execute("PRAGMA user_version = 2", [])?;
        user_version = 2;
    }

    if user_version < 3 {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS proposals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                proposal_type TEXT NOT NULL,
                payload_json TEXT NOT NULL DEFAULT '{}',
                source_chapter INTEGER,
                status TEXT NOT NULL DEFAULT 'pending',
                confidence REAL NOT NULL DEFAULT 0.6,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_proposals_source ON proposals(source_chapter)", [])?;
        conn.execute("PRAGMA user_version = 3", [])?;
    }

    Ok(conn)
}

pub fn maybe_restore_workspace_config_from_book(
    workspace_conn: &Connection,
    book_conn_opt: Option<&Connection>,
) -> Result<bool, rusqlite::Error> {
    let Some(book_conn) = book_conn_opt else {
        return Ok(false);
    };

    let (w_api_base_url, w_api_key, w_model_name, w_anti_ai_prompt): (String, String, String, String) =
        workspace_conn
            .query_row(
                "SELECT api_base_url, api_key, model_name, anti_ai_prompt FROM app_config WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap_or_else(|_| (String::new(), String::new(), String::new(), String::new()));

    if !w_api_key.trim().is_empty() {
        return Ok(false);
    }

    let has_table: bool = book_conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_config')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);
    if !has_table {
        return Ok(false);
    }

    let cols: Vec<String> = {
        let mut stmt = book_conn.prepare("PRAGMA table_info(app_config)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        rows.flatten().collect()
    };

    let has_kv = cols.iter().any(|c| c == "key") && cols.iter().any(|c| c == "value");

    let (b_api_base_url, b_api_key, b_model_name, b_anti_ai_prompt): (String, String, String, String) = if has_kv {
        let mut kv_stmt = book_conn.prepare("SELECT key, value FROM app_config")?;
        let iter = kv_stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?;
        let mut kv: HashMap<String, String> = HashMap::new();
        for (k, v) in iter.flatten() {
            kv.insert(k, v);
        }
        let api_key = kv.get("api_key").cloned().unwrap_or_default();
        let api_base_url = kv
            .get("base_url")
            .or_else(|| kv.get("api_base_url"))
            .cloned()
            .unwrap_or_default();
        let model_name = kv.get("model_name").cloned().unwrap_or_default();
        let anti_ai_prompt = kv
            .get("anti_ai_rules_md")
            .or_else(|| kv.get("anti_ai_prompt"))
            .cloned()
            .unwrap_or_default();
        (api_base_url, api_key, model_name, anti_ai_prompt)
    } else {
        let has_api_base_url = cols.iter().any(|c| c == "api_base_url");
        let has_api_key = cols.iter().any(|c| c == "api_key");
        let has_model_name = cols.iter().any(|c| c == "model_name");
        if !(has_api_base_url && has_api_key && has_model_name) {
            return Ok(false);
        }
        let has_anti_ai_prompt = cols.iter().any(|c| c == "anti_ai_prompt");
        let has_anti_ai_rules_md = cols.iter().any(|c| c == "anti_ai_rules_md");

        if has_anti_ai_prompt {
            book_conn.query_row(
                "SELECT api_base_url, api_key, model_name, anti_ai_prompt FROM app_config WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )?
        } else if has_anti_ai_rules_md {
            book_conn.query_row(
                "SELECT api_base_url, api_key, model_name, anti_ai_rules_md FROM app_config WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )?
        } else {
            book_conn.query_row(
                "SELECT api_base_url, api_key, model_name, '' FROM app_config WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )?
        }
    };

    if b_api_key.trim().is_empty() {
        return Ok(false);
    }

    let final_api_base_url = if b_api_base_url.trim().is_empty() {
        w_api_base_url
    } else {
        b_api_base_url
    };
    let final_model_name = if b_model_name.trim().is_empty() {
        w_model_name
    } else {
        b_model_name
    };
    let final_anti_ai_prompt = if b_anti_ai_prompt.trim().is_empty() {
        w_anti_ai_prompt
    } else {
        b_anti_ai_prompt
    };

    workspace_conn.execute(
        "INSERT OR REPLACE INTO app_config (id, api_base_url, api_key, model_name, anti_ai_prompt) VALUES (1, ?1, ?2, ?3, ?4)",
        rusqlite::params![final_api_base_url, b_api_key, final_model_name, final_anti_ai_prompt],
    )?;

    Ok(true)
}

#[tauri::command]
pub fn get_active_hooks(state: State<DbState>, current_chapter: i32) -> Result<Vec<String>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    refresh_hook_staleness(conn, current_chapter).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT DISTINCT hook_desc, staleness FROM pending_hooks WHERE is_resolved = FALSE AND staleness >= 3")
        .map_err(|e| e.to_string())?;

    let hook_iter = stmt.query_map([], |row| {
        let desc: String = row.get(0)?;
        let stale: i32 = row.get(1)?;
        Ok(format!("{} (滞后 {} 章)", desc, stale))
    }).map_err(|e| e.to_string())?;

    let mut hooks = Vec::new();
    for hook in hook_iter.flatten() {
        hooks.push(hook);
    }
    
    Ok(hooks)
}

#[tauri::command]
pub fn get_pending_hooks(state: State<DbState>, current_chapter: i32) -> Result<Vec<PendingHook>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    refresh_hook_staleness(conn, current_chapter).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, hook_desc, created_at_chapter, staleness, is_resolved, resolved_at_chapter FROM pending_hooks WHERE is_resolved = FALSE ORDER BY created_at_chapter ASC, id ASC")
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map([], |row| {
            Ok(PendingHook {
                id: row.get(0)?,
                hook_desc: row.get(1)?,
                created_at_chapter: row.get(2)?,
                staleness: row.get(3)?,
                is_resolved: row.get(4)?,
                resolved_at_chapter: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for i in iter {
        if let Ok(h) = i {
            list.push(h);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn set_hook_resolved(state: State<DbState>, hook_id: i32, resolved: bool, current_chapter: i32) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    if resolved {
        conn.execute(
            "UPDATE pending_hooks SET is_resolved = TRUE, resolved_at_chapter = ?1 WHERE id = ?2",
            rusqlite::params![current_chapter, hook_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE pending_hooks SET is_resolved = FALSE, resolved_at_chapter = NULL WHERE id = ?1",
            rusqlite::params![hook_id],
        )
        .map_err(|e| e.to_string())?;
    }
    refresh_hook_staleness(conn, current_chapter).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn cleanup_pending_hooks(state: State<DbState>, current_chapter: i32) -> Result<i64, String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;

    let banned_fragments = [
        "供桌", "暗格", "一角", "锁链", "拖动", "青烟", "落处", "吸噬", "细微", "砖下", "血线", "渗入", "露出",
    ];
    let must_keywords = [
        "身份", "真相", "阴谋", "幕后", "来历", "副作用", "惩罚", "法则", "追踪", "时限", "代价", "禁制", "传承", "印记", "隐患", "反噬",
    ];

    let to_delete: Vec<i32> = {
        let mut stmt = conn
            .prepare("SELECT id, hook_desc FROM pending_hooks WHERE is_resolved = FALSE")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;

        let mut ids: Vec<i32> = Vec::new();
        for item in iter {
            let (id, desc) = item.map_err(|e| e.to_string())?;
            let len = desc.chars().count();
            let has_banned = banned_fragments.iter().any(|b| desc.contains(b));
            let has_must = must_keywords.iter().any(|k| desc.contains(k));
            let has_punct = desc.contains('，')
                || desc.contains('。')
                || desc.contains('！')
                || desc.contains('？')
                || desc.contains('?')
                || desc.contains('；')
                || desc.contains(';');

            if has_banned {
                ids.push(id);
                continue;
            }
            if (len > 30 || has_punct) && !has_must {
                ids.push(id);
                continue;
            }
        }
        ids
    };

    let mut deleted: i64 = 0;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut del_stmt = tx.prepare("DELETE FROM pending_hooks WHERE id = ?1").map_err(|e| e.to_string())?;
        for id in to_delete {
            deleted += del_stmt.execute([id]).map_err(|e| e.to_string())? as i64;
        }
    }
    refresh_hook_staleness(&tx, current_chapter).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(deleted)
}

#[tauri::command]
pub fn cleanup_consequence_ledger(state: State<DbState>) -> Result<i64, String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let deleted = tx
        .execute(
            "
            DELETE FROM consequence_ledger
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM consequence_ledger
                GROUP BY COALESCE(TRIM(upgrade_desc), ''), COALESCE(TRIM(consequence_hook), ''), COALESCE(is_resolved, 0)
            )
            ",
            [],
        )
        .map_err(|e| e.to_string())? as i64;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(deleted)
}

pub fn get_config_internal(state: &State<'_, DbState>) -> Result<AppConfig, String> {
    let conn = state.workspace_conn.lock().unwrap();
    let (api_key, base_url, model_name, anti_ai_rules_md) = conn
        .query_row(
            "SELECT api_key, api_base_url, model_name, anti_ai_prompt FROM app_config WHERE id = 1",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
        )
        .unwrap_or_else(|_| (String::new(), String::new(), String::new(), String::new()));

    Ok(AppConfig {
        api_key,
        base_url,
        model_name,
        anti_ai_rules_md,
    })
}

// 测试连通性
#[tauri::command]
pub async fn test_llm_connection(api_key: String, base_url: String, model_name: String) -> Result<String, String> {
    let llm = crate::llm::LlmClient::new(api_key, base_url, model_name);
    llm.test_connection().await.map_err(|e| e.to_string())
}

// 获取配置
#[tauri::command]
pub fn get_config(state: State<DbState>) -> Result<AppConfig, String> {
    get_config_internal(&state).map_err(|e| e.to_string())
}

pub fn get_valence_bias(conn: &Connection, current_chapter: i32) -> Result<i32, rusqlite::Error> {
    let mut stmt = conn.prepare("SELECT valence FROM chapter_valence WHERE chapter_number < ? ORDER BY chapter_number DESC LIMIT 2")?;
    let mut rows = stmt.query([current_chapter])?;
    let mut sum = 0;
    while let Some(row) = rows.next()? {
        let v: i32 = row.get(0)?;
        sum += v;
    }
    Ok(sum)
}

pub fn add_consequence(conn: &Connection, chapter_number: i32, upgrade_desc: &str, consequence_hook: &str) -> Result<(), rusqlite::Error> {
    conn.execute("INSERT INTO consequence_ledger (chapter_number, upgrade_desc, consequence_hook) VALUES (?, ?, ?)",
        rusqlite::params![chapter_number, upgrade_desc, consequence_hook])?;
    Ok(())
}

// 保存配置
#[tauri::command]
pub fn save_config(state: State<DbState>, config: AppConfig) -> Result<(), String> {
    let conn = state.workspace_conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO app_config (id, api_base_url, api_key, model_name, anti_ai_prompt) VALUES (1, ?1, ?2, ?3, ?4)",
        rusqlite::params![config.base_url, config.api_key, config.model_name, config.anti_ai_rules_md],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- Data Management Commands ---
pub fn get_book_meta_internal(state: &State<'_, DbState>) -> Result<BookMeta, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn.prepare("SELECT title, genre, logline, '' as full_outline FROM book_meta WHERE id = 1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(BookMeta {
            title: row.get(0).map_err(|e| e.to_string())?,
            genre: row.get(1).map_err(|e| e.to_string())?,
            logline: row.get(2).map_err(|e| e.to_string())?,
            full_outline: String::new(),
        })
    } else {
        Ok(BookMeta {
            title: String::new(),
            genre: String::new(),
            logline: String::new(),
            full_outline: String::new(),
        })
    }
}

#[tauri::command]
pub fn get_book_meta(state: State<DbState>) -> Result<BookMeta, String> {
    get_book_meta_internal(&state).map_err(|e| e.to_string())
}

pub(crate) fn get_active_plan_version_id_internal(conn: &Connection) -> Option<i32> {
    conn.query_row(
        "SELECT value FROM book_settings WHERE key = 'active_plan_version_id' LIMIT 1",
        [],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| s.trim().parse::<i32>().ok())
    .filter(|v| *v > 0)
}

#[tauri::command]
pub fn get_active_plan_version_id(state: State<DbState>) -> Result<Option<i32>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    Ok(get_active_plan_version_id_internal(conn))
}

#[tauri::command]
pub fn set_active_plan_version_id(state: State<DbState>, version_id: i32) -> Result<(), String> {
    let version_id = version_id.max(0);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    if version_id <= 0 {
        conn.execute("DELETE FROM book_settings WHERE key = 'active_plan_version_id'", [])
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    conn.execute(
        "INSERT OR REPLACE INTO book_settings (key, value) VALUES ('active_plan_version_id', ?1)",
        [version_id.to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}


#[derive(serde::Serialize, serde::Deserialize)]
pub struct WorkspaceBook {
    pub id: i32,
    pub title: String,
    pub db_file: String,
    pub created_at: String,
    pub last_opened: String,
}

#[tauri::command]
pub fn get_workspace_books(state: tauri::State<DbState>) -> Result<Vec<WorkspaceBook>, String> {
    let conn = state.workspace_conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id, title, db_file, created_at, last_opened FROM workspace_books ORDER BY last_opened DESC").map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(WorkspaceBook {
            id: row.get(0)?,
            title: row.get(1)?,
            db_file: row.get(2)?,
            created_at: row.get(3)?,
            last_opened: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut books = Vec::new();
    for b in iter.flatten() {
        books.push(b);
    }
    Ok(books)
}

#[tauri::command]
pub fn switch_workspace_book(state: tauri::State<DbState>, id: i32) -> Result<(), String> {
    let w_conn = state.workspace_conn.lock().unwrap();
    
    w_conn.execute(
        "UPDATE workspace_books SET last_opened = CURRENT_TIMESTAMP WHERE id = ?1",
        [id],
    ).map_err(|e| e.to_string())?;

    let db_file: String = w_conn.query_row(
        "SELECT db_file FROM workspace_books WHERE id = ?1",
        [id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let db_path = state.app_data_dir.join("books").join(&db_file);
    let book_db = init_book_db(&db_path).map_err(|e| e.to_string())?;

    let mut lock = state.book_conn.lock().unwrap();
    *lock = Some(book_db);

    Ok(())
}

#[tauri::command]
pub fn create_workspace_book(state: tauri::State<DbState>, title: String, genre: String, logline: String) -> Result<i32, String> {
    let w_conn = state.workspace_conn.lock().unwrap();
    
    let db_file = format!("book_{}.db", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    
    w_conn.execute(
        "INSERT INTO workspace_books (title, db_file) VALUES (?1, ?2)",
        rusqlite::params![title, db_file],
    ).map_err(|e| e.to_string())?;

    let new_id = w_conn.last_insert_rowid() as i32;

    let db_path = state.app_data_dir.join("books").join(&db_file);
    std::fs::create_dir_all(state.app_data_dir.join("books")).map_err(|e| e.to_string())?;

    let book_db = init_book_db(&db_path).map_err(|e| e.to_string())?;
    book_db.execute(
        "INSERT OR REPLACE INTO book_meta (id, title, genre, logline) VALUES (1, ?1, ?2, ?3)",
        rusqlite::params![title, genre, logline],
    ).map_err(|e| e.to_string())?;

    let mut lock = state.book_conn.lock().unwrap();
    *lock = Some(book_db);

    Ok(new_id)
}

#[tauri::command]
pub fn delete_workspace_book(state: tauri::State<DbState>, id: i32, delete_file: Option<bool>) -> Result<(), String> {
    let delete_file = delete_file.unwrap_or(true);

    let (db_file, current_id, fallback_id) = {
        let w_conn = state.workspace_conn.lock().unwrap();

        let db_file: String = w_conn
            .query_row(
                "SELECT db_file FROM workspace_books WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        let current_id: Option<i32> = w_conn
            .query_row(
                "SELECT id FROM workspace_books ORDER BY last_opened DESC, id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .ok();

        let fallback_id: Option<i32> = w_conn
            .query_row(
                "SELECT id FROM workspace_books WHERE id <> ?1 ORDER BY last_opened DESC, id DESC LIMIT 1",
                [id],
                |row| row.get(0),
            )
            .ok();

        (db_file, current_id, fallback_id)
    };

    if current_id == Some(id) {
        let Some(fid) = fallback_id else {
            return Err("不能删除最后一本书。请先创建另一本文档/项目后再删除。".to_string());
        };

        let w_conn = state.workspace_conn.lock().unwrap();
        w_conn
            .execute(
                "UPDATE workspace_books SET last_opened = CURRENT_TIMESTAMP WHERE id = ?1",
                [fid],
            )
            .map_err(|e| e.to_string())?;
        drop(w_conn);

        let fallback_db_file: String = {
            let w_conn = state.workspace_conn.lock().unwrap();
            w_conn
                .query_row(
                    "SELECT db_file FROM workspace_books WHERE id = ?1",
                    [fid],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?
        };

        let db_path = state.app_data_dir.join("books").join(&fallback_db_file);
        let book_db = init_book_db(&db_path).map_err(|e| e.to_string())?;
        let mut lock = state.book_conn.lock().unwrap();
        *lock = Some(book_db);
    }

    {
        let w_conn = state.workspace_conn.lock().unwrap();
        w_conn
            .execute("DELETE FROM workspace_books WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
    }

    if delete_file {
        let db_file = db_file.trim().to_string();
        if db_file.contains('/') || db_file.contains('\\') {
            return Err("非法 db_file".to_string());
        }
        let db_path = state.app_data_dir.join("books").join(&db_file);
        if db_path.exists() {
            std::fs::remove_file(&db_path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}


#[tauri::command]
pub fn get_recent_chapters_context(conn: &Connection, current_chapter_num: i32, limit: i32) -> Result<String> {
    let mut stmt = conn.prepare("SELECT title, outline FROM chapters WHERE chapter_number < ? ORDER BY chapter_number DESC LIMIT ?")?;
    let chapter_iter = stmt.query_map(rusqlite::params![current_chapter_num, limit], |row| {
        let title: String = row.get(0)?;
        let outline: String = row.get(1)?;
        Ok((title, outline))
    })?;

    let mut context_parts = Vec::new();
    for chapter in chapter_iter {
        let (title, outline) = chapter?;
        context_parts.push(format!("标题：{}\n大纲：{}", title, outline));
    }
    
    // We got them in descending order, so reverse to chronological
    context_parts.reverse();
    Ok(context_parts.join("\n\n"))
}

#[tauri::command]
pub fn get_planning_context(
    state: State<DbState>,
    chapter_number: i32,
    version_id: Option<i32>,
    recent_chapter_count: Option<i32>,
    open_hooks_limit: Option<i32>,
) -> Result<PlanningContext, String> {
    let recent_chapter_count = recent_chapter_count.unwrap_or(3).max(0);
    let open_hooks_limit = open_hooks_limit.unwrap_or(10).max(0);

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let mut warnings: Vec<String> = Vec::new();
    let version_id = version_id.or_else(|| get_active_plan_version_id_internal(conn));

    let book = conn
        .query_row(
            "SELECT title, genre, logline FROM book_meta WHERE id = 1",
            [],
            |row| {
                Ok(BookMeta {
                    title: row.get(0)?,
                    genre: row.get(1)?,
                    logline: row.get(2)?,
                    full_outline: "".to_string(),
                })
            },
        )
        .unwrap_or(BookMeta {
            title: "".to_string(),
            genre: "".to_string(),
            logline: "".to_string(),
            full_outline: "".to_string(),
        });

    let plan = {
        let row = conn.query_row(
            "SELECT one_liner, tags_json, cast_refs_json, thread_refs_json, locked, COALESCE(updated_at, '') 
             FROM chapter_outline_one_liners_current
             WHERE chapter_number = ?1",
            rusqlite::params![chapter_number],
            |row| {
                let tags_json: String = row.get(1)?;
                let cast_refs_json: String = row.get(2)?;
                let thread_refs_json: String = row.get(3)?;
                Ok(PlanningContextPlan {
                    one_liner: row.get(0)?,
                    tags: serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default(),
                    cast_refs: serde_json::from_str::<Vec<String>>(&cast_refs_json).unwrap_or_default(),
                    thread_refs: serde_json::from_str::<Vec<String>>(&thread_refs_json).unwrap_or_default(),
                    locked: row.get::<_, i32>(4)? == 1,
                    updated_at: row.get(5)?,
                })
            },
        );
        match row {
            Ok(p) => {
                if p.one_liner.trim().is_empty() {
                    warnings.push("plan.one_liner 为空：写章无法执行规划锚定".to_string());
                }
                p
            }
            Err(_) => {
                warnings.push("缺少 plan 记录：chapter_outline_one_liners_current 未包含本章".to_string());
                PlanningContextPlan {
                    one_liner: "".to_string(),
                    tags: Vec::new(),
                    cast_refs: Vec::new(),
                    thread_refs: Vec::new(),
                    locked: false,
                    updated_at: "".to_string(),
                }
            }
        }
    };

    let checkpoint = {
        let sql = if version_id.is_some() {
            "SELECT id, version_id, start_chapter, end_chapter, checkpoint_json, created_at
             FROM outline_checkpoints
             WHERE version_id = ?1 AND end_chapter <= ?2
             ORDER BY end_chapter DESC, id DESC
             LIMIT 1"
        } else {
            "SELECT id, version_id, start_chapter, end_chapter, checkpoint_json, created_at
             FROM outline_checkpoints
             WHERE end_chapter <= ?1
             ORDER BY end_chapter DESC, id DESC
             LIMIT 1"
        };

        let res: Result<PlanningContextCheckpoint, rusqlite::Error> = if let Some(vid) = version_id {
            conn.query_row(sql, rusqlite::params![vid, chapter_number - 1], |row| {
                let s: String = row.get(4)?;
                Ok(PlanningContextCheckpoint {
                    id: row.get(0)?,
                    version_id: row.get(1)?,
                    start_chapter: row.get(2)?,
                    end_chapter: row.get(3)?,
                    checkpoint: serde_json::from_str(&s).unwrap_or(serde_json::json!({})),
                    created_at: row.get(5).unwrap_or_else(|_| "".to_string()),
                })
            })
        } else {
            conn.query_row(sql, rusqlite::params![chapter_number - 1], |row| {
                let s: String = row.get(4)?;
                Ok(PlanningContextCheckpoint {
                    id: row.get(0)?,
                    version_id: row.get(1)?,
                    start_chapter: row.get(2)?,
                    end_chapter: row.get(3)?,
                    checkpoint: serde_json::from_str(&s).unwrap_or(serde_json::json!({})),
                    created_at: row.get(5).unwrap_or_else(|_| "".to_string()),
                })
            })
        };

        match res {
            Ok(c) => Some(c),
            Err(_) => {
                warnings.push("缺少 checkpoint：长篇一致性风险上升".to_string());
                None
            }
        }
    };

    let recent_context = if recent_chapter_count <= 0 {
        "".to_string()
    } else {
        get_recent_chapters_context(conn, chapter_number, recent_chapter_count).unwrap_or_default()
    };

    let open_hooks = if open_hooks_limit <= 0 {
        Vec::new()
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, hook_desc, created_at_chapter, staleness, is_resolved, resolved_at_chapter
                 FROM pending_hooks
                 WHERE is_resolved = 0
                 ORDER BY staleness DESC, created_at_chapter ASC, id ASC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([open_hooks_limit], |row| {
                Ok(PendingHook {
                    id: row.get(0)?,
                    hook_desc: row.get(1)?,
                    created_at_chapter: row.get(2)?,
                    staleness: row.get(3)?,
                    is_resolved: row.get::<_, i32>(4)? == 1,
                    resolved_at_chapter: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut list = Vec::new();
        for item in iter.flatten() {
            list.push(item);
        }
        list
    };

    Ok(PlanningContext {
        chapter_number,
        version_id,
        book,
        plan,
        checkpoint,
        recent_context,
        open_hooks,
        warnings,
    })
}

#[tauri::command]
pub fn get_chapters(state: State<DbState>) -> Result<Vec<Chapter>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare("SELECT id, chapter_number, title, outline, content, draft_raw, status FROM chapters ORDER BY chapter_number ASC")
        .map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(Chapter {
            id: row.get(0)?,
            chapter_number: row.get(1)?,
            title: row.get(2)?,
            outline: row.get(3)?,
            content: row.get(4)?,
            draft_raw: row.get(5)?,
            status: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for i in iter {
        if let Ok(c) = i {
            list.push(c);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn save_chapter_content(state: State<DbState>, chapter_number: i32, content: String) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("UPDATE chapters SET content = ?1 WHERE chapter_number = ?2", rusqlite::params![content, chapter_number])
        .map_err(|e| e.to_string())?;
    refresh_hook_staleness(conn, chapter_number).map_err(|e| e.to_string())?;
    auto_resolve_hooks_from_content(conn, chapter_number, &content).map_err(|e| e.to_string())?;
    propose_world_entities_from_text(conn, chapter_number, &content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_chapter_draft_raw(state: State<DbState>, chapter_number: i32, draft_raw: String) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "UPDATE chapters SET draft_raw = ?1 WHERE chapter_number = ?2",
        rusqlite::params![draft_raw, chapter_number],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_chapter_title(state: State<DbState>, chapter_number: i32, title: String) -> Result<(), String> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Ok(());
    }
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "UPDATE chapters SET title = ?1 WHERE chapter_number = ?2",
        rusqlite::params![title, chapter_number],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_draft_block(raw: &str, tag: &str) -> String {
    let re = Regex::new(&format!(r"(?m)===\s*{}\s*===\s*([\s\S]*?)(?=\n===\s*[A-Z_]+\s*===|\z)", regex::escape(tag))).unwrap();
    re.captures(raw)
        .and_then(|cap| cap.get(1).map(|m| m.as_str().trim().to_string()))
        .unwrap_or_else(|| "".to_string())
}

fn parse_pre_write_check_table(md: &str) -> (Vec<String>, HashMap<String, HashMap<String, String>>) {
    let mut cols: Vec<String> = Vec::new();
    let mut rows: HashMap<String, HashMap<String, String>> = HashMap::new();

    let lines = md
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect::<Vec<String>>();

    let header_idx = lines.iter().position(|l| l.starts_with('|') && l.ends_with('|'));
    if header_idx.is_none() {
        return (cols, rows);
    }
    let h = header_idx.unwrap();
    if h + 1 >= lines.len() {
        return (cols, rows);
    }
    let header = lines[h].trim_matches('|');
    cols = header.split('|').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();

    let mut i = h + 2;
    while i < lines.len() {
        let line = &lines[i];
        if !line.starts_with('|') {
            i += 1;
            continue;
        }
        let parts = line.trim_matches('|').split('|').map(|s| s.trim().to_string()).collect::<Vec<String>>();
        if parts.is_empty() {
            i += 1;
            continue;
        }
        let item = parts.get(0).cloned().unwrap_or_default();
        if item.is_empty() {
            i += 1;
            continue;
        }
        let mut m: HashMap<String, String> = HashMap::new();
        for (idx, col) in cols.iter().enumerate() {
            if let Some(v) = parts.get(idx) {
                m.insert(col.clone(), v.clone());
            }
        }
        rows.insert(item, m);
        i += 1;
    }
    (cols, rows)
}

#[tauri::command]
pub fn compute_compliance_report(state: State<DbState>, chapter_number: i32, draft_raw: String) -> Result<serde_json::Value, String> {
    let planning = get_planning_context(state.clone(), chapter_number, None, Some(3), Some(10))?;

    let pre = extract_draft_block(&draft_raw, "PRE_WRITE_CHECK");
    let title = extract_draft_block(&draft_raw, "CHAPTER_TITLE");
    let content = extract_draft_block(&draft_raw, "CHAPTER_CONTENT");

    let has_pre = !pre.trim().is_empty();
    let has_title = !title.trim().is_empty();
    let has_content = !content.trim().is_empty();

    let (cols, table) = parse_pre_write_check_table(&pre);
    let cols_ok = cols.iter().any(|c| c == "检查项")
        && cols.iter().any(|c| c == "本章记录")
        && cols.iter().any(|c| c == "证据/定位")
        && cols.iter().any(|c| c == "结果");

    let required_rows = vec![
        "规划锚定",
        "Checkpoint 一致性",
        "线程推进",
        "伏笔闭环",
        "命名一致性",
        "风险扫描",
    ];
    let required_rows_ok = required_rows.iter().all(|k| table.contains_key(*k));

    let open_hook_ids = planning.open_hooks.iter().map(|h| h.id).collect::<Vec<i32>>();
    let thread_refs = planning.plan.thread_refs.clone();

    let hook_ids_used = {
        let re = Regex::new(r"hook_id:(\d+)").unwrap();
        let mut ids = Vec::new();
        for cap in re.captures_iter(&pre) {
            if let Ok(v) = cap.get(1).unwrap().as_str().parse::<i32>() {
                ids.push(v);
            }
        }
        ids
    };

    let thread_tags_used = {
        let re = Regex::new(r"thread:([A-Za-z0-9_]+)").unwrap();
        let mut keys = Vec::new();
        for cap in re.captures_iter(&pre) {
            keys.push(cap.get(1).unwrap().as_str().to_string());
        }
        keys
    };

    let format_contract_fail = !(has_pre && has_title && has_content && cols_ok && required_rows_ok);

    let plan_alignment_fail = planning.plan.one_liner.trim().is_empty()
        || table
            .get("规划锚定")
            .and_then(|m| m.get("本章记录"))
            .map(|v| !v.contains("one_liner:"))
            .unwrap_or(true);

    let checkpoint_fail = table
        .get("Checkpoint 一致性")
        .and_then(|m| m.get("证据/定位"))
        .map(|v| v.contains("violated:"))
        .unwrap_or(false)
        || table
            .get("Checkpoint 一致性")
            .and_then(|m| m.get("结果"))
            .map(|v| v == "FAIL")
            .unwrap_or(false);

    let hook_close_fail = !open_hook_ids.is_empty() && hook_ids_used.is_empty();
    let hook_id_illegal = hook_ids_used.iter().any(|id| !open_hook_ids.contains(id)) && !open_hook_ids.is_empty();

    let thread_advance_warn = !thread_refs.is_empty() && thread_tags_used.is_empty();

    let mut checks: Vec<serde_json::Value> = Vec::new();
    checks.push(serde_json::json!({
        "key": "format_contract",
        "name": "输出格式契约",
        "status": if format_contract_fail { "FAIL" } else { "PASS" },
        "severity": "error",
        "evidence": {
            "has_pre_write_check": has_pre,
            "has_chapter_title": has_title,
            "has_chapter_content": has_content,
            "table_columns_ok": cols_ok,
            "required_rows_ok": required_rows_ok
        }
    }));
    checks.push(serde_json::json!({
        "key": "plan_alignment",
        "name": "规划锚定",
        "status": if plan_alignment_fail { "FAIL" } else { "PASS" },
        "severity": "error",
        "evidence": { "locked": planning.plan.locked, "one_liner": planning.plan.one_liner }
    }));
    checks.push(serde_json::json!({
        "key": "checkpoint_consistency",
        "name": "Checkpoint 一致性",
        "status": if checkpoint_fail { "FAIL" } else { "PASS" },
        "severity": "error",
        "evidence": { "has_checkpoint": planning.checkpoint.is_some() }
    }));
    checks.push(serde_json::json!({
        "key": "hook_close",
        "name": "伏笔闭环",
        "status": if hook_close_fail || hook_id_illegal { "FAIL" } else { "PASS" },
        "severity": "error",
        "evidence": { "open_hook_ids": open_hook_ids, "hook_ids_used": hook_ids_used }
    }));
    checks.push(serde_json::json!({
        "key": "thread_advance",
        "name": "线程推进",
        "status": if thread_advance_warn { "WARN" } else { "PASS" },
        "severity": "warn",
        "evidence": { "thread_refs": thread_refs, "thread_tags_used": thread_tags_used }
    }));

    let overall = if checks.iter().any(|c| c.get("severity").and_then(|v| v.as_str()) == Some("error") && c.get("status").and_then(|v| v.as_str()) == Some("FAIL")) {
        "FAIL"
    } else if checks.iter().any(|c| c.get("status").and_then(|v| v.as_str()) == Some("WARN")) {
        "WARN"
    } else {
        "PASS"
    };

    let mut actions: Vec<serde_json::Value> = Vec::new();
    if hook_close_fail {
        let hook = planning.open_hooks.first().map(|h| h.id);
        actions.push(serde_json::json!({
            "type": "rewrite_request",
            "reason": "缺少 hook_id 标记或未闭环伏笔",
            "must_close_hooks": hook.into_iter().collect::<Vec<i32>>(),
            "must_advance_threads": serde_json::json!([])
        }));
    }
    if plan_alignment_fail && !planning.plan.locked {
        actions.push(serde_json::json!({
            "type": "call_command",
            "command": "ai_propose_outline_patch_from_chapter",
            "args": { "chapter_number": chapter_number },
            "reason": "规划锚定失败且未锁定，优先生成对齐提案",
            "blocking": false
        }));
    }

    let report = serde_json::json!({
        "chapter_number": chapter_number,
        "version_id": planning.version_id,
        "overall": overall,
        "summary": "",
        "checks": checks,
        "actions": actions,
        "artifacts": {
            "pre_write_check": pre,
            "chapter_title": title,
            "chapter_content_excerpt": content.chars().take(1200).collect::<String>()
        }
    });

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let report_json = serde_json::to_string(&report).unwrap_or("{}".to_string());
    conn.execute(
        "INSERT INTO chapter_compliance_reports (chapter_number, overall, report_json) VALUES (?1, ?2, ?3)",
        rusqlite::params![chapter_number, overall, report_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(report)
}

#[tauri::command]
pub fn get_latest_compliance_report(state: State<DbState>, chapter_number: i32) -> Result<Option<serde_json::Value>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let r: Result<String, rusqlite::Error> = conn.query_row(
        "SELECT report_json FROM chapter_compliance_reports WHERE chapter_number = ?1 ORDER BY id DESC LIMIT 1",
        rusqlite::params![chapter_number],
        |row| row.get(0),
    );
    match r {
        Ok(s) => Ok(serde_json::from_str::<serde_json::Value>(&s).ok()),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn get_compliance_report_history(state: State<DbState>, chapter_number: i32, limit: Option<i32>) -> Result<Vec<serde_json::Value>, String> {
    let limit = limit.unwrap_or(30).max(1);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare(
            "SELECT report_json FROM chapter_compliance_reports WHERE chapter_number = ?1 ORDER BY id DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map(rusqlite::params![chapter_number, limit], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for item in iter.flatten() {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&item) {
            list.push(v);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn save_chapter_outline(state: State<DbState>, chapter_number: i32, outline: String) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("UPDATE chapters SET outline = ?1 WHERE chapter_number = ?2", rusqlite::params![outline, chapter_number])
        .map_err(|e| e.to_string())?;
    refresh_hook_staleness(conn, chapter_number).map_err(|e| e.to_string())?;
    upsert_hooks_from_outline(conn, chapter_number, &outline).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_chapter_status(state: State<DbState>, chapter_number: i32, status: String) -> Result<(), String> {
    let status = status.trim().to_string();
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    if status == "finalized" {
        let r: Result<String, rusqlite::Error> = conn.query_row(
            "SELECT overall FROM chapter_compliance_reports WHERE chapter_number = ?1 ORDER BY id DESC LIMIT 1",
            rusqlite::params![chapter_number],
            |row| row.get(0),
        );
        match r {
            Ok(v) => {
                if v == "FAIL" {
                    return Err("合规失败：请先修复并通过合规校验再定稿".to_string());
                }
            }
            Err(_) => {
                return Err("缺少合规报告：请先生成正文并完成合规校验再定稿".to_string());
            }
        }

        let pending_conflicts: i32 = conn
            .query_row(
                "SELECT COUNT(1) FROM world_facts_proposals WHERE status = 'pending' AND (entity_type = 'conflict' OR entity_type = 'review')",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);
        if pending_conflicts > 0 {
            return Err(format!("存在 {} 条冲突/审查提案未处理：请先在“世界观/收件箱”处理后再定稿", pending_conflicts));
        }
    }
    conn.execute("UPDATE chapters SET status = ?1 WHERE chapter_number = ?2", rusqlite::params![status, chapter_number])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_chapter(state: State<DbState>, title: String) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let chapter_number: i32 = conn
        .query_row("SELECT COALESCE(MAX(chapter_number), 0) + 1 FROM chapters", [], |row| row.get(0))
        .unwrap_or(1);
    
    conn.execute(
        "INSERT INTO chapters (chapter_number, title, content, outline, status, draft_raw) VALUES (?1, ?2, '', '', 'draft', '')",
        rusqlite::params![chapter_number, title],
    )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_characters(state: State<DbState>) -> Result<Vec<CharacterBible>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare("SELECT id, name, core_belief, catchphrase, forbidden_knowledge FROM character_bibles")
        .map_err(|e| e.to_string())?;
    
    let iter = stmt.query_map([], |row| {
        Ok(CharacterBible {
            id: row.get(0)?,
            name: row.get(1)?,
            core_belief: row.get(2)?,
            catchphrase: row.get(3)?,
            forbidden_knowledge: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for i in iter {
        if let Ok(c) = i {
            list.push(c);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn add_character(state: State<DbState>, name: String, core_belief: String, catchphrase: String, forbidden_knowledge: String) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("INSERT INTO character_bibles (name, core_belief, catchphrase, forbidden_knowledge) VALUES (?, ?, ?, ?)", 
        rusqlite::params![name, core_belief, catchphrase, forbidden_knowledge])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_world_locations(state: State<DbState>) -> Result<Vec<WorldLocation>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare("SELECT id, name, description FROM world_locations ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |row| {
            Ok(WorldLocation {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for i in iter.flatten() {
        list.push(i);
    }
    Ok(list)
}

#[tauri::command]
pub fn add_world_location(state: State<DbState>, name: String, description: String) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "INSERT OR REPLACE INTO world_locations (name, description) VALUES (?1, ?2)",
        rusqlite::params![name, description],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_world_items(state: State<DbState>) -> Result<Vec<WorldItem>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare("SELECT id, name, description FROM world_items ORDER BY id DESC")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([], |row| {
            Ok(WorldItem {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for i in iter.flatten() {
        list.push(i);
    }
    Ok(list)
}

#[tauri::command]
pub fn add_world_item(state: State<DbState>, name: String, description: String) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "INSERT OR REPLACE INTO world_items (name, description) VALUES (?1, ?2)",
        rusqlite::params![name, description],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reextract_world_facts_from_chapters(
    state: State<DbState>,
    start_chapter: Option<i32>,
    end_chapter: Option<i32>,
    clear_pending: Option<bool>,
) -> Result<i64, String> {
    let start_chapter = start_chapter.unwrap_or(1).max(1);
    let end_chapter = end_chapter.unwrap_or(i32::MAX);
    let clear_pending = clear_pending.unwrap_or(false);

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    if clear_pending {
        conn.execute("DELETE FROM world_facts_proposals WHERE status = 'pending'", [])
            .map_err(|e| e.to_string())?;
    }
    let before: i64 = conn
        .query_row("SELECT COUNT(1) FROM world_facts_proposals WHERE status = 'pending'", [], |row| row.get(0))
        .unwrap_or(0);

    let mut stmt = conn
        .prepare(
            "SELECT chapter_number, title, outline, content
             FROM chapters
             WHERE chapter_number >= ?1 AND chapter_number <= ?2
             ORDER BY chapter_number ASC",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(rusqlite::params![start_chapter, end_chapter], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    for item in iter {
        let (num, title, outline, content) = item.map_err(|e| e.to_string())?;
        let _ = title;
        if !outline.trim().is_empty() {
            propose_world_entities_from_text(conn, num, &outline).map_err(|e| e.to_string())?;
        }
        if let Some(c) = content {
            if !c.trim().is_empty() {
                propose_world_entities_from_text(conn, num, &c).map_err(|e| e.to_string())?;
            }
        }
    }

    let after: i64 = conn
        .query_row("SELECT COUNT(1) FROM world_facts_proposals WHERE status = 'pending'", [], |row| row.get(0))
        .unwrap_or(0);
    Ok(after - before)
}

#[tauri::command]
pub fn get_world_fact_proposals(state: State<DbState>, status: Option<String>, limit: Option<i32>) -> Result<Vec<WorldFactProposal>, String> {
    let status = status.unwrap_or_else(|| "pending".to_string());
    let limit = limit.unwrap_or(200).max(1);

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status, created_at
             FROM world_facts_proposals
             WHERE status = ?1
             ORDER BY id DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(rusqlite::params![status, limit], |row| {
            Ok(WorldFactProposal {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_name: row.get(2)?,
                fact_key: row.get(3)?,
                fact_value: row.get(4)?,
                confidence: row.get(5).unwrap_or(0.3),
                source_chapter: row.get(6)?,
                source_span: row.get(7).unwrap_or_else(|_| "".to_string()),
                status: row.get(8)?,
                created_at: row.get(9).unwrap_or_else(|_| "".to_string()),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for i in iter.flatten() {
        list.push(i);
    }
    if status != "pending" {
        return Ok(list);
    }

    let mut filtered: Vec<WorldFactProposal> = Vec::new();
    for p in list {
        if p.entity_type == "review" || p.entity_type == "conflict" {
            filtered.push(p);
            continue;
        }
        if p.fact_key == "description" {
            let exists: bool = match p.entity_type.as_str() {
                "character" => conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM character_bibles WHERE name = ?1)",
                        [&p.entity_name],
                        |row| row.get(0),
                    )
                    .unwrap_or(false),
                "location" => conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM world_locations WHERE name = ?1)",
                        [&p.entity_name],
                        |row| row.get(0),
                    )
                    .unwrap_or(false),
                "item" => conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM world_items WHERE name = ?1)",
                        [&p.entity_name],
                        |row| row.get(0),
                    )
                    .unwrap_or(false),
                _ => false,
            };
            if exists {
                continue;
            }
        }
        if p.fact_key == "owner" || p.fact_key == "status" {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(
                        SELECT 1 FROM temporal_states
                        WHERE entity_id = ?1 AND entity_type = ?2 AND state_key = ?3 AND state_value = ?4
                          AND valid_from_chapter <= ?5
                          AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?5)
                    )",
                    rusqlite::params![p.entity_name, p.entity_type, p.fact_key, p.fact_value, p.source_chapter],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if exists {
                continue;
            }
        }
        filtered.push(p);
    }
    Ok(filtered)
}

#[tauri::command]
pub fn get_temporal_states(state: State<DbState>, chapter: Option<i32>, limit: Option<i32>) -> Result<Vec<TemporalState>, String> {
    let limit = limit.unwrap_or(300).max(1);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let mut list: Vec<TemporalState> = Vec::new();
    if let Some(ch) = chapter {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity_id, entity_type, state_key, state_value, valid_from_chapter, valid_to_chapter
                 FROM temporal_states
                 WHERE valid_from_chapter <= ?1 AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?1)
                 ORDER BY entity_id ASC, entity_type ASC, state_key ASC, valid_from_chapter DESC, id DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![ch, limit], |row| {
                Ok(TemporalState {
                    id: row.get(0)?,
                    entity_id: row.get(1)?,
                    entity_type: row.get(2)?,
                    state_key: row.get(3)?,
                    state_value: row.get(4)?,
                    valid_from_chapter: row.get(5)?,
                    valid_to_chapter: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut seen: HashSet<(String, String, String)> = HashSet::new();
        for item in iter.flatten() {
            let sig = (item.entity_id.clone(), item.entity_type.clone(), item.state_key.clone());
            if seen.contains(&sig) {
                continue;
            }
            seen.insert(sig);
            list.push(item);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, entity_id, entity_type, state_key, state_value, valid_from_chapter, valid_to_chapter
                 FROM temporal_states
                 WHERE valid_to_chapter IS NULL
                 ORDER BY entity_id ASC, entity_type ASC, state_key ASC, valid_from_chapter DESC, id DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([limit], |row| {
                Ok(TemporalState {
                    id: row.get(0)?,
                    entity_id: row.get(1)?,
                    entity_type: row.get(2)?,
                    state_key: row.get(3)?,
                    state_value: row.get(4)?,
                    valid_from_chapter: row.get(5)?,
                    valid_to_chapter: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn update_temporal_state(
    state: State<DbState>,
    id: i32,
    state_value: String,
    valid_from_chapter: i32,
    valid_to_chapter: Option<i32>,
) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    if let Some(to) = valid_to_chapter {
        if to < valid_from_chapter {
            return Err("valid_to_chapter 不能小于 valid_from_chapter".to_string());
        }
    }
    conn.execute(
        "UPDATE temporal_states SET state_value = ?1, valid_from_chapter = ?2, valid_to_chapter = ?3 WHERE id = ?4",
        rusqlite::params![state_value, valid_from_chapter, valid_to_chapter, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_temporal_state(state: State<DbState>, id: i32) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("DELETE FROM temporal_states WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_outline_rows(state: State<DbState>, start_chapter: i32, end_chapter: i32) -> Result<Vec<OutlineRow>, String> {
    let start = start_chapter.max(1);
    let end = end_chapter.max(start);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let mut stmt = conn
        .prepare(
            "SELECT chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked, COALESCE(updated_at, '') 
             FROM chapter_outline_one_liners_current
             WHERE chapter_number >= ?1 AND chapter_number <= ?2
             ORDER BY chapter_number ASC",
        )
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map(rusqlite::params![start, end], |row| {
            let chapter_number: i32 = row.get(0)?;
            let one_liner: String = row.get(1)?;
            let tags_json: String = row.get(2)?;
            let cast_refs_json: String = row.get(3)?;
            let thread_refs_json: String = row.get(4)?;
            let locked: i32 = row.get(5)?;
            let updated_at: String = row.get(6)?;
            let tags = serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default();
            let cast_refs = serde_json::from_str::<Vec<String>>(&cast_refs_json).unwrap_or_default();
            let thread_refs = serde_json::from_str::<Vec<String>>(&thread_refs_json).unwrap_or_default();
            Ok(OutlineRow {
                chapter_number,
                one_liner,
                tags,
                cast_refs,
                thread_refs,
                locked: locked == 1,
                updated_at,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for item in iter.flatten() {
        list.push(item);
    }
    Ok(list)
}

#[tauri::command]
pub fn save_outline_patches(state: State<DbState>, patches: Vec<OutlinePatch>) -> Result<i32, String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut affected: i32 = 0;
    for p in patches {
        let existing = tx
            .query_row(
                "SELECT one_liner, tags_json, cast_refs_json, thread_refs_json, locked FROM chapter_outline_one_liners_current WHERE chapter_number = ?1",
                [p.chapter_number],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i32>(4)?)),
            )
            .unwrap_or_else(|_| ("".to_string(), "[]".to_string(), "[]".to_string(), "[]".to_string(), 0));

        let one_liner = p.one_liner.unwrap_or(existing.0);
        let tags_json = p
            .tags
            .map(|v| serde_json::to_string(&v).unwrap_or("[]".to_string()))
            .unwrap_or(existing.1);
        let cast_refs_json = p
            .cast_refs
            .map(|v| serde_json::to_string(&v).unwrap_or("[]".to_string()))
            .unwrap_or(existing.2);
        let thread_refs_json = p
            .thread_refs
            .map(|v| serde_json::to_string(&v).unwrap_or("[]".to_string()))
            .unwrap_or(existing.3);
        let locked = p.locked.map(|v| if v { 1 } else { 0 }).unwrap_or(existing.4);

        let a = tx
            .execute(
                "INSERT OR REPLACE INTO chapter_outline_one_liners_current (chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)",
                rusqlite::params![p.chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked],
            )
            .unwrap_or(0);
        affected += a as i32;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(affected)
}

#[tauri::command]
pub fn set_outline_locked_range(state: State<DbState>, start_chapter: i32, end_chapter: i32, locked: bool) -> Result<i32, String> {
    let start = start_chapter.max(1);
    let end = end_chapter.max(start);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let locked_i = if locked { 1 } else { 0 };
    let affected = conn
        .execute(
            "UPDATE chapter_outline_one_liners_current SET locked = ?1, updated_at = CURRENT_TIMESTAMP WHERE chapter_number >= ?2 AND chapter_number <= ?3",
            rusqlite::params![locked_i, start, end],
        )
        .map_err(|e| e.to_string())?;
    Ok(affected as i32)
}

#[tauri::command]
pub fn get_stage_plan(state: State<DbState>, version_id: i32) -> Result<Vec<StagePlanItem>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare(
            "SELECT stage_id, start_chapter, end_chapter, stage_goal, main_conflict, turning_point, climax, settlement, threads_json, cast_focus_json, system_usage
             FROM stage_plan
             WHERE version_id = ?1
             ORDER BY stage_id ASC",
        )
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([version_id], |row| {
            let threads_json: String = row.get(8)?;
            let cast_focus_json: String = row.get(9)?;
            Ok(StagePlanItem {
                stage_id: row.get(0)?,
                start_chapter: row.get(1)?,
                end_chapter: row.get(2)?,
                stage_goal: row.get(3)?,
                main_conflict: row.get(4)?,
                turning_point: row.get(5)?,
                climax: row.get(6)?,
                settlement: row.get(7)?,
                threads: serde_json::from_str(&threads_json).unwrap_or(serde_json::json!([])),
                cast_focus: serde_json::from_str(&cast_focus_json).unwrap_or(serde_json::json!([])),
                system_usage: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for item in iter.flatten() {
        list.push(item);
    }
    Ok(list)
}

#[tauri::command]
pub fn get_outline_checkpoints(state: State<DbState>, version_id: Option<i32>, limit: Option<i32>) -> Result<Vec<OutlineCheckpointItem>, String> {
    let limit = limit.unwrap_or(50).max(1);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let mut list = Vec::new();
    if let Some(vid) = version_id {
        let mut stmt = conn
            .prepare(
                "SELECT id, version_id, start_chapter, end_chapter, checkpoint_json, created_at
                 FROM outline_checkpoints
                 WHERE version_id = ?1
                 ORDER BY end_chapter DESC, id DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![vid, limit], |row| {
                let s: String = row.get(4)?;
                Ok(OutlineCheckpointItem {
                    id: row.get(0)?,
                    version_id: row.get(1)?,
                    start_chapter: row.get(2)?,
                    end_chapter: row.get(3)?,
                    checkpoint: serde_json::from_str(&s).unwrap_or(serde_json::json!({})),
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, version_id, start_chapter, end_chapter, checkpoint_json, created_at
                 FROM outline_checkpoints
                 ORDER BY end_chapter DESC, id DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([limit], |row| {
                let s: String = row.get(4)?;
                Ok(OutlineCheckpointItem {
                    id: row.get(0)?,
                    version_id: row.get(1)?,
                    start_chapter: row.get(2)?,
                    end_chapter: row.get(3)?,
                    checkpoint: serde_json::from_str(&s).unwrap_or(serde_json::json!({})),
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn get_proposals(state: State<DbState>, status: Option<String>, limit: Option<i32>) -> Result<Vec<ProposalItem>, String> {
    let status = status.unwrap_or_else(|| "pending".to_string());
    let limit = limit.unwrap_or(200).max(1);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, proposal_type, payload_json, source_chapter, status, confidence, created_at
             FROM proposals
             WHERE status = ?1
             ORDER BY id DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map(rusqlite::params![status, limit], |row| {
            let payload: String = row.get(2)?;
            Ok(ProposalItem {
                id: row.get(0)?,
                proposal_type: row.get(1)?,
                payload: serde_json::from_str(&payload).unwrap_or(serde_json::json!({})),
                source_chapter: row.get(3)?,
                status: row.get(4)?,
                confidence: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for item in iter.flatten() {
        list.push(item);
    }
    Ok(list)
}

#[tauri::command]
pub fn accept_proposal(state: State<DbState>, id: i32) -> Result<(), String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let (proposal_type, payload_json): (String, String) = tx
        .query_row(
            "SELECT proposal_type, payload_json FROM proposals WHERE id = ?1 AND status = 'pending'",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let payload: serde_json::Value = serde_json::from_str(&payload_json).unwrap_or(serde_json::json!({}));

    match proposal_type.as_str() {
        "outline_patch" => {
            let patches_value = payload.get("patches").cloned().unwrap_or(payload);
            let patches: Vec<OutlinePatch> = if patches_value.is_array() {
                serde_json::from_value(patches_value).map_err(|e| e.to_string())?
            } else {
                vec![serde_json::from_value(patches_value).map_err(|e| e.to_string())?]
            };

            for p in patches {
                let existing = tx
                    .query_row(
                        "SELECT one_liner, tags_json, cast_refs_json, thread_refs_json, locked FROM chapter_outline_one_liners_current WHERE chapter_number = ?1",
                        [p.chapter_number],
                        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i32>(4)?)),
                    )
                    .unwrap_or_else(|_| ("".to_string(), "[]".to_string(), "[]".to_string(), "[]".to_string(), 0));

                let existing_locked = existing.4 == 1;
                let one_liner = if existing_locked {
                    existing.0
                } else {
                    p.one_liner.unwrap_or(existing.0)
                };
                let tags_json = p
                    .tags
                    .map(|v| serde_json::to_string(&v).unwrap_or("[]".to_string()))
                    .unwrap_or(existing.1);
                let cast_refs_json = p
                    .cast_refs
                    .map(|v| serde_json::to_string(&v).unwrap_or("[]".to_string()))
                    .unwrap_or(existing.2);
                let thread_refs_json = p
                    .thread_refs
                    .map(|v| serde_json::to_string(&v).unwrap_or("[]".to_string()))
                    .unwrap_or(existing.3);
                let locked = if existing_locked {
                    1
                } else {
                    p.locked.map(|v| if v { 1 } else { 0 }).unwrap_or(existing.4)
                };

                tx.execute(
                    "INSERT OR REPLACE INTO chapter_outline_one_liners_current (chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)",
                    rusqlite::params![p.chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "thread_upsert" => {
            let thread: StoryThreadUpsert = serde_json::from_value(payload).map_err(|e| e.to_string())?;
            let ttype = normalize_thread_type(thread.r#type.trim()).to_string();
            let status = normalize_thread_status(thread.status.trim()).to_string();
            let title = thread.title.trim().to_string();
            if title.is_empty() {
                return Err("title 不能为空".to_string());
            }
            let owner_json = serde_json::to_string(&thread.owner_characters).unwrap_or("[]".to_string());
            let milestones_json = serde_json::to_string(&thread.milestones).unwrap_or("[]".to_string());
            let thread_key = thread.thread_key.unwrap_or_default().trim().to_string();
            let final_key = if thread_key.is_empty() { generate_thread_key() } else { thread_key };

            if let Some(tid) = thread.id {
                tx.execute(
                    "UPDATE story_threads
                     SET thread_key = ?1, type = ?2, title = ?3, goal = ?4, stakes = ?5, status = ?6,
                         owner_characters_json = ?7, start_chapter = ?8, end_chapter = ?9, milestones_json = ?10, notes = ?11,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?12",
                    rusqlite::params![
                        final_key,
                        ttype,
                        title,
                        thread.goal,
                        thread.stakes,
                        status,
                        owner_json,
                        thread.start_chapter,
                        thread.end_chapter,
                        milestones_json,
                        thread.notes,
                        tid
                    ],
                )
                .map_err(|e| e.to_string())?;
            } else {
                tx.execute(
                    "INSERT INTO story_threads (thread_key, type, title, goal, stakes, status, owner_characters_json, start_chapter, end_chapter, milestones_json, notes)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                    rusqlite::params![
                        final_key,
                        ttype,
                        title,
                        thread.goal,
                        thread.stakes,
                        status,
                        owner_json,
                        thread.start_chapter,
                        thread.end_chapter,
                        milestones_json,
                        thread.notes
                    ],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "soul_timeline_upsert" => {
            let item: SoulTimelineUpsert = serde_json::from_value(payload).map_err(|e| e.to_string())?;
            let name = item.character_name.trim().to_string();
            if name.is_empty() {
                return Err("character_name 不能为空".to_string());
            }
            if item.valid_to_chapter.is_some() && item.valid_to_chapter.unwrap() < item.valid_from_chapter {
                return Err("valid_to_chapter 不能小于 valid_from_chapter".to_string());
            }
            let soul_state_json = serde_json::to_string(&item.soul_state).unwrap_or("{}".to_string());
            let confidence = item.confidence.unwrap_or(0.6).clamp(0.0, 1.0);
            if let Some(sid) = item.id {
                tx.execute(
                    "UPDATE character_soul_timeline
                     SET character_name = ?1, valid_from_chapter = ?2, valid_to_chapter = ?3, soul_state_json = ?4,
                         reason_span = ?5, source = ?6, confidence = ?7
                     WHERE id = ?8",
                    rusqlite::params![name, item.valid_from_chapter, item.valid_to_chapter, soul_state_json, item.reason_span, item.source, confidence, sid],
                )
                .map_err(|e| e.to_string())?;
            } else {
                tx.execute(
                    "INSERT INTO character_soul_timeline (character_name, valid_from_chapter, valid_to_chapter, soul_state_json, reason_span, source, confidence)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![name, item.valid_from_chapter, item.valid_to_chapter, soul_state_json, item.reason_span, item.source, confidence],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        "relation_upsert" => {
            let rel: CharacterRelationUpsert = serde_json::from_value(payload).map_err(|e| e.to_string())?;
            let source = rel.source_name.trim().to_string();
            let target = rel.target_name.trim().to_string();
            if source.is_empty() || target.is_empty() {
                return Err("source_name/target_name 不能为空".to_string());
            }
            if rel.valid_to_chapter.is_some() && rel.valid_to_chapter.unwrap() < rel.valid_from_chapter {
                return Err("valid_to_chapter 不能小于 valid_from_chapter".to_string());
            }
            let strength = rel.strength.max(1).min(5);
            if let Some(rid) = rel.id {
                tx.execute(
                    "UPDATE character_relations
                     SET source_name = ?1, target_name = ?2, relation_type = ?3, strength = ?4, valid_from_chapter = ?5, valid_to_chapter = ?6, note = ?7
                     WHERE id = ?8",
                    rusqlite::params![source, target, rel.relation_type, strength, rel.valid_from_chapter, rel.valid_to_chapter, rel.note, rid],
                )
                .map_err(|e| e.to_string())?;
            } else {
                tx.execute(
                    "INSERT INTO character_relations (source_name, target_name, relation_type, strength, valid_from_chapter, valid_to_chapter, note)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![source, target, rel.relation_type, strength, rel.valid_from_chapter, rel.valid_to_chapter, rel.note],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        _ => {}
    }

    tx.execute("UPDATE proposals SET status = 'accepted' WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reject_proposal(state: State<DbState>, id: i32) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("UPDATE proposals SET status = 'rejected' WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reject_world_fact_proposal(state: State<DbState>, id: i32) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("UPDATE world_facts_proposals SET status = 'rejected' WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn accept_world_fact_proposal(state: State<DbState>, id: i32, accept_as: Option<String>) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let (entity_type, entity_name, fact_key, fact_value, source_chapter, source_span): (String, String, String, String, i32, String) = conn
        .query_row(
            "SELECT entity_type, entity_name, fact_key, fact_value, source_chapter, source_span FROM world_facts_proposals WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
        )
        .map_err(|e| e.to_string())?;

    if entity_type == "review" || entity_type == "conflict" {
        return Err("该提案类型不支持入库（请忽略或在后续版本中专门处理）".to_string());
    }

    let final_type = accept_as.clone().unwrap_or_else(|| entity_type.clone());
    let description = if fact_value.trim().is_empty() {
        "待补充".to_string()
    } else {
        fact_value
    };

    let temporal_keys = ["owner", "status"];
    let should_write_temporal = accept_as.as_deref() == Some("temporal") || temporal_keys.contains(&fact_key.as_str());

    if should_write_temporal {
        let inferred = if entity_type == "unknown" {
            guess_world_entity_type(&entity_name).to_string()
        } else {
            entity_type.clone()
        };

        if let Ok(v) = conn.query_row(
            "SELECT state_value FROM temporal_states
             WHERE entity_id = ?1 AND entity_type = ?2 AND state_key = ?3
               AND valid_from_chapter = ?4
               AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?4)
             ORDER BY id DESC LIMIT 1",
            rusqlite::params![entity_name, inferred, fact_key, source_chapter],
            |row| row.get::<_, String>(0),
        ) {
            if v != description {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                     VALUES ('conflict', ?1, ?2, ?3, 0.85, ?4, ?5, 'pending')",
                    rusqlite::params![entity_name, fact_key, format!("同章冲突：{} / {}", v, description), source_chapter, source_span],
                );
            }
        }

        upsert_temporal_state(conn, &entity_name, &inferred, &fact_key, &description, source_chapter).map_err(|e| e.to_string())?;
        conn.execute("UPDATE world_facts_proposals SET status = 'accepted' WHERE id = ?1", [id])
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    match final_type.as_str() {
        "character" => {
            conn.execute(
                "INSERT OR IGNORE INTO character_bibles (name, core_belief, catchphrase, forbidden_knowledge) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![entity_name, "待补充", "待补充", ""],
            )
            .map_err(|e| e.to_string())?;
        }
        "location" => {
            conn.execute(
                "INSERT OR REPLACE INTO world_locations (name, description) VALUES (?1, ?2)",
                rusqlite::params![entity_name, description],
            )
            .map_err(|e| e.to_string())?;
        }
        "item" => {
            conn.execute(
                "INSERT OR REPLACE INTO world_items (name, description) VALUES (?1, ?2)",
                rusqlite::params![entity_name, description],
            )
            .map_err(|e| e.to_string())?;
        }
        _ => {
            conn.execute(
                "INSERT OR REPLACE INTO world_items (name, description) VALUES (?1, ?2)",
                rusqlite::params![entity_name, description],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    conn.execute("UPDATE world_facts_proposals SET status = 'accepted' WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn normalize_thread_type(t: &str) -> &str {
    match t {
        "main" | "sub" | "character" | "mystery" | "growth" => t,
        _ => "sub",
    }
}

fn normalize_thread_status(s: &str) -> &str {
    match s {
        "todo" | "doing" | "done" | "parked" => s,
        _ => "todo",
    }
}

fn generate_thread_key() -> String {
    let ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    format!("THR_{}", ms)
}

#[tauri::command]
pub fn get_story_threads(state: State<DbState>, status: Option<String>, limit: Option<i32>) -> Result<Vec<StoryThread>, String> {
    let limit = limit.unwrap_or(500).max(1);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let mut list: Vec<StoryThread> = Vec::new();
    if let Some(s) = status {
        let st = normalize_thread_status(s.trim());
        let mut stmt = conn
            .prepare(
                "SELECT id, thread_key, type, title, goal, stakes, status, owner_characters_json, start_chapter, end_chapter, milestones_json, notes, created_at, updated_at
                 FROM story_threads
                 WHERE status = ?1
                 ORDER BY updated_at DESC, id DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![st, limit], |row| {
                let owners_json: String = row.get(7)?;
                let milestones_json: String = row.get(10)?;
                Ok(StoryThread {
                    id: row.get(0)?,
                    thread_key: row.get(1)?,
                    r#type: row.get(2)?,
                    title: row.get(3)?,
                    goal: row.get(4)?,
                    stakes: row.get(5)?,
                    status: row.get(6)?,
                    owner_characters: serde_json::from_str(&owners_json).unwrap_or_default(),
                    start_chapter: row.get(8)?,
                    end_chapter: row.get(9)?,
                    milestones: serde_json::from_str(&milestones_json).unwrap_or_default(),
                    notes: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, thread_key, type, title, goal, stakes, status, owner_characters_json, start_chapter, end_chapter, milestones_json, notes, created_at, updated_at
                 FROM story_threads
                 ORDER BY updated_at DESC, id DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([limit], |row| {
                let owners_json: String = row.get(7)?;
                let milestones_json: String = row.get(10)?;
                Ok(StoryThread {
                    id: row.get(0)?,
                    thread_key: row.get(1)?,
                    r#type: row.get(2)?,
                    title: row.get(3)?,
                    goal: row.get(4)?,
                    stakes: row.get(5)?,
                    status: row.get(6)?,
                    owner_characters: serde_json::from_str(&owners_json).unwrap_or_default(),
                    start_chapter: row.get(8)?,
                    end_chapter: row.get(9)?,
                    milestones: serde_json::from_str(&milestones_json).unwrap_or_default(),
                    notes: row.get(11)?,
                    created_at: row.get(12)?,
                    updated_at: row.get(13)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn upsert_story_thread(state: State<DbState>, thread: StoryThreadUpsert) -> Result<i32, String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;
    let ttype = normalize_thread_type(thread.r#type.trim()).to_string();
    let status = normalize_thread_status(thread.status.trim()).to_string();
    let title = thread.title.trim().to_string();
    if title.is_empty() {
        return Err("title 不能为空".to_string());
    }
    let owner_json = serde_json::to_string(&thread.owner_characters).unwrap_or("[]".to_string());
    let milestones_json = serde_json::to_string(&thread.milestones).unwrap_or("[]".to_string());
    let thread_key = thread
        .thread_key
        .unwrap_or_default()
        .trim()
        .to_string();
    let final_key = if thread_key.is_empty() {
        generate_thread_key()
    } else {
        thread_key
    };

    if let Some(id) = thread.id {
        conn.execute(
            "UPDATE story_threads
             SET thread_key = ?1, type = ?2, title = ?3, goal = ?4, stakes = ?5, status = ?6,
                 owner_characters_json = ?7, start_chapter = ?8, end_chapter = ?9, milestones_json = ?10, notes = ?11,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?12",
            rusqlite::params![
                final_key,
                ttype,
                title,
                thread.goal,
                thread.stakes,
                status,
                owner_json,
                thread.start_chapter,
                thread.end_chapter,
                milestones_json,
                thread.notes,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        return Ok(id);
    }

    conn.execute(
        "INSERT INTO story_threads (thread_key, type, title, goal, stakes, status, owner_characters_json, start_chapter, end_chapter, milestones_json, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            final_key,
            ttype,
            title,
            thread.goal,
            thread.stakes,
            status,
            owner_json,
            thread.start_chapter,
            thread.end_chapter,
            milestones_json,
            thread.notes
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn delete_story_thread(state: State<DbState>, id: i32) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("DELETE FROM story_threads WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_character_core(state: State<DbState>, name: String) -> Result<Option<CharacterCoreItem>, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Ok(None);
    }
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let row = conn
        .query_row(
            "SELECT name, role_type, soul_core_json, notes, COALESCE(updated_at, '') FROM characters_core WHERE name = ?1",
            [&name],
            |row| {
                let soul: String = row.get(2)?;
                Ok(CharacterCoreItem {
                    name: row.get(0)?,
                    role_type: row.get(1)?,
                    soul_core: serde_json::from_str(&soul).unwrap_or(serde_json::json!({})),
                    notes: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            },
        )
        .ok();
    Ok(row)
}

#[tauri::command]
pub fn update_character_core(
    state: State<DbState>,
    name: String,
    role_type: Option<String>,
    soul_core: Option<serde_json::Value>,
    notes: Option<String>,
) -> Result<(), String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("name 不能为空".to_string());
    }
    let existing = conn
        .query_row(
            "SELECT role_type, soul_core_json, notes FROM characters_core WHERE name = ?1",
            [&name],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
        )
        .unwrap_or_else(|_| ("".to_string(), "{}".to_string(), "".to_string()));

    let final_role = role_type.unwrap_or(existing.0);
    let final_soul = soul_core
        .map(|v| serde_json::to_string(&v).unwrap_or("{}".to_string()))
        .unwrap_or(existing.1);
    let final_notes = notes.unwrap_or(existing.2);

    conn.execute(
        "INSERT OR REPLACE INTO characters_core (name, role_type, soul_core_json, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4,
                 COALESCE((SELECT created_at FROM characters_core WHERE name = ?1), CURRENT_TIMESTAMP),
                 CURRENT_TIMESTAMP)",
        rusqlite::params![name, final_role, final_soul, final_notes],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_character_soul_timeline(
    state: State<DbState>,
    character_name: String,
    chapter: Option<i32>,
    limit: Option<i32>,
) -> Result<Vec<SoulTimelineItem>, String> {
    let limit = limit.unwrap_or(200).max(1);
    let name = character_name.trim().to_string();
    if name.is_empty() {
        return Ok(vec![]);
    }
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut list: Vec<SoulTimelineItem> = Vec::new();
    if let Some(ch) = chapter {
        let mut stmt = conn
            .prepare(
                "SELECT id, character_name, valid_from_chapter, valid_to_chapter, soul_state_json, reason_span, source, confidence, created_at
                 FROM character_soul_timeline
                 WHERE character_name = ?1 AND valid_from_chapter <= ?2 AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?2)
                 ORDER BY valid_from_chapter DESC, id DESC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![name, ch, limit], |row| {
                let s: String = row.get(4)?;
                Ok(SoulTimelineItem {
                    id: row.get(0)?,
                    character_name: row.get(1)?,
                    valid_from_chapter: row.get(2)?,
                    valid_to_chapter: row.get(3)?,
                    soul_state: serde_json::from_str(&s).unwrap_or(serde_json::json!({})),
                    reason_span: row.get(5)?,
                    source: row.get(6)?,
                    confidence: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, character_name, valid_from_chapter, valid_to_chapter, soul_state_json, reason_span, source, confidence, created_at
                 FROM character_soul_timeline
                 WHERE character_name = ?1
                 ORDER BY valid_from_chapter ASC, id ASC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![name, limit], |row| {
                let s: String = row.get(4)?;
                Ok(SoulTimelineItem {
                    id: row.get(0)?,
                    character_name: row.get(1)?,
                    valid_from_chapter: row.get(2)?,
                    valid_to_chapter: row.get(3)?,
                    soul_state: serde_json::from_str(&s).unwrap_or(serde_json::json!({})),
                    reason_span: row.get(5)?,
                    source: row.get(6)?,
                    confidence: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn upsert_character_soul_timeline(state: State<DbState>, item: SoulTimelineUpsert) -> Result<i32, String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;
    let name = item.character_name.trim().to_string();
    if name.is_empty() {
        return Err("character_name 不能为空".to_string());
    }
    if item.valid_to_chapter.is_some() && item.valid_to_chapter.unwrap() < item.valid_from_chapter {
        return Err("valid_to_chapter 不能小于 valid_from_chapter".to_string());
    }
    let soul_state_json = serde_json::to_string(&item.soul_state).unwrap_or("{}".to_string());
    let confidence = item.confidence.unwrap_or(0.6).clamp(0.0, 1.0);
    if let Some(id) = item.id {
        conn.execute(
            "UPDATE character_soul_timeline
             SET character_name = ?1, valid_from_chapter = ?2, valid_to_chapter = ?3, soul_state_json = ?4,
                 reason_span = ?5, source = ?6, confidence = ?7
             WHERE id = ?8",
            rusqlite::params![name, item.valid_from_chapter, item.valid_to_chapter, soul_state_json, item.reason_span, item.source, confidence, id],
        )
        .map_err(|e| e.to_string())?;
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO character_soul_timeline (character_name, valid_from_chapter, valid_to_chapter, soul_state_json, reason_span, source, confidence)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![name, item.valid_from_chapter, item.valid_to_chapter, soul_state_json, item.reason_span, item.source, confidence],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn delete_character_soul_timeline(state: State<DbState>, id: i32) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("DELETE FROM character_soul_timeline WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_character_relations(
    state: State<DbState>,
    chapter: Option<i32>,
    limit: Option<i32>,
) -> Result<Vec<CharacterRelationItem>, String> {
    let limit = limit.unwrap_or(500).max(1);
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut list: Vec<CharacterRelationItem> = Vec::new();
    if let Some(ch) = chapter {
        let mut stmt = conn
            .prepare(
                "SELECT id, source_name, target_name, relation_type, strength, valid_from_chapter, valid_to_chapter, note, created_at
                 FROM character_relations
                 WHERE valid_from_chapter <= ?1 AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?1)
                 ORDER BY strength DESC, id DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![ch, limit], |row| {
                Ok(CharacterRelationItem {
                    id: row.get(0)?,
                    source_name: row.get(1)?,
                    target_name: row.get(2)?,
                    relation_type: row.get(3)?,
                    strength: row.get(4)?,
                    valid_from_chapter: row.get(5)?,
                    valid_to_chapter: row.get(6)?,
                    note: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    } else {
        let mut stmt = conn
            .prepare(
                "SELECT id, source_name, target_name, relation_type, strength, valid_from_chapter, valid_to_chapter, note, created_at
                 FROM character_relations
                 ORDER BY strength DESC, id DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([limit], |row| {
                Ok(CharacterRelationItem {
                    id: row.get(0)?,
                    source_name: row.get(1)?,
                    target_name: row.get(2)?,
                    relation_type: row.get(3)?,
                    strength: row.get(4)?,
                    valid_from_chapter: row.get(5)?,
                    valid_to_chapter: row.get(6)?,
                    note: row.get(7)?,
                    created_at: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for item in iter.flatten() {
            list.push(item);
        }
    }
    Ok(list)
}

#[tauri::command]
pub fn upsert_character_relation(state: State<DbState>, rel: CharacterRelationUpsert) -> Result<i32, String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;
    let source = rel.source_name.trim().to_string();
    let target = rel.target_name.trim().to_string();
    if source.is_empty() || target.is_empty() {
        return Err("source_name/target_name 不能为空".to_string());
    }
    if rel.valid_to_chapter.is_some() && rel.valid_to_chapter.unwrap() < rel.valid_from_chapter {
        return Err("valid_to_chapter 不能小于 valid_from_chapter".to_string());
    }
    let strength = rel.strength.max(1).min(5);
    if let Some(id) = rel.id {
        conn.execute(
            "UPDATE character_relations
             SET source_name = ?1, target_name = ?2, relation_type = ?3, strength = ?4, valid_from_chapter = ?5, valid_to_chapter = ?6, note = ?7
             WHERE id = ?8",
            rusqlite::params![source, target, rel.relation_type, strength, rel.valid_from_chapter, rel.valid_to_chapter, rel.note, id],
        )
        .map_err(|e| e.to_string())?;
        return Ok(id);
    }
    conn.execute(
        "INSERT INTO character_relations (source_name, target_name, relation_type, strength, valid_from_chapter, valid_to_chapter, note)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![source, target, rel.relation_type, strength, rel.valid_from_chapter, rel.valid_to_chapter, rel.note],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn delete_character_relation(state: State<DbState>, id: i32) -> Result<(), String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("DELETE FROM character_relations WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_board_overview(state: State<DbState>) -> Result<BoardOverview, String> {
    let mut book = BoardBook { title: String::new(), genre: String::new(), logline: String::new() };
    if let Ok(b) = get_book_meta_internal(&state) {
        book.title = b.title;
        book.genre = b.genre;
        book.logline = b.logline;
    }

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let mut totals = BoardTotals {
        total_chars: 0,
        chapter_count: 0,
        open_hooks_count: 0,
        open_consequences_count: 0,
        failed_reviews_recent: 0,
    };

    if let Ok(mut stmt) = conn.prepare("SELECT COUNT(id), SUM(LENGTH(content)) FROM chapters") {
        if let Ok(row) = stmt.query_row([], |row| {
            let c: usize = row.get(0).unwrap_or(0);
            let len: usize = row.get(1).unwrap_or(0);
            Ok((c, len))
        }) {
            totals.chapter_count = row.0;
            totals.total_chars = row.1;
        }
    }

    totals.open_hooks_count = conn
        .query_row("SELECT COUNT(id) FROM pending_hooks WHERE is_resolved = 0", [], |row| row.get(0))
        .unwrap_or(0);
    totals.open_consequences_count = conn
        .query_row("SELECT COUNT(id) FROM consequence_ledger WHERE is_resolved = 0", [], |row| row.get(0))
        .unwrap_or(0);

    totals.failed_reviews_recent = conn.query_row("
        SELECT COUNT(*) FROM (
            SELECT chapter_number, passed FROM chapter_review_history 
            GROUP BY chapter_number 
            HAVING created_at = MAX(created_at)
        ) WHERE passed = 0
    ", [], |row| row.get(0)).unwrap_or(0);

    let mut stale_hooks = Vec::new();
    if let Ok(mut stmt) = conn.prepare("SELECT id, hook_desc, created_at_chapter, staleness, is_resolved, resolved_at_chapter FROM pending_hooks WHERE is_resolved = 0 ORDER BY staleness DESC, created_at_chapter ASC LIMIT 10") {
        if let Ok(iter) = stmt.query_map([], |row| {
            Ok(PendingHook {
                id: row.get(0)?,
                hook_desc: row.get(1)?,
                created_at_chapter: row.get(2)?,
                staleness: row.get(3)?,
                is_resolved: row.get(4)?,
                resolved_at_chapter: row.get(5)?,
            })
        }) {
            for i in iter.flatten() {
                stale_hooks.push(i);
            }
        }
    }

    let mut open_consequences = Vec::new();
    if let Ok(mut stmt) = conn.prepare("
        SELECT
            MIN(id) AS id,
            MIN(chapter_number) AS chapter_number,
            TRIM(upgrade_desc) AS upgrade_desc,
            TRIM(consequence_hook) AS consequence_hook,
            MIN(is_resolved) AS is_resolved
        FROM consequence_ledger
        WHERE is_resolved = 0
        GROUP BY TRIM(upgrade_desc), TRIM(consequence_hook)
        ORDER BY MIN(chapter_number) ASC, MIN(id) ASC
        LIMIT 10
    ") {
        if let Ok(iter) = stmt.query_map([], |row| {
            Ok(Consequence {
                id: row.get(0)?,
                chapter_number: row.get(1)?,
                upgrade_desc: row.get(2)?,
                consequence_hook: row.get(3)?,
                is_resolved: row.get(4)?,
            })
        }) {
            for i in iter.flatten() {
                open_consequences.push(i);
            }
        }
    }

    let mut failed_reviews = Vec::new();
    if let Ok(mut stmt) = conn.prepare("
        SELECT chapter_number, created_at, review_json 
        FROM chapter_review_history 
        WHERE id IN (
            SELECT MAX(id) FROM chapter_review_history GROUP BY chapter_number
        )
        AND passed = 0
        ORDER BY created_at DESC LIMIT 10
    ") {
        if let Ok(iter) = stmt.query_map([], |row| {
            let chapter_number: i32 = row.get(0)?;
            let created_at: String = row.get(1)?;
            let review_json: String = row.get(2)?;
            let mut summary = String::new();
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&review_json) {
                if let Some(arr) = v.get("audit_reports").and_then(|a| a.as_array()) {
                    for a in arr {
                        if a.get("passed").and_then(|p| p.as_bool()) == Some(false) {
                            if let Some(r) = a.get("reason").and_then(|r| r.as_str()) {
                                summary = r.to_string();
                                break;
                            }
                        }
                    }
                }
            }
            if summary.is_empty() {
                summary = "评审未通过".to_string();
            }
            Ok(FailedReview {
                chapter_number,
                created_at,
                review_summary: summary,
            })
        }) {
            for i in iter.flatten() {
                failed_reviews.push(i);
            }
        }
    }

    Ok(BoardOverview {
        book,
        totals,
        stale_hooks,
        open_consequences,
        failed_reviews,
    })
}

#[derive(Serialize)]
pub struct ChapterBucket {
    pub start_chapter: i32,
    pub end_chapter: i32,
    pub chapter_count: i32,
    pub content_length: usize,
    pub hooks_created: i32,
    pub hooks_resolved: i32,
    pub failed_reviews: i32,
}

#[derive(Serialize)]
pub struct BoardChapterListItem {
    pub chapter_number: i32,
    pub title: String,
    pub status: String,
    pub content_length: usize,
    pub hooks_created: i32,
    pub hooks_resolved: i32,
    pub review_passed: Option<bool>,
    pub review_red_lights: i32,
}

#[tauri::command]
pub fn get_board_chapter_bucket_overview(state: State<DbState>, bucket_size: i32) -> Result<Vec<ChapterBucket>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let query = format!("
        SELECT 
            ((chapter_number - 1) / {0}) * {0} + 1 AS start_chapter,
            ((chapter_number - 1) / {0}) * {0} + {0} AS end_chapter,
            COUNT(DISTINCT c.chapter_number) AS chapter_count,
            SUM(LENGTH(c.content)) AS content_length,
            (SELECT COUNT(id) FROM pending_hooks WHERE created_at_chapter >= ((c.chapter_number - 1) / {0}) * {0} + 1 AND created_at_chapter <= ((c.chapter_number - 1) / {0}) * {0} + {0}) AS hooks_created,
            (SELECT COUNT(id) FROM pending_hooks WHERE resolved_at_chapter >= ((c.chapter_number - 1) / {0}) * {0} + 1 AND resolved_at_chapter <= ((c.chapter_number - 1) / {0}) * {0} + {0}) AS hooks_resolved,
            (SELECT COUNT(DISTINCT crh.chapter_number) 
             FROM chapter_review_history crh 
             WHERE crh.chapter_number >= ((c.chapter_number - 1) / {0}) * {0} + 1 
               AND crh.chapter_number <= ((c.chapter_number - 1) / {0}) * {0} + {0}
               AND crh.id IN (SELECT MAX(id) FROM chapter_review_history GROUP BY chapter_number)
               AND crh.passed = 0
            ) AS failed_reviews
        FROM chapters c
        GROUP BY start_chapter
        ORDER BY start_chapter ASC
    ", bucket_size);

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let iter = stmt.query_map([], |row| {
        Ok(ChapterBucket {
            start_chapter: row.get(0)?,
            end_chapter: row.get(1)?,
            chapter_count: row.get(2)?,
            content_length: row.get(3).unwrap_or(0),
            hooks_created: row.get(4).unwrap_or(0),
            hooks_resolved: row.get(5).unwrap_or(0),
            failed_reviews: row.get(6).unwrap_or(0),
        })
    }).map_err(|e| e.to_string())?;

    let mut buckets = Vec::new();
    for b in iter.flatten() {
        buckets.push(b);
    }
    Ok(buckets)
}

#[tauri::command]
pub fn get_board_chapter_list(state: State<DbState>, range_start: i32, range_end: i32) -> Result<Vec<BoardChapterListItem>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn.prepare("
        SELECT 
            c.chapter_number, c.title, c.status, LENGTH(c.content),
            (SELECT COUNT(id) FROM pending_hooks WHERE created_at_chapter = c.chapter_number) AS hooks_created,
            (SELECT COUNT(id) FROM pending_hooks WHERE resolved_at_chapter = c.chapter_number) AS hooks_resolved,
            crh.passed,
            crh.review_json
        FROM chapters c
        LEFT JOIN chapter_review_history crh ON crh.chapter_number = c.chapter_number AND crh.id = (SELECT MAX(id) FROM chapter_review_history WHERE chapter_number = c.chapter_number)
        WHERE c.chapter_number >= ?1 AND c.chapter_number <= ?2
        ORDER BY c.chapter_number ASC
    ").map_err(|e| e.to_string())?;

    let iter = stmt.query_map(rusqlite::params![range_start, range_end], |row| {
        let chapter_number: i32 = row.get(0)?;
        let title: String = row.get(1)?;
        let status: String = row.get(2)?;
        let content_length: usize = row.get(3).unwrap_or(0);
        let hooks_created: i32 = row.get(4).unwrap_or(0);
        let hooks_resolved: i32 = row.get(5).unwrap_or(0);
        let review_passed: Option<bool> = row.get(6).ok();
        let review_json: Option<String> = row.get(7).ok();
        
        let mut review_red_lights = 0;
        if let Some(json) = review_json {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&json) {
                if let Some(arr) = v.get("audit_reports").and_then(|a| a.as_array()) {
                    for a in arr {
                        if a.get("passed").and_then(|p| p.as_bool()) == Some(false) {
                            review_red_lights += 1;
                        }
                    }
                }
            }
        }

        Ok(BoardChapterListItem {
            chapter_number,
            title,
            status,
            content_length,
            hooks_created,
            hooks_resolved,
            review_passed,
            review_red_lights,
        })
    }).map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for i in iter.flatten() {
        list.push(i);
    }
    Ok(list)
}

#[tauri::command]
pub fn get_character_graph(
    state: State<DbState>,
    max_chapters: Option<i32>,
    max_nodes: Option<i32>,
) -> Result<CharacterGraph, String> {
    let max_chapters = max_chapters.unwrap_or(200).max(1);
    let max_nodes = max_nodes.unwrap_or(12).max(1) as usize;

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let mut char_stmt = conn
        .prepare("SELECT name FROM character_bibles ORDER BY id ASC")
        .map_err(|e| e.to_string())?;
    let char_iter = char_stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut names: Vec<String> = char_iter.flatten().collect();
    names.retain(|n| !n.trim().is_empty());
    if names.is_empty() {
        return Ok(CharacterGraph {
            nodes: vec![],
            edges: vec![],
        });
    }

    let mut ch_stmt = conn
        .prepare(
            "SELECT chapter_number, content FROM chapters
             WHERE content IS NOT NULL AND LENGTH(content) > 0
             ORDER BY chapter_number DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let ch_iter = ch_stmt
        .query_map([max_chapters], |row| Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let chapters: Vec<(i32, String)> = ch_iter.flatten().collect();

    let mut mentions: HashMap<String, i32> = HashMap::new();
    let mut edges: HashMap<(String, String), i32> = HashMap::new();

    for (_, content) in chapters {
        let mut present: Vec<String> = Vec::new();
        for name in names.iter() {
            if content.contains(name) {
                present.push(name.clone());
            }
        }
        present.sort();
        present.dedup();
        if present.is_empty() {
            continue;
        }
        for n in present.iter() {
            *mentions.entry(n.clone()).or_insert(0) += 1;
        }
        for i in 0..present.len() {
            for j in (i + 1)..present.len() {
                let a = present[i].clone();
                let b = present[j].clone();
                *edges.entry((a, b)).or_insert(0) += 1;
            }
        }
    }

    let mut nodes: Vec<CharacterGraphNode> = mentions
        .iter()
        .map(|(name, count)| CharacterGraphNode {
            id: name.clone(),
            label: name.clone(),
            mentions: *count,
        })
        .collect();
    nodes.sort_by(|a, b| b.mentions.cmp(&a.mentions));
    if nodes.len() > max_nodes {
        nodes.truncate(max_nodes);
    }

    let allowed: HashMap<String, bool> = nodes.iter().map(|n| (n.id.clone(), true)).collect();

    let mut edge_list: Vec<CharacterGraphEdge> = edges
        .into_iter()
        .filter_map(|((a, b), w)| {
            if allowed.contains_key(&a) && allowed.contains_key(&b) {
                Some(CharacterGraphEdge {
                    source: a,
                    target: b,
                    weight: w,
                })
            } else {
                None
            }
        })
        .collect();
    edge_list.sort_by(|a, b| b.weight.cmp(&a.weight));
    if edge_list.len() > 30 {
        edge_list.truncate(30);
    }

    Ok(CharacterGraph {
        nodes,
        edges: edge_list,
    })
}

// --- TESTS ---
#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        // Setup pending_hooks
        conn.execute(
            "CREATE TABLE pending_hooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hook_desc TEXT NOT NULL,
                created_at_chapter INTEGER NOT NULL,
                staleness INTEGER DEFAULT 0,
                is_resolved BOOLEAN DEFAULT FALSE,
                resolved_at_chapter INTEGER
            )",
            [],
        ).unwrap();
        conn
    }

    #[test]
    fn test_active_debt_tracker() {
        let conn = setup_test_db();
        
        // Insert one stale hook (staleness = 4)
        conn.execute(
            "INSERT INTO pending_hooks (hook_desc, created_at_chapter, staleness, is_resolved) 
             VALUES ('王家的秘密', 1, 4, FALSE)", []
        ).unwrap();

        // Insert one fresh hook (staleness = 1)
        conn.execute(
            "INSERT INTO pending_hooks (hook_desc, created_at_chapter, staleness, is_resolved) 
             VALUES ('刚挖的坑', 3, 1, FALSE)", []
        ).unwrap();

        // Query stale hooks
        let mut stmt = conn.prepare("SELECT hook_desc FROM pending_hooks WHERE is_resolved = FALSE AND staleness >= 3").unwrap();
        let rows: Vec<String> = stmt.query_map([], |row| row.get(0)).unwrap().map(|r| r.unwrap()).collect();

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0], "王家的秘密");
    }
}
