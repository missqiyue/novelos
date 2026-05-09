import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type { SimilarChapterResult, RagSemanticRecallResponse, RagIntentFilter, IndexStats } from "../tauri";

// RAG stubs for web mode — in-memory only, no persistence
export const ragApi = {
  async searchSimilar(_query: string, _topK?: number): Promise<SimilarChapterResult[]> { return []; },
  async semanticRecall(_queryText: string, _topK?: number, _intent?: RagIntentFilter): Promise<RagSemanticRecallResponse> {
    return { results: [], message: "RAG not available in web mode" };
  },
  async clearBookIndex(_projectId: string): Promise<boolean> { return false; },
  async getIndexStats(): Promise<IndexStats> {
    return { total_chapters_indexed: 0, total_chunks: 0, total_vectors: 0 };
  },

};
