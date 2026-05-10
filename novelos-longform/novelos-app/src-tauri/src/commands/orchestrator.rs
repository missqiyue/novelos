use crate::agent_io::{self, AgentInput, AgentOutput};
use crate::commands::agent::{log_agent_execution, run_agent};
use crate::commands::compiler;
use crate::commands::ledger::{notify_pipeline_event, notify_pipeline_event_with_entity};
use crate::commands::llm::LlmState;
use crate::commands::outline;
use crate::commands::recall;
use crate::compiler as compiler_mod;
use crate::db::DbState;
use crate::orchestrator;
use crate::rag::RagIntentFilter;
use futures::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::time::Instant;
use tauri::{AppHandle, Emitter, State};

/// Extract the CHAPTER_CONTENT block from structured draft_writer output.
/// Falls back to the original text if no === CHAPTER_CONTENT === tag is found.
fn extract_chapter_content(raw: &str) -> String {
    let re = regex::Regex::new(r"===\s*CHAPTER_CONTENT\s*===\s*([\s\S]*)\z").unwrap(); // safe: regex is a compile-time constant pattern
    if let Some(caps) = re.captures(raw) {
        let content = caps
            .get(1)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        if !content.is_empty() {
            return content;
        }
    }
    raw.to_string()
}

/// Event emitted to frontend on each pipeline step state change.
#[derive(Debug, Clone, Serialize)]
pub struct PipelineStepEvent {
    pub chapter_number: i64,
    pub run_id: String,
    pub step_index: usize,
    pub step_name: String,
    pub status: String,
    pub duration_ms: u64,
}

/// Run a single agent step and record status/duration/output.
/// Returns the duration in ms. Applies per-agent timeout.
async fn run_step(
    steps: &mut Vec<orchestrator::PipelineStep>,
    outputs: &mut Vec<Option<String>>,
    idx: usize,
    agent: &str,
    vars: HashMap<String, String>,
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    app: &AppHandle,
    chapter_number: i64,
    run_id: &str,
) -> u64 {
    let start = Instant::now();
    steps[idx].status = "running".to_string();
    let _ = app.emit(
        "pipeline-step",
        PipelineStepEvent {
            chapter_number,
            run_id: run_id.to_string(),
            step_index: idx,
            step_name: steps[idx].name.clone(),
            status: "running".to_string(),
            duration_ms: 0,
        },
    );
    log::info!(
        "Pipeline step [{}] '{}' starting (timeout: {}s)",
        idx,
        agent,
        orchestrator::get_agent_timeout(agent)
    );
    let timeout_secs = orchestrator::get_agent_timeout(agent);
    let agent_result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        run_agent(llm_state.clone(), db.clone(), agent.to_string(), vars),
    )
    .await;
    match agent_result {
        Ok(Ok(result)) => {
            log::info!(
                "Pipeline step [{}] '{}' completed in {}ms",
                idx,
                agent,
                start.elapsed().as_millis()
            );
            steps[idx].status = "completed".to_string();
            steps[idx].output = Some(result.content.clone());
            outputs[idx] = Some(result.content);
        }
        Ok(Err(e)) => {
            log::error!("Pipeline step [{}] '{}' failed: {}", idx, agent, e);
            steps[idx].status = "failed".to_string();
            steps[idx].output = Some(e.clone());
            // Don't pass error message as usable output — downstream fallback logic depends on None
        }
        Err(_) => {
            let msg = format!("Agent {} 超时（{}秒）", agent, timeout_secs);
            log::error!("{}", msg);
            steps[idx].status = "failed".to_string();
            steps[idx].output = Some(msg);
            // Don't pass timeout message as usable output — downstream fallback logic depends on None
        }
    }
    let duration_ms = start.elapsed().as_millis() as u64;
    steps[idx].duration_ms = duration_ms;
    let _ = app.emit(
        "pipeline-step",
        PipelineStepEvent {
            chapter_number,
            run_id: run_id.to_string(),
            step_index: idx,
            step_name: steps[idx].name.clone(),
            status: steps[idx].status.clone(),
            duration_ms,
        },
    );
    duration_ms
}

/// Send a pipeline event notification (NTF-005)
fn send_pipeline_notif(db: &State<'_, DbState>, step_name: &str, status: &str, duration_ms: u64) {
    let project_conn = match db.lock_project() {
        Ok(guard) => guard,
        Err(e) => {
            log::warn!("Failed to lock project DB for pipeline notification: {}", e);
            return;
        }
    };
    if let Some(ref conn) = *project_conn {
        let project_id = db.current_project_id().unwrap_or_default();
        let severity = if status == "completed" {
            "info"
        } else {
            "error"
        };
        let message = format!("{} - {} ({}ms)", step_name, status, duration_ms);
        notify_pipeline_event(conn, &project_id, "pipeline_step", severity, &message);
    }
}

fn pipeline_run_entity_id(chapter_number: i64, run_id: &str) -> String {
    format!("chapter:{}:run:{}", chapter_number, run_id)
}

fn format_pipeline_step_message(
    chapter_number: i64,
    step_name: &str,
    status: &str,
    duration_ms: u64,
) -> String {
    let status_label = match status {
        "running" => "开始执行".to_string(),
        "completed" => format!("已完成 ({}ms)", duration_ms),
        "completed_with_errors" => format!("已完成，但存在阻断问题 ({}ms)", duration_ms),
        "failed" => format!("执行失败 ({}ms)", duration_ms),
        "skipped" => "已跳过".to_string(),
        other => other.to_string(),
    };
    format!("第{}章 · {} · {}", chapter_number, step_name, status_label)
}

fn send_pipeline_progress_notif(
    db: &State<'_, DbState>,
    chapter_number: i64,
    run_id: &str,
    step_name: &str,
    status: &str,
    duration_ms: u64,
) {
    let project_conn = match db.lock_project() {
        Ok(guard) => guard,
        Err(e) => {
            log::warn!(
                "Failed to lock project DB for pipeline progress notification: {}",
                e
            );
            return;
        }
    };
    if let Some(ref conn) = *project_conn {
        let project_id = db.current_project_id().unwrap_or_default();
        let severity = match status {
            "failed" => "error",
            "completed_with_errors" => "warning",
            _ => "info",
        };
        let message = format_pipeline_step_message(chapter_number, step_name, status, duration_ms);
        let entity_id = pipeline_run_entity_id(chapter_number, run_id);
        notify_pipeline_event_with_entity(
            conn,
            &project_id,
            "pipeline_step",
            severity,
            &message,
            Some("chapter_pipeline_step"),
            Some(&entity_id),
        );
    }
}

fn send_pipeline_run_notif(
    db: &State<'_, DbState>,
    chapter_number: i64,
    run_id: &str,
    severity: &str,
    message: &str,
) {
    let project_conn = match db.lock_project() {
        Ok(guard) => guard,
        Err(e) => {
            log::warn!(
                "Failed to lock project DB for pipeline run notification: {}",
                e
            );
            return;
        }
    };
    if let Some(ref conn) = *project_conn {
        let project_id = db.current_project_id().unwrap_or_default();
        let entity_id = pipeline_run_entity_id(chapter_number, run_id);
        notify_pipeline_event_with_entity(
            conn,
            &project_id,
            "pipeline",
            severity,
            message,
            Some("chapter_pipeline"),
            Some(&entity_id),
        );
    }
}

fn save_pipeline_result(
    db: &State<'_, DbState>,
    chapter_number: i64,
    result: &orchestrator::PipelineResult,
) -> Result<(), String> {
    let project_conn = db.lock_project()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();
    let result_json = serde_json::to_string(result).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO chapter_pipeline_runs (
            id, project_id, chapter_number, run_id, result_json, chapter_status,
            compiler_score, review_verdict, review_score, total_duration_ms, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            project_id,
            chapter_number,
            result.run_id,
            result_json,
            result.chapter_status,
            result.compiler_score,
            result.review_verdict,
            result.review_score,
            result.total_duration_ms as i64,
            now,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_latest_chapter_pipeline_result(
    db: State<'_, DbState>,
    chapter_number: i64,
) -> Result<Option<orchestrator::PipelineResult>, String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let result_json: Option<String> = conn
        .query_row(
            "SELECT result_json
             FROM chapter_pipeline_runs
             WHERE chapter_number = ?1
             ORDER BY created_at DESC
             LIMIT 1",
            rusqlite::params![chapter_number],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
        .map_err(|e| e.to_string())?;

    result_json
        .map(|json| serde_json::from_str(&json).map_err(|e| e.to_string()))
        .transpose()
}

/// Log agent I/O for a completed pipeline step (AGT-072).
/// Stores the structured log in agent_execution_logs.
fn log_agent_io_step(
    db: &State<'_, DbState>,
    agent_name: &str,
    step_name: &str,
    chapter_number: i64,
    output_content: &str,
    status: &str,
    duration_ms: u64,
) {
    let objective = format!("Pipeline step: {}", step_name);
    let input = AgentInput::new(&objective).with_chapter(chapter_number);
    let output = AgentOutput::from_content(output_content);
    let _log_json = agent_io::log_agent_input_output(agent_name, &input, &output, duration_ms);

    let project_id = db.current_project_id().unwrap_or_default();
    let input_preview = &objective;
    let output_preview: String = output_content.chars().take(500).collect();
    let _ = log_agent_execution(
        db,
        &project_id,
        agent_name,
        input_preview,
        &output_preview,
        status,
        duration_ms,
        0,
        if status == "failed" {
            Some("step failed")
        } else {
            None
        },
    );
}

/// Abort the pipeline after a critical step fails.
/// Marks remaining steps as "skipped" and returns a failed PipelineResult.
fn abort_pipeline(
    db: &State<'_, DbState>,
    chapter_number: i64,
    run_id: &str,
    mut steps: Vec<orchestrator::PipelineStep>,
    _outputs: Vec<Option<String>>,
    pipeline_start: Instant,
    failed_step: &str,
) -> Result<orchestrator::PipelineResult, String> {
    let total_duration_ms = pipeline_start.elapsed().as_millis() as u64;
    // Mark remaining pending steps as skipped
    for step in &mut steps {
        if step.status == "pending" {
            step.status = "skipped".to_string();
        }
    }
    send_pipeline_run_notif(
        db,
        chapter_number,
        run_id,
        "error",
        &format!(
            "第{}章全链路生成中止：关键步骤「{}」失败，总耗时 {:.1}s",
            chapter_number,
            failed_step,
            total_duration_ms as f64 / 1000.0
        ),
    );
    let result = orchestrator::PipelineResult {
        run_id: run_id.to_string(),
        chapter_status: "compile_failed".to_string(),
        compiler_score: None,
        review_verdict: None,
        review_score: None,
        steps,
        total_duration_ms,
        conflict_matrix: None,
    };
    if let Err(e) = save_pipeline_result(db, chapter_number, &result) {
        log::warn!("Failed to save aborted pipeline result: {}", e);
    }
    Ok(result)
}

#[tauri::command]
pub async fn run_chapter_pipeline(
    app: AppHandle,
    db: State<'_, DbState>,
    llm_state: State<'_, LlmState>,
    chapter_number: i64,
    run_id: Option<String>,
) -> Result<orchestrator::PipelineResult, String> {
    let steps = orchestrator::build_chapter_pipeline();
    let mut steps = steps;
    let pipeline_start = Instant::now();
    let run_id = run_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let mut outputs: Vec<Option<String>> = vec![None; steps.len()];
    let mut compile_blocked = false;

    send_pipeline_run_notif(
        &db,
        chapter_number,
        &run_id,
        "info",
        &format!(
            "第{}章全链路生成已启动，共{}步",
            chapter_number,
            steps.len()
        ),
    );

    // ─── Pre-assemble recall context using the recall system ───
    let (
        genre,
        lt,
        volume_ctx,
        chapter_outlines_ctx,
        soul_refs,
        relationship_states_ctx,
        style_guide,
        de_ai_rules_ctx,
        writing_patterns_ctx,
        intent_filter,
    ) = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;

        let genre = recall::fetch_genre(conn);
        let hard_rules = recall::fetch_hard_rules(conn);
        let character_states = recall::fetch_character_states(conn, chapter_number, None);
        let snapshot = recall::fetch_recent_snapshot(conn, chapter_number);
        let foreshadows = recall::fetch_foreshadows_and_events(conn, chapter_number);
        let soft_rules = recall::fetch_soft_rules(conn);
        let volume_ctx = recall::fetch_volume_outline(conn, chapter_number);
        let chapter_outlines_ctx = recall::fetch_chapter_outlines(conn, chapter_number);
        let soul_refs = recall::fetch_soul_templates(conn);
        let relationship_states_ctx = recall::fetch_relationship_states(conn);
        let style_guide = recall::fetch_style_guide(conn);
        let de_ai_rules_ctx = recall::fetch_de_ai_rules_summary(conn);

        // Fetch writing patterns from global DB, filtered by project genre
        let writing_patterns_ctx = {
            let global_conn = db.global.lock().map_err(|e| e.to_string())?;
            let genre_str = if genre.is_empty() || genre == "未设定" {
                None
            } else {
                Some(genre.as_str())
            };
            recall::fetch_writing_patterns(&global_conn, genre_str)
        };

        // Extract character names from character_states text for RAG intent boosting
        let character_names: Vec<String> = character_states
            .lines()
            .skip(1) // skip header "【角色状态】"
            .filter_map(|line| {
                line.trim()
                    .strip_prefix("- ")
                    .and_then(|rest| rest.split_whitespace().next().map(|s| s.to_string()))
            })
            .collect();

        // Extract foreshadow titles for RAG intent boosting
        let active_foreshadows: Vec<String> = foreshadows
            .lines()
            .filter(|line| line.contains("「") && line.contains("」"))
            .filter_map(|line| {
                let start = line.find("「")?;
                let end = line.find("」")?;
                Some(line[start + 3..end].to_string())
            })
            .collect();

        let intent_filter = if !character_names.is_empty() || !active_foreshadows.is_empty() {
            Some(RagIntentFilter {
                character_names: if character_names.is_empty() {
                    None
                } else {
                    Some(character_names)
                },
                pov_character: None,
                active_foreshadows: if active_foreshadows.is_empty() {
                    None
                } else {
                    Some(active_foreshadows)
                },
                chapter_range: None,
            })
        } else {
            None
        };

        // Combine hard+soft rules for canon_rules variable
        let canon_rules = if hard_rules.is_empty() && soft_rules.is_empty() {
            String::new()
        } else if soft_rules.is_empty() {
            hard_rules.clone()
        } else if hard_rules.is_empty() {
            soft_rules.clone()
        } else {
            format!("{}\n{}", hard_rules, soft_rules)
        };

        // Build a RecallLayerTexts-like struct for downstream use
        let lt = recall::RecallLayerTexts {
            hard_rules: hard_rules.clone(),
            character_states: character_states.clone(),
            snapshot: snapshot.clone(),
            foreshadows_events: foreshadows.clone(),
            soft_rules: soft_rules.clone(),
            canon_rules, // combined
            writing_patterns: writing_patterns_ctx.clone(),
            ..Default::default()
        };

        (
            genre,
            lt,
            volume_ctx,
            chapter_outlines_ctx,
            soul_refs,
            relationship_states_ctx,
            style_guide,
            de_ai_rules_ctx,
            writing_patterns_ctx,
            intent_filter,
        )
    };

    // Helper closures for fallback: use real data if available, else placeholder
    let canon_rules_text = |lt: &recall::RecallLayerTexts| -> String {
        if !lt.canon_rules.is_empty() {
            lt.canon_rules.clone()
        } else {
            "暂无正典规则".to_string()
        }
    };
    let soul_refs_text = || -> String {
        if !soul_refs.is_empty() {
            soul_refs.clone()
        } else {
            "暂无SOUL档案".to_string()
        }
    };
    let char_states_text = |lt: &recall::RecallLayerTexts| -> String {
        if !lt.character_states.is_empty() {
            lt.character_states.clone()
        } else {
            "暂无角色状态".to_string()
        }
    };
    let snapshot_text = |lt: &recall::RecallLayerTexts| -> String {
        if !lt.snapshot.is_empty() {
            lt.snapshot.clone()
        } else {
            "暂无快照".to_string()
        }
    };
    let foreshadows_text = |lt: &recall::RecallLayerTexts| -> String {
        if !lt.foreshadows_events.is_empty() {
            lt.foreshadows_events.clone()
        } else {
            "暂无伏笔".to_string()
        }
    };

    // Step 1: Generate task card
    {
        let mut vars = HashMap::new();
        vars.insert("genre".to_string(), genre.clone());
        vars.insert("current_volume".to_string(), "1".to_string());
        vars.insert("chapter_number".to_string(), chapter_number.to_string());
        vars.insert(
            "outline_context".to_string(),
            if volume_ctx.is_empty() {
                snapshot_text(&lt)
            } else {
                volume_ctx.clone()
            },
        );
        vars.insert("prev_chapters_summary".to_string(), snapshot_text(&lt));
        vars.insert("canon_rules".to_string(), canon_rules_text(&lt));
        vars.insert(
            "chapter_direction".to_string(),
            format!("第{}章写作方向", chapter_number),
        );
        send_pipeline_progress_notif(&db, chapter_number, &run_id, &steps[0].name, "running", 0);
        let dur = run_step(
            &mut steps,
            &mut outputs,
            0,
            "task_card",
            vars,
            llm_state.clone(),
            db.clone(),
            &app,
            chapter_number,
            &run_id,
        )
        .await;
        send_pipeline_notif(&db, &steps[0].name, &steps[0].status, dur);
        send_pipeline_progress_notif(
            &db,
            chapter_number,
            &run_id,
            &steps[0].name,
            &steps[0].status,
            dur,
        );
        log_agent_io_step(
            &db,
            "task_card",
            &steps[0].name,
            chapter_number,
            outputs[0].as_deref().unwrap_or(""),
            &steps[0].status,
            dur,
        );
        if steps[0].status == "failed" {
            log::error!("Pipeline aborted: critical step 生成任务卡 failed");
            return abort_pipeline(
                &db,
                chapter_number,
                &run_id,
                steps,
                outputs,
                pipeline_start,
                "生成任务卡",
            );
        }
    }

    // Step 2: Recall context
    {
        let task_card = outputs[0].clone().unwrap_or_default();
        let mut vars = HashMap::new();
        vars.insert("task_card".to_string(), task_card);
        vars.insert("canon_rules".to_string(), canon_rules_text(&lt));
        vars.insert("character_states".to_string(), char_states_text(&lt));
        vars.insert("prev_summaries".to_string(), snapshot_text(&lt));
        vars.insert("open_foreshadows".to_string(), foreshadows_text(&lt));
        // Pass intent filter info for RAG-boosted recall
        if let Some(ref filter) = intent_filter {
            if let Some(ref names) = filter.character_names {
                vars.insert("intent_characters".to_string(), names.join(","));
            }
            if let Some(ref fs) = filter.active_foreshadows {
                vars.insert("intent_foreshadows".to_string(), fs.join(","));
            }
        }
        send_pipeline_progress_notif(&db, chapter_number, &run_id, &steps[1].name, "running", 0);
        let dur = run_step(
            &mut steps,
            &mut outputs,
            1,
            "recall_agent",
            vars,
            llm_state.clone(),
            db.clone(),
            &app,
            chapter_number,
            &run_id,
        )
        .await;
        send_pipeline_notif(&db, &steps[1].name, &steps[1].status, dur);
        send_pipeline_progress_notif(
            &db,
            chapter_number,
            &run_id,
            &steps[1].name,
            &steps[1].status,
            dur,
        );
        log_agent_io_step(
            &db,
            "recall_agent",
            &steps[1].name,
            chapter_number,
            outputs[1].as_deref().unwrap_or(""),
            &steps[1].status,
            dur,
        );
        if steps[1].status == "failed" {
            log::warn!("Pipeline: recall_agent failed, continuing with empty recall");
        }
    }

    // Step 3: Chapter outline
    {
        let task_card = outputs[0].clone().unwrap_or_default();
        let mut vars = HashMap::new();
        vars.insert("task_card".to_string(), task_card);
        vars.insert(
            "volume_context".to_string(),
            if volume_ctx.is_empty() {
                snapshot_text(&lt)
            } else {
                volume_ctx.clone()
            },
        );
        vars.insert(
            "recent_chapter_outlines".to_string(),
            if chapter_outlines_ctx.is_empty() {
                snapshot_text(&lt)
            } else {
                chapter_outlines_ctx.clone()
            },
        );
        vars.insert("canon_rules".to_string(), canon_rules_text(&lt));
        vars.insert("soul_refs".to_string(), soul_refs_text());
        send_pipeline_progress_notif(&db, chapter_number, &run_id, &steps[2].name, "running", 0);
        let dur = run_step(
            &mut steps,
            &mut outputs,
            2,
            "chapter_outline",
            vars,
            llm_state.clone(),
            db.clone(),
            &app,
            chapter_number,
            &run_id,
        )
        .await;
        send_pipeline_notif(&db, &steps[2].name, &steps[2].status, dur);
        send_pipeline_progress_notif(
            &db,
            chapter_number,
            &run_id,
            &steps[2].name,
            &steps[2].status,
            dur,
        );
        log_agent_io_step(
            &db,
            "chapter_outline",
            &steps[2].name,
            chapter_number,
            outputs[2].as_deref().unwrap_or(""),
            &steps[2].status,
            dur,
        );
        if steps[2].status == "failed" {
            log::warn!("Pipeline: chapter_outline failed, continuing with task_card as outline");
        } else if let Some(ref outline_text) = outputs[2] {
            let project_conn = db.project.lock().map_err(|e| e.to_string())?;
            let conn = project_conn.as_ref().ok_or("No project open")?;
            let project_id = db.current_project_id().unwrap_or_default();
            let task_id = conn
                .query_row(
                    "SELECT task_id FROM chapters WHERE chapter_number = ?1",
                    [chapter_number],
                    |r| r.get::<_, Option<String>>(0),
                )
                .ok()
                .flatten();
            if let Err(e) = outline::save_generated_chapter_outline_inner(
                conn,
                &project_id,
                chapter_number,
                outline_text,
                task_id.as_deref(),
                Some("pipeline chapter_outline"),
            ) {
                log::warn!(
                    "Pipeline: failed to persist generated chapter outline for chapter {}: {}",
                    chapter_number,
                    e
                );
            }
        }
    }

    // Step 4: Draft writing (critical — abort if failed)
    {
        let task_card = outputs[0].clone().unwrap_or_default();
        let prev_summary = outputs[1].clone().unwrap_or_default();
        let chapter_outline = outputs[2].clone().unwrap_or_default();
        let mut vars = HashMap::new();
        vars.insert("task_card".to_string(), task_card);
        vars.insert("chapter_outline".to_string(), chapter_outline);
        vars.insert("canon_rules".to_string(), canon_rules_text(&lt));
        vars.insert("prev_summary".to_string(), prev_summary);
        vars.insert("min_words".to_string(), "2000".to_string());
        vars.insert("max_words".to_string(), "4000".to_string());
        vars.insert("soul_refs".to_string(), soul_refs_text());
        vars.insert(
            "writing_patterns".to_string(),
            if !writing_patterns_ctx.is_empty() {
                writing_patterns_ctx.clone()
            } else {
                String::new()
            },
        );
        send_pipeline_progress_notif(&db, chapter_number, &run_id, &steps[3].name, "running", 0);
        let dur = run_step(
            &mut steps,
            &mut outputs,
            3,
            "draft_writer",
            vars,
            llm_state.clone(),
            db.clone(),
            &app,
            chapter_number,
            &run_id,
        )
        .await;
        // DEBUG: check raw output for newlines
        if let Some(ref content) = outputs[3] {
            let newline_count = content.matches('\n').count();
            let double_newline_count = content.matches("\n\n").count();
            log::info!("[DEBUG draft_writer] content len: {}, \\n count: {}, \\n\\n count: {}, first 200 chars: {}",
                content.len(), newline_count, double_newline_count,
                &content.chars().take(200).collect::<String>()
            );
        }
        send_pipeline_notif(&db, &steps[3].name, &steps[3].status, dur);
        send_pipeline_progress_notif(
            &db,
            chapter_number,
            &run_id,
            &steps[3].name,
            &steps[3].status,
            dur,
        );
        log_agent_io_step(
            &db,
            "draft_writer",
            &steps[3].name,
            chapter_number,
            outputs[3].as_deref().unwrap_or(""),
            &steps[3].status,
            dur,
        );
        if steps[3].status == "failed" {
            log::error!("Pipeline aborted: critical step AI撰写草稿 failed");
            return abort_pipeline(
                &db,
                chapter_number,
                &run_id,
                steps,
                outputs,
                pipeline_start,
                "AI撰写草稿",
            );
        }
    }

    // Step 5: Voice filter
    {
        let raw_draft = outputs[3].clone().unwrap_or_default();
        let draft = extract_chapter_content(&raw_draft);
        if !draft.is_empty() {
            let mut vars = HashMap::new();
            vars.insert("draft_text".to_string(), draft);
            vars.insert("soul_refs".to_string(), soul_refs_text());
            vars.insert("de_ai_rules".to_string(), de_ai_rules_ctx.clone());
            send_pipeline_progress_notif(
                &db,
                chapter_number,
                &run_id,
                &steps[4].name,
                "running",
                0,
            );
            let dur = run_step(
                &mut steps,
                &mut outputs,
                4,
                "voice_filter",
                vars,
                llm_state.clone(),
                db.clone(),
                &app,
                chapter_number,
                &run_id,
            )
            .await;
            send_pipeline_notif(&db, &steps[4].name, &steps[4].status, dur);
            send_pipeline_progress_notif(
                &db,
                chapter_number,
                &run_id,
                &steps[4].name,
                &steps[4].status,
                dur,
            );
            log_agent_io_step(
                &db,
                "voice_filter",
                &steps[4].name,
                chapter_number,
                outputs[4].as_deref().unwrap_or(""),
                &steps[4].status,
                dur,
            );
        } else {
            steps[4].status = "skipped".to_string();
            steps[4].duration_ms = 0;
            send_pipeline_notif(&db, &steps[4].name, &steps[4].status, 0);
            send_pipeline_progress_notif(
                &db,
                chapter_number,
                &run_id,
                &steps[4].name,
                &steps[4].status,
                0,
            );
            log_agent_io_step(
                &db,
                "voice_filter",
                &steps[4].name,
                chapter_number,
                "",
                "skipped",
                0,
            );
        }
    }

    // Step 6: Compile
    {
        let start = Instant::now();
        steps[5].status = "running".to_string();
        let _ = app.emit(
            "pipeline-step",
            PipelineStepEvent {
                chapter_number,
                run_id: run_id.clone(),
                step_index: 5,
                step_name: steps[5].name.clone(),
                status: "running".to_string(),
                duration_ms: 0,
            },
        );
        send_pipeline_progress_notif(&db, chapter_number, &run_id, &steps[5].name, "running", 0);
        let raw_draft = outputs[4]
            .clone()
            .or_else(|| outputs[3].clone())
            .unwrap_or_default();
        let draft = extract_chapter_content(&raw_draft);
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        match compiler::do_compile(conn, &draft, chapter_number) {
            Ok(result) => {
                let blocked = compiler_mod::should_block_approval(&result);
                compile_blocked = blocked;
                if blocked {
                    steps[5].status = "completed_with_errors".to_string();
                } else {
                    steps[5].status = "completed".to_string();
                }
                let json = serde_json::to_string(&result).unwrap_or_default();
                steps[5].output = Some(json.clone());
                outputs[5] = Some(json);
            }
            Err(e) => {
                steps[5].status = "failed".to_string();
                outputs[5] = Some(e);
            }
        }
        steps[5].duration_ms = start.elapsed().as_millis() as u64;
    }
    // Drop project_conn before sending notification (needs fresh lock)
    {
        let dur = steps[5].duration_ms;
        let status = steps[5].status.clone();
        let _ = app.emit(
            "pipeline-step",
            PipelineStepEvent {
                chapter_number,
                run_id: run_id.clone(),
                step_index: 5,
                step_name: steps[5].name.clone(),
                status: status.clone(),
                duration_ms: dur,
            },
        );
        send_pipeline_notif(&db, &steps[5].name, &status, dur);
        send_pipeline_progress_notif(&db, chapter_number, &run_id, &steps[5].name, &status, dur);
        log_agent_io_step(
            &db,
            "compiler",
            &steps[5].name,
            chapter_number,
            outputs[5].as_deref().unwrap_or(""),
            &steps[5].status,
            dur,
        );
    }

    // ─── Steps 7-14: Expert reviews (AGT-039: 8 parallel experts via tokio::join!) ───
    {
        let raw_draft = outputs[4]
            .clone()
            .or_else(|| outputs[3].clone())
            .unwrap_or_default();
        let draft_for_review = extract_chapter_content(&raw_draft);
        let task_card = outputs[0].clone().unwrap_or_default();

        for i in 6..=13 {
            steps[i].status = "running".to_string();
            let _ = app.emit(
                "pipeline-step",
                PipelineStepEvent {
                    chapter_number,
                    run_id: run_id.clone(),
                    step_index: i,
                    step_name: steps[i].name.clone(),
                    status: "running".to_string(),
                    duration_ms: 0,
                },
            );
            send_pipeline_progress_notif(
                &db,
                chapter_number,
                &run_id,
                &steps[i].name,
                "running",
                0,
            );
        }

        let f6 = {
            let llm = llm_state.clone();
            let d = db.clone();
            let mut vars = HashMap::new();
            vars.insert("chapter_text".to_string(), draft_for_review.clone());
            vars.insert("task_card".to_string(), task_card.clone());
            vars.insert("prev_context".to_string(), snapshot_text(&lt));
            async move {
                let start = Instant::now();
                let result = run_agent(llm, d, "plot_expert".to_string(), vars).await;
                (6usize, result, start.elapsed().as_millis() as u64)
            }
        };
        let f7 = {
            let llm = llm_state.clone();
            let d = db.clone();
            let sr = soul_refs_text();
            let rs = if !relationship_states_ctx.is_empty() {
                relationship_states_ctx.clone()
            } else {
                "暂无关系数据".to_string()
            };
            let draft = draft_for_review.clone();
            async move {
                let start = Instant::now();
                let mut vars = HashMap::new();
                vars.insert("chapter_text".to_string(), draft);
                vars.insert("soul_refs".to_string(), sr);
                vars.insert("relationship_states".to_string(), rs);
                let result = run_agent(llm, d, "character_expert".to_string(), vars).await;
                (7usize, result, start.elapsed().as_millis() as u64)
            }
        };
        let f8 = {
            let llm = llm_state.clone();
            let d = db.clone();
            let rhythm = snapshot_text(&lt);
            let draft = draft_for_review.clone();
            async move {
                let start = Instant::now();
                let mut vars = HashMap::new();
                vars.insert("chapter_text".to_string(), draft);
                vars.insert("target_words".to_string(), "4000".to_string());
                vars.insert("prev_chapter_rhythm".to_string(), rhythm);
                let result = run_agent(llm, d, "pacing_expert".to_string(), vars).await;
                (8usize, result, start.elapsed().as_millis() as u64)
            }
        };
        let f9 = {
            let llm = llm_state.clone();
            let d = db.clone();
            let cr = canon_rules_text(&lt);
            let wf = if !volume_ctx.is_empty() {
                volume_ctx.clone()
            } else {
                genre.clone()
            };
            let draft = draft_for_review.clone();
            async move {
                let start = Instant::now();
                let mut vars = HashMap::new();
                vars.insert("chapter_text".to_string(), draft);
                vars.insert("canon_rules".to_string(), cr);
                vars.insert("world_framework".to_string(), wf);
                let result = run_agent(llm, d, "worldbuilding_expert".to_string(), vars).await;
                (9usize, result, start.elapsed().as_millis() as u64)
            }
        };
        let f10 = {
            let llm = llm_state.clone();
            let d = db.clone();
            let sg = if !style_guide.is_empty() {
                style_guide.clone()
            } else {
                "保持自然流畅的叙事风格".to_string()
            };
            let draft = draft_for_review.clone();
            let dar = de_ai_rules_ctx.clone();
            async move {
                let start = Instant::now();
                let mut vars = HashMap::new();
                vars.insert("chapter_text".to_string(), draft);
                vars.insert("de_ai_rules".to_string(), dar);
                vars.insert("style_guide".to_string(), sg);
                let result = run_agent(llm, d, "prose_expert".to_string(), vars).await;
                (10usize, result, start.elapsed().as_millis() as u64)
            }
        };
        let f11 = {
            let llm = llm_state.clone();
            let d = db.clone();
            let draft = draft_for_review.clone();
            let g = genre.clone();
            async move {
                let start = Instant::now();
                let mut vars = HashMap::new();
                vars.insert("chapter_text".to_string(), draft);
                vars.insert("genre".to_string(), g);
                vars.insert("target_audience".to_string(), "网文读者".to_string());
                let result = run_agent(llm, d, "commercial_expert".to_string(), vars).await;
                (11usize, result, start.elapsed().as_millis() as u64)
            }
        };
        let f12 = {
            let llm = llm_state.clone();
            let d = db.clone();
            let draft = draft_for_review.clone();
            let tc = task_card.clone();
            let g = genre.clone();
            async move {
                let start = Instant::now();
                let mut vars = HashMap::new();
                vars.insert("chapter_text".to_string(), draft);
                vars.insert("genre".to_string(), g);
                vars.insert("chapter_summary".to_string(), tc);
                let result = run_agent(llm, d, "reader_panel".to_string(), vars).await;
                (12usize, result, start.elapsed().as_millis() as u64)
            }
        };
        let f13 = {
            let llm = llm_state.clone();
            let d = db.clone();
            let draft = draft_for_review.clone();
            let dar = de_ai_rules_ctx.clone();
            async move {
                let start = Instant::now();
                let mut vars = HashMap::new();
                vars.insert("chapter_text".to_string(), draft);
                vars.insert("de_ai_rules".to_string(), dar);
                let result = run_agent(llm, d, "voice_audit".to_string(), vars).await;
                (13usize, result, start.elapsed().as_millis() as u64)
            }
        };

        // Run all 8 experts concurrently
        let (r6, r7, r8, r9, r10, r11, r12, r13) = tokio::join!(f6, f7, f8, f9, f10, f11, f12, f13);

        // Apply results and send NTF-005 notifications
        let expert_agent_names = [
            "plot_expert",
            "character_expert",
            "pacing_expert",
            "worldbuilding_expert",
            "prose_expert",
            "commercial_expert",
            "reader_panel",
            "voice_audit",
        ];
        for (i, (idx, result, duration)) in
            [r6, r7, r8, r9, r10, r11, r12, r13].into_iter().enumerate()
        {
            let (status, output) = match result {
                Ok(agent_result) => ("completed".to_string(), Some(agent_result.content)),
                Err(e) => ("failed".to_string(), Some(e)),
            };
            steps[idx].status = status.clone();
            steps[idx].output = output.clone();
            outputs[idx] = output;
            steps[idx].duration_ms = duration;
            let _ = app.emit(
                "pipeline-step",
                PipelineStepEvent {
                    chapter_number,
                    run_id: run_id.clone(),
                    step_index: idx,
                    step_name: steps[idx].name.clone(),
                    status: status.clone(),
                    duration_ms: duration,
                },
            );
            send_pipeline_notif(&db, &steps[idx].name, &steps[idx].status, duration);
            send_pipeline_progress_notif(
                &db,
                chapter_number,
                &run_id,
                &steps[idx].name,
                &steps[idx].status,
                duration,
            );
            let agent_name = expert_agent_names.get(i).unwrap_or(&"unknown");
            log_agent_io_step(
                &db,
                agent_name,
                &steps[idx].name,
                chapter_number,
                outputs[idx].as_deref().unwrap_or(""),
                &steps[idx].status,
                duration,
            );
        }
    }

    // Step 15: Review Chair (with conflict context)
    let conflict_matrix = {
        let expert_outputs: Vec<Option<String>> = outputs[6..14].to_vec();
        orchestrator::detect_review_conflicts(&expert_outputs)
    };

    {
        let expert_reports: Vec<String> = outputs[6..14]
            .iter()
            .enumerate()
            .map(|(i, o)| {
                let names = [
                    "情节",
                    "角色",
                    "节奏",
                    "世界观",
                    "文笔",
                    "商业性",
                    "读者模拟",
                    "AI痕迹审计",
                ];
                format!(
                    "{}专家评审报告:\n{}",
                    names.get(i).unwrap_or(&"未知"),
                    o.as_deref().unwrap_or("")
                )
            })
            .collect();

        let mut vars = HashMap::new();
        vars.insert("chapter_number".to_string(), chapter_number.to_string());
        vars.insert(
            "expert_reports".to_string(),
            expert_reports.join("\n\n---\n\n"),
        );
        if !conflict_matrix.conflicts.is_empty() {
            let conflict_summary: Vec<String> = conflict_matrix
                .conflicts
                .iter()
                .map(|c| format!("- [{}] {}", c.severity, c.topic))
                .collect();
            vars.insert(
                "detected_conflicts".to_string(),
                format!(
                    "以下专家评审存在冲突，请在终审时特别注意：\n{}",
                    conflict_summary.join("\n")
                ),
            );
        }
        send_pipeline_progress_notif(&db, chapter_number, &run_id, &steps[14].name, "running", 0);
        let dur = run_step(
            &mut steps,
            &mut outputs,
            14,
            "review_chair",
            vars,
            llm_state.clone(),
            db.clone(),
            &app,
            chapter_number,
            &run_id,
        )
        .await;
        send_pipeline_notif(&db, &steps[14].name, &steps[14].status, dur);
        send_pipeline_progress_notif(
            &db,
            chapter_number,
            &run_id,
            &steps[14].name,
            &steps[14].status,
            dur,
        );
        log_agent_io_step(
            &db,
            "review_chair",
            &steps[14].name,
            chapter_number,
            outputs[14].as_deref().unwrap_or(""),
            &steps[14].status,
            dur,
        );
    }

    let (evaluated_status, compiler_score, review_score) = orchestrator::evaluate_pipeline(&steps);
    let chapter_status = if compile_blocked {
        "compile_failed".to_string()
    } else {
        evaluated_status
    };
    let total_duration_ms = pipeline_start.elapsed().as_millis() as u64;

    send_pipeline_run_notif(
        &db,
        chapter_number,
        &run_id,
        if chapter_status == "approved" {
            "success"
        } else {
            "warning"
        },
        &format!(
            "第{}章全链路生成已结束：{}，总耗时 {:.1}s",
            chapter_number,
            if chapter_status == "approved" {
                "通过"
            } else {
                "需修改"
            },
            total_duration_ms as f64 / 1000.0
        ),
    );

    let result = orchestrator::PipelineResult {
        run_id,
        chapter_status: chapter_status.clone(),
        compiler_score,
        review_verdict: Some(chapter_status),
        review_score,
        steps,
        total_duration_ms,
        conflict_matrix: Some(conflict_matrix),
    };
    if let Err(e) = save_pipeline_result(&db, chapter_number, &result) {
        log::warn!("Failed to save pipeline result: {}", e);
    }
    Ok(result)
}

/// Batch chapter generation (WF-014) — run pipeline for multiple chapters.
///
/// Uses a concurrency window of `max_concurrent` chapters running in parallel.
/// Default concurrency is 1 (serial). Set to 2-3 for parallel generation,
/// but note this increases LLM API rate — may hit 429 limits.
///
/// Chapter dependency: each chapter must complete before the next one starts
/// when concurrency is 1. With concurrency > 1, chapters may overlap but
/// earlier chapters are prioritized in the queue.
#[tauri::command]
pub async fn run_batch_pipeline(
    app: AppHandle,
    db: State<'_, DbState>,
    llm_state: State<'_, LlmState>,
    start_chapter: i64,
    end_chapter: i64,
) -> Result<Vec<orchestrator::PipelineResult>, String> {
    run_batch_pipeline_with_concurrency(app, db, llm_state, start_chapter, end_chapter, 1).await
}

/// Batch pipeline with configurable concurrency.
#[tauri::command]
pub async fn run_batch_pipeline_concurrent(
    app: AppHandle,
    db: State<'_, DbState>,
    llm_state: State<'_, LlmState>,
    start_chapter: i64,
    end_chapter: i64,
    max_concurrent: usize,
) -> Result<Vec<orchestrator::PipelineResult>, String> {
    let concurrency = max_concurrent.max(1).min(5);
    run_batch_pipeline_with_concurrency(app, db, llm_state, start_chapter, end_chapter, concurrency)
        .await
}

async fn run_batch_pipeline_with_concurrency(
    app: AppHandle,
    db: State<'_, DbState>,
    llm_state: State<'_, LlmState>,
    start_chapter: i64,
    end_chapter: i64,
    max_concurrent: usize,
) -> Result<Vec<orchestrator::PipelineResult>, String> {
    let chapter_numbers: Vec<i64> = (start_chapter..=end_chapter).collect();
    let total = chapter_numbers.len();

    if max_concurrent <= 1 {
        // Serial execution (original behavior)
        let mut results = Vec::with_capacity(total);
        for chapter_number in chapter_numbers {
            let result = run_chapter_pipeline(
                app.clone(),
                db.clone(),
                llm_state.clone(),
                chapter_number,
                None,
            )
            .await?;
            results.push(result);
        }
        return Ok(results);
    }

    // Concurrent execution using futures::stream::buffered
    let futures_stream = futures::stream::iter(chapter_numbers.into_iter().map(|chapter_number| {
        let db = db.clone();
        let llm_state = llm_state.clone();
        let app = app.clone();
        async move { run_chapter_pipeline(app, db, llm_state, chapter_number, None).await }
    }))
    .buffered(max_concurrent);

    let results: Vec<Result<orchestrator::PipelineResult, String>> = futures_stream.collect().await;

    // Collect in order (buffered preserves order)
    results.into_iter().collect()
}
