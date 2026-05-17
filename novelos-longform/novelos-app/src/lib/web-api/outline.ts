import { webDb } from "../web-db";
import {
  uuid,
  now,
  boolToInt,
  intToBool,
  nullIfUndefined,
  requireProjectId,
  WebNotSupportedError,
} from "./index";

import type {
  BookOutlineInfo,
  VolumeOutlineInfo,
  ChapterOutlineInfo,
  VolumeInfo,
  ArcInfo,
  EventNodeInfo,
} from "../tauri";

export const outlineApi = {
  async getBookOutline(): Promise<BookOutlineInfo | null> {
    const projectId = requireProjectId();
    return webDb.get<BookOutlineInfo>(
      "SELECT id, version, content_json, change_reason, status, created_at, updated_at FROM book_outlines WHERE project_id = ? ORDER BY version DESC, updated_at DESC LIMIT 1",
      [projectId],
    );
  },

  async saveBookOutline(contentJson: string, changeReason?: string): Promise<BookOutlineInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    const nextVer = webDb.get<{ v: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 as v FROM book_outlines",
    );
    webDb.run(
      "INSERT INTO book_outlines (id, project_id, version, content_json, change_reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)",
      [id, projectId, nextVer?.v ?? 1, contentJson, nullIfUndefined(changeReason), ts, ts],
    );
    return webDb.get<BookOutlineInfo>(
      "SELECT id, version, content_json, change_reason, status, created_at, updated_at FROM book_outlines WHERE id = ?",
      [id],
    )!;
  },

  async listVolumeOutlines(): Promise<VolumeOutlineInfo[]> {
    const projectId = requireProjectId();
    return webDb.all<VolumeOutlineInfo>(
      "SELECT id, volume_id, version, content_json, change_reason, status, created_at, updated_at FROM volume_outlines WHERE project_id = ? ORDER BY volume_id",
      [projectId],
    );
  },

  async saveVolumeOutline(
    volumeId: string,
    contentJson: string,
    changeReason?: string,
  ): Promise<VolumeOutlineInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    const nextVer = webDb.get<{ v: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 as v FROM volume_outlines WHERE volume_id = ?",
      [volumeId],
    );
    webDb.run(
      "INSERT INTO volume_outlines (id, project_id, volume_id, version, content_json, change_reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
      [
        id,
        projectId,
        volumeId,
        nextVer?.v ?? 1,
        contentJson,
        nullIfUndefined(changeReason),
        ts,
        ts,
      ],
    );
    return webDb.get<VolumeOutlineInfo>(
      "SELECT id, volume_id, version, content_json, change_reason, status, created_at, updated_at FROM volume_outlines WHERE id = ?",
      [id],
    )!;
  },

  async listChapterOutlines(): Promise<ChapterOutlineInfo[]> {
    const projectId = requireProjectId();
    return webDb.all<ChapterOutlineInfo>(
      "SELECT id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at FROM chapter_outlines WHERE project_id = ? ORDER BY chapter_number",
      [projectId],
    );
  },

  async getLatestChapterOutline(chapterNumber: number): Promise<ChapterOutlineInfo | null> {
    const projectId = requireProjectId();
    return (
      webDb.get<ChapterOutlineInfo>(
        "SELECT id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at FROM chapter_outlines WHERE project_id = ? AND chapter_number = ? ORDER BY version DESC, updated_at DESC LIMIT 1",
        [projectId, chapterNumber],
      ) ?? null
    );
  },

  async saveChapterOutline(
    chapterNumber: number,
    contentJson: string,
    taskId?: string,
    changeReason?: string,
  ): Promise<ChapterOutlineInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    const nextVer = webDb.get<{ v: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 as v FROM chapter_outlines WHERE chapter_number = ?",
      [chapterNumber],
    );
    webDb.run(
      `INSERT INTO chapter_outlines (id, project_id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'draft', ?, ?)`,
      [
        id,
        projectId,
        chapterNumber,
        nullIfUndefined(taskId),
        nextVer?.v ?? 1,
        contentJson,
        nullIfUndefined(changeReason),
        ts,
        ts,
      ],
    );
    return webDb.get<ChapterOutlineInfo>(
      "SELECT id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at FROM chapter_outlines WHERE id = ?",
      [id],
    )!;
  },

  async confirmChapterOutline(chapterNumber: number): Promise<void> {
    webDb.run(
      `UPDATE chapter_outlines SET confirmed = 1, status = 'confirmed', updated_at = ?
       WHERE chapter_number = ? AND version = (SELECT MAX(version) FROM chapter_outlines WHERE chapter_number = ?)`,
      [now(), chapterNumber, chapterNumber],
    );
  },

  async listVolumes(): Promise<VolumeInfo[]> {
    return webDb.all<VolumeInfo>(
      "SELECT id, volume_number, title, chapter_start, chapter_end, goal, main_conflict, climax, settlement, status FROM volumes ORDER BY volume_number",
    );
  },

  async updateVolume(
    id: string,
    title?: string,
    goal?: string,
    mainConflict?: string,
    climax?: string,
    settlement?: string,
    status?: string,
  ): Promise<void> {
    if (title !== undefined) webDb.run("UPDATE volumes SET title = ? WHERE id = ?", [title, id]);
    if (goal !== undefined) webDb.run("UPDATE volumes SET goal = ? WHERE id = ?", [goal, id]);
    if (mainConflict !== undefined)
      webDb.run("UPDATE volumes SET main_conflict = ? WHERE id = ?", [mainConflict, id]);
    if (climax !== undefined) webDb.run("UPDATE volumes SET climax = ? WHERE id = ?", [climax, id]);
    if (settlement !== undefined)
      webDb.run("UPDATE volumes SET settlement = ? WHERE id = ?", [settlement, id]);
    if (status !== undefined) webDb.run("UPDATE volumes SET status = ? WHERE id = ?", [status, id]);
  },

  async listArcs(volumeId?: string): Promise<ArcInfo[]> {
    return webDb.all<ArcInfo>(
      "SELECT id, volume_id, arc_type, title, chapter_start, chapter_end, goal, status, priority FROM arcs WHERE (? IS NULL OR volume_id = ?) ORDER BY priority",
      [volumeId ?? null, volumeId ?? null],
    );
  },

  async createArc(input: {
    volume_id: string;
    title: string;
    arc_type?: string;
    chapter_start?: number;
    chapter_end?: number;
    goal?: string;
  }): Promise<ArcInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    const nextPriority = webDb.get<{ p: number }>(
      "SELECT COALESCE(MAX(priority), 0) + 1 as p FROM arcs WHERE volume_id = ?",
      [input.volume_id],
    );
    const arcType = input.arc_type ?? "main";
    webDb.run(
      `INSERT INTO arcs (id, project_id, volume_id, arc_type, title, chapter_start, chapter_end, goal, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        id,
        projectId,
        input.volume_id,
        arcType,
        input.title,
        nullIfUndefined(input.chapter_start),
        nullIfUndefined(input.chapter_end),
        nullIfUndefined(input.goal),
        nextPriority?.p ?? 1,
      ],
    );
    return webDb.get<ArcInfo>(
      "SELECT id, volume_id, arc_type, title, chapter_start, chapter_end, goal, status, priority FROM arcs WHERE id = ?",
      [id],
    )!;
  },

  async listEventNodes(arcId?: string): Promise<EventNodeInfo[]> {
    return webDb.all<EventNodeInfo>(
      "SELECT id, arc_id, chapter_number, event_type, summary, cause_refs, effect_refs, participants, impact_scope, status FROM event_nodes WHERE (? IS NULL OR arc_id = ?) ORDER BY chapter_number",
      [arcId ?? null, arcId ?? null],
    );
  },
};
