import { webDb } from "./web-db";
import type {
  ProjectInfo,
  CreateProjectInput,
  ImportResult,
  SeedResult,
  BookshelfItem,
  CanonRuleInfo,
  CanonRuleVersionInfo,
  CreateCanonRuleInput,
  BookOutlineInfo,
  VolumeOutlineInfo,
  ChapterOutlineInfo,
  VolumeInfo,
  ArcInfo,
  EventNodeInfo,
  ChapterTaskInfo,
  ChapterInfo,
  ChapterVersionInfo,
  ChapterSearchResult,
  RecalledContext,
  CharacterInfo,
  DeAiRuleInfo,
  SoulTemplateInfo,
  GenreTemplateInfo,
  CharacterStateInfo,
  RelationshipStateInfo,
  TimelineNodeInfo,
  ForeshadowItemInfo,
  AbilityItemInfo,
  KnowledgeVisibilityInfo,
  NotificationInfo,
  LedgerSummary,
  RetconRequestInfo,
  RetconImpactInfo,
  RetconExecutionResult,
  RetconWorkflowState,
  BackgroundTask,
  StyleProfileInfo,
  WritingPatternInfo,
  GlobalResourcesOverview,
  SnapshotInfo,
  LlmConfig,
  ChatMessage,
  ChatResponse,
  TokenUsageSummary,
  AgentInfo,
  AgentRunResult,
  AgentLogEntry,
  PipelineResult,
  CompileResult,
  BackupInfo,
  EditorPrefs,
  LocationInfo,
  FactionInfo,
  CollisionItem,
} from "./tauri";

function uuid(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function boolToInt(v: boolean | undefined): number {
  return v ? 1 : 0;
}

function intToBool(v: unknown): boolean {
  return v === 1 || v === true;
}

function nullIfUndefined(v: unknown): unknown {
  return v === undefined ? null : v;
}

function requireProjectId(): string {
  const id = webDb.getProjectId();
  if (!id) throw new Error("No project is open");
  return id;
}

export class WebNotSupportedError extends Error {
  constructor(feature: string) {
    super(`"${feature}" is not available in web mode`);
    this.name = "WebNotSupportedError";
  }
}

// ─── Project ───

export const projectApi = {
  async create(input: CreateProjectInput): Promise<ProjectInfo> {
    await webDb.initGlobal();
    const id = uuid();
    const ts = now();

    webDb.run(
      `INSERT INTO projects (id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 2000, 5000, 'planning', ?, ?)`,
      [id, input.title, nullIfUndefined(input.genre_id), nullIfUndefined(input.logline),
       nullIfUndefined(input.target_words), nullIfUndefined(input.target_volumes), ts, ts],
    );

    const maxOrder = webDb.get<{ c: number }>("SELECT COALESCE(MAX(display_order), 0) as c FROM bookshelf", [], "global");
    webDb.run(
      `INSERT INTO bookshelf (id, project_id, title, status, display_order, created_at) VALUES (?, ?, ?, 'planning', ?, ?)`,
      [uuid(), id, input.title, (maxOrder?.c ?? 0) + 1, ts],
      "global",
    );

    await webDb.openProject(id);
    return webDb.get<ProjectInfo>(
      "SELECT id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at FROM projects WHERE id = ?",
      [id],
    )!;
  },

  async get(): Promise<ProjectInfo> {
    return webDb.get<ProjectInfo>(
      "SELECT id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at FROM projects LIMIT 1",
    )!;
  },

  async switch(projectId: string): Promise<ProjectInfo> {
    await webDb.initGlobal();
    webDb.run("UPDATE bookshelf SET last_opened_at = ? WHERE project_id = ?", [now(), projectId], "global");
    await webDb.openProject(projectId);
    return webDb.get<ProjectInfo>(
      "SELECT id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at FROM projects LIMIT 1",
    )!;
  },

  async close(): Promise<void> {
    await webDb.closeProject();
  },

  async update(title?: string, status?: string): Promise<void> {
    const ts = now();
    const projectId = requireProjectId();
    if (title !== undefined) {
      webDb.run("UPDATE projects SET title = ?, updated_at = ?", [title, ts]);
      webDb.run("UPDATE bookshelf SET title = ? WHERE project_id = ?", [title, projectId], "global");
    }
    if (status !== undefined) {
      webDb.run("UPDATE projects SET status = ?, updated_at = ?", [status, ts]);
      webDb.run("UPDATE bookshelf SET status = ? WHERE project_id = ?", [status, projectId], "global");
    }
  },

  async delete(projectId: string): Promise<void> {
    webDb.run("DELETE FROM bookshelf WHERE project_id = ?", [projectId], "global");
    await webDb.deleteProject(projectId);
  },

  async exportTxt(_projectId: string): Promise<string> {
    throw new WebNotSupportedError("exportTxt");
  },
  async exportMd(_projectId: string): Promise<string> {
    throw new WebNotSupportedError("exportMd");
  },
  async exportDocx(_projectId: string): Promise<string> {
    throw new WebNotSupportedError("exportDocx");
  },
  async exportEpub(_projectId: string): Promise<string> {
    throw new WebNotSupportedError("exportEpub");
  },
  async importTxt(_filePath: string): Promise<ImportResult> {
    throw new WebNotSupportedError("importTxt");
  },
  async createSample(): Promise<SeedResult> {
    throw new WebNotSupportedError("createSample");
  },
};

// ─── Bookshelf ───

export const bookshelfApi = {
  async list(): Promise<BookshelfItem[]> {
    await webDb.initGlobal();
    return webDb.all<BookshelfItem>(
      "SELECT id, project_id, title, genre_name, status, display_order, cover_image, last_opened_at, created_at FROM bookshelf ORDER BY display_order",
      [],
      "global",
    );
  },

  async add(projectId: string, title: string, genreName?: string, status?: string): Promise<string> {
    await webDb.initGlobal();
    const id = uuid();
    const ts = now();
    const st = status ?? "planning";
    const maxOrder = webDb.get<{ c: number }>("SELECT COALESCE(MAX(display_order), 0) as c FROM bookshelf", [], "global");
    webDb.run(
      "INSERT INTO bookshelf (id, project_id, title, genre_name, status, display_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, projectId, title, nullIfUndefined(genreName), st, (maxOrder?.c ?? 0) + 1, ts],
      "global",
    );
    return id;
  },

  async remove(id: string): Promise<void> {
    await webDb.initGlobal();
    webDb.run("DELETE FROM bookshelf WHERE id = ?", [id], "global");
  },

  async update(projectId: string, title?: string, genreName?: string, status?: string): Promise<void> {
    await webDb.initGlobal();
    if (title !== undefined) webDb.run("UPDATE bookshelf SET title = ? WHERE project_id = ?", [title, projectId], "global");
    if (genreName !== undefined) webDb.run("UPDATE bookshelf SET genre_name = ? WHERE project_id = ?", [genreName, projectId], "global");
    if (status !== undefined) webDb.run("UPDATE bookshelf SET status = ? WHERE project_id = ?", [status, projectId], "global");
  },

  async reorder(orderedIds: string[]): Promise<void> {
    await webDb.initGlobal();
    for (let i = 0; i < orderedIds.length; i++) {
      webDb.run("UPDATE bookshelf SET display_order = ? WHERE id = ?", [i + 1, orderedIds[i]], "global");
    }
  },
};

// ─── Canon ───

export const canonApi = {
  async list(scopeType?: string): Promise<CanonRuleInfo[]> {
    if (scopeType) {
      return webDb.all<CanonRuleInfo>(
        "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules WHERE scope_type = ? ORDER BY created_at",
        [scopeType],
      );
    }
    return webDb.all<CanonRuleInfo>(
      "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules ORDER BY created_at",
    );
  },

  async create(input: CreateCanonRuleInput): Promise<CanonRuleInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    const isHard = boolToInt(input.is_hard);
    const ruleType = input.rule_type ?? "soft_rule";

    // Insert canon rule
    webDb.run(
      `INSERT INTO canon_rules (id, project_id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)`,
      [id, projectId, input.rule_key, input.rule_name, ruleType, input.scope_type,
       nullIfUndefined(input.scope_ref), input.content, isHard,
       nullIfUndefined(input.source_type), nullIfUndefined(input.source_ref), ts, ts],
    );

    // Insert initial version
    const versionId = uuid();
    webDb.run(
      "INSERT INTO canon_rule_versions (id, canon_rule_id, version, content, change_reason, created_by, created_at) VALUES (?, ?, 1, ?, 'Initial version', 'user', ?)",
      [versionId, id, input.content, ts],
    );

    return webDb.get<CanonRuleInfo>(
      "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules WHERE id = ?",
      [id],
    )!;
  },

  async get(id: string): Promise<CanonRuleInfo> {
    return webDb.get<CanonRuleInfo>(
      "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules WHERE id = ?",
      [id],
    )!;
  },

  async update(
    id: string, content?: string, ruleName?: string, status?: string, isHard?: boolean, changeReason?: string,
  ): Promise<CanonRuleInfo> {
    const ts = now();
    if (content !== undefined) {
      // Increment version and insert version record
      const rule = webDb.get<{ version: number }>("SELECT version FROM canon_rules WHERE id = ?", [id]);
      const nextVersion = (rule?.version ?? 0) + 1;
      webDb.run("UPDATE canon_rules SET content = ?, version = ?, updated_at = ? WHERE id = ?", [content, nextVersion, ts, id]);
      webDb.run(
        "INSERT INTO canon_rule_versions (id, canon_rule_id, version, content, change_reason, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'user', ?)",
        [uuid(), id, nextVersion, content, nullIfUndefined(changeReason), ts],
      );
    }
    if (ruleName !== undefined) webDb.run("UPDATE canon_rules SET rule_name = ?, updated_at = ? WHERE id = ?", [ruleName, ts, id]);
    if (status !== undefined) webDb.run("UPDATE canon_rules SET status = ?, updated_at = ? WHERE id = ?", [status, ts, id]);
    if (isHard !== undefined) webDb.run("UPDATE canon_rules SET is_hard = ?, updated_at = ? WHERE id = ?", [boolToInt(isHard), ts, id]);

    return webDb.get<CanonRuleInfo>(
      "SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at FROM canon_rules WHERE id = ?",
      [id],
    )!;
  },

  async delete(id: string): Promise<void> {
    webDb.run("DELETE FROM canon_rule_versions WHERE canon_rule_id = ?", [id]);
    webDb.run("DELETE FROM canon_rules WHERE id = ?", [id]);
  },

  async listVersions(canonRuleId: string): Promise<CanonRuleVersionInfo[]> {
    return webDb.all<CanonRuleVersionInfo>(
      "SELECT id, canon_rule_id, version, content, change_reason, created_by, created_at FROM canon_rule_versions WHERE canon_rule_id = ? ORDER BY version DESC",
      [canonRuleId],
    );
  },

  async search(query: string): Promise<CanonRuleInfo[]> {
    const term = `%${query}%`;
    return webDb.all<CanonRuleInfo>(
      `SELECT id, rule_key, rule_name, rule_type, scope_type, scope_ref, content, is_hard, status, version, source_type, source_ref, created_at, updated_at
       FROM canon_rules WHERE rule_name LIKE ? OR content LIKE ? OR rule_key LIKE ? ORDER BY is_hard DESC, rule_name`,
      [term, term, term],
    );
  },
};

// ─── Outline ───

export const outlineApi = {
  async getBookOutline(): Promise<BookOutlineInfo | null> {
    return webDb.get<BookOutlineInfo>(
      "SELECT id, version, content_json, change_reason, status, created_at, updated_at FROM book_outlines ORDER BY version DESC LIMIT 1",
    );
  },

  async saveBookOutline(contentJson: string, changeReason?: string): Promise<BookOutlineInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    const nextVer = webDb.get<{ v: number }>("SELECT COALESCE(MAX(version), 0) + 1 as v FROM book_outlines");
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
    return webDb.all<VolumeOutlineInfo>(
      "SELECT id, volume_id, version, content_json, change_reason, status, created_at, updated_at FROM volume_outlines ORDER BY volume_id",
    );
  },

  async saveVolumeOutline(volumeId: string, contentJson: string, changeReason?: string): Promise<VolumeOutlineInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    const nextVer = webDb.get<{ v: number }>(
      "SELECT COALESCE(MAX(version), 0) + 1 as v FROM volume_outlines WHERE volume_id = ?",
      [volumeId],
    );
    webDb.run(
      "INSERT INTO volume_outlines (id, project_id, volume_id, version, content_json, change_reason, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)",
      [id, projectId, volumeId, nextVer?.v ?? 1, contentJson, nullIfUndefined(changeReason), ts, ts],
    );
    return webDb.get<VolumeOutlineInfo>(
      "SELECT id, volume_id, version, content_json, change_reason, status, created_at, updated_at FROM volume_outlines WHERE id = ?",
      [id],
    )!;
  },

  async listChapterOutlines(): Promise<ChapterOutlineInfo[]> {
    return webDb.all<ChapterOutlineInfo>(
      "SELECT id, chapter_number, task_id, version, content_json, confirmed, change_reason, status, created_at, updated_at FROM chapter_outlines ORDER BY chapter_number",
    );
  },

  async saveChapterOutline(
    chapterNumber: number, contentJson: string, taskId?: string, changeReason?: string,
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
      [id, projectId, chapterNumber, nullIfUndefined(taskId), nextVer?.v ?? 1, contentJson, nullIfUndefined(changeReason), ts, ts],
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
    id: string, title?: string, goal?: string, mainConflict?: string, climax?: string, settlement?: string, status?: string,
  ): Promise<void> {
    if (title !== undefined) webDb.run("UPDATE volumes SET title = ? WHERE id = ?", [title, id]);
    if (goal !== undefined) webDb.run("UPDATE volumes SET goal = ? WHERE id = ?", [goal, id]);
    if (mainConflict !== undefined) webDb.run("UPDATE volumes SET main_conflict = ? WHERE id = ?", [mainConflict, id]);
    if (climax !== undefined) webDb.run("UPDATE volumes SET climax = ? WHERE id = ?", [climax, id]);
    if (settlement !== undefined) webDb.run("UPDATE volumes SET settlement = ? WHERE id = ?", [settlement, id]);
    if (status !== undefined) webDb.run("UPDATE volumes SET status = ? WHERE id = ?", [status, id]);
  },

  async listArcs(volumeId?: string): Promise<ArcInfo[]> {
    return webDb.all<ArcInfo>(
      "SELECT id, volume_id, arc_type, title, chapter_start, chapter_end, goal, status, priority FROM arcs WHERE (? IS NULL OR volume_id = ?) ORDER BY priority",
      [volumeId ?? null, volumeId ?? null],
    );
  },

  async createArc(input: {
    volume_id: string; title: string; arc_type?: string; chapter_start?: number; chapter_end?: number; goal?: string;
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
      [id, projectId, input.volume_id, arcType, input.title,
       nullIfUndefined(input.chapter_start), nullIfUndefined(input.chapter_end),
       nullIfUndefined(input.goal), nextPriority?.p ?? 1],
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

// ─── Chapter ───

const CHAPTER_TRANSITIONS: Record<string, string[]> = {
  task_ready: ["drafting"],
  drafting: ["review", "task_ready"],
  review: ["finalized", "drafting", "task_ready"],
  finalized: ["approved", "review"],
  approved: [],
};

export const chapterApi = {
  async listTasks(volumeId?: string): Promise<ChapterTaskInfo[]> {
    return webDb.all<ChapterTaskInfo>(
      `SELECT id, chapter_number, volume_id, arc_id, objective, must_progress, must_recall, must_avoid, required_hooks, required_context, ending_hook, status, created_at
       FROM chapter_tasks WHERE (? IS NULL OR volume_id = ?) ORDER BY chapter_number`,
      [volumeId ?? null, volumeId ?? null],
    );
  },

  async createTask(
    chapterNumber: number, objective: string, volumeId?: string, arcId?: string,
    mustProgress?: string, mustRecall?: string, mustAvoid?: string,
  ): Promise<ChapterTaskInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    webDb.run(
      `INSERT INTO chapter_tasks (id, project_id, chapter_number, volume_id, arc_id, objective, must_progress, must_recall, must_avoid, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [id, projectId, chapterNumber, nullIfUndefined(volumeId), nullIfUndefined(arcId),
       objective, nullIfUndefined(mustProgress), nullIfUndefined(mustRecall), nullIfUndefined(mustAvoid), ts],
    );
    return webDb.get<ChapterTaskInfo>(
      "SELECT id, chapter_number, volume_id, arc_id, objective, must_progress, must_recall, must_avoid, required_hooks, required_context, ending_hook, status, created_at FROM chapter_tasks WHERE id = ?",
      [id],
    )!;
  },

  async listChapters(): Promise<ChapterInfo[]> {
    return webDb.all<ChapterInfo>(
      "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters ORDER BY chapter_number",
    );
  },

  async getChapter(chapterNumber: number): Promise<ChapterInfo> {
    return webDb.get<ChapterInfo>(
      "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE chapter_number = ?",
      [chapterNumber],
    )!;
  },

  async createChapter(chapterNumber: number, title?: string, taskId?: string): Promise<ChapterInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    webDb.run(
      "INSERT INTO chapters (id, project_id, chapter_number, title, status, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'task_ready', ?, ?, ?)",
      [id, projectId, chapterNumber, nullIfUndefined(title), nullIfUndefined(taskId), ts, ts],
    );
    return webDb.get<ChapterInfo>(
      "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE id = ?",
      [id],
    )!;
  },

  async updateDraft(chapterNumber: number, draftText: string): Promise<ChapterInfo> {
    const ts = now();
    const wordCount = draftText.length;
    webDb.run(
      "UPDATE chapters SET draft_text = ?, word_count = ?, status = 'drafting', updated_at = ? WHERE chapter_number = ?",
      [draftText, wordCount, ts, chapterNumber],
    );
    // Insert chapter version
    const chapter = webDb.get<{ id: string }>("SELECT id FROM chapters WHERE chapter_number = ?", [chapterNumber]);
    if (chapter) {
      const nextVer = webDb.get<{ v: number }>(
        "SELECT COALESCE(MAX(version_no), 0) + 1 as v FROM chapter_versions WHERE chapter_id = ?",
        [chapter.id],
      );
      webDb.run(
        "INSERT INTO chapter_versions (id, chapter_id, version_no, content_type, content, created_by, created_at) VALUES (?, ?, ?, 'draft', ?, 'user', ?)",
        [uuid(), chapter.id, nextVer?.v ?? 1, draftText, ts],
      );
    }
    return webDb.get<ChapterInfo>(
      "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE chapter_number = ?",
      [chapterNumber],
    )!;
  },

  async finalize(chapterNumber: number): Promise<ChapterInfo> {
    const ts = now();
    const chapter = webDb.get<ChapterInfo>(
      "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE chapter_number = ?",
      [chapterNumber],
    );
    if (!chapter) throw new Error(`Chapter ${chapterNumber} not found`);
    const finalText = chapter.draft_text ?? "";
    const wordCount = finalText.length;
    webDb.run(
      "UPDATE chapters SET final_text = ?, word_count = ?, status = 'finalized', updated_at = ? WHERE chapter_number = ?",
      [finalText, wordCount, ts, chapterNumber],
    );
    // Insert final version
    const nextVer = webDb.get<{ v: number }>(
      "SELECT COALESCE(MAX(version_no), 0) + 1 as v FROM chapter_versions WHERE chapter_id = ?",
      [chapter.id],
    );
    webDb.run(
      "INSERT INTO chapter_versions (id, chapter_id, version_no, content_type, content, created_by, created_at) VALUES (?, ?, ?, 'final', ?, 'user', ?)",
      [uuid(), chapter.id, nextVer?.v ?? 1, finalText, ts],
    );
    return webDb.get<ChapterInfo>(
      "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE chapter_number = ?",
      [chapterNumber],
    )!;
  },

  async listVersions(chapterNumber: number): Promise<ChapterVersionInfo[]> {
    const chapter = webDb.get<{ id: string }>("SELECT id FROM chapters WHERE chapter_number = ?", [chapterNumber]);
    if (!chapter) return [];
    return webDb.all<ChapterVersionInfo>(
      "SELECT id, chapter_id, version_no, content_type, content, diff_summary, created_by, created_at FROM chapter_versions WHERE chapter_id = ? ORDER BY version_no DESC",
      [chapter.id],
    );
  },

  async rollback(chapterNumber: number, versionNo: number): Promise<ChapterInfo> {
    const chapter = webDb.get<{ id: string }>("SELECT id FROM chapters WHERE chapter_number = ?", [chapterNumber]);
    if (!chapter) throw new Error(`Chapter ${chapterNumber} not found`);
    const version = webDb.get<{ content: string }>(
      "SELECT content FROM chapter_versions WHERE chapter_id = ? AND version_no = ?",
      [chapter.id, versionNo],
    );
    if (!version) throw new Error(`Version ${versionNo} not found`);
    const wordCount = version.content.length;
    webDb.run(
      "UPDATE chapters SET draft_text = ?, word_count = ?, updated_at = ? WHERE chapter_number = ?",
      [version.content, wordCount, now(), chapterNumber],
    );
    return webDb.get<ChapterInfo>(
      "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE chapter_number = ?",
      [chapterNumber],
    )!;
  },

  async searchChapters(query: string): Promise<ChapterSearchResult[]> {
    const term = `%${query}%`;
    const rows = webDb.all<{
      chapter_number: number; title: string | null;
      content: string; status: string; word_count: number | null;
    }>(
      `SELECT chapter_number, title, COALESCE(final_text, draft_text, '') as content, status, word_count
       FROM chapters WHERE final_text LIKE ? OR draft_text LIKE ? OR title LIKE ? ORDER BY chapter_number LIMIT 30`,
      [term, term, term],
    );
    return rows.map((r) => ({
      chapter_number: r.chapter_number,
      title: r.title,
      snippet: r.content.substring(0, 200),
      status: r.status,
      word_count: r.word_count,
    }));
  },

  async recallContext(chapterNumber: number): Promise<RecalledContext> {
    const hardRules = webDb.all<{ rule_name: string; content: string }>(
      "SELECT rule_name, content FROM canon_rules WHERE status = 'active' AND is_hard = 1 ORDER BY rule_name",
    );
    const softRules = webDb.all<{ rule_name: string; content: string }>(
      "SELECT rule_name, content FROM canon_rules WHERE status = 'active' AND is_hard = 0 ORDER BY rule_name LIMIT 10",
    );
    const charStates = webDb.all<{ name: string; level_state: string | null; emotion_state: string | null; goal_state: string | null }>(
      "SELECT c.name, cs.level_state, cs.emotion_state, cs.goal_state FROM characters c LEFT JOIN character_states cs ON cs.character_id = c.id WHERE c.status = 'active' LIMIT 15",
    );
    const foreshadows = webDb.all<{ title: string; seed_chapter: number }>(
      "SELECT title, seed_chapter FROM foreshadow_items WHERE status = 'planted' ORDER BY seed_chapter LIMIT 10",
    );

    return {
      hard_rules: hardRules.map((r) => `${r.rule_name}: ${r.content}`),
      soft_rules: softRules.map((r) => `${r.rule_name}: ${r.content}`),
      character_states: charStates.map((c) => `${c.name}: ${[c.level_state, c.emotion_state, c.goal_state].filter(Boolean).join(", ")}`),
      open_foreshadows: foreshadows.map((f) => `${f.title} (seed: ch${f.seed_chapter})`),
      total_tokens_estimate: 0,
    };
  },

  async listCharacters(): Promise<CharacterInfo[]> {
    return webDb.all<CharacterInfo>(
      "SELECT id, name, alias, role_type, identity_core, persona_core, soul_template_id, soul_json, taboo_rules, core_motivation, status, created_at, updated_at FROM characters ORDER BY name",
    );
  },

  async createCharacter(name: string, roleType?: string, soulJson?: string): Promise<CharacterInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    const role = roleType ?? "supporting";
    const soul = soulJson ?? "{}";
    webDb.run(
      "INSERT INTO characters (id, project_id, name, role_type, soul_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
      [id, projectId, name, role, soul, ts, ts],
    );
    return webDb.get<CharacterInfo>(
      "SELECT id, name, alias, role_type, identity_core, persona_core, soul_template_id, soul_json, taboo_rules, core_motivation, status, created_at, updated_at FROM characters WHERE id = ?",
      [id],
    )!;
  },

  async updateCharacter(
    id: string, name?: string, soulJson?: string, roleType?: string,
    identityCore?: string, personaCore?: string, coreMotivation?: string,
  ): Promise<void> {
    const ts = now();
    if (name !== undefined) webDb.run("UPDATE characters SET name = ?, updated_at = ? WHERE id = ?", [name, ts, id]);
    if (soulJson !== undefined) webDb.run("UPDATE characters SET soul_json = ?, updated_at = ? WHERE id = ?", [soulJson, ts, id]);
    if (roleType !== undefined) webDb.run("UPDATE characters SET role_type = ?, updated_at = ? WHERE id = ?", [roleType, ts, id]);
    if (identityCore !== undefined) webDb.run("UPDATE characters SET identity_core = ?, updated_at = ? WHERE id = ?", [identityCore, ts, id]);
    if (personaCore !== undefined) webDb.run("UPDATE characters SET persona_core = ?, updated_at = ? WHERE id = ?", [personaCore, ts, id]);
    if (coreMotivation !== undefined) webDb.run("UPDATE characters SET core_motivation = ?, updated_at = ? WHERE id = ?", [coreMotivation, ts, id]);
  },

  async deleteCharacter(id: string): Promise<void> {
    webDb.run("DELETE FROM characters WHERE id = ?", [id]);
  },

  async transitionState(chapterNumber: number, newStatus: string): Promise<ChapterInfo> {
    webDb.run(
      "UPDATE chapters SET status = ?, updated_at = ? WHERE chapter_number = ?",
      [newStatus, now(), chapterNumber],
    );
    return webDb.get<ChapterInfo>(
      "SELECT id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at FROM chapters WHERE chapter_number = ?",
      [chapterNumber],
    )!;
  },

  async getValidTransitions(chapterNumber: number): Promise<string[]> {
    const chapter = webDb.get<{ status: string }>(
      "SELECT status FROM chapters WHERE chapter_number = ?", [chapterNumber],
    );
    if (!chapter) return [];
    return CHAPTER_TRANSITIONS[chapter.status] ?? [];
  },

  async setCompileStatus(chapterNumber: number, compilerStatus: string): Promise<void> {
    webDb.run(
      "UPDATE chapters SET compiler_status = ?, updated_at = ? WHERE chapter_number = ?",
      [compilerStatus, now(), chapterNumber],
    );
  },

  async setReviewStatus(chapterNumber: number, reviewStatus: string): Promise<void> {
    webDb.run(
      "UPDATE chapters SET review_status = ?, updated_at = ? WHERE chapter_number = ?",
      [reviewStatus, now(), chapterNumber],
    );
  },
};

// ─── Compiler ───

export const compilerApi = {
  async compile(_chapterNumber: number, _draftText: string): Promise<CompileResult> {
    throw new WebNotSupportedError("compile");
  },
};

// ─── Ledger ───

export const ledgerApi = {
  async listKnowledgeVisibility(holderRef?: string): Promise<KnowledgeVisibilityInfo[]> {
    if (holderRef) {
      return webDb.all<KnowledgeVisibilityInfo>(
        "SELECT id, knowledge_key, holder_type, holder_ref, visibility_state, chapter_acquired, source_event_id FROM knowledge_visibility WHERE holder_ref = ? ORDER BY chapter_acquired",
        [holderRef],
      );
    }
    return webDb.all<KnowledgeVisibilityInfo>(
      "SELECT id, knowledge_key, holder_type, holder_ref, visibility_state, chapter_acquired, source_event_id FROM knowledge_visibility ORDER BY chapter_acquired, holder_ref",
    );
  },

  async upsertKnowledgeVisibility(input: {
    id?: string; knowledge_key: string; holder_type: string; holder_ref: string;
    visibility_state: string; chapter_acquired?: number; source_event_id?: string;
  }): Promise<KnowledgeVisibilityInfo> {
    const projectId = requireProjectId();
    const id = input.id ?? uuid();
    const existing = webDb.get<{ id: string }>("SELECT id FROM knowledge_visibility WHERE id = ?", [id]);

    if (existing) {
      webDb.run(
        "UPDATE knowledge_visibility SET knowledge_key=?, holder_type=?, holder_ref=?, visibility_state=?, chapter_acquired=? WHERE id=?",
        [input.knowledge_key, input.holder_type, input.holder_ref, input.visibility_state,
         nullIfUndefined(input.chapter_acquired), id],
      );
    } else {
      webDb.run(
        `INSERT INTO knowledge_visibility (id, project_id, knowledge_key, holder_type, holder_ref, visibility_state, chapter_acquired, source_event_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, input.knowledge_key, input.holder_type, input.holder_ref,
         input.visibility_state, nullIfUndefined(input.chapter_acquired), nullIfUndefined(input.source_event_id)],
      );
    }
    return webDb.get<KnowledgeVisibilityInfo>(
      "SELECT id, knowledge_key, holder_type, holder_ref, visibility_state, chapter_acquired, source_event_id FROM knowledge_visibility WHERE id = ?",
      [id],
    )!;
  },

  async listCharacterStates(characterId?: string): Promise<CharacterStateInfo[]> {
    if (characterId) {
      return webDb.all<CharacterStateInfo>(
        "SELECT id, character_id, snapshot_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at FROM character_states WHERE character_id = ? ORDER BY chapter_from",
        [characterId],
      );
    }
    return webDb.all<CharacterStateInfo>(
      "SELECT id, character_id, snapshot_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at FROM character_states ORDER BY chapter_from",
    );
  },

  async upsertCharacterState(input: {
    character_id: string; chapter_from?: number; chapter_to?: number;
    level_state?: string; physical_state?: string; emotion_state?: string;
    goal_state?: string; location_id?: string; resource_state?: string;
    known_info?: string; secret_info?: string;
  }): Promise<CharacterStateInfo> {
    const projectId = requireProjectId();
    const existing = webDb.get<{ id: string }>(
      "SELECT id FROM character_states WHERE character_id = ? AND chapter_from = ?",
      [input.character_id, input.chapter_from ?? null],
    );

    let id: string;
    if (existing) {
      id = existing.id;
      webDb.run(
        `UPDATE character_states SET level_state=?, physical_state=?, emotion_state=?, goal_state=?, location_id=?, resource_state=?, known_info=?, secret_info=?, chapter_to=? WHERE id=?`,
        [nullIfUndefined(input.level_state), nullIfUndefined(input.physical_state),
         nullIfUndefined(input.emotion_state), nullIfUndefined(input.goal_state),
         nullIfUndefined(input.location_id), nullIfUndefined(input.resource_state),
         nullIfUndefined(input.known_info), nullIfUndefined(input.secret_info),
         nullIfUndefined(input.chapter_to), id],
      );
    } else {
      id = uuid();
      const ts = now();
      webDb.run(
        `INSERT INTO character_states (id, project_id, character_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, input.character_id, nullIfUndefined(input.chapter_from),
         nullIfUndefined(input.chapter_to), nullIfUndefined(input.level_state),
         nullIfUndefined(input.physical_state), nullIfUndefined(input.emotion_state),
         nullIfUndefined(input.goal_state), nullIfUndefined(input.location_id),
         nullIfUndefined(input.resource_state), nullIfUndefined(input.known_info),
         nullIfUndefined(input.secret_info), ts],
      );
    }
    return webDb.get<CharacterStateInfo>(
      "SELECT id, character_id, snapshot_id, chapter_from, chapter_to, level_state, physical_state, emotion_state, goal_state, location_id, resource_state, known_info, secret_info, created_at FROM character_states WHERE id = ?",
      [id],
    )!;
  },

  async deleteCharacterState(id: string): Promise<void> {
    webDb.run("DELETE FROM character_states WHERE id = ?", [id]);
  },

  async listRelationshipStates(characterId?: string): Promise<RelationshipStateInfo[]> {
    if (characterId) {
      return webDb.all<RelationshipStateInfo>(
        "SELECT id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes FROM relationship_states WHERE source_character_id = ? OR target_character_id = ? ORDER BY chapter_from",
        [characterId, characterId],
      );
    }
    return webDb.all<RelationshipStateInfo>(
      "SELECT id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes FROM relationship_states ORDER BY chapter_from",
    );
  },

  async upsertRelationshipState(input: {
    source_character_id: string; target_character_id: string; relation_type: string;
    strength?: number; trust_score?: number; conflict_score?: number;
    chapter_from?: number; chapter_to?: number; trigger_event_id?: string; notes?: string;
  }): Promise<RelationshipStateInfo> {
    const projectId = requireProjectId();
    const existing = webDb.get<{ id: string }>(
      "SELECT id FROM relationship_states WHERE source_character_id = ? AND target_character_id = ?",
      [input.source_character_id, input.target_character_id],
    );

    let id: string;
    if (existing) {
      id = existing.id;
      webDb.run(
        `UPDATE relationship_states SET relation_type=?, strength=?, trust_score=?, conflict_score=?, chapter_to=?, notes=? WHERE id=?`,
        [input.relation_type, nullIfUndefined(input.strength), nullIfUndefined(input.trust_score),
         nullIfUndefined(input.conflict_score), nullIfUndefined(input.chapter_to),
         nullIfUndefined(input.notes), id],
      );
    } else {
      id = uuid();
      webDb.run(
        `INSERT INTO relationship_states (id, project_id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, input.source_character_id, input.target_character_id,
         input.relation_type, nullIfUndefined(input.strength), nullIfUndefined(input.trust_score),
         nullIfUndefined(input.conflict_score), nullIfUndefined(input.chapter_from),
         nullIfUndefined(input.chapter_to), nullIfUndefined(input.trigger_event_id),
         nullIfUndefined(input.notes)],
      );
    }
    return webDb.get<RelationshipStateInfo>(
      "SELECT id, source_character_id, target_character_id, relation_type, strength, trust_score, conflict_score, chapter_from, chapter_to, trigger_event_id, notes FROM relationship_states WHERE id = ?",
      [id],
    )!;
  },

  async listTimelineNodes(chapterNumber?: number): Promise<TimelineNodeInfo[]> {
    if (chapterNumber !== undefined) {
      return webDb.all<TimelineNodeInfo>(
        "SELECT id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies FROM timeline_nodes WHERE chapter_number = ? ORDER BY relative_day",
        [chapterNumber],
      );
    }
    return webDb.all<TimelineNodeInfo>(
      "SELECT id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies FROM timeline_nodes ORDER BY relative_day, chapter_number",
    );
  },

  async upsertTimelineNode(input: {
    id?: string; chapter_number?: number; world_date?: string; relative_day?: number;
    location_id?: string; summary: string; participants?: string; dependencies?: string;
  }): Promise<TimelineNodeInfo> {
    const projectId = requireProjectId();
    const id = input.id ?? uuid();
    const existing = webDb.get<{ id: string }>("SELECT id FROM timeline_nodes WHERE id = ?", [id]);

    if (existing) {
      webDb.run(
        "UPDATE timeline_nodes SET chapter_number=?, world_date=?, relative_day=?, location_id=?, summary=?, participants=?, dependencies=? WHERE id=?",
        [nullIfUndefined(input.chapter_number), nullIfUndefined(input.world_date),
         nullIfUndefined(input.relative_day), nullIfUndefined(input.location_id),
         input.summary, nullIfUndefined(input.participants), nullIfUndefined(input.dependencies), id],
      );
    } else {
      webDb.run(
        `INSERT INTO timeline_nodes (id, project_id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, nullIfUndefined(input.chapter_number), nullIfUndefined(input.world_date),
         nullIfUndefined(input.relative_day), nullIfUndefined(input.location_id),
         input.summary, nullIfUndefined(input.participants), nullIfUndefined(input.dependencies)],
      );
    }
    return webDb.get<TimelineNodeInfo>(
      "SELECT id, chapter_number, world_date, relative_day, location_id, summary, participants, dependencies FROM timeline_nodes WHERE id = ?",
      [id],
    )!;
  },

  async listForeshadowItems(status?: string): Promise<ForeshadowItemInfo[]> {
    if (status) {
      return webDb.all<ForeshadowItemInfo>(
        "SELECT id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes FROM foreshadow_items WHERE status = ? ORDER BY seed_chapter",
        [status],
      );
    }
    return webDb.all<ForeshadowItemInfo>(
      "SELECT id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes FROM foreshadow_items ORDER BY seed_chapter",
    );
  },

  async upsertForeshadowItem(input: {
    id?: string; seed_chapter: number; expected_volume_id?: string; title: string;
    maturity_condition?: string; payoff_type?: string; status?: string;
    resolved_chapter?: number; importance?: number; notes?: string;
  }): Promise<ForeshadowItemInfo> {
    const projectId = requireProjectId();
    const id = input.id ?? uuid();
    const existing = webDb.get<{ id: string }>("SELECT id FROM foreshadow_items WHERE id = ?", [id]);

    if (existing) {
      webDb.run(
        "UPDATE foreshadow_items SET title=?, maturity_condition=?, payoff_type=?, status=?, resolved_chapter=?, importance=?, notes=? WHERE id=?",
        [input.title, nullIfUndefined(input.maturity_condition), nullIfUndefined(input.payoff_type),
         input.status ?? "planted", nullIfUndefined(input.resolved_chapter),
         nullIfUndefined(input.importance), nullIfUndefined(input.notes), id],
      );
    } else {
      webDb.run(
        `INSERT INTO foreshadow_items (id, project_id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, input.seed_chapter, nullIfUndefined(input.expected_volume_id),
         input.title, nullIfUndefined(input.maturity_condition), nullIfUndefined(input.payoff_type),
         input.status ?? "planted", nullIfUndefined(input.resolved_chapter),
         nullIfUndefined(input.importance), nullIfUndefined(input.notes)],
      );
    }
    return webDb.get<ForeshadowItemInfo>(
      "SELECT id, seed_chapter, expected_volume_id, title, maturity_condition, payoff_type, status, resolved_chapter, importance, notes FROM foreshadow_items WHERE id = ?",
      [id],
    )!;
  },

  async listAbilityItems(ownerId?: string): Promise<AbilityItemInfo[]> {
    if (ownerId) {
      return webDb.all<AbilityItemInfo>(
        "SELECT id, item_type, name, owner_character_id, source_rule_id, cost_rule, cooldown_rule, limit_rule, status FROM ability_items WHERE owner_character_id = ? ORDER BY name",
        [ownerId],
      );
    }
    return webDb.all<AbilityItemInfo>(
      "SELECT id, item_type, name, owner_character_id, source_rule_id, cost_rule, cooldown_rule, limit_rule, status FROM ability_items ORDER BY item_type, name",
    );
  },

  async upsertAbilityItem(input: {
    id?: string; item_type: string; name: string; owner_character_id?: string;
    source_rule_id?: string; cost_rule?: string; cooldown_rule?: string;
    limit_rule?: string; status?: string;
  }): Promise<AbilityItemInfo> {
    const projectId = requireProjectId();
    const id = input.id ?? uuid();
    const existing = webDb.get<{ id: string }>("SELECT id FROM ability_items WHERE id = ?", [id]);

    if (existing) {
      webDb.run(
        "UPDATE ability_items SET name=?, owner_character_id=?, source_rule_id=?, cost_rule=?, cooldown_rule=?, limit_rule=?, status=? WHERE id=?",
        [input.name, nullIfUndefined(input.owner_character_id), nullIfUndefined(input.source_rule_id),
         nullIfUndefined(input.cost_rule), nullIfUndefined(input.cooldown_rule),
         nullIfUndefined(input.limit_rule), input.status ?? "active", id],
      );
    } else {
      webDb.run(
        `INSERT INTO ability_items (id, project_id, item_type, name, owner_character_id, source_rule_id, cost_rule, cooldown_rule, limit_rule, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, projectId, input.item_type, input.name, nullIfUndefined(input.owner_character_id),
         nullIfUndefined(input.source_rule_id), nullIfUndefined(input.cost_rule),
         nullIfUndefined(input.cooldown_rule), nullIfUndefined(input.limit_rule),
         input.status ?? "active"],
      );
    }
    return webDb.get<AbilityItemInfo>(
      "SELECT id, item_type, name, owner_character_id, source_rule_id, cost_rule, cooldown_rule, limit_rule, status FROM ability_items WHERE id = ?",
      [id],
    )!;
  },

  async listNotifications(unreadOnly?: boolean): Promise<NotificationInfo[]> {
    if (unreadOnly) {
      const rows = webDb.all<{
        id: string; type: string; severity: string; message: string;
        related_entity_type: string | null; is_read: number; created_at: string;
      }>(
        "SELECT id, type, severity, message, related_entity_type, is_read, created_at FROM notifications WHERE is_read = 0 ORDER BY created_at DESC LIMIT 50",
      );
      return rows.map((r) => ({ ...r, notif_type: r.type, related_entity: r.related_entity_type, read_status: intToBool(r.is_read) }));
    }
    const rows = webDb.all<{
      id: string; type: string; severity: string; message: string;
      related_entity_type: string | null; is_read: number; created_at: string;
    }>(
      "SELECT id, type, severity, message, related_entity_type, is_read, created_at FROM notifications ORDER BY created_at DESC LIMIT 50",
    );
    return rows.map((r) => ({ ...r, notif_type: r.type, related_entity: r.related_entity_type, read_status: intToBool(r.is_read) }));
  },

  async markNotificationRead(id: string): Promise<void> {
    webDb.run("UPDATE notifications SET is_read = 1 WHERE id = ?", [id]);
  },

  async getUnreadCount(): Promise<{ total: number; by_type: Record<string, number> }> {
    const types = ["compiler", "review", "pipeline", "system"];
    let total = 0;
    const by_type: Record<string, number> = {};
    for (const type of types) {
      const row = webDb.get<{ c: number }>(
        "SELECT COUNT(*) as c FROM notifications WHERE is_read = 0 AND type = ?",
        [type],
      );
      const count = row?.c ?? 0;
      by_type[type] = count;
      total += count;
    }
    return { total, by_type };
  },

  async getSummary(): Promise<LedgerSummary> {
    const count = (table: string, where?: string) => {
      const sql = where ? `SELECT COUNT(*) as c FROM ${table} WHERE ${where}` : `SELECT COUNT(*) as c FROM ${table}`;
      return webDb.get<{ c: number }>(sql)?.c ?? 0;
    };
    return {
      character_states_count: count("character_states"),
      relationship_states_count: count("relationship_states"),
      timeline_nodes_count: count("timeline_nodes"),
      event_nodes_count: count("event_nodes"),
      foreshadow_items_count: count("foreshadow_items"),
      foreshadow_planted_count: count("foreshadow_items", "status = 'planted'"),
      foreshadow_resolved_count: count("foreshadow_items", "status = 'resolved'"),
      foreshadow_overdue_count: count("foreshadow_items", "status = 'overdue'"),
      ability_items_count: count("ability_items"),
    };
  },
};

// ─── Backup ───

export const backupApi = {
  async create(): Promise<BackupInfo> {
    throw new WebNotSupportedError("backup");
  },
  async list(): Promise<BackupInfo[]> {
    throw new WebNotSupportedError("backup");
  },
  async restore(_backupPath: string): Promise<void> {
    throw new WebNotSupportedError("backup restore");
  },
};

// ─── Retcon ───

export const retconApi = {
  async list(status?: string): Promise<RetconRequestInfo[]> {
    const rows = webDb.all<{
      id: string; project_id: string; request_type: string; target_type: string;
      target_ref: string; reason: string; impact_summary: string | null;
      risk_level: string | null; strategy: string | null; status: string;
      created_at: string; updated_at: string; scheme: string | null;
      approved_at: string | null; rejection_reason: string | null;
    }>(
      "SELECT id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at, scheme, approved_at, rejection_reason FROM retcon_requests ORDER BY created_at DESC",
    );
    let filtered = rows;
    if (status) filtered = rows.filter((r) => r.status === status);
    return filtered.map((r) => ({
      id: r.id, target_type: r.target_type, target_ref: r.target_ref,
      reason: r.reason, status: r.status, rejection_reason: r.rejection_reason,
      selected_scheme_id: r.scheme, created_at: r.created_at, updated_at: r.updated_at,
    }));
  },

  async create(input: { target_type: string; target_ref: string; reason: string }): Promise<RetconRequestInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    webDb.run(
      `INSERT INTO retcon_requests (id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at)
       VALUES (?, ?, 'correction', ?, ?, ?, NULL, NULL, NULL, 'pending', ?, ?)`,
      [id, projectId, input.target_type, input.target_ref, input.reason, ts, ts],
    );
    return {
      id, target_type: input.target_type, target_ref: input.target_ref,
      reason: input.reason, status: "pending", rejection_reason: null,
      selected_scheme_id: null, created_at: ts, updated_at: ts,
    };
  },

  async approve(id: string): Promise<RetconRequestInfo> {
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, id],
    );
    const row = webDb.get<{
      id: string; target_type: string; target_ref: string; reason: string;
      status: string; scheme: string | null; approved_at: string | null;
      rejection_reason: string | null; created_at: string; updated_at: string;
    }>(
      "SELECT id, target_type, target_ref, reason, status, scheme, approved_at, rejection_reason, created_at, updated_at FROM retcon_requests WHERE id = ?",
      [id],
    );
    return {
      id: row!.id, target_type: row!.target_type, target_ref: row!.target_ref,
      reason: row!.reason, status: row!.status, rejection_reason: row!.rejection_reason,
      selected_scheme_id: row!.scheme, created_at: row!.created_at, updated_at: row!.updated_at,
    };
  },

  async reject(id: string, reason: string): Promise<RetconRequestInfo> {
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?",
      [reason, ts, id],
    );
    const row = webDb.get<{
      id: string; target_type: string; target_ref: string; reason: string;
      status: string; scheme: string | null; rejection_reason: string | null;
      created_at: string; updated_at: string;
    }>(
      "SELECT id, target_type, target_ref, reason, status, scheme, rejection_reason, created_at, updated_at FROM retcon_requests WHERE id = ?",
      [id],
    );
    return {
      id: row!.id, target_type: row!.target_type, target_ref: row!.target_ref,
      reason: row!.reason, status: row!.status, rejection_reason: row!.rejection_reason,
      selected_scheme_id: row!.scheme, created_at: row!.created_at, updated_at: row!.updated_at,
    };
  },

  async getImpact(_id: string): Promise<RetconImpactInfo> {
    throw new WebNotSupportedError("retcon impact analysis (requires AI agent)");
  },

  async applyScheme(id: string, schemeId: string): Promise<RetconRequestInfo> {
    const ts = now();
    webDb.run("UPDATE retcon_requests SET scheme = ?, updated_at = ? WHERE id = ?", [schemeId, ts, id]);
    const row = webDb.get<{
      id: string; target_type: string; target_ref: string; reason: string;
      status: string; scheme: string | null; rejection_reason: string | null;
      created_at: string; updated_at: string;
    }>(
      "SELECT id, target_type, target_ref, reason, status, scheme, rejection_reason, created_at, updated_at FROM retcon_requests WHERE id = ?",
      [id],
    );
    return {
      id: row!.id, target_type: row!.target_type, target_ref: row!.target_ref,
      reason: row!.reason, status: row!.status, rejection_reason: row!.rejection_reason,
      selected_scheme_id: row!.scheme, created_at: row!.created_at, updated_at: row!.updated_at,
    };
  },

  async execute(_id: string): Promise<RetconExecutionResult> {
    throw new WebNotSupportedError("retcon execution (requires AI agent)");
  },

  async getExecutionStatus(_id: string): Promise<RetconExecutionResult> {
    throw new WebNotSupportedError("retcon execution status");
  },

  async startWorkflow(targetType: string, targetRef: string, reason: string): Promise<RetconWorkflowState> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    webDb.run(
      `INSERT INTO retcon_requests (id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at)
       VALUES (?, ?, 'correction', ?, ?, ?, NULL, NULL, NULL, 'analyzing', ?, ?)`,
      [id, projectId, targetType, targetRef, reason, ts, ts],
    );
    return {
      retcon_id: id,
      current_step: "analyze_impact",
      steps_completed: ["create_request"],
      impact_report: null,
      hard_rule_violation: false,
      hard_rule_details: null,
      selected_scheme: null,
      execution_plan: null,
      post_check_result: null,
      snapshot_result: null,
      warnings: ["Web mode: AI-powered analysis not available. Manual review required."],
    };
  },

  async continueWorkflow(retconId: string, schemeType: string, confirm: boolean): Promise<RetconWorkflowState> {
    if (!confirm) {
      return {
        retcon_id: retconId, current_step: "aborted", steps_completed: ["create_request"],
        impact_report: null, hard_rule_violation: false, hard_rule_details: null,
        selected_scheme: null, execution_plan: null, post_check_result: null, snapshot_result: null,
        warnings: ["Workflow aborted by user."],
      };
    }
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET scheme = ?, status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?",
      [schemeType, ts, ts, retconId],
    );
    return {
      retcon_id: retconId,
      current_step: "execute",
      steps_completed: ["create_request", "analyze_impact", "check_hard_rules", "select_scheme", "approve"],
      impact_report: null, hard_rule_violation: false, hard_rule_details: null,
      selected_scheme: schemeType,
      execution_plan: { retcon_id: retconId, status: "pending", affected_chapters: [], estimated_duration_seconds: 0 },
      post_check_result: null, snapshot_result: null,
      warnings: ["Web mode: execution requires backend service."],
    };
  },

  async completeWorkflow(retconId: string): Promise<RetconWorkflowState> {
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET status = 'completed', updated_at = ? WHERE id = ?",
      [ts, retconId],
    );
    return {
      retcon_id: retconId, current_step: "completed",
      steps_completed: ["create_request", "analyze_impact", "check_hard_rules", "select_scheme", "approve", "execute", "post_check", "update_snapshots"],
      impact_report: null, hard_rule_violation: false, hard_rule_details: null,
      selected_scheme: null,
      execution_plan: { retcon_id: retconId, status: "completed", affected_chapters: [], estimated_duration_seconds: 0 },
      post_check_result: { passed_count: 0, failed_count: 0, needs_attention: [] },
      snapshot_result: { retcon_id: retconId, snapshots_regenerated: 0, chapter_numbers: [] },
      warnings: [],
    };
  },

  async rollback(retconId: string, _reason: string): Promise<RetconWorkflowState> {
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET status = 'rolled_back', updated_at = ? WHERE id = ?",
      [ts, retconId],
    );
    return {
      retcon_id: retconId, current_step: "rolled_back",
      steps_completed: ["create_request"],
      impact_report: null, hard_rule_violation: false, hard_rule_details: null,
      selected_scheme: null, execution_plan: null, post_check_result: null, snapshot_result: null,
      warnings: [],
    };
  },
};

// ─── Task Manager (in-memory, matching Rust's Mutex<HashMap>) ───

const taskRegistry = new Map<string, BackgroundTask>();

export const taskApi = {
  async listProjectTasks(projectId: string): Promise<BackgroundTask[]> {
    return Array.from(taskRegistry.values()).filter((t) => t.project_id === projectId);
  },

  async cancelTask(taskId: string): Promise<void> {
    const task = taskRegistry.get(taskId);
    if (task) {
      task.status = "cancelled";
      task.updated_at = now();
    }
  },

  async pauseTask(taskId: string): Promise<void> {
    const task = taskRegistry.get(taskId);
    if (task) {
      task.status = "paused";
      task.updated_at = now();
    }
  },

  async resumeTask(taskId: string): Promise<void> {
    const task = taskRegistry.get(taskId);
    if (task) {
      task.status = "running";
      task.updated_at = now();
    }
  },
};

// ─── Shared Resources (global) ───

export const sharedResourcesApi = {
  async listStyleProfiles(): Promise<StyleProfileInfo[]> {
    await webDb.initGlobal();
    const rows = webDb.all<{
      id: string; name: string; metrics: string; preferred_patterns: string;
      anti_ai_features: string; sample_paragraphs: string; banned_patterns: string;
      is_builtin: number; created_at: string; updated_at: string;
    }>(
      "SELECT id, name, metrics, preferred_patterns, anti_ai_features, sample_paragraphs, banned_patterns, is_builtin, created_at, updated_at FROM style_profiles ORDER BY name",
      [],
      "global",
    );
    return rows.map((r) => ({ ...r, is_builtin: intToBool(r.is_builtin) }));
  },

  async listWritingPatterns(sourceType?: string): Promise<WritingPatternInfo[]> {
    await webDb.initGlobal();
    if (sourceType) {
      return webDb.all<WritingPatternInfo>(
        "SELECT id, source_type, source_ref, pattern_name, genre_compat, description, usage_guide, sample_text, created_at FROM writing_patterns WHERE source_type = ? ORDER BY pattern_name",
        [sourceType],
        "global",
      );
    }
    return webDb.all<WritingPatternInfo>(
      "SELECT id, source_type, source_ref, pattern_name, genre_compat, description, usage_guide, sample_text, created_at FROM writing_patterns ORDER BY pattern_name",
      [],
      "global",
    );
  },

  async applyGenreTemplate(templateId: string): Promise<void> {
    await webDb.initGlobal();
    const template = webDb.get<GenreTemplateInfo>(
      "SELECT id, genre_id, genre_name, world_framework, volume_rhythm, character_archetypes, thrill_params, taboo_rules, naming_style, naming_examples FROM genre_templates WHERE id = ?",
      [templateId],
      "global",
    );
    if (!template) throw new Error(`Genre template ${templateId} not found`);
    const projectId = requireProjectId();
    const ts = now();
    webDb.run(
      "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?, ?, 'genre_template', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
      [uuid(), projectId, JSON.stringify(template), ts, JSON.stringify(template), ts],
    );
  },

  async applyStyleProfile(profileId: string): Promise<void> {
    await webDb.initGlobal();
    const profile = webDb.get<StyleProfileInfo>(
      "SELECT id, name, metrics, preferred_patterns, anti_ai_features, sample_paragraphs, banned_patterns, is_builtin, created_at, updated_at FROM style_profiles WHERE id = ?",
      [profileId],
      "global",
    );
    if (!profile) throw new Error(`Style profile ${profileId} not found`);
    const projectId = requireProjectId();
    const ts = now();
    webDb.run(
      "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?, ?, 'style_profile', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
      [uuid(), projectId, JSON.stringify(profile), ts, JSON.stringify(profile), ts],
    );
  },

  async importDeAiRules(ruleIds: string[]): Promise<number> {
    await webDb.initGlobal();
    const projectId = requireProjectId();
    const ts = now();
    let imported = 0;
    for (const ruleId of ruleIds) {
      const rule = webDb.get<DeAiRuleInfo>(
        "SELECT id, category, pattern, replacement, severity, is_enabled, description, created_at FROM de_ai_rules WHERE id = ?",
        [ruleId],
        "global",
      );
      if (rule) {
        webDb.run(
          "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
          [uuid(), projectId, `deai_rule_${ruleId}`, JSON.stringify(rule), ts, JSON.stringify(rule), ts],
        );
        imported++;
      }
    }
    return imported;
  },

  async listGlobalResources(): Promise<GlobalResourcesOverview> {
    await webDb.initGlobal();
    const genreTemplates = webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM genre_templates", [], "global")?.c ?? 0;
    const styleProfiles = webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM style_profiles", [], "global")?.c ?? 0;
    const deAiRules = webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM de_ai_rules", [], "global")?.c ?? 0;
    const soulTemplates = webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM soul_templates", [], "global")?.c ?? 0;
    const writingPatterns = webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM writing_patterns", [], "global")?.c ?? 0;
    const bannedNames = webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM banned_names", [], "global")?.c ?? 0;
    const bannedTitles = webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM banned_titles", [], "global")?.c ?? 0;
    return {
      genre_templates: genreTemplates,
      style_profiles: styleProfiles,
      de_ai_rules: deAiRules,
      soul_templates: soulTemplates,
      writing_patterns: writingPatterns,
      banned_names: bannedNames,
      banned_titles: bannedTitles,
    };
  },

  async getEditorPrefs(): Promise<EditorPrefs> {
    const projectId = webDb.getProjectId();
    if (!projectId) return {};
    const row = webDb.get<{ value: string }>(
      "SELECT value FROM project_settings WHERE project_id = ? AND key = 'editor_prefs'",
      [projectId],
    );
    if (row) return JSON.parse(row.value);
    return {};
  },

  async setEditorPrefs(prefs: EditorPrefs): Promise<void> {
    const projectId = requireProjectId();
    const ts = now();
    const json = JSON.stringify(prefs);
    webDb.run(
      "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?, ?, 'editor_prefs', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
      [uuid(), projectId, json, ts, json, ts],
    );
  },
};

// ─── Snapshot ───

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

// ─── De-AI Rules (global) ───

export const deAiRulesApi = {
  async list(): Promise<DeAiRuleInfo[]> {
    await webDb.initGlobal();
    const rows = webDb.all<{
      id: string; category: string; pattern: string; replacement: string | null;
      severity: string; is_enabled: number; description: string | null; created_at: string;
    }>(
      "SELECT id, category, pattern, replacement, severity, is_enabled, description, created_at FROM de_ai_rules ORDER BY category, severity",
      [],
      "global",
    );
    return rows.map((r) => ({ ...r, is_enabled: intToBool(r.is_enabled) }));
  },

  async upsert(input: {
    id?: string; category: string; pattern: string; replacement?: string;
    severity?: string; is_enabled?: boolean; description?: string;
  }): Promise<DeAiRuleInfo> {
    await webDb.initGlobal();
    const id = input.id ?? uuid();
    const enabled = boolToInt(input.is_enabled ?? true);
    const ts = now();
    const existing = webDb.get<{ id: string }>("SELECT id FROM de_ai_rules WHERE id = ?", [id], "global");

    if (existing) {
      webDb.run(
        "UPDATE de_ai_rules SET category=?, pattern=?, replacement=?, severity=?, is_enabled=?, description=? WHERE id=?",
        [input.category, input.pattern, nullIfUndefined(input.replacement), input.severity ?? "medium",
         enabled, nullIfUndefined(input.description), id],
        "global",
      );
    } else {
      webDb.run(
        "INSERT INTO de_ai_rules (id, category, pattern, replacement, severity, is_enabled, description, created_at) VALUES (?,?,?,?,?,?,?,?)",
        [id, input.category, input.pattern, nullIfUndefined(input.replacement),
         input.severity ?? "medium", enabled, nullIfUndefined(input.description), ts],
        "global",
      );
    }
    const row = webDb.get<{
      id: string; category: string; pattern: string; replacement: string | null;
      severity: string; is_enabled: number; description: string | null; created_at: string;
    }>("SELECT id, category, pattern, replacement, severity, is_enabled, description, created_at FROM de_ai_rules WHERE id = ?", [id], "global");
    return { ...row!, is_enabled: intToBool(row!.is_enabled) };
  },

  async delete(id: string): Promise<void> {
    await webDb.initGlobal();
    webDb.run("DELETE FROM de_ai_rules WHERE id = ?", [id], "global");
  },
};

// ─── Templates (global) ───

export const templateApi = {
  async listSoulTemplates(category?: string): Promise<SoulTemplateInfo[]> {
    await webDb.initGlobal();
    if (category) {
      const rows = webDb.all<{
        id: string; soul_name: string; category: string; genre_compat: string | null;
        personality_json: string; speech_json: string; behavior_json: string;
        relationships_json: string | null; is_builtin: number; created_at: string;
      }>(
        "SELECT id, soul_name, category, genre_compat, personality_json, speech_json, behavior_json, relationships_json, is_builtin, created_at FROM soul_templates WHERE category = ? ORDER BY soul_name",
        [category],
        "global",
      );
      return rows.map((r) => ({ ...r, is_builtin: intToBool(r.is_builtin) }));
    }
    const rows = webDb.all<{
      id: string; soul_name: string; category: string; genre_compat: string | null;
      personality_json: string; speech_json: string; behavior_json: string;
      relationships_json: string | null; is_builtin: number; created_at: string;
    }>(
      "SELECT id, soul_name, category, genre_compat, personality_json, speech_json, behavior_json, relationships_json, is_builtin, created_at FROM soul_templates ORDER BY category, soul_name",
      [],
      "global",
    );
    return rows.map((r) => ({ ...r, is_builtin: intToBool(r.is_builtin) }));
  },

  async listGenreTemplates(): Promise<GenreTemplateInfo[]> {
    await webDb.initGlobal();
    return webDb.all<GenreTemplateInfo>(
      "SELECT id, genre_id, genre_name, world_framework, volume_rhythm, character_archetypes, thrill_params, taboo_rules, naming_style, naming_examples FROM genre_templates ORDER BY genre_name",
      [],
      "global",
    );
  },
};

// ─── LLM ───

let memoryLlmConfig: LlmConfig | null = null;

export const llmApi = {
  async getConfig(): Promise<LlmConfig> {
    if (!memoryLlmConfig) {
      await webDb.initGlobal();
      const row = webDb.get<{ value: string }>(
        "SELECT value FROM global_settings WHERE key = 'llm_config'", [], "global",
      );
      if (row) {
        memoryLlmConfig = JSON.parse(row.value);
      } else {
        memoryLlmConfig = {
          provider: "openai", base_url: "", api_key: "", model: "",
          max_tokens: 4096, temperature: 0.7,
        };
      }
    }
    return memoryLlmConfig!;
  },

  async updateConfig(
    provider?: string, baseUrl?: string, apiKey?: string, model?: string,
    maxTokens?: number, temperature?: number,
  ): Promise<LlmConfig> {
    const config = await llmApi.getConfig();
    if (provider !== undefined) config.provider = provider;
    if (baseUrl !== undefined) config.base_url = baseUrl;
    if (apiKey !== undefined) config.api_key = apiKey;
    if (model !== undefined) config.model = model;
    if (maxTokens !== undefined) config.max_tokens = maxTokens;
    if (temperature !== undefined) config.temperature = temperature;
    memoryLlmConfig = config;
    return config;
  },

  async chat(_messages: ChatMessage[]): Promise<ChatResponse> {
    throw new WebNotSupportedError("chat completion (requires backend LLM service)");
  },
  async chatWithSystem(_systemPrompt: string, _userPrompt: string): Promise<ChatResponse> {
    throw new WebNotSupportedError("chat with system prompt (requires backend LLM service)");
  },
  async chatStream(_messages: ChatMessage[], _requestId: string): Promise<void> {
    throw new WebNotSupportedError("chat streaming (requires backend LLM service)");
  },

  async saveConfigToDb(config: LlmConfig): Promise<void> {
    await webDb.initGlobal();
    const ts = now();
    webDb.run(
      "INSERT INTO global_settings (key, value, updated_at) VALUES ('llm_config', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
      [JSON.stringify(config), ts, JSON.stringify(config), ts],
      "global",
    );
    memoryLlmConfig = config;
  },

  async loadConfigFromDb(): Promise<LlmConfig | null> {
    await webDb.initGlobal();
    const row = webDb.get<{ value: string }>(
      "SELECT value FROM global_settings WHERE key = 'llm_config'", [], "global",
    );
    if (row) {
      memoryLlmConfig = JSON.parse(row.value);
      return memoryLlmConfig;
    }
    return null;
  },

  async getTokenUsage(): Promise<TokenUsageSummary> {
    return {
      total_calls: 0, total_prompt_tokens: 0, total_completion_tokens: 0,
      total_tokens: 0, total_cost_estimate_usd: 0, by_agent: [], by_model: [],
    };
  },
};

// ─── Agent ───

const STATIC_AGENT_LIST: AgentInfo[] = [
  { name: "architect", description: "大纲规划Agent" },
  { name: "writer", description: "章节写作Agent" },
  { name: "compiler", description: "编译检查Agent" },
  { name: "reviewer", description: "审稿Agent" },
  { name: "retcon_analyst", description: "修史分析Agent" },
];

export const agentApi = {
  async list(): Promise<AgentInfo[]> {
    return STATIC_AGENT_LIST;
  },

  async run(_agentName: string, _variables: Record<string, string>): Promise<AgentRunResult> {
    throw new WebNotSupportedError("agent execution (requires backend LLM service)");
  },

  async listLogs(agentName?: string, limit?: number): Promise<AgentLogEntry[]> {
    const lmt = limit ?? 50;
    if (agentName) {
      return webDb.all<AgentLogEntry>(
        "SELECT id, agent_name, input_summary, output_summary, status, duration_ms, token_usage, error_message, created_at FROM agent_execution_logs WHERE agent_name = ? ORDER BY created_at DESC LIMIT ?",
        [agentName, lmt],
      );
    }
    return webDb.all<AgentLogEntry>(
      "SELECT id, agent_name, input_summary, output_summary, status, duration_ms, token_usage, error_message, created_at FROM agent_execution_logs ORDER BY created_at DESC LIMIT ?",
      [lmt],
    );
  },
};

// ─── Orchestrator ───

export const orchestratorApi = {
  async runPipeline(_chapterNumber: number): Promise<PipelineResult> {
    throw new WebNotSupportedError("pipeline execution (requires backend LLM service)");
  },
  async runBatchPipeline(_startChapter: number, _endChapter: number): Promise<PipelineResult[]> {
    throw new WebNotSupportedError("batch pipeline execution (requires backend LLM service)");
  },
};

// ─── World ───

export const worldApi = {
  async listLocations(): Promise<LocationInfo[]> {
    const projectId = webDb.getProjectId();
    if (!projectId) return [];
    return webDb.all<LocationInfo>(
      "SELECT id, name, location_type, owner_faction_id, danger_level, status, description FROM locations WHERE project_id = ? ORDER BY name",
      [projectId],
    );
  },
  async createLocation(input: { name: string; location_type?: string; owner_faction_id?: string; danger_level?: number; status?: string; description?: string }): Promise<LocationInfo> {
    const projectId = requireProjectId();
    const id = uuid();
    webDb.run(
      "INSERT INTO locations (id, project_id, name, location_type, owner_faction_id, danger_level, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, projectId, input.name, nullIfUndefined(input.location_type), nullIfUndefined(input.owner_faction_id), input.danger_level ?? null, nullIfUndefined(input.status), nullIfUndefined(input.description)],
    );
    return { id, name: input.name, location_type: input.location_type, owner_faction_id: input.owner_faction_id, danger_level: input.danger_level, status: input.status, description: input.description };
  },
  async updateLocation(input: { id: string; name?: string; location_type?: string; owner_faction_id?: string; danger_level?: number; status?: string; description?: string }): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.name !== undefined) { sets.push("name = ?"); vals.push(input.name); }
    if (input.location_type !== undefined) { sets.push("location_type = ?"); vals.push(input.location_type); }
    if (input.owner_faction_id !== undefined) { sets.push("owner_faction_id = ?"); vals.push(input.owner_faction_id); }
    if (input.danger_level !== undefined) { sets.push("danger_level = ?"); vals.push(input.danger_level); }
    if (input.status !== undefined) { sets.push("status = ?"); vals.push(input.status); }
    if (input.description !== undefined) { sets.push("description = ?"); vals.push(input.description); }
    if (sets.length === 0) return;
    vals.push(input.id);
    webDb.run(`UPDATE locations SET ${sets.join(", ")} WHERE id = ?`, vals);
  },
  async deleteLocation(id: string): Promise<void> {
    webDb.run("DELETE FROM locations WHERE id = ?", [id]);
  },
  async listFactions(): Promise<FactionInfo[]> {
    const projectId = webDb.getProjectId();
    if (!projectId) return [];
    return webDb.all<FactionInfo>(
      "SELECT id, name, faction_type, goal, resource_summary, status FROM factions WHERE project_id = ? ORDER BY name",
      [projectId],
    );
  },
  async createFaction(input: { name: string; faction_type?: string; goal?: string; resource_summary?: string; status?: string }): Promise<FactionInfo> {
    const projectId = requireProjectId();
    const id = uuid();
    webDb.run(
      "INSERT INTO factions (id, project_id, name, faction_type, goal, resource_summary, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, projectId, input.name, nullIfUndefined(input.faction_type), nullIfUndefined(input.goal), nullIfUndefined(input.resource_summary), nullIfUndefined(input.status)],
    );
    return { id, name: input.name, faction_type: input.faction_type, goal: input.goal, resource_summary: input.resource_summary, status: input.status };
  },
  async updateFaction(input: { id: string; name?: string; faction_type?: string; goal?: string; resource_summary?: string; status?: string }): Promise<void> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (input.name !== undefined) { sets.push("name = ?"); vals.push(input.name); }
    if (input.faction_type !== undefined) { sets.push("faction_type = ?"); vals.push(input.faction_type); }
    if (input.goal !== undefined) { sets.push("goal = ?"); vals.push(input.goal); }
    if (input.resource_summary !== undefined) { sets.push("resource_summary = ?"); vals.push(input.resource_summary); }
    if (input.status !== undefined) { sets.push("status = ?"); vals.push(input.status); }
    if (sets.length === 0) return;
    vals.push(input.id);
    webDb.run(`UPDATE factions SET ${sets.join(", ")} WHERE id = ?`, vals);
  },
  async deleteFaction(id: string): Promise<void> {
    webDb.run("DELETE FROM factions WHERE id = ?", [id]);
  },
  async checkCollisions(query: string): Promise<CollisionItem[]> {
    await webDb.initGlobal();
    const pattern = `%${query}%`;
    const names = webDb.all<{ id: string; name: string; source_work: string | null; ban_level: string }>(
      "SELECT id, name, source_work, ban_level FROM banned_names WHERE name LIKE ?",
      [pattern],
      "global",
    );
    const titles = webDb.all<{ id: string; title: string; source_platform: string | null; ban_level: string }>(
      "SELECT id, title, source_platform, ban_level FROM banned_book_titles WHERE title LIKE ?",
      [pattern],
      "global",
    );
    const results: CollisionItem[] = [];
    for (const n of names) {
      results.push({
        id: n.id, item_type: "name", text: n.name,
        reason: n.source_work ?? "", severity: n.ban_level === "hard_ban" ? "high" : "medium",
      });
    }
    for (const t of titles) {
      results.push({
        id: t.id, item_type: "title", text: t.title,
        reason: t.source_platform ?? "", severity: t.ban_level === "hard_ban" ? "high" : "medium",
      });
    }
    return results;
  },
};

// ─── Writing Sessions ───

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
  async startSession(input: { chapter_id?: string; start_word_count: number }): Promise<import("./tauri").WritingSessionInfo> {
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
  async endSession(input: { session_id: string; end_word_count: number }): Promise<import("./tauri").WritingSessionInfo> {
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
  async listSessions(chapter_id?: string): Promise<import("./tauri").WritingSessionInfo[]> {
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
