import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type { WritingSessionInfo } from "../tauri";

interface WritingSessionRow {
  id: string;
  project_id: string;
  chapter_id: string | null;
  words_written: number;
  duration_seconds: number;
  started_at: string;
  ended_at: string;
}

export const writingSessionApi = {
  async startSession(input: { chapter_id?: string; start_word_count: number }): Promise<WritingSessionInfo> {
    const projectId = requireProjectId();
    const id = uuid();
    const now = new Date().toISOString();
    webDb.run(
      "INSERT INTO writing_sessions (id, project_id, chapter_id, words_written, duration_seconds, started_at, ended_at) VALUES (?, ?, ?, 0, 0, ?, ?)",
      [id, projectId, nullIfUndefined(input.chapter_id), now, now],
    );
    // Store start word count in project_settings for later calculation
    webDb.run(
      "INSERT OR REPLACE INTO project_settings (project_id, key, value) VALUES (?, ?, ?)",
      [projectId, `session_start_wc_${id}`, String(input.start_word_count)],
    );
    return { id, project_id: projectId, chapter_id: input.chapter_id ?? null, words_written: 0, duration_seconds: 0, started_at: now, ended_at: now };
  },
  async endSession(input: { session_id: string; end_word_count: number }): Promise<WritingSessionInfo> {
    const projectId = requireProjectId();
    const row = webDb.get<{ started_at: string; chapter_id: string | null }>(
      "SELECT started_at, chapter_id FROM writing_sessions WHERE id = ?",
      [input.session_id],
    );
    if (!row) throw new Error("Session not found");
    const now = new Date().toISOString();
    const durationSec = Math.max(0, Math.round((Date.now() - new Date(row.started_at).getTime()) / 1000));
    const startWcRow = webDb.get<{ value: string }>(
      "SELECT value FROM project_settings WHERE project_id = ? AND key = ?",
      [projectId, `session_start_wc_${input.session_id}`],
    );
    const startWc = startWcRow ? parseInt(startWcRow.value, 10) || 0 : 0;
    const wordsWritten = Math.max(0, input.end_word_count - startWc);
    webDb.run(
      "UPDATE writing_sessions SET words_written = ?, duration_seconds = ?, ended_at = ? WHERE id = ?",
      [wordsWritten, durationSec, now, input.session_id],
    );
    webDb.run(
      "DELETE FROM project_settings WHERE project_id = ? AND key = ?",
      [projectId, `session_start_wc_${input.session_id}`],
    );
    return { id: input.session_id, project_id: projectId, chapter_id: row.chapter_id, words_written: wordsWritten, duration_seconds: durationSec, started_at: row.started_at, ended_at: now };
  },
  async listSessions(chapter_id?: string): Promise<WritingSessionInfo[]> {
    const projectId = webDb.getProjectId();
    if (!projectId) return [];
    if (chapter_id) {
      return webDb.all<WritingSessionRow>(
        "SELECT id, project_id, chapter_id, words_written, duration_seconds, started_at, ended_at FROM writing_sessions WHERE project_id = ? AND chapter_id = ? ORDER BY started_at DESC",
        [projectId, chapter_id],
      );
    }
    return webDb.all<WritingSessionRow>(
      "SELECT id, project_id, chapter_id, words_written, duration_seconds, started_at, ended_at FROM writing_sessions WHERE project_id = ? ORDER BY started_at DESC",
      [projectId],
    );
  },
};
