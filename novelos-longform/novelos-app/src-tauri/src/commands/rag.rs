use crate::commands::llm::LlmState;
use crate::llm::LlmService;
use crate::rag::{BookVectorStore, IndexStats};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};

/// Get the RAG index file path for the given project.
fn rag_index_path(app: &tauri::AppHandle, project_id: &str) -> std::path::PathBuf {
    let data_dir = app.path().app_data_dir().unwrap_or_default();
    data_dir.join("novelos").join("books").join(project_id).join("rag_index.json")
}

// ─── RAG Managed State ───

/// RCL-004: Managed state holding the per-book vector store for RAG operations.
pub struct RagState {
    pub store: Mutex<BookVectorStore>,
}

impl RagState {
    pub fn new() -> Self {
        Self {
            store: Mutex::new(BookVectorStore::new("")),
        }
    }
}

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
/// against indexed chapter vectors. Returns up to top_k results with
/// chapter_number, similarity score, and a text snippet.
#[tauri::command]
pub async fn search_similar_chapters(
    llm: State<'_, LlmState>,
    rag: State<'_, RagState>,
    input: SearchSimilarChaptersInput,
) -> Result<Vec<SimilarChapterResult>, String> {
    // Quick emptiness check
    {
        let store = rag.store.lock().map_err(|e| e.to_string())?;
        if store.chapter_index.store.is_empty() {
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

    // Search the vector store
    let store = rag.store.lock().map_err(|e| e.to_string())?;
    let raw_results = store.chapter_index.search_similar(&embedding, input.top_k);

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

/// RCL-004: Semantic recall using vector similarity search.
///
/// Embeds the query_text via the configured LLM provider and searches
/// the in-memory VectorStore for the most similar chapter chunks.
///
/// Returns up to `top_k` results with chapter_number, chunk_text, and
/// cosine similarity score. If no chapters have been indexed, returns
/// an empty result set with the message "No indexed chapters found".
#[tauri::command]
pub async fn rag_semantic_recall(
    llm: State<'_, LlmState>,
    rag: State<'_, RagState>,
    query_text: String,
    top_k: Option<usize>,
) -> Result<RagSemanticRecallResponse, String> {
    let k = top_k.unwrap_or(5).max(1);

    // Quick emptiness check — don't hold the lock across await
    {
        let store = rag.store.lock().map_err(|e| e.to_string())?;
        if store.chapter_index.store.is_empty() {
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

    // Search the in-memory vector store
    let store = rag.store.lock().map_err(|e| e.to_string())?;
    let raw_results = store.chapter_index.search_similar(&embedding, k);

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

/// RCL-006: Clear all vectors for a specific project.
///
/// Verifies that the stored project_id matches the given project_id
/// (or is empty), then clears the in-memory chapter index. Returns
/// an error if the project_id mismatches, which guards against
/// accidentally clearing another book's index.
#[tauri::command]
pub fn clear_book_index(
    rag: State<'_, RagState>,
    project_id: String,
) -> Result<bool, String> {
    let mut store = rag.store.lock().map_err(|e| e.to_string())?;
    if store.clear_book_index(&project_id) {
        Ok(true)
    } else {
        Err(format!(
            "Project ID mismatch: store holds '{}', requested clear for '{}'",
            store.project_id, project_id
        ))
    }
}

/// RCL-006: Return statistics about the current in-memory vector index.
#[tauri::command]
pub fn get_index_stats(
    rag: State<'_, RagState>,
) -> Result<IndexStats, String> {
    let store = rag.store.lock().map_err(|e| e.to_string())?;
    Ok(store.get_index_stats())
}

/// Save the current RAG index to disk for the given project.
#[tauri::command]
pub fn save_rag_index(
    app: tauri::AppHandle,
    rag: State<'_, RagState>,
    project_id: String,
) -> Result<(), String> {
    let path = rag_index_path(&app, &project_id);
    let store = rag.store.lock().map_err(|e| e.to_string())?;
    store.save_to_file(&path).map_err(|e| format!("Failed to save RAG index: {}", e))
}

/// Load the RAG index from disk for the given project.
/// Replaces the in-memory store with the loaded index.
#[tauri::command]
pub fn load_rag_index(
    app: tauri::AppHandle,
    rag: State<'_, RagState>,
    project_id: String,
) -> Result<bool, String> {
    let path = rag_index_path(&app, &project_id);
    let loaded = BookVectorStore::load_from_file(&path);
    match loaded {
        Some(book_store) => {
            let mut store = rag.store.lock().map_err(|e| e.to_string())?;
            *store = book_store;
            Ok(true)
        }
        None => {
            // No saved index — initialize empty store for this project
            let mut store = rag.store.lock().map_err(|e| e.to_string())?;
            store.project_id = project_id;
            store.chapter_index.clear();
            Ok(false)
        }
    }
}
