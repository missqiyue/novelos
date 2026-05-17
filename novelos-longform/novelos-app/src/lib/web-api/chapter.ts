import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  ChapterTaskInfo,
  ChapterInfo,
  ChapterVersionInfo,
  ChapterSearchResult,
  RecalledContext,
  CharacterInfo,
} from "../tauri";

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

  async updateDraft(chapterNumber: number, draftText: string, skipVersion?: boolean): Promise<ChapterInfo> {
    const ts = now();
    const wordCount = draftText.length;
    webDb.run(
      "UPDATE chapters SET draft_text = ?, word_count = ?, status = 'drafting', updated_at = ? WHERE chapter_number = ?",
      [draftText, wordCount, ts, chapterNumber],
    );
    // Insert chapter version only for manual saves
    if (!skipVersion) {
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
    identityCore?: string, personaCore?: string, coreMotivation?: string, tabooRules?: string,
  ): Promise<void> {
    const ts = now();
    if (name !== undefined) webDb.run("UPDATE characters SET name = ?, updated_at = ? WHERE id = ?", [name, ts, id]);
    if (soulJson !== undefined) webDb.run("UPDATE characters SET soul_json = ?, updated_at = ? WHERE id = ?", [soulJson, ts, id]);
    if (roleType !== undefined) webDb.run("UPDATE characters SET role_type = ?, updated_at = ? WHERE id = ?", [roleType, ts, id]);
    if (identityCore !== undefined) webDb.run("UPDATE characters SET identity_core = ?, updated_at = ? WHERE id = ?", [identityCore, ts, id]);
    if (personaCore !== undefined) webDb.run("UPDATE characters SET persona_core = ?, updated_at = ? WHERE id = ?", [personaCore, ts, id]);
    if (coreMotivation !== undefined) webDb.run("UPDATE characters SET core_motivation = ?, updated_at = ? WHERE id = ?", [coreMotivation, ts, id]);
    if (tabooRules !== undefined) webDb.run("UPDATE characters SET taboo_rules = ?, updated_at = ? WHERE id = ?", [tabooRules, ts, id]);
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

  async saveTitle(chapterNumber: number, title: string): Promise<void> {
    webDb.run(
      "UPDATE chapters SET title = ?, updated_at = ? WHERE chapter_number = ?",
      [title, now(), chapterNumber],
    );
  },
};
