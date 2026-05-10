use super::{CompileContext, CompileIssue, CompilePass};

pub struct ProseChecker;

impl CompilePass for ProseChecker {
    fn name(&self) -> &'static str {
        "ProseChecker"
    }
    fn description(&self) -> &'static str {
        "检查文本质感和段落结构"
    }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        let word_count = ctx.draft_text.chars().count();
        let paragraphs: Vec<&str> = ctx
            .draft_text
            .split("\n\n")
            .filter(|p| !p.trim().is_empty())
            .collect();
        let paragraph_count = paragraphs.len();
        let dialogue_markers = count_dialogue_markers(ctx.draft_text);

        // Check 1: Dialogue ratio
        if dialogue_markers < 2 && word_count > 1000 {
            issues.push(CompileIssue {
                checker: self.name().to_string(),
                severity: "info".to_string(),
                message: "章节缺少对话".to_string(),
                detail: Some("纯叙述章节可能读感沉闷，建议增加角色互动对话".to_string()),
                location: None,
                paragraph_index: None,
            });
        }

        // Check 2: Paragraph count
        if paragraph_count < 3 && word_count > 1000 {
            issues.push(CompileIssue {
                checker: self.name().to_string(),
                severity: "info".to_string(),
                message: "段落过少".to_string(),
                detail: Some("长文本建议适当分段，提升阅读节奏".to_string()),
                location: None,
                paragraph_index: None,
            });
        }

        // Check 3: Dialogue-to-narration ratio
        let dialogue_char_count = estimate_dialogue_chars(ctx.draft_text);
        if word_count > 500 {
            let dialogue_ratio = dialogue_char_count as f32 / word_count as f32;
            if dialogue_ratio > 0.8 {
                issues.push(CompileIssue {
                    checker: self.name().to_string(),
                    severity: "info".to_string(),
                    message: format!("对话占比过高 ({:.0}%)", dialogue_ratio * 100.0),
                    detail: Some(
                        "纯对话章节缺少环境描写和心理活动，建议增加叙述性内容以丰富阅读层次。"
                            .to_string(),
                    ),
                    location: None,
                    paragraph_index: None,
                });
            } else if dialogue_ratio < 0.1 && word_count > 2000 {
                issues.push(CompileIssue {
                    checker: self.name().to_string(),
                    severity: "info".to_string(),
                    message: format!("对话占比过低 ({:.0}%)", dialogue_ratio * 100.0),
                    detail: Some(
                        "大段纯叙述容易让读者疲劳，建议穿插对话以增加节奏变化。".to_string(),
                    ),
                    location: None,
                    paragraph_index: None,
                });
            }
        }

        // Check 4: Repetitive sentence patterns (N-gram repetition)
        let repetition_issues = detect_repetitive_patterns(ctx.draft_text);
        issues.extend(repetition_issues);

        // Check 5: Paragraph length variance
        if paragraph_count >= 4 {
            let para_lengths: Vec<usize> = paragraphs.iter().map(|p| p.chars().count()).collect();
            let avg_len = para_lengths.iter().sum::<usize>() as f32 / para_lengths.len() as f32;
            let very_long = para_lengths
                .iter()
                .filter(|&&l| l as f32 > avg_len * 3.0)
                .count();
            let very_short = para_lengths.iter().filter(|&&l| l < 20).count();

            if very_long > 0 {
                issues.push(CompileIssue {
                    checker: self.name().to_string(),
                    severity: "info".to_string(),
                    message: format!("{}个段落过长（超过平均长度的3倍）", very_long),
                    detail: Some(format!(
                        "平均段落长度{:.0}字，过长段落可能让读者难以跟进。建议拆分为更短的段落。",
                        avg_len
                    )),
                    location: None,
                    paragraph_index: None,
                });
            }

            if very_short > paragraph_count / 2 {
                issues.push(CompileIssue {
                    checker: self.name().to_string(),
                    severity: "info".to_string(),
                    message: "过半段落过短（少于20字）".to_string(),
                    detail: Some("大量极短段落可能导致阅读节奏过于碎片化。".to_string()),
                    location: None,
                    paragraph_index: None,
                });
            }
        }

        issues
    }
}

fn count_dialogue_markers(text: &str) -> usize {
    (text.matches('"').count()
        + text.matches('"').count()
        + text.matches('「').count()
        + text.matches('」').count())
        / 2
}

/// Estimate the character count of dialogue text.
fn estimate_dialogue_chars(text: &str) -> usize {
    let mut total = 0usize;
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '\u{201c}' || ch == '「' {
            let close = if ch == '\u{201c}' { '\u{201d}' } else { '」' };
            let start = i + 1;
            let mut end = None;
            for j in start..chars.len() {
                if chars[j] == close {
                    end = Some(j);
                    break;
                }
            }
            if let Some(close_idx) = end {
                total += close_idx - start;
                i = close_idx + 1;
                continue;
            }
        }
        i += 1;
    }
    total
}

/// Detect repetitive sentence-opening patterns.
fn detect_repetitive_patterns(text: &str) -> Vec<CompileIssue> {
    use std::collections::HashMap;

    let mut issues = Vec::new();
    let paragraphs: Vec<&str> = text
        .split("\n\n")
        .filter(|p| !p.trim().is_empty())
        .collect();

    // Check for repeated paragraph openings
    let openings: Vec<String> = paragraphs
        .iter()
        .map(|p| {
            let first_sentence = p
                .split(|c: char| c == '。' || c == '！' || c == '？')
                .next()
                .unwrap_or("");
            let first_sentence = first_sentence.trim();
            let opening: String = first_sentence.chars().take(4).collect();
            if opening.is_empty() {
                p.trim().chars().take(4).collect()
            } else {
                opening
            }
        })
        .collect();

    // Count opening repetitions
    let mut opening_counts: HashMap<String, usize> = HashMap::new();
    for opening in &openings {
        *opening_counts.entry(opening.clone()).or_insert(0) += 1;
    }

    for (opening, count) in &opening_counts {
        if *count >= 3 && opening.chars().count() >= 4 {
            issues.push(CompileIssue {
                checker: "ProseChecker".to_string(),
                severity: "info".to_string(),
                message: format!(
                    "段落开头重复（\"{}\" 出现{}次）",
                    truncate_str(opening, 10),
                    count
                ),
                detail: Some("重复的段落开头会让文章节奏单调，建议变换句式。".to_string()),
                location: None,
                paragraph_index: None,
            });
        }
    }

    // Check for repeated sentence-endings within the text
    let sentences: Vec<&str> = text
        .split(|c: char| c == '。' || c == '！' || c == '？')
        .map(|s| s.trim())
        .filter(|s| s.chars().count() >= 6)
        .collect();

    let mut ending_counts: HashMap<String, usize> = HashMap::new();
    for sentence in &sentences {
        let chars: Vec<char> = sentence.chars().collect();
        if chars.len() >= 4 {
            let ending: String = chars[chars.len() - 4..].iter().collect();
            *ending_counts.entry(ending).or_insert(0) += 1;
        }
    }

    for (ending, count) in &ending_counts {
        if *count >= 5 {
            issues.push(CompileIssue {
                checker: "ProseChecker".to_string(),
                severity: "info".to_string(),
                message: format!("句尾重复（\"{}\" 出现{}次）", ending, count),
                detail: Some("大量句子以相同方式结尾，建议丰富句式变化。".to_string()),
                location: None,
                paragraph_index: None,
            });
        }
    }

    issues
}

fn truncate_str(s: &str, max_chars: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_chars {
        s.to_string()
    } else {
        let truncated: String = chars[..max_chars].iter().collect();
        format!("{}...", truncated)
    }
}
