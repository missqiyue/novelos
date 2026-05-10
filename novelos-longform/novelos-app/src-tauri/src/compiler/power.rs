use super::{find_paragraph_index, CompileContext, CompileIssue, CompilePass};

pub struct PowerChecker;

impl CompilePass for PowerChecker {
    fn name(&self) -> &'static str {
        "PowerChecker"
    }
    fn description(&self) -> &'static str {
        "检查战力异常跳变"
    }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        // Phase 1: Keyword-based heuristics (refined with more context)
        let power_jump_patterns: &[(&str, &str, &str)] = &[
            // (pattern, issue_description, required_context)
            // "竟然能" alone is too broad — only flag if preceded by a character reference
            ("竟然能", "战力可能跳变", "character"),
            ("怎么可能.*打败", "战力逻辑可能不连贯", "any"),
            ("实力暴涨", "战力增长可能过快", "any"),
            ("瞬间突破", "战力增长可能过快", "any"),
            ("一招击败.*强者", "战力差距可能不合理", "any"),
            ("轻松碾压.*境", "战力差距可能不合理", "any"),
        ];

        let paragraphs: Vec<&str> = ctx
            .draft_text
            .split("\n\n")
            .filter(|p| !p.trim().is_empty())
            .collect();

        for (pattern, issue_desc, context_req) in power_jump_patterns {
            if let Ok(re) = regex::Regex::new(pattern) {
                for (idx, para) in paragraphs.iter().enumerate() {
                    for mat in re.find_iter(para) {
                        let matched_text = mat.as_str();
                        let should_flag = match *context_req {
                            "character" => {
                                // Only flag if the paragraph mentions a known character
                                ctx.characters.iter().any(|ch| para.contains(&ch.name))
                            }
                            _ => true,
                        };

                        if should_flag {
                            issues.push(CompileIssue {
                                checker: self.name().to_string(),
                                severity: "info".to_string(),
                                message: format!("潜在战力跳变: {}", issue_desc),
                                detail: Some(format!(
                                    "发现关键词 \"{}\", 请确认战力逻辑是否合理。如属合理设定，可忽略。",
                                    matched_text
                                )),
                                location: None,
                                paragraph_index: Some(idx),
                            });
                        }
                    }
                }
            }
        }

        // Phase 2: Character power consistency check
        // If a character is described with contradictory power levels
        // (e.g., "弱小" and "无敌" in the same chapter), flag it
        let weak_indicators = ["弱小", "不堪一击", "手无缚鸡", "凡人", "低阶", "普通"];
        let strong_indicators = ["无敌", "至强", "碾压", "秒杀", "天下第一", "最强"];

        for ch in ctx.characters {
            let mut weak_mentions = Vec::new();
            let mut strong_mentions = Vec::new();

            for (idx, para) in paragraphs.iter().enumerate() {
                if !para.contains(&ch.name) {
                    continue;
                }
                for weak in &weak_indicators {
                    if para.contains(weak) {
                        weak_mentions.push((idx, *weak));
                    }
                }
                for strong in &strong_indicators {
                    if para.contains(strong) {
                        strong_mentions.push((idx, *strong));
                    }
                }
            }

            // If same character has both weak and strong mentions, flag
            if !weak_mentions.is_empty() && !strong_mentions.is_empty() {
                let (weak_idx, weak_word) = weak_mentions[0];
                let (strong_idx, strong_word) = strong_mentions[0];
                issues.push(CompileIssue {
                    checker: self.name().to_string(),
                    severity: "warning".to_string(),
                    message: format!("角色\"{}\"战力矛盾", ch.name),
                    detail: Some(format!(
                        "\"{}\"在第{}段被描述为\"{}\"，但在第{}段又被描述为\"{}\"。请确认是否有合理解释（如突破、伪装等）。",
                        ch.name, weak_idx + 1, weak_word, strong_idx + 1, strong_word
                    )),
                    location: Some(ch.name.clone()),
                    paragraph_index: None,
                });
            }
        }

        issues
    }
}
