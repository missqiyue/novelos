import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  SoulTemplateInfo,
  GenreTemplateInfo,
} from "../tauri";

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
