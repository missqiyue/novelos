#[cfg(test)]
mod orchestrator_tests {
    use novelos_lib::orchestrator::*;

    #[test]
    fn test_pipeline_has_fifteen_steps() {
        let steps = build_chapter_pipeline();
        assert_eq!(steps.len(), 15);
    }

    #[test]
    fn test_pipeline_step_names() {
        let steps = build_chapter_pipeline();
        let names: Vec<&str> = steps.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"生成任务卡"));
        assert!(names.contains(&"AI撰写草稿"));
        assert!(names.contains(&"连续性编译"));
        assert!(names.contains(&"终审裁决"));
    }

    #[test]
    fn test_pipeline_all_steps_start_pending() {
        let steps = build_chapter_pipeline();
        for step in &steps {
            assert_eq!(step.status, "pending");
        }
    }

    #[test]
    fn test_evaluate_pipeline_all_pass() {
        let mut steps = build_chapter_pipeline();
        for step in &mut steps {
            step.status = "completed".to_string();
        }
        // Set compiler step output with pass score
        let compiler = steps.iter_mut().find(|s| s.name == "连续性编译").unwrap();
        compiler.output = Some(r#"{"status":"pass","score":95}"#.to_string());
        // Set review chair output
        let chair = steps.iter_mut().find(|s| s.name == "终审裁决").unwrap();
        chair.output = Some(r#"{"verdict":"approved","overall_score":8.5}"#.to_string());

        let (status, compiler_score, review_score) = evaluate_pipeline(&steps);
        assert_eq!(status, "approved");
        assert_eq!(compiler_score, Some(95));
        assert_eq!(review_score, Some(8.5));
    }

    #[test]
    fn test_evaluate_pipeline_with_failures() {
        let mut steps = build_chapter_pipeline();
        for step in &mut steps {
            step.status = "completed".to_string();
        }
        // Fail 3 steps
        steps[0].status = "failed".to_string();
        steps[3].status = "failed".to_string();
        steps[5].status = "failed".to_string();

        let (status, _, _) = evaluate_pipeline(&steps);
        // More than 2 failures → review_required
        assert_eq!(status, "review_required");
    }

    #[test]
    fn test_evaluate_pipeline_minor_failures() {
        let mut steps = build_chapter_pipeline();
        for step in &mut steps {
            step.status = "completed".to_string();
        }
        // Only 2 review steps failed
        steps[6].status = "failed".to_string(); // plot expert
        steps[7].status = "failed".to_string(); // character expert

        let (status, _, _) = evaluate_pipeline(&steps);
        // Only review steps failed → approved
        assert_eq!(status, "approved");
    }
}
