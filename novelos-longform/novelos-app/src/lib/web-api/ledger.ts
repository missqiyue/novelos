import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  CharacterStateInfo,
  RelationshipStateInfo,
  TimelineNodeInfo,
  ForeshadowItemInfo,
  AbilityItemInfo,
  KnowledgeVisibilityInfo,
  NotificationInfo,
  LedgerSummary,
} from "../tauri";

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
