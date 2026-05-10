use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── OUT-007: Outline Revision Workflow ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RevisionStep {
    AnalyzeImpact,
    Confirm,
    Propagate,
    Verify,
    Complete,
}

impl RevisionStep {
    pub fn label(&self) -> &str {
        match self {
            Self::AnalyzeImpact => "影响分析",
            Self::Confirm => "确认修改",
            Self::Propagate => "传播修改",
            Self::Verify => "验证连续性",
            Self::Complete => "完成",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutlineRevisionState {
    pub revision_id: String,
    pub target_type: String, // "volume_outline", "chapter_outline", "arc"
    pub target_id: String,
    pub change_description: String,
    pub current_step: String,
    pub impact: Option<crate::commands::outline::OutlineImpactReport>,
    pub confirmed: bool,
    pub propagated_chapters: Vec<i64>,
    pub warnings: Vec<String>,
}

/// OUT-007: Start an outline revision workflow.
/// Analyzes impact of a proposed outline change.
#[tauri::command]
pub fn start_outline_revision(
    db: State<'_, DbState>,
    target_type: String,
    target_id: String,
    change_description: String,
    volume_id: Option<String>,
    chapter_start: Option<i64>,
    chapter_end: Option<i64>,
) -> Result<OutlineRevisionState, String> {
    let valid_types = ["volume_outline", "chapter_outline", "arc"];
    if !valid_types.contains(&target_type.as_str()) {
        return Err(format!(
            "Invalid target_type: '{}'. Must be one of: volume_outline, chapter_outline, arc",
            target_type
        ));
    }

    // Run impact analysis
    let impact = analyze_outline_revision_impact(&db, volume_id, chapter_start, chapter_end)?;

    let mut warnings = Vec::new();
    if impact.affected_chapters.len() > 20 {
        warnings.push(format!(
            "修改影响{}章，范围较大，建议缩小修改范围",
            impact.affected_chapters.len()
        ));
    }
    if impact.risk_level == "high" {
        warnings.push("风险等级为高：范围内有多章已定稿，修改需谨慎".to_string());
    }
    if !impact.affected_foreshadows.is_empty() {
        warnings.push(format!(
            "影响{}个伏笔，需检查伏笔连续性",
            impact.affected_foreshadows.len()
        ));
    }

    let revision_id = uuid::Uuid::new_v4().to_string();

    Ok(OutlineRevisionState {
        revision_id,
        target_type,
        target_id,
        change_description,
        current_step: RevisionStep::Confirm.label().to_string(),
        impact: Some(impact.clone()),
        confirmed: false,
        propagated_chapters: Vec::new(),
        warnings,
    })
}

/// OUT-007: Confirm and propagate an outline revision.
/// Marks affected chapters as needing re-review and logs the change.
#[tauri::command]
pub fn confirm_outline_revision(
    db: State<'_, DbState>,
    revision_id: String,
    target_type: String,
    target_id: String,
    change_description: String,
    volume_id: Option<String>,
    chapter_start: Option<i64>,
    chapter_end: Option<i64>,
) -> Result<OutlineRevisionState, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();

    // Re-analyze to get affected chapters
    let impact =
        analyze_outline_revision_impact_with_conn(conn, volume_id, chapter_start, chapter_end)?;

    // Mark affected finalized chapters as needing re-review
    let mut propagated = Vec::new();
    for ch in &impact.affected_chapters {
        let current_status: String = conn
            .query_row(
                "SELECT status FROM chapters WHERE chapter_number = ?1",
                [ch],
                |r| r.get(0),
            )
            .unwrap_or_default();

        if current_status == "finalized" || current_status == "approved" {
            conn.execute(
                "UPDATE chapters SET review_status = 'needs_re_review', updated_at = ?1 WHERE chapter_number = ?2",
                rusqlite::params![now, ch],
            ).map_err(|e| e.to_string())?;
        }
        propagated.push(*ch);
    }

    // Log the revision event
    crate::commands::ledger::notify_pipeline_event(
        conn,
        &project_id,
        "outline_revision",
        "info",
        &format!(
            "大纲修正：{} - 影响{}章",
            change_description,
            propagated.len()
        ),
    );

    let mut warnings = Vec::new();
    if impact.affected_chapters.len() > 20 {
        warnings.push(format!("已标记{}章需要重新审阅", propagated.len()));
    }

    Ok(OutlineRevisionState {
        revision_id,
        target_type,
        target_id,
        change_description,
        current_step: RevisionStep::Complete.label().to_string(),
        impact: Some(impact),
        confirmed: true,
        propagated_chapters: propagated,
        warnings,
    })
}

fn analyze_outline_revision_impact(
    db: &State<'_, DbState>,
    volume_id: Option<String>,
    chapter_start: Option<i64>,
    chapter_end: Option<i64>,
) -> Result<crate::commands::outline::OutlineImpactReport, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    analyze_outline_revision_impact_with_conn(conn, volume_id, chapter_start, chapter_end)
}

fn analyze_outline_revision_impact_with_conn(
    conn: &rusqlite::Connection,
    volume_id: Option<String>,
    chapter_start: Option<i64>,
    chapter_end: Option<i64>,
) -> Result<crate::commands::outline::OutlineImpactReport, String> {
    let (start, end) = if let Some(ref vid) = volume_id {
        let (s, e): (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT chapter_start, chapter_end FROM volumes WHERE id = ?1",
                [vid],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        (s.unwrap_or(1), e.unwrap_or(1))
    } else {
        (chapter_start.unwrap_or(1), chapter_end.unwrap_or(1))
    };

    let mut stmt = conn.prepare(
        "SELECT chapter_number FROM chapters WHERE chapter_number BETWEEN ?1 AND ?2 ORDER BY chapter_number"
    ).map_err(|e| e.to_string())?;
    let affected_chapters: Vec<i64> = stmt
        .query_map([start, end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT volume_number FROM volumes WHERE chapter_end >= ?1 AND chapter_start <= ?2",
        )
        .map_err(|e| e.to_string())?;
    let affected_volumes: Vec<i64> = stmt
        .query_map([start, end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT DISTINCT c.name FROM characters c JOIN character_states cs ON cs.character_id = c.id WHERE cs.chapter_from BETWEEN ?1 AND ?2"
    ).map_err(|e| e.to_string())?;
    let affected_characters: Vec<String> = stmt
        .query_map([start, end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT title FROM foreshadow_items WHERE seed_chapter BETWEEN ?1 AND ?2 OR (resolved_chapter BETWEEN ?1 AND ?2)"
    ).map_err(|e| e.to_string())?;
    let affected_foreshadows: Vec<String> = stmt
        .query_map([start, end], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let finalized_in_range: i64 = conn.query_row(
        "SELECT COUNT(*) FROM chapters WHERE chapter_number BETWEEN ?1 AND ?2 AND status IN ('finalized','approved')",
        [start, end], |r| r.get(0),
    ).unwrap_or(0);

    let risk_level = if finalized_in_range > 5 {
        "high"
    } else if finalized_in_range > 2 {
        "medium"
    } else {
        "low"
    };
    let mut suggestions = Vec::new();
    if finalized_in_range > 0 {
        suggestions.push(format!(
            "{}章已定稿，修改后需要重新审阅",
            finalized_in_range
        ));
    }
    if affected_foreshadows.len() > 3 {
        suggestions.push("修改范围内包含多个伏笔，需检查连续性".to_string());
    }

    Ok(crate::commands::outline::OutlineImpactReport {
        affected_volumes,
        affected_chapters,
        affected_characters,
        affected_foreshadows,
        risk_level: risk_level.to_string(),
        suggestions,
    })
}
