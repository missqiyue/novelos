#[cfg(test)]
mod integration_tests {
    use rusqlite::Connection;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY, title TEXT, genre_id TEXT, logline TEXT,
                target_words INTEGER, target_volumes INTEGER,
                min_chapter_words INTEGER DEFAULT 2000, max_chapter_words INTEGER DEFAULT 5000,
                status TEXT DEFAULT 'planning', created_at TEXT, updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS chapters (
                id TEXT PRIMARY KEY, project_id TEXT, chapter_number INTEGER NOT NULL,
                title TEXT, status TEXT DEFAULT 'task_ready', draft_text TEXT,
                final_text TEXT, word_count INTEGER, task_id TEXT,
                compiler_status TEXT, review_status TEXT, snapshot_id TEXT,
                created_at TEXT, updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS chapter_versions (
                id TEXT PRIMARY KEY, chapter_id TEXT, version_no INTEGER,
                content_type TEXT, content TEXT, diff_summary TEXT,
                created_by TEXT, created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS canon_rules (
                id TEXT PRIMARY KEY, project_id TEXT, rule_key TEXT,
                rule_name TEXT, rule_type TEXT, scope_type TEXT, scope_ref TEXT,
                content TEXT, is_hard INTEGER, status TEXT, version INTEGER,
                source_type TEXT, source_ref TEXT, created_at TEXT, updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY, project_id TEXT, name TEXT, alias TEXT,
                role_type TEXT, identity_core TEXT, persona_core TEXT,
                soul_template_id TEXT, soul_json TEXT DEFAULT '{}',
                taboo_rules TEXT, core_motivation TEXT,
                status TEXT DEFAULT 'active', created_at TEXT, updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS foreshadow_items (
                id TEXT PRIMARY KEY, project_id TEXT, seed_chapter INTEGER,
                expected_volume_id TEXT, title TEXT, maturity_condition TEXT,
                payoff_type TEXT, status TEXT DEFAULT 'planted',
                resolved_chapter INTEGER, importance INTEGER, notes TEXT
            );
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY, project_id TEXT, type TEXT,
                severity TEXT DEFAULT 'info', message TEXT,
                related_entity_type TEXT, related_entity_id TEXT,
                is_read INTEGER DEFAULT 0, created_at TEXT
            );
        ",
        )
        .unwrap();
        conn
    }

    #[test]
    fn test_create_and_query_project() {
        let conn = setup_test_db();
        let now = "2025-01-01T00:00:00Z";
        conn.execute(
            "INSERT INTO projects (id, title, status, created_at, updated_at) VALUES ('p1', '测试作品', 'active', ?1, ?2)",
            [now, now],
        ).unwrap();

        let title: String = conn
            .query_row("SELECT title FROM projects WHERE id = 'p1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(title, "测试作品");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_chapter_crud() {
        let conn = setup_test_db();
        let now = "2025-01-01T00:00:00Z";

        // Insert project
        conn.execute("INSERT INTO projects (id, title, status, created_at, updated_at) VALUES ('p1', '测试', 'active', ?1, ?2)", [now, now]).unwrap();

        // Create chapter
        conn.execute(
            "INSERT INTO chapters (id, project_id, chapter_number, title, status, draft_text, word_count, created_at, updated_at) VALUES ('c1', 'p1', 1, '第一章', 'drafting', '正文内容测试', 6, ?1, ?2)",
            [now, now],
        ).unwrap();

        // Query chapter
        let (num, title, status, draft, wc): (i64, String, String, String, i64) = conn.query_row(
            "SELECT chapter_number, COALESCE(title,''), status, COALESCE(draft_text,''), COALESCE(word_count,0) FROM chapters WHERE id = 'c1'",
            [], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?)),
        ).unwrap();

        assert_eq!(num, 1);
        assert_eq!(title, "第一章");
        assert_eq!(status, "drafting");
        assert_eq!(draft, "正文内容测试");
        assert_eq!(wc, 6);

        // Create version
        conn.execute(
            "INSERT INTO chapter_versions (id, chapter_id, version_no, content_type, content, created_at) VALUES ('v1', 'c1', 1, 'draft', '正文v1', ?1)",
            [now],
        ).unwrap();

        let version_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM chapter_versions WHERE chapter_id = 'c1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(version_count, 1);
    }

    #[test]
    fn test_canon_rules_with_hard_soft() {
        let conn = setup_test_db();
        let now = "2025-01-01T00:00:00Z";

        conn.execute("INSERT INTO projects (id, title, created_at, updated_at) VALUES ('p1', '测试', ?1, ?2)", [now, now]).unwrap();
        conn.execute(
            "INSERT INTO canon_rules (id, project_id, rule_key, rule_name, rule_type, scope_type, content, is_hard, status, version, created_at, updated_at) VALUES ('r1', 'p1', 'magic', '魔法体系', 'hard_rule', 'global', '魔法需要吟唱', 1, 'active', 1, ?1, ?2)",
            [now, now],
        ).unwrap();
        conn.execute(
            "INSERT INTO canon_rules (id, project_id, rule_key, rule_name, rule_type, scope_type, content, is_hard, status, version, created_at, updated_at) VALUES ('r2', 'p1', 'dialogue', '对话风格', 'soft_rule', 'global', '不使用现代用语', 0, 'active', 1, ?1, ?2)",
            [now, now],
        ).unwrap();

        let hard_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM canon_rules WHERE is_hard = 1 AND status = 'active'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let soft_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM canon_rules WHERE is_hard = 0 AND status = 'active'",
                [],
                |r| r.get(0),
            )
            .unwrap();

        assert_eq!(hard_count, 1);
        assert_eq!(soft_count, 1);
    }

    #[test]
    fn test_foreshadow_state_transitions() {
        let conn = setup_test_db();
        let now = "2025-01-01T00:00:00Z";

        conn.execute("INSERT INTO projects (id, title, created_at, updated_at) VALUES ('p1', '测试', ?1, ?2)", [now, now]).unwrap();
        conn.execute(
            "INSERT INTO foreshadow_items (id, project_id, seed_chapter, title, status, importance) VALUES ('f1', 'p1', 3, '伏笔1', 'planted', 8)",
            [],
        ).unwrap();

        // Verify planted
        let status: String = conn
            .query_row(
                "SELECT status FROM foreshadow_items WHERE id = 'f1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "planted");

        // Resolve
        conn.execute("UPDATE foreshadow_items SET status = 'resolved', resolved_chapter = 15 WHERE id = 'f1'", []).unwrap();
        let status: String = conn
            .query_row(
                "SELECT status FROM foreshadow_items WHERE id = 'f1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(status, "resolved");

        // Check resolved_chapter
        let resolved_ch: Option<i64> = conn
            .query_row(
                "SELECT resolved_chapter FROM foreshadow_items WHERE id = 'f1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(resolved_ch, Some(15));
    }

    #[test]
    fn test_notification_workflow() {
        let conn = setup_test_db();
        let now = "2025-01-01T00:00:00Z";

        // Create notification
        conn.execute(
            "INSERT INTO notifications (id, project_id, type, severity, message, is_read, created_at) VALUES ('n1', 'p1', 'compiler', 'error', '硬规则违反: 魔法体系', 0, ?1)",
            [now],
        ).unwrap();

        // Verify unread
        let unread: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notifications WHERE is_read = 0",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(unread, 1);

        // Mark read
        conn.execute("UPDATE notifications SET is_read = 1 WHERE id = 'n1'", [])
            .unwrap();
        let unread: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM notifications WHERE is_read = 0",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(unread, 0);
    }

    #[test]
    fn test_character_with_soul_json() {
        let conn = setup_test_db();
        let now = "2025-01-01T00:00:00Z";

        conn.execute("INSERT INTO projects (id, title, created_at, updated_at) VALUES ('p1', '测试', ?1, ?2)", [now, now]).unwrap();

        let soul = r#"{"matched_template":"热血少年","customization":{"personality":{"core":"正直"},"speech":{"tone":"坚定"}},"speech_examples":["我不会放弃"]}"#;
        conn.execute(
            "INSERT INTO characters (id, project_id, name, role_type, identity_core, soul_json, status, created_at, updated_at) VALUES ('ch1', 'p1', '主角', 'protagonist', '剑客', ?1, 'active', ?2, ?3)",
            rusqlite::params![soul, now, now],
        ).unwrap();

        // Query and parse SOUL
        let soul_json: String = conn
            .query_row(
                "SELECT soul_json FROM characters WHERE id = 'ch1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&soul_json).unwrap();

        assert_eq!(parsed["matched_template"], "热血少年");
        assert_eq!(parsed["customization"]["personality"]["core"], "正直");
        assert_eq!(parsed["speech_examples"][0], "我不会放弃");
    }

    #[test]
    fn test_bulk_chapter_insert_and_query() {
        let conn = setup_test_db();
        let now = "2025-01-01T00:00:00Z";

        conn.execute("INSERT INTO projects (id, title, created_at, updated_at) VALUES ('p1', '测试', ?1, ?2)", [now, now]).unwrap();

        // Insert 100 chapters
        for i in 1..=100 {
            conn.execute(
                "INSERT INTO chapters (id, project_id, chapter_number, title, status, word_count, created_at, updated_at) VALUES (?1, 'p1', ?2, ?3, 'drafting', ?4, ?5, ?6)",
                rusqlite::params![format!("c{}", i), i, format!("第{}章", i), i * 1000, now, now],
            ).unwrap();
        }

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM chapters", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 100);

        // Query range
        let range_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM chapters WHERE chapter_number BETWEEN 10 AND 20",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(range_count, 11);

        // Total words
        let total_words: i64 = conn
            .query_row(
                "SELECT COALESCE(SUM(word_count), 0) FROM chapters",
                [],
                |r| r.get(0),
            )
            .unwrap();
        // Sum of 1*1000 + 2*1000 + ... + 100*1000 = 1000 * 100*101/2 = 5,050,000
        assert_eq!(total_words, 5_050_000);
    }
}
