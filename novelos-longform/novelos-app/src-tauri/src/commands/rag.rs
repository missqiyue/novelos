use crate::commands::llm::LlmState;
use crate::db::DbState;
use tauri::State;
use crate::llm::LlmService;
use crate::rag::{self, IndexStats, RagIntentFilter};
use serde::{Deserialize, Serialize};

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
        .map(|(chapter_number, snippet, similarity)| SimilarChapterResult {
            chapter_number,
            similarity,
            snippet,
        })
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
        .map(|(chapter_number, chunk_text, similarity)| {
            RagSemanticRecallItem {
                chapter_number,
                chunk_text,
                similarity,
            }
        })
        .collect();

    Ok(RagSemanticRecallResponse {
        results,
        message: None,
    })
}

// ─── RCL-006: Cross-book data isolation commands ───

/// RCL-006: Clear all RAG chunks for the current project.
#[tauri::command]
pub fn clear_book_index(
    db: State<'_, DbState>,
    _project_id: String,
) -> Result<bool, String> {
    let guard = db.project.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("No project open")?;
    rag::clear_rag_chunks(conn)?;
    Ok(true)
}

/// RCL-006: Return statistics about the current RAG index.
#[tauri::command]
pub fn get_index_stats(
    db: State<'_, DbState>,
) -> Result<IndexStats, String> {
    let guard = db.project.lock().map_err(|e| e.to_string())?;
    let conn = guard.as_ref().ok_or("No project open")?;
    rag::get_rag_stats_sqlite(conn)
}
