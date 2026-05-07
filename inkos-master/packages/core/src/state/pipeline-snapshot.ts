import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

export interface PipelineSnapshot {
  readonly bookId: string;
  readonly chapterNumber: number;
  readonly stage: string;
  readonly stateData: string;
  readonly updatedAt: string;
}

export class PipelineSnapshotDB {
  private db: any;

  constructor(projectRoot: string) {
    const { DatabaseSync } = require("node:sqlite");
    const dbPath = join(projectRoot, ".inkos_pipeline_snapshot.db");
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_snapshots (
        book_id TEXT NOT NULL,
        chapter_number INTEGER NOT NULL,
        stage TEXT NOT NULL,
        state_data TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (book_id, chapter_number)
      );
    `);
  }

  saveSnapshot(bookId: string, chapterNumber: number, stage: string, stateData: any): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pipeline_snapshots (book_id, chapter_number, stage, state_data, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(bookId, chapterNumber, stage, JSON.stringify(stateData));
  }

  getSnapshot(bookId: string, chapterNumber: number): PipelineSnapshot | null {
    const stmt = this.db.prepare(`
      SELECT book_id AS bookId, chapter_number AS chapterNumber, stage, state_data AS stateData, updated_at AS updatedAt
      FROM pipeline_snapshots
      WHERE book_id = ? AND chapter_number = ?
    `);
    const row = stmt.get(bookId, chapterNumber) as PipelineSnapshot | undefined;
    return row || null;
  }

  clearSnapshot(bookId: string, chapterNumber: number): void {
    const stmt = this.db.prepare("DELETE FROM pipeline_snapshots WHERE book_id = ? AND chapter_number = ?");
    stmt.run(bookId, chapterNumber);
  }

  close(): void {
    this.db.close();
  }
}
