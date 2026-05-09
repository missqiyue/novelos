import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  CanonRuleInfo,
  CanonRuleVersionInfo,
  CreateCanonRuleInput,
} from "../tauri";

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
