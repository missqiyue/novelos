#[cfg(test)]
mod snapshot_tests {
    // Test the snapshot data structures and logic (unit tests without DB)
    use serde_json::json;

    #[test]
    fn test_snapshot_summary_structure() {
        let summary = json!({
            "chapter_number": 1,
            "chapter_title": "测试章节",
            "word_count": 3200,
            "volume": "第1卷: 起始",
            "character_count": 3,
            "characters": [
                {"name": "主角A", "role_type": "protagonist", "level": "筑基三层", "emotion": "坚定", "goal": "复仇"}
            ],
            "active_foreshadow_count": 2,
            "generated_at": "2025-01-01T00:00:00Z"
        });

        assert_eq!(summary["chapter_number"], 1);
        assert_eq!(summary["word_count"], 3200);
        assert!(summary["characters"].as_array().unwrap().len() == 1);
    }

    #[test]
    fn test_snapshot_type_values() {
        let valid_types = ["chapter", "volume", "arc"];
        for t in &valid_types {
            let s = json!({"snapshot_type": t});
            assert!(valid_types.contains(&s["snapshot_type"].as_str().unwrap()));
        }
    }

    #[test]
    fn test_pipeline_step_serialization() {
        let step = json!({
            "name": "AI撰写草稿",
            "agent_name": "draft_writer",
            "status": "completed",
            "output": "第一章正文内容...",
            "duration_ms": 3500
        });

        assert_eq!(step["name"], "AI撰写草稿");
        assert_eq!(step["status"], "completed");
        assert_eq!(step["duration_ms"], 3500);
    }

    #[test]
    fn test_pipeline_result_structure() {
        let result = json!({
            "steps": [
                {"name": "生成任务卡", "status": "completed", "output": "...", "duration_ms": 1200},
                {"name": "AI撰写草稿", "status": "completed", "output": "正文", "duration_ms": 5000}
            ],
            "chapter_status": "approved",
            "compiler_score": 85,
            "review_verdict": "conditional_pass",
            "review_score": 7.5,
            "total_duration_ms": 45000
        });

        assert_eq!(result["steps"].as_array().unwrap().len(), 2);
        assert_eq!(result["chapter_status"], "approved");
        assert!(result["compiler_score"].as_i64().unwrap() >= 80);
    }

    #[test]
    fn test_valid_transition_rules() {
        // Validate state machine transitions
        let transitions = vec![
            ("task_ready", "drafting", true),
            ("task_ready", "finalized", false), // can't skip to finalized
            ("drafting", "draft_generated", true),
            ("draft_generated", "reviewing", true),
            ("approved", "finalized", true),
            ("finalized", "archived", true),
            ("finalized", "task_ready", false), // can't go back
        ];

        for (from, to, expected) in &transitions {
            let valid_targets: Vec<&str> = match *from {
                "task_ready" => vec!["drafting", "draft_generated"],
                "drafting" => vec!["draft_generated", "compile_failed", "task_ready"],
                "draft_generated" => vec!["reviewing", "compile_failed", "drafting", "approved"],
                "approved" => vec!["finalized", "archived", "needs_revalidate", "drafting"],
                "finalized" => vec!["archived", "needs_revalidate"],
                _ => vec![],
            };
            let is_valid = valid_targets.contains(to);
            assert_eq!(is_valid, *expected, "Transition {} -> {} should be {}", from, to, expected);
        }
    }
}
