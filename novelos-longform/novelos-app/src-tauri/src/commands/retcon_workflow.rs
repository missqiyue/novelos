use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ─── WF-020~022: Retcon Workflow ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RetconWorkflowStep {
    CreateRequest,
    AnalyzeImpact,
    CheckHardRules,
    SelectScheme,
    Approve,
    Execute,
    PostCheck,
    UpdateSnapshots,
    Complete,
}

impl RetconWorkflowStep {
    pub fn label(&self) -> &str {
        match self {
            Self::CreateRequest => "创建修史申请",
            Self::AnalyzeImpact => "影响分析",
            Self::CheckHardRules => "硬规则检查",
            Self::SelectScheme => "选择修复方案",
            Self::Approve => "审批确认",
            Self::Execute => "执行修史",
            Self::PostCheck => "回归编译检查",
            Self::UpdateSnapshots => "更新快照",
            Self::Complete => "完成",
        }
    }

    pub fn id(&self) -> &str {
        match self {
            Self::CreateRequest => "create_request",
            Self::AnalyzeImpact => "analyze_impact",
            Self::CheckHardRules => "check_hard_rules",
            Self::SelectScheme => "select_scheme",
            Self::Approve => "approve",
            Self::Execute => "execute",
            Self::PostCheck => "post_check",
            Self::UpdateSnapshots => "update_snapshots",
            Self::Complete => "complete",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetconWorkflowState {
    pub retcon_id: String,
    pub current_step: String,
    pub steps_completed: Vec<String>,
    pub impact_report: Option<crate::commands::retcon::RetconImpactReport>,
    pub hard_rule_violation: bool,
    pub hard_rule_details: Option<String>,
    pub selected_scheme: Option<String>,
    pub execution_plan: Option<crate::commands::retcon::ExecutionPlan>,
    pub post_check_result: Option<crate::commands::retcon::PostCheckResult>,
    pub snapshot_result: Option<crate::commands::retcon::SnapshotUpdateResult>,
    pub warnings: Vec<String>,
}

/// WF-020: Start the retcon workflow.
/// Creates retcon request, runs impact analysis, checks hard rules.
/// Returns workflow state so the frontend can present options to the user.
#[tauri::command]
pub fn start_retcon_workflow(
    db: State<'_, DbState>,
    target_type: String,
    target_ref: String,
    reason: String,
) -> Result<RetconWorkflowState, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();

    // Step 1: Create retcon request directly
    let id = uuid::Uuid::new_v4().to_string();
    let request_type = "correction".to_string();
    conn.execute(
        "INSERT INTO retcon_requests (id, project_id, request_type, target_type, target_ref, reason, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8)",
        rusqlite::params![id, project_id, request_type, target_type, target_ref, reason, now, now],
    ).map_err(|e| e.to_string())?;

    // Step 2: Run impact analysis
    let impact_report = crate::commands::retcon::analyze_retcon_impact_inner(
        conn,
        &target_type,
        &target_ref,
        &reason,
    )?;

    // Step 3: Check hard rules
    let hard_rule_violation = check_hard_rule_impact(conn, &target_type, &target_ref)?;
    let hard_rule_details = if hard_rule_violation {
        Some(get_hard_rule_details(conn, &target_type, &target_ref)?)
    } else {
        None
    };

    // Update the retcon request with impact info
    let _ = conn.execute(
        "UPDATE retcon_requests SET impact_summary = ?1, risk_level = ?2, updated_at = ?3 WHERE id = ?4",
        rusqlite::params![
            serde_json::to_string(&impact_report).unwrap_or_default(),
            impact_report.risk_level,
            now, id,
        ],
    );

    let mut warnings = Vec::new();

    // WF-021: Check if impact scope is too large (>100 chapters)
    if impact_report.affected_chapters.len() > 100 {
        warnings.push(format!(
            "修史影响范围超过100章（{}章），建议缩小修改范围或确认是否继续",
            impact_report.affected_chapters.len()
        ));
    }

    if hard_rule_violation {
        warnings.push("此修史请求触及硬规则，需要额外审批确认".to_string());
    }

    Ok(RetconWorkflowState {
        retcon_id: id,
        current_step: RetconWorkflowStep::SelectScheme.label().to_string(),
        steps_completed: vec![
            RetconWorkflowStep::CreateRequest.label().to_string(),
            RetconWorkflowStep::AnalyzeImpact.label().to_string(),
            RetconWorkflowStep::CheckHardRules.label().to_string(),
        ],
        impact_report: Some(impact_report),
        hard_rule_violation,
        hard_rule_details,
        selected_scheme: None,
        execution_plan: None,
        post_check_result: None,
        snapshot_result: None,
        warnings,
    })
}

/// WF-020 continued: Continue after user selects a scheme and approves.
#[tauri::command]
pub fn continue_retcon_workflow(
    db: State<'_, DbState>,
    retcon_id: String,
    scheme_type: String,
    confirm: bool,
) -> Result<RetconWorkflowState, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    // Step 4: Select scheme
    let valid = ["compensation", "local_rewrite", "volume_restructure"];
    if !valid.contains(&scheme_type.as_str()) {
        return Err(format!("Invalid scheme_type: '{}'. Must be one of: compensation, local_rewrite, volume_restructure", scheme_type));
    }

    conn.execute(
        "UPDATE retcon_requests SET scheme = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![scheme_type, now, retcon_id],
    )
    .map_err(|e| e.to_string())?;

    if !confirm {
        return Ok(RetconWorkflowState {
            retcon_id,
            current_step: RetconWorkflowStep::Approve.label().to_string(),
            steps_completed: vec![RetconWorkflowStep::SelectScheme.label().to_string()],
            impact_report: None,
            hard_rule_violation: false,
            hard_rule_details: None,
            selected_scheme: Some(scheme_type),
            execution_plan: None,
            post_check_result: None,
            snapshot_result: None,
            warnings: vec!["等待用户确认后才能继续执行".to_string()],
        });
    }

    // Step 5: Approve
    let current_status: String = conn
        .query_row(
            "SELECT status FROM retcon_requests WHERE id = ?1",
            [&retcon_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("Retcon request not found: {}", e))?;

    if current_status != "pending" {
        return Err(format!(
            "Cannot approve retcon in '{}' status. Must be 'pending'.",
            current_status
        ));
    }

    conn.execute(
        "UPDATE retcon_requests SET status = 'approved', approved_at = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![now, now, retcon_id],
    ).map_err(|e| e.to_string())?;

    // Step 6: Execute
    let request = crate::commands::retcon::get_retcon_request_inner(conn, &retcon_id)?;
    conn.execute(
        "UPDATE retcon_requests SET status = 'executing', updated_at = ?1 WHERE id = ?2",
        rusqlite::params![now, retcon_id],
    )
    .map_err(|e| e.to_string())?;

    let impact = crate::commands::retcon::analyze_retcon_impact_inner(
        conn,
        &request.target_type,
        &request.target_ref,
        &request.reason,
    )?;
    let affected_chapters = impact.affected_chapters;

    let estimated_duration_seconds = (affected_chapters.len() as i64) * 30;
    let execution_plan = crate::commands::retcon::ExecutionPlan {
        retcon_id: retcon_id.clone(),
        status: "executing".to_string(),
        affected_chapters,
        estimated_duration_seconds,
    };

    Ok(RetconWorkflowState {
        retcon_id,
        current_step: RetconWorkflowStep::PostCheck.label().to_string(),
        steps_completed: vec![
            RetconWorkflowStep::SelectScheme.label().to_string(),
            RetconWorkflowStep::Approve.label().to_string(),
            RetconWorkflowStep::Execute.label().to_string(),
        ],
        impact_report: None,
        hard_rule_violation: false,
        hard_rule_details: None,
        selected_scheme: Some(scheme_type),
        execution_plan: Some(execution_plan),
        post_check_result: None,
        snapshot_result: None,
        warnings: Vec::new(),
    })
}

/// WF-020 final: Complete the retcon workflow (post-check + snapshot update).
#[tauri::command]
pub fn complete_retcon_workflow(
    db: State<'_, DbState>,
    retcon_id: String,
) -> Result<RetconWorkflowState, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();

    // Step 7: Post-check — run compiler on affected chapters
    let request = crate::commands::retcon::get_retcon_request_inner(conn, &retcon_id)?;

    let impact = crate::commands::retcon::analyze_retcon_impact_inner(
        conn,
        &request.target_type,
        &request.target_ref,
        &request.reason,
    )?;
    let affected_chapters = impact.affected_chapters;

    let mut needs_attention: Vec<crate::commands::retcon::ChapterCheckResult> = Vec::new();
    let mut passed_count: i32 = 0;
    let mut failed_count: i32 = 0;

    for chapter_number in &affected_chapters {
        let draft_text: Option<String> = conn.query_row(
            "SELECT COALESCE(NULLIF(draft_text, ''), final_text) FROM chapters WHERE chapter_number = ?1",
            [chapter_number], |row| row.get(0),
        ).ok().flatten();

        let text = match draft_text {
            Some(t) if !t.trim().is_empty() => t,
            _ => {
                needs_attention.push(crate::commands::retcon::ChapterCheckResult {
                    chapter_number: *chapter_number,
                    status: "warning".to_string(),
                    score: 0,
                });
                failed_count += 1;
                continue;
            }
        };

        let result = crate::commands::compiler::do_compile(conn, &text, *chapter_number)?;
        if result.status == "pass" {
            passed_count += 1;
        } else {
            failed_count += 1;
            needs_attention.push(crate::commands::retcon::ChapterCheckResult {
                chapter_number: *chapter_number,
                status: result.status,
                score: result.score,
            });
        }
    }

    let post_check = crate::commands::retcon::PostCheckResult {
        passed_count,
        failed_count,
        needs_attention,
    };

    let mut warnings = Vec::new();
    if post_check.failed_count > 0 {
        warnings.push(format!(
            "有{}章回归编译失败，需要人工检查",
            post_check.failed_count
        ));
    }

    // Step 8: Update snapshots — regenerate for each affected chapter
    let mut snapshots_regenerated: i64 = 0;
    for chapter_number in &affected_chapters {
        conn.execute(
            "DELETE FROM snapshots WHERE snapshot_type = 'chapter' AND chapter_start = ?1 AND chapter_end = ?1",
            rusqlite::params![chapter_number],
        ).map_err(|e| e.to_string())?;

        match crate::commands::snapshot::create_snapshot_for_chapter(
            conn,
            &project_id,
            *chapter_number,
        ) {
            Ok(_) => snapshots_regenerated += 1,
            Err(e) => {
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

    crate::commands::ledger::notify_pipeline_event(
        conn,
        &project_id,
        "retcon",
        "info",
        &format!("修史完成：已重新生成{}个章节快照", snapshots_regenerated),
    );

    let snapshot_result = crate::commands::retcon::SnapshotUpdateResult {
        retcon_id: retcon_id.clone(),
        snapshots_regenerated,
        chapter_numbers: affected_chapters,
    };

    Ok(RetconWorkflowState {
        retcon_id,
        current_step: RetconWorkflowStep::Complete.label().to_string(),
        steps_completed: vec![
            RetconWorkflowStep::PostCheck.label().to_string(),
            RetconWorkflowStep::UpdateSnapshots.label().to_string(),
        ],
        impact_report: None,
        hard_rule_violation: false,
        hard_rule_details: None,
        selected_scheme: None,
        execution_plan: None,
        post_check_result: Some(post_check),
        snapshot_result: Some(snapshot_result),
        warnings,
    })
}

/// WF-022: Rollback a partially-executed retcon.
#[tauri::command]
pub fn rollback_retcon(
    db: State<'_, DbState>,
    retcon_id: String,
    reason: String,
) -> Result<RetconWorkflowState, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE retcon_requests SET status = 'rolled_back', rejection_reason = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![reason, now, retcon_id],
    ).map_err(|e| e.to_string())?;

    crate::commands::ledger::notify_pipeline_event(
        conn,
        &project_id,
        "retcon",
        "warning",
        &format!("修史已回滚：{}", reason),
    );

    Ok(RetconWorkflowState {
        retcon_id,
        current_step: "已回滚".to_string(),
        steps_completed: Vec::new(),
        impact_report: None,
        hard_rule_violation: false,
        hard_rule_details: None,
        selected_scheme: None,
        execution_plan: None,
        post_check_result: None,
        snapshot_result: None,
        warnings: vec![format!("修史已回滚: {}", reason)],
    })
}

// ─── Helpers ───

fn check_hard_rule_impact(
    conn: &rusqlite::Connection,
    target_type: &str,
    target_ref: &str,
) -> Result<bool, String> {
    match target_type {
        "canon" => {
            let is_hard: bool = conn
                .query_row(
                    "SELECT is_hard != 0 FROM canon_rules WHERE id = ?1",
                    [target_ref],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            Ok(is_hard)
        }
        "chapter" | "character" => {
            let mut stmt = conn.prepare(
                "SELECT rule_name, content FROM canon_rules WHERE status = 'active' AND is_hard = 1"
            ).map_err(|e| e.to_string())?;
            let hard_rules: Vec<(String, String)> = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();

            for (name, content) in &hard_rules {
                if content.contains(target_ref) || name.contains(target_ref) {
                    return Ok(true);
                }
            }
            Ok(false)
        }
        _ => Ok(false),
    }
}

fn get_hard_rule_details(
    conn: &rusqlite::Connection,
    target_type: &str,
    target_ref: &str,
) -> Result<String, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rule_name, content FROM canon_rules WHERE status = 'active' AND is_hard = 1",
        )
        .map_err(|e| e.to_string())?;
    let hard_rules: Vec<(String, String)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut details = String::new();
    for (name, content) in &hard_rules {
        if target_type == "canon" && target_ref == name {
            details.push_str(&format!("- {}: {}\n", name, content));
        } else if content.contains(target_ref) || name.contains(target_ref) {
            details.push_str(&format!("- {}: {}\n", name, content));
        }
    }
    Ok(details)
}
