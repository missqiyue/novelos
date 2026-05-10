use crate::commands::chapter::sync_chapter_rag;
use crate::commands::llm::LlmState;
use crate::db::DbState;
use crate::llm::LlmService;
use crate::rag::{self, IndexStats, RagIntentFilter};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};

// ─── RAG-006: Existing placeholder ───

/// RAG-006: Search result returned for each similar chapter.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimilarChapterResult {
    pub chapter_number: i64,
    pub similarity: f32,
    pub snippet: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct SearchSimilarChaptersInput {
    pub query: String,
    #[serde(default = "default_top_k")]
    pub top_k: usize,
}

fn default_top_k() -> usize {
    5
}

/// RAG-006: Search for chapters similar to a text query.
///
/// The query is embedded via the configured LLM provider and compared
/// against SQLite-stored chapter vectors. Returns up to top_k results with
/// chapter_number, similarity score, and a text snippet.
#[tauri::command]
pub async fn search_similar_chapters(
    llm: State<'_, LlmState>,
    db: State<'_, DbState>,
    input: SearchSimilarChaptersInput,
) -> Result<Vec<SimilarChapterResult>, String> {
    // Quick emptiness check
    {
        let guard = db.project.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("No project open")?;
        if rag::is_rag_empty(conn)? {
            return Ok(Vec::new());
        }
    }

    // Embed the query text
    let config = {
        let service = llm.service.lock().map_err(|e| e.to_string())?;
        service.config.clone()
    };
    let svc = LlmService::new(config);
    let embedding = svc.embed(&input.query).await.map_err(|e| e.to_string())?;

    // Search the SQLite-stored vectors
    let guard = db.project.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("No project open")?;
    let raw_results = rag::search_similar_sqlite(conn, &embedding, input.top_k, None)?;

    let results: Vec<SimilarChapterResult> = raw_results
        .into_iter()
        .map(
            |(chapter_number, snippet, similarity)| SimilarChapterResult {
                chapter_number,
                similarity,
                snippet,
            },
        )
        .collect();

    Ok(results)
}

// ─── RCL-004: RAG Semantic Recall ───

/// RCL-004: A single semantic recall result item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagSemanticRecallItem {
    pub chapter_number: i64,
    pub chunk_text: String,
    pub similarity: f32,
}

/// RCL-004: Response wrapper for semantic recall results.
/// Includes an optional message field for user-facing status (e.g. "No indexed chapters found").
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagSemanticRecallResponse {
    pub results: Vec<RagSemanticRecallItem>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RagRebuildProgressEvent {
    pub stage: String,
    pub current: usize,
    pub total: usize,
    pub chapter_number: Option<i64>,
    pub message: Option<String>,
}

pub struct RagRebuildCancelTokens(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

/// RCL-004: Semantic recall using vector similarity search with intent-driven filtering.
///
/// Embeds the query_text via the configured LLM provider and searches
/// the SQLite-stored RAG chunks for the most similar chapter chunks.
///
/// When an `intent` filter is provided, chunks matching intent criteria
/// (characters, POV, foreshadows, chapter range) receive similarity boosts.
///
/// Returns up to `top_k` results with chapter_number, chunk_text, and
/// cosine similarity score. If no chapters have been indexed, returns
/// an empty result set with the message "No indexed chapters found".
#[tauri::command]
pub async fn rag_semantic_recall(
    llm: State<'_, LlmState>,
    db: State<'_, DbState>,
    query_text: String,
    top_k: Option<usize>,
    intent: Option<RagIntentFilter>,
) -> Result<RagSemanticRecallResponse, String> {
    let k = top_k.unwrap_or(5).max(1);

    // Quick emptiness check — don't hold the lock across await
    {
        let guard = db.project.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("No project open")?;
        if rag::is_rag_empty(conn)? {
            return Ok(RagSemanticRecallResponse {
                results: vec![],
                message: Some("No indexed chapters found".to_string()),
            });
        }
    }

    // Embed the query text using the configured LLM provider
    let config = {
        let service = llm.service.lock().map_err(|e| e.to_string())?;
        service.config.clone()
    };
    let svc = LlmService::new(config);
    let embedding = svc.embed(&query_text).await.map_err(|e| e.to_string())?;

    // Search with intent-driven boosting
    let guard = db.project.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("No project open")?;
    let raw_results = rag::search_similar_sqlite(conn, &embedding, k, intent.as_ref())?;

    let results: Vec<RagSemanticRecallItem> = raw_results
        .into_iter()
        .map(
            |(chapter_number, chunk_text, similarity)| RagSemanticRecallItem {
                chapter_number,
                chunk_text,
                similarity,
            },
        )
        .collect();

    Ok(RagSemanticRecallResponse {
        results,
        message: None,
    })
}

// ─── RCL-006: Cross-book data isolation commands ───

/// RCL-006: Clear all RAG chunks for the current project.
#[tauri::command]
pub fn clear_book_index(db: State<'_, DbState>, _project_id: String) -> Result<bool, String> {
    let guard = db.project.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("No project open")?;
    rag::clear_rag_chunks(conn)?;
    Ok(true)
}

/// RCL-006: Return statistics about the current RAG index.
#[tauri::command]
pub fn get_index_stats(db: State<'_, DbState>) -> Result<IndexStats, String> {
    let guard = db.project.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("No project open")?;
    rag::get_rag_stats_sqlite(conn)
}

/// Rebuild RAG chunks for every chapter in the current project.
#[tauri::command]
pub async fn rebuild_book_index(
    app: AppHandle,
    llm: State<'_, LlmState>,
    db: State<'_, DbState>,
    cancel_tokens: State<'_, RagRebuildCancelTokens>,
) -> Result<IndexStats, String> {
    let project_id = db.current_project_id().unwrap_or_default();
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut tokens = cancel_tokens.0.lock().map_err(|e| e.to_string())?;
        tokens.insert(project_id.clone(), cancel_flag.clone());
    }

    let chapter_numbers: Vec<i64> = {
        let guard = db.project.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("No project open")?;
        let mut stmt = conn
            .prepare("SELECT chapter_number FROM chapters ORDER BY chapter_number")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };

    let total = chapter_numbers.len();
    let _ = app.emit(
        "rag-rebuild-progress",
        RagRebuildProgressEvent {
            stage: "started".to_string(),
            current: 0,
            total,
            chapter_number: None,
            message: Some(if total == 0 {
                "当前项目没有可重建的章节".to_string()
            } else {
                "开始重建全书 RAG 索引".to_string()
            }),
        },
    );

    if total == 0 {
        let guard = db.project.lock().map_err(|e| e.to_string())?;
        let conn = guard.as_ref().ok_or("No project open")?;
        let stats = rag::get_rag_stats_sqlite(conn)?;
        if !project_id.is_empty() {
            crate::commands::ledger::notify_pipeline_event(
                conn,
                &project_id,
                "system",
                "info",
                "RAG 索引重建已结束：当前项目没有章节，无需重建",
            );
        }
        {
            let mut tokens = cancel_tokens.0.lock().map_err(|e| e.to_string())?;
            tokens.remove(&project_id);
        }
        let _ = app.emit(
            "rag-rebuild-progress",
            RagRebuildProgressEvent {
                stage: "completed".to_string(),
                current: 0,
                total: 0,
                chapter_number: None,
                message: Some("当前项目没有章节，无需重建".to_string()),
            },
        );
        return Ok(stats);
    }

    for (idx, chapter_number) in chapter_numbers.into_iter().enumerate() {
        if cancel_flag.load(Ordering::SeqCst) {
            let guard = db.project.lock().map_err(|e| e.to_string())?;
            let conn = guard.as_ref().ok_or("No project open")?;
            if !project_id.is_empty() {
                crate::commands::ledger::notify_pipeline_event(
                    conn,
                    &project_id,
                    "system",
                    "warning",
                    "RAG 索引重建已取消",
                );
            }
            {
                let mut tokens = cancel_tokens.0.lock().map_err(|e| e.to_string())?;
                tokens.remove(&project_id);
            }
            let _ = app.emit(
                "rag-rebuild-progress",
                RagRebuildProgressEvent {
                    stage: "cancelled".to_string(),
                    current: idx,
                    total,
                    chapter_number: None,
                    message: Some("已取消 RAG 索引重建".to_string()),
                },
            );
            return Err("已取消 RAG 索引重建".to_string());
        }

        let current = idx + 1;
        let _ = app.emit(
            "rag-rebuild-progress",
            RagRebuildProgressEvent {
                stage: "progress".to_string(),
                current,
                total,
                chapter_number: Some(chapter_number),
                message: Some(format!("正在重建第 {} 章", chapter_number)),
            },
        );

        if let Err(err) = sync_chapter_rag(&db, &llm, chapter_number).await {
            {
                let mut tokens = cancel_tokens.0.lock().map_err(|e| e.to_string())?;
                tokens.remove(&project_id);
            }
            {
                let guard = db.project.lock().map_err(|e| e.to_string())?;
                let conn = guard.as_ref().ok_or("No project open")?;
                if !project_id.is_empty() {
                    crate::commands::ledger::notify_pipeline_event(
                        conn,
                        &project_id,
                        "system",
                        "error",
                        &format!("RAG 索引重建失败：{}", err),
                    );
                }
            }
            let _ = app.emit(
                "rag-rebuild-progress",
                RagRebuildProgressEvent {
                    stage: "failed".to_string(),
                    current,
                    total,
                    chapter_number: Some(chapter_number),
                    message: Some(err.clone()),
                },
            );
            return Err(err);
        }
    }

    let guard = db.project.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("No project open")?;
    let stats = rag::get_rag_stats_sqlite(conn)?;
    if !project_id.is_empty() {
        crate::commands::ledger::notify_pipeline_event(
            conn,
            &project_id,
            "system",
            "success",
            &format!(
                "RAG 索引重建完成：{} 章，{} 个切片，{} 个向量",
                stats.total_chapters_indexed, stats.total_chunks, stats.total_vectors
            ),
        );
    }
    {
        let mut tokens = cancel_tokens.0.lock().map_err(|e| e.to_string())?;
        tokens.remove(&project_id);
    }
    let _ = app.emit(
        "rag-rebuild-progress",
        RagRebuildProgressEvent {
            stage: "completed".to_string(),
            current: total,
            total,
            chapter_number: None,
            message: Some(format!(
                "重建完成：{} 章，{} 个切片",
                stats.total_chapters_indexed, stats.total_chunks
            )),
        },
    );
    Ok(stats)
}

#[tauri::command]
pub fn cancel_rebuild_book_index(
    db: State<'_, DbState>,
    cancel_tokens: State<'_, RagRebuildCancelTokens>,
) -> Result<bool, String> {
    let project_id = db.current_project_id().unwrap_or_default();
    let tokens = cancel_tokens.0.lock().map_err(|e| e.to_string())?;
    if let Some(token) = tokens.get(&project_id) {
        token.store(true, Ordering::SeqCst);
        Ok(true)
    } else {
        Ok(false)
    }
}
