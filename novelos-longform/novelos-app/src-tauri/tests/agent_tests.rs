#[cfg(test)]
mod agent_tests {
    use novelos_lib::agents;

    #[test]
    fn test_genre_match_prompts() {
        assert!(!agents::genre_match::SYSTEM.is_empty());
        assert!(agents::genre_match::SYSTEM.contains("题材分析"));
        assert!(agents::genre_match::USER_TEMPLATE.contains("{description}"));
    }

    #[test]
    fn test_draft_writer_prompts() {
        assert!(!agents::draft_writer::SYSTEM.is_empty());
        assert!(agents::draft_writer::SYSTEM.contains("正典规则"));
        assert!(agents::draft_writer::USER_TEMPLATE.contains("{task_card}"));
    }

    #[test]
    fn test_voice_filter_prompts() {
        assert!(!agents::voice_filter::SYSTEM.is_empty());
        assert!(agents::voice_filter::USER_TEMPLATE.contains("{draft_text}"));
    }

    #[test]
    fn test_name_generator_prompts() {
        assert!(!agents::name_generator::SYSTEM.is_empty());
        assert!(agents::name_generator::USER_TEMPLATE.contains("{character_descriptions}"));
    }

    #[test]
    fn test_soul_matcher_prompts() {
        assert!(!agents::soul_matcher::SYSTEM.is_empty());
        assert!(agents::soul_matcher::USER_TEMPLATE.contains("{name}"));
    }

    #[test]
    fn test_book_title_prompts() {
        assert!(!agents::book_title::SYSTEM.is_empty());
        assert!(agents::book_title::USER_TEMPLATE.contains("{description}"));
    }

    #[test]
    fn test_style_extractor_prompts() {
        assert!(!agents::style_extractor::SYSTEM.is_empty());
        assert!(agents::style_extractor::USER_TEMPLATE.contains("{text}"));
    }

    #[test]
    fn test_volume_outline_prompts() {
        assert!(!agents::volume_outline::SYSTEM.is_empty());
        assert!(agents::volume_outline::USER_TEMPLATE.contains("{description}"));
    }

    #[test]
    fn test_book_outline_prompts() {
        assert!(!agents::book_outline::SYSTEM.is_empty());
        assert!(agents::book_outline::USER_TEMPLATE.contains("{description}"));
    }

    #[test]
    fn test_task_card_prompts() {
        assert!(!agents::task_card::SYSTEM.is_empty());
        assert!(agents::task_card::USER_TEMPLATE.contains("{outline_context}"));
    }

    #[test]
    fn test_arc_planner_prompts() {
        assert!(!agents::arc_planner::SYSTEM.is_empty());
        assert!(agents::arc_planner::USER_TEMPLATE.contains("{volume_number}"));
    }

    #[test]
    fn test_chapter_outline_prompts() {
        assert!(!agents::chapter_outline::SYSTEM.is_empty());
        assert!(agents::chapter_outline::USER_TEMPLATE.contains("{task_card}"));
    }

    #[test]
    fn test_review_agents_exist() {
        let agents_list = [
            ("plot_expert", &agents::plot_expert::SYSTEM, &agents::plot_expert::USER_TEMPLATE),
            ("character_expert", &agents::character_expert::SYSTEM, &agents::character_expert::USER_TEMPLATE),
            ("pacing_expert", &agents::pacing_expert::SYSTEM, &agents::pacing_expert::USER_TEMPLATE),
            ("worldbuilding_expert", &agents::worldbuilding_expert::SYSTEM, &agents::worldbuilding_expert::USER_TEMPLATE),
            ("prose_expert", &agents::prose_expert::SYSTEM, &agents::prose_expert::USER_TEMPLATE),
            ("commercial_expert", &agents::commercial_expert::SYSTEM, &agents::commercial_expert::USER_TEMPLATE),
            ("reader_panel", &agents::reader_panel::SYSTEM, &agents::reader_panel::USER_TEMPLATE),
            ("voice_audit", &agents::voice_audit::SYSTEM, &agents::voice_audit::USER_TEMPLATE),
            ("review_chair", &agents::review_chair::SYSTEM, &agents::review_chair::USER_TEMPLATE),
        ];
        for (name, sys, user) in &agents_list {
            assert!(!sys.is_empty(), "{} SYSTEM is empty", name);
            assert!(!user.is_empty(), "{} USER_TEMPLATE is empty", name);
        }
    }

    #[test]
    fn test_recall_agents_exist() {
        assert!(!agents::recall_agent::SYSTEM.is_empty());
        assert!(!agents::continuity_analyst::SYSTEM.is_empty());
        assert!(!agents::rewrite_agent::SYSTEM.is_empty());
    }
}
