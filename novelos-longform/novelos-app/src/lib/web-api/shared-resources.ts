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
  DeAiRuleInfo,
  GenreTemplateInfo,
  StyleProfileInfo,
  WritingPatternInfo,
  UpsertWritingPatternInput,
  UpsertStyleProfileInput,
  UpsertGenreTemplateInput,
  GlobalResourcesOverview,
  EditorPrefs,
} from "../tauri";

export const sharedResourcesApi = {
  async listStyleProfiles(): Promise<StyleProfileInfo[]> {
    await webDb.initGlobal();
    const rows = webDb.all<{
      id: string;
      name: string;
      metrics: string;
      preferred_patterns: string;
      anti_ai_features: string;
      sample_paragraphs: string;
      banned_patterns: string;
      is_builtin: number;
      created_at: string;
      updated_at: string;
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
        [
          input.source_type,
          input.source_ref ?? null,
          input.pattern_name,
          input.genre_compat ?? null,
          input.description,
          input.usage_guide ?? null,
          input.sample_text ?? null,
          id,
        ],
        "global",
      );
    } else {
      webDb.run(
        "INSERT INTO writing_patterns (id, source_type, source_ref, pattern_name, genre_compat, description, usage_guide, sample_text, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          id,
          input.source_type,
          input.source_ref ?? null,
          input.pattern_name,
          input.genre_compat ?? null,
          input.description,
          input.usage_guide ?? null,
          input.sample_text ?? null,
          now,
        ],
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

  async upsertStyleProfile(input: UpsertStyleProfileInput): Promise<StyleProfileInfo> {
    await webDb.initGlobal();
    const id = input.id || crypto.randomUUID();
    const ts = now();
    const existing = webDb.get<{ id: string }>(
      "SELECT id FROM style_profiles WHERE id = ?",
      [id],
      "global",
    );
    if (existing) {
      webDb.run(
        "UPDATE style_profiles SET name=?, metrics=?, preferred_patterns=?, anti_ai_features=?, sample_paragraphs=?, banned_patterns=?, updated_at=? WHERE id=?",
        [
          input.name,
          input.metrics,
          input.preferred_patterns,
          input.anti_ai_features,
          input.sample_paragraphs,
          input.banned_patterns,
          ts,
          id,
        ],
        "global",
      );
    } else {
      webDb.run(
        "INSERT INTO style_profiles (id, name, metrics, preferred_patterns, anti_ai_features, sample_paragraphs, banned_patterns, is_builtin, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)",
        [
          id,
          input.name,
          input.metrics,
          input.preferred_patterns,
          input.anti_ai_features,
          input.sample_paragraphs,
          input.banned_patterns,
          ts,
          ts,
        ],
        "global",
      );
    }
    const row = webDb.get<any>(
      "SELECT id, name, metrics, preferred_patterns, anti_ai_features, sample_paragraphs, banned_patterns, is_builtin, created_at, updated_at FROM style_profiles WHERE id = ?",
      [id],
      "global",
    );
    if (!row) throw new Error("Failed to read upserted style profile");
    return { ...row, is_builtin: intToBool(row.is_builtin) };
  },

  async upsertGenreTemplate(input: UpsertGenreTemplateInput): Promise<GenreTemplateInfo> {
    await webDb.initGlobal();
    const id = input.id || crypto.randomUUID();
    const existing = webDb.get<{ id: string }>(
      "SELECT id FROM genre_templates WHERE id = ?",
      [id],
      "global",
    );
    if (existing) {
      webDb.run(
        "UPDATE genre_templates SET genre_id=?, genre_name=?, world_framework=?, volume_rhythm=?, character_archetypes=?, thrill_params=?, taboo_rules=?, naming_style=?, naming_examples=? WHERE id=?",
        [
          input.genre_id,
          input.genre_name,
          input.world_framework ?? null,
          input.volume_rhythm ?? null,
          input.character_archetypes ?? null,
          input.thrill_params ?? null,
          input.taboo_rules ?? null,
          input.naming_style ?? null,
          input.naming_examples ?? null,
          id,
        ],
        "global",
      );
    } else {
      webDb.run(
        "INSERT INTO genre_templates (id, genre_id, genre_name, world_framework, volume_rhythm, character_archetypes, thrill_params, taboo_rules, naming_style, naming_examples) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
          id,
          input.genre_id,
          input.genre_name,
          input.world_framework ?? null,
          input.volume_rhythm ?? null,
          input.character_archetypes ?? null,
          input.thrill_params ?? null,
          input.taboo_rules ?? null,
          input.naming_style ?? null,
          input.naming_examples ?? null,
        ],
        "global",
      );
    }
    const result = webDb.get<GenreTemplateInfo>(
      "SELECT id, genre_id, genre_name, world_framework, volume_rhythm, character_archetypes, thrill_params, taboo_rules, naming_style, naming_examples FROM genre_templates WHERE id = ?",
      [id],
      "global",
    );
    if (!result) throw new Error("Failed to read upserted genre template");
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
    const existing = webDb.get<{ id: string }>(
      "SELECT id FROM project_settings WHERE project_id = ? AND key = 'genre_template'",
      [projectId],
    );
    if (existing) {
      webDb.run("UPDATE project_settings SET value = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(template),
        ts,
        existing.id,
      ]);
    } else {
      webDb.run(
        "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?, ?, 'genre_template', ?, ?)",
        [uuid(), projectId, JSON.stringify(template), ts],
      );
    }
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
    const existing = webDb.get<{ id: string }>(
      "SELECT id FROM project_settings WHERE project_id = ? AND key = 'style_profile'",
      [projectId],
    );
    if (existing) {
      webDb.run("UPDATE project_settings SET value = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(profile),
        ts,
        existing.id,
      ]);
    } else {
      webDb.run(
        "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?, ?, 'style_profile', ?, ?)",
        [uuid(), projectId, JSON.stringify(profile), ts],
      );
    }
  },

  async importDeAiRules(ruleIds: string[]): Promise<number> {
    await webDb.initGlobal();
    const projectId = requireProjectId();
    const ts = now();
    const importedRules: DeAiRuleInfo[] = [];
    for (const ruleId of ruleIds) {
      const rule = webDb.get<DeAiRuleInfo>(
        "SELECT id, category, pattern, replacement, severity, is_enabled, description, created_at FROM de_ai_rules WHERE id = ?",
        [ruleId],
        "global",
      );
      if (rule) {
        importedRules.push(rule);
      }
    }
    const compact = importedRules.map((rule) => [
      rule.id,
      rule.category,
      rule.pattern,
      rule.replacement,
      rule.severity,
      rule.description,
    ]);
    const existing = webDb.get<{ id: string }>(
      "SELECT id FROM project_settings WHERE project_id = ? AND key = 'imported_deai_rules'",
      [projectId],
    );
    if (existing) {
      webDb.run("UPDATE project_settings SET value = ?, updated_at = ? WHERE id = ?", [
        JSON.stringify(compact),
        ts,
        existing.id,
      ]);
    } else {
      webDb.run(
        "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?, ?, 'imported_deai_rules', ?, ?)",
        [uuid(), projectId, JSON.stringify(compact), ts],
      );
    }
    return importedRules.length;
  },

  async listImportedDeAiRules(): Promise<string[]> {
    const projectId = requireProjectId();
    const row = webDb.get<{ value: string }>(
      "SELECT value FROM project_settings WHERE project_id = ? AND key = 'imported_deai_rules'",
      [projectId],
    );
    if (!row) return [];
    try {
      const parsed = JSON.parse(row.value) as Array<
        [string, string, string, string | null, string, string | null]
      >;
      return parsed.map((item) => item[0]);
    } catch {
      return [];
    }
  },

  async getEffectiveDeAiRules(): Promise<DeAiRuleInfo[]> {
    await webDb.initGlobal();
    const projectId = requireProjectId();
    const row = webDb.get<{ value: string }>(
      "SELECT value FROM project_settings WHERE project_id = ? AND key = 'imported_deai_rules'",
      [projectId],
    );
    if (row) {
      try {
        const parsed = JSON.parse(row.value) as Array<
          [string, string, string, string | null, string, string | null]
        >;
        if (parsed.length > 0) {
          return parsed.map(([id, category, pattern, replacement, severity, description]) => ({
            id,
            category,
            pattern,
            replacement,
            severity,
            is_enabled: true,
            description,
            created_at: "",
          }));
        }
      } catch {
        // fall through to global enabled rules
      }
    }
    const rows = webDb.all<any>(
      "SELECT id, category, pattern, replacement, severity, is_enabled, description, created_at FROM de_ai_rules WHERE is_enabled = 1 ORDER BY category, severity",
      [],
      "global",
    );
    return rows.map((rule) => ({ ...rule, is_enabled: intToBool(rule.is_enabled) }));
  },

  async listGlobalResources(): Promise<GlobalResourcesOverview> {
    await webDb.initGlobal();
    const genreTemplates =
      webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM genre_templates", [], "global")?.c ?? 0;
    const styleProfiles =
      webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM style_profiles", [], "global")?.c ?? 0;
    const deAiRules =
      webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM de_ai_rules", [], "global")?.c ?? 0;
    const soulTemplates =
      webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM soul_templates", [], "global")?.c ?? 0;
    const writingPatterns =
      webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM writing_patterns", [], "global")?.c ?? 0;
    const bannedNames =
      webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM banned_names", [], "global")?.c ?? 0;
    const bannedTitles =
      webDb.get<{ c: number }>("SELECT COUNT(*) as c FROM banned_titles", [], "global")?.c ?? 0;
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
    const existing = webDb.get<{ id: string }>(
      "SELECT id FROM project_settings WHERE project_id = ? AND key = 'editor_prefs'",
      [projectId],
    );
    if (existing) {
      webDb.run("UPDATE project_settings SET value = ?, updated_at = ? WHERE id = ?", [
        json,
        ts,
        existing.id,
      ]);
    } else {
      webDb.run(
        "INSERT INTO project_settings (id, project_id, key, value, updated_at) VALUES (?, ?, 'editor_prefs', ?, ?)",
        [uuid(), projectId, json, ts],
      );
    }
  },
};
