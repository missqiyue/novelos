import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  DeAiRuleInfo,
} from "../tauri";

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
