use crate::db::DbState;
use serde::{Deserialize, Serialize};

use tauri::{AppHandle, Manager, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectInfo {
    pub id: String,
    pub title: String,
    pub genre_id: Option<String>,
    pub logline: Option<String>,
    pub target_words: Option<i64>,
    pub target_volumes: Option<i64>,
    pub min_chapter_words: i64,
    pub max_chapter_words: i64,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateProjectInput {
    pub title: String,
    pub genre_id: Option<String>,
    pub logline: Option<String>,
    pub target_words: Option<i64>,
    pub target_volumes: Option<i64>,
}

#[tauri::command]
pub fn create_project(
    app: AppHandle,
    db: State<'_, DbState>,
    input: CreateProjectInput,
) -> Result<ProjectInfo, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    db.open_project_db(&app, &id)
        .map_err(|e| format!("Failed to create project DB: {}", e))?;

    {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project DB open")?;

        conn.execute(
            "INSERT INTO projects (id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 2000, 5000, 'planning', ?7, ?8)",
            rusqlite::params![id, input.title, input.genre_id, input.logline, input.target_words, input.target_volumes, now, now],
        )
        .map_err(|e| e.to_string())?;

        let project = conn
            .query_row(
                "SELECT id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at FROM projects WHERE id = ?1",
                [&id],
                |row| Ok(ProjectInfo {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    genre_id: row.get(2)?,
                    logline: row.get(3)?,
                    target_words: row.get(4)?,
                    target_volumes: row.get(5)?,
                    min_chapter_words: row.get(6)?,
                    max_chapter_words: row.get(7)?,
                    status: row.get(8)?,
                    created_at: row.get(9)?,
                    updated_at: row.get(10)?,
                }),
            )
            .map_err(|e| e.to_string())?;

        // Also add to bookshelf with redundant metadata
        {
            let global_conn = db.global.lock().map_err(|e| e.to_string())?;
            let max_order: i64 = global_conn
                .query_row(
                    "SELECT COALESCE(MAX(display_order), 0) FROM bookshelf",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            global_conn
                .execute(
                    "INSERT INTO bookshelf (id, project_id, title, status, display_order, created_at) VALUES (?1, ?2, ?3, 'planning', ?4, ?5)",
                    rusqlite::params![uuid::Uuid::new_v4().to_string(), id, input.title, max_order + 1, now],
                )
                .map_err(|e| e.to_string())?;
        }

        Ok(project)
    }
}

#[tauri::command]
pub fn get_project(db: State<'_, DbState>) -> Result<ProjectInfo, String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;

    conn.query_row(
        "SELECT id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at FROM projects LIMIT 1",
        [],
        |row| Ok(ProjectInfo {
            id: row.get(0)?,
            title: row.get(1)?,
            genre_id: row.get(2)?,
            logline: row.get(3)?,
            target_words: row.get(4)?,
            target_volumes: row.get(5)?,
            min_chapter_words: row.get(6)?,
            max_chapter_words: row.get(7)?,
            status: row.get(8)?,
            created_at: row.get(9)?,
            updated_at: row.get(10)?,
        }),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn switch_project(
    app: AppHandle,
    db: State<'_, DbState>,
    registry: State<'_, crate::commands::task_manager::TaskRegistry>,
    project_id: String,
) -> Result<ProjectInfo, String> {
    // SHF-004: Pause tasks for the current project before switching
    let current_pid = db.current_project_id();
    if let Some(ref current) = current_pid {
        if current != &project_id {
            let _ = crate::commands::task_manager::pause_project_tasks_inner(&registry, current);
            // RAG data is now persisted in SQLite (book.db), no file save needed
        }
    }

    db.open_project_db(&app, &project_id)
        .map_err(|e| format!("Failed to open project: {}", e))?;

    // RAG data lives in the project's book.db — automatically available after open_project_db

    // Update last_opened_at in bookshelf
    {
        let global_conn = db.global.lock().map_err(|e| e.to_string())?;
        let now = chrono::Utc::now().to_rfc3339();
        global_conn
            .execute(
                "UPDATE bookshelf SET last_opened_at = ?1 WHERE project_id = ?2",
                rusqlite::params![now, project_id],
            )
            .map_err(|e| e.to_string())?;
    }

    get_project(db)
}

#[tauri::command]
pub fn close_project(db: State<'_, DbState>) -> Result<(), String> {
    // RAG data is now persisted in SQLite (book.db), no file save needed
    db.close_project_db();
    Ok(())
}

#[tauri::command]
pub fn update_project(
    db: State<'_, DbState>,
    title: Option<String>,
    status: Option<String>,
) -> Result<(), String> {
    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let now = chrono::Utc::now().to_rfc3339();

    if let Some(ref t) = title {
        conn.execute(
            "UPDATE projects SET title = ?1, updated_at = ?2",
            rusqlite::params![t, now],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(ref s) = status {
        conn.execute(
            "UPDATE projects SET status = ?1, updated_at = ?2",
            rusqlite::params![s, now],
        )
        .map_err(|e| e.to_string())?;
    }

    // Sync to bookshelf
    let project_id = db.current_project_id().unwrap_or_default();
    drop(project_conn);
    {
        let global_conn = db.global.lock().map_err(|e| e.to_string())?;
        if let Some(ref t) = title {
            global_conn
                .execute(
                    "UPDATE bookshelf SET title = ?1 WHERE project_id = ?2",
                    rusqlite::params![t, project_id],
                )
                .map_err(|e| e.to_string())?;
        }
        if let Some(ref s) = status {
            global_conn
                .execute(
                    "UPDATE bookshelf SET status = ?1 WHERE project_id = ?2",
                    rusqlite::params![s, project_id],
                )
                .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn delete_project(
    app: AppHandle,
    db: State<'_, DbState>,
    project_id: String,
) -> Result<(), String> {
    // Close if currently open
    {
        let current = db.current_project_id();
        if current.as_deref() == Some(&project_id) {
            db.close_project_db();
        }
    }

    // Remove from bookshelf
    {
        let global_conn = db.global.lock().map_err(|e| e.to_string())?;
        global_conn
            .execute(
                "DELETE FROM bookshelf WHERE project_id = ?1",
                rusqlite::params![project_id],
            )
            .map_err(|e| e.to_string())?;
    }

    // Delete project directory
    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let project_dir = books_dir.join(&project_id);
    if project_dir.exists() {
        std::fs::remove_dir_all(&project_dir)
            .map_err(|e| format!("Failed to delete project directory: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn export_project_txt(
    app: AppHandle,
    _db: State<'_, DbState>,
    project_id: String,
) -> Result<String, String> {
    // Open project DB temporarily for export
    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let db_path = books_dir.join(&project_id).join("book.db");

    if !db_path.exists() {
        return Err("Project database not found".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Get project title
    let title: String = conn
        .query_row("SELECT title FROM projects LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "未命名作品".to_string());

    let mut output = String::new();
    output.push_str(&format!("{}\n", "=".repeat(60)));
    output.push_str(&format!("{}\n", title));
    output.push_str(&format!("{}\n\n", "=".repeat(60)));

    // Export chapters
    let mut stmt = conn
        .prepare("SELECT chapter_number, title, final_text, draft_text FROM chapters ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;

    let chapters: Vec<(i64, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (num, chap_title, final_text, draft_text) in &chapters {
        let text = final_text
            .as_deref()
            .or(draft_text.as_deref())
            .unwrap_or("");
        if text.is_empty() {
            continue;
        }
        output.push_str(&format!("\n第{}章", num));
        if let Some(t) = chap_title {
            output.push_str(&format!(" {}", t));
        }
        output.push_str(&format!("\n{}\n\n", "-".repeat(40)));
        output.push_str(text);
        output.push_str("\n");
    }

    // Export canon rules
    output.push_str(&format!("\n{}\n", "=".repeat(60)));
    output.push_str("正典规则\n");
    output.push_str(&format!("{}\n\n", "=".repeat(60)));

    let mut stmt = conn
        .prepare("SELECT rule_name, content, is_hard, status FROM canon_rules WHERE status = 'active' ORDER BY rule_name")
        .map_err(|e| e.to_string())?;

    let rules: Vec<(String, String, i64, String)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (name, content, is_hard, _status) in &rules {
        output.push_str(&format!(
            "[{}] {}\n{}\n\n",
            if *is_hard == 1 {
                "硬规则"
            } else {
                "软规则"
            },
            name,
            content
        ));
    }

    // Export characters
    output.push_str(&format!("{}\n", "=".repeat(60)));
    output.push_str("角色列表\n");
    output.push_str(&format!("{}\n\n", "=".repeat(60)));

    let mut stmt = conn
        .prepare("SELECT name, role_type, identity_core, core_motivation FROM characters WHERE status = 'active' ORDER BY name")
        .map_err(|e| e.to_string())?;

    let chars: Vec<(String, String, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (name, role_type, identity, motivation) in &chars {
        output.push_str(&format!("- {} ({})\n", name, role_type));
        if let Some(id) = identity {
            output.push_str(&format!("  身份: {}\n", id));
        }
        if let Some(m) = motivation {
            output.push_str(&format!("  动机: {}\n", m));
        }
        output.push('\n');
    }

    // Write to file
    let export_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let safe_title = title.replace(
        |c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c as u32 > 127,
        "_",
    );
    let filename = format!(
        "{}_{}.txt",
        safe_title,
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let export_path = export_dir.join(&filename);

    std::fs::write(&export_path, &output).map_err(|e| e.to_string())?;

    Ok(export_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_project_md(
    app: AppHandle,
    _db: State<'_, DbState>,
    project_id: String,
) -> Result<String, String> {
    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let db_path = books_dir.join(&project_id).join("book.db");

    if !db_path.exists() {
        return Err("Project database not found".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    let title: String = conn
        .query_row("SELECT title FROM projects LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "未命名作品".to_string());

    let genre_id: Option<String> = conn
        .query_row("SELECT genre_id FROM projects LIMIT 1", [], |r| r.get(0))
        .ok();

    let logline: Option<String> = conn
        .query_row("SELECT logline FROM projects LIMIT 1", [], |r| r.get(0))
        .ok();

    let status: String = conn
        .query_row("SELECT status FROM projects LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "unknown".to_string());

    let created_at: String = conn
        .query_row("SELECT created_at FROM projects LIMIT 1", [], |r| r.get(0))
        .unwrap_or_default();

    let mut output = String::new();

    // Frontmatter
    output.push_str("---\n");
    output.push_str(&format!("title: \"{}\"\n", title));
    if let Some(ref g) = genre_id {
        output.push_str(&format!("genre: {}\n", g));
    }
    output.push_str(&format!("status: {}\n", status));
    output.push_str(&format!(
        "created: {}\n",
        created_at.split('T').next().unwrap_or(&created_at)
    ));
    output.push_str(&format!(
        "exported: {}\n",
        chrono::Utc::now().format("%Y-%m-%d")
    ));
    output.push_str("---\n\n");

    output.push_str(&format!("# {}\n\n", title));

    if let Some(ref l) = logline {
        if !l.is_empty() {
            output.push_str(&format!("> {}\n\n", l));
        }
    }

    // Export volumes / outline
    let mut vol_stmt = conn
        .prepare("SELECT volume_number, title, goal, main_conflict, climax, settlement FROM volumes ORDER BY volume_number")
        .map_err(|e| e.to_string())?;
    let volumes: Vec<(
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<String>,
    )> = vol_stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if !volumes.is_empty() {
        output.push_str("## 目录\n\n");
        for (num, vol_title, _, _, _, _) in &volumes {
            let vt = vol_title.as_deref().unwrap_or("未命名");
            output.push_str(&format!("- 第{}卷: {}\n", num, vt));
        }
        output.push('\n');
    }

    // Export chapters
    output.push_str("---\n\n## 正文\n\n");
    let mut stmt = conn
        .prepare("SELECT chapter_number, title, final_text, draft_text, status, word_count FROM chapters ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;
    let chapters: Vec<(
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        Option<i64>,
    )> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (num, chap_title, final_text, draft_text, chap_status, word_count) in &chapters {
        let text = final_text
            .as_deref()
            .or(draft_text.as_deref())
            .unwrap_or("");
        let ct = chap_title.as_deref().unwrap_or("");
        let wc = word_count.unwrap_or(0);

        output.push_str(&format!("### 第{}章 {}\n\n", num, ct));
        if *chap_status == "finalized" {
            output.push_str(&format!("*定稿 | {} 字*\n\n", wc));
        } else {
            output.push_str(&format!("*{} | {} 字*\n\n", chap_status, wc));
        }
        if !text.is_empty() {
            // Split text into paragraphs
            for para in text.split("\n\n") {
                let trimmed = para.trim();
                if !trimmed.is_empty() {
                    output.push_str(trimmed);
                    output.push_str("\n\n");
                }
            }
        }
        output.push_str("---\n\n");
    }

    // Export canon rules
    output.push_str("## 附录: 正典规则\n\n");
    let mut stmt = conn
        .prepare("SELECT rule_name, content, is_hard, status, scope_type FROM canon_rules WHERE status = 'active' ORDER BY is_hard DESC, rule_name")
        .map_err(|e| e.to_string())?;
    let rules: Vec<(String, String, i64, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (name, content, is_hard, _status, scope) in &rules {
        let tag = if *is_hard == 1 {
            "🔒 硬规则"
        } else {
            "📖 软规则"
        };
        output.push_str(&format!("### {} — {}\n\n", tag, name));
        output.push_str(&format!("*作用范围: {}*\n\n", scope));
        output.push_str(content);
        output.push_str("\n\n");
    }

    // Export characters
    output.push_str("## 附录: 角色列表\n\n");
    let mut stmt = conn
        .prepare("SELECT name, role_type, identity_core, core_motivation, soul_json FROM characters WHERE status = 'active' ORDER BY name")
        .map_err(|e| e.to_string())?;
    let chars: Vec<(String, String, Option<String>, Option<String>, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (name, role_type, identity, motivation, soul_json) in &chars {
        output.push_str(&format!("### {} ({})\n\n", name, role_type));
        if let Some(id) = identity {
            output.push_str(&format!("- **身份核心**: {}\n", id));
        }
        if let Some(m) = motivation {
            output.push_str(&format!("- **核心动机**: {}\n", m));
        }

        // Parse soul_json for structured display
        if let Ok(soul) = serde_json::from_str::<serde_json::Value>(soul_json) {
            if let Some(speech_examples) = soul.get("speech_examples").and_then(|v| v.as_array()) {
                if !speech_examples.is_empty() {
                    output.push_str("- **说话风格示例**:\n");
                    for ex in speech_examples {
                        if let Some(s) = ex.as_str() {
                            output.push_str(&format!("  - \"{}\"\n", s));
                        }
                    }
                }
            }
        }
        output.push('\n');
    }

    // Write to file
    let export_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let safe_title = title.replace(
        |c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c as u32 > 127,
        "_",
    );
    let filename = format!(
        "{}_{}.md",
        safe_title,
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let export_path = export_dir.join(&filename);

    std::fs::write(&export_path, &output).map_err(|e| e.to_string())?;

    Ok(export_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_project_epub(
    app: AppHandle,
    _db: State<'_, DbState>,
    project_id: String,
) -> Result<String, String> {
    use std::io::Write;

    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let db_path = books_dir.join(&project_id).join("book.db");

    if !db_path.exists() {
        return Err("Project database not found".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    let title: String = conn
        .query_row("SELECT title FROM projects LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "未命名作品".to_string());

    let author = "NovelOS".to_string();
    let uuid_id = format!("urn:uuid:{}", uuid::Uuid::new_v4());

    // Load chapters
    let mut stmt = conn
        .prepare("SELECT chapter_number, title, final_text, draft_text FROM chapters ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;
    let chapters: Vec<(i64, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Build EPUB in memory
    let export_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let safe_title = title.replace(|c: char| !c.is_alphanumeric() && c as u32 > 127, "_");
    let filename = format!(
        "{}_{}.epub",
        safe_title,
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let export_path = export_dir.join(&filename);

    let file = std::fs::File::create(&export_path).map_err(|e| e.to_string())?;
    let mut zip_writer = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // mimetype (must be first, uncompressed)
    zip_writer
        .start_file(
            "mimetype",
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored),
        )
        .map_err(|e| e.to_string())?;
    zip_writer
        .write_all(b"application/epub+zip")
        .map_err(|e| e.to_string())?;

    // META-INF/container.xml
    zip_writer
        .start_file("META-INF/container.xml", options)
        .map_err(|e| e.to_string())?;
    zip_writer
        .write_all(
            br#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#,
        )
        .map_err(|e| e.to_string())?;

    // Build chapter HTML strings and spine items
    let mut spine_items = String::new();
    let mut manifest_items = String::new();
    let mut ncx_points = String::new();
    let mut play_order = 1i64;

    for (num, chap_title, final_text, draft_text) in &chapters {
        let text = final_text
            .as_deref()
            .or(draft_text.as_deref())
            .unwrap_or("");
        if text.is_empty() {
            continue;
        }

        let ch_id = format!("chapter_{}", num);
        let ch_file = format!("chapter_{}.xhtml", num);
        let ct = chap_title.as_deref().unwrap_or("");
        let heading = format!("第{}章 {}", num, ct);

        // Escape HTML
        let escaped_text = text
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;");
        let paragraphs: Vec<String> = escaped_text
            .split("\n\n")
            .filter(|p| !p.trim().is_empty())
            .map(|p| format!("    <p>{}</p>", p.trim()))
            .collect();

        let html = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>{}</title></head>
<body>
  <h2>{}</h2>
{}
</body>
</html>"#,
            heading,
            heading,
            paragraphs.join("\n")
        );

        zip_writer
            .start_file(format!("OEBPS/{}", ch_file), options)
            .map_err(|e| e.to_string())?;
        zip_writer
            .write_all(html.as_bytes())
            .map_err(|e| e.to_string())?;

        spine_items.push_str(&format!("    <itemref idref=\"{}\"/>\n", ch_id));
        manifest_items.push_str(&format!(
            "    <item id=\"{}\" href=\"{}\" media-type=\"application/xhtml+xml\"/>\n",
            ch_id, ch_file
        ));
        ncx_points.push_str(&format!("    <navPoint id=\"nav_{}\" playOrder=\"{}\">\n      <navLabel><text>{}</text></navLabel>\n      <content src=\"{}\"/>\n    </navPoint>\n", num, play_order, heading, ch_file));
        play_order += 1;
    }

    // content.opf
    let opf = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>{}</dc:title>
    <dc:creator>{}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:identifier id="book-id">{}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
{}
  </manifest>
  <spine toc="ncx">
{}
  </spine>
</package>"#,
        title, author, uuid_id, manifest_items, spine_items
    );

    zip_writer
        .start_file("OEBPS/content.opf", options)
        .map_err(|e| e.to_string())?;
    zip_writer
        .write_all(opf.as_bytes())
        .map_err(|e| e.to_string())?;

    // toc.ncx
    let ncx = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head><meta name="dtb:uid" content="{}"/></head>
  <docTitle><text>{}</text></docTitle>
  <navMap>
{}
  </navMap>
</ncx>"#,
        uuid_id, title, ncx_points
    );

    zip_writer
        .start_file("OEBPS/toc.ncx", options)
        .map_err(|e| e.to_string())?;
    zip_writer
        .write_all(ncx.as_bytes())
        .map_err(|e| e.to_string())?;

    zip_writer.finish().map_err(|e| e.to_string())?;

    Ok(export_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn export_project_docx(
    app: AppHandle,
    _db: State<'_, DbState>,
    project_id: String,
) -> Result<String, String> {
    use docx_rs::*;

    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let db_path = books_dir.join(&project_id).join("book.db");

    if !db_path.exists() {
        return Err("Project database not found".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    let title: String = conn
        .query_row("SELECT title FROM projects LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "未命名作品".to_string());

    let logline: Option<String> = conn
        .query_row("SELECT logline FROM projects LIMIT 1", [], |r| r.get(0))
        .ok();

    // Build document
    let mut doc = Docx::new();

    // Title page
    let mut title_para = Paragraph::new();
    title_para = title_para.add_run(Run::new().add_text(&title).size(56).bold());
    doc = doc.add_paragraph(title_para);

    if let Some(ref l) = logline {
        if !l.is_empty() {
            doc = doc
                .add_paragraph(Paragraph::new().add_run(Run::new().add_text(l).size(24).italic()));
        }
    }

    doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text("").size(24)));
    doc = doc.add_paragraph(
        Paragraph::new().add_run(
            Run::new()
                .add_text(format!(
                    "导出日期: {}",
                    chrono::Utc::now().format("%Y-%m-%d")
                ))
                .size(20)
                .color("808080"),
        ),
    );

    // Page break
    // page break skipped

    // Chapters
    let mut stmt = conn
        .prepare("SELECT chapter_number, title, final_text, draft_text, word_count FROM chapters ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;
    let chapters: Vec<(
        i64,
        Option<String>,
        Option<String>,
        Option<String>,
        Option<i64>,
    )> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (num, chap_title, final_text, draft_text, word_count) in &chapters {
        let text = final_text
            .as_deref()
            .or(draft_text.as_deref())
            .unwrap_or("");
        if text.is_empty() {
            continue;
        }

        let heading = format!("第{}章 {}", num, chap_title.as_deref().unwrap_or(""));
        doc = doc
            .add_paragraph(Paragraph::new().add_run(Run::new().add_text(&heading).size(32).bold()));

        if let Some(wc) = word_count {
            doc = doc.add_paragraph(
                Paragraph::new().add_run(
                    Run::new()
                        .add_text(format!("{} 字", wc))
                        .size(18)
                        .color("808080"),
                ),
            );
        }

        // Split text into paragraphs
        for para_text in text.split("\n\n") {
            let trimmed = para_text.trim();
            if !trimmed.is_empty() {
                doc = doc
                    .add_paragraph(Paragraph::new().add_run(Run::new().add_text(trimmed).size(22)));
            }
        }

        doc = doc.add_paragraph(Paragraph::new().add_run(Run::new().add_text("").size(22)));
    }

    // Write to file
    let export_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let safe_title = title.replace(|c: char| !c.is_alphanumeric() && c as u32 > 127, "_");
    let filename = format!(
        "{}_{}.docx",
        safe_title,
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let export_path = export_dir.join(&filename);

    let file = std::fs::File::create(&export_path).map_err(|e| e.to_string())?;
    doc.build()
        .pack(file)
        .map_err(|e| format!("DOCX pack error: {}", e))?;

    Ok(export_path.to_string_lossy().to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub chapters_imported: i64,
    pub total_words: i64,
    pub chapter_titles: Vec<String>,
}

#[tauri::command]
pub fn import_project_txt(
    db: State<'_, DbState>,
    file_path: String,
) -> Result<ImportResult, String> {
    let content =
        std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    if content.trim().is_empty() {
        return Err("File is empty".to_string());
    }

    let project_conn = db.project.lock().map_err(|e| e.to_string())?;
    let conn = project_conn.as_ref().ok_or("No project open")?;
    let project_id = db.current_project_id().unwrap_or_default();
    let now = chrono::Utc::now().to_rfc3339();

    // Split by chapter markers: "第X章" patterns
    let chapter_pattern = regex::Regex::new(r"(?m)^(第[一二三四五六七八九十百千\d]+章.*)$")
        .map_err(|e| e.to_string())?;

    let mut chapter_titles: Vec<String> = Vec::new();
    let mut chapters_imported: i64 = 0;
    let mut total_words: i64 = 0;

    // Find all chapter marker positions
    let mut markers: Vec<(usize, String)> = Vec::new();
    for cap in chapter_pattern.captures_iter(&content) {
        if let Some(m) = cap.get(1) {
            markers.push((m.start(), m.as_str().to_string()));
        }
    }

    if markers.is_empty() {
        // No chapter markers found — import entire file as chapter 1
        let word_count = content.chars().count() as i64;
        let id = uuid::Uuid::new_v4().to_string();
        let title = "全文".to_string();

        conn.execute(
            "INSERT INTO chapters (id, project_id, chapter_number, title, draft_text, status, word_count, created_at, updated_at) VALUES (?1, ?2, 1, ?3, ?4, 'drafting', ?5, ?6, ?7)",
            rusqlite::params![id, project_id, title, content, word_count, now, now],
        ).map_err(|e| e.to_string())?;

        // Create initial version
        let version_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO chapter_versions (id, chapter_id, version_no, content_type, content, created_by, created_at) VALUES (?1, ?2, 1, 'draft', ?3, 'import', ?4)",
            rusqlite::params![version_id, id, content, now],
        ).map_err(|e| e.to_string())?;

        chapters_imported = 1;
        total_words = word_count;
        chapter_titles.push(title);
    } else {
        // Check if there's content before the first chapter marker
        let first_marker_pos = markers[0].0;
        if first_marker_pos > 0 {
            let preamble = content[..first_marker_pos].trim();
            if !preamble.is_empty() {
                // Store preamble as book description in project logline
                conn.execute(
                    "UPDATE projects SET logline = ?1 WHERE id = ?2",
                    rusqlite::params![preamble.chars().take(500).collect::<String>(), project_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }

        // Extract each chapter's content
        for (i, (start, title)) in markers.iter().enumerate() {
            let end = if i + 1 < markers.len() {
                markers[i + 1].0
            } else {
                content.len()
            };

            let chapter_text = content[*start..end].trim().to_string();
            // Remove the title line from the chapter text
            let body = if let Some(newline_pos) = chapter_text.find('\n') {
                chapter_text[newline_pos..].trim().to_string()
            } else {
                String::new()
            };

            let chapter_number = (i + 1) as i64;
            let word_count = body.chars().count() as i64;
            let id = uuid::Uuid::new_v4().to_string();

            conn.execute(
                "INSERT INTO chapters (id, project_id, chapter_number, title, draft_text, status, word_count, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 'drafting', ?6, ?7, ?8)",
                rusqlite::params![id, project_id, chapter_number, title, body, word_count, now, now],
            ).map_err(|e| e.to_string())?;

            // Create initial version
            let version_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO chapter_versions (id, chapter_id, version_no, content_type, content, created_by, created_at) VALUES (?1, ?2, 1, 'draft', ?3, 'import', ?4)",
                rusqlite::params![version_id, id, body, now],
            ).map_err(|e| e.to_string())?;

            chapters_imported += 1;
            total_words += word_count;
            chapter_titles.push(title.clone());
        }
    }

    // Update project status
    drop(project_conn);
    {
        let global_conn = db.global.lock().map_err(|e| e.to_string())?;
        global_conn
            .execute(
                "UPDATE bookshelf SET status = 'active' WHERE project_id = ?1",
                rusqlite::params![project_id],
            )
            .map_err(|e| e.to_string())?;
    }

    Ok(ImportResult {
        chapters_imported,
        total_words,
        chapter_titles,
    })
}

// --- PDF Export ---

#[tauri::command]
pub fn export_project_pdf(
    app: AppHandle,
    _db: State<'_, DbState>,
    project_id: String,
) -> Result<String, String> {
    use genpdf_chinese::{elements, fonts, style, Document, Element as _, Margins, Size};

    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let db_path = books_dir.join(&project_id).join("book.db");

    if !db_path.exists() {
        return Err("Project database not found".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    let title: String = conn
        .query_row("SELECT title FROM projects LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "未命名作品".to_string());

    let logline: Option<String> = conn
        .query_row("SELECT logline FROM projects LIMIT 1", [], |r| r.get(0))
        .ok();

    // Load CJK font — try known system paths then app data
    let font_paths: &[&str] = &[
        // macOS
        "/System/Library/Fonts/Supplemental/Songti.ttc",
        // Linux
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        // Windows
        "C:\\Windows\\Fonts\\msyh.ttc",
    ];

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let fonts_dir = app_data.join("novelos").join("fonts");
    let custom_font = fonts_dir.join("NotoSansSC-Regular.ttf");

    let font_data = if custom_font.exists() {
        std::fs::read(&custom_font).map_err(|e| format!("Failed to read font: {}", e))?
    } else {
        let mut found = None;
        for path in font_paths {
            if std::path::Path::new(path).exists() {
                match std::fs::read(path) {
                    Ok(data) => {
                        found = Some(data);
                        break;
                    }
                    Err(_) => continue,
                }
            }
        }
        found.ok_or_else(|| {
            "PDF导出需要中文字体。请下载 NotoSansSC-Regular.ttf 放入: ".to_string()
                + custom_font.to_str().unwrap_or("")
        })?
    };

    let font_family = fonts::FontFamily {
        regular: fonts::FontData::new(font_data.clone(), None)
            .map_err(|e| format!("Font load error: {}", e))?,
        bold: fonts::FontData::new(font_data.clone(), None)
            .map_err(|e| format!("Font load error: {}", e))?,
        italic: fonts::FontData::new(font_data.clone(), None)
            .map_err(|e| format!("Font load error: {}", e))?,
        bold_italic: fonts::FontData::new(font_data, None)
            .map_err(|e| format!("Font load error: {}", e))?,
    };

    let mut doc = Document::new(font_family);
    doc.set_title(&title);
    doc.set_paper_size(Size::new(210.0f32, 297.0f32)); // A4

    let mut decorator = genpdf_chinese::SimplePageDecorator::new();
    decorator.set_margins(Margins::trbl(25.0f32, 20.0f32, 25.0f32, 20.0f32));
    doc.set_page_decorator(decorator);

    // Title page
    doc.push(
        elements::Paragraph::new(&title).styled(style::Style::new().with_font_size(24).bold()),
    );

    if let Some(ref l) = logline {
        if !l.is_empty() {
            doc.push(
                elements::Paragraph::new(l).styled(style::Style::new().with_font_size(12).italic()),
            );
        }
    }

    doc.push(elements::Paragraph::new(""));
    doc.push(
        elements::Paragraph::new(format!(
            "导出日期: {}",
            chrono::Utc::now().format("%Y-%m-%d")
        ))
        .styled(style::Style::new().with_font_size(10)),
    );

    // Chapters
    let mut stmt = conn
        .prepare("SELECT chapter_number, title, final_text, draft_text FROM chapters ORDER BY chapter_number")
        .map_err(|e| e.to_string())?;

    let chapters: Vec<(i64, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for (num, chap_title, final_text, draft_text) in &chapters {
        let text = final_text
            .as_deref()
            .or(draft_text.as_deref())
            .unwrap_or("");
        if text.is_empty() {
            continue;
        }

        let heading = format!("第{}章 {}", num, chap_title.as_deref().unwrap_or(""));
        doc.push(
            elements::Paragraph::new(&heading)
                .styled(style::Style::new().with_font_size(16).bold()),
        );

        for para in text.split("\n\n") {
            let trimmed = para.trim();
            if !trimmed.is_empty() {
                doc.push(
                    elements::Paragraph::new(trimmed)
                        .styled(style::Style::new().with_font_size(12)),
                );
            }
        }

        doc.push(elements::PageBreak::new());
    }

    // Write to file
    let export_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let safe_title = title.replace(
        |c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c as u32 > 127,
        "_",
    );
    let filename = format!(
        "{}_{}.pdf",
        safe_title,
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    );
    let export_path = export_dir.join(&filename);

    doc.render_to_file(&export_path)
        .map_err(|e| format!("PDF render error: {}", e))?;

    Ok(export_path.to_string_lossy().to_string())
}

// --- Batch Export ---

#[tauri::command]
pub fn batch_export_chapters(
    app: AppHandle,
    _db: State<'_, DbState>,
    project_id: String,
    start_chapter: i64,
    end_chapter: i64,
    format: String,
) -> Result<String, String> {
    let books_dir = DbState::books_dir(&app).map_err(|e| e.to_string())?;
    let db_path = books_dir.join(&project_id).join("book.db");

    if !db_path.exists() {
        return Err("Project database not found".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    let title: String = conn
        .query_row("SELECT title FROM projects LIMIT 1", [], |r| r.get(0))
        .unwrap_or_else(|_| "未命名作品".to_string());

    let export_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("novelos")
        .join("exports");
    std::fs::create_dir_all(&export_dir).map_err(|e| e.to_string())?;

    let safe_title = title.replace(
        |c: char| !c.is_alphanumeric() && c != '-' && c != '_' && c as u32 > 127,
        "_",
    );

    match format.as_str() {
        "txt" => {
            let mut output = String::new();
            output.push_str(&format!("{}\n", "=".repeat(60)));
            output.push_str(&format!(
                "{} (第{}章 - 第{}章)\n",
                title, start_chapter, end_chapter
            ));
            output.push_str(&format!("{}\n\n", "=".repeat(60)));

            let mut stmt = conn
                .prepare(
                    "SELECT chapter_number, title, final_text, draft_text FROM chapters WHERE chapter_number >= ?1 AND chapter_number <= ?2 ORDER BY chapter_number",
                )
                .map_err(|e| e.to_string())?;

            let chapters: Vec<(i64, Option<String>, Option<String>, Option<String>)> = stmt
                .query_map(rusqlite::params![start_chapter, end_chapter], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            for (num, chap_title, final_text, draft_text) in &chapters {
                let text = final_text
                    .as_deref()
                    .or(draft_text.as_deref())
                    .unwrap_or("");
                if text.is_empty() {
                    continue;
                }
                output.push_str(&format!("\n第{}章", num));
                if let Some(t) = chap_title {
                    output.push_str(&format!(" {}", t));
                }
                output.push_str(&format!("\n{}\n\n", "-".repeat(40)));
                output.push_str(text);
                output.push_str("\n");
            }

            let filename = format!(
                "{}_{}_ch{}-{}.txt",
                safe_title,
                chrono::Utc::now().format("%Y%m%d_%H%M%S"),
                start_chapter,
                end_chapter
            );
            let export_path = export_dir.join(&filename);
            std::fs::write(&export_path, &output).map_err(|e| e.to_string())?;
            Ok(export_path.to_string_lossy().to_string())
        }
        "md" => {
            let mut output = String::new();

            output.push_str("---\n");
            output.push_str(&format!(
                "title: \"{} (第{}章 - 第{}章)\"\n",
                title, start_chapter, end_chapter
            ));
            output.push_str(&format!(
                "exported: {}\n",
                chrono::Utc::now().format("%Y-%m-%d")
            ));
            output.push_str("---\n\n");

            output.push_str(&format!(
                "# {} (章节范围: {}-{})\n\n",
                title, start_chapter, end_chapter
            ));

            let mut stmt = conn
                .prepare(
                    "SELECT chapter_number, title, final_text, draft_text, status, word_count FROM chapters WHERE chapter_number >= ?1 AND chapter_number <= ?2 ORDER BY chapter_number",
                )
                .map_err(|e| e.to_string())?;

            let chapters: Vec<(
                i64,
                Option<String>,
                Option<String>,
                Option<String>,
                String,
                Option<i64>,
            )> = stmt
                .query_map(rusqlite::params![start_chapter, end_chapter], |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;

            for (num, chap_title, final_text, draft_text, chap_status, word_count) in &chapters {
                let text = final_text
                    .as_deref()
                    .or(draft_text.as_deref())
                    .unwrap_or("");
                let ct = chap_title.as_deref().unwrap_or("");
                let wc = word_count.unwrap_or(0);

                output.push_str(&format!("### 第{}章 {}\n\n", num, ct));
                if *chap_status == "finalized" {
                    output.push_str(&format!("*定稿 | {} 字*\n\n", wc));
                } else {
                    output.push_str(&format!("*{} | {} 字*\n\n", chap_status, wc));
                }
                if !text.is_empty() {
                    for para in text.split("\n\n") {
                        let trimmed = para.trim();
                        if !trimmed.is_empty() {
                            output.push_str(trimmed);
                            output.push_str("\n\n");
                        }
                    }
                }
                output.push_str("---\n\n");
            }

            let filename = format!(
                "{}_{}_ch{}-{}.md",
                safe_title,
                chrono::Utc::now().format("%Y%m%d_%H%M%S"),
                start_chapter,
                end_chapter
            );
            let export_path = export_dir.join(&filename);
            std::fs::write(&export_path, &output).map_err(|e| e.to_string())?;
            Ok(export_path.to_string_lossy().to_string())
        }
        _ => Err("Unsupported format. Use 'txt' or 'md'.".to_string()),
    }
}
