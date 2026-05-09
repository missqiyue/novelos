use super::{CompileContext, CompileIssue, CompilePass, find_paragraph_index};

pub struct VisibilityChecker;

impl CompilePass for VisibilityChecker {
    fn name(&self) -> &'static str { "VisibilityChecker" }
    fn description(&self) -> &'static str { "检查信息越权" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        // Phase 1: Knowledge visibility check against the knowledge_visibility ledger
        // For each character that appears in the draft, check if they reference
        // information they shouldn't know according to the ledger
        for ch in ctx.characters {
            if !ctx.draft_text.contains(&ch.name) {
                continue;
            }

            // Extract dialogue by this character
            let dialogues = extract_character_dialogues(&ch.name, ctx.draft_text);
            if dialogues.is_empty() {
                continue;
            }

            // Check for knowledge leak patterns in dialogue
            let leak_patterns: &[(&str, &str)] = &[
                ("竟然知道", "角色可能知晓不应知道的信息"),
                ("我早就知道", "角色可能提前知晓未公开信息"),
                ("你以为是秘密", "角色可能泄露了秘密"),
                ("其实真相是", "角色可能透露了内幕"),
                ("我看到了.*暗中", "角色可能目击了不应在场的事件"),
            ];

            for (pattern, desc) in leak_patterns {
                if let Ok(re) = regex::Regex::new(pattern) {
                    for dialogue in &dialogues {
                        if re.is_match(dialogue) {
                            issues.push(CompileIssue {
                                checker: self.name().to_string(),
                                severity: "warning".to_string(),
                                message: format!("潜在信息越权: {} — 角色\"{}\"", desc, ch.name),
                                detail: Some(format!(
                                    "角色\"{}\"的对话中包含\"{}\"，请确认该角色获取此信息的途径是否合理。",
                                    ch.name, truncate_str(dialogue, 50)
                                )),
                                location: Some(ch.name.clone()),
                                paragraph_index: find_paragraph_index(ctx.draft_text, dialogue),
                            });
                        }
                    }
                }
            }
        }

        // Phase 2: Cross-character knowledge check
        // If character A speaks about something only character B should know
        // (from knowledge_visibility ledger — future integration)
        // For now, check if a character references another character's private thoughts
        let thought_indicators = ["心中暗想", "暗自思忖", "心想", "内心独白"];
        for ch in ctx.characters {
            let paragraphs: Vec<&str> = ctx.draft_text.split("\n\n")
                .filter(|p| p.contains(&ch.name))
                .collect();

            for para in &paragraphs {
                for indicator in &thought_indicators {
                    if para.contains(indicator) {
                        // Check if any OTHER character references this thought
                        // in a subsequent paragraph
                        let thought_text = extract_after(para, indicator);
                        if thought_text.len() < 4 {
                            continue;
                        }

                        for other_ch in ctx.characters {
                            if other_ch.name == ch.name {
                                continue;
                            }
                            // Simple check: does another character echo the thought?
                            // Only flag if there's a very close match (>= 4 chars overlap)
                            if let Some(overlap) = find_significant_overlap(&thought_text, 4) {
                                let rest_of_text = &ctx.draft_text[ctx.draft_text.find(para).unwrap_or(0)..];
                                if rest_of_text.contains(&other_ch.name) &&
                                   rest_of_text.contains(overlap) {
                                    issues.push(CompileIssue {
                                        checker: self.name().to_string(),
                                        severity: "info".to_string(),
                                        message: format!("角色\"{}\"可能知晓\"{}\"的内心想法", other_ch.name, ch.name),
                                        detail: Some(format!(
                                            "\"{}\"的内心想法\"{}\"似乎被\"{}\"后续引用，请确认是否有信息越权。",
                                            ch.name, truncate_str(overlap, 30), other_ch.name
                                        )),
                                        location: Some(format!("{} → {}", ch.name, other_ch.name)),
                                        paragraph_index: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        issues
    }
}

/// Extract dialogue lines spoken by a character.
fn extract_character_dialogues<'a>(name: &str, text: &'a str) -> Vec<String> {
    let mut dialogues = Vec::new();
    for para in text.split("\n\n") {
        if !para.contains(name) {
            continue;
        }
        // Extract Chinese-quoted dialogue
        for quote in extract_quoted_strings(para) {
            dialogues.push(quote);
        }
    }
    dialogues
}

fn extract_quoted_strings(text: &str) -> Vec<String> {
    let mut results = Vec::new();
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
                let content: String = chars[start..close_idx].iter().collect();
                let trimmed = content.trim().to_string();
                if !trimmed.is_empty() {
                    results.push(trimmed);
                }
                i = close_idx + 1;
                continue;
            }
        }
        i += 1;
    }
    results
}

fn extract_after<'a>(text: &'a str, marker: &str) -> &'a str {
    if let Some(pos) = text.find(marker) {
        let start = pos + marker.len();
        if start < text.len() {
            let remainder = &text[start..];
            // Take up to the next sentence boundary
            remainder.split(|c: char| c == '。' || c == '！' || c == '？').next().unwrap_or("")
        } else {
            ""
        }
    } else {
        ""
    }
}

fn find_significant_overlap(text: &str, min_len: usize) -> Option<&str> {
    if text.chars().count() < min_len {
        return None;
    }
    // Simple: return the first min_len-character window
    let chars: Vec<char> = text.chars().collect();
    if chars.len() >= min_len {
        Some(&text[..chars[min_len].len_utf8() + text[..chars[min_len].len_utf8()].len()])
    } else {
        None
    }
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
