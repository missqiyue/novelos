#[cfg(test)]
mod compiler_tests {
    use novelos_lib::compiler::*;

    fn make_context(draft: &str) -> CompileContext {
        CompileContext {
            draft_text: draft,
            canon_rules: &[],
            characters: &[],
            foreshadow_items: &[],
            timeline_nodes: &[],
            min_words: 2000,
            max_words: 5000,
            chapter_number: 1,
        }
    }

    #[test]
    fn test_word_count_too_few() {
        let ctx = make_context("短文本");
        let result = run_compiler(&ctx);
        assert!(result
            .issues
            .iter()
            .any(|i| i.checker == "WordCountChecker" && i.message.contains("偏少")));
    }

    #[test]
    fn test_word_count_too_many() {
        let long_text = "长文本".repeat(2000);
        let ctx = CompileContext {
            min_words: 100,
            max_words: 500,
            ..make_context(&long_text)
        };
        let result = run_compiler(&ctx);
        assert!(result
            .issues
            .iter()
            .any(|i| i.checker == "WordCountChecker" && i.message.contains("偏多")));
    }

    #[test]
    fn test_pass_with_good_content() {
        let good = "第一章内容\n\n".repeat(50) + "他说：" + &"对话内容。".repeat(20);
        let ctx = make_context(&good);
        let result = run_compiler(&ctx);
        assert_eq!(result.status, "pass");
        assert!(result.score >= 80);
    }

    #[test]
    fn test_canon_violation_detected() {
        let rule = CanonRuleForCompiler {
            rule_name: "禁止飞天".to_string(),
            content: "不得飞天".to_string(),
            is_hard: true,
            scope_type: "global".to_string(),
        };
        let ctx = CompileContext {
            canon_rules: &[rule],
            ..make_context("主角飞天而去，越过了山巅。")
        };
        let result = run_compiler(&ctx);
        assert!(result
            .issues
            .iter()
            .any(|i| i.checker == "CanonChecker" && i.severity == "error"));
        assert_eq!(result.status, "fail");
    }

    #[test]
    fn test_soft_rule_generates_warning() {
        let rule = CanonRuleForCompiler {
            rule_name: "建议不使用现代词汇".to_string(),
            content: "不得使用内卷".to_string(),
            is_hard: false,
            scope_type: "global".to_string(),
        };
        let ctx = CompileContext {
            canon_rules: &[rule],
            ..make_context("这个宗门太卷了，大家都在使用内卷的方式竞争资源。")
        };
        let result = run_compiler(&ctx);
        assert!(result
            .issues
            .iter()
            .any(|i| i.checker == "CanonChecker" && i.severity == "warning"));
    }

    #[test]
    fn test_missing_soul_warning() {
        let ch = CharacterForCompiler {
            name: "张三".to_string(),
            role_type: "protagonist".to_string(),
            soul_json: "{}".to_string(),
        };
        let ctx = CompileContext {
            characters: &[ch],
            ..make_context("张三站在山顶，俯瞰着整个青云宗。他说：今天天气不错。")
        };
        let result = run_compiler(&ctx);
        assert!(result
            .issues
            .iter()
            .any(|i| i.checker == "CharacterChecker"));
    }

    #[test]
    fn test_foreshadow_overdue() {
        let fs = ForeshadowForCompiler {
            id: "fs1".to_string(),
            title: Some("远古封印".to_string()),
            status: "planted".to_string(),
            seed_chapter: Some(1),
        };
        let ctx = CompileContext {
            foreshadow_items: &[fs],
            chapter_number: 35,
            ..make_context("古今多少事，都付笑谈中。")
        };
        let result = run_compiler(&ctx);
        assert!(result
            .issues
            .iter()
            .any(|i| i.checker == "ForeshadowChecker"));
    }

    #[test]
    fn test_dialogue_detection() {
        let text = "纯叙述内容，没有任何对话标记。".repeat(50);
        let ctx = make_context(&text);
        let result = run_compiler(&ctx);
        assert!(result.issues.iter().any(|i| i.message.contains("缺少对话")));
    }

    #[test]
    fn test_score_calculation() {
        let rule = CanonRuleForCompiler {
            rule_name: "硬规则".to_string(),
            content: "不得使用X".to_string(),
            is_hard: true,
            scope_type: "global".to_string(),
        };
        let ctx = CompileContext {
            canon_rules: &[rule],
            ..make_context("使用X来解决问题。")
        };
        let result = run_compiler(&ctx);
        // One hard rule violation = -20 points
        assert!(result.score <= 80);
        assert_eq!(result.status, "fail");
    }
}
