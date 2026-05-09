import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  LocationInfo,
  FactionInfo,
  CollisionItem,
} from "../tauri";

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
