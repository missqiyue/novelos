use crate::commands::agent::run_agent;
use crate::commands::chapter::sync_chapter_rag;
use crate::commands::llm::LlmState;
use crate::compiler::{
    self, get_paragraph_by_index, CanonRuleForCompiler, CharacterForCompiler, CompileResult,
    ForeshadowForCompiler, TimelineForCompiler,
};
use crate::db::DbState;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileInput {
    pub chapter_number: i64,
    pub draft_text: String,
    pub force_review: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QualityCheck {
    pub key: String,
    pub name: String,
    pub status: String,
    pub severity: String,
    pub message: String,
    pub action: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QualityAction {
    pub key: String,
    pub label: String,
    pub action_type: String,
    pub reason: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QualityArtifacts {
    pub compile_score: i32,
    pub compile_status: String,
    pub word_count: usize,
    pub required_foreshadows: Vec<String>,
    pub required_task_focus: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterQualityReport {
    pub id: String,
    pub chapter_number: i64,
    pub report_type: String,
    pub overall: String,
    pub summary: String,
    pub checks: Vec<QualityCheck>,
    pub actions: Vec<QualityAction>,
    pub artifacts: QualityArtifacts,
    pub cached: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuickReviewExpertReport {
    pub expert_name: String,
    pub agent_name: String,
    pub passed: bool,
    pub score: Option<f32>,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QuickReviewReport {
    pub id: String,
    pub chapter_number: i64,
    pub report_type: String,
    pub overall: String,
    pub summary: String,
    pub experts: Vec<QuickReviewExpertReport>,
    pub cached: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepairChapterInput {
    pub chapter_number: i64,
    pub draft_text: String,
    pub reasons: Vec<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepairChapterResult {
    pub chapter_number: i64,
    pub revised_text: String,
    pub compile_result: CompileResult,
    pub quality_report: ChapterQualityReport,
    pub repair_reasons: Vec<String>,
    pub resolution_report: RepairResolutionReport,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepairResolutionReport {
    pub status: String,
    pub resolved: Vec<String>,
    pub persisted: Vec<String>,
    pub added: Vec<String>,
    pub needs_manual: bool,
}

#[tauri::command]
pub fn compile_chapter(
    db: State<'_, DbState>,
    input: CompileInput,
) -> Result<CompileResult, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    do_compile(conn, &input.draft_text, input.chapter_number)
}

/// Internal compile function usable from orchestrator without State
pub fn do_compile(
    conn: &rusqlite::Connection,
    draft_text: &str,
    chapter_number: i64,
) -> Result<CompileResult, String> {
    // Load canon rules
    let mut stmt = conn
        .prepare("SELECT rule_name, content, is_hard, scope_type FROM canon_rules WHERE status = 'active'")
        .map_err(|e| e.to_string())?;
    let canon_rules: Vec<CanonRuleForCompiler> = stmt
        .query_map([], |row| {
            Ok(CanonRuleForCompiler {
                rule_name: row.get(0)?,
                content: row.get(1)?,
                is_hard: row.get::<_, i64>(2)? != 0,
                scope_type: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT name, role_type, soul_json FROM characters WHERE status = 'active'")
        .map_err(|e| e.to_string())?;
    let characters: Vec<CharacterForCompiler> = stmt
        .query_map([], |row| {
            Ok(CharacterForCompiler {
                name: row.get(0)?,
                role_type: row.get(1)?,
                soul_json: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, status, seed_chapter FROM foreshadow_items ORDER BY seed_chapter",
        )
        .map_err(|e| e.to_string())?;
    let foreshadow_items: Vec<ForeshadowForCompiler> = stmt
        .query_map([], |row| {
            Ok(ForeshadowForCompiler {
                id: row.get(0)?,
                title: row.get(1)?,
                status: row.get(2)?,
                seed_chapter: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, summary, chapter_number FROM timeline_nodes ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;
    let timeline_nodes: Vec<TimelineForCompiler> = stmt
        .query_map([], |row| {
            Ok(TimelineForCompiler {
                id: row.get(0)?,
                event_summary: row.get(1)?,
                chapter_number: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let min_words: usize = conn
        .query_row("SELECT min_chapter_words FROM projects LIMIT 1", [], |r| {
            r.get::<_, i64>(0)
        })
        .unwrap_or(2000) as usize;
    let max_words: usize = conn
        .query_row("SELECT max_chapter_words FROM projects LIMIT 1", [], |r| {
            r.get::<_, i64>(0)
        })
        .unwrap_or(5000) as usize;

    let ctx = compiler::CompileContext {
        draft_text,
        canon_rules: &canon_rules,
        characters: &characters,
        foreshadow_items: &foreshadow_items,
        timeline_nodes: &timeline_nodes,
        min_words,
        max_words,
        chapter_number,
    };

    Ok(compiler::run_compiler(&ctx))
}

#[tauri::command]
pub fn compute_chapter_quality_report(
    db: State<'_, DbState>,
    input: CompileInput,
) -> Result<ChapterQualityReport, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let report = build_quality_report(
        conn,
        db.current_project_id().as_deref(),
        input.chapter_number,
        &input.draft_text,
        false,
    )?;
    save_quality_report(
        conn,
        db.current_project_id().as_deref(),
        &report,
        &input.draft_text,
    )?;
    Ok(report)
}

#[tauri::command]
pub fn get_latest_chapter_quality_report(
    db: State<'_, DbState>,
    chapter_number: i64,
) -> Result<Option<ChapterQualityReport>, String> {
    load_latest_report(&db, chapter_number, "quality_gate")
}

#[tauri::command]
pub fn list_chapter_review_history(
    db: State<'_, DbState>,
    chapter_number: i64,
    limit: Option<i64>,
) -> Result<Vec<QuickReviewReport>, String> {
    let limit = limit.unwrap_or(8).max(1);
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let mut stmt = conn
        .prepare(
            "SELECT report_json
             FROM chapter_quality_reports
             WHERE chapter_number = ?1 AND report_type = 'quick_review'
             ORDER BY created_at DESC
             LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![chapter_number, limit], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;

    let mut reports = Vec::new();
    for row in rows {
        if let Ok(json) = row {
            if let Ok(report) = serde_json::from_str::<QuickReviewReport>(&json) {
                reports.push(report);
            }
        }
    }
    Ok(reports)
}

#[tauri::command]
pub async fn run_quick_review(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    input: CompileInput,
) -> Result<QuickReviewReport, String> {
    let content_hash = content_hash(&input.draft_text);
    if !input.force_review.unwrap_or(false) {
        if let Some(cached) = load_cached_quick_review(&db, input.chapter_number, &content_hash)? {
        return Ok(cached);
        }
    }

    let canon_rules = get_canon_rules_text(&db).unwrap_or_default();
    let soul_refs = get_soul_refs_text(&db).unwrap_or_default();
    let recent_context = get_recent_chapter_context(&db, input.chapter_number).unwrap_or_default();
    let foreshadow_text = get_open_foreshadows_text(&db, input.chapter_number).unwrap_or_default();

    let specs = [
        (
            "逻辑与战力",
            "plot_expert",
            "重点检查逻辑漏洞、战力跃迁、因果是否自洽。只返回 JSON：{\"passed\":true,\"score\":8,\"suggestions\":[\"...\"]}",
        ),
        (
            "人设与视角",
            "character_expert",
            "重点检查角色是否 OOC、视角是否混乱、人物反应是否符合 SOUL。只返回 JSON：{\"passed\":true,\"score\":8,\"suggestions\":[\"...\"]}",
        ),
        (
            "节奏与爽点",
            "pacing_expert",
            "重点检查节奏、爽点释放、压抑/释放是否匹配读者期待。只返回 JSON：{\"passed\":true,\"score\":8,\"suggestions\":[\"...\"]}",
        ),
    ];

    let mut experts = Vec::new();
    for (expert_name, agent_name, review_focus) in specs {
        let mut vars = HashMap::new();
        vars.insert("chapter_text".to_string(), input.draft_text.clone());
        vars.insert("task_card".to_string(), review_focus.to_string());
        vars.insert("prev_context".to_string(), recent_context.clone());
        vars.insert("soul_refs".to_string(), soul_refs.clone());
        vars.insert("canon_rules".to_string(), canon_rules.clone());
        vars.insert("open_foreshadows".to_string(), foreshadow_text.clone());
        let output = run_agent(llm_state.clone(), db.clone(), agent_name.to_string(), vars).await;
        experts.push(parse_quick_review_output(
            expert_name,
            agent_name,
            output.map(|r| r.content).unwrap_or_else(|e| e),
        ));
    }

    let failed = experts.iter().filter(|item| !item.passed).count();
    let overall = if failed == 0 {
        "PASS"
    } else if failed >= 2 {
        "FAIL"
    } else {
        "WARN"
    };
    let summary = if failed == 0 {
        "快速评审通过".to_string()
    } else {
        format!("{} 位快速评审专家提出问题", failed)
    };
    let now = chrono::Utc::now().to_rfc3339();
    let report = QuickReviewReport {
        id: uuid::Uuid::new_v4().to_string(),
        chapter_number: input.chapter_number,
        report_type: "quick_review".to_string(),
        overall: overall.to_string(),
        summary,
        experts,
        cached: false,
        created_at: now,
    };

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    save_quick_review_report(
        conn,
        db.current_project_id().as_deref(),
        &report,
        &input.draft_text,
    )?;

    Ok(report)
}

#[tauri::command]
pub async fn repair_chapter_with_quality_actions(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    input: RepairChapterInput,
) -> Result<RepairChapterResult, String> {
    let reasons = if input.reasons.is_empty() {
        vec!["根据质量闸门和评审意见修复章节".to_string()]
    } else {
        input.reasons.clone()
    };
    let canon_rules = get_canon_rules_text(&db).unwrap_or_default();
    let soul_refs = get_soul_refs_text(&db).unwrap_or_default();
    let foreshadows = get_open_foreshadows_text(&db, input.chapter_number).unwrap_or_default();

    let mut vars = HashMap::new();
    vars.insert(
        "mode".to_string(),
        input.mode.unwrap_or_else(|| "repair".to_string()),
    );
    vars.insert(
        "requirements".to_string(),
        format!(
            "请按“最小补丁式修复”处理本章，目标是解决列出的问题，并避免引入新问题。\n\n\
硬性约束：\n\
1. 只处理下面列出的质量闸门、快速评审或编译问题。\n\
2. 优先局部改句、补足动机、修补承接；不要整章重写，不要大幅改变叙事结构。\n\
3. 保持剧情事件顺序、人物动机、视角、伏笔状态和章节核心推进不变。\n\
4. 禁止新增未请求的新人物、新设定、新冲突、新伏笔或新人物关系。\n\
5. 如果问题之间冲突，优先修复硬规则/逻辑/人设问题，再修节奏和表达。\n\
6. 修改后逐条自检本轮问题，并检查是否引入新的逻辑、人设、节奏或正典问题。\n\n\
本轮必须修复或防回退的问题：\n- {}\n\n开放伏笔参考（只能用于保持一致，不得随意新增或回收）：\n{}",
            reasons.join("\n- "),
            if foreshadows.is_empty() {
                "暂无".to_string()
            } else {
                foreshadows
            }
        ),
    );
    vars.insert("chapter_text".to_string(), input.draft_text.clone());
    vars.insert("canon_rules".to_string(), canon_rules);
    vars.insert("soul_refs".to_string(), soul_refs);

    let result = run_agent(
        llm_state.clone(),
        db.clone(),
        "rewrite_agent".to_string(),
        vars,
    )
    .await?;
    let revised_text = extract_rewrite_text(&result.content);

    {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        let now = chrono::Utc::now().to_rfc3339();
        let word_count = revised_text.chars().count() as i64;
        conn.execute(
            "UPDATE chapters SET draft_text = ?1, word_count = ?2, status = 'draft', updated_at = ?3 WHERE chapter_number = ?4",
            rusqlite::params![revised_text, word_count, now, input.chapter_number],
        )
        .map_err(|e| e.to_string())?;
    }

    sync_chapter_rag(&db, &llm_state, input.chapter_number).await?;

    let (compile_result, quality_report) = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        let compile_result = do_compile(conn, &revised_text, input.chapter_number)?;
        let quality_report = build_quality_report(
            conn,
            db.current_project_id().as_deref(),
            input.chapter_number,
            &revised_text,
            false,
        )?;
        save_quality_report(
            conn,
            db.current_project_id().as_deref(),
            &quality_report,
            &revised_text,
        )?;
        (compile_result, quality_report)
    };

    Ok(RepairChapterResult {
        chapter_number: input.chapter_number,
        revised_text,
        compile_result,
        quality_report,
        repair_reasons: reasons,
        resolution_report: RepairResolutionReport {
            status: "pending_review".to_string(),
            resolved: Vec::new(),
            persisted: Vec::new(),
            added: Vec::new(),
            needs_manual: false,
        },
    })
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParagraphRewriteResult {
    pub chapter_number: i64,
    pub paragraph_index: usize,
    pub original_paragraph: String,
    pub revised_paragraph: String,
    pub compile_score: Option<i32>,
}

/// Rewrite only the specified paragraph, preserving all other content.
/// Uses the rewrite_agent in "repair" mode with a scoped prompt.
#[tauri::command]
pub async fn run_paragraph_rewrite(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    chapter_number: i64,
    paragraph_index: usize,
    requirements: String,
) -> Result<ParagraphRewriteResult, String> {
    // Load current chapter draft
    let draft_text = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        conn.query_row(
            "SELECT draft_text FROM chapters WHERE chapter_number = ?1",
            [chapter_number],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| e.to_string())?
    };

    let original_paragraph = get_paragraph_by_index(&draft_text, paragraph_index)
        .ok_or_else(|| format!("Paragraph index {} out of range", paragraph_index))?;

    // Load context for rewrite
    let canon_rules = get_canon_rules_text(&db)?;
    let soul_refs = get_soul_refs_text(&db)?;

    // Build scoped prompt — only the target paragraph + surrounding context
    let paragraphs: Vec<&str> = draft_text
        .split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .collect();
    let context_before = if paragraph_index > 0 {
        paragraphs
            .get(paragraph_index - 1)
            .unwrap_or(&"")
            .to_string()
    } else {
        String::new()
    };
    let context_after = paragraphs
        .get(paragraph_index + 1)
        .unwrap_or(&"")
        .to_string();

    let scoped_text = format!(
        "[前文]：{}...\n\n[需修改段落]：\n{}\n\n[后文]：{}...",
        context_before.chars().take(200).collect::<String>(),
        original_paragraph,
        context_after.chars().take(200).collect::<String>(),
    );

    let scoped_requirements = format!(
        "【段落级修复】仅修改「需修改段落」标记的段落，不要修改其他内容。\n修改原因：{}\n输出仅包含修改后的段落文本，不要输出其他段落。",
        requirements
    );

    let mut vars = HashMap::new();
    vars.insert("mode".to_string(), "repair".to_string());
    vars.insert("requirements".to_string(), scoped_requirements);
    vars.insert("chapter_text".to_string(), scoped_text);
    vars.insert("canon_rules".to_string(), canon_rules);
    vars.insert("soul_refs".to_string(), soul_refs);

    let result = run_agent(
        llm_state.clone(),
        db.clone(),
        "rewrite_agent".to_string(),
        vars,
    )
    .await?;

    // Extract the revised paragraph — take text before "---" separator if present
    let revised_paragraph = if let Some(sep_idx) = result
        .content
        .find("\n---\n")
        .or_else(|| result.content.find("\n---"))
    {
        result.content[..sep_idx].trim().to_string()
    } else {
        result.content.trim().to_string()
    };

    // Rebuild the full draft with the revised paragraph
    let new_draft = replace_paragraph(&draft_text, paragraph_index, &revised_paragraph);

    // Save revised draft
    {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        let now = chrono::Utc::now().to_rfc3339();
        let word_count = new_draft.chars().count() as i64;
        conn.execute(
            "UPDATE chapters SET draft_text = ?1, word_count = ?2, status = 'draft', updated_at = ?3 WHERE chapter_number = ?4",
            rusqlite::params![new_draft, word_count, now, chapter_number],
        ).map_err(|e| e.to_string())?;
    }

    sync_chapter_rag(&db, &llm_state, chapter_number).await?;

    // Re-compile
    let compile_score = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        do_compile(conn, &new_draft, chapter_number)
            .ok()
            .map(|r| r.score)
    };

    Ok(ParagraphRewriteResult {
        chapter_number,
        paragraph_index,
        original_paragraph,
        revised_paragraph,
        compile_score,
    })
}

fn replace_paragraph(draft_text: &str, index: usize, new_paragraph: &str) -> String {
    let paragraphs: Vec<&str> = draft_text
        .split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .collect();
    let mut result_parts: Vec<String> = Vec::new();
    let mut para_idx = 0;
    for part in draft_text.split("\n\n") {
        if part.trim().is_empty() {
            result_parts.push(part.to_string());
            continue;
        }
        if para_idx == index {
            result_parts.push(new_paragraph.to_string());
        } else if let Some(p) = paragraphs.get(para_idx) {
            result_parts.push((*p).to_string());
        }
        para_idx += 1;
    }
    result_parts.join("\n\n")
}

fn build_quality_report(
    conn: &rusqlite::Connection,
    _project_id: Option<&str>,
    chapter_number: i64,
    draft_text: &str,
    cached: bool,
) -> Result<ChapterQualityReport, String> {
    let compile_result = do_compile(conn, draft_text, chapter_number)?;
    let mut checks = Vec::new();
    let mut actions = Vec::new();

    let compile_blocked = compile_result.status == "fail";
    checks.push(QualityCheck {
        key: "compile_gate".to_string(),
        name: "编译检查".to_string(),
        status: if compile_blocked { "FAIL" } else { "PASS" }.to_string(),
        severity: "error".to_string(),
        message: if compile_blocked {
            format!("编译未通过：{} 分", compile_result.score)
        } else {
            format!("编译通过：{} 分", compile_result.score)
        },
        action: if compile_blocked {
            Some("repair".to_string())
        } else {
            None
        },
    });
    if compile_blocked {
        actions.push(QualityAction {
            key: "repair_compile".to_string(),
            label: "按编译问题修复".to_string(),
            action_type: "repair".to_string(),
            reason: compile_result
                .issues
                .iter()
                .filter(|issue| issue.severity == "error")
                .map(|issue| issue.message.clone())
                .collect::<Vec<_>>()
                .join("；"),
        });
    }

    let task_focus = load_task_focus(conn, chapter_number)?;
    let task_missing = task_focus.is_empty();
    checks.push(QualityCheck {
        key: "task_alignment".to_string(),
        name: "任务卡对齐".to_string(),
        status: if task_missing { "WARN" } else { "PASS" }.to_string(),
        severity: "warning".to_string(),
        message: if task_missing {
            "本章缺少任务卡，生成和评审缺少明确锚点".to_string()
        } else {
            "已读取本章任务卡锚点".to_string()
        },
        action: if task_missing {
            Some("task_card".to_string())
        } else {
            None
        },
    });
    if task_missing {
        actions.push(QualityAction {
            key: "create_task_card".to_string(),
            label: "补齐章节任务卡".to_string(),
            action_type: "task_card".to_string(),
            reason: "缺少章节任务卡".to_string(),
        });
    }

    let format_ok = draft_text.contains("=== CHAPTER_CONTENT ===") || !draft_text.trim().is_empty();
    checks.push(QualityCheck {
        key: "format_contract".to_string(),
        name: "草稿格式".to_string(),
        status: if format_ok { "PASS" } else { "FAIL" }.to_string(),
        severity: "error".to_string(),
        message: if format_ok {
            "草稿内容可读取".to_string()
        } else {
            "草稿为空或格式无法读取".to_string()
        },
        action: if format_ok {
            None
        } else {
            Some("repair".to_string())
        },
    });

    let required_foreshadows = load_open_foreshadow_titles(conn, chapter_number)?;
    let mentioned_foreshadows: HashSet<String> = required_foreshadows
        .iter()
        .filter(|title| draft_text.contains(title.as_str()))
        .cloned()
        .collect();
    let foreshadow_status = if required_foreshadows.is_empty() || !mentioned_foreshadows.is_empty()
    {
        "PASS"
    } else {
        "WARN"
    };
    checks.push(QualityCheck {
        key: "foreshadow_loop".to_string(),
        name: "伏笔闭环".to_string(),
        status: foreshadow_status.to_string(),
        severity: "warning".to_string(),
        message: if required_foreshadows.is_empty() {
            "当前没有明显超期开放伏笔".to_string()
        } else if mentioned_foreshadows.is_empty() {
            format!("有 {} 个开放伏笔可推进或回收", required_foreshadows.len())
        } else {
            format!("已触及 {} 个开放伏笔", mentioned_foreshadows.len())
        },
        action: if foreshadow_status == "WARN" {
            Some("repair".to_string())
        } else {
            None
        },
    });
    if foreshadow_status == "WARN" {
        actions.push(QualityAction {
            key: "repair_foreshadow".to_string(),
            label: "补强伏笔推进".to_string(),
            action_type: "repair".to_string(),
            reason: format!("建议推进或回收：{}", required_foreshadows.join("；")),
        });
    }

    let overall = if checks.iter().any(|c| c.status == "FAIL") {
        "FAIL"
    } else if checks.iter().any(|c| c.status == "WARN") {
        "WARN"
    } else {
        "PASS"
    };
    let summary = match overall {
        "PASS" => "质量闸门通过".to_string(),
        "WARN" => "质量闸门有提醒，建议处理后再完整评审".to_string(),
        _ => "质量闸门未通过，需要先修复阻断项".to_string(),
    };

    Ok(ChapterQualityReport {
        id: uuid::Uuid::new_v4().to_string(),
        chapter_number,
        report_type: "quality_gate".to_string(),
        overall: overall.to_string(),
        summary,
        checks,
        actions,
        artifacts: QualityArtifacts {
            compile_score: compile_result.score,
            compile_status: compile_result.status,
            word_count: compile_result.stats.word_count,
            required_foreshadows,
            required_task_focus: task_focus,
        },
        cached,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn save_quality_report(
    conn: &rusqlite::Connection,
    project_id: Option<&str>,
    report: &ChapterQualityReport,
    draft_text: &str,
) -> Result<(), String> {
    let report_json = serde_json::to_string(report).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO chapter_quality_reports (
            id, project_id, chapter_number, report_type, content_hash, overall,
            summary, report_json, cached, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            report.id,
            project_id.unwrap_or_default(),
            report.chapter_number,
            report.report_type,
            content_hash(draft_text),
            report.overall,
            report.summary,
            report_json,
            if report.cached { 1 } else { 0 },
            report.created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn save_quick_review_report(
    conn: &rusqlite::Connection,
    project_id: Option<&str>,
    report: &QuickReviewReport,
    draft_text: &str,
) -> Result<(), String> {
    let report_json = serde_json::to_string(report).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO chapter_quality_reports (
            id, project_id, chapter_number, report_type, content_hash, overall,
            summary, report_json, cached, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            report.id,
            project_id.unwrap_or_default(),
            report.chapter_number,
            report.report_type,
            content_hash(draft_text),
            report.overall,
            report.summary,
            report_json,
            if report.cached { 1 } else { 0 },
            report.created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn load_latest_report<T: for<'de> Deserialize<'de>>(
    db: &DbState,
    chapter_number: i64,
    report_type: &str,
) -> Result<Option<T>, String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let json: Option<String> = conn
        .query_row(
            "SELECT report_json FROM chapter_quality_reports
             WHERE chapter_number = ?1 AND report_type = ?2
             ORDER BY created_at DESC LIMIT 1",
            rusqlite::params![chapter_number, report_type],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
        .map_err(|e| e.to_string())?;

    json.map(|value| serde_json::from_str(&value).map_err(|e| e.to_string()))
        .transpose()
}

fn load_cached_quick_review(
    db: &DbState,
    chapter_number: i64,
    hash: &str,
) -> Result<Option<QuickReviewReport>, String> {
    let project_conn = db.lock_project_recover()?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let json: Option<String> = conn
        .query_row(
            "SELECT report_json FROM chapter_quality_reports
             WHERE chapter_number = ?1 AND report_type = 'quick_review' AND content_hash = ?2
             ORDER BY created_at DESC LIMIT 1",
            rusqlite::params![chapter_number, hash],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })
        .map_err(|e| e.to_string())?;

    if let Some(json) = json {
        let mut report: QuickReviewReport =
            serde_json::from_str(&json).map_err(|e| e.to_string())?;
        report.cached = true;
        Ok(Some(report))
    } else {
        Ok(None)
    }
}

fn content_hash(text: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    text.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn parse_quick_review_output(
    expert_name: &str,
    agent_name: &str,
    output: String,
) -> QuickReviewExpertReport {
    let clean = output
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(clean) {
        let passed = value
            .get("passed")
            .and_then(|v| v.as_bool())
            .unwrap_or_else(|| {
                value
                    .get("verdict")
                    .and_then(|v| v.as_str())
                    .map(|s| s == "pass" || s == "approved")
                    .unwrap_or(false)
            });
        let score = value
            .get("score")
            .and_then(|v| v.as_f64())
            .map(|v| v as f32);
        let suggestions = value
            .get("suggestions")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        return QuickReviewExpertReport {
            expert_name: expert_name.to_string(),
            agent_name: agent_name.to_string(),
            passed: passed && suggestions.is_empty(),
            score,
            suggestions,
        };
    }

    let passed = output.contains("PASSED") || output.contains("通过");
    let suggestion = output
        .replace("FAILED:", "")
        .replace("PASSED", "")
        .trim()
        .to_string();
    QuickReviewExpertReport {
        expert_name: expert_name.to_string(),
        agent_name: agent_name.to_string(),
        passed,
        score: None,
        suggestions: if passed || suggestion.is_empty() {
            vec![]
        } else {
            vec![suggestion]
        },
    }
}

fn extract_rewrite_text(raw: &str) -> String {
    if let Some(content_start) = raw.find("=== CHAPTER_CONTENT ===") {
        return raw[content_start + "=== CHAPTER_CONTENT ===".len()..]
            .trim()
            .to_string();
    }
    raw.split("\n---\n")
        .next()
        .unwrap_or(raw)
        .trim()
        .to_string()
}

fn load_task_focus(
    conn: &rusqlite::Connection,
    chapter_number: i64,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT objective, must_progress, must_recall, must_avoid
             FROM chapter_tasks
             WHERE chapter_number = ?1
             ORDER BY created_at DESC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let row = stmt
        .query_row(rusqlite::params![chapter_number], |row| {
            let fields = [
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
            ];
            Ok(fields
                .into_iter()
                .flatten()
                .filter(|s| !s.trim().is_empty())
                .collect::<Vec<_>>())
        })
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(Vec::new()),
            other => Err(other),
        })
        .map_err(|e| e.to_string())?;
    Ok(row)
}

fn load_open_foreshadow_titles(
    conn: &rusqlite::Connection,
    chapter_number: i64,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT COALESCE(title, id)
             FROM foreshadow_items
             WHERE status IN ('planted', 'pending', 'open')
               AND (seed_chapter IS NULL OR seed_chapter < ?1)
             ORDER BY COALESCE(seed_chapter, 0) ASC
             LIMIT 5",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![chapter_number], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|row| row.ok()).collect())
}

fn get_open_foreshadows_text(db: &DbState, chapter_number: i64) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    Ok(load_open_foreshadow_titles(conn, chapter_number)?.join("\n"))
}

fn get_recent_chapter_context(db: &DbState, chapter_number: i64) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let start = (chapter_number - 3).max(1);
    let mut stmt = conn
        .prepare(
            "SELECT chapter_number, title, COALESCE(final_text, draft_text, '')
             FROM chapters
             WHERE chapter_number >= ?1 AND chapter_number < ?2
             ORDER BY chapter_number ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![start, chapter_number], |row| {
            let num: i64 = row.get(0)?;
            let title: Option<String> = row.get(1)?;
            let text: String = row.get(2)?;
            Ok(format!(
                "第{}章 {}：{}",
                num,
                title.unwrap_or_default(),
                text.chars().take(500).collect::<String>()
            ))
        })
        .map_err(|e| e.to_string())?;
    Ok(rows
        .filter_map(|row| row.ok())
        .collect::<Vec<_>>()
        .join("\n\n"))
}

fn get_canon_rules_text(db: &DbState) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let mut stmt = conn
        .prepare("SELECT rule_name, content, is_hard FROM canon_rules WHERE status = 'active'")
        .map_err(|e| e.to_string())?;
    let rules: Vec<String> = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let content: String = row.get(1)?;
            let hard: bool = row.get::<_, i64>(2)? != 0;
            Ok(format!(
                "[{}] {}: {}",
                if hard { "硬" } else { "软" },
                name,
                content
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(rules.join("\n"))
}

fn get_soul_refs_text(db: &DbState) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let mut stmt = conn.prepare("SELECT name, soul_json FROM characters WHERE status = 'active' AND soul_json != '{}' AND soul_json != ''").map_err(|e| e.to_string())?;
    let refs: Vec<String> = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let soul: String = row.get(1)?;
            Ok(format!(
                "{}: {}",
                name,
                soul.chars().take(300).collect::<String>()
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(refs.join("\n"))
}
