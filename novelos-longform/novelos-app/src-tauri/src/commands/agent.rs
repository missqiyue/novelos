use crate::agents;
use crate::db::DbState;
use crate::llm::{ChatMessage, LlmService};
use crate::commands::llm::LlmState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentRunResult {
    pub agent_name: String,
    pub content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub duration_ms: u64,
    pub model: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentInfo {
    pub name: String,
    pub description: String,
}

const AGENT_LIST: &[(&str, &str)] = &[
    ("genre_match", "题材识别 — 分析小说描述，匹配最合适的题材模板"),
    ("volume_outline", "卷纲规划 — 根据描述和题材生成分卷结构"),
    ("book_outline", "大纲生成 — 根据卷纲生成全书和分卷大纲"),
    ("style_extractor", "文风提取 — 分析文本或作品的写作风格特征"),
    ("name_generator", "角色命名 — 根据题材和世界观为角色生成合适的名字"),
    ("soul_matcher", "SOUL匹配 — 根据角色设定匹配性格模板并定制"),
    ("book_title", "书名生成 — 根据作品描述和大纲生成候选书名"),
    ("draft_writer", "草稿撰写 — 根据任务卡和正典撰写章节正文"),
    ("voice_filter", "去AI化审校 — 检查并修改AI生成文本中的痕迹"),
    ("task_card", "任务卡生成 — 根据大纲和进度生成章节任务卡"),
    ("arc_planner", "事件链规划 — 将卷纲拆分为可执行的事件链"),
    ("chapter_outline", "章节大纲 — 生成详细章节写作大纲"),
    ("plot_expert", "情节专家 — 审查情节逻辑和叙事结构"),
    ("character_expert", "角色专家 — 审查人物一致性和角色发展"),
    ("pacing_expert", "节奏专家 — 审查叙事节奏和阅读体验"),
    ("worldbuilding_expert", "世界观专家 — 审查世界设定的自洽性"),
    ("prose_expert", "文笔专家 — 审查文字表达质量"),
    ("commercial_expert", "商业性专家 — 审查市场吸引力"),
    ("reader_panel", "读者模拟 — 从读者视角给出阅读感受"),
    ("voice_audit", "AI痕迹审计 — 检测人工智能写作痕迹"),
    ("review_chair", "评审主席 — 综合专家意见给出终审结论"),
    ("recall_agent", "上下文召回 — 精准召回本章需要的上下文"),
    ("continuity_analyst", "连续性分析 — 全面检查修订后的连续性"),
    ("rewrite_agent", "章节修改 — 四种模式修复/压缩/增强钩子/去AI化"),
    ("canon_curator", "正典审查 — 自动分类+硬度判定+冲突检测+质量评估"),
    ("bestseller_parser", "爆款解析 — 分析畅销作品的写作模式和商业技巧"),
    ("archive_agent", "账本归档 — 从定稿章节提取事实更新故事账本"),
    ("comment_analyzer", "评论分析 — 分析读者评论的反馈和角色人气"),
    ("orchestrator_agent", "任务规划器 — 读取项目状态，规划优先级工作清单"),
    ("retcon_analyst", "修史分析 — 评估修史影响范围、风险等级，推荐修复策略"),
];

#[tauri::command]
pub fn list_agents() -> Vec<AgentInfo> {
    AGENT_LIST
        .iter()
        .map(|(name, desc)| AgentInfo {
            name: name.to_string(),
            description: desc.to_string(),
        })
        .collect()
}

#[tauri::command]
pub async fn run_agent(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    agent_name: String,
    variables: HashMap<String, String>,
) -> Result<AgentRunResult, String> {
    let (system_prompt, user_template) = get_prompts_with_db_fallback(&db, &agent_name)?;

    let mut user_prompt = user_template.to_string();
    for (key, value) in &variables {
        user_prompt = user_prompt.replace(&format!("{{{key}}}"), value);
    }

    let config = {
        let service = llm_state.service.lock().map_err(|e| e.to_string())?;
        service.config.clone()
    };

    if config.api_key.is_empty() {
        return Err("LLM API Key 未配置，请先在设置中配置".to_string());
    }

    let svc = LlmService::new(config.clone());
    let messages = vec![
        ChatMessage {
            role: "system".to_string(),
            content: system_prompt.to_string(),
        },
        ChatMessage {
            role: "user".to_string(),
            content: user_prompt.clone(),
        },
    ];

    let start = Instant::now();
    let result = svc.chat(messages).await;
    let duration_ms = start.elapsed().as_millis() as u64;

    match result {
        Ok(response) => {
            let project_id = db.current_project_id().unwrap_or_default();
            let _ = log_agent_execution(&db, &project_id, &agent_name, &user_prompt, &response.content, "success", duration_ms, response.total_tokens as i64, None);
            let _ = log_llm_call(&db, &project_id, Some(&agent_name), &config.provider, &config.model, response.prompt_tokens as i64, response.completion_tokens as i64, response.total_tokens as i64, duration_ms as i64, "success");

            Ok(AgentRunResult {
                agent_name,
                content: response.content,
                prompt_tokens: response.prompt_tokens,
                completion_tokens: response.completion_tokens,
                total_tokens: response.total_tokens,
                duration_ms,
                model: response.model,
            })
        }
        Err(e) => {
            let project_id = db.current_project_id().unwrap_or_default();
            let _ = log_agent_execution(&db, &project_id, &agent_name, &user_prompt, "", "failed", duration_ms, 0, Some(&e.to_string()));

            Err(format!("Agent {} 调用失败: {}", agent_name, e))
        }
    }
}

fn get_agent_prompts(name: &str) -> Result<(String, String), String> {
    // Get hardcoded defaults
    let (default_system, default_user) = get_default_prompts(name)?;
    Ok((default_system.to_string(), default_user.to_string()))
}

/// Get hardcoded default prompts for an agent.
fn get_default_prompts(name: &str) -> Result<(&'static str, &'static str), String> {
    match name {
        "genre_match" => Ok((agents::genre_match::SYSTEM, agents::genre_match::USER_TEMPLATE)),
        "volume_outline" => Ok((agents::volume_outline::SYSTEM, agents::volume_outline::USER_TEMPLATE)),
        "book_outline" => Ok((agents::book_outline::SYSTEM, agents::book_outline::USER_TEMPLATE)),
        "style_extractor" => Ok((agents::style_extractor::SYSTEM, agents::style_extractor::USER_TEMPLATE)),
        "name_generator" => Ok((agents::name_generator::SYSTEM, agents::name_generator::USER_TEMPLATE)),
        "soul_matcher" => Ok((agents::soul_matcher::SYSTEM, agents::soul_matcher::USER_TEMPLATE)),
        "book_title" => Ok((agents::book_title::SYSTEM, agents::book_title::USER_TEMPLATE)),
        "draft_writer" => Ok((agents::draft_writer::SYSTEM, agents::draft_writer::USER_TEMPLATE)),
        "voice_filter" => Ok((agents::voice_filter::SYSTEM, agents::voice_filter::USER_TEMPLATE)),
        "task_card" => Ok((agents::task_card::SYSTEM, agents::task_card::USER_TEMPLATE)),
        "arc_planner" => Ok((agents::arc_planner::SYSTEM, agents::arc_planner::USER_TEMPLATE)),
        "chapter_outline" => Ok((agents::chapter_outline::SYSTEM, agents::chapter_outline::USER_TEMPLATE)),
        "plot_expert" => Ok((agents::experts::plot_expert::SYSTEM, agents::experts::plot_expert::USER_TEMPLATE)),
        "character_expert" => Ok((agents::experts::character_expert::SYSTEM, agents::experts::character_expert::USER_TEMPLATE)),
        "pacing_expert" => Ok((agents::experts::pacing_expert::SYSTEM, agents::experts::pacing_expert::USER_TEMPLATE)),
        "worldbuilding_expert" => Ok((agents::experts::worldbuilding_expert::SYSTEM, agents::experts::worldbuilding_expert::USER_TEMPLATE)),
        "prose_expert" => Ok((agents::experts::prose_expert::SYSTEM, agents::experts::prose_expert::USER_TEMPLATE)),
        "commercial_expert" => Ok((agents::experts::commercial_expert::SYSTEM, agents::experts::commercial_expert::USER_TEMPLATE)),
        "reader_panel" => Ok((agents::experts::reader_panel::SYSTEM, agents::experts::reader_panel::USER_TEMPLATE)),
        "voice_audit" => Ok((agents::experts::voice_audit::SYSTEM, agents::experts::voice_audit::USER_TEMPLATE)),
        "review_chair" => Ok((agents::experts::review_chair::SYSTEM, agents::experts::review_chair::USER_TEMPLATE)),
        "recall_agent" => Ok((agents::recall_agent::SYSTEM, agents::recall_agent::USER_TEMPLATE)),
        "continuity_analyst" => Ok((agents::continuity_analyst::SYSTEM, agents::continuity_analyst::USER_TEMPLATE)),
        "rewrite_agent" => Ok((agents::rewrite_agent::SYSTEM, agents::rewrite_agent::USER_TEMPLATE)),
        "canon_curator" => Ok((agents::canon_curator::SYSTEM, agents::canon_curator::USER_TEMPLATE)),
        "bestseller_parser" => Ok((agents::bestseller_parser::SYSTEM, agents::bestseller_parser::USER_TEMPLATE)),
        "archive_agent" => Ok((agents::archive_agent::SYSTEM, agents::archive_agent::USER_TEMPLATE)),
        "comment_analyzer" => Ok((agents::comment_analyzer::SYSTEM, agents::comment_analyzer::USER_TEMPLATE)),
        "orchestrator_agent" => Ok((agents::orchestrator_agent::SYSTEM, agents::orchestrator_agent::USER_TEMPLATE)),
        "retcon_analyst" => Ok((agents::retcon_analyst::SYSTEM, agents::retcon_analyst::USER_TEMPLATE)),
        _ => Err(format!("未知 Agent: {}", name)),
    }
}

pub(crate) fn log_agent_execution(
    db: &DbState,
    project_id: &str,
    agent_name: &str,
    input_summary: &str,
    output_summary: &str,
    status: &str,
    duration_ms: u64,
    token_usage: i64,
    error_message: Option<&str>,
) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let input_trunc = if input_summary.len() > 500 { &input_summary[..500] } else { input_summary };
    let output_trunc = if output_summary.len() > 500 { &output_summary[..500] } else { output_summary };

    conn.execute(
        "INSERT INTO agent_execution_logs (id, project_id, agent_name, input_summary, output_summary, status, duration_ms, token_usage, error_message, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![id, project_id, agent_name, input_trunc, output_trunc, status, duration_ms as i64, token_usage, error_message, now],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

fn log_llm_call(
    db: &DbState,
    project_id: &str,
    agent_name: Option<&str>,
    provider: &str,
    model: &str,
    prompt_tokens: i64,
    completion_tokens: i64,
    total_tokens: i64,
    latency_ms: i64,
    status: &str,
) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO llm_api_calls (id, project_id, agent_name, provider, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![id, project_id, agent_name, provider, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, status, now],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn list_agent_logs(db: State<'_, DbState>, agent_name: Option<String>, limit: Option<i64>) -> Result<Vec<AgentLogEntry>, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    let limit_val = limit.unwrap_or(50);
    let mut stmt = conn.prepare(
        "SELECT id, agent_name, input_summary, output_summary, status, duration_ms, token_usage, error_message, created_at FROM agent_execution_logs WHERE (?1 IS NULL OR agent_name = ?1) ORDER BY created_at DESC LIMIT ?2"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map(rusqlite::params![agent_name, limit_val], |row| {
        Ok(AgentLogEntry {
            id: row.get(0)?,
            agent_name: row.get(1)?,
            input_summary: row.get(2)?,
            output_summary: row.get(3)?,
            status: row.get(4)?,
            duration_ms: row.get(5)?,
            token_usage: row.get(6)?,
            error_message: row.get(7)?,
            created_at: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(items)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentLogEntry {
    pub id: String,
    pub agent_name: String,
    pub input_summary: Option<String>,
    pub output_summary: Option<String>,
    pub status: String,
    pub duration_ms: Option<i64>,
    pub token_usage: Option<i64>,
    pub error_message: Option<String>,
    pub created_at: String,
}

/// Get agent prompts with database override support.
/// Checks the global DB for a custom prompt first; falls back to hardcoded defaults.
fn get_prompts_with_db_fallback(db: &DbState, agent_name: &str) -> Result<(String, String), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT system_prompt, user_template FROM agent_prompts WHERE agent_name = ?1",
        [agent_name],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    );

    match result {
        Ok((system, user)) => Ok((system, user)),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            // No custom prompt — use hardcoded defaults
            let (sys, usr) = get_default_prompts(agent_name)?;
            Ok((sys.to_string(), usr.to_string()))
        }
        Err(e) => {
            log::warn!("Failed to query agent_prompts for '{}': {}", agent_name, e);
            let (sys, usr) = get_default_prompts(agent_name)?;
            Ok((sys.to_string(), usr.to_string()))
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentPromptInfo {
    pub agent_name: String,
    pub system_prompt: String,
    pub user_template: String,
    pub is_custom: bool,
}

/// List all agent prompts (custom from DB + defaults for agents without DB entries).
#[tauri::command]
pub fn list_agent_prompts(db: State<'_, DbState>) -> Result<Vec<AgentPromptInfo>, String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;

    let mut custom_prompts: HashMap<String, (String, String, bool)> = HashMap::new();
    let mut stmt = conn.prepare("SELECT agent_name, system_prompt, user_template, is_custom FROM agent_prompts")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, bool>(3)?,
        ))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        let (name, system, user, is_custom) = row.map_err(|e| e.to_string())?;
        custom_prompts.insert(name, (system, user, is_custom));
    }

    let mut results = Vec::new();
    for (name, _desc) in AGENT_LIST {
        if let Some((system, user, is_custom)) = custom_prompts.get(*name) {
            results.push(AgentPromptInfo {
                agent_name: name.to_string(),
                system_prompt: system.clone(),
                user_template: user.clone(),
                is_custom: *is_custom,
            });
        } else {
            let (sys, usr) = get_default_prompts(name)?;
            results.push(AgentPromptInfo {
                agent_name: name.to_string(),
                system_prompt: sys.to_string(),
                user_template: usr.to_string(),
                is_custom: false,
            });
        }
    }

    Ok(results)
}

/// Get a single agent's prompt (DB override or default).
#[tauri::command]
pub fn get_agent_prompt(db: State<'_, DbState>, agent_name: String) -> Result<AgentPromptInfo, String> {
    let (system, user) = get_prompts_with_db_fallback(&db, &agent_name)?;
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    let is_custom = conn.query_row(
        "SELECT is_custom FROM agent_prompts WHERE agent_name = ?1",
        [&agent_name],
        |row| row.get::<_, bool>(0),
    ).unwrap_or(false);

    Ok(AgentPromptInfo {
        agent_name,
        system_prompt: system,
        user_template: user,
        is_custom,
    })
}

/// Save a custom agent prompt to the database.
#[tauri::command]
pub fn save_agent_prompt(db: State<'_, DbState>, agent_name: String, system_prompt: String, user_template: String) -> Result<(), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO agent_prompts (agent_name, system_prompt, user_template, is_custom, updated_at) VALUES (?1, ?2, ?3, 1, datetime('now')) ON CONFLICT(agent_name) DO UPDATE SET system_prompt = ?2, user_template = ?3, is_custom = 1, updated_at = datetime('now')",
        rusqlite::params![agent_name, system_prompt, user_template],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Reset an agent prompt to its hardcoded default by deleting the DB entry.
#[tauri::command]
pub fn reset_agent_prompt(db: State<'_, DbState>, agent_name: String) -> Result<(), String> {
    let conn = db.global.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM agent_prompts WHERE agent_name = ?1", [&agent_name])
        .map_err(|e| e.to_string())?;
    Ok(())
}
