import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  SnapshotInfo,
} from "../tauri";

export const snapshotApi = {
  async generate(chapterNumber: number): Promise<SnapshotInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();

    const chapter = webDb.get<{ title: string | null; draft_text: string | null; final_text: string | null; word_count: number | null }>(
      "SELECT title, draft_text, final_text, word_count FROM chapters WHERE chapter_number = ?",
      [chapterNumber],
    );
    const characters = webDb.all<{ name: string; role_type: string; level_state: string | null; emotion_state: string | null; goal_state: string | null }>(
      "SELECT c.name, c.role_type, cs.level_state, cs.emotion_state, cs.goal_state FROM characters c LEFT JOIN character_states cs ON cs.character_id = c.id AND cs.chapter_to IS NULL WHERE c.status = 'active'",
    );
    const foreshadowCount = webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM foreshadow_items WHERE status = 'planted'")?.c ?? 0;
    const volume = webDb.get<{ volume_number: number; title: string | null }>(
      "SELECT volume_number, COALESCE(title, '') as title FROM volumes WHERE chapter_start <= ? AND (chapter_end >= ? OR chapter_end IS NULL) LIMIT 1",
      [chapterNumber, chapterNumber],
    );

    const summary = JSON.stringify({
      chapter: { number: chapterNumber, title: chapter?.title, word_count: chapter?.word_count },
      characters: characters.map((c) => ({ name: c.name, role: c.role_type, state: [c.level_state, c.emotion_state, c.goal_state].filter(Boolean) })),
      foreshadow_planted_count: foreshadowCount,
      volume: volume ? { number: volume.volume_number, title: volume.title } : null,
    });

    webDb.run(
      "INSERT INTO snapshots (id, project_id, snapshot_type, chapter_start, chapter_end, volume_id, summary_json, created_at) VALUES (?, ?, 'chapter', ?, ?, NULL, ?, ?)",
      [id, projectId, chapterNumber, chapterNumber, summary, ts],
    );
    webDb.run("UPDATE chapters SET snapshot_id = ? WHERE chapter_number = ?", [id, chapterNumber]);

    return {
      id, snapshot_type: "chapter", chapter_start: chapterNumber, chapter_end: chapterNumber,
      volume_id: null, arc_id: null, summary_json: summary, created_at: ts,
    };
  },

  async list(snapshotType?: string, chapterStart?: number, chapterEnd?: number): Promise<SnapshotInfo[]> {
    let sql = "SELECT id, snapshot_type, chapter_start, chapter_end, volume_id, arc_id, summary_json, created_at FROM snapshots WHERE 1=1";
    const params: unknown[] = [];
    if (snapshotType) { sql += " AND snapshot_type = ?"; params.push(snapshotType); }
    if (chapterStart !== undefined) { sql += " AND chapter_start >= ?"; params.push(chapterStart); }
    if (chapterEnd !== undefined) { sql += " AND chapter_end <= ?"; params.push(chapterEnd); }
    sql += " ORDER BY created_at DESC LIMIT 50";
    return webDb.all<SnapshotInfo>(sql, params);
  },
};
