import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  DeAiRuleInfo,
  GenreTemplateInfo,
  StyleProfileInfo,
  WritingPatternInfo,
  UpsertWritingPatternInput,
  GlobalResourcesOverview,
  EditorPrefs,
} from "../tauri";

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

  async upsertWritingPattern(input: UpsertWritingPatternInput): Promise<WritingPatternInfo> {
    await webDb.initGlobal();
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = webDb.get<WritingPatternInfo>(
      "SELECT id FROM writing_patterns WHERE id = ?",
      [id],
      "global",
    );
    if (existing) {
      webDb.run(
        "UPDATE writing_patterns SET source_type=?, source_ref=?, pattern_name=?, genre_compat=?, description=?, usage_guide=?, sample_text=? WHERE id=?",
        [input.source_type, input.source_ref ?? null, input.pattern_name, input.genre_compat ?? null, input.description, input.usage_guide ?? null, input.sample_text ?? null, id],
        "global",
      );
    } else {
      webDb.run(
        "INSERT INTO writing_patterns (id, source_type, source_ref, pattern_name, genre_compat, description, usage_guide, sample_text, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [id, input.source_type, input.source_ref ?? null, input.pattern_name, input.genre_compat ?? null, input.description, input.usage_guide ?? null, input.sample_text ?? null, now],
        "global",
      );
    }
    const result = webDb.get<WritingPatternInfo>(
      "SELECT id, source_type, source_ref, pattern_name, genre_compat, description, usage_guide, sample_text, created_at FROM writing_patterns WHERE id = ?",
      [id],
      "global",
    );
    if (!result) throw new Error("Failed to read upserted writing pattern");
    return result;
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
