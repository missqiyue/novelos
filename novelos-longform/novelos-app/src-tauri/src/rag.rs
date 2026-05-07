use std::collections::HashMap;

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

/// RAG-003: In-memory vector store with cosine similarity search and file persistence.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct VectorStore {
    entries: Vec<VectorEntry>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct VectorEntry {
    text: String,
    embedding: Vec<f32>,
    metadata: HashMap<String, String>,
}

impl VectorStore {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
        }
    }

    /// Add a text chunk with its embedding and metadata to the store.
    pub fn add(
        &mut self,
        text: String,
        embedding: Vec<f32>,
        metadata: HashMap<String, String>,
    ) {
        self.entries.push(VectorEntry {
            text,
            embedding,
            metadata,
        });
    }

    /// Search for the top_k most similar entries to the query embedding.
    /// Returns a vector of (text, similarity_score, metadata) sorted by descending similarity.
    pub fn search(
        &self,
        embedding: &[f32],
        top_k: usize,
    ) -> Vec<(String, f32, HashMap<String, String>)> {
        if self.entries.is_empty() || top_k == 0 {
            return Vec::new();
        }

        let mut scored: Vec<(usize, f32)> = self
            .entries
            .iter()
            .enumerate()
            .map(|(i, entry)| (i, cosine_similarity(embedding, &entry.embedding)))
            .collect();

        // Sort by similarity descending
        scored.sort_by(|a, b| {
            b.1.partial_cmp(&a.1)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let limit = top_k.min(scored.len());
        scored[..limit]
            .iter()
            .map(|(i, score)| {
                let entry = &self.entries[*i];
                (entry.text.clone(), *score, entry.metadata.clone())
            })
            .collect()
    }

    /// Return the number of stored entries.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Return true if the store is empty.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// RCL-006: Remove all entries from the store.
    pub fn clear(&mut self) {
        self.entries.clear();
    }
}

/// Compute cosine similarity between two vectors.
/// Returns a value in [-1.0, 1.0].
fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
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

/// RCL-006: Statistics about the current in-memory vector index.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct IndexStats {
    pub total_chapters_indexed: usize,
    pub total_chunks: usize,
    pub total_vectors: usize,
}

/// RAG-005: Chapter vector indexer that chunks chapter text and indexes it
/// in a VectorStore for similarity search.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChapterIndex {
    pub store: VectorStore,
    /// Maps chapter_number -> vector of chunk strings (the same chunks stored in the VectorStore).
    pub chapter_chunks: HashMap<i64, Vec<String>>,
}

impl ChapterIndex {
    pub fn new() -> Self {
        Self {
            store: VectorStore::new(),
            chapter_chunks: HashMap::new(),
        }
    }

    /// Chunk the chapter text using `chunk_text` and add each chunk to the
    /// VectorStore with metadata `{chapter_number, chunk_index}`.
    ///
    /// `embedder` is a closure/function that takes a text slice and returns
    /// its embedding vector.
    pub fn index_chapter<F>(
        &mut self,
        chapter_number: i64,
        text: &str,
        embedder: F,
    ) where
        F: Fn(&str) -> Vec<f32>,
    {
        let chunks = chunk_text(text, 1024);
        let mut chunk_strings: Vec<String> = Vec::new();

        for (idx, chunk) in chunks.iter().enumerate() {
            let embedding = embedder(chunk);

            let mut metadata = HashMap::new();
            metadata.insert("chapter_number".to_string(), chapter_number.to_string());
            metadata.insert("chunk_index".to_string(), idx.to_string());

            self.store.add(chunk.clone(), embedding, metadata);
            chunk_strings.push(chunk.clone());
        }

        self.chapter_chunks.insert(chapter_number, chunk_strings);
    }

    /// Search the vector store for chunks similar to the given query embedding.
    /// Returns a Vec of (chapter_number, chunk_text, similarity) sorted by
    /// descending similarity.
    pub fn search_similar(
        &self,
        query_embedding: &[f32],
        top_k: usize,
    ) -> Vec<(i64, String, f32)> {
        let results = self.store.search(query_embedding, top_k);

        results
            .into_iter()
            .filter_map(|(text, similarity, metadata)| {
                let chapter_number: i64 = metadata
                    .get("chapter_number")?
                    .parse()
                    .ok()?;
                Some((chapter_number, text, similarity))
            })
            .collect()
    }

    /// RCL-006: Clear all indexed chapters and vectors.
    pub fn clear(&mut self) {
        self.store.clear();
        self.chapter_chunks.clear();
    }

    /// RCL-006: Return statistics about the current index state.
    pub fn stats(&self) -> IndexStats {
        let total_vectors = self.store.len();
        IndexStats {
            total_chapters_indexed: self.chapter_chunks.len(),
            total_chunks: total_vectors,
            total_vectors,
        }
    }
}

/// RAG-007: Per-book vector store that isolates chapters by project.
///
/// Wraps a ChapterIndex with a project_id field so that each book/project
/// maintains its own independent vector index.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct BookVectorStore {
    pub project_id: String,
    pub chapter_index: ChapterIndex,
}

impl BookVectorStore {
    /// Create a new vector store for the given project.
    pub fn new(project_id: &str) -> Self {
        Self {
            project_id: project_id.to_string(),
            chapter_index: ChapterIndex::new(),
        }
    }

    /// RCL-006: Clear all vectors for a specific project.
    ///
    /// Verifies that the stored project_id matches the given project_id
    /// (or is empty), then clears the chapter index.
    /// Returns true if the index was cleared, false if project_id mismatched.
    pub fn clear_book_index(&mut self, project_id: &str) -> bool {
        if self.project_id.is_empty() || self.project_id == project_id {
            self.chapter_index.clear();
            self.project_id = project_id.to_string();
            true
        } else {
            false
        }
    }

    /// RCL-006: Return statistics about the current index.
    pub fn get_index_stats(&self) -> IndexStats {
        self.chapter_index.stats()
    }

    /// Save the vector index to a JSON file for persistence across restarts.
    pub fn save_to_file(&self, path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string(self)?;
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Load a vector index from a JSON file.
    /// Returns None if the file does not exist or cannot be parsed.
    pub fn load_from_file(path: &std::path::Path) -> Option<Self> {
        if !path.exists() {
            return None;
        }
        let json = std::fs::read_to_string(path).ok()?;
        serde_json::from_str(&json).ok()
    }
}
