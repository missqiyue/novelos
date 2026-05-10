use refinery::Target;
use rusqlite::Connection;

mod embedded {
    use refinery::embed_migrations;
    embed_migrations!("./src/db/migrations_project");
}

pub fn run_migrations(conn: &mut Connection) -> Result<(), Box<dyn std::error::Error>> {
    embedded::migrations::runner()
        .set_target(Target::Version(6))
        .run(conn)?;

    ensure_llm_api_calls_request_id(conn)?;
    ensure_chapter_pipeline_runs(conn)?;
    ensure_chapter_quality_reports(conn)?;

    embedded::migrations::runner()
        .set_target(Target::FakeVersion(9))
        .run(conn)?;

    Ok(())
}

fn ensure_llm_api_calls_request_id(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    let mut stmt = conn.prepare("PRAGMA table_info(llm_api_calls)")?;
    let mut rows = stmt.query([])?;
    let mut has_request_id = false;

    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == "request_id" {
            has_request_id = true;
            break;
        }
    }

    drop(rows);
    drop(stmt);

    if !has_request_id {
        conn.execute("ALTER TABLE llm_api_calls ADD COLUMN request_id TEXT", [])?;
    }

    Ok(())
}

fn ensure_chapter_pipeline_runs(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS chapter_pipeline_runs (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            chapter_number INTEGER NOT NULL,
            run_id TEXT NOT NULL,
            result_json TEXT NOT NULL,
            chapter_status TEXT NOT NULL,
            compiler_score INTEGER,
            review_verdict TEXT,
            review_score REAL,
            total_duration_ms INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_pipeline_runs_chapter
            ON chapter_pipeline_runs(chapter_number, created_at DESC);",
    )?;

    Ok(())
}

fn ensure_chapter_quality_reports(conn: &Connection) -> Result<(), Box<dyn std::error::Error>> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS chapter_quality_reports (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            chapter_number INTEGER NOT NULL,
            report_type TEXT NOT NULL,
            content_hash TEXT,
            overall TEXT NOT NULL,
            summary TEXT,
            report_json TEXT NOT NULL,
            cached INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chapter_quality_reports_chapter
            ON chapter_quality_reports(chapter_number, report_type, created_at DESC);",
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_chapter_pipeline_runs, ensure_chapter_quality_reports,
        ensure_llm_api_calls_request_id,
    };
    use rusqlite::Connection;

    #[test]
    fn adds_request_id_column_when_missing() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE llm_api_calls (
                id TEXT PRIMARY KEY,
                project_id TEXT,
                agent_name TEXT,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                latency_ms INTEGER,
                cost_usd REAL,
                status TEXT NOT NULL DEFAULT 'success',
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();

        ensure_llm_api_calls_request_id(&conn).unwrap();

        let mut stmt = conn.prepare("PRAGMA table_info(llm_api_calls)").unwrap();
        let names = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();

        assert!(names.iter().any(|name| name == "request_id"));
    }

    #[test]
    fn skips_when_request_id_column_already_exists() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE llm_api_calls (
                id TEXT PRIMARY KEY,
                request_id TEXT,
                project_id TEXT,
                agent_name TEXT,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                prompt_tokens INTEGER NOT NULL DEFAULT 0,
                completion_tokens INTEGER NOT NULL DEFAULT 0,
                total_tokens INTEGER NOT NULL DEFAULT 0,
                latency_ms INTEGER,
                cost_usd REAL,
                status TEXT NOT NULL DEFAULT 'success',
                created_at TEXT NOT NULL
            );",
        )
        .unwrap();

        ensure_llm_api_calls_request_id(&conn).unwrap();
        ensure_llm_api_calls_request_id(&conn).unwrap();

        let mut stmt = conn.prepare("PRAGMA table_info(llm_api_calls)").unwrap();
        let request_id_count = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .unwrap()
            .filter(|name| name.as_deref() == Ok("request_id"))
            .count();

        assert_eq!(request_id_count, 1);
    }

    #[test]
    fn creates_chapter_pipeline_runs_table() {
        let conn = Connection::open_in_memory().unwrap();

        ensure_chapter_pipeline_runs(&conn).unwrap();
        ensure_chapter_pipeline_runs(&conn).unwrap();

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'chapter_pipeline_runs'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(exists, 1);
    }

    #[test]
    fn creates_chapter_quality_reports_table() {
        let conn = Connection::open_in_memory().unwrap();

        ensure_chapter_quality_reports(&conn).unwrap();
        ensure_chapter_quality_reports(&conn).unwrap();

        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'chapter_quality_reports'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(exists, 1);
    }
}
