use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── Types ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceHit {
    pub word: String,
    pub category: String,
    pub risk_level: String,
    pub suggestion: Option<String>,
    pub positions: Vec<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceScanResult {
    pub chapter_number: i64,
    pub total_hits: i64,
    pub high_risk_count: i64,
    pub medium_risk_count: i64,
    pub low_risk_count: i64,
    pub hits: Vec<ComplianceHit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComplianceWordEntry {
    pub id: String,
    pub word: String,
    pub category: String,
    pub risk_level: String,
    pub suggestion: Option<String>,
    pub is_builtin: bool,
}

// ─── Built-in Dictionary ───

fn builtin_words() -> Vec<(&'static str, &'static str, &'static str, Option<&'static str>)> {
    vec![
        // Politics — high risk
        ("国家领导人", "politics", "high", Some("改为'当权者'或虚构称谓")),
        ("政治局", "politics", "high", Some("删除或改为虚构机构名")),
        ("中南海", "politics", "high", Some("改为虚构地名")),
        ("文革", "politics", "high", Some("删除或改为'那场浩劫'")),
        ("六四", "politics", "high", Some("删除")),
        ("天安门", "politics", "high", Some("改为虚构广场名")),
        ("反革命", "politics", "high", Some("删除")),
        ("颠覆政权", "politics", "high", Some("改为'叛乱'")),
        ("分裂国家", "politics", "high", Some("改为'割据'")),
        ("游行示威", "politics", "high", Some("改为'抗议'或删除")),
        ("集体上访", "politics", "high", Some("删除")),
        ("翻墙", "politics", "medium", Some("改为'突破限制'")),
        ("敏感词", "politics", "medium", Some("删除")),
        ("审查", "politics", "medium", Some("改为'审核'")),
        // Violence
        ("自杀", "violence", "high", Some("改为'自我了断'或'轻生'")),
        ("自残", "violence", "medium", Some("改为'伤害自己'")),
        ("砍头", "violence", "medium", Some("改为'斩首'或'枭首'")),
        ("肢解", "violence", "high", Some("改为'碎尸'或降低描写程度")),
        ("碎尸", "violence", "high", Some("降低描写程度")),
        ("虐杀", "violence", "high", Some("改为'击杀'")),
        ("活埋", "violence", "high", Some("降低描写程度")),
        ("烹杀", "violence", "high", Some("删除")),
        ("强奸", "violence", "high", Some("改为'凌辱'或隐晦表达")),
        ("轮奸", "violence", "high", Some("删除")),
        ("性侵", "violence", "high", Some("改为'侵犯'")),
        ("猥亵", "violence", "high", Some("改为'轻薄'")),
        ("变态杀手", "violence", "medium", Some("改为'连环杀手'")),
        ("血腥屠杀", "violence", "high", Some("改为'血战'或降低程度")),
        ("恐怖袭击", "violence", "high", Some("改为'袭击'")),
        ("炸弹制作", "violence", "high", Some("删除具体方法")),
        ("制毒方法", "violence", "high", Some("删除")),
        // Sexual
        ("做爱", "sexual", "high", Some("改为'亲热'或隐晦表达")),
        ("性交", "sexual", "high", Some("删除或隐晦表达")),
        ("口交", "sexual", "high", Some("删除")),
        ("肛交", "sexual", "high", Some("删除")),
        ("自慰", "sexual", "high", Some("删除")),
        ("手淫", "sexual", "high", Some("删除")),
        ("性高潮", "sexual", "high", Some("改为'巅峰'")),
        ("呻吟", "sexual", "medium", Some("注意上下文，战斗场景可保留")),
        ("呻吟着", "sexual", "high", Some("改为'痛呼着'或删除")),
        ("脱光", "sexual", "high", Some("改为'褪去衣衫'")),
        ("赤裸", "sexual", "medium", Some("改为'衣衫尽褪'")),
        ("摸胸", "sexual", "high", Some("改为隐晦表达")),
        ("揉捏", "sexual", "high", Some("改为'轻抚'")),
        ("进入身体", "sexual", "high", Some("改为隐晦表达")),
        ("床上运动", "sexual", "high", Some("删除")),
        ("春药", "sexual", "medium", Some("改为'迷情散'等虚构名称")),
        ("催情", "sexual", "medium", Some("改为'惑心'")),
        ("媚药", "sexual", "medium", Some("改为虚构名称")),
        ("采补", "sexual", "medium", Some("注意上下文")),
        ("双修", "sexual", "low", Some("仙侠题材可保留，注意尺度")),
        // Drug
        ("海洛因", "drug", "high", Some("改为虚构毒物名")),
        ("冰毒", "drug", "high", Some("改为虚构毒物名")),
        ("可卡因", "drug", "high", Some("改为虚构毒物名")),
        ("大麻", "drug", "medium", Some("改为虚构草药")),
        ("吸毒", "drug", "high", Some("改为'服毒'")),
        ("贩毒", "drug", "high", Some("改为'走私违禁'")),
        ("毒瘾", "drug", "high", Some("改为'药瘾'")),
        ("摇头丸", "drug", "high", Some("删除或改为虚构")),
        // Gambling
        ("赌博", "gambling", "medium", Some("改为'博弈'")),
        ("赌场", "gambling", "medium", Some("改为'赌坊'")),
        ("地下赌庄", "gambling", "high", Some("改为虚构赌坊")),
        ("百家乐", "gambling", "high", Some("删除具体玩法")),
        ("老虎机", "gambling", "medium", Some("删除或虚构")),
        // Superstition
        ("邪教", "superstition", "high", Some("改为'邪派'或'魔教'")),
        ("封建迷信", "superstition", "medium", Some("改为'古老传说'")),
        ("算命先生", "superstition", "low", Some("仙侠题材可保留")),
        // Platform-specific rules
        ("点击链接", "platform_rule", "high", Some("删除外部引流")),
        ("扫码关注", "platform_rule", "high", Some("删除外部引流")),
        ("加群", "platform_rule", "high", Some("删除外部引流")),
        ("微信公众号", "platform_rule", "high", Some("删除")),
        ("微博", "platform_rule", "low", Some("现代题材可保留")),
        ("刷票", "platform_rule", "medium", Some("删除")),
        ("刷榜", "platform_rule", "medium", Some("改为'冲榜'")),
    ]
}

/// Create compliance_words table if not exists.
fn ensure_table(db: &DbState) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS compliance_words (
            id TEXT PRIMARY KEY,
            word TEXT NOT NULL,
            category TEXT NOT NULL,
            risk_level TEXT NOT NULL DEFAULT 'medium',
            suggestion TEXT,
            is_builtin INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_compliance_words_word ON compliance_words(word);",
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Seed built-in words if not already present.
fn seed_builtin_words(db: &DbState) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM compliance_words WHERE is_builtin = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count > 0 {
        return Ok(());
    }

    for (word, category, risk_level, suggestion) in builtin_words() {
        let id = format!("builtin_{}", &word[..word.len().min(20)]);
        let _ = conn.execute(
            "INSERT OR IGNORE INTO compliance_words (id, word, category, risk_level, suggestion, is_builtin) VALUES (?, ?, ?, ?, ?, 1)",
            rusqlite::params![id, word, category, risk_level, suggestion],
        );
    }
    Ok(())
}

/// Scan text against a word list, returning hits with positions.
fn scan_text(
    text: &str,
    words: &[(String, String, String, Option<String>)],
    chapter_number: i64,
) -> ComplianceScanResult {
    if text.trim().is_empty() {
        return ComplianceScanResult {
            chapter_number,
            total_hits: 0,
            high_risk_count: 0,
            medium_risk_count: 0,
            low_risk_count: 0,
            hits: vec![],
        };
    }

    let mut hits: Vec<ComplianceHit> = Vec::new();
    for (word, category, risk_level, suggestion) in words {
        let mut positions: Vec<usize> = Vec::new();
        let mut start = 0;
        while let Some(pos) = text[start..].find(word.as_str()) {
            positions.push(start + pos);
            start += pos + word.len();
            if positions.len() > 100 {
                break;
            }
        }
        if !positions.is_empty() {
            hits.push(ComplianceHit {
                word: word.clone(),
                category: category.clone(),
                risk_level: risk_level.clone(),
                suggestion: suggestion.clone(),
                positions,
            });
        }
    }

    let high_risk_count = hits.iter().filter(|h| h.risk_level == "high").count() as i64;
    let medium_risk_count = hits.iter().filter(|h| h.risk_level == "medium").count() as i64;
    let low_risk_count = hits.iter().filter(|h| h.risk_level == "low").count() as i64;

    ComplianceScanResult {
        chapter_number,
        total_hits: hits.len() as i64,
        high_risk_count,
        medium_risk_count,
        low_risk_count,
        hits,
    }
}

// ─── Commands ───

#[tauri::command]
pub fn scan_chapter_compliance(
    db: State<'_, DbState>,
    chapter_number: i64,
) -> Result<ComplianceScanResult, String> {
    ensure_table(&db)?;
    seed_builtin_words(&db)?;

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let draft_text: String = conn
        .query_row(
            "SELECT draft_text FROM chapters WHERE chapter_number = ?",
            [chapter_number],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT word, category, risk_level, suggestion FROM compliance_words")
        .map_err(|e| e.to_string())?;
    let words: Vec<(String, String, String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    drop(stmt);
    drop(project_conn);

    Ok(scan_text(&draft_text, &words, chapter_number))
}

#[tauri::command]
pub fn scan_all_chapters_compliance(
    db: State<'_, DbState>,
) -> Result<Vec<ComplianceScanResult>, String> {
    ensure_table(&db)?;
    seed_builtin_words(&db)?;

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare("SELECT word, category, risk_level, suggestion FROM compliance_words")
        .map_err(|e| e.to_string())?;
    let words: Vec<(String, String, String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    drop(stmt);

    let chapters: Vec<(i64, String)> = conn
        .prepare("SELECT chapter_number, draft_text FROM chapters ORDER BY chapter_number")
        .map_err(|e| e.to_string())?
        .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    drop(project_conn);

    Ok(chapters
        .into_iter()
        .map(|(cn, text)| scan_text(&text, &words, cn))
        .collect())
}

#[tauri::command]
pub fn list_compliance_words(db: State<'_, DbState>) -> Result<Vec<ComplianceWordEntry>, String> {
    ensure_table(&db)?;
    seed_builtin_words(&db)?;

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, word, category, risk_level, suggestion, is_builtin FROM compliance_words ORDER BY category, risk_level, word",
        )
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map([], |row| {
            Ok(ComplianceWordEntry {
                id: row.get(0)?,
                word: row.get(1)?,
                category: row.get(2)?,
                risk_level: row.get(3)?,
                suggestion: row.get::<_, Option<String>>(4)?,
                is_builtin: row.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(entries)
}

#[tauri::command]
pub fn add_compliance_word(
    db: State<'_, DbState>,
    word: String,
    category: String,
    risk_level: String,
    suggestion: Option<String>,
) -> Result<ComplianceWordEntry, String> {
    ensure_table(&db)?;

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = format!("custom_{}", chrono::Utc::now().timestamp_millis());
    conn.execute(
        "INSERT INTO compliance_words (id, word, category, risk_level, suggestion, is_builtin) VALUES (?, ?, ?, ?, ?, 0)",
        rusqlite::params![id, word, category, risk_level, suggestion],
    )
    .map_err(|e| e.to_string())?;

    Ok(ComplianceWordEntry {
        id,
        word,
        category,
        risk_level,
        suggestion,
        is_builtin: false,
    })
}

#[tauri::command]
pub fn delete_compliance_word(db: State<'_, DbState>, id: String) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let is_builtin: bool = conn
        .query_row(
            "SELECT is_builtin FROM compliance_words WHERE id = ?",
            [&id],
            |row| row.get::<_, i64>(0),
        )
        .map(|v| v != 0)
        .unwrap_or(false);

    if is_builtin {
        return Err("Cannot delete built-in compliance words".to_string());
    }

    conn.execute("DELETE FROM compliance_words WHERE id = ?", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}
