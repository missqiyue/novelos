import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { globalMigrations, projectMigrations, type Migration } from "./migrations";

const IDB_NAME = "novelos-db";
const IDB_VERSION = 1;
const GLOBAL_STORE = "global";
const PROJECT_STORE = "projects";

let sqlJsStatic: SqlJsStatic | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsStatic) {
    sqlJsStatic = await initSqlJs({
      locateFile: () => wasmUrl,
    });
  }
  return sqlJsStatic;
}

// --- IndexedDB persistence ---

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(GLOBAL_STORE)) {
        db.createObjectStore(GLOBAL_STORE);
      }
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIdb(store: string, key: string): Promise<Uint8Array | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIdb(store: string, key: string, data: Uint8Array): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Migration runner ---

function runMigrations(db: Database, migrations: Migration[]): void {
  // Ensure _migrations table exists
  db.run(
    "CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)"
  );

  const applied = new Set<number>();
  const rows = db.exec("SELECT version FROM _migrations");
  if (rows.length > 0) {
    for (const row of rows[0].values) {
      applied.add(row[0] as number);
    }
  }

  const pending = migrations
    .filter((m) => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    db.run("BEGIN");
    try {
      if (migration.version === 7 && migration.name === "llm_call_request_id") {
        const pragma = db.exec("PRAGMA table_info(llm_api_calls)");
        const hasRequestId = pragma.length > 0
          && pragma[0].values.some((row) => row[1] === "request_id");
        if (!hasRequestId) {
          db.run("ALTER TABLE llm_api_calls ADD COLUMN request_id TEXT");
        }
        db.run("COMMIT");
        db.run("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)", [
          migration.version,
          migration.name,
          new Date().toISOString(),
        ]);
        continue;
      }

      // Split on semicolons and execute each statement
      const statements = migration.sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"))
        // Skip _migrations table management — handled by runMigrations itself
        .filter((s) => !s.match(/^(CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?_migrations|INSERT\s+INTO\s+_migrations)/i));

      for (const stmt of statements) {
        db.run(stmt);
      }
      db.run("COMMIT");
      db.run("INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)", [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ]);
    } catch (err) {
      try { db.run("ROLLBACK"); } catch { /* no active transaction */ }
      throw new Error(`Migration V${migration.version} (${migration.name}) failed: ${err}`);
    }
  }
}

// --- WebDatabase manager ---

export class WebDatabase {
  private globalDb: Database | null = null;
  private projectDb: Database | null = null;
  private currentProjectId: string | null = null;
  private dirty = { global: false, project: false };
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Global database ---

  async initGlobal(): Promise<void> {
    if (this.globalDb) return;

    const SQL = await getSqlJs();
    const saved = await loadFromIdb(GLOBAL_STORE, "main");
    this.globalDb = saved ? new SQL.Database(saved) : new SQL.Database();

    runMigrations(this.globalDb, globalMigrations);
    this.markDirty("global");
  }

  getGlobal(): Database {
    if (!this.globalDb) throw new Error("Global database not initialized");
    return this.globalDb;
  }

  // --- Project database ---

  async openProject(projectId: string): Promise<void> {
    if (this.currentProjectId === projectId && this.projectDb) return;

    // Save and close current project
    await this.closeProject();

    const SQL = await getSqlJs();
    const saved = await loadFromIdb(PROJECT_STORE, projectId);
    this.projectDb = saved ? new SQL.Database(saved) : new SQL.Database();
    this.currentProjectId = projectId;

    runMigrations(this.projectDb, projectMigrations);
    this.markDirty("project");
  }

  async closeProject(): Promise<void> {
    if (this.projectDb) {
      await this.flush();
      this.projectDb.close();
      this.projectDb = null;
      this.currentProjectId = null;
      this.dirty.project = false;
    }
  }

  getProject(): Database {
    if (!this.projectDb) throw new Error("No project database open");
    return this.projectDb;
  }

  getProjectId(): string | null {
    return this.currentProjectId;
  }

  // --- Persistence ---

  private markDirty(which: "global" | "project"): void {
    this.dirty[which] = true;
    if (!this.saveTimer) {
      this.saveTimer = setTimeout(() => this.flush(), 1000);
    }
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    if (this.dirty.global && this.globalDb) {
      const data = this.globalDb.export();
      await saveToIdb(GLOBAL_STORE, "main", data);
      this.dirty.global = false;
    }

    if (this.dirty.project && this.projectDb && this.currentProjectId) {
      const data = this.projectDb.export();
      await saveToIdb(PROJECT_STORE, this.currentProjectId, data);
      this.dirty.project = false;
    }
  }

  // --- Query helpers ---

  /** Execute a statement that modifies data (INSERT/UPDATE/DELETE). Marks DB as dirty. */
  run(sql: string, params?: unknown[], which: "global" | "project" = "project"): void {
    const db = which === "global" ? this.getGlobal() : this.getProject();
    db.run(sql, params as (string | number | null | Uint8Array)[]);
    this.markDirty(which);
  }

  /** Execute a SELECT and return the first row as an object, or null. */
  get<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    which: "global" | "project" = "project"
  ): T | null {
    const db = which === "global" ? this.getGlobal() : this.getProject();
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params as (string | number | null | Uint8Array)[]);
    try {
      if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          obj[columns[i]] = values[i];
        }
        return obj as T;
      }
      return null;
    } finally {
      stmt.free();
    }
  }

  /** Execute a SELECT and return all rows as objects. */
  all<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    which: "global" | "project" = "project"
  ): T[] {
    const db = which === "global" ? this.getGlobal() : this.getProject();
    const results: T[] = [];
    const stmt = db.prepare(sql);
    if (params) stmt.bind(params as (string | number | null | Uint8Array)[]);
    try {
      const columns = stmt.getColumnNames();
      while (stmt.step()) {
        const values = stmt.get();
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          obj[columns[i]] = values[i];
        }
        results.push(obj as T);
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  /** Delete a project's persisted database from IndexedDB. */
  async deleteProject(projectId: string): Promise<void> {
    if (this.currentProjectId === projectId) {
      await this.closeProject();
    }
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, "readwrite");
      tx.objectStore(PROJECT_STORE).delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** List all project IDs that have persisted databases. */
  async listProjectIds(): Promise<string[]> {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, "readonly");
      const req = tx.objectStore(PROJECT_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result as string[]);
      req.onerror = () => reject(req.error);
    });
  }
}

// Singleton
export const webDb = new WebDatabase();
