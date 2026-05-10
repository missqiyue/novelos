use std::collections::HashMap;

use rusqlite::Connection;

// ─── Chunking ───

/// RAG-004: Split text into chunks of approximately max_chars characters.
///
/// Splitting strategy (in priority order):
/// 1. Split on paragraph boundaries (\\n\\n) when possible
/// 2. If a single paragraph exceeds max_chars, split on sentence boundaries (。！？)
/// 3. Merge short trailing chunks (fewer than 100 chars) into the previous chunk
///
/// Returns a Vec of chunk strings.
pub fn chunk_text(text: &str, max_chars: usize) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }

    let min_chunk_size: usize = 100;

    // Step 1: Split on paragraph boundaries
    let paragraphs: Vec<&str> = text.split("\n\n").collect();

    // Step 2: For paragraphs that exceed max_chars, split on sentence boundaries
    let mut raw_chunks: Vec<String> = Vec::new();
    for para in paragraphs {
        let trimmed = para.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.chars().count() <= max_chars {
            raw_chunks.push(trimmed.to_string());
        } else {
            // Split on sentence boundaries (。！？)
            let sentences = split_sentences(trimmed);
            let mut current = String::new();
            for sentence in sentences {
                let sentence_len = sentence.chars().count();
                if current.chars().count() + sentence_len <= max_chars {
                    if !current.is_empty() {
                        current.push_str(&sentence);
                    } else {
                        current = sentence;
                    }
                } else {
                    if !current.is_empty() {
                        raw_chunks.push(std::mem::take(&mut current));
                    }
                    // If a single sentence still exceeds max_chars, force-split it
                    if sentence_len > max_chars {
                        let forced = force_split(&sentence, max_chars);
                        // Push all but the last forced chunk (which may merge below)
                        let last_idx = forced.len().saturating_sub(1);
                        for (i, fc) in forced.into_iter().enumerate() {
                            if i < last_idx {
                                raw_chunks.push(fc);
                            } else {
                                current = fc;
                            }
                        }
                    } else {
                        current = sentence;
                    }
                }
            }
            if !current.is_empty() {
                raw_chunks.push(current);
            }
        }
    }

    // Step 3: Merge short trailing chunks into the previous chunk
    let mut chunks: Vec<String> = Vec::new();
    for chunk in raw_chunks {
        if chunk.chars().count() < min_chunk_size && !chunks.is_empty() {
            // Merge with the previous chunk
            let last = chunks.last_mut().unwrap();
            last.push('\n');
            last.push_str(&chunk);
        } else {
            chunks.push(chunk);
        }
    }

    chunks
}

/// Split text on Chinese/Japanese sentence-ending punctuation.
/// Each punctuation mark stays attached to its sentence.
fn split_sentences(text: &str) -> Vec<String> {
    let mut sentences: Vec<String> = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if ch == '。' || ch == '！' || ch == '？' {
            sentences.push(current.clone());
            current.clear();
        }
    }

    // Any remaining text without a terminal punctuation
    if !current.trim().is_empty() {
        sentences.push(current);
    }

    sentences
}

/// Force-split a long string into fixed-size chunks at character boundaries.
fn force_split(text: &str, max_chars: usize) -> Vec<String> {
    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        if current.chars().count() >= max_chars {
            chunks.push(current.clone());
            current.clear();
        }
        current.push(ch);
    }

    if !current.is_empty() {
        chunks.push(current);
    }

    chunks
}

// ─── Intent Filter ───

/// Intent filter for metadata-boosted RAG search.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct RagIntentFilter {
    /// Character names to boost — chunks mentioning these characters get a similarity boost.
    pub character_names: Option<Vec<String>>,
    /// POV character name — chunks from this character's viewpoint get a higher boost.
    pub pov_character: Option<String>,
    /// Active foreshadow titles — chunks referencing these foreshadows get a boost.
    pub active_foreshadows: Option<Vec<String>>,
    /// Chapter range filter — only return chunks within [min, max] inclusive.
    pub chapter_range: Option<(i64, i64)>,
}

// ─── Cosine Similarity ───

/// Compute cosine similarity between two vectors.
/// Returns a value in [-1.0, 1.0].
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() {
        return 0.0;
    }

    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}

// ─── Embedding BLOB helpers ───

/// Encode a Vec<f32> into a byte blob (little-endian f32).
pub fn encode_embedding(embedding: &[f32]) -> Vec<u8> {
    embedding.iter().flat_map(|f| f.to_le_bytes()).collect()
}

/// Decode a byte blob back into Vec<f32> (little-endian f32).
pub fn decode_embedding(blob: &[u8]) -> Vec<f32> {
    blob.chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

// ─── SQLite RAG operations ───

/// RAG-005: Index a chapter into the SQLite rag_chunks table.
///
/// Deletes any existing chunks for the same chapter_number first,
/// then chunks the text and inserts each chunk with its embedding.
/// `embedder` is a closure that takes a text slice and returns its embedding vector.
/// `extra_metadata` is optional (characters, pov, foreshadows) for intent-driven filtering.
pub fn index_chapter_sqlite<F>(
    conn: &Connection,
    chapter_number: i64,
    text: &str,
    embedder: F,
    extra_metadata: Option<HashMap<String, String>>,
) -> Result<(), String>
where
    F: Fn(&str) -> Vec<f32>,
{
    // Remove existing chunks for this chapter
    conn.execute(
        "DELETE FROM rag_chunks WHERE chapter_number = ?1",
        rusqlite::params![chapter_number],
    )
    .map_err(|e| format!("Failed to clear existing chunks: {}", e))?;

    let chunks = chunk_text(text, 1024);
    let characters = extra_metadata
        .as_ref()
        .and_then(|m| m.get("characters").cloned());
    let pov = extra_metadata.as_ref().and_then(|m| m.get("pov").cloned());
    let foreshadows = extra_metadata
        .as_ref()
        .and_then(|m| m.get("foreshadows").cloned());

    for (idx, chunk) in chunks.iter().enumerate() {
        let embedding = embedder(chunk);
        let blob = encode_embedding(&embedding);

        conn.execute(
            "INSERT INTO rag_chunks (chapter_number, chunk_index, chunk_text, embedding, characters, pov, foreshadows)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![chapter_number, idx as i64, chunk, blob, characters, pov, foreshadows],
        )
        .map_err(|e| format!("Failed to insert chunk: {}", e))?;
    }

    Ok(())
}

/// A single chunk row loaded from SQLite.
#[derive(Debug)]
struct ChunkRow {
    chapter_number: i64,
    chunk_text: String,
    embedding: Vec<f32>,
    characters: Option<String>,
    pov: Option<String>,
    foreshadows: Option<String>,
}

/// Map a single row from rag_chunks into a ChunkRow.
fn row_to_chunk(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChunkRow> {
    let chunk_text: String = row.get(1)?;
    let blob: Vec<u8> = row.get(2)?;
    let embedding = decode_embedding(&blob);
    Ok(ChunkRow {
        chapter_number: row.get(0)?,
        chunk_text,
        embedding,
        characters: row.get(3)?,
        pov: row.get(4)?,
        foreshadows: row.get(5)?,
    })
}

/// Load all chunks from SQLite, optionally filtered by chapter range.
fn load_all_chunks(
    conn: &Connection,
    chapter_range: Option<(i64, i64)>,
) -> Result<Vec<ChunkRow>, String> {
    match chapter_range {
        Some((min_ch, max_ch)) => {
            let mut stmt = conn.prepare(
                "SELECT chapter_number, chunk_text, embedding, characters, pov, foreshadows FROM rag_chunks WHERE chapter_number >= ?1 AND chapter_number <= ?2"
            ).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params![min_ch, max_ch], row_to_chunk)
                .map_err(|e| e.to_string())?;
            rows.filter_map(|r| r.ok())
                .collect::<Vec<_>>()
                .into_iter()
                .map(Ok)
                .collect()
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT chapter_number, chunk_text, embedding, characters, pov, foreshadows FROM rag_chunks"
            ).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], row_to_chunk)
                .map_err(|e| e.to_string())?;
            rows.filter_map(|r| r.ok())
                .collect::<Vec<_>>()
                .into_iter()
                .map(Ok)
                .collect()
        }
    }
}

/// Scored chunk for search results.
struct ScoredChunk {
    chapter_number: i64,
    chunk_text: String,
    similarity: f32,
}

/// Search the SQLite-stored RAG chunks for the most similar entries.
///
/// Loads all (filtered) chunks, computes cosine similarity against the query
/// embedding, applies intent boosts, and returns top_k results sorted by
/// descending similarity.
pub fn search_similar_sqlite(
    conn: &Connection,
    query_embedding: &[f32],
    top_k: usize,
    intent: Option<&RagIntentFilter>,
) -> Result<Vec<(i64, String, f32)>, String> {
    let chapter_range = intent.and_then(|i| i.chapter_range);
    let chunks = load_all_chunks(conn, chapter_range)?;

    if chunks.is_empty() || top_k == 0 {
        return Ok(Vec::new());
    }

    // Compute base cosine similarity + intent boosts
    let mut scored: Vec<ScoredChunk> = chunks
        .into_iter()
        .map(|chunk| {
            let mut score = cosine_similarity(query_embedding, &chunk.embedding);

            if let Some(ref intent) = intent {
                let text_lower = chunk.chunk_text.to_lowercase();

                // Character name boosts
                if let Some(ref names) = intent.character_names {
                    for name in names {
                        if text_lower.contains(&name.to_lowercase()) {
                            score += 0.08;
                        }
                    }
                }

                // POV character extra boost
                if let Some(ref pov) = intent.pov_character {
                    if text_lower.contains(&pov.to_lowercase()) {
                        score += 0.12;
                    }
                }

                // Active foreshadow boosts
                if let Some(ref foreshadows) = intent.active_foreshadows {
                    for fs in foreshadows {
                        if text_lower.contains(&fs.to_lowercase()) {
                            score += 0.06;
                        }
                    }
                }

                // Metadata-based boosts
                if let Some(ref names) = intent.character_names {
                    if let Some(ref meta_chars) = chunk.characters {
                        let meta_lower = meta_chars.to_lowercase();
                        for name in names {
                            if meta_lower.contains(&name.to_lowercase()) {
                                score += 0.05;
                            }
                        }
                    }
                }
                if let Some(ref pov) = intent.pov_character {
                    if let Some(ref meta_pov) = chunk.pov {
                        if meta_pov.eq_ignore_ascii_case(pov) {
                            score += 0.10;
                        }
                    }
                }
                if let Some(ref foreshadows) = intent.active_foreshadows {
                    if let Some(ref meta_fs) = chunk.foreshadows {
                        let meta_lower = meta_fs.to_lowercase();
                        for fs in foreshadows {
                            if meta_lower.contains(&fs.to_lowercase()) {
                                score += 0.04;
                            }
                        }
                    }
                }
            }

            ScoredChunk {
                chapter_number: chunk.chapter_number,
                chunk_text: chunk.chunk_text,
                similarity: score,
            }
        })
        .collect();

    // Sort by similarity descending
    scored.sort_by(|a, b| {
        b.similarity
            .partial_cmp(&a.similarity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let limit = top_k.min(scored.len());
    Ok(scored[..limit]
        .iter()
        .map(|s| (s.chapter_number, s.chunk_text.clone(), s.similarity))
        .collect())
}

/// RCL-006: Clear all RAG chunks for the current project.
pub fn clear_rag_chunks(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM rag_chunks", [])
        .map_err(|e| format!("Failed to clear RAG chunks: {}", e))?;
    Ok(())
}

/// RCL-006: Statistics about the current RAG index.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IndexStats {
    pub total_chapters_indexed: usize,
    pub total_chunks: usize,
    pub total_vectors: usize,
}

/// Get statistics about the RAG index from SQLite.
pub fn get_rag_stats_sqlite(conn: &Connection) -> Result<IndexStats, String> {
    let total_chunks: i64 = conn
        .query_row("SELECT COUNT(*) FROM rag_chunks", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let total_chapters: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT chapter_number) FROM rag_chunks",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(IndexStats {
        total_chapters_indexed: total_chapters as usize,
        total_chunks: total_chunks as usize,
        total_vectors: total_chunks as usize,
    })
}

/// Check if the RAG index is empty.
pub fn is_rag_empty(conn: &Connection) -> Result<bool, String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM rag_chunks", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count == 0)
}
