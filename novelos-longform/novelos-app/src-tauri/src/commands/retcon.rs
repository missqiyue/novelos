use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── RTN-002: Retcon Impact Analysis types ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AffectedVolume {
    pub volume_number: i64,
    pub title: Option<String>,
    pub chapter_start: Option<i64>,
    pub chapter_end: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AffectedCharacter {
    pub id: String,
    pub name: String,
    pub chapters_involved: Vec<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AffectedForeshadow {
    pub id: String,
    pub title: String,
    pub status: String,
    pub seed_chapter: i64,
    pub resolved_chapter: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FixScheme {
    pub name: String,
    pub description: String,
    pub estimated_work_chapters: i64,
}

// ─── RTN-003 / RTN-005 / RTN-006: Retcon workflow types ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExecutionPlan {
    pub retcon_id: String,
    pub status: String,
    pub affected_chapters: Vec<i64>,
    pub estimated_duration_seconds: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterCheckResult {
    pub chapter_number: i64,
    pub status: String,
    pub score: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PostCheckResult {
    pub passed_count: i32,
    pub failed_count: i32,
    pub needs_attention: Vec<ChapterCheckResult>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RetconImpactReport {
    pub target_type: String,
    pub target_ref: String,
    pub reason: String,
    pub affected_volumes: Vec<AffectedVolume>,
    pub affected_chapters: Vec<i64>,
    pub affected_characters: Vec<AffectedCharacter>,
    pub affected_foreshadows: Vec<AffectedForeshadow>,
    pub risk_level: String,
    pub fix_schemes: Vec<FixScheme>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RetconRequestInfo {
    pub id: String,
    pub project_id: String,
    pub request_type: String,
    pub target_type: String,
    pub target_ref: String,
    pub reason: String,
    pub impact_summary: Option<String>,
    pub risk_level: Option<String>,
    pub strategy: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub scheme: Option<String>,
    pub approved_at: Option<String>,
    pub rejection_reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateRetconRequestInput {
    pub target_type: String,
    pub target_ref: String,
    pub reason: String,
    pub request_type: Option<String>,
    pub impact_summary: Option<String>,
    pub risk_level: Option<String>,
    pub strategy: Option<String>,
}

/// Create a retcon request with status "pending".
#[tauri::command]
pub fn create_retcon_request(
    db: State<'_, DbState>,
    input: CreateRetconRequestInput,
) -> Result<RetconRequestInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let project_id = db.current_project_id().unwrap_or_default();
    let request_type = input
        .request_type
        .unwrap_or_else(|| "correction".to_string());

    conn.execute(
        "INSERT INTO retcon_requests (id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, ?11)",
        rusqlite::params![id, project_id, request_type, input.target_type, input.target_ref, input.reason, input.impact_summary, input.risk_level, input.strategy, now, now],
    )
    .map_err(|e| e.to_string())?;

    get_retcon_request_inner(conn, &id)
}

/// List all retcon requests ordered by created_at DESC.
#[tauri::command]
pub fn list_retcon_requests(db: State<'_, DbState>) -> Result<Vec<RetconRequestInfo>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at, scheme, approved_at, rejection_reason FROM retcon_requests ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let items = stmt
        .query_map([], map_retcon_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

/// Update the status of a retcon request (e.g., "approved", "rejected").
#[tauri::command]
pub fn update_retcon_status(
    db: State<'_, DbState>,
    id: String,
    status: String,
) -> Result<RetconRequestInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    let affected = conn
        .execute(
            "UPDATE retcon_requests SET status = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![status, now, id],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err("Retcon request not found".to_string());
    }

    get_retcon_request_inner(conn, &id)
}

/// Map a rusqlite row to a RetconRequestInfo.
fn map_retcon_row(row: &rusqlite::Row) -> rusqlite::Result<RetconRequestInfo> {
    Ok(RetconRequestInfo {
        id: row.get(0)?,
        project_id: row.get(1)?,
        request_type: row.get(2)?,
        target_type: row.get(3)?,
        target_ref: row.get(4)?,
        reason: row.get(5)?,
        impact_summary: row.get(6)?,
        risk_level: row.get(7)?,
        strategy: row.get(8)?,
        status: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        scheme: row.get(12)?,
        approved_at: row.get(13)?,
        rejection_reason: row.get(14)?,
    })
}

/// Look up a single retcon request by id.
pub fn get_retcon_request_inner(
    conn: &rusqlite::Connection,
    id: &str,
) -> Result<RetconRequestInfo, String> {
    conn.query_row(
        "SELECT id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at, scheme, approved_at, rejection_reason FROM retcon_requests WHERE id = ?1",
        [id],
        map_retcon_row,
    )
    .map_err(|e| e.to_string())
}

// ─── RTN-002: Retcon Impact Analysis ───

/// Analyze the impact of a retcon request on chapters, characters, foreshadows, and volumes.
/// Inner implementation that takes a connection directly (reusable by workflow).
pub fn analyze_retcon_impact_inner(
    conn: &rusqlite::Connection,
    target_type: &str,
    target_ref: &str,
    reason: &str,
) -> Result<RetconImpactReport, String> {
    let (affected_volumes, affected_chapters, affected_characters, affected_foreshadows) =
        match target_type {
            "chapter" => analyze_chapter_impact(conn, target_ref)?,
            "character" => analyze_character_impact(conn, target_ref)?,
            "canon" => analyze_canon_impact(conn, target_ref)?,
            other => {
                return Err(format!(
                    "Unknown target_type: {}. Expected 'chapter', 'character', or 'canon'",
                    other
                ))
            }
        };

    let total_affected = affected_volumes.len()
        + affected_chapters.len()
        + affected_characters.len()
        + affected_foreshadows.len();

    let risk_level = if affected_chapters.len() > 5 || total_affected > 10 {
        "high"
    } else if affected_chapters.len() > 2 || total_affected > 5 {
        "medium"
    } else {
        "low"
    };

    let fix_schemes =
        build_fix_schemes(risk_level, affected_chapters.len(), affected_volumes.len());

    Ok(RetconImpactReport {
        target_type: target_type.to_string(),
        target_ref: target_ref.to_string(),
        reason: reason.to_string(),
        affected_volumes,
        affected_chapters,
        affected_characters,
        affected_foreshadows,
        risk_level: risk_level.to_string(),
        fix_schemes,
    })
}

/// Tauri command wrapper for analyze_retcon_impact.
#[tauri::command]
pub fn analyze_retcon_impact(
    db: State<'_, DbState>,
    target_type: String,
    target_ref: String,
    reason: String,
) -> Result<RetconImpactReport, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    analyze_retcon_impact_inner(conn, &target_type, &target_ref, &reason)
}

/// Analyze impact when retcon target is a chapter.
fn analyze_chapter_impact(
    conn: &rusqlite::Connection,
    chapter_str: &str,
) -> Result<
    (
        Vec<AffectedVolume>,
        Vec<i64>,
        Vec<AffectedCharacter>,
        Vec<AffectedForeshadow>,
    ),
    String,
> {
    let chapter_number: i64 = chapter_str
        .parse()
        .map_err(|_| format!("Invalid chapter_number: {}", chapter_str))?;

    // Find affected volumes (volumes whose range contains this chapter)
    let mut stmt = conn
        .prepare("SELECT volume_number, title, chapter_start, chapter_end FROM volumes WHERE chapter_start <= ?1 AND chapter_end >= ?1")
        .map_err(|e| e.to_string())?;
    let affected_volumes: Vec<AffectedVolume> = stmt
        .query_map([chapter_number], |row| {
            Ok(AffectedVolume {
                volume_number: row.get(0)?,
                title: row.get(1)?,
                chapter_start: row.get(2)?,
                chapter_end: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Find affected chapters (direct — just this one, plus its range in volumes)
    let mut affected_chapter_numbers: Vec<i64> = vec![chapter_number];
    for vol in &affected_volumes {
        if let (Some(start), Some(end)) = (vol.chapter_start, vol.chapter_end) {
            for ch in start..=end {
                if !affected_chapter_numbers.contains(&ch) {
                    affected_chapter_numbers.push(ch);
                }
            }
        }
    }

    // Find characters appearing in the affected chapter range
    let affected_chapter_numbers_clone = affected_chapter_numbers.clone();
    let affected_characters = find_characters_in_chapters(conn, &affected_chapter_numbers_clone)?;

    // Find foreshadows planted or resolved in the affected chapter range
    let affected_foreshadows = find_foreshadows_in_chapters(conn, &affected_chapter_numbers)?;

    Ok((
        affected_volumes,
        affected_chapter_numbers,
        affected_characters,
        affected_foreshadows,
    ))
}

/// Analyze impact when retcon target is a character.
fn analyze_character_impact(
    conn: &rusqlite::Connection,
    character_id: &str,
) -> Result<
    (
        Vec<AffectedVolume>,
        Vec<i64>,
        Vec<AffectedCharacter>,
        Vec<AffectedForeshadow>,
    ),
    String,
> {
    // Get character name for event participant matching
    let (character_name, _role_type): (String, String) = conn
        .query_row(
            "SELECT name, role_type FROM characters WHERE id = ?1",
            [character_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Character not found: {}", e))?;

    let mut affected_chapters: Vec<i64> = Vec::new();

    // Find chapters from character_states (range-based appearance)
    {
        let mut stmt = conn
            .prepare(
                "SELECT chapter_from, chapter_to FROM character_states WHERE character_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let ranges: Vec<(Option<i64>, Option<i64>)> = stmt
            .query_map([character_id], |row| {
                Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for (ch_from, ch_to) in ranges {
            let start = ch_from.unwrap_or(1);
            let end = ch_to.unwrap_or(start + 10);
            for ch in start..=end {
                if !affected_chapters.contains(&ch) {
                    affected_chapters.push(ch);
                }
            }
        }
    }

    // Also find chapters from event_nodes where the character participates
    {
        let mut stmt = conn
            .prepare("SELECT DISTINCT chapter_number FROM event_nodes WHERE participants LIKE ?1 AND chapter_number IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let like_pattern = format!("%{}%", character_name);
        let event_chapters: Vec<i64> = stmt
            .query_map([&like_pattern], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<i64>, _>>()
            .map_err(|e| e.to_string())?;
        for ch in event_chapters {
            if !affected_chapters.contains(&ch) {
                affected_chapters.push(ch);
            }
        }
    }

    // Sort for readability
    affected_chapters.sort();

    // Find affected volumes
    let affected_volumes = if affected_chapters.is_empty() {
        Vec::new()
    } else {
        let min_ch = affected_chapters.first().copied().unwrap_or(1);
        let max_ch = affected_chapters.last().copied().unwrap_or(1);
        let mut stmt = conn
            .prepare("SELECT volume_number, title, chapter_start, chapter_end FROM volumes WHERE chapter_start <= ?2 AND chapter_end >= ?1")
            .map_err(|e| e.to_string())?;
        let result: Vec<AffectedVolume> = stmt
            .query_map([min_ch, max_ch], |row| {
                Ok(AffectedVolume {
                    volume_number: row.get(0)?,
                    title: row.get(1)?,
                    chapter_start: row.get(2)?,
                    chapter_end: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        result
    };

    // Build the affected character entry
    let affected_characters = vec![AffectedCharacter {
        id: character_id.to_string(),
        name: character_name.clone(),
        chapters_involved: affected_chapters.clone(),
    }];

    // Also find relationships involving this character
    // Add co-affected characters from relationships
    let mut all_affected_chars = affected_characters.clone();
    {
        let mut stmt = conn
            .prepare("SELECT source_character_id, target_character_id FROM relationship_states WHERE source_character_id = ?1 OR target_character_id = ?1")
            .map_err(|e| e.to_string())?;
        let related: Vec<(String, String)> = stmt
            .query_map([character_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for (src, tgt) in &related {
            let other_id = if src == character_id { tgt } else { src };
            if !all_affected_chars.iter().any(|c| &c.id == other_id) {
                let other_name: String = conn
                    .query_row(
                        "SELECT name FROM characters WHERE id = ?1",
                        [other_id],
                        |row| row.get(0),
                    )
                    .unwrap_or_else(|_| "未知角色".to_string());
                all_affected_chars.push(AffectedCharacter {
                    id: other_id.clone(),
                    name: other_name,
                    chapters_involved: affected_chapters.clone(),
                });
            }
        }
    }

    // Find foreshadows in affected chapters
    let affected_foreshadows = find_foreshadows_in_chapters(conn, &affected_chapters)?;

    Ok((
        affected_volumes,
        affected_chapters,
        all_affected_chars,
        affected_foreshadows,
    ))
}

/// Analyze impact when retcon target is a canon rule.
fn analyze_canon_impact(
    conn: &rusqlite::Connection,
    rule_id: &str,
) -> Result<
    (
        Vec<AffectedVolume>,
        Vec<i64>,
        Vec<AffectedCharacter>,
        Vec<AffectedForeshadow>,
    ),
    String,
> {
    // Get the rule content and name
    let (rule_name, content): (String, String) = conn
        .query_row(
            "SELECT rule_name, content FROM canon_rules WHERE id = ?1",
            [rule_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Canon rule not found: {}", e))?;

    // Extract key search terms: the rule_name and significant phrases from content
    let search_terms: Vec<String> = {
        let mut terms = vec![rule_name.clone()];
        // Split content by punctuation and take meaningful segments
        for seg in content.split(|c: char| c == '；' || c == ';' || c == '。' || c == '\n') {
            let trimmed = seg.trim();
            if trimmed.len() >= 4 {
                terms.push(trimmed.to_string());
            }
        }
        terms.truncate(10); // Limit search terms
        terms
    };

    let mut affected_chapters: Vec<i64> = Vec::new();

    // Search using FTS on chapters_fts for each search term
    for term in &search_terms {
        let safe_term = term.replace('"', "").replace('*', "");
        if safe_term.len() < 2 {
            continue;
        }
        let fts_query = format!("\"{}\"", safe_term);
        let mut stmt = match conn.prepare(
            "SELECT chapters.chapter_number FROM chapters INNER JOIN chapters_fts ON chapters.rowid = chapters_fts.rowid WHERE chapters_fts MATCH ?1"
        ) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let mut fts_chapters: Vec<i64> = Vec::new();
        if let Ok(rows) = stmt.query_map([&fts_query], |row| row.get::<_, i64>(0)) {
            for ch in rows.flatten() {
                fts_chapters.push(ch);
            }
        }
        for ch in fts_chapters {
            if !affected_chapters.contains(&ch) {
                affected_chapters.push(ch);
            }
        }
    }

    // Also try LIKE-based search for resilience
    {
        let like_pattern = format!("%{}%", rule_name);
        let mut stmt = conn
            .prepare("SELECT chapter_number FROM chapters WHERE draft_text LIKE ?1 AND chapter_number IS NOT NULL")
            .map_err(|e| e.to_string())?;
        let like_chapters: Vec<i64> = stmt
            .query_map([&like_pattern], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<i64>, _>>()
            .map_err(|e| e.to_string())?;
        for ch in like_chapters {
            if !affected_chapters.contains(&ch) {
                affected_chapters.push(ch);
            }
        }
    }

    affected_chapters.sort();

    // Find affected volumes
    let affected_volumes = if affected_chapters.is_empty() {
        Vec::new()
    } else {
        let min_ch = affected_chapters.first().copied().unwrap_or(1);
        let max_ch = affected_chapters.last().copied().unwrap_or(1);
        let mut stmt = conn
            .prepare("SELECT volume_number, title, chapter_start, chapter_end FROM volumes WHERE chapter_start <= ?2 AND chapter_end >= ?1")
            .map_err(|e| e.to_string())?;
        let result: Vec<AffectedVolume> = stmt
            .query_map([min_ch, max_ch], |row| {
                Ok(AffectedVolume {
                    volume_number: row.get(0)?,
                    title: row.get(1)?,
                    chapter_start: row.get(2)?,
                    chapter_end: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);
        result
    };

    // Characters in affected chapters
    let affected_characters = find_characters_in_chapters(conn, &affected_chapters)?;

    // Foreshadows in affected chapters
    let affected_foreshadows = find_foreshadows_in_chapters(conn, &affected_chapters)?;

    Ok((
        affected_volumes,
        affected_chapters,
        affected_characters,
        affected_foreshadows,
    ))
}

/// Helper: find characters whose state ranges overlap with given chapters.
fn find_characters_in_chapters(
    conn: &rusqlite::Connection,
    chapters: &[i64],
) -> Result<Vec<AffectedCharacter>, String> {
    if chapters.is_empty() {
        return Ok(Vec::new());
    }

    let mut result: Vec<AffectedCharacter> = Vec::new();
    // Use character_states to find characters active in the chapter range
    let min_ch = chapters.iter().min().copied().unwrap_or(1);
    let max_ch = chapters.iter().max().copied().unwrap_or(1);

    let mut stmt = conn
        .prepare(
            "SELECT cs.character_id, c.name, cs.chapter_from, cs.chapter_to \
             FROM character_states cs \
             JOIN characters c ON cs.character_id = c.id \
             WHERE (cs.chapter_from <= ?2 OR cs.chapter_from IS NULL) \
             AND (cs.chapter_to >= ?1 OR cs.chapter_to IS NULL)",
        )
        .map_err(|e| e.to_string())?;

    let chars: Vec<(String, String, Option<i64>, Option<i64>)> = stmt
        .query_map([min_ch, max_ch], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (char_id, char_name, ch_from, ch_to) in chars {
        let involved: Vec<i64> = {
            let start = ch_from.unwrap_or(min_ch);
            let end = ch_to.unwrap_or(max_ch);
            chapters
                .iter()
                .copied()
                .filter(|c| *c >= start && *c <= end)
                .collect()
        };
        if !involved.is_empty() {
            // Check if we already have this character
            if let Some(existing) = result.iter_mut().find(|c| c.id == char_id) {
                for ch in involved {
                    if !existing.chapters_involved.contains(&ch) {
                        existing.chapters_involved.push(ch);
                    }
                }
            } else {
                result.push(AffectedCharacter {
                    id: char_id,
                    name: char_name,
                    chapters_involved: involved,
                });
            }
        }
    }

    Ok(result)
}

/// Helper: find foreshadow items whose seed or resolution lies in the given chapters.
fn find_foreshadows_in_chapters(
    conn: &rusqlite::Connection,
    chapters: &[i64],
) -> Result<Vec<AffectedForeshadow>, String> {
    if chapters.is_empty() {
        return Ok(Vec::new());
    }

    // Build IN clause safely
    let placeholders: Vec<String> = chapters
        .iter()
        .enumerate()
        .map(|(i, _)| format!("?{}", i + 1))
        .collect();
    let in_clause = placeholders.join(",");
    let query = format!(
        "SELECT id, title, status, seed_chapter, resolved_chapter FROM foreshadow_items \
         WHERE seed_chapter IN ({}) OR resolved_chapter IN ({})",
        in_clause, in_clause
    );

    let params: Vec<rusqlite::types::Value> = chapters
        .iter()
        .flat_map(|c| {
            vec![
                rusqlite::types::Value::from(*c),
                rusqlite::types::Value::from(*c),
            ]
        })
        .collect();

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params
        .iter()
        .map(|v| v as &dyn rusqlite::types::ToSql)
        .collect();

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let items: Vec<AffectedForeshadow> = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(AffectedForeshadow {
                id: row.get(0)?,
                title: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                status: row.get(2)?,
                seed_chapter: row.get(3)?,
                resolved_chapter: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(items)
}

/// Build three fix schemes (后续补偿 / 局部回写 / 卷级重构) based on impact scope.
fn build_fix_schemes(
    risk_level: &str,
    chapter_count: usize,
    volume_count: usize,
) -> Vec<FixScheme> {
    let base_work = chapter_count.max(1) as i64;

    vec![
        FixScheme {
            name: "后续补偿".to_string(),
            description: "不修改已有章节，在后续章节中用剧情补偿/注释/闪回等方式修正。风险最低，但读者可能已经注意到不一致。".to_string(),
            estimated_work_chapters: match risk_level {
                "high" => base_work.min(5),
                "medium" => base_work.min(3),
                _ => base_work.min(2),
            },
        },
        FixScheme {
            name: "局部回写".to_string(),
            description: "仅修改受影响的具体章节段落，保持章节主体不变。适合中等风险、局部性的修订。".to_string(),
            estimated_work_chapters: base_work,
        },
        FixScheme {
            name: "卷级重构".to_string(),
            description: "对受影响卷进行整体重构，重写大纲、调整事件链、重新生成章节。适合高风险、结构性修订。".to_string(),
            estimated_work_chapters: (volume_count.max(1) as i64 * 10).max(base_work * 2),
        },
    ]
}

// ─── RTN-003: Select retcon scheme ───

/// Assign a fix scheme to a retcon request.
/// Valid scheme_type values: "compensation" | "local_rewrite" | "volume_restructure"
#[tauri::command]
pub fn select_retcon_scheme(
    db: State<'_, DbState>,
    retcon_id: String,
    scheme_type: String,
) -> Result<RetconRequestInfo, String> {
    let valid = ["compensation", "local_rewrite", "volume_restructure"];
    if !valid.contains(&scheme_type.as_str()) {
        return Err(format!(
            "Invalid scheme_type: '{}'. Must be one of: compensation, local_rewrite, volume_restructure",
            scheme_type
        ));
    }

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    let affected = conn
        .execute(
            "UPDATE retcon_requests SET scheme = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![scheme_type, now, retcon_id],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err("Retcon request not found".to_string());
    }

    get_retcon_request_inner(conn, &retcon_id)
}

// ─── RTN-004: Retcon approval workflow ───

/// Approve a pending retcon request. Records approved_at timestamp.
#[tauri::command]
pub fn approve_retcon(
    db: State<'_, DbState>,
    retcon_id: String,
) -> Result<RetconRequestInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    crate::db::transactions::approve_retcon_transaction(conn, &retcon_id)?;
    get_retcon_request_inner(conn, &retcon_id)
}

/// Reject a pending retcon request with a reason.
#[tauri::command]
pub fn reject_retcon(
    db: State<'_, DbState>,
    retcon_id: String,
    reason: String,
) -> Result<RetconRequestInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let current_status: String = conn
        .query_row(
            "SELECT status FROM retcon_requests WHERE id = ?1",
            [&retcon_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Retcon request not found: {}", e))?;

    if current_status != "pending" {
        return Err(format!(
            "Cannot reject retcon request in '{}' status. Must be 'pending'.",
            current_status
        ));
    }

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE retcon_requests SET status = 'rejected', rejection_reason = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![reason, now, retcon_id],
    )
    .map_err(|e| e.to_string())?;

    get_retcon_request_inner(conn, &retcon_id)
}

// ─── RTN-005: Retcon execution engine ───

/// Execute an approved retcon: set status to "executing" and return the execution plan.
/// The plan lists affected chapters and an estimated duration.
/// Actual chapter re-compilation is handled by the orchestrator.
#[tauri::command]
pub fn execute_retcon(db: State<'_, DbState>, retcon_id: String) -> Result<ExecutionPlan, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    // Atomic status transition: approved -> executing
    crate::db::transactions::retcon_status_transition(conn, &retcon_id, "approved", "executing")?;

    // Look up the request to get target_type / target_ref
    let request = get_retcon_request_inner(conn, &retcon_id)?;

    // Re-run impact analysis to discover affected chapters
    let (_, affected_chapters, _, _) = match request.target_type.as_str() {
        "chapter" => analyze_chapter_impact(conn, &request.target_ref)?,
        "character" => analyze_character_impact(conn, &request.target_ref)?,
        "canon" => analyze_canon_impact(conn, &request.target_ref)?,
        other => {
            return Err(format!(
                "Unknown target_type '{}'. Expected 'chapter', 'character', or 'canon'.",
                other
            ));
        }
    };

    // Estimate: roughly 30 seconds per affected chapter
    let estimated_duration_seconds = (affected_chapters.len() as i64) * 30;

    Ok(ExecutionPlan {
        retcon_id,
        status: "executing".to_string(),
        affected_chapters,
        estimated_duration_seconds,
    })
}

// ─── RTN-006: Retcon post-check ───

/// Run compilation checks on every chapter affected by a retcon.
/// Returns counts of passed/failed chapters and a list of chapters needing attention.
#[tauri::command]
pub fn retcon_post_check(
    db: State<'_, DbState>,
    retcon_id: String,
) -> Result<PostCheckResult, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    // Look up the request
    let request = get_retcon_request_inner(conn, &retcon_id)?;

    // Find affected chapters via impact analysis
    let (_, affected_chapters, _, _) = match request.target_type.as_str() {
        "chapter" => analyze_chapter_impact(conn, &request.target_ref)?,
        "character" => analyze_character_impact(conn, &request.target_ref)?,
        "canon" => analyze_canon_impact(conn, &request.target_ref)?,
        other => {
            return Err(format!(
                "Unknown target_type '{}'. Expected 'chapter', 'character', or 'canon'.",
                other
            ));
        }
    };

    let mut needs_attention: Vec<ChapterCheckResult> = Vec::new();
    let mut passed_count: i32 = 0;
    let mut failed_count: i32 = 0;

    for chapter_number in &affected_chapters {
        // Load the chapter's draft text (fall back to final_text if no draft)
        let draft_text: Option<String> = conn
            .query_row(
                "SELECT COALESCE(NULLIF(draft_text, ''), final_text) FROM chapters WHERE chapter_number = ?1",
                [chapter_number],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        let text = match draft_text {
            Some(t) if !t.trim().is_empty() => t,
            _ => {
                let r = ChapterCheckResult {
                    chapter_number: *chapter_number,
                    status: "warning".to_string(),
                    score: 0,
                };
                needs_attention.push(r);
                failed_count += 1;
                continue;
            }
        };

        // Run the compiler
        let result = crate::commands::compiler::do_compile(conn, &text, *chapter_number)?;

        if result.status == "pass" {
            passed_count += 1;
        } else {
            failed_count += 1;
            needs_attention.push(ChapterCheckResult {
                chapter_number: *chapter_number,
                status: result.status,
                score: result.score,
            });
        }
    }

    Ok(PostCheckResult {
        passed_count,
        failed_count,
        needs_attention,
    })
}

// ─── RTN-007: Retcon snapshot update ───

/// Result of updating snapshots after a retcon execution.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnapshotUpdateResult {
    pub retcon_id: String,
    pub snapshots_regenerated: i64,
    pub chapter_numbers: Vec<i64>,
}

/// Regenerate snapshots for all chapters affected by a retcon.
/// This should be called after execute_retcon + retcon_post_check to ensure
/// snapshots reflect the updated state.
#[tauri::command]
pub fn update_retcon_snapshots(
    db: State<'_, DbState>,
    retcon_id: String,
) -> Result<SnapshotUpdateResult, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    // Look up the request
    let request = get_retcon_request_inner(conn, &retcon_id)?;

    if request.status != "executing" && request.status != "completed" {
        return Err(format!(
            "Cannot update snapshots for retcon in '{}' status. Must be 'executing' or 'completed'.",
            request.status
        ));
    }

    // Find affected chapters
    let (_, affected_chapters, _, _) = match request.target_type.as_str() {
        "chapter" => analyze_chapter_impact(conn, &request.target_ref)?,
        "character" => analyze_character_impact(conn, &request.target_ref)?,
        "canon" => analyze_canon_impact(conn, &request.target_ref)?,
        other => return Err(format!("Unknown target_type: {}", other)),
    };

    // Regenerate snapshots for each affected chapter
    let mut snapshots_regenerated: i64 = 0;
    for chapter_number in &affected_chapters {
        // Delete existing snapshots for this chapter
        conn.execute(
            "DELETE FROM snapshots WHERE snapshot_type = 'chapter' AND chapter_start = ?1 AND chapter_end = ?1",
            rusqlite::params![chapter_number],
        ).map_err(|e| e.to_string())?;

        // Generate new snapshot
        match crate::commands::snapshot::create_snapshot_for_chapter(
            conn,
            &project_id,
            *chapter_number,
        ) {
            Ok(_) => snapshots_regenerated += 1,
            Err(e) => {
                // Log error but continue with other chapters
                log::warn!(
                    "Failed to regenerate snapshot for chapter {}: {}",
                    chapter_number,
                    e
                );
            }
        }
    }

    // Mark retcon as completed
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE retcon_requests SET status = 'completed', updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, retcon_id],
    )
    .map_err(|e| e.to_string())?;

    // Create notification
    crate::commands::ledger::notify_pipeline_event(
        conn,
        &project_id,
        "retcon",
        "info",
        &format!("修史完成：已重新生成{}个章节快照", snapshots_regenerated),
    );

    Ok(SnapshotUpdateResult {
        retcon_id,
        snapshots_regenerated,
        chapter_numbers: affected_chapters,
    })
}
