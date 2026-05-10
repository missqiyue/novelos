use super::{db_err, Repository};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterRow {
    pub id: String,
    pub chapter_number: i64,
    pub title: Option<String>,
    pub status: String,
    pub draft_text: Option<String>,
    pub final_text: Option<String>,
    pub word_count: Option<i64>,
    pub task_id: Option<String>,
    pub compiler_status: Option<String>,
    pub review_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

const SELECT_COLS: &str = "id, chapter_number, title, status, draft_text, final_text, word_count, task_id, compiler_status, review_status, created_at, updated_at";

fn map_row(row: &rusqlite::Row) -> rusqlite::Result<ChapterRow> {
    Ok(ChapterRow {
        id: row.get(0)?,
        chapter_number: row.get(1)?,
        title: row.get(2)?,
        status: row.get(3)?,
        draft_text: row.get(4)?,
        final_text: row.get(5)?,
        word_count: row.get(6)?,
        task_id: row.get(7)?,
        compiler_status: row.get(8)?,
        review_status: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn query_list(
    conn: &Connection,
    sql: &str,
    params: impl rusqlite::Params,
) -> Result<Vec<ChapterRow>, String> {
    let mut stmt = conn.prepare(sql).map_err(db_err)?;
    let rows = stmt.query_map(params, map_row).map_err(db_err)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
}

pub struct ChapterRepo;

impl Repository<ChapterRow> for ChapterRepo {
    fn find_by_id(conn: &Connection, id: &str) -> Result<Option<ChapterRow>, String> {
        match conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM chapters WHERE id = ?1"),
            [id],
            map_row,
        ) {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(db_err(e)),
        }
    }

    fn list(conn: &Connection) -> Result<Vec<ChapterRow>, String> {
        query_list(
            conn,
            &format!("SELECT {SELECT_COLS} FROM chapters ORDER BY chapter_number"),
            [],
        )
    }

    fn delete(conn: &Connection, id: &str) -> Result<(), String> {
        conn.execute("DELETE FROM chapter_versions WHERE chapter_id = ?1", [id])
            .map_err(db_err)?;
        conn.execute("DELETE FROM chapters WHERE id = ?1", [id])
            .map_err(db_err)?;
        Ok(())
    }
}

impl ChapterRepo {
    pub fn find_by_number(
        conn: &Connection,
        chapter_number: i64,
    ) -> Result<Option<ChapterRow>, String> {
        match conn.query_row(
            &format!("SELECT {SELECT_COLS} FROM chapters WHERE chapter_number = ?1"),
            [chapter_number],
            map_row,
        ) {
            Ok(row) => Ok(Some(row)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(db_err(e)),
        }
    }

    pub fn update_draft(
        conn: &Connection,
        chapter_number: i64,
        draft_text: &str,
        now: &str,
    ) -> Result<(), String> {
        let word_count = draft_text.chars().count() as i64;
        conn.execute(
            "UPDATE chapters SET draft_text = ?1, word_count = ?2, status = 'drafting', updated_at = ?3 WHERE chapter_number = ?4",
            rusqlite::params![draft_text, word_count, now, chapter_number],
        )
        .map_err(db_err)?;
        Ok(())
    }

    pub fn list_by_status(conn: &Connection, status: &str) -> Result<Vec<ChapterRow>, String> {
        query_list(
            conn,
            &format!(
                "SELECT {SELECT_COLS} FROM chapters WHERE status = ?1 ORDER BY chapter_number"
            ),
            [status],
        )
    }

    pub fn get_chapter_id(
        conn: &Connection,
        chapter_number: i64,
    ) -> Result<Option<String>, String> {
        match conn.query_row(
            "SELECT id FROM chapters WHERE chapter_number = ?1",
            [chapter_number],
            |r| r.get(0),
        ) {
            Ok(id) => Ok(Some(id)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(db_err(e)),
        }
    }
}

// ─── Chapter Versions ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterVersionRow {
    pub id: String,
    pub chapter_id: String,
    pub version_no: i64,
    pub content_type: String,
    pub content: String,
    pub diff_summary: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
}

fn map_version_row(row: &rusqlite::Row) -> rusqlite::Result<ChapterVersionRow> {
    Ok(ChapterVersionRow {
        id: row.get(0)?,
        chapter_id: row.get(1)?,
        version_no: row.get(2)?,
        content_type: row.get(3)?,
        content: row.get(4)?,
        diff_summary: row.get(5)?,
        created_by: row.get(6)?,
        created_at: row.get(7)?,
    })
}

pub struct ChapterVersionRepo;

impl ChapterVersionRepo {
    pub fn list_by_chapter(
        conn: &Connection,
        chapter_id: &str,
    ) -> Result<Vec<ChapterVersionRow>, String> {
        let mut stmt = conn
            .prepare("SELECT id, chapter_id, version_no, content_type, content, diff_summary, created_by, created_at FROM chapter_versions WHERE chapter_id = ?1 ORDER BY version_no DESC")
            .map_err(db_err)?;
        let rows = stmt
            .query_map([chapter_id], map_version_row)
            .map_err(db_err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }
}

// ─── Chapter Tasks ───

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChapterTaskRow {
    pub id: String,
    pub chapter_number: i64,
    pub volume_id: Option<String>,
    pub arc_id: Option<String>,
    pub objective: String,
    pub must_progress: Option<String>,
    pub must_recall: Option<String>,
    pub must_avoid: Option<String>,
    pub required_hooks: Option<String>,
    pub required_context: Option<String>,
    pub ending_hook: Option<String>,
    pub status: Option<String>,
    pub created_at: String,
}

fn map_task_row(row: &rusqlite::Row) -> rusqlite::Result<ChapterTaskRow> {
    Ok(ChapterTaskRow {
        id: row.get(0)?,
        chapter_number: row.get(1)?,
        volume_id: row.get(2)?,
        arc_id: row.get(3)?,
        objective: row.get(4)?,
        must_progress: row.get(5)?,
        must_recall: row.get(6)?,
        must_avoid: row.get(7)?,
        required_hooks: row.get(8)?,
        required_context: row.get(9)?,
        ending_hook: row.get(10)?,
        status: row.get(11)?,
        created_at: row.get(12)?,
    })
}

pub struct ChapterTaskRepo;

impl ChapterTaskRepo {
    pub fn list(conn: &Connection, volume_id: Option<&str>) -> Result<Vec<ChapterTaskRow>, String> {
        let sql = if volume_id.is_some() {
            "SELECT id, chapter_number, volume_id, arc_id, objective, must_progress, must_recall, must_avoid, required_hooks, required_context, ending_hook, status, created_at FROM chapter_tasks WHERE volume_id = ?1 ORDER BY chapter_number"
        } else {
            "SELECT id, chapter_number, volume_id, arc_id, objective, must_progress, must_recall, must_avoid, required_hooks, required_context, ending_hook, status, created_at FROM chapter_tasks ORDER BY chapter_number"
        };
        let mut stmt = conn.prepare(sql).map_err(db_err)?;

        let rows = if let Some(vid) = volume_id {
            stmt.query_map([vid], map_task_row).map_err(db_err)?
        } else {
            stmt.query_map([], map_task_row).map_err(db_err)?
        };
        rows.collect::<Result<Vec<_>, _>>().map_err(db_err)
    }
}
