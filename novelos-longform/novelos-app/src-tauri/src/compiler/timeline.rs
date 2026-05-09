use super::{CompileContext, CompileIssue, CompilePass};

pub struct TimelineChecker;

impl CompilePass for TimelineChecker {
    fn name(&self) -> &'static str { "TimelineChecker" }
    fn description(&self) -> &'static str { "检查时间线事件覆盖" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        for tn in ctx.timeline_nodes {
            if tn.chapter_number != Some(ctx.chapter_number) {
                continue;
            }

            // Extract meaningful keywords from the event summary
            // Use a smarter approach: extract noun phrases (2+ consecutive CJK characters)
            let keywords = extract_cjk_keywords(&tn.event_summary, 2);

            if keywords.is_empty() {
                continue;
            }

            // Check coverage: at least half the keywords should appear in draft
            let found_count = keywords.iter().filter(|kw| ctx.draft_text.contains(*kw)).count();
            let coverage_ratio = found_count as f32 / keywords.len() as f32;

            if coverage_ratio < 0.4 {
                let missing: Vec<&str> = keywords.iter()
                    .filter(|kw| !ctx.draft_text.contains(*kw))
                    .copied()
                    .collect();

                issues.push(CompileIssue {
                    checker: self.name().to_string(),
                    severity: "warning".to_string(),
                    message: format!("时间线事件可能未充分覆盖: {}", tn.event_summary),
                    detail: Some(format!(
                        "本章时间线节点要求覆盖\"{}\"，但关键词 [{}] 在正文中未出现。覆盖率 {:.0}%。",
                        tn.event_summary,
                        missing.join("、"),
                        coverage_ratio * 100.0
                    )),
                    location: Some(format!("第{}章时间线", ctx.chapter_number)),
                    paragraph_index: None,
                });
            }
        }

        // Phase 2: Detect temporal contradictions
        // E.g., "三天后" followed by "第二天" in the same chapter
        let time_indicators = extract_time_indicators(ctx.draft_text);
        if time_indicators.len() >= 2 {
            // Check for contradictory time flow (going backwards)
            let order_keywords = [
                ("之前", "after"), ("刚才", "after"), ("此前", "after"),
                ("后来", "before"), ("之后", "before"), ("随后", "before"),
            ];
            // This is a simple heuristic — a full temporal parser would be more accurate
            for i in 1..time_indicators.len() {
                let (prev_text, prev_idx) = &time_indicators[i - 1];
                let (curr_text, curr_idx) = &time_indicators[i];
                // If a "before" keyword appears after an "after" keyword in close proximity
                if prev_text.contains("之前") && curr_text.contains("之后")
                    && curr_idx - prev_idx < 200
                {
                    issues.push(CompileIssue {
                        checker: self.name().to_string(),
                        severity: "info".to_string(),
                        message: "时间描述可能存在矛盾".to_string(),
                        detail: Some("相近段落中同时出现\"之前\"和\"之后\"，请确认时间顺序是否合理。".to_string()),
                        location: None,
                        paragraph_index: None,
                    });
                }
            }
        }

        issues
    }
}

/// Extract CJK keyword phrases from text for matching.
/// Splits on non-CJK characters and punctuation, returns phrases of min_length+ chars.
fn extract_cjk_keywords<'a>(text: &'a str, min_length: usize) -> Vec<&'a str> {
    let mut keywords = Vec::new();
    let mut start = None;

    for (i, ch) in text.char_indices() {
        let is_cjk = is_cjk_char(ch);
        if is_cjk && start.is_none() {
            start = Some(i);
        } else if !is_cjk {
            if let Some(s) = start {
                let slice = &text[s..i];
                if slice.chars().count() >= min_length {
                    keywords.push(slice);
                }
                start = None;
            }
        }
    }
    // Handle trailing CJK
    if let Some(s) = start {
        let slice = &text[s..];
        if slice.chars().count() >= min_length {
            keywords.push(slice);
        }
    }

    keywords
}

fn is_cjk_char(ch: char) -> bool {
    matches!(ch,
        '\u{4E00}'..='\u{9FFF}' |   // CJK Unified Ideographs
        '\u{3400}'..='\u{4DBF}' |   // CJK Extension A
        '\u{3000}'..='\u{303F}'     // CJK Symbols
    )
}

/// Extract time-related phrases with their byte offsets.
fn extract_time_indicators(text: &str) -> Vec<(String, usize)> {
    let patterns = [
        r"\d+天[前后]", r"\d+年[前后]", r"\d+月[前后]", r"\d+日[前后]",
        r"第\d+天", r"三天后", r"第二天", r"隔天", r"翌日",
        r"此时", r"随后", r"不久", r"片刻", r"之前", r"之后",
        r"刚才", r"此前",
    ];

    let mut results = Vec::new();
    for pattern in &patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            for mat in re.find_iter(text) {
                results.push((mat.as_str().to_string(), mat.start()));
            }
        }
    }

    results.sort_by_key(|(_, pos)| *pos);
    results
}
