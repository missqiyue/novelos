use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::time::sleep;
use tauri::State;
use regex::Regex;
use crate::llm::LlmClient;
use crate::db::{DbState, AppConfig, OutlinePatch, StoryThreadUpsert, SoulTimelineUpsert};
use crate::rag::RagEngine;
use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Serialize, Deserialize, Clone)]
struct AiWorldFact {
    entity_type: String,
    entity_name: String,
    fact_key: String,
    fact_value: String,
    confidence: Option<f64>,
    source_span: Option<String>,
}

fn clean_ai_json(s: &str) -> &str {
    s.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
}

fn chunk_text(s: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    if s.is_empty() {
        return vec![];
    }
    let chunk_size = chunk_size.max(200);
    let overlap = overlap.min(chunk_size.saturating_sub(1));

    let chars: Vec<char> = s.chars().collect();
    let mut out: Vec<String> = Vec::new();
    let mut start: usize = 0;
    while start < chars.len() {
        let end = (start + chunk_size).min(chars.len());
        out.push(chars[start..end].iter().collect());
        if end == chars.len() {
            break;
        }
        start = end.saturating_sub(overlap);
    }
    out
}

fn normalize_ws(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn is_substring(haystack: &str, needle: &str) -> bool {
    if needle.trim().is_empty() {
        return false;
    }
    haystack.contains(needle)
}

// 专家审查报告
#[derive(Serialize, Deserialize, Clone)]
pub struct AuditReport {
    pub expert_name: String,
    pub passed: bool,
    pub suggestions: Vec<String>,
}

#[derive(Deserialize)]
struct MemoryEntityState {
    entity_id: String,
    entity_type: String,
    state_key: String,
    state_value: String,
}

#[derive(Deserialize)]
struct MemoryConsequence {
    upgrade_desc: String,
    consequence_hook: String,
}

#[derive(Deserialize)]
struct MemoryExtractResult {
    entity_states: Vec<MemoryEntityState>,
    new_consequences: Vec<MemoryConsequence>,
    resolved_consequence_ids: Vec<i32>,
}

async fn extract_and_persist_memory(
    state: &State<'_, DbState>,
    chapter_number: i32,
    chapter_text: &str,
) -> Result<(), String> {
    let config = crate::db::get_config_internal(state).map_err(|e| e.to_string())?;
    if config.api_key.is_empty() {
        return Ok(());
    }

    let open_consequences_text = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        let mut stmt = conn
            .prepare(
                "SELECT id, chapter_number, upgrade_desc, consequence_hook FROM consequence_ledger WHERE is_resolved = 0 ORDER BY chapter_number ASC, id ASC LIMIT 12",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, i32>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut lines = Vec::new();
        for item in iter {
            let (id, ch, up, hook) = item.map_err(|e| e.to_string())?;
            lines.push(format!("- id:{} | from:{} | {} -> {}", id, ch, up, hook));
        }
        if lines.is_empty() { "（无）".to_string() } else { lines.join("\n") }
    };

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是网文编辑的“记忆抽取器”。请从【本章正文】中抽取需要写入长期记忆的事实，并以严格 JSON 输出（不要 Markdown）。\n\n你要输出：\n1) entity_states：0-12条。每条包含 entity_id/entity_type/state_key/state_value。\n   - entity_type 只能是：character | item。\n   - state_key 示例：is_alive, realm, injured, owner, location, sealed, timer。\n   - 只写高置信度事实，宁缺毋滥。\n2) new_consequences：0-2条。用于“因果账本”，当本章引入明确代价/誓言/天道惩罚/反噬时才写。\n3) resolved_consequence_ids：从给定未结清列表中选择已兑现/已解决的 id（不确定就不选）。\n\nJSON 结构：{\"entity_states\":[{\"entity_id\":\"\",\"entity_type\":\"character\",\"state_key\":\"is_alive\",\"state_value\":\"false\"}],\"new_consequences\":[{\"upgrade_desc\":\"\",\"consequence_hook\":\"\"}],\"resolved_consequence_ids\":[1,2]}";
    let user_prompt = format!(
        "【未结清因果账本列表】\n{}\n\n【本章正文】\n{}",
        open_consequences_text, chapter_text
    );

    let resp = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    let clean = resp
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let parsed: MemoryExtractResult = serde_json::from_str(clean).map_err(|e| format!("记忆抽取 JSON 格式错误: {}", e))?;

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    for s in parsed.entity_states {
        if s.entity_id.trim().is_empty() || s.state_key.trim().is_empty() {
            continue;
        }
        let _ = crate::db::upsert_temporal_state(
            &conn,
            s.entity_id.trim(),
            s.entity_type.trim(),
            s.state_key.trim(),
            s.state_value.trim(),
            chapter_number,
        );
    }

    for c in parsed.new_consequences {
        let up = c.upgrade_desc.trim();
        let hook = c.consequence_hook.trim();
        if up.is_empty() || hook.is_empty() {
            continue;
        }
        let _ = crate::db::add_consequence(&conn, chapter_number, up, hook);
    }

    for id in parsed.resolved_consequence_ids {
        let _ = conn.execute("UPDATE consequence_ledger SET is_resolved = 1 WHERE id = ?1", rusqlite::params![id]);
    }

    Ok(())
}

fn extract_tag(content: &str, tag: &str) -> Option<String> {
    // 使用 (?s) 开启 dot-matches-newline 模式
    // 使用 (?:...) 非捕获组代替 (?=...) 前瞻断言，因为 Rust 的 regex 库不支持前瞻断言
    let pattern = format!(r"(?s)=== {} ===\s*(.*?)(?:=== [A-Z_]+ ===|$)", tag);
    if let Ok(re) = Regex::new(&pattern) {
        if let Some(caps) = re.captures(content) {
            if let Some(m) = caps.get(1) {
                return Some(m.as_str().trim().to_string());
            }
        }
    }
    None
}

fn fallback_extract_content(raw: &str) -> String {
    let mut text_to_process = raw.to_string();

    // 先用 regex 尝试截取
    if let Ok(re) = Regex::new(r"(?m)^#\s*第\d+章[^\n]*\n+([\s\S]+)") {
        if let Some(caps) = re.captures(&text_to_process) {
            if let Some(m) = caps.get(1) {
                text_to_process = m.as_str().trim().to_string();
            }
        }
    } else if let Ok(re) = Regex::new(r"(?:正文|内容|章节内容|正文开始|章节内容开始)[：:]\s*\n+([\s\S]+)") {
        if let Some(caps) = re.captures(&text_to_process) {
            if let Some(m) = caps.get(1) {
                text_to_process = m.as_str().trim().to_string();
            }
        }
    }

    let lines: Vec<&str> = text_to_process.split('\n').collect();
    let mut prose_lines = Vec::new();
    
    let re_tag = Regex::new(r"^===\s*[A-Z_]+\s*===").unwrap();
    let re_meta = Regex::new(r"^(PRE_WRITE_CHECK|CHAPTER_TITLE|章节标题|写作自检)[：:]").unwrap();
    
    for line in lines {
        let trimmed = line.trim();
        if re_tag.is_match(trimmed) {
            continue;
        }
        if re_meta.is_match(trimmed) {
            continue;
        }
        prose_lines.push(line);
    }
    
    let result = prose_lines.join("\n").trim().to_string();
    
    // 专门针对 Kimi 等思考模型在 reasoning_content 中混杂大量废话的终极抢救：
    // 寻找它最后一次真正开始写正文的锚点
    let final_markers = [
        "重写并扩充：", "重写并扩充", "【正文构思】", "【重写正文】", "【开始正文】", 
        "现在开始具体描写：", "现在写正文", "开始写：", "正文开始：", "正文内容开始："
    ];
    
    let mut final_result = result.clone();
    let mut max_idx = None;
    let mut max_len = 0;
    
    for marker in final_markers.iter() {
        if let Some(idx) = final_result.rfind(marker) {
            if max_idx.is_none() || idx > max_idx.unwrap() {
                max_idx = Some(idx);
                max_len = marker.len();
            }
        }
    }
    
    if let Some(idx) = max_idx {
        final_result = final_result[idx + max_len..].trim().to_string();
    }
    
    if final_result.chars().count() > 100 {
        final_result
    } else if result.chars().count() > 100 {
        result
    } else {
        "".to_string()
    }
}

// --- High Level constraints (Show, Don't Tell) ---
fn check_show_dont_tell(text: &str) -> Vec<String> {
    let mut warnings = Vec::new();
    let black_list = ["似乎", "感到", "觉得", "时间飞逝", "不一会儿"];
    for word in black_list {
        if text.contains(word) {
            warnings.push(format!("检测到平铺直叙 '{}'。建议使用 'Show, Don't Tell' 原则转化为物理交互描写。", word));
        }
    }
    warnings
}

// 模拟并行的专家审查流程 (Multi-Expert Auditing)
pub async fn run_multi_expert_audit(config: AppConfig, chapter_text: &str, previous_context: &str) -> Vec<AuditReport> {
    let text_for_logic = chapter_text.to_string();
    let text_for_char = chapter_text.to_string();
    let text_for_prose = chapter_text.to_string();
    
    let prev_ctx_logic = previous_context.to_string();
    let prev_ctx_char = previous_context.to_string();
    let prev_ctx_prose = previous_context.to_string();

    let llm_logic = LlmClient::new(config.api_key.clone(), config.base_url.clone(), config.model_name.clone());
    let llm_char = LlmClient::new(config.api_key.clone(), config.base_url.clone(), config.model_name.clone());
    let llm_prose = LlmClient::new(config.api_key.clone(), config.base_url.clone(), config.model_name.clone());

    // 为了防止火山引擎/豆包 API 并发限流，改为串行请求或者增加延迟交错
    
    // 1. 逻辑与战力专家
    let logic_res = {
        if llm_logic.api_key.is_empty() {
            sleep(Duration::from_millis(500)).await;
            AuditReport { expert_name: "逻辑与战力专家".to_string(), passed: true, suggestions: vec![] }
        } else {
            let prompt = "你是一个网文逻辑与战力审查专家。请结合给定的【前文剧情提要】检查当前章节文本是否存在逻辑漏洞或死者苏生等状态幻觉。如果通过请仅返回 'PASSED'，否则返回 'FAILED: 原因'。";
            let user_prompt = format!("【前文剧情提要】\n{}\n\n【当前章节文本】\n{}", prev_ctx_logic, text_for_logic);
            let resp = llm_logic.chat_completion(prompt, &user_prompt).await.unwrap_or_else(|e| e.to_string());
            let passed = resp.contains("PASSED");
            AuditReport {
                expert_name: "逻辑与战力专家".to_string(),
                passed,
                suggestions: if passed { vec![] } else { vec![resp.replace("FAILED:", "").trim().to_string()] },
            }
        }
    };

    // 2. 人设与视角专家
    let char_res = {
        if llm_char.api_key.is_empty() {
            sleep(Duration::from_millis(500)).await;
            AuditReport { expert_name: "人设与视角专家".to_string(), passed: true, suggestions: vec![] }
        } else {
            let prompt = "你是一个人设与视角审查专家。请结合给定的【前文剧情提要】检查是否存在 OOC（角色崩坏） 或万能 AI 腔。注意：角色的性格变化可能是基于前文事件导致的，请综合判断。通过返回 'PASSED'，否则返回 'FAILED: 原因'。";
            let user_prompt = format!("【前文剧情提要】\n{}\n\n【当前章节文本】\n{}", prev_ctx_char, text_for_char);
            let resp = llm_char.chat_completion(prompt, &user_prompt).await.unwrap_or_else(|e| e.to_string());
            let passed = resp.contains("PASSED");
            AuditReport {
                expert_name: "人设与视角专家".to_string(),
                passed,
                suggestions: if passed { vec![] } else { vec![resp.replace("FAILED:", "").trim().to_string()] },
            }
        }
    };

    // 3. 节奏与爽点专家 (结合本地代码强约束)
    let prose_res = {
        let mut local_warnings = check_show_dont_tell(&text_for_prose);
        
        if llm_prose.api_key.is_empty() {
            sleep(Duration::from_millis(500)).await;
            if local_warnings.is_empty() { local_warnings.push("请在设置中配置 API Key 以获取 AI 深度审查".to_string()); }
            AuditReport { expert_name: "节奏与爽点专家".to_string(), passed: false, suggestions: local_warnings }
        } else {
            let prompt = "你是节奏与爽点审查专家。请结合给定的【前文剧情提要】检查当前章节的爽点反馈和期待感。如果前文一直压抑本章必须释放爽点，否则如果全是干瘪的背景说明，请指出。通过返回 'PASSED'，否则返回 'FAILED: 原因'。";
            let user_prompt = format!("【前文剧情提要】\n{}\n\n【当前章节文本】\n{}", prev_ctx_prose, text_for_prose);
            let resp = llm_prose.chat_completion(prompt, &user_prompt).await.unwrap_or_else(|e| e.to_string());
            
            let passed = resp.contains("PASSED") && local_warnings.is_empty();
            if !resp.contains("PASSED") {
                local_warnings.push(resp.replace("FAILED:", "").trim().to_string());
            }

            AuditReport {
                expert_name: "节奏与爽点专家".to_string(),
                passed,
                suggestions: local_warnings,
            }
        }
    };

    vec![
        logic_res,
        char_res,
        prose_res,
    ]
}

#[tauri::command]
pub async fn generate_chapter_outline(state: State<'_, DbState>, chapter_number: i32, chapter_title: String) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    let book = crate::db::get_book_meta_internal(&state).map_err(|e| e.to_string())?;

    if config.api_key.is_empty() {
        sleep(Duration::from_millis(500)).await;
        return Ok("雨夜遇袭，断剑反击，逼出敌人来历；救命恩人线索浮现；主角首次付出代价，却埋下更大的伏笔。".to_string());
    }

    let previous_context = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_recent_chapters_context(&conn, chapter_number, 3).unwrap_or_default()
    };

    let open_hooks_text = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::refresh_hook_staleness(&conn, chapter_number).unwrap_or(());
        let mut stmt = conn
            .prepare("SELECT id, hook_desc, created_at_chapter, staleness FROM pending_hooks WHERE is_resolved = FALSE ORDER BY staleness DESC, created_at_chapter ASC, id ASC LIMIT 10")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, i32>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut lines: Vec<String> = Vec::new();
        for item in iter {
            let (id, desc, created, stale) = item.map_err(|e| e.to_string())?;
            lines.push(format!("- id:{} | created:{} | stale:{} | {}", id, created, stale, desc));
        }
        if lines.is_empty() { "（无）".to_string() } else { lines.join("\n") }
    };

    let (plan_one_liner, plan_locked) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let r: Result<(String, i32), rusqlite::Error> = conn.query_row(
            "SELECT one_liner, locked FROM chapter_outline_one_liners_current WHERE chapter_number = ?1",
            rusqlite::params![chapter_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match r {
            Ok((ol, lk)) => (ol, lk == 1),
            Err(_) => ("".to_string(), false),
        }
    };

    let checkpoint_text = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let active_vid = get_active_plan_version_id(conn).unwrap_or(0);
        let r: Result<String, rusqlite::Error> = if active_vid > 0 {
            conn.query_row(
                "SELECT checkpoint_json FROM outline_checkpoints WHERE version_id = ?1 AND end_chapter <= ?2 ORDER BY end_chapter DESC, id DESC LIMIT 1",
                rusqlite::params![active_vid, chapter_number - 1],
                |row| row.get(0),
            )
        } else {
            conn.query_row(
                "SELECT checkpoint_json FROM outline_checkpoints WHERE end_chapter <= ?1 ORDER BY end_chapter DESC, id DESC LIMIT 1",
                rusqlite::params![chapter_number - 1],
                |row| row.get(0),
            )
        };
        r.unwrap_or_else(|_| "".to_string())
    };

    let valence_bias = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_valence_bias(&conn, chapter_number).unwrap_or(0)
    };

    let emotion_context = if valence_bias >= 2 {
        "前文已经连续两章让主角处于顺境和爽点。本章大纲需要引入新的危机或转折，避免连续爽点导致疲劳。"
    } else if valence_bias <= -2 {
        "前文已经连续两章压抑主角。本章大纲必须安排阶段性反击或爽点释放，避免读者憋屈流失。"
    } else {
        ""
    };

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是网文大纲策划。请生成章节大纲，要求：1）200字以内；2）只输出纯文本；3）必须包含【开场钩子】【冲突升级】【章末钩子】三段；4）避免空泛形容词，给出可执行动作；5）必须承接前文剧情，不得自创与前文矛盾的设定或状态；6）若存在【待回收伏笔列表】，本章必须明确推进或回收其中至少1条（在【冲突升级】或【章末钩子】里体现）。";
    let user_prompt = format!(
        "书名：{}\n题材：{}\n一句话卖点：{}\n\n【本章规划锚点（one-liner）】\n{}\n【锁定】{}\n\n【Checkpoint 事实基准（如有）】\n{}\n\n【前文剧情提要（最近3章）】\n{}\n\n【节奏提示】\n{}\n\n【待回收伏笔列表（最多10条）】\n{}\n\n请为第{}章《{}》生成大纲。",
        book.title,
        book.genre,
        book.logline,
        if plan_one_liner.trim().is_empty() { "（无）" } else { plan_one_liner.trim() },
        if plan_locked { "true（不得偏离 one-liner 主事件与结果）" } else { "false" },
        if checkpoint_text.trim().is_empty() { "（无）" } else { checkpoint_text.trim() },
        previous_context,
        emotion_context,
        open_hooks_text,
        chapter_number,
        chapter_title
    );

    let outline = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    Ok(outline)
}

#[tauri::command]
pub async fn generate_chapter_pipeline(state: State<'_, DbState>, chapter_number: i32, chapter_title: String, outline: String) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    
    // 1. Initialize RAG Engine and Build Context
    let rag = RagEngine::new(&config);
    let current_chapter_num = chapter_number;
    
    // 【核心修复】：将当前章以前的所有已定稿的章节正文摘要或大纲传递进去，保证剧情连贯
    let mut full_outline = format!("本章大纲：{}。{}\n\n", chapter_title, outline);

    let (plan_one_liner, plan_locked) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let r: Result<(String, i32), rusqlite::Error> = conn.query_row(
            "SELECT one_liner, locked FROM chapter_outline_one_liners_current WHERE chapter_number = ?1",
            rusqlite::params![current_chapter_num],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match r {
            Ok((ol, lk)) => (ol, lk == 1),
            Err(_) => ("".to_string(), false),
        }
    };

    if !plan_one_liner.trim().is_empty() {
        full_outline.push_str(&format!(
            "【本章规划锚点（one-liner）】\n{}\n【锁定】{}\n{}\n\n",
            plan_one_liner.trim(),
            if plan_locked { "true" } else { "false" },
            if plan_locked {
                "【强约束】不得偏离 one-liner 主事件与结果，只允许补充执行细节与场景。"
            } else {
                ""
            }
        ));
    }

    let checkpoint_text = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let active_vid = get_active_plan_version_id(conn).unwrap_or(0);
        let r: Result<String, rusqlite::Error> = if active_vid > 0 {
            conn.query_row(
                "SELECT checkpoint_json FROM outline_checkpoints WHERE version_id = ?1 AND end_chapter <= ?2 ORDER BY end_chapter DESC, id DESC LIMIT 1",
                rusqlite::params![active_vid, current_chapter_num - 1],
                |row| row.get(0),
            )
        } else {
            conn.query_row(
                "SELECT checkpoint_json FROM outline_checkpoints WHERE end_chapter <= ?1 ORDER BY end_chapter DESC, id DESC LIMIT 1",
                rusqlite::params![current_chapter_num - 1],
                |row| row.get(0),
            )
        };
        r.unwrap_or_else(|_| "".to_string())
    };

    if !checkpoint_text.trim().is_empty() {
        full_outline.push_str(&format!(
            "【Checkpoint 事实基准（不得推翻）】\n{}\n\n",
            checkpoint_text.trim()
        ));
    }
    
    let previous_context = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_recent_chapters_context(&conn, current_chapter_num, 3).unwrap_or_default()
    };
    
    if !previous_context.is_empty() {
        full_outline.push_str(&format!("【前文剧情回顾（最近3章）】：\n{}\n\n请务必承接上述剧情，保持逻辑与动作的连贯性。\n\n", previous_context));
    }

    let open_hooks_text = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::refresh_hook_staleness(&conn, current_chapter_num).unwrap_or(());
        let mut stmt = conn
            .prepare("SELECT id, hook_desc, created_at_chapter, staleness FROM pending_hooks WHERE is_resolved = FALSE ORDER BY staleness DESC, created_at_chapter ASC, id ASC LIMIT 10")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, i32>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut lines: Vec<String> = Vec::new();
        for item in iter {
            let (id, desc, created, stale) = item.map_err(|e| e.to_string())?;
            lines.push(format!("- id:{} | created:{} | stale:{} | {}", id, created, stale, desc));
        }
        if lines.is_empty() { "（无）".to_string() } else { lines.join("\n") }
    };

    full_outline.push_str(&format!(
        "\n\n【待回收伏笔列表（最多10条）】\n{}\n【写作约束】本章正文必须明确推进或回收其中至少1条（用行动/信息兑现，而不是一句话带过）。\n",
        open_hooks_text
    ));
    
    // Emotional Arc Enforcement
    let valence_bias = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_valence_bias(&conn, current_chapter_num).unwrap_or(0)
    };

    if valence_bias >= 2 {
        full_outline.push_str("

【高阶剧情约束】：连续两章情绪为正（爽点）。本章必须引入新的危机或巨大的压抑，禁止让主角轻易获胜。");
    } else if valence_bias <= -2 {
        full_outline.push_str("

【高阶剧情约束】：连续两章情绪为负（压抑）。本章必须迎来释放和爽点，让主角取得阶段性胜利。");
    }
    
    let rag_context = {
        rag.build_context_for_chapter(&state.book_conn, current_chapter_num, &full_outline).await.map_err(|e| e.to_string())?
    };

    if config.api_key.is_empty() {
        sleep(Duration::from_secs(1)).await;
        return Ok(format!(
            "=== PRE_WRITE_CHECK ===\n| 检查项 | 本章记录 | 证据/定位 | 结果 |\n|--------|----------|----------|------|\n| 规划锚定 | one_liner:（Mock）按本章大纲推进 | one_liner:mock | PASS |\n| Checkpoint 一致性 | （Mock）无 | - | PASS |\n| 线程推进 | （Mock）无 | - | PASS |\n| 伏笔闭环 | （Mock）无 | - | PASS |\n| 命名一致性 | （Mock）无 | - | PASS |\n| 风险扫描 | （Mock）无 | - | PASS |\n\n=== CHAPTER_TITLE ===\n{}\n\n=== CHAPTER_CONTENT ===\n雨丝如断线的珠子，绵密地砸在青石板上，溅起细碎的水花。楚风握紧了手中的断剑，他似乎有些愤怒，因为黑衣人不仅杀了他的同伴，还觉得他好欺负。",
            if chapter_title.trim().is_empty() { "雨夜断剑" } else { chapter_title.trim() }
        ));
    }

    let anti_ai_rules_md = config.anti_ai_rules_md.clone();
    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let anti_ai_rules = anti_ai_rules_md.trim();
    let anti_ai_block = if anti_ai_rules.is_empty() {
        String::new()
    } else {
        format!("\n\n【全局去AI味写作规则（Markdown，必须遵守）】\n{}\n", anti_ai_rules)
    };
    let system_prompt = format!("你是一个顶级网文作者。根据提供的大纲和角色设定，写出充满画面感、符合'Show, Don't Tell'原则的小说正文。
## 输出格式（严格遵守）

=== PRE_WRITE_CHECK ===
（必须输出Markdown表格）
| 检查项 | 本章记录 | 证据/定位 | 结果 |
|--------|----------|----------|------|
| 规划锚定 | one_liner:（复述本章 one-liner，并说明如何执行） | one_liner:... | PASS/WARN/FAIL |
| Checkpoint 一致性 | 是否违反事实基准（如无写“无”） | violated:...（仅在冲突时） | PASS/WARN/FAIL |
| 线程推进 | 推进了哪条线（如无写“无”） | thread:THREAD_KEY | PASS/WARN/FAIL |
| 伏笔闭环 | 推进/回收了哪些伏笔（至少1条，若无伏笔写“无”） | hook_id:ID | PASS/WARN/FAIL |
| 命名一致性 | 人名/专名是否漂移 | - | PASS/WARN/FAIL |
| 风险扫描 | OOC/逻辑/设定冲突等风险 | - | PASS/WARN/FAIL |

=== CHAPTER_TITLE ===
(章节标题，不含\"第X章\"。标题必须与已有章节标题不同)

=== CHAPTER_CONTENT ===
(正文内容，目标2000-3000字以上，要求动作链清晰，感官描写具体)

【重要】本次只需输出以上三个区块（PRE_WRITE_CHECK、CHAPTER_TITLE、CHAPTER_CONTENT）。
不要输出任何其他内容。
{}{}", anti_ai_block, rag_context);

    let user_prompt = format!("章节标题：{}
章节大纲（200字以内）：
{}

请严格按照输出格式，输出完整的 PRE_WRITE_CHECK、CHAPTER_TITLE、CHAPTER_CONTENT。", chapter_title, full_outline);

    let draft = llm
        .chat_completion(&system_prompt, &user_prompt)
        .await
        .map_err(|e| e.to_string())?;

    let mut chapter_content_for_analysis = extract_tag(&draft, "CHAPTER_CONTENT").unwrap_or_default();
    if chapter_content_for_analysis.is_empty() {
        chapter_content_for_analysis = fallback_extract_content(&draft);
    }
    
    // Simulate Consequence Ledger detection
    if chapter_content_for_analysis.contains("突破")
        || chapter_content_for_analysis.contains("升级")
        || chapter_content_for_analysis.contains("神器")
    {
        let lock = state.book_conn.lock().unwrap();
        let conn_lock = lock.as_ref().ok_or("No book loaded")?;
        let _ = crate::db::add_consequence(&conn_lock, current_chapter_num, "主角获得突破或神器", "在接下来3章内引爆一个代价或危机");
    }
    
    Ok(draft)
}

#[tauri::command]
pub async fn get_dynamic_context(state: State<'_, DbState>, chapter_number: i32) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    let rag = RagEngine::new(&config);

    let (title, outline) = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT title, outline FROM chapters WHERE chapter_number = ?1",
            rusqlite::params![chapter_number],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| e.to_string())?
    };

    let chapter_outline = format!("本章大纲：{}。{}", title, outline);
    let rag_context = rag
        .build_context_for_chapter(&state.book_conn, chapter_number, &chapter_outline)
        .await
        .map_err(|e| e.to_string())?;

    Ok(rag_context)
}

#[derive(Deserialize)]
struct HookReviewResult {
    new_hooks: Vec<String>,
    resolved_hook_ids: Vec<i32>,
}

#[tauri::command]
pub async fn process_chapter_hooks(
    state: State<'_, DbState>,
    chapter_number: i32,
    outline: String,
    content: String,
) -> Result<(), String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;

    let mut hasher = Sha256::new();
    hasher.update(outline.as_bytes());
    hasher.update(b"\n");
    hasher.update(content.as_bytes());
    let digest = hasher.finalize();
    let content_hash = digest.iter().map(|b| format!("{:02x}", b)).collect::<String>();

    let prev_hash: String = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT content_hash FROM hook_process_log WHERE chapter_number = ?1",
            rusqlite::params![chapter_number],
            |row| row.get(0),
        )
        .unwrap_or_default()
    };

    if prev_hash == content_hash {
        return Ok(());
    }

    if config.api_key.is_empty() {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::refresh_hook_staleness(&conn, chapter_number).map_err(|e| e.to_string())?;
        crate::db::upsert_hooks_from_outline(&conn, chapter_number, &outline).map_err(|e| e.to_string())?;
        crate::db::auto_resolve_hooks_from_content(&conn, chapter_number, &content).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO hook_process_log (chapter_number, content_hash) VALUES (?1, ?2)",
            rusqlite::params![chapter_number, content_hash],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let open_hooks_text = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        let mut stmt = conn
            .prepare("SELECT id, hook_desc, created_at_chapter, staleness FROM pending_hooks WHERE is_resolved = FALSE ORDER BY created_at_chapter ASC, id ASC")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, i32>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut lines: Vec<String> = Vec::new();
        for item in iter {
            let (id, desc, created, stale) = item.map_err(|e| e.to_string())?;
            lines.push(format!("- id:{} | created:{} | stale:{} | {}", id, created, stale, desc));
        }

        if lines.is_empty() {
            "（当前没有未回收伏笔）".to_string()
        } else {
            lines.join("\n")
        }
    };

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是网文编辑的结构化抽取器。根据输入的【本章大纲】与【本章正文】，做两件事：\n1）抽取本章新增的“伏笔/未解释线索/未来要回收的坑”（new_hooks）。\n2）判断当前未回收伏笔列表中，哪些在本章已经被明确回收/解释/兑现（resolved_hook_ids）。\n要求：\n- 只输出严格 JSON，不要 Markdown。\n- new_hooks 输出 0-5 条，每条 <= 30 字，必须是可追踪的具体信息点，不要空泛。\n- resolved_hook_ids 必须是数字数组，只能从给定的未回收列表里选。\n- 如果不确定是否回收，宁可不勾选。\nJSON 结构：{\"new_hooks\": [\"...\"], \"resolved_hook_ids\": [1,2]}";

    let user_prompt = format!(
        "【未回收伏笔列表】\n{}\n\n【本章大纲】\n{}\n\n【本章正文】\n{}\n",
        open_hooks_text,
        outline,
        content
    );

    let resp = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    let clean = resp.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    let parsed: HookReviewResult = serde_json::from_str(clean).map_err(|e| format!("AI 伏笔抽取 JSON 格式错误: {}", e))?;

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    for hook_desc in parsed.new_hooks.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        conn.execute(
            "INSERT OR IGNORE INTO pending_hooks (hook_desc, created_at_chapter, staleness, is_resolved) VALUES (?1, ?2, 0, FALSE)",
            rusqlite::params![hook_desc, chapter_number],
        )
        .map_err(|e| e.to_string())?;
    }

    for id in parsed.resolved_hook_ids {
        conn.execute(
            "UPDATE pending_hooks SET is_resolved = TRUE, resolved_at_chapter = ?1 WHERE id = ?2",
            rusqlite::params![chapter_number, id],
        )
        .map_err(|e| e.to_string())?;
    }

    crate::db::refresh_hook_staleness(&conn, chapter_number).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO hook_process_log (chapter_number, content_hash) VALUES (?1, ?2)",
        rusqlite::params![chapter_number, content_hash],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn run_audit(state: State<'_, DbState>, chapter_text: String, chapter_number: i32) -> Result<Vec<AuditReport>, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    
    let previous_context = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_recent_chapters_context(&conn, chapter_number, 3).unwrap_or_default()
    };
    
    let reports = run_multi_expert_audit(config, &chapter_text, &previous_context).await;
    Ok(reports)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ReviewMeta {
    pub cached: bool,
    pub mock: bool,
    pub forced: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct StructuredReview {
    pub audit_reports: Vec<AuditReport>,
    pub reader_reactions: Vec<ReaderReaction>,
    pub new_hooks: Vec<String>,
    pub resolved_hook_ids: Vec<i32>,
    pub meta: Option<ReviewMeta>,
}

#[derive(Serialize, Deserialize)]
pub struct StructuredReviewHistoryItem {
    pub id: i32,
    pub chapter_number: i32,
    pub created_at: i64,
    pub content_hash: String,
    pub result: StructuredReview,
}

#[tauri::command]
pub async fn get_latest_structured_review(
    state: State<'_, DbState>,
    chapter_number: i32,
) -> Result<Option<StructuredReview>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let row: Result<String, _> = conn.query_row(
        "SELECT result_json FROM chapter_review_history WHERE chapter_number = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
        rusqlite::params![chapter_number],
        |row| row.get(0),
    );

    let json = match row {
        Ok(j) => j,
        Err(_) => return Ok(None),
    };

    let parsed: StructuredReview = serde_json::from_str(&json).map_err(|e| format!("历史评审 JSON 解析失败: {}", e))?;
    Ok(Some(parsed))
}

#[tauri::command]
pub async fn get_structured_review_history(
    state: State<'_, DbState>,
    chapter_number: i32,
    limit: i32,
) -> Result<Vec<StructuredReviewHistoryItem>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, chapter_number, created_at, content_hash, result_json FROM chapter_review_history WHERE chapter_number = ?1 ORDER BY created_at DESC, id DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;

    let iter = stmt
        .query_map(rusqlite::params![chapter_number, limit], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut items: Vec<StructuredReviewHistoryItem> = Vec::new();
    for item in iter {
        let (id, chapter_number, created_at, content_hash, json) = item.map_err(|e| e.to_string())?;
        let parsed: StructuredReview = serde_json::from_str(&json).map_err(|e| format!("历史评审 JSON 解析失败: {}", e))?;
        items.push(StructuredReviewHistoryItem {
            id,
            chapter_number,
            created_at,
            content_hash,
            result: parsed,
        });
    }
    Ok(items)
}

#[tauri::command]
pub async fn run_structured_review(
    state: State<'_, DbState>,
    chapter_number: i32,
    outline: String,
    chapter_text: String,
    force_refresh: Option<bool>,
) -> Result<StructuredReview, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    let forced = force_refresh.unwrap_or(false);

    let previous_context = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_recent_chapters_context(&conn, chapter_number, 3).unwrap_or_default()
    };

    let valence_bias = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_valence_bias(&conn, chapter_number).unwrap_or(0)
    };

    let emotion_context = if valence_bias >= 2 {
        "前文已经连续两章让主角处于顺境和爽点。读者现在期待看到新的挑战或转折。"
    } else if valence_bias <= -2 {
        "前文已经连续两章压抑主角。读者现在极度渴望看到爆发和爽点释放。"
    } else {
        ""
    };

    let open_hooks_text = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::refresh_hook_staleness(&conn, chapter_number).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, hook_desc, created_at_chapter, staleness FROM pending_hooks WHERE is_resolved = FALSE ORDER BY created_at_chapter ASC, id ASC")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, i32>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut lines: Vec<String> = Vec::new();
        for item in iter {
            let (id, desc, created, stale) = item.map_err(|e| e.to_string())?;
            lines.push(format!("- id:{} | created:{} | stale:{} | {}", id, created, stale, desc));
        }

        if lines.is_empty() {
            "（当前没有未回收伏笔）".to_string()
        } else {
            lines.join("\n")
        }
    };

    let mut hasher = Sha256::new();
    hasher.update(previous_context.as_bytes());
    hasher.update(b"\n");
    hasher.update(emotion_context.as_bytes());
    hasher.update(b"\n");
    hasher.update(open_hooks_text.as_bytes());
    hasher.update(b"\n");
    hasher.update(outline.as_bytes());
    hasher.update(b"\n");
    hasher.update(chapter_text.as_bytes());
    let digest = hasher.finalize();
    let content_hash = digest.iter().map(|b| format!("{:02x}", b)).collect::<String>();

    let cached_json: Option<String> = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        let row: Result<(String, String), _> = conn.query_row(
            "SELECT content_hash, result_json FROM review_cache WHERE chapter_number = ?1",
            rusqlite::params![chapter_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match row {
            Ok((hash, json)) if hash == content_hash => Some(json),
            _ => None,
        }
    };

    if !forced {
        if let Some(json) = cached_json {
            let mut parsed: StructuredReview = serde_json::from_str(&json).map_err(|e| format!("缓存 JSON 解析失败: {}", e))?;
            parsed.meta = Some(ReviewMeta { cached: true, mock: false, forced: false });

            let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM chapter_review_history WHERE chapter_number = ?1 AND content_hash = ?2)",
                    rusqlite::params![chapter_number, content_hash],
                    |row| row.get(0),
                )
                .unwrap_or(false);

            if !exists {
                let created_at = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                conn.execute(
                    "INSERT OR IGNORE INTO chapter_review_history (chapter_number, content_hash, created_at, result_json) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![chapter_number, content_hash, created_at, json],
                )
                .map_err(|e| e.to_string())?;
            }

            return Ok(parsed);
        }
    }

    if config.api_key.is_empty() {
        let reports = run_multi_expert_audit(config, &chapter_text, &previous_context).await;
        let reactions = vec![
            ReaderReaction { reader_type: "逻辑党".to_string(), comment: "这里的动机有点牵强，前面铺垫不够。".to_string(), timestamp: "00:12".to_string() },
            ReaderReaction { reader_type: "无脑爽文受众".to_string(), comment: "赶紧打脸！别一直憋着。".to_string(), timestamp: "00:45".to_string() },
            ReaderReaction { reader_type: "剧情党".to_string(), comment: "章末钩子可以再狠一点。".to_string(), timestamp: "01:03".to_string() },
        ];

        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::upsert_hooks_from_outline(&conn, chapter_number, &outline).map_err(|e| e.to_string())?;
        crate::db::auto_resolve_hooks_from_content(&conn, chapter_number, &chapter_text).map_err(|e| e.to_string())?;
        crate::db::refresh_hook_staleness(&conn, chapter_number).map_err(|e| e.to_string())?;

        let result = StructuredReview {
            audit_reports: reports,
            reader_reactions: reactions,
            new_hooks: vec![],
            resolved_hook_ids: vec![],
            meta: Some(ReviewMeta { cached: false, mock: true, forced }),
        };

        let mut stored = result.clone();
        stored.meta = None;
        let json = serde_json::to_string(&stored).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT OR REPLACE INTO review_cache (chapter_number, content_hash, result_json) VALUES (?1, ?2, ?3)",
            rusqlite::params![chapter_number, content_hash, json],
        )
        .map_err(|e| e.to_string())?;

        crate::db::propose_world_entities_from_text(&conn, chapter_number, &previous_context).map_err(|e| e.to_string())?;
        crate::db::propose_world_entities_from_text(&conn, chapter_number, &outline).map_err(|e| e.to_string())?;
        crate::db::propose_world_entities_from_text(&conn, chapter_number, &chapter_text).map_err(|e| e.to_string())?;
        for r in result.audit_reports.iter() {
            for s in r.suggestions.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
                let _ = conn.execute(
                    "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                     VALUES ('review', '结构化评审', 'suggestion', ?1, 0.6, ?2, ?1, 'pending')",
                    rusqlite::params![s, chapter_number],
                );
            }
        }

        return Ok(result);
    }

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是网文编辑团队的“结构化评审器”。你必须只输出严格 JSON，不要 Markdown。\n你要同时完成三件事：\n1) 专家审查：输出 audit_reports（逻辑与战力、人设与视角、节奏与爽点），每个包含 expert_name, passed, suggestions(0-4条)。\n2) 读者弹幕：输出 reader_reactions 3 条，包含 reader_type/comment/timestamp。\n3) 伏笔闭环：输出 new_hooks(0-2条，每条<=24字) 与 resolved_hook_ids(只能从输入的未回收伏笔 id 中选择；不确定就别选)。\n伏笔要求：\n- 只提“主线级可追踪疑问/秘密/代价”，不要把氛围描写当伏笔。\n- 禁止输出具体镜头细节（例如“供桌暗格露出一角密函/锁链拖动声/青烟落处”等），这类属于描写，不属于必须回收的坑。\n- new_hooks 宁缺毋滥；如果本章没有新增关键坑，输出空数组。\n要求：\n- 所有判断必须结合【前文剧情提要】与【节奏提示】。\n- suggestions 必须是可操作的具体问题点，避免空泛。\n- reader_reactions 要有真实网文语气，短促、有槽点。\nJSON 结构：{\"audit_reports\":[{\"expert_name\":\"...\",\"passed\":true,\"suggestions\":[]}],\"reader_reactions\":[{\"reader_type\":\"...\",\"comment\":\"...\",\"timestamp\":\"00:12\"}],\"new_hooks\":[\"...\"],\"resolved_hook_ids\":[1,2]}";

    let user_prompt = format!(
        "【前文剧情提要（最近3章）】\n{}\n\n【节奏提示】\n{}\n\n【未回收伏笔列表】\n{}\n\n【本章大纲】\n{}\n\n【本章正文】\n{}",
        previous_context,
        emotion_context,
        open_hooks_text,
        outline,
        chapter_text
    );

    let resp = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    let clean = resp
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();

    let mut parsed: StructuredReview = serde_json::from_str(clean).map_err(|e| format!("结构化评审 JSON 格式错误: {}", e))?;
    parsed.meta = Some(ReviewMeta { cached: false, mock: false, forced });

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let banned_fragments = [
        "供桌", "暗格", "一角", "锁链", "拖动", "青烟", "落处", "吸噬", "细微", "砖下", "血线", "渗入", "露出", "角落",
    ];
    let must_keywords = [
        "身份", "真相", "阴谋", "幕后", "来历", "副作用", "惩罚", "法则", "追踪", "时限", "代价", "禁制", "传承", "印记", "隐患", "反噬",
    ];

    let mut filtered_hooks: Vec<String> = Vec::new();
    for raw in parsed.new_hooks.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        let len = raw.chars().count();
        if len < 6 || len > 24 {
            continue;
        }
        if banned_fragments.iter().any(|b| raw.contains(b)) {
            continue;
        }
        if !must_keywords.iter().any(|k| raw.contains(k)) {
            continue;
        }
        if filtered_hooks.iter().any(|h| h == raw) {
            continue;
        }
        filtered_hooks.push(raw.to_string());
        if filtered_hooks.len() >= 2 {
            break;
        }
    }

    parsed.new_hooks = filtered_hooks;

    let open_count: i32 = conn
        .query_row("SELECT COUNT(1) FROM pending_hooks WHERE is_resolved = FALSE", [], |row| row.get(0))
        .unwrap_or(0);

    let allow_insert = open_count < 12;
    for hook_desc in parsed.new_hooks.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
        if !allow_insert {
            break;
        }
        conn.execute(
            "INSERT OR IGNORE INTO pending_hooks (hook_desc, created_at_chapter, staleness, is_resolved) VALUES (?1, ?2, 0, FALSE)",
            rusqlite::params![hook_desc, chapter_number],
        )
        .map_err(|e| e.to_string())?;
    }

    for id in parsed.resolved_hook_ids.iter().copied() {
        conn.execute(
            "UPDATE pending_hooks SET is_resolved = TRUE, resolved_at_chapter = ?1 WHERE id = ?2",
            rusqlite::params![chapter_number, id],
        )
        .map_err(|e| e.to_string())?;
    }

    crate::db::refresh_hook_staleness(&conn, chapter_number).map_err(|e| e.to_string())?;

    let mut stored = parsed.clone();
    stored.meta = None;
    let json = serde_json::to_string(&stored).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO review_cache (chapter_number, content_hash, result_json) VALUES (?1, ?2, ?3)",
        rusqlite::params![chapter_number, content_hash, json],
    )
    .map_err(|e| e.to_string())?;

    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    conn.execute(
        "INSERT OR IGNORE INTO chapter_review_history (chapter_number, content_hash, created_at, result_json) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![chapter_number, content_hash, created_at, json],
    )
    .map_err(|e| e.to_string())?;

    crate::db::propose_world_entities_from_text(&conn, chapter_number, &previous_context).map_err(|e| e.to_string())?;
    crate::db::propose_world_entities_from_text(&conn, chapter_number, &outline).map_err(|e| e.to_string())?;
    crate::db::propose_world_entities_from_text(&conn, chapter_number, &chapter_text).map_err(|e| e.to_string())?;
    for r in parsed.audit_reports.iter() {
        for s in r.suggestions.iter().map(|s| s.trim()).filter(|s| !s.is_empty()) {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                 VALUES ('review', '结构化评审', 'suggestion', ?1, 0.6, ?2, ?1, 'pending')",
                rusqlite::params![s, chapter_number],
            );
        }
    }

    Ok(parsed)
}

#[tauri::command]
pub async fn ai_extract_world_facts_from_chapters(
    state: State<'_, DbState>,
    start_chapter: Option<i32>,
    end_chapter: Option<i32>,
    clear_pending: Option<bool>,
) -> Result<i64, String> {
    let start_chapter = start_chapter.unwrap_or(1).max(1);
    let end_chapter = end_chapter.unwrap_or(i32::MAX);
    let clear_pending = clear_pending.unwrap_or(false);

    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法使用 AI 提取".to_string());
    }

    let chapters: Vec<(i32, String, String)> = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;

        if clear_pending {
            conn.execute(
                "DELETE FROM world_facts_proposals
                 WHERE status = 'pending' AND source_chapter >= ?1 AND source_chapter <= ?2",
                rusqlite::params![start_chapter, end_chapter],
            )
                .map_err(|e| e.to_string())?;
        }

        let mut stmt = conn
            .prepare(
                "SELECT chapter_number, outline, content
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
                    row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                ))
            })
            .map_err(|e| e.to_string())?;
        iter.flatten().collect()
    };

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);

    let extract_system_prompt = "你是小说写作软件的“世界观信息抽取器”。你必须只输出严格 JSON 数组，不要 Markdown。\n抽取目标：只抽取“世界观级”信息（角色/势力地点/神器功法/关键道具）与“时序事实”（归属 owner、状态 status）。\n禁止：不要抽取描写短语、动作短语、情绪短语、比喻、环境描写；不要把一句话片段当成人名。\n严格证据：source_span 必须是原文中连续的一句/片段（必须逐字拷贝），不得改写、不得总结。\n输出格式：[{\"entity_type\":\"character|location|item\",\"entity_name\":\"...\",\"fact_key\":\"description|owner|status\",\"fact_value\":\"...\",\"confidence\":0.0-1.0,\"source_span\":\"...\"}]。\n规则：\n- entity_name 必须是专有名词（2~8字为主）。\n- owner/status 必须基于明确句子（例如“X得到Y/Y落入X”“X重伤/身亡”），source_span 必须同时包含 entity_name 与 fact_value。\n- description <= 40 字。\n- 每次最多输出 6 条，宁缺毋滥。";

    let verify_system_prompt = "你是“事实核对器”。你会收到【原文】与【候选事实列表(JSON)】。\n任务：只保留能被原文直接证明的事实。严格要求：\n1) 每条的 source_span 必须是原文中连续子串，逐字拷贝。\n2) source_span 必须包含 entity_name。\n3) 若 fact_key 是 owner/status，source_span 必须同时包含 fact_value。\n4) 不要输出任何无法核对的条目。\n只输出严格 JSON 数组，不要 Markdown。";

    let mut inserted: i64 = 0;

    for (num, outline, content) in chapters {
        let outline = outline.trim();
        let content_excerpt: String = content.chars().take(12000).collect();
        let full_text = if outline.is_empty() {
            content_excerpt.clone()
        } else {
            format!("【大纲】\n{}\n\n【正文】\n{}", outline, content_excerpt)
        };

        let chunks = {
            let mut c = chunk_text(&full_text, 2200, 220);
            if c.len() > 5 {
                c.truncate(5);
            }
            c
        };

        let mut raw: Vec<AiWorldFact> = Vec::new();
        for (i, part) in chunks.iter().enumerate() {
            let user_prompt = format!(
                "【第{}章 - 分段 {}/{}】\n【原文片段】\n{}\n\n请按要求输出 JSON 数组。",
                num,
                i + 1,
                chunks.len(),
                part
            );
            let resp = llm
                .chat_completion(extract_system_prompt, &user_prompt)
                .await
                .map_err(|e| e.to_string())?;
            let clean = clean_ai_json(&resp);
            if let Ok(mut facts) = serde_json::from_str::<Vec<AiWorldFact>>(clean) {
                raw.append(&mut facts);
            }
        }

        let mut merged: std::collections::HashMap<(String, String, String), AiWorldFact> = std::collections::HashMap::new();
        let mut conflicts: Vec<(String, String, String, String)> = Vec::new(); // (entity_type, entity_name, fact_key, joined_values)

        for f in raw.into_iter() {
            let et = normalize_ws(&f.entity_type).to_lowercase();
            let ek = normalize_ws(&f.fact_key).to_lowercase();
            if et != "character" && et != "location" && et != "item" {
                continue;
            }
            if ek != "description" && ek != "owner" && ek != "status" {
                continue;
            }
            let name = normalize_ws(&f.entity_name);
            if name.chars().count() < 2 || name.chars().count() > 12 {
                continue;
            }
            let value = normalize_ws(&f.fact_value);
            if value.is_empty() {
                continue;
            }
            let span = normalize_ws(f.source_span.as_deref().unwrap_or(""));
            if !is_substring(&full_text, &span) {
                continue;
            }
            if !span.contains(&name) {
                continue;
            }
            if (ek == "owner" || ek == "status") && !span.contains(&value) {
                continue;
            }

            let confidence = f.confidence.unwrap_or(0.55).clamp(0.0, 1.0);
            let key = (et.clone(), name.clone(), ek.clone());
            if let Some(existing) = merged.get(&key) {
                let ev = normalize_ws(&existing.fact_value);
                if ev != value {
                    conflicts.push((et.clone(), name.clone(), ek.clone(), format!("{} | {}", ev, value)));
                }
                let ec = existing.confidence.unwrap_or(0.55);
                if confidence > ec {
                    merged.insert(
                        key,
                        AiWorldFact {
                            entity_type: et,
                            entity_name: name,
                            fact_key: ek,
                            fact_value: value,
                            confidence: Some(confidence),
                            source_span: Some(span),
                        },
                    );
                }
            } else {
                merged.insert(
                    key,
                    AiWorldFact {
                        entity_type: et,
                        entity_name: name,
                        fact_key: ek,
                        fact_value: value,
                        confidence: Some(confidence),
                        source_span: Some(span),
                    },
                );
            }
        }

        let mut candidates: Vec<AiWorldFact> = merged.into_values().collect();
        candidates.sort_by(|a, b| {
            b.confidence
                .unwrap_or(0.0)
                .partial_cmp(&a.confidence.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        if candidates.len() > 12 {
            candidates.truncate(12);
        }

        let verified: Vec<AiWorldFact> = if candidates.is_empty() {
            vec![]
        } else {
            let cand_json = serde_json::to_string(&candidates).unwrap_or("[]".to_string());
            let user_prompt = format!(
                "【原文】\n{}\n\n【候选事实列表(JSON)】\n{}\n\n请输出核对后的 JSON 数组。",
                full_text, cand_json
            );
            let resp = llm.chat_completion(verify_system_prompt, &user_prompt).await;
            if let Ok(resp) = resp {
                let clean = clean_ai_json(&resp);
                if let Ok(v) = serde_json::from_str::<Vec<AiWorldFact>>(clean) {
                    v
                } else {
                    candidates
                }
            } else {
                candidates
            }
        };

        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;

        for f in verified.into_iter() {
            let et = f.entity_type.trim();
            let ek = f.fact_key.trim();
            let name = f.entity_name.trim();
            let value = f.fact_value.trim();
            let span = f.source_span.unwrap_or_default();
            if !is_substring(&full_text, &span) {
                continue;
            }
            if !span.contains(name) {
                continue;
            }
            if (ek == "owner" || ek == "status") && !span.contains(value) {
                continue;
            }
            let confidence = f.confidence.unwrap_or(0.55).clamp(0.0, 1.0);

            if ek == "description" {
                let exists: bool = match et {
                    "character" => conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM character_bibles WHERE name = ?1)",
                            [name],
                            |row| row.get(0),
                        )
                        .unwrap_or(false),
                    "location" => conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM world_locations WHERE name = ?1)",
                            [name],
                            |row| row.get(0),
                        )
                        .unwrap_or(false),
                    "item" => conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM world_items WHERE name = ?1)",
                            [name],
                            |row| row.get(0),
                        )
                        .unwrap_or(false),
                    _ => false,
                };
                if exists {
                    continue;
                }
            }

            if ek == "owner" || ek == "status" {
                let exists: bool = conn
                    .query_row(
                        "SELECT EXISTS(
                            SELECT 1 FROM temporal_states
                            WHERE entity_id = ?1 AND entity_type = ?2 AND state_key = ?3 AND state_value = ?4
                              AND valid_from_chapter <= ?5
                              AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?5)
                        )",
                        rusqlite::params![name, et, ek, value, num],
                        |row| row.get(0),
                    )
                    .unwrap_or(false);
                if exists {
                    continue;
                }
            }

            let affected = conn
                .execute(
                    "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending')",
                    rusqlite::params![et, name, ek, value, confidence, num, span],
                )
                .unwrap_or(0);
            inserted += affected as i64;
        }

        for (_et, name, ek, joined) in conflicts {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO world_facts_proposals (entity_type, entity_name, fact_key, fact_value, confidence, source_chapter, source_span, status)
                 VALUES ('conflict', ?1, ?2, ?3, 0.85, ?4, '', 'pending')",
                rusqlite::params![name, ek, format!("候选冲突：{}", joined), num],
            );
        }
    }

    Ok(inserted)
}

fn proposal_exists(conn: &rusqlite::Connection, proposal_type: &str, source_chapter: Option<i32>, payload_json: &str) -> bool {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM proposals
            WHERE status = 'pending' AND proposal_type = ?1
              AND ((source_chapter IS NULL AND ?2 IS NULL) OR source_chapter = ?2)
              AND payload_json = ?3
        )",
        rusqlite::params![proposal_type, source_chapter, payload_json],
        |row| row.get::<_, bool>(0),
    )
    .unwrap_or(false)
}

fn insert_proposal(conn: &rusqlite::Connection, proposal_type: &str, payload: &serde_json::Value, source_chapter: Option<i32>, confidence: f64) -> Result<i64, String> {
    let payload_json = serde_json::to_string(payload).unwrap_or("{}".to_string());
    if proposal_exists(conn, proposal_type, source_chapter, &payload_json) {
        return Ok(0);
    }
    let affected = conn
        .execute(
            "INSERT INTO proposals (proposal_type, payload_json, source_chapter, status, confidence) VALUES (?1, ?2, ?3, 'pending', ?4)",
            rusqlite::params![proposal_type, payload_json, source_chapter, confidence.clamp(0.0, 1.0)],
        )
        .map_err(|e| e.to_string())?;
    Ok(affected as i64)
}

#[derive(Deserialize)]
struct OutlinePatchSuggestion {
    should_patch: bool,
    patch: Option<OutlinePatchBody>,
    confidence: Option<f64>,
}

#[derive(Deserialize)]
struct OutlinePatchBody {
    chapter_number: i32,
    one_liner: String,
    tags: Vec<String>,
    cast_refs: Vec<String>,
    thread_refs: Vec<String>,
}

#[tauri::command]
pub async fn ai_propose_outline_patch_from_chapter(state: State<'_, DbState>, chapter_number: i32) -> Result<i64, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法使用 AI 提案".to_string());
    }

    let (planned_one_liner, planned_tags_json, planned_cast_json, planned_thread_json) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT one_liner, tags_json, cast_refs_json, thread_refs_json FROM chapter_outline_one_liners_current WHERE chapter_number = ?1",
            [chapter_number],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)),
        )
        .unwrap_or_else(|_| ("".to_string(), "[]".to_string(), "[]".to_string(), "[]".to_string()))
    };

    if planned_one_liner.trim().is_empty() {
        return Ok(0);
    }

    let (outline, content) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT outline, content FROM chapters WHERE chapter_number = ?1",
            [chapter_number],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default())),
        )
        .map_err(|e| e.to_string())?
    };

    let tags: Vec<String> = serde_json::from_str(&planned_tags_json).unwrap_or_default();
    let cast_refs: Vec<String> = serde_json::from_str(&planned_cast_json).unwrap_or_default();
    let thread_refs: Vec<String> = serde_json::from_str(&planned_thread_json).unwrap_or_default();
    let content_excerpt: String = content.chars().take(6000).collect();
    let outline_excerpt: String = outline.chars().take(1200).collect();

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是小说策划的“规划对齐器”。你必须只输出严格 JSON（不要 Markdown）。\n输入包含：规划一行梗概、标签、人物/线程引用，以及本章大纲/正文摘录。\n任务：判断规划是否与实际偏离明显；若偏离明显输出 should_patch=true 并给出更新后的 patch。\n输出结构：{\"should_patch\":true/false,\"patch\":{\"chapter_number\":1,\"one_liner\":\"...\",\"tags\":[\"\"],\"cast_refs\":[\"\"],\"thread_refs\":[\"\"]},\"confidence\":0.0-1.0}\n要求：\n- one_liner 必须是事件推进句，20~60 字。\n- tags/cast_refs/thread_refs 可为空数组。\n- 不确定就 should_patch=false。";
    let user_prompt = format!(
        "【规划 one_liner】\n{}\n\n【规划 tags】\n{}\n\n【规划 cast_refs】\n{}\n\n【规划 thread_refs】\n{}\n\n【本章大纲】\n{}\n\n【本章正文摘录】\n{}",
        planned_one_liner,
        serde_json::to_string(&tags).unwrap_or("[]".to_string()),
        serde_json::to_string(&cast_refs).unwrap_or("[]".to_string()),
        serde_json::to_string(&thread_refs).unwrap_or("[]".to_string()),
        outline_excerpt,
        content_excerpt
    );
    let resp = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    let parsed: OutlinePatchSuggestion = parse_json_strict(&resp)?;
    if !parsed.should_patch {
        return Ok(0);
    }
    let Some(body) = parsed.patch else {
        return Ok(0);
    };

    let patch = OutlinePatch {
        chapter_number: body.chapter_number,
        one_liner: Some(body.one_liner),
        tags: Some(body.tags),
        cast_refs: Some(body.cast_refs),
        thread_refs: Some(body.thread_refs),
        locked: None,
    };
    let payload = serde_json::json!({ "patches": [patch] });
    let confidence = parsed.confidence.unwrap_or(0.65);

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    insert_proposal(conn, "outline_patch", &payload, Some(chapter_number), confidence)
}

#[tauri::command]
pub async fn ai_propose_threads_from_chapter(state: State<'_, DbState>, chapter_number: i32) -> Result<i64, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法使用 AI 提案".to_string());
    }

    let (outline, content) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT outline, content FROM chapters WHERE chapter_number = ?1",
            [chapter_number],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default())),
        )
        .map_err(|e| e.to_string())?
    };

    let existing_threads = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let mut stmt = conn
            .prepare("SELECT thread_key, type, title, status FROM story_threads ORDER BY updated_at DESC, id DESC LIMIT 25")
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?)))
            .map_err(|e| e.to_string())?;
        let mut lines = Vec::new();
        for item in iter.flatten() {
            lines.push(format!("- {} | {} | {} | {}", item.0, item.1, item.2, item.3));
        }
        if lines.is_empty() { "（无）".to_string() } else { lines.join("\n") }
    };

    let outline_excerpt: String = outline.chars().take(1200).collect();
    let content_excerpt: String = content.chars().take(7000).collect();

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是小说策划的“线程管理助手”。你必须只输出严格 JSON 数组（不要 Markdown）。\n任务：根据本章大纲/正文，提出需要新增的故事线程 0-2 条。\n每条结构必须符合：{\"type\":\"main|sub|growth|mystery|character\",\"title\":\"...\",\"goal\":\"...\",\"stakes\":\"...\",\"status\":\"todo|doing|done|parked\",\"owner_characters\":[\"\"],\"start_chapter\":1,\"end_chapter\":null,\"milestones\":[\"\"],\"notes\":\"\"}\n要求：\n- 不要输出 id/thread_key 字段。\n- title 必须具体，<= 30 字。\n- 不确定就输出空数组。";
    let user_prompt = format!(
        "【已有线程列表】\n{}\n\n【本章大纲】\n{}\n\n【本章正文摘录】\n{}",
        existing_threads, outline_excerpt, content_excerpt
    );
    let resp = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    let threads: Vec<StoryThreadUpsert> = parse_json_strict(&resp)?;
    if threads.is_empty() {
        return Ok(0);
    }

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut inserted: i64 = 0;
    for t in threads {
        let payload = serde_json::to_value(&t).unwrap_or(serde_json::json!({}));
        inserted += insert_proposal(conn, "thread_upsert", &payload, Some(chapter_number), 0.65)?;
    }
    Ok(inserted)
}

#[tauri::command]
pub async fn ai_propose_soul_timeline_from_chapter(state: State<'_, DbState>, chapter_number: i32) -> Result<i64, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法使用 AI 提案".to_string());
    }

    let (outline, content) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT outline, content FROM chapters WHERE chapter_number = ?1",
            [chapter_number],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default())),
        )
        .map_err(|e| e.to_string())?
    };

    let mut candidates: Vec<String> = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let cast_json = conn
            .query_row(
                "SELECT cast_refs_json FROM chapter_outline_one_liners_current WHERE chapter_number = ?1",
                [chapter_number],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str::<Vec<String>>(&cast_json).unwrap_or_default()
    };

    if candidates.is_empty() {
        let all_chars: Vec<String> = {
            let lock = state.book_conn.lock().unwrap();
            let conn = lock.as_ref().ok_or("No book loaded")?;
            let mut stmt = conn
                .prepare("SELECT name FROM character_bibles ORDER BY id ASC LIMIT 40")
                .map_err(|e| e.to_string())?;
            let iter = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
            iter.flatten().collect()
        };
        let hay = format!("{}\n{}", outline, content);
        for n in all_chars {
            if hay.contains(&n) {
                candidates.push(n);
            }
            if candidates.len() >= 6 {
                break;
            }
        }
    }

    candidates.retain(|s| !s.trim().is_empty());
    candidates.truncate(6);
    if candidates.is_empty() {
        return Ok(0);
    }

    let outline_excerpt: String = outline.chars().take(1200).collect();
    let content_excerpt: String = content.chars().take(7000).collect();
    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是人物弧光分析师。你必须只输出严格 JSON 数组（不要 Markdown）。\n任务：对给定角色列表，判断本章是否出现可记录的 SOUL 状态变化。\n每条结构：{\"character_name\":\"\",\"valid_from_chapter\":1,\"valid_to_chapter\":null,\"soul_state\":{},\"reason_span\":\"\",\"source\":\"ai\",\"confidence\":0.0}\n要求：\n- 只输出高置信变化，宁缺毋滥。\n- reason_span 必须描述本章事件导致的变化，<= 60 字。\n- soul_state 至少包含 belief/desire/fear/trait 其中一项。\n- character_name 必须来自给定列表。";
    let user_prompt = format!(
        "【角色列表】\n{}\n\n【本章大纲】\n{}\n\n【本章正文摘录】\n{}",
        serde_json::to_string(&candidates).unwrap_or("[]".to_string()),
        outline_excerpt,
        content_excerpt
    );
    let resp = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    let items: Vec<SoulTimelineUpsert> = parse_json_strict(&resp)?;
    if items.is_empty() {
        return Ok(0);
    }

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut inserted: i64 = 0;
    for mut it in items {
        if !candidates.iter().any(|c| c == &it.character_name) {
            continue;
        }
        if it.valid_from_chapter <= 0 {
            it.valid_from_chapter = chapter_number;
        }
        if it.source.trim().is_empty() {
            it.source = "ai".to_string();
        }
        let payload = serde_json::to_value(&it).unwrap_or(serde_json::json!({}));
        inserted += insert_proposal(conn, "soul_timeline_upsert", &payload, Some(chapter_number), it.confidence.unwrap_or(0.65))?;
    }
    Ok(inserted)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ReaderReaction {
    pub reader_type: String,
    pub comment: String,
    pub timestamp: String,
}

#[derive(Serialize, Deserialize)]
pub struct GoldenChapter {
    pub chapter_number: i32,
    pub title: String,
    pub outline: String,
}

#[derive(Serialize, Deserialize)]
pub struct BookArchitectData {
    pub worldview: String,
    pub full_outline: String,
    pub golden_first_3_chapters: Vec<GoldenChapter>,
}

#[tauri::command]
pub async fn generate_next_chapter_outline(state: State<'_, DbState>) -> Result<(), String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    let book = crate::db::get_book_meta_internal(&state).map_err(|e| e.to_string())?;
    
    // Get the highest chapter number
    let next_chapter_number = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row("SELECT COALESCE(MAX(chapter_number), 0) + 1 FROM chapters", [], |row| row.get::<_, i32>(0)).unwrap_or(1)
    };

    // Get previous chapters for context (last 3)
    let previous_context = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        let mut stmt = conn.prepare("SELECT chapter_number, title, outline FROM chapters ORDER BY chapter_number DESC LIMIT 3").unwrap();
        let iter = stmt.query_map([], |row| {
            let num: i32 = row.get(0)?;
            let title: String = row.get(1)?;
            let outline: String = row.get(2)?;
            Ok(format!("第{}章《{}》大纲：{}", num, title, outline))
        }).unwrap();
        
        let mut ctx = Vec::new();
        for item in iter {
            if let Ok(c) = item {
                ctx.push(c);
            }
        }
        ctx.reverse(); // Order from oldest to newest
        ctx.join("\n")
    };

    if config.api_key.is_empty() {
        sleep(Duration::from_millis(1000)).await;
        let mock_title = format!("第{}章：新的危机", next_chapter_number);
        let mock_outline = "（模拟大纲）主角在上一章的战斗后，来到了一处神秘的山谷，发现了隐藏的线索。";
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.execute(
            "INSERT INTO chapters (chapter_number, title, content, outline, status, draft_raw) VALUES (?1, ?2, '', ?3, 'draft', '')",
            rusqlite::params![next_chapter_number, mock_title, mock_outline],
        )
        .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是网文大纲策划。请根据全书大纲和前文剧情，自动推演并生成下一章的标题和大纲。要求：\n1）严格按照 JSON 格式输出，不要有包裹字符。\n2）大纲控制在200字以内，包含【开场钩子】【冲突升级】【章末钩子】。\n3）标题要符合网文风格（如：第X章：XXXX）。";
    
    let user_prompt = format!(
        "书名：{}\n题材：{}\n一句话卖点：{}\n\n【全书分卷大纲】：\n{}\n\n【前文剧情提要（最近3章）】：\n{}\n\n请为第 {} 章生成标题和大纲。\n必须输出如下 JSON 格式：\n{{\n  \"title\": \"第{}章：xxxx\",\n  \"outline\": \"本章大纲内容...\"\n}}",
        book.title,
        book.genre,
        book.logline,
        book.full_outline, // Note: Need to add full_outline to get_book_meta_internal
        previous_context,
        next_chapter_number,
        next_chapter_number
    );

    let result_str = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    
    // Parse JSON
    let clean_json = result_str.trim().trim_start_matches("```json").trim_start_matches("```").trim_end_matches("```").trim();
    
    #[derive(Deserialize)]
    struct NextChapterData {
        title: String,
        outline: String,
    }
    
    let next_data: NextChapterData = serde_json::from_str(clean_json).map_err(|e| format!("AI 生成的 JSON 格式错误: {}", e))?;

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "INSERT INTO chapters (chapter_number, title, content, outline, status, draft_raw) VALUES (?1, ?2, '', ?3, 'draft', '')",
        rusqlite::params![next_chapter_number, next_data.title, next_data.outline],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}



#[tauri::command]
pub async fn apply_audit_suggestions(state: State<'_, DbState>, original_text: String, suggestions: Vec<String>) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    
    let suggestions_text = suggestions.join("\n- ");
    
    if config.api_key.is_empty() {
        sleep(Duration::from_secs(1)).await;
        return Ok(format!("{}\n\n[模拟一键修改已应用]：根据建议“{}”综合重写了相关段落。", original_text, suggestions_text));
    }

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是一个网文精修编辑（Reviser）。根据给定的多条专家审查建议，对原文本进行一次性综合重写。要求：仅修改建议指出的部分，保持原文本其余部分完全一致，直接输出修改后的完整文本。不要有任何多余的解释。";
    let user_prompt = format!("【专家综合建议】：\n- {}\n\n【原文本】：\n{}", suggestions_text, original_text);

    let revised_draft = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    
    Ok(revised_draft)
}

#[derive(Deserialize)]
pub struct RewriteConstraints {
    pub chapter_number: i32,
    pub draft_raw: String,
    pub must_close_hooks: Vec<i32>,
    pub must_advance_threads: Vec<String>,
    pub must_follow_one_liner: bool,
}

#[tauri::command]
pub async fn rewrite_chapter_with_constraints(state: State<'_, DbState>, req: RewriteConstraints) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.is_empty() {
        sleep(Duration::from_secs(1)).await;
        return Ok(req.draft_raw);
    }

    let previous_context = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_recent_chapters_context(&conn, req.chapter_number, 3).unwrap_or_default()
    };

    let (plan_one_liner, plan_locked) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let r: Result<(String, i32), rusqlite::Error> = conn.query_row(
            "SELECT one_liner, locked FROM chapter_outline_one_liners_current WHERE chapter_number = ?1",
            rusqlite::params![req.chapter_number],
            |row| Ok((row.get(0)?, row.get(1)?)),
        );
        match r {
            Ok((ol, lk)) => (ol, lk == 1),
            Err(_) => ("".to_string(), false),
        }
    };

    let open_hooks_text = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::refresh_hook_staleness(&conn, req.chapter_number).unwrap_or(());
        let mut stmt = conn
            .prepare(
                "SELECT id, hook_desc, created_at_chapter, staleness FROM pending_hooks
                 WHERE is_resolved = FALSE
                 ORDER BY staleness DESC, created_at_chapter ASC, id ASC
                 LIMIT 10",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, i32>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut lines: Vec<String> = Vec::new();
        for item in iter {
            let (id, desc, created, stale) = item.map_err(|e| e.to_string())?;
            lines.push(format!("- id:{} | created:{} | stale:{} | {}", id, created, stale, desc));
        }
        if lines.is_empty() { "（无）".to_string() } else { lines.join("\n") }
    };

    let checkpoint_text = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let active_vid = get_active_plan_version_id(conn).unwrap_or(0);
        let r: Result<String, rusqlite::Error> = if active_vid > 0 {
            conn.query_row(
                "SELECT checkpoint_json FROM outline_checkpoints WHERE version_id = ?1 AND end_chapter <= ?2 ORDER BY end_chapter DESC, id DESC LIMIT 1",
                rusqlite::params![active_vid, req.chapter_number - 1],
                |row| row.get(0),
            )
        } else {
            conn.query_row(
                "SELECT checkpoint_json FROM outline_checkpoints WHERE end_chapter <= ?1 ORDER BY end_chapter DESC, id DESC LIMIT 1",
                rusqlite::params![req.chapter_number - 1],
                |row| row.get(0),
            )
        };
        r.unwrap_or_else(|_| "".to_string())
    };

    let anti_ai_rules_md = config.anti_ai_rules_md.clone();
    let anti_ai_rules = anti_ai_rules_md.trim();
    let anti_ai_block = if anti_ai_rules.is_empty() {
        String::new()
    } else {
        format!("\n\n【全局去AI味写作规则（Markdown，必须遵守）】\n{}\n", anti_ai_rules)
    };

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = format!(
        "你是一个网文精修编辑（Constraint Rewriter）。你的任务是对给定的原始草稿进行约束式重写，使其满足规划锚点、事实基准与闭环要求。\n\
## 输出格式（严格遵守）\n\n\
=== PRE_WRITE_CHECK ===\n\
（必须输出Markdown表格）\n\
| 检查项 | 本章记录 | 证据/定位 | 结果 |\n\
|--------|----------|----------|------|\n\
| 规划锚定 | one_liner:... | one_liner:... | PASS/WARN/FAIL |\n\
| Checkpoint 一致性 | ... | violated:...（仅在冲突时） | PASS/WARN/FAIL |\n\
| 线程推进 | ... | thread:THREAD_KEY | PASS/WARN/FAIL |\n\
| 伏笔闭环 | ... | hook_id:ID | PASS/WARN/FAIL |\n\
| 命名一致性 | ... | - | PASS/WARN/FAIL |\n\
| 风险扫描 | ... | - | PASS/WARN/FAIL |\n\n\
=== CHAPTER_TITLE ===\n\
(章节标题，不含\"第X章\")\n\n\
=== CHAPTER_CONTENT ===\n\
(正文内容)\n\n\
【重要】只输出以上三个区块。\n\
{}",
        anti_ai_block
    );

    let user_prompt = format!(
        "【规划锚点（one-liner）】\n{}\n【锁定】{}\n{}\n\n\
【Checkpoint 事实基准（如有）】\n{}\n\n\
【前文剧情回顾（最近3章）】\n{}\n\n\
【待回收伏笔列表】\n{}\n\n\
【本次重写必须达成目标】\n\
- must_follow_one_liner: {}\n\
- must_close_hooks: {:?}\n\
- must_advance_threads: {:?}\n\n\
【原始草稿（需重写）】\n{}",
        if plan_one_liner.trim().is_empty() { "（无）" } else { plan_one_liner.trim() },
        if plan_locked { "true" } else { "false" },
        if plan_locked { "不得偏离主事件与结果，只能补充执行细节与场景。" } else { "" },
        if checkpoint_text.trim().is_empty() { "（无）" } else { checkpoint_text.trim() },
        previous_context,
        open_hooks_text,
        if req.must_follow_one_liner { "true" } else { "false" },
        req.must_close_hooks,
        req.must_advance_threads,
        req.draft_raw
    );

    llm.chat_completion(&system_prompt, &user_prompt).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rewrite_based_on_readers(state: State<'_, DbState>, original_text: String, comments: Vec<String>) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    
    let comments_text = comments.join("\n- ");

    if config.api_key.is_empty() {
        sleep(Duration::from_secs(1)).await;
        return Ok(format!("{}\n\n[模拟读者反馈修改]：已根据读者综合吐槽“{}”优化了正文。", original_text, comments_text));
    }

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let system_prompt = "你是一个网文精修编辑。你的任务是根据给定的“多条读者吐槽/本章说”，综合修改并优化原正文文本。要求：
1. 综合分析读者的毒点或爽点诉求（例如逻辑不通、反派降智、主角憋屈等）。
2. 在原文本的基础上进行一次性综合重写，消除读者的不满，提升阅读体验。
3. 保持未受影响的其余文本原样不变。
4. 严格只输出修改后的纯小说正文，不加任何解释、说明或前后缀标签。";
    let user_prompt = format!("【读者综合吐槽】：\n- {}\n\n【原文本】：\n{}", comments_text, original_text);

    let revised_draft = llm.chat_completion(system_prompt, &user_prompt).await.map_err(|e| e.to_string())?;
    
    Ok(revised_draft)
}

#[tauri::command]
pub async fn apply_full_review_fix(
    state: State<'_, DbState>,
    chapter_number: i32,
    original_text: String,
    expert_issues: Vec<String>,
    reader_comments: Vec<String>,
) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;

    let previous_context = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_recent_chapters_context(&conn, chapter_number, 3).unwrap_or_default()
    };

    let valence_bias = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_valence_bias(&conn, chapter_number).unwrap_or(0)
    };

    let (chapter_title, chapter_outline) = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT title, outline FROM chapters WHERE chapter_number = ?1",
            rusqlite::params![chapter_number],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .unwrap_or_else(|_| ("".to_string(), "".to_string()))
    };

    let emotion_context = if valence_bias >= 2 {
        "前文已经连续两章让主角处于顺境和爽点。读者现在期待看到新的挑战或转折。"
    } else if valence_bias <= -2 {
        "前文已经连续两章压抑主角。读者现在极度渴望看到爆发和爽点释放。"
    } else {
        ""
    };

    let open_hooks_text = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::refresh_hook_staleness(&conn, chapter_number).unwrap_or(());
        let mut stmt = conn
            .prepare("SELECT id, hook_desc, created_at_chapter, staleness FROM pending_hooks WHERE is_resolved = FALSE ORDER BY created_at_chapter ASC, id ASC")
            .map_err(|e| e.to_string())?;

        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i32>(2)?,
                    row.get::<_, i32>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut lines: Vec<String> = Vec::new();
        for item in iter {
            let (id, desc, created, stale) = item.map_err(|e| e.to_string())?;
            lines.push(format!("- id:{} | created:{} | stale:{} | {}", id, created, stale, desc));
        }

        if lines.is_empty() {
            "（当前没有未回收伏笔）".to_string()
        } else {
            lines.join("\n")
        }
    };

    let rag_context = {
        let rag = RagEngine::new(&config);
        let chapter_outline_for_rag = if chapter_title.is_empty() && chapter_outline.is_empty() {
            "本章大纲：".to_string()
        } else {
            format!("本章大纲：{}。{}", chapter_title, chapter_outline)
        };
        rag.build_context_for_chapter(&state.book_conn, chapter_number, &chapter_outline_for_rag)
            .await
            .map_err(|e| e.to_string())?
    };

    let expert_text = expert_issues.join("\n- ");
    let reader_text = reader_comments.join("\n- ");

    if config.api_key.is_empty() {
        sleep(Duration::from_secs(1)).await;
        return Ok(format!(
            "{}\n\n[模拟综合修复]：已综合处理专家问题与读者吐槽。\n专家问题：\n- {}\n读者吐槽：\n- {}",
            original_text, expert_text, reader_text
        ));
    }

    let anti_ai_rules_md = config.anti_ai_rules_md.clone();
    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let anti_ai_rules = anti_ai_rules_md.trim();
    let anti_ai_block = if anti_ai_rules.is_empty() {
        String::new()
    } else {
        format!("\n\n【全局去AI味写作规则（Markdown，必须遵守）】\n{}\n", anti_ai_rules)
    };
    let system_prompt = format!("你是一个网文精修编辑。你的目标是：修复后再次进行“结构化评审”时尽量全通过。\n你将得到：\n- 【RAG高优先级设定约束】（必须遵守，任何违反都视为失败）\n- 【未回收伏笔列表】（必须避免自相矛盾；若本章已触及回收点则要补足解释/兑现）\n- 【前文剧情回顾】与【情绪提示】\n- 【专家指出的问题清单】与【读者吐槽清单】\n- 【原正文】\n要求：\n1）优先修硬伤：衔接、逻辑、战力、人设、视角、设定约束。\n2）再修节奏与爽点：让读者情绪曲线连续。\n3）保持主线事件顺序，不要发散新增大段剧情。\n4）允许对局部段落进行更彻底的改写以彻底消除问题，不必拘泥“最小改动”。\n5）只输出修改后的最终正文，不输出解释、清单、标记。{}",
        anti_ai_block
    );
    let user_prompt = format!(
        "【RAG高优先级设定约束】\n{}\n\n【未回收伏笔列表】\n{}\n\n【前文剧情回顾（最近3章）】\n{}\n\n【情绪提示】\n{}\n\n【专家指出的问题清单】\n- {}\n\n【读者吐槽清单】\n- {}\n\n【原正文】\n{}",
        rag_context,
        open_hooks_text,
        previous_context,
        emotion_context,
        expert_text,
        reader_text,
        original_text
    );

    let revised_draft = llm
        .chat_completion(&system_prompt, &user_prompt)
        .await
        .map_err(|e| e.to_string())?;

    let _ = extract_and_persist_memory(&state, chapter_number, &revised_draft).await;

    Ok(revised_draft)
}

#[tauri::command]
pub async fn generate_character_profile(state: State<'_, DbState>, prompt: String) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.is_empty() {
        sleep(Duration::from_secs(1)).await;
        return Ok(format!("（模拟数据）角色设定：\n核心信念：宁折不弯\n口头禅：剑在人在\n不可知信息：他不知道师傅其实是内鬼"));
    }

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let sys = "你是一个网文设定专家。请根据用户的简单描述，生成一个完整的人物口吻与行为圣经。包含：【核心信念】、【口头禅】、【禁忌与底线】。请精简输出。";
    let usr = format!("请为这个角色生成设定：{}", prompt);
    let result = llm.chat_completion(sys, &usr).await.map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
pub async fn simulate_reader_reactions(state: State<'_, DbState>, chapter_text: String, chapter_number: i32) -> Result<Vec<ReaderReaction>, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    
    let previous_context = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_recent_chapters_context(&conn, chapter_number, 3).unwrap_or_default()
    };
    
    // 获取情绪偏置，以便读者能感知前文是否压抑
    let valence_bias = {
        let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
        crate::db::get_valence_bias(&conn, chapter_number).unwrap_or(0)
    };
    
    let emotion_context = if valence_bias >= 2 {
        "【提示】：前文已经连续两章让主角处于顺境和爽点。读者现在期待看到新的挑战或转折。"
    } else if valence_bias <= -2 {
        "【提示】：前文已经连续两章压抑主角。读者现在极度渴望看到爆发和爽点释放。"
    } else {
        ""
    };

    if config.api_key.is_empty() {
        sleep(Duration::from_millis(800)).await;
        return Ok(vec![
            ReaderReaction { reader_type: "逻辑党".to_string(), comment: "黑衣人降智了吧？为啥要废话？".to_string(), timestamp: "00:12".to_string() },
            ReaderReaction { reader_type: "无脑爽文受众".to_string(), comment: "断剑也能反杀，太爽了！".to_string(), timestamp: "00:45".to_string() },
        ]);
    }

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let prompt = "你是一个网文读者群体模拟器。请结合【前文剧情回顾】阅读当前章节，并生成3条典型的读者本章说（弹幕）。包含逻辑考究党、无脑爽文受众等不同视角。注意：判断爽点或毒点时，必须考虑前文的铺垫是否到位，不要孤立看当前章。只返回 JSON 数组格式，不要包含 Markdown 标记：[{\"reader_type\": \"...\", \"comment\": \"...\", \"timestamp\": \"...\"}]";
    
    let user_prompt = format!("{}\n\n【前文剧情回顾】\n{}\n\n【当前章节文本】\n{}", emotion_context, previous_context, chapter_text);
    
    let resp = llm.chat_completion(prompt, &user_prompt).await.unwrap_or_else(|_| "[]".to_string());
    
    // Clean up possible markdown json block
    let resp = resp.trim().trim_start_matches("```json").trim_end_matches("```").trim();
    
    let reactions: Vec<ReaderReaction> = serde_json::from_str(resp).unwrap_or_else(|_| {
        vec![ReaderReaction { reader_type: "系统".to_string(), comment: "模拟读者生成失败".to_string(), timestamp: "00:00".to_string() }]
    });

    Ok(reactions)
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BlueprintVersion {
    pub id: i32,
    pub status: String,
    pub stage_size: i32,
    pub first_generate_chapters: i32,
    pub book_input_json: String,
    pub cast_json: String,
    pub system_json: String,
    pub meta_json: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct CastCore {
    #[serde(default)]
    name: String,
    #[serde(default)]
    role_type: String,
    #[serde(default = "default_json_object")]
    soul_core: serde_json::Value,
}

fn default_json_object() -> serde_json::Value {
    serde_json::json!({})
}

#[derive(Deserialize)]
struct CastResult {
    cast: Vec<CastCore>,
}

#[derive(Serialize, Deserialize, Clone)]
struct SystemSpec {
    #[serde(default, deserialize_with = "de_has_system")]
    has_system: String,
    #[serde(default)]
    system_name: Option<String>,
    #[serde(default)]
    core_rule: Option<String>,
    #[serde(default)]
    boundaries: Vec<String>,
    #[serde(default)]
    costs: Vec<String>,
    #[serde(default)]
    activation_conditions: Vec<String>,
    #[serde(default)]
    upgrade_path: Vec<String>,
    #[serde(default)]
    failure_modes: Vec<String>,
}

fn de_has_system<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v = serde_json::Value::deserialize(deserializer)?;
    match v {
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Bool(b) => Ok(if b { "true".to_string() } else { "false".to_string() }),
        serde_json::Value::Number(n) => Ok(if n.as_i64().unwrap_or(0) != 0 { "true".to_string() } else { "false".to_string() }),
        serde_json::Value::Null => Ok("false".to_string()),
        other => Ok(other.to_string()),
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct StagePlanRow {
    #[serde(default)]
    stage_id: i32,
    #[serde(default)]
    range: StageRange,
    #[serde(default)]
    stage_goal: String,
    #[serde(default)]
    main_conflict: String,
    #[serde(default)]
    turning_point: String,
    #[serde(default)]
    climax: String,
    #[serde(default)]
    settlement: String,
    #[serde(default)]
    threads: Vec<serde_json::Value>,
    #[serde(default)]
    cast_focus: Vec<String>,
    #[serde(default)]
    system_usage: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct StageRange {
    #[serde(default)]
    start: i32,
    #[serde(default)]
    end: i32,
}

impl Default for StageRange {
    fn default() -> Self {
        StageRange { start: 1, end: 1 }
    }
}

#[derive(Deserialize)]
struct StagePlanResult {
    stages: Vec<StagePlanRow>,
}

#[derive(Serialize, Deserialize, Clone)]
struct OneLinerRow {
    #[serde(default)]
    chapter_number: i32,
    #[serde(default)]
    one_liner: String,
    #[serde(default)]
    cast_refs: Vec<String>,
    #[serde(default)]
    thread_refs: Vec<String>,
    #[serde(default)]
    tags: Vec<String>,
}

#[derive(Deserialize)]
struct OneLinerBatchResult {
    rows: Vec<OneLinerRow>,
}

#[derive(Serialize, Deserialize, Clone)]
struct ValidationIssue {
    #[serde(default)]
    severity: String,
    #[serde(default)]
    code: String,
    #[serde(default)]
    chapter_number: i32,
    #[serde(default)]
    message: String,
    #[serde(default)]
    suggested_fix: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ValidationResult {
    #[serde(default)]
    pass: bool,
    #[serde(default)]
    issues: Vec<ValidationIssue>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Checkpoint {
    #[serde(default)]
    range: StageRange,
    #[serde(default)]
    mainline_progress: String,
    #[serde(default)]
    active_threads: Vec<serde_json::Value>,
    #[serde(default)]
    character_state_summary: Vec<serde_json::Value>,
    #[serde(default)]
    temporal_state_summary: Vec<String>,
    #[serde(default)]
    revealed_info: Vec<String>,
    #[serde(default)]
    open_questions: Vec<String>,
    #[serde(default)]
    tone_and_pacing: String,
}

fn blueprint_system_prompt_base() -> &'static str {
    "你是“超长篇小说策划生成器与校验器”，服务于 5000 章规模的连载小说工程。\n\n硬性要求：\n1) 只输出严格 JSON，不要 Markdown，不要解释。\n2) one_liner 必须是事件推进句，20~60 字，不要氛围句。\n3) 人名/专名必须稳定一致，禁止同音不同字。\n4) 信息不足输出空数组或 null，不得编造。\n5) 若启用系统/金手指，关键使用必须满足条件并体现代价；做不到则不写该事件。\n6) 后续生成以 checkpoint 为事实基准，禁止推翻已确认事实。"
}

fn get_active_plan_version_id(conn: &rusqlite::Connection) -> Option<i32> {
    crate::db::get_active_plan_version_id_internal(conn)
}

fn parse_json_strict<T: for<'de> Deserialize<'de>>(raw: &str) -> Result<T, String> {
    let clean = clean_ai_json(raw);
    serde_json::from_str::<T>(clean).map_err(|e| format!("JSON 解析失败: {}", e))
}

fn value_to_vec<T: serde::de::DeserializeOwned>(v: serde_json::Value) -> Result<Vec<T>, String> {
    match v {
        serde_json::Value::Array(arr) => serde_json::from_value(serde_json::Value::Array(arr))
            .map_err(|e| format!("JSON 解析失败: {}", e)),
        serde_json::Value::Object(map) => {
            if map.contains_key("chapter_number") || map.contains_key("one_liner") {
                let one: T = serde_json::from_value(serde_json::Value::Object(map))
                    .map_err(|e| format!("JSON 解析失败: {}", e))?;
                Ok(vec![one])
            } else {
                let mut values = Vec::new();
                for (_k, vv) in map.into_iter() {
                    values.push(vv);
                }
                serde_json::from_value(serde_json::Value::Array(values))
                    .map_err(|e| format!("JSON 解析失败: {}", e))
            }
        }
        serde_json::Value::Null => Ok(vec![]),
        other => serde_json::from_value(other).map(|one: T| vec![one]).map_err(|e| format!("JSON 解析失败: {}", e)),
    }
}

fn parse_one_liner_rows_loose(raw: &str) -> Result<Vec<OneLinerRow>, String> {
    let v: serde_json::Value = serde_json::from_str(clean_ai_json(raw)).map_err(|e| format!("JSON 解析失败: {}", e))?;
    if let Some(rows_v) = v.get("rows").cloned() {
        return value_to_vec::<OneLinerRow>(rows_v);
    }
    value_to_vec::<OneLinerRow>(v)
}

fn parse_validation_result_loose(raw: &str) -> Result<ValidationResult, String> {
    let v: serde_json::Value = serde_json::from_str(clean_ai_json(raw)).map_err(|e| format!("JSON 解析失败: {}", e))?;
    let issues_v = v.get("issues").cloned().unwrap_or(serde_json::json!([]));
    let issues = value_to_vec::<ValidationIssue>(issues_v).unwrap_or_default();
    let pass = v
        .get("pass")
        .and_then(|x| x.as_bool())
        .unwrap_or_else(|| issues.is_empty());
    Ok(ValidationResult { pass, issues })
}

fn parse_rows_fixed_loose(raw: &str) -> Result<Option<Vec<OneLinerRow>>, String> {
    let v: serde_json::Value = serde_json::from_str(clean_ai_json(raw)).map_err(|e| format!("JSON 解析失败: {}", e))?;
    if let Some(rows_v) = v.get("rows_fixed").cloned() {
        let rows = value_to_vec::<OneLinerRow>(rows_v)?;
        return Ok(Some(rows));
    }
    if let Some(rows_v) = v.get("rows").cloned() {
        let rows = value_to_vec::<OneLinerRow>(rows_v)?;
        return Ok(Some(rows));
    }
    Ok(None)
}

fn default_system_spec() -> SystemSpec {
    SystemSpec {
        has_system: "false".to_string(),
        system_name: None,
        core_rule: None,
        boundaries: vec![],
        costs: vec![],
        activation_conditions: vec![],
        upgrade_path: vec![],
        failure_modes: vec![],
    }
}

fn clamp_first_generate(n: i32) -> i32 {
    n.max(1).min(5000)
}

#[tauri::command]
pub fn blueprint_create_version(
    state: State<DbState>,
    stage_size: Option<i32>,
    first_generate_chapters: Option<i32>,
    book_input_json: String,
) -> Result<i32, String> {
    let stage_size = stage_size.unwrap_or(100).max(50).min(200);
    let first_generate_chapters = clamp_first_generate(first_generate_chapters.unwrap_or(400));
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "INSERT INTO book_plan_versions (status, stage_size, first_generate_chapters, book_input_json) VALUES ('draft', ?1, ?2, ?3)",
        rusqlite::params![stage_size, first_generate_chapters, book_input_json],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid() as i32)
}

#[tauri::command]
pub fn blueprint_get_latest_version(state: State<DbState>) -> Result<Option<BlueprintVersion>, String> {
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, status, stage_size, first_generate_chapters, book_input_json, cast_json, system_json, meta_json, created_at
             FROM book_plan_versions
             ORDER BY id DESC
             LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        Ok(Some(BlueprintVersion {
            id: row.get(0).unwrap_or(0),
            status: row.get(1).unwrap_or_else(|_| "draft".to_string()),
            stage_size: row.get(2).unwrap_or(100),
            first_generate_chapters: row.get(3).unwrap_or(400),
            book_input_json: row.get(4).unwrap_or_else(|_| "{}".to_string()),
            cast_json: row.get(5).unwrap_or_else(|_| "[]".to_string()),
            system_json: row.get(6).unwrap_or_else(|_| "{}".to_string()),
            meta_json: row.get(7).unwrap_or_else(|_| "{}".to_string()),
            created_at: row.get(8).unwrap_or_else(|_| "".to_string()),
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub async fn blueprint_generate_cast(
    state: State<'_, DbState>,
    version_id: i32,
) -> Result<i32, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法生成蓝图人物".to_string());
    }

    let (book_input_json, system_json) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT book_input_json, system_json FROM book_plan_versions WHERE id = ?1",
            [version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| e.to_string())?
    };

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let user_prompt = format!(
        "任务：基于输入生成人物清单（10~30人，按重要性分层），并为每人生成 SOUL core（S/O/U/L + 外显 tells）。\n要求：主角必须存在且唯一；反派至少1个。\n字段要求：每个 cast 必须包含 name、role_type、soul_core。\nrole_type 建议枚举：protagonist | antagonist | ally | mentor | rival | love_interest | supporting。\n输出 JSON：{{\"cast\":[{{\"name\":\"\",\"role_type\":\"\",\"soul_core\":{{}}}}]}}。\n\n输入 JSON：\n{}",
        book_input_json
    );
    let resp = llm
        .chat_completion(blueprint_system_prompt_base(), &user_prompt)
        .await
        .map_err(|e| e.to_string())?;
    let parsed: CastResult = parse_json_strict(&resp)?;
    let cast: Vec<CastCore> = parsed
        .cast
        .into_iter()
        .filter(|c| !c.name.trim().is_empty())
        .collect();
    let cast_json = serde_json::to_string(&cast).unwrap_or("[]".to_string());

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "UPDATE book_plan_versions SET cast_json = ?1 WHERE id = ?2",
        rusqlite::params![cast_json, version_id],
    )
    .map_err(|e| e.to_string())?;

    let mut inserted: i32 = 0;
    for c in cast {
        if c.name.trim().is_empty() {
            continue;
        }
        let role = c.role_type.trim();
        let soul = c.soul_core;
        let soul_json = serde_json::to_string(&soul).unwrap_or("{}".to_string());
        let affected = conn
            .execute(
                "INSERT OR IGNORE INTO characters_core (name, role_type, soul_core_json) VALUES (?1, ?2, ?3)",
                rusqlite::params![c.name.trim(), role, soul_json],
            )
            .unwrap_or(0);
        inserted += affected as i32;
    }

    let _ = system_json;

    Ok(inserted)
}

#[tauri::command]
pub async fn blueprint_generate_system_spec(
    state: State<'_, DbState>,
    version_id: i32,
) -> Result<String, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法生成系统设定".to_string());
    }
    let (book_input_json, cast_json) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT book_input_json, cast_json FROM book_plan_versions WHERE id = ?1",
            [version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|e| e.to_string())?
    };

    let cast_names: Vec<serde_json::Value> = serde_json::from_str::<Vec<serde_json::Value>>(&cast_json).unwrap_or_default();
    let cast_names = cast_names
        .into_iter()
        .filter_map(|v| {
            let name = v.get("name").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let role_type = v.get("role_type").and_then(|x| x.as_str()).unwrap_or("").to_string();
            if name.trim().is_empty() {
                None
            } else {
                Some(serde_json::json!({"name": name, "role_type": role_type}))
            }
        })
        .collect::<Vec<_>>();

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let user_prompt = format!(
        "任务：判断故事是否需要“系统/金手指”，输出 has_system=true/false/optional。\noptional 必须给出“启用/不启用”的差异（写入 boundaries/costs/failure_modes 的条目里，简短）。\nhas_system=false 时其余字段为 null 或空数组。只输出 JSON（SystemSpec）。\n\n输入 JSON：\n{}",
        serde_json::to_string(&serde_json::json!({"book": serde_json::from_str::<serde_json::Value>(&book_input_json).unwrap_or(serde_json::json!({})), "cast_names": cast_names})).unwrap_or("{}".to_string())
    );
    let resp = llm
        .chat_completion(blueprint_system_prompt_base(), &user_prompt)
        .await
        .map_err(|e| e.to_string())?;
    let mut parsed: SystemSpec = parse_json_strict(&resp)?;
    let hs = parsed.has_system.trim().to_lowercase();
    let normalized = match hs.as_str() {
        "true" | "false" | "optional" => hs,
        "yes" | "y" | "1" => "true".to_string(),
        "no" | "n" | "0" => "false".to_string(),
        _ => {
            if hs.contains("optional") {
                "optional".to_string()
            } else if hs.contains("true") {
                "true".to_string()
            } else if hs.contains("false") {
                "false".to_string()
            } else {
                "optional".to_string()
            }
        }
    };
    parsed.has_system = normalized;
    if parsed.has_system.trim().is_empty() {
        parsed = default_system_spec();
    }
    let system_json = serde_json::to_string(&parsed).unwrap_or("{}".to_string());
    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "UPDATE book_plan_versions SET system_json = ?1 WHERE id = ?2",
        rusqlite::params![system_json, version_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(parsed.has_system)
}

#[tauri::command]
pub async fn blueprint_generate_stage_plan(
    state: State<'_, DbState>,
    version_id: i32,
) -> Result<i32, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法生成阶段规划".to_string());
    }

    let (book_input_json, cast_json, system_json, stage_size) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT book_input_json, cast_json, system_json, stage_size FROM book_plan_versions WHERE id = ?1",
            [version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, i32>(3)?)),
        )
        .map_err(|e| e.to_string())?
    };

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let user_prompt = format!(
        "任务：为全书生成阶段规划。默认每 {stage_size} 章一段（从 1 到 target_chapters）。\n要求：每个 stage 必须包含 stage_id、range.start、range.end、stage_goal、main_conflict、turning_point、climax、settlement、threads、cast_focus、system_usage。\nthreads 必须是数组，每个 thread 必须包含：thread_key、type、title、goal、stakes。\n- thread_key：短且唯一（如 MAIN_01 / SUB_MYSTERY_01 / ROMANCE_XIE_01）\n- type：main|sub|growth|mystery|character\n- title：人类可读的短标题（<= 18 字）\n- goal：这条线想达成什么（<= 40 字）\n- stakes：失败代价/风险（<= 40 字）\ncast_focus 必须来自 cast.name。\n只输出严格 JSON：{{\"stages\":[{{\"stage_id\":1,\"range\":{{\"start\":1,\"end\":{stage_size}}},\"stage_goal\":\"\",\"main_conflict\":\"\",\"turning_point\":\"\",\"climax\":\"\",\"settlement\":\"\",\"threads\":[{{\"thread_key\":\"MAIN_01\",\"type\":\"main\",\"title\":\"…\",\"goal\":\"…\",\"stakes\":\"…\"}}],\"cast_focus\":[],\"system_usage\":\"\"}}]}}。\n\n输入 JSON：\n{}",
        serde_json::to_string(&serde_json::json!({
            "book": serde_json::from_str::<serde_json::Value>(&book_input_json).unwrap_or(serde_json::json!({})),
            "cast": serde_json::from_str::<serde_json::Value>(&cast_json).unwrap_or(serde_json::json!([])),
            "system": serde_json::from_str::<serde_json::Value>(&system_json).unwrap_or(serde_json::json!({})),
            "stage_size": stage_size
        }))
        .unwrap_or("{}".to_string())
    );
    let resp = llm
        .chat_completion(blueprint_system_prompt_base(), &user_prompt)
        .await
        .map_err(|e| e.to_string())?;
    let parsed: StagePlanResult = parse_json_strict(&resp)?;

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute("DELETE FROM stage_plan WHERE version_id = ?1", [version_id])
        .map_err(|e| e.to_string())?;

    let mut inserted: i32 = 0;
    for (idx, mut s) in parsed.stages.into_iter().enumerate() {
        let sid = if s.stage_id > 0 { s.stage_id } else { (idx as i32) + 1 };
        s.stage_id = sid;
        let start = s.range.start;
        let end = s.range.end;
        if start <= 0 || end < start {
            let computed_start = (sid - 1).max(0) * stage_size + 1;
            let computed_end = (sid.max(1)) * stage_size;
            s.range.start = computed_start;
            s.range.end = computed_end.max(computed_start);
        }
        let threads_json = serde_json::to_string(&s.threads).unwrap_or("[]".to_string());
        let cast_focus_json = serde_json::to_string(&s.cast_focus).unwrap_or("[]".to_string());
        let system_usage = s.system_usage.unwrap_or_default();
        let affected = conn
            .execute(
                "INSERT OR REPLACE INTO stage_plan (version_id, stage_id, start_chapter, end_chapter, stage_goal, main_conflict, turning_point, climax, settlement, threads_json, cast_focus_json, system_usage)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                rusqlite::params![
                    version_id,
                    s.stage_id,
                    s.range.start,
                    s.range.end,
                    s.stage_goal,
                    s.main_conflict,
                    s.turning_point,
                    s.climax,
                    s.settlement,
                    threads_json,
                    cast_focus_json,
                    system_usage
                ],
            )
            .unwrap_or(0);
        inserted += affected as i32;
    }

    Ok(inserted)
}

fn pick_stage_rows_json(conn: &rusqlite::Connection, version_id: i32, start: i32, end: i32) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = Vec::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT stage_id, start_chapter, end_chapter, stage_goal, main_conflict, turning_point, climax, settlement, threads_json, cast_focus_json, system_usage
         FROM stage_plan
         WHERE version_id = ?1 AND end_chapter >= ?2 AND start_chapter <= ?3
         ORDER BY stage_id ASC",
    ) {
        if let Ok(iter) = stmt.query_map(rusqlite::params![version_id, start, end], |row| {
            let stage_id: i32 = row.get(0)?;
            let s: i32 = row.get(1)?;
            let e: i32 = row.get(2)?;
            let stage_goal: String = row.get(3)?;
            let main_conflict: String = row.get(4)?;
            let turning_point: String = row.get(5)?;
            let climax: String = row.get(6)?;
            let settlement: String = row.get(7)?;
            let threads_json: String = row.get(8)?;
            let cast_focus_json: String = row.get(9)?;
            let system_usage: String = row.get(10)?;
            let threads: serde_json::Value = serde_json::from_str(&threads_json).unwrap_or(serde_json::json!([]));
            let cast_focus: serde_json::Value = serde_json::from_str(&cast_focus_json).unwrap_or(serde_json::json!([]));
            Ok(serde_json::json!({
                "stage_id": stage_id,
                "range": {"start": s, "end": e},
                "stage_goal": stage_goal,
                "main_conflict": main_conflict,
                "turning_point": turning_point,
                "climax": climax,
                "settlement": settlement,
                "threads": threads,
                "cast_focus": cast_focus,
                "system_usage": if system_usage.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(system_usage) }
            }))
        }) {
            for item in iter.flatten() {
                out.push(item);
            }
        }
    }
    out
}

fn get_checkpoint_before_range(conn: &rusqlite::Connection, version_id: i32, start: i32) -> Option<serde_json::Value> {
    conn.query_row(
        "SELECT checkpoint_json FROM outline_checkpoints WHERE version_id = ?1 AND end_chapter < ?2 ORDER BY end_chapter DESC, id DESC LIMIT 1",
        rusqlite::params![version_id, start],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
}

fn get_locked_map(conn: &rusqlite::Connection, start: i32, end: i32) -> std::collections::HashMap<i32, (String, String, String, String, i32)> {
    let mut m = std::collections::HashMap::new();
    if let Ok(mut stmt) = conn.prepare(
        "SELECT chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked
         FROM chapter_outline_one_liners_current
         WHERE chapter_number >= ?1 AND chapter_number <= ?2",
    ) {
        if let Ok(iter) = stmt.query_map(rusqlite::params![start, end], |row| {
            Ok((
                row.get::<_, i32>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i32>(5)?,
            ))
        }) {
            for item in iter.flatten() {
                if item.5 == 1 {
                    m.insert(item.0, (item.1, item.2, item.3, item.4, item.5));
                }
            }
        }
    }
    m
}

#[tauri::command]
pub async fn blueprint_generate_one_liner_batch(
    state: State<'_, DbState>,
    version_id: i32,
    start_chapter: i32,
    end_chapter: i32,
    regen: Option<bool>,
) -> Result<i32, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法生成大纲".to_string());
    }

    let (book_input_json, cast_json, system_json) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        conn.query_row(
            "SELECT book_input_json, cast_json, system_json FROM book_plan_versions WHERE id = ?1",
            [version_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?)),
        )
        .map_err(|e| e.to_string())?
    };

    let start = start_chapter.max(1);
    let end = end_chapter.max(start);
    let regen = regen.unwrap_or(false);

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);

    let (stages_relevant, checkpoint_value, locked_map) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let stages = pick_stage_rows_json(conn, version_id, start, end);
        let checkpoint = get_checkpoint_before_range(conn, version_id, start);
        let locked = if regen { get_locked_map(conn, start, end) } else { std::collections::HashMap::new() };
        (stages, checkpoint, locked)
    };

    let cast_value: serde_json::Value = serde_json::from_str(&cast_json).unwrap_or(serde_json::json!([]));
    let cast_summary = match cast_value.as_array() {
        Some(arr) => {
            let mut out = Vec::new();
            for v in arr.iter().take(18) {
                let name = v.get("name").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
                let role = v.get("role_type").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
                let k = v
                    .get("soul_core")
                    .and_then(|sc| sc.get("O"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if name.is_empty() {
                    continue;
                }
                out.push(serde_json::json!({"n": name, "r": role, "k": k}));
            }
            serde_json::json!({"cast_summary": out, "name_rules": {"must_use_exact": true, "aliases_forbidden": true}})
        }
        None => serde_json::json!({"cast_summary": [], "name_rules": {"must_use_exact": true, "aliases_forbidden": true}}),
    };

    let input_json = serde_json::json!({
        "range": {"start": start, "end": end},
        "book": serde_json::from_str::<serde_json::Value>(&book_input_json).unwrap_or(serde_json::json!({})),
        "stages_relevant": stages_relevant,
        "cast": cast_summary,
        "system": serde_json::from_str::<serde_json::Value>(&system_json).unwrap_or(serde_json::json!({})),
        "checkpoint": checkpoint_value
    });

    let user_prompt = format!(
        "任务：为指定章节范围生成“每章一句话(one_liner)”，不生成标题。\n硬规则：one_liner 20~60 字，必须事件推进句；cast_refs 必须来自 cast；thread_refs 0~2 个且来自 thread_key 集合；tags 0~3 个。\n一致性：若提供 checkpoint，必须延续 checkpoint 事实，禁止推翻；主角最长连续缺席不得超过 8 章，缺席必须写明原因。\n只输出 JSON：{{\"rows\":[...]}}。\n\n输入 JSON：\n{}",
        serde_json::to_string(&input_json).unwrap_or("{}".to_string())
    );

    let gen_resp = llm
        .chat_completion(blueprint_system_prompt_base(), &user_prompt)
        .await
        .map_err(|e| e.to_string())?;
    let mut rows: Vec<OneLinerRow> = parse_one_liner_rows_loose(&gen_resp)?;

    let validate_system = blueprint_system_prompt_base();
    let thread_keys: Vec<String> = stages_relevant
        .iter()
        .flat_map(|s| s.get("threads").and_then(|t| t.as_array()).cloned().unwrap_or_default())
        .filter_map(|v| v.get("thread_key").or_else(|| v.get("k")).and_then(|x| x.as_str()).map(|x| x.to_string()))
        .collect();
    let cast_names: Vec<String> = cast_summary
        .get("cast_summary")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|v| v.get("n").and_then(|x| x.as_str()).map(|x| x.to_string()))
        .collect();

    for _ in 0..2 {
        let vinput = serde_json::json!({
            "range": {"start": start, "end": end},
            "rows": rows,
            "cast_names": cast_names,
            "thread_keys": thread_keys,
            "system": serde_json::from_str::<serde_json::Value>(&system_json).unwrap_or(serde_json::json!({})),
            "checkpoint": checkpoint_value
        });
        let vprompt = format!(
            "任务：对 one-liner rows 做校验并输出 issues。\n至少检查：事件推进句/长度/相邻重复/人名合法/线程合法/主角缺席>8/系统越界（如启用）。\n只输出 JSON（ValidationResult）。\n\n输入 JSON：\n{}",
            serde_json::to_string(&vinput).unwrap_or("{}".to_string())
        );
        let vresp = llm.chat_completion(validate_system, &vprompt).await.map_err(|e| e.to_string())?;
        let vparsed: ValidationResult = parse_validation_result_loose(&vresp)?;
        if vparsed.pass || vparsed.issues.is_empty() {
            break;
        }
        let issues = vparsed.issues;
        let finput = serde_json::json!({
            "range": {"start": start, "end": end},
            "rows": rows,
            "issues": issues,
            "cast_names": cast_names,
            "thread_keys": thread_keys,
            "system": serde_json::from_str::<serde_json::Value>(&system_json).unwrap_or(serde_json::json!({})),
            "checkpoint": checkpoint_value
        });
        let fprompt = format!(
            "任务：根据校验 issues 修复 one-liner。\n规则：只修改被点名的 chapter_number；不得引入新人物名；不得推翻 checkpoint；修复后必须满足长度与事件推进句。\n只输出 JSON：{{\"rows_fixed\":[...]}}。\n\n输入 JSON：\n{}",
            serde_json::to_string(&finput).unwrap_or("{}".to_string())
        );
        let fresp = llm.chat_completion(validate_system, &fprompt).await.map_err(|e| e.to_string())?;
        if let Some(fixed_rows) = parse_rows_fixed_loose(&fresp)? {
            rows = fixed_rows;
        }
    }

    let mut map: std::collections::HashMap<i32, OneLinerRow> = std::collections::HashMap::new();
    for r in rows.into_iter() {
        map.insert(r.chapter_number, r);
    }
    let mut final_rows: Vec<OneLinerRow> = Vec::new();
    for ch in start..=end {
        if regen {
            if let Some((one_liner, tags_json, cast_refs_json, thread_refs_json, _)) = locked_map.get(&ch) {
                final_rows.push(OneLinerRow {
                    chapter_number: ch,
                    one_liner: one_liner.clone(),
                    cast_refs: serde_json::from_str::<Vec<String>>(cast_refs_json).unwrap_or_default(),
                    thread_refs: serde_json::from_str::<Vec<String>>(thread_refs_json).unwrap_or_default(),
                    tags: serde_json::from_str::<Vec<String>>(tags_json).unwrap_or_default(),
                });
                continue;
            }
        }
        if let Some(r) = map.get(&ch) {
            final_rows.push(r.clone());
        } else {
            final_rows.push(OneLinerRow {
                chapter_number: ch,
                one_liner: "".to_string(),
                cast_refs: vec![],
                thread_refs: vec![],
                tags: vec![],
            });
        }
    }

    let checkpoint_input = serde_json::json!({
        "range": {"start": start, "end": end},
        "rows": final_rows,
        "stages_relevant": stages_relevant,
        "prior_checkpoint": checkpoint_value
    });
    let checkpoint_prompt = format!(
        "任务：为已生成章节范围生成 checkpoint（记忆快照），供下一批生成使用。\n要求：必须短（<=1200字），active_threads 只保留最重要的 8 条，character_state_summary 只保留关键角色。只输出 JSON（Checkpoint）。\n\n输入 JSON：\n{}",
        serde_json::to_string(&checkpoint_input).unwrap_or("{}".to_string())
    );
    let checkpoint_resp = llm
        .chat_completion(blueprint_system_prompt_base(), &checkpoint_prompt)
        .await
        .map_err(|e| e.to_string())?;
    let checkpoint_parsed: Checkpoint = parse_json_strict(&checkpoint_resp)?;
    let checkpoint_json = serde_json::to_string(&checkpoint_parsed).unwrap_or("{}".to_string());

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;

    let batch_id: i32 = conn
        .query_row("SELECT COALESCE(MAX(id), 0) + 1 FROM outline_checkpoints", [], |row| row.get(0))
        .unwrap_or(1);

    let mut saved: i32 = 0;
    for r in final_rows.into_iter() {
        if regen {
            if locked_map.contains_key(&r.chapter_number) {
                continue;
            }
        }
        let tags_json = serde_json::to_string(&r.tags).unwrap_or("[]".to_string());
        let cast_refs_json = serde_json::to_string(&r.cast_refs).unwrap_or("[]".to_string());
        let thread_refs_json = serde_json::to_string(&r.thread_refs).unwrap_or("[]".to_string());
        let affected = conn
            .execute(
                "INSERT OR REPLACE INTO chapter_outline_one_liners_current (chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked, source_version_id, source_batch_id, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, COALESCE((SELECT locked FROM chapter_outline_one_liners_current WHERE chapter_number = ?1), 0), ?6, ?7, CURRENT_TIMESTAMP)",
                rusqlite::params![r.chapter_number, r.one_liner, tags_json, cast_refs_json, thread_refs_json, version_id, batch_id],
            )
            .unwrap_or(0);
        saved += affected as i32;

        let _ = conn.execute(
            "INSERT OR REPLACE INTO chapter_outline_one_liners_versions (version_id, chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked)
             SELECT ?1, chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json, locked
             FROM chapter_outline_one_liners_current WHERE chapter_number = ?2",
            rusqlite::params![version_id, r.chapter_number],
        );
    }

    conn.execute(
        "INSERT OR REPLACE INTO outline_checkpoints (id, version_id, start_chapter, end_chapter, checkpoint_json) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![batch_id, version_id, start, end, checkpoint_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(saved)
}

fn get_target_chapters_from_book_input(book_input_json: &str) -> i32 {
    let v = serde_json::from_str::<serde_json::Value>(book_input_json).unwrap_or(serde_json::json!({}));
    v.get("target_chapters")
        .or_else(|| v.get("targetChapters"))
        .or_else(|| v.get("N"))
        .and_then(|x| x.as_i64())
        .unwrap_or(5000) as i32
}

#[tauri::command]
pub async fn blueprint_continue_next_batch(
    state: State<'_, DbState>,
    version_id: i32,
    batch_size: Option<i32>,
) -> Result<i32, String> {
    let batch_size = batch_size.unwrap_or(100).max(20).min(200);
    let (max_end, book_input_json) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let max_end: i32 = conn
            .query_row(
                "SELECT COALESCE(MAX(end_chapter), 0) FROM outline_checkpoints WHERE version_id = ?1",
                [version_id],
                |row| row.get(0),
            )
            .unwrap_or(0);
        let book_input_json: String = conn
            .query_row(
                "SELECT book_input_json FROM book_plan_versions WHERE id = ?1",
                [version_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        (max_end, book_input_json)
    };

    let start = (max_end + 1).max(1);
    let target = get_target_chapters_from_book_input(&book_input_json).max(1);
    if start > target {
        return Ok(0);
    }
    let end = (start + batch_size - 1).min(target);
    blueprint_generate_one_liner_batch(state, version_id, start, end, Some(false)).await
}

#[tauri::command]
pub async fn recompute_outline_checkpoint(
    state: State<'_, DbState>,
    version_id: Option<i32>,
    start_chapter: i32,
    end_chapter: i32,
) -> Result<(), String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    let start = start_chapter.max(1);
    let end = end_chapter.max(start);
    let vid = version_id.unwrap_or(0);

    let (rows, stages_relevant, prior_checkpoint) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;

        let mut stmt = conn
            .prepare(
                "SELECT chapter_number, one_liner, tags_json, cast_refs_json, thread_refs_json
                 FROM chapter_outline_one_liners_current
                 WHERE chapter_number >= ?1 AND chapter_number <= ?2
                 ORDER BY chapter_number ASC",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![start, end], |row| {
                let tags_json: String = row.get(2)?;
                let cast_refs_json: String = row.get(3)?;
                let thread_refs_json: String = row.get(4)?;
                Ok(OneLinerRow {
                    chapter_number: row.get(0)?,
                    one_liner: row.get(1)?,
                    tags: serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default(),
                    cast_refs: serde_json::from_str::<Vec<String>>(&cast_refs_json).unwrap_or_default(),
                    thread_refs: serde_json::from_str::<Vec<String>>(&thread_refs_json).unwrap_or_default(),
                })
            })
            .map_err(|e| e.to_string())?;
        let mut rows: Vec<OneLinerRow> = Vec::new();
        for item in iter.flatten() {
            rows.push(item);
        }

        let stages = if vid > 0 {
            pick_stage_rows_json(conn, vid, start, end)
        } else {
            Vec::new()
        };
        let prior = if vid > 0 {
            get_checkpoint_before_range(conn, vid, start)
        } else {
            conn.query_row(
                "SELECT checkpoint_json FROM outline_checkpoints WHERE version_id = 0 AND end_chapter < ?1 ORDER BY end_chapter DESC, id DESC LIMIT 1",
                rusqlite::params![start],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        };
        (rows, stages, prior.unwrap_or(serde_json::json!({})))
    };

    let checkpoint_json = if config.api_key.trim().is_empty() {
        let mainline = rows
            .iter()
            .filter_map(|r| {
                let s = r.one_liner.trim();
                if s.is_empty() {
                    None
                } else {
                    Some(s.to_string())
                }
            })
            .take(10)
            .collect::<Vec<String>>()
            .join(" / ");
        serde_json::to_string(&serde_json::json!({
            "range": {"start": start, "end": end},
            "mainline_progress": mainline,
            "active_threads": [],
            "character_state_summary": [],
            "temporal_state_summary": [],
            "revealed_info": [],
            "open_questions": [],
            "tone_and_pacing": ""
        }))
        .unwrap_or("{}".to_string())
    } else {
        let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
        let checkpoint_input = serde_json::json!({
            "range": {"start": start, "end": end},
            "rows": rows,
            "stages_relevant": stages_relevant,
            "prior_checkpoint": prior_checkpoint
        });
        let checkpoint_prompt = format!(
            "任务：为已存在的章节范围生成 checkpoint（记忆快照），供写章与后续批次生成使用。\n要求：必须短（<=1200字），active_threads 只保留最重要的 8 条，character_state_summary 只保留关键角色。只输出 JSON（Checkpoint）。\n\n输入 JSON：\n{}",
            serde_json::to_string(&checkpoint_input).unwrap_or("{}".to_string())
        );
        let checkpoint_resp = llm
            .chat_completion(blueprint_system_prompt_base(), &checkpoint_prompt)
            .await
            .map_err(|e| e.to_string())?;
        let checkpoint_parsed: Checkpoint = parse_json_strict(&checkpoint_resp)?;
        serde_json::to_string(&checkpoint_parsed).unwrap_or("{}".to_string())
    };

    let lock = state.book_conn.lock().unwrap();
    let conn = lock.as_ref().ok_or("No book loaded")?;
    conn.execute(
        "INSERT OR REPLACE INTO outline_checkpoints (version_id, start_chapter, end_chapter, checkpoint_json) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![vid, start, end, checkpoint_json],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn blueprint_seed_threads_from_stage_plan(state: State<DbState>, version_id: i32) -> Result<i32, String> {
    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;
    let mut stmt = conn
        .prepare("SELECT threads_json FROM stage_plan WHERE version_id = ?1")
        .map_err(|e| e.to_string())?;
    let iter = stmt
        .query_map([version_id], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut inserted: i32 = 0;
    for s in iter.flatten() {
        let v = serde_json::from_str::<serde_json::Value>(&s).unwrap_or(serde_json::json!([]));
        if let Some(arr) = v.as_array() {
            for t in arr {
                let key = t
                    .get("thread_key")
                    .or_else(|| t.get("k"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if key.is_empty() {
                    continue;
                }
                let ttype = t
                    .get("type")
                    .or_else(|| t.get("t"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("sub")
                    .trim()
                    .to_string();
                let goal = t
                    .get("goal")
                    .or_else(|| t.get("g"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let stakes = t
                    .get("stakes")
                    .or_else(|| t.get("s"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let title = t
                    .get("title")
                    .or_else(|| t.get("name"))
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let title = if !title.is_empty() {
                    title
                } else if !goal.is_empty() {
                    goal.clone()
                } else {
                    key.clone()
                };
                let affected = conn
                    .execute(
                        "INSERT INTO story_threads (thread_key, type, title, goal, stakes)
                         VALUES (?1, ?2, ?3, ?4, ?5)
                         ON CONFLICT(thread_key) DO UPDATE SET
                           type = excluded.type,
                           title = CASE
                             WHEN story_threads.title = story_threads.thread_key OR story_threads.title = '' THEN excluded.title
                             ELSE story_threads.title
                           END,
                           goal = CASE
                             WHEN story_threads.goal = '' OR story_threads.goal = story_threads.thread_key THEN excluded.goal
                             ELSE story_threads.goal
                           END,
                           stakes = CASE
                             WHEN story_threads.stakes = '' THEN excluded.stakes
                             ELSE story_threads.stakes
                           END,
                           updated_at = CURRENT_TIMESTAMP",
                        rusqlite::params![key, ttype, title, goal, stakes],
                    )
                    .unwrap_or(0);
                inserted += affected as i32;
            }
        }
    }
    Ok(inserted)
}

#[derive(Deserialize)]
struct SoulTimelineGenResult {
    timeline_updates: Vec<serde_json::Value>,
}

#[tauri::command]
pub async fn blueprint_generate_soul_timeline_for_range(
    state: State<'_, DbState>,
    version_id: i32,
    start_chapter: i32,
    end_chapter: i32,
) -> Result<i32, String> {
    let config = crate::db::get_config_internal(&state).map_err(|e| e.to_string())?;
    if config.api_key.trim().is_empty() {
        return Err("API Key 未配置，无法生成 SOUL timeline".to_string());
    }
    let start = start_chapter.max(1);
    let end = end_chapter.max(start);

    let (cast_json, rows_json, checkpoint_json) = {
        let lock = state.book_conn.lock().unwrap();
        let conn = lock.as_ref().ok_or("No book loaded")?;
        let cast_json: String = conn
            .query_row("SELECT cast_json FROM book_plan_versions WHERE id = ?1", [version_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT chapter_number, one_liner, cast_refs_json, thread_refs_json, tags_json
                 FROM chapter_outline_one_liners_current
                 WHERE chapter_number >= ?1 AND chapter_number <= ?2
                 ORDER BY chapter_number ASC",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(rusqlite::params![start, end], |row| {
                let ch: i32 = row.get(0)?;
                let one_liner: String = row.get(1)?;
                let cast_refs_json: String = row.get(2)?;
                let thread_refs_json: String = row.get(3)?;
                let tags_json: String = row.get(4)?;
                let cast_refs: serde_json::Value = serde_json::from_str(&cast_refs_json).unwrap_or(serde_json::json!([]));
                let thread_refs: serde_json::Value = serde_json::from_str(&thread_refs_json).unwrap_or(serde_json::json!([]));
                let tags: serde_json::Value = serde_json::from_str(&tags_json).unwrap_or(serde_json::json!([]));
                Ok(serde_json::json!({"chapter_number": ch, "one_liner": one_liner, "cast_refs": cast_refs, "thread_refs": thread_refs, "tags": tags}))
            })
            .map_err(|e| e.to_string())?;
        let mut rows = Vec::new();
        for item in iter.flatten() {
            rows.push(item);
        }
        let checkpoint_json: Option<String> = conn
            .query_row(
                "SELECT checkpoint_json FROM outline_checkpoints WHERE version_id = ?1 AND start_chapter = ?2 AND end_chapter = ?3 LIMIT 1",
                rusqlite::params![version_id, start, end],
                |row| row.get(0),
            )
            .ok();
        let checkpoint_json = checkpoint_json.unwrap_or_else(|| "{}".to_string());
        (cast_json, serde_json::to_string(&rows).unwrap_or("[]".to_string()), checkpoint_json)
    };

    let llm = LlmClient::new(config.api_key, config.base_url, config.model_name);
    let input_json = serde_json::json!({
        "range": {"start": start, "end": end},
        "cast": serde_json::from_str::<serde_json::Value>(&cast_json).unwrap_or(serde_json::json!([])),
        "rows": serde_json::from_str::<serde_json::Value>(&rows_json).unwrap_or(serde_json::json!([])),
        "checkpoint": serde_json::from_str::<serde_json::Value>(&checkpoint_json).unwrap_or(serde_json::json!({}))
    });

    let user_prompt = format!(
        "任务：基于 one-liner 为关键人物生成 SOUL state 的阶段性变化建议（timeline）。\n规则：不修改 soul_core，只输出 soul_state；只在确有事件触发时变化；区间应连续；reason_span 必须引用章号与事件摘要。只输出 JSON：{{\"timeline_updates\":[...]}}。\n\n输入 JSON：\n{}",
        serde_json::to_string(&input_json).unwrap_or("{}".to_string())
    );
    let resp = llm
        .chat_completion(blueprint_system_prompt_base(), &user_prompt)
        .await
        .map_err(|e| e.to_string())?;
    let parsed: SoulTimelineGenResult = parse_json_strict(&resp)?;

    let mut lock = state.book_conn.lock().unwrap();
    let conn = lock.as_mut().ok_or("No book loaded")?;

    let mut inserted: i32 = 0;
    for u in parsed.timeline_updates {
        let name = u.get("name").and_then(|x| x.as_str()).unwrap_or("").trim().to_string();
        if name.is_empty() {
            continue;
        }
        let from_ch = u.get("from_chapter").and_then(|x| x.as_i64()).unwrap_or(start as i64) as i32;
        let to_ch = u.get("to_chapter").and_then(|x| x.as_i64()).map(|x| x as i32);
        if to_ch.is_some() && to_ch.unwrap() < from_ch {
            continue;
        }
        let soul_state = u.get("soul_state").cloned().unwrap_or(serde_json::json!({}));
        let reason_span = u.get("reason_span").and_then(|x| x.as_str()).unwrap_or("").to_string();
        let soul_state_json = serde_json::to_string(&soul_state).unwrap_or("{}".to_string());
        let _ = conn.execute(
            "DELETE FROM character_soul_timeline
             WHERE source = 'ai' AND character_name = ?1
               AND valid_from_chapter >= ?2
               AND (valid_to_chapter IS NULL OR valid_to_chapter <= ?3)",
            rusqlite::params![name, start, end],
        );
        let affected = conn
            .execute(
                "INSERT INTO character_soul_timeline (character_name, valid_from_chapter, valid_to_chapter, soul_state_json, reason_span, source, confidence)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'ai', 0.6)",
                rusqlite::params![name, from_ch, to_ch, soul_state_json, reason_span],
            )
            .unwrap_or(0);
        inserted += affected as i32;
    }

    Ok(inserted)
}

// --- TESTS ---
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_show_dont_tell_interceptor() {
        let text = "楚风感到有些冷，他似乎明白了什么，时间飞逝。";
        let warnings = check_show_dont_tell(text);
        
        assert_eq!(warnings.len(), 3);
        
        // The order of warnings depends on the order of words in `black_list` in check_show_dont_tell
        // The array is ["似乎", "感到", "觉得", "时间飞逝", "不一会儿"]
        assert!(warnings[0].contains("似乎"));
        assert!(warnings[1].contains("感到"));
        assert!(warnings[2].contains("时间飞逝"));
    }

    #[test]
    fn test_clean_prose_passes() {
        let text = "楚风拔出断剑，剑柄上的雨水顺着手腕流进袖口。";
        let warnings = check_show_dont_tell(text);
        assert!(warnings.is_empty());
    }
}
