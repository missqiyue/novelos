use crate::compiler::{self, CanonRuleForCompiler, CharacterForCompiler, CompileResult, ForeshadowForCompiler, TimelineForCompiler, get_paragraph_by_index};
use crate::db::DbState;
use crate::commands::llm::LlmState;
use crate::commands::agent::run_agent;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileInput {
    pub chapter_number: i64,
    pub draft_text: String,
}

#[tauri::command]
pub fn compile_chapter(db: State<'_, DbState>, input: CompileInput) -> Result<CompileResult, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    do_compile(conn, &input.draft_text, input.chapter_number)
}

/// Internal compile function usable from orchestrator without State
pub fn do_compile(conn: &rusqlite::Connection, draft_text: &str, chapter_number: i64) -> Result<CompileResult, String> {
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
        .prepare("SELECT id, title, status, seed_chapter FROM foreshadow_items ORDER BY seed_chapter")
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
        .prepare("SELECT id, event_summary, chapter_number FROM timeline_nodes ORDER BY chapter_number")
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
        .query_row("SELECT min_chapter_words FROM projects LIMIT 1", [], |r| r.get::<_, i64>(0))
        .unwrap_or(2000) as usize;
    let max_words: usize = conn
        .query_row("SELECT max_chapter_words FROM projects LIMIT 1", [], |r| r.get::<_, i64>(0))
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
        ).map_err(|e| e.to_string())?
    };

    let original_paragraph = get_paragraph_by_index(&draft_text, paragraph_index)
        .ok_or_else(|| format!("Paragraph index {} out of range", paragraph_index))?;

    // Load context for rewrite
    let canon_rules = get_canon_rules_text(&db)?;
    let soul_refs = get_soul_refs_text(&db)?;

    // Build scoped prompt — only the target paragraph + surrounding context
    let paragraphs: Vec<&str> = draft_text.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
    let context_before = if paragraph_index > 0 {
        paragraphs.get(paragraph_index - 1).unwrap_or(&"").to_string()
    } else {
        String::new()
    };
    let context_after = paragraphs.get(paragraph_index + 1).unwrap_or(&"").to_string();

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

    let result = run_agent(llm_state.clone(), db.clone(), "rewrite_agent".to_string(), vars).await?;

    // Extract the revised paragraph — take text before "---" separator if present
    let revised_paragraph = if let Some(sep_idx) = result.content.find("\n---\n").or_else(|| result.content.find("\n---")) {
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

    // Re-compile
    let compile_score = {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project open")?;
        do_compile(conn, &new_draft, chapter_number).ok().map(|r| r.score)
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
    let paragraphs: Vec<&str> = draft_text.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
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

fn get_canon_rules_text(db: &DbState) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let mut stmt = conn.prepare("SELECT rule_name, content, is_hard FROM canon_rules WHERE status = 'active'").map_err(|e| e.to_string())?;
    let rules: Vec<String> = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let content: String = row.get(1)?;
        let hard: bool = row.get::<_, i64>(2)? != 0;
        Ok(format!("[{}] {}: {}", if hard { "硬" } else { "软" }, name, content))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(rules.join("\n"))
}

fn get_soul_refs_text(db: &DbState) -> Result<String, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let mut stmt = conn.prepare("SELECT name, soul_json FROM characters WHERE status = 'active' AND soul_json != '{}' AND soul_json != ''").map_err(|e| e.to_string())?;
    let refs: Vec<String> = stmt.query_map([], |row| {
        let name: String = row.get(0)?;
        let soul: String = row.get(1)?;
        Ok(format!("{}: {}", name, soul.chars().take(300).collect::<String>()))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(refs.join("\n"))
}
