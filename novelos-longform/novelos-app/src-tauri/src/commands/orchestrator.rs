use crate::agent_io::{self, AgentInput, AgentOutput};
use crate::commands::agent::{log_agent_execution, run_agent};
use crate::commands::compiler;
use crate::commands::ledger::notify_pipeline_event;
use crate::commands::recall;
use crate::compiler as compiler_mod;
use crate::db::DbState;
use crate::commands::llm::LlmState;
use crate::orchestrator;
use std::collections::HashMap;
use std::time::Instant;
use tauri::State;

/// Run a single agent step and record status/duration/output.
/// Returns the duration in ms.
async fn run_step(
    steps: &mut Vec<orchestrator::PipelineStep>,
    outputs: &mut Vec<Option<String>>,
    idx: usize,
    agent: &str,
    vars: HashMap<String, String>,
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
) -> u64 {
    let start = Instant::now();
    steps[idx].status = "running".to_string();
    match run_agent(llm_state.clone(), db.clone(), agent.to_string(), vars).await {
        Ok(result) => {
            steps[idx].status = "completed".to_string();
            steps[idx].output = Some(result.content.clone());
            outputs[idx] = Some(result.content);
        }
        Err(e) => {
            steps[idx].status = "failed".to_string();
            steps[idx].output = Some(e.clone());
            outputs[idx] = Some(e);
        }
    }
    let duration_ms = start.elapsed().as_millis() as u64;
    steps[idx].duration_ms = duration_ms;
    duration_ms
}

/// Send a pipeline event notification (NTF-005)
fn send_pipeline_notif(db: &State<'_, DbState>, step_name: &str, status: &str, duration_ms: u64) {
    let project_conn = match db.project.lock() {
        Ok(guard) => guard,
        Err(e) => {
            let guard = e.into_inner();
            guard // Use poisoned guard — best effort
        }
    };
    if let Some(ref conn) = *project_conn {
        let project_id = db.current_project_id().unwrap_or_default();
        let severity = if status == "completed" { "info" } else { "error" };
        let message = format!("{} - {} ({}ms)", step_name, status, duration_ms);
        notify_pipeline_event(conn, &project_id, "pipeline_step", severity, &message);
    }
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
    let output_preview = if output_content.len() > 500 {
        &output_content[..500]
    } else {
        output_content
    };
    let _ = log_agent_execution(
        db,
        &project_id,
        agent_name,
        input_preview,
        output_preview,
        status,
        duration_ms,
        0,
        if status == "failed" { Some("step failed") } else { None },
    );
}

#[tauri::command]
pub async fn run_chapter_pipeline(
    db: State<'_, DbState>,
    llm_state: State<'_, LlmState>,
    chapter_number: i64,
) -> Result<orchestrator::PipelineResult, String> {
    let steps = orchestrator::build_chapter_pipeline();
    let mut steps = steps;
    let pipeline_start = Instant::now();
    let mut outputs: Vec<Option<String>> = vec![None; steps.len()];
    let mut compile_blocked = false;

    // ─── Pre-assemble recall context using the recall system ───
    let (genre, lt, volume_ctx, chapter_outlines_ctx, soul_refs, relationship_states_ctx, style_guide, de_ai_rules_ctx) = {
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
            canon_rules,  // combined
            ..Default::default()
        };

        (genre, lt, volume_ctx, chapter_outlines_ctx, soul_refs, relationship_states_ctx, style_guide, de_ai_rules_ctx)
    };

    // Helper closures for fallback: use real data if available, else placeholder
    let canon_rules_text = |lt: &recall::RecallLayerTexts| -> String {
        if !lt.canon_rules.is_empty() { lt.canon_rules.clone() } else { "暂无正典规则".to_string() }
    };
    let soul_refs_text = || -> String {
        if !soul_refs.is_empty() { soul_refs.clone() } else { "暂无SOUL档案".to_string() }
    };
    let char_states_text = |lt: &recall::RecallLayerTexts| -> String {
        if !lt.character_states.is_empty() { lt.character_states.clone() } else { "暂无角色状态".to_string() }
    };
    let snapshot_text = |lt: &recall::RecallLayerTexts| -> String {
        if !lt.snapshot.is_empty() { lt.snapshot.clone() } else { "暂无快照".to_string() }
    };
    let foreshadows_text = |lt: &recall::RecallLayerTexts| -> String {
        if !lt.foreshadows_events.is_empty() { lt.foreshadows_events.clone() } else { "暂无伏笔".to_string() }
    };

    // Step 1: Generate task card
    {
        let mut vars = HashMap::new();
        vars.insert("genre".to_string(), genre.clone());
        vars.insert("current_volume".to_string(), "1".to_string());
        vars.insert("chapter_number".to_string(), chapter_number.to_string());
        vars.insert("outline_context".to_string(), if volume_ctx.is_empty() { snapshot_text(&lt) } else { volume_ctx.clone() });
        vars.insert("prev_chapters_summary".to_string(), snapshot_text(&lt));
        vars.insert("canon_rules".to_string(), canon_rules_text(&lt));
        vars.insert("chapter_direction".to_string(), format!("第{}章写作方向", chapter_number));
        let dur = run_step(&mut steps, &mut outputs, 0, "task_card", vars, llm_state.clone(), db.clone()).await;
        send_pipeline_notif(&db, &steps[0].name, &steps[0].status, dur);
        log_agent_io_step(
            &db, "task_card", &steps[0].name, chapter_number,
            outputs[0].as_deref().unwrap_or(""),
            &steps[0].status, dur,
        );
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
        let dur = run_step(&mut steps, &mut outputs, 1, "recall_agent", vars, llm_state.clone(), db.clone()).await;
        send_pipeline_notif(&db, &steps[1].name, &steps[1].status, dur);
        log_agent_io_step(
            &db, "recall_agent", &steps[1].name, chapter_number,
            outputs[1].as_deref().unwrap_or(""),
            &steps[1].status, dur,
        );
    }

    // Step 3: Chapter outline
    {
        let task_card = outputs[0].clone().unwrap_or_default();
        let mut vars = HashMap::new();
        vars.insert("task_card".to_string(), task_card);
        vars.insert("volume_context".to_string(), if volume_ctx.is_empty() { snapshot_text(&lt) } else { volume_ctx.clone() });
        vars.insert("recent_chapter_outlines".to_string(), if chapter_outlines_ctx.is_empty() { snapshot_text(&lt) } else { chapter_outlines_ctx.clone() });
        vars.insert("canon_rules".to_string(), canon_rules_text(&lt));
        vars.insert("soul_refs".to_string(), soul_refs_text());
        let dur = run_step(&mut steps, &mut outputs, 2, "chapter_outline", vars, llm_state.clone(), db.clone()).await;
        send_pipeline_notif(&db, &steps[2].name, &steps[2].status, dur);
        log_agent_io_step(
            &db, "chapter_outline", &steps[2].name, chapter_number,
            outputs[2].as_deref().unwrap_or(""),
            &steps[2].status, dur,
        );
    }

    // Step 4: Draft writing
    {
        let task_card = outputs[0].clone().unwrap_or_default();
        let prev_summary = outputs[1].clone().unwrap_or_default();
        let mut vars = HashMap::new();
        vars.insert("task_card".to_string(), task_card);
        vars.insert("canon_rules".to_string(), canon_rules_text(&lt));
        vars.insert("prev_summary".to_string(), prev_summary);
        vars.insert("min_words".to_string(), "2000".to_string());
        vars.insert("max_words".to_string(), "4000".to_string());
        vars.insert("soul_refs".to_string(), soul_refs_text());
        let dur = run_step(&mut steps, &mut outputs, 3, "draft_writer", vars, llm_state.clone(), db.clone()).await;
        send_pipeline_notif(&db, &steps[3].name, &steps[3].status, dur);
        log_agent_io_step(
            &db, "draft_writer", &steps[3].name, chapter_number,
            outputs[3].as_deref().unwrap_or(""),
            &steps[3].status, dur,
        );
    }

    // Step 5: Voice filter
    {
        let draft = outputs[3].clone().unwrap_or_default();
        if !draft.is_empty() {
            let mut vars = HashMap::new();
            vars.insert("draft_text".to_string(), draft);
            vars.insert("soul_refs".to_string(), soul_refs_text());
            vars.insert("de_ai_rules".to_string(), de_ai_rules_ctx.clone());
            let dur = run_step(&mut steps, &mut outputs, 4, "voice_filter", vars, llm_state.clone(), db.clone()).await;
            send_pipeline_notif(&db, &steps[4].name, &steps[4].status, dur);
            log_agent_io_step(
                &db, "voice_filter", &steps[4].name, chapter_number,
                outputs[4].as_deref().unwrap_or(""),
                &steps[4].status, dur,
            );
        } else {
            steps[4].status = "skipped".to_string();
            steps[4].duration_ms = 0;
            send_pipeline_notif(&db, &steps[4].name, &steps[4].status, 0);
            log_agent_io_step(
                &db, "voice_filter", &steps[4].name, chapter_number,
                "",
                "skipped", 0,
            );
        }
    }

    // Step 6: Compile
    {
        let start = Instant::now();
        steps[5].status = "running".to_string();
        let draft = outputs[4].clone().or_else(|| outputs[3].clone()).unwrap_or_default();
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
        send_pipeline_notif(&db, &steps[5].name, &status, dur);
        log_agent_io_step(
            &db, "compiler", &steps[5].name, chapter_number,
            outputs[5].as_deref().unwrap_or(""),
            &steps[5].status, dur,
        );
    }

    // ─── Steps 7-14: Expert reviews (AGT-039: 8 parallel experts via tokio::join!) ───
    {
        let draft_for_review = outputs[4].clone().or_else(|| outputs[3].clone()).unwrap_or_default();
        let task_card = outputs[0].clone().unwrap_or_default();

        for i in 6..=13 {
            steps[i].status = "running".to_string();
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
            let rs = if !relationship_states_ctx.is_empty() { relationship_states_ctx.clone() } else { "暂无关系数据".to_string() };
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
            let wf = if !volume_ctx.is_empty() { volume_ctx.clone() } else { genre.clone() };
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
            let sg = if !style_guide.is_empty() { style_guide.clone() } else { "保持自然流畅的叙事风格".to_string() };
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
        let expert_agent_names = ["plot_expert", "character_expert", "pacing_expert", "worldbuilding_expert", "prose_expert", "commercial_expert", "reader_panel", "voice_audit"];
        for (i, (idx, result, duration)) in [r6, r7, r8, r9, r10, r11, r12, r13].into_iter().enumerate() {
            let (status, output) = match result {
                Ok(agent_result) => ("completed".to_string(), Some(agent_result.content)),
                Err(e) => ("failed".to_string(), Some(e)),
            };
            steps[idx].status = status;
            steps[idx].output = output.clone();
            outputs[idx] = output;
            steps[idx].duration_ms = duration;
            send_pipeline_notif(&db, &steps[idx].name, &steps[idx].status, duration);
            let agent_name = expert_agent_names.get(i).unwrap_or(&"unknown");
            log_agent_io_step(
                &db, agent_name, &steps[idx].name, chapter_number,
                outputs[idx].as_deref().unwrap_or(""),
                &steps[idx].status, duration,
            );
        }
    }

    // Step 15: Review Chair
    {
        let expert_reports: Vec<String> = outputs[6..14].iter()
            .enumerate()
            .map(|(i, o)| {
                let names = ["情节", "角色", "节奏", "世界观", "文笔", "商业性", "读者模拟", "AI痕迹审计"];
                format!("{}专家评审报告:\n{}", names.get(i).unwrap_or(&"未知"), o.as_deref().unwrap_or(""))
            })
            .collect();

        let mut vars = HashMap::new();
        vars.insert("chapter_number".to_string(), chapter_number.to_string());
        vars.insert("expert_reports".to_string(), expert_reports.join("\n\n---\n\n"));
        let dur = run_step(&mut steps, &mut outputs, 14, "review_chair", vars, llm_state.clone(), db.clone()).await;
        send_pipeline_notif(&db, &steps[14].name, &steps[14].status, dur);
        log_agent_io_step(
            &db, "review_chair", &steps[14].name, chapter_number,
            outputs[14].as_deref().unwrap_or(""),
            &steps[14].status, dur,
        );
    }

    let (evaluated_status, compiler_score, review_score) = orchestrator::evaluate_pipeline(&steps);
    let chapter_status = if compile_blocked {
        "compile_failed".to_string()
    } else {
        evaluated_status
    };
    let total_duration_ms = pipeline_start.elapsed().as_millis() as u64;

    Ok(orchestrator::PipelineResult {
        chapter_status: chapter_status.clone(),
        compiler_score,
        review_verdict: Some(chapter_status),
        review_score,
        steps,
        total_duration_ms,
    })
}

/// Batch chapter generation (WF-014) — run pipeline for multiple chapters
#[tauri::command]
pub async fn run_batch_pipeline(
    db: State<'_, DbState>,
    llm_state: State<'_, LlmState>,
    start_chapter: i64,
    end_chapter: i64,
) -> Result<Vec<orchestrator::PipelineResult>, String> {
    let mut results = Vec::new();
    for chapter_number in start_chapter..=end_chapter {
        let result = run_chapter_pipeline(db.clone(), llm_state.clone(), chapter_number).await?;
        results.push(result);
    }
    Ok(results)
}
