import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  BookshelfItem,
} from "../tauri";

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
