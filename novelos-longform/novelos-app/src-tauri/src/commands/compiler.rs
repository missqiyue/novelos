use crate::compiler::{self, CanonRuleForCompiler, CharacterForCompiler, CompileResult, ForeshadowForCompiler, TimelineForCompiler};
use crate::db::DbState;
use serde::{Deserialize, Serialize};
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
