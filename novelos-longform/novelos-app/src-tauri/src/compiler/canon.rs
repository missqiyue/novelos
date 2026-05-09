use super::{CompileContext, CompileIssue, CompilePass, find_paragraph_index};

pub struct CanonChecker;

impl CompilePass for CanonChecker {
    fn name(&self) -> &'static str { "CanonChecker" }
    fn description(&self) -> &'static str { "检查硬规则/软规则冲突" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        for rule in ctx.canon_rules {
            if rule.content.is_empty() {
                continue;
            }

            // Phase 1: Prohibition-based detection
            let prohibitions = extract_prohibitions(&rule.content);
            for proh in &prohibitions {
                let term = extract_prohibited_term(proh);
                if term.is_empty() {
                    continue;
                }

                // Exact match check
                if ctx.draft_text.contains(term) {
                    if !is_negated_in_context(ctx.draft_text, term) {
                        issues.push(CompileIssue {
                            checker: self.name().to_string(),
                            severity: if rule.is_hard { "error".to_string() } else { "warning".to_string() },
                            message: format!("违反正典规则: {}", rule.rule_name),
                            detail: Some(format!("发现禁止内容: \"{}\"", term)),
                            location: None,
                            paragraph_index: find_paragraph_index(ctx.draft_text, term),
                        });
                    }
                }

                // Fuzzy match: check for similar terms (edit distance ≤ 1 for short terms)
                if term.chars().count() >= 2 && term.chars().count() <= 6 {
                    let fuzzy_matches = find_fuzzy_matches(ctx.draft_text, term, 1);
                    for fuzzy in fuzzy_matches {
                        if fuzzy != term && !is_negated_in_context(ctx.draft_text, &fuzzy) {
                            issues.push(CompileIssue {
                                checker: self.name().to_string(),
                                severity: if rule.is_hard { "warning".to_string() } else { "info".to_string() },
                                message: format!("疑似违反正典规则: {}", rule.rule_name),
                                detail: Some(format!(
                                    "发现与禁止内容\"{}\"相近的词\"{}\"，请确认是否违规。",
                                    term, fuzzy
                                )),
                                location: None,
                                paragraph_index: find_paragraph_index(ctx.draft_text, &fuzzy),
                            });
                        }
                    }
                }
            }

            // Phase 2: Positive requirement check
            let requirements = extract_requirements(&rule.content);
            for req in &requirements {
                let term = extract_required_term(req);
                if !term.is_empty() && !ctx.draft_text.contains(term) {
                    issues.push(CompileIssue {
                        checker: self.name().to_string(),
                        severity: if rule.is_hard { "warning".to_string() } else { "info".to_string() },
                        message: format!("可能缺少必要内容: {}", rule.rule_name),
                        detail: Some(format!(
                            "正典规则要求\"{}\"，但正文中未找到\"{}\"。",
                            req, term
                        )),
                        location: None,
                        paragraph_index: None,
                    });
                }
            }
        }

        issues
    }
}

fn extract_prohibitions<'a>(content: &'a str) -> Vec<&'a str> {
    content
        .split(|c: char| c == '；' || c == ';' || c == '\n')
        .filter(|s| {
            s.contains("不得") || s.contains("禁止") || s.contains("不允许") || s.contains("不能")
                || s.contains("不可") || s.contains("严禁") || s.contains("绝不可")
        })
        .collect()
}

fn extract_requirements<'a>(content: &'a str) -> Vec<&'a str> {
    content
        .split(|c: char| c == '；' || c == ';' || c == '\n')
        .filter(|s| s.contains("必须") || s.contains("需要") || s.contains("应当") || s.contains("务必"))
        .collect()
}

fn extract_prohibited_term(proh: &str) -> &str {
    proh
        .split("不得").last()
        .or_else(|| proh.split("禁止").last())
        .or_else(|| proh.split("不允许").last())
        .or_else(|| proh.split("不能").last())
        .or_else(|| proh.split("不可").last())
        .or_else(|| proh.split("严禁").last())
        .or_else(|| proh.split("绝不可").last())
        .unwrap_or(proh)
        .trim()
}

fn extract_required_term(req: &str) -> &str {
    req
        .split("必须").last()
        .or_else(|| req.split("需要").last())
        .or_else(|| req.split("应当").last())
        .or_else(|| req.split("务必").last())
        .unwrap_or(req)
        .trim()
}

fn is_negated_in_context(text: &str, term: &str) -> bool {
    if let Some(pos) = text.find(term) {
        let before_start = pos.saturating_sub(30);
        let before = &text[before_start..pos];
        let negation_words = ["没有", "不会", "并未", "并非", "不是", "再也不会", "从未"];
        for neg in &negation_words {
            if before.contains(neg) {
                return true;
            }
        }
    }
    false
}

fn find_fuzzy_matches(text: &str, term: &str, max_distance: usize) -> Vec<String> {
    let term_len = term.chars().count();
    let mut matches = Vec::new();
    let chars: Vec<char> = text.chars().collect();

    for window_len in term_len.saturating_sub(1)..=term_len + 1 {
        for i in 0..=chars.len().saturating_sub(window_len) {
            let end = i + window_len;
            let window: &[char] = &chars[i..end];
            if window.iter().all(|&c| is_cjk(c)) {
                let word: String = window.iter().collect();
                let dist = levenshtein_distance(term, &word);
                if dist <= max_distance && dist > 0 {
                    matches.push(word);
                }
            }
        }
    }

    matches.sort();
    matches.dedup();
    matches
}

fn is_cjk(ch: char) -> bool {
    matches!(ch, '\u{4E00}'..='\u{9FFF}' | '\u{3400}'..='\u{4DBF}')
}

fn levenshtein_distance(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let a_len = a_chars.len();
    let b_len = b_chars.len();

    if a_len == 0 { return b_len; }
    if b_len == 0 { return a_len; }

    let mut matrix = vec![vec![0; b_len + 1]; a_len + 1];
    for i in 0..=a_len { matrix[i][0] = i; }
    for j in 0..=b_len { matrix[0][j] = j; }

    for i in 1..=a_len {
        for j in 1..=b_len {
            let cost = if a_chars[i-1] == b_chars[j-1] { 0 } else { 1 };
            matrix[i][j] = (matrix[i-1][j] + 1)
                .min(matrix[i][j-1] + 1)
                .min(matrix[i-1][j-1] + cost);
        }
    }

    matrix[a_len][b_len]
}
