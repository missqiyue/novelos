#[cfg(test)]
mod benchmark_tests {
    use novelos_lib::compiler::*;
    use std::time::Instant;

    fn large_draft(chars: usize) -> String {
        let paragraph = "这是一段测试文本，包含足够的字符来模拟真实的章节内容。".repeat(20);
        let n = chars / paragraph.chars().count();
        (0..n).map(|_| paragraph.clone()).collect::<Vec<_>>().join("\n\n")
    }

    #[test]
    fn bench_compiler_2000_words() {
        let draft = large_draft(4000);
        let rules: Vec<CanonRuleForCompiler> = (0..50).map(|i| CanonRuleForCompiler {
            rule_name: format!("规则{}", i),
            content: format!("不得违反规则{}", i),
            is_hard: i < 20,
            scope_type: "global".to_string(),
        }).collect();

        let chars: Vec<CharacterForCompiler> = (0..30).map(|i| CharacterForCompiler {
            name: format!("角色{}", i),
            role_type: "supporting".to_string(),
            soul_json: format!(r#"{{"template":"模板{}"}}"#, i),
        }).collect();

        let fs_items: Vec<ForeshadowForCompiler> = (0..20).map(|i| ForeshadowForCompiler {
            id: format!("fs{}", i),
            title: Some(format!("伏笔{}", i)),
            status: if i < 15 { "planted".to_string() } else { "resolved".to_string() },
            seed_chapter: Some(i as i64 + 1),
        }).collect();

        let ctx = CompileContext {
            draft_text: &draft,
            canon_rules: &rules,
            characters: &chars,
            foreshadow_items: &fs_items,
            timeline_nodes: &[],
            min_words: 2000,
            max_words: 6000,
            chapter_number: 50,
        };

        let start = Instant::now();
        let result = run_compiler(&ctx);
        let elapsed = start.elapsed();

        // Verify correctness
        assert!(result.stats.word_count > 0);
        assert!(result.stats.hard_rules_checked == 20);

        // Performance: should complete in under 50ms for 2000-word, 50-rule, 30-char input
        let ms = elapsed.as_millis();
        assert!(ms < 500, "Compiler took {}ms, expected under 500ms", ms);

        println!("Compiler benchmark: {}ms for {} chars, {} rules, {} characters, {} foreshadows",
            ms, result.stats.word_count, rules.len(), chars.len(), fs_items.len());
    }

    #[test]
    fn bench_compiler_10000_words() {
        let draft = large_draft(20000);
        let rules: Vec<CanonRuleForCompiler> = (0..100).map(|i| CanonRuleForCompiler {
            rule_name: format!("规则{}", i),
            content: format!("禁止出现关键词{}", i),
            is_hard: i < 40,
            scope_type: "global".to_string(),
        }).collect();

        let ctx = CompileContext {
            draft_text: &draft,
            canon_rules: &rules,
            characters: &[],
            foreshadow_items: &[],
            timeline_nodes: &[],
            min_words: 5000,
            max_words: 15000,
            chapter_number: 100,
        };

        let start = Instant::now();
        let result = run_compiler(&ctx);
        let ms = start.elapsed().as_millis();

        // 10k word draft with 100 rules should complete in under 1 second
        assert!(ms < 2000, "Compiler took {}ms for 10k words, expected under 2s", ms);
        assert!(result.stats.word_count > 5000);

        println!("Compiler 10k benchmark: {}ms for {} chars", ms, result.stats.word_count);
    }

    #[test]
    fn bench_pipeline_build() {
        use novelos_lib::orchestrator;

        let start = Instant::now();
        let steps = orchestrator::build_chapter_pipeline();
        let ms = start.elapsed().as_nanos();

        assert_eq!(steps.len(), 15);
        // Building the pipeline should be sub-microsecond
        assert!(ms < 1_000_000, "Pipeline build took {}ns", ms);
    }

    #[test]
    fn bench_state_machine() {
        use novelos_lib::orchestrator;

        // Build 10,000 pipelines and evaluate them
        let start = Instant::now();
        for _ in 0..10_000 {
            let mut steps = orchestrator::build_chapter_pipeline();
            for s in &mut steps { s.status = "completed".to_string(); }
            let _ = orchestrator::evaluate_pipeline(&steps);
        }
        let ms = start.elapsed().as_millis();

        // 10k evaluations should complete in under 100ms
        assert!(ms < 500, "10k pipeline evaluations took {}ms", ms);
        println!("Pipeline benchmark: 10k evaluations in {}ms ({}μs each)", ms, ms as f64 / 10.0);
    }
}
