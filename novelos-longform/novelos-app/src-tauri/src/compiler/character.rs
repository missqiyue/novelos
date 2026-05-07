use super::{CompileContext, CompileIssue, CompilePass};

pub struct CharacterChecker;

impl CompilePass for CharacterChecker {
    fn name(&self) -> &'static str { "CharacterChecker" }
    fn description(&self) -> &'static str { "检查角色SOUL完整性+口吻偏移" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();
        let mut referenced: Vec<String> = Vec::new();

        for ch in ctx.characters {
            if ctx.draft_text.contains(&ch.name) {
                referenced.push(ch.name.clone());
                if ch.soul_json == "{}" || ch.soul_json.is_empty() {
                    issues.push(CompileIssue {
                        checker: self.name().to_string(),
                        severity: "warning".to_string(),
                        message: format!("角色 {} 缺少SOUL数据", ch.name),
                        detail: Some("未设置SOUL的角色无法进行口吻一致性检查".to_string()),
                        location: Some(ch.name.clone()),
                    });
                    continue;
                }
                // Check speech consistency for characters with SOUL data
                issues.extend(check_speech_consistency(&ch.name, &ch.soul_json, ctx.draft_text));
            }
        }

        // Check dialogue attribution patterns for untracked characters
        let paragraphs: Vec<&str> = ctx.draft_text.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
        for para in &paragraphs {
            if para.contains("说") || para.contains("道") || para.contains("问") {
                for ch in ctx.characters {
                    if para.contains(&ch.name) && !referenced.contains(&ch.name) {
                        referenced.push(ch.name.clone());
                    }
                }
            }
        }

        issues
    }
}

/// Extract speech attributes from soul_json.
/// Supports three formats:
/// 1. Character format: nested inside customization.speech
/// 2. Template format: top-level keys (tone, habits, catchphrases, etc.)
/// 3. Direct speech key: { "speech": { ... } }
fn extract_speech_profile(soul_json: &str) -> Option<SpeechProfile> {
    let val: serde_json::Value = serde_json::from_str(soul_json).ok()?;

    // Try character-level format first: customization.speech
    let speech_obj = val
        .get("customization")
        .and_then(|c| c.get("speech"))
        .cloned()
        // Then try direct speech key
        .or_else(|| val.get("speech").cloned());

    // If we found a speech object, extract from it
    if let Some(s) = speech_obj {
        if s.is_object() {
            return Some(build_profile_from_speech_obj(&val, &s));
        }
    }

    // Fallback: template format — speech keys are at top level (tone, habits, catchphrases)
    let has_speech_keys = val.get("tone").is_some()
        || val.get("pattern").is_some()
        || val.get("habits").is_some()
        || val.get("catchphrases").is_some()
        || val.get("catchphrase").is_some();

    if has_speech_keys {
        return Some(build_profile_from_speech_obj(&val, &val));
    }

    None
}

fn build_profile_from_speech_obj(root: &serde_json::Value, speech: &serde_json::Value) -> SpeechProfile {
    let tone = speech.get("tone").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let pattern = speech.get("pattern")
        .or_else(|| speech.get("sentence_pattern"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let catchphrase = speech.get("catchphrase")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let catchphrases: Vec<String> = speech.get("catchphrases")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let habits: Vec<String> = speech.get("habits")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    let speech_examples: Vec<String> = root.get("speech_examples")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
        .unwrap_or_default();

    SpeechProfile {
        tone,
        pattern,
        catchphrase,
        catchphrases,
        habits,
        speech_examples,
    }
}

struct SpeechProfile {
    tone: String,
    pattern: String,
    catchphrase: String,
    catchphrases: Vec<String>,
    habits: Vec<String>,
    speech_examples: Vec<String>,
}

/// Check speech consistency: extract dialogue lines attributed to a character,
/// then compare against their SOUL speech profile.
fn check_speech_consistency(name: &str, soul_json: &str, draft_text: &str) -> Vec<CompileIssue> {
    let profile = match extract_speech_profile(soul_json) {
        Some(p) => p,
        None => return Vec::new(),
    };

    let dialogues = extract_character_dialogues(name, draft_text);
    if dialogues.is_empty() {
        return Vec::new();
    }

    let mut issues = Vec::new();

    // 1. Check for terseness mismatch
    // If tone/pattern suggests brevity (简洁/简短/少), flag overly long dialogue
    let is_terse = profile.tone.contains("简洁")
        || profile.tone.contains("简短")
        || profile.tone.contains("少")
        || profile.pattern.contains("短句")
        || profile.habits.iter().any(|h| h.contains("少") || h.contains("简短"));

    if is_terse {
        for line in &dialogues {
            let char_count = line.chars().count();
            // Terse characters shouldn't deliver monologues > 100 chars
            if char_count > 100 {
                issues.push(CompileIssue {
                    checker: "CharacterChecker".to_string(),
                    severity: "warning".to_string(),
                    message: format!("角色 {} 的对话偏长（{}字），与SOUL口吻「{}」不一致", name, char_count, profile.tone),
                    detail: Some(format!(
                        "SOUL设定为简洁型口吻，但此处对话超过100字。建议拆分为短句或减少话语。\n对话内容：{}",
                        truncate_str(line, 80)
                    )),
                    location: Some(name.to_string()),
                });
            }
        }
    }

    // 2. Check for verbose mismatch
    // If tone suggests verbosity (啰嗦/多/详细), flag very short dialogue
    let is_verbose = profile.tone.contains("啰嗦")
        || profile.tone.contains("多")
        || profile.tone.contains("详细")
        || profile.tone.contains("热情")
        || profile.pattern.contains("长句");

    if is_verbose {
        for line in &dialogues {
            let char_count = line.chars().count();
            // Verbose characters shouldn't give one-word answers
            if char_count > 0 && char_count < 5 {
                issues.push(CompileIssue {
                    checker: "CharacterChecker".to_string(),
                    severity: "info".to_string(),
                    message: format!("角色 {} 的对话过短（{}字），与SOUL口吻「{}」不太一致", name, char_count, profile.tone),
                    detail: Some(format!(
                        "SOUL设定为多言型口吻，此处对话仅{}字。是否需要补充？",
                        char_count
                    )),
                    location: Some(name.to_string()),
                });
            }
        }
    }

    // 3. Check for catchphrase absence — if a catchphrase is defined but never used
    // This is informational only (characters don't need to use catchphrases every chapter)
    // Skip this check to avoid noise

    // 4. Check for taboo words / patterns if habits define "不说" or negative patterns
    let forbidden_patterns: Vec<&str> = profile.habits.iter()
        .filter_map(|h| {
            if h.starts_with("不说") || h.starts_with("从不") || h.starts_with("绝不说") {
                Some(h.trim_start_matches("不说").trim_start_matches("从不").trim_start_matches("绝不说").trim())
            } else {
                None
            }
        })
        .collect();

    for line in &dialogues {
        for forbidden in &forbidden_patterns {
            if !forbidden.is_empty() && line.contains(forbidden) {
                issues.push(CompileIssue {
                    checker: "CharacterChecker".to_string(),
                    severity: "warning".to_string(),
                    message: format!("角色 {} 使用了禁忌用语「{}」", name, forbidden),
                    detail: Some(format!(
                        "SOUL习惯设定中标记为不说的用语出现在对话中。是否需要修改？\n对话内容：{}",
                        truncate_str(line, 80)
                    )),
                    location: Some(name.to_string()),
                });
            }
        }
    }

    // Cap: max 3 speech warnings per character to avoid flooding
    issues.truncate(3);
    issues
}

/// Extract dialogue lines attributed to a given character from the draft text.
/// Handles Chinese quotation marks: "..." and 「...」
/// A line is attributed to a character if their name appears near the dialogue
/// (same paragraph, or within attribution markers like 说道/问/道).
fn extract_character_dialogues<'a>(name: &str, text: &'a str) -> Vec<String> {
    let mut dialogues = Vec::new();

    // Split by paragraphs
    for para in text.split("\n\n") {
        if !para.contains(name) {
            continue;
        }

        // Extract all Chinese-quoted dialogue from this paragraph
        for line in extract_quoted_strings(para) {
            dialogues.push(line);
        }
    }

    dialogues
}

/// Extract all strings enclosed in Chinese quotation marks from text.
fn extract_quoted_strings(text: &str) -> Vec<String> {
    let mut results = Vec::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        if ch == '\u{201c}' || ch == '「' {
            // \u{201c} is left double quotation mark "
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

/// Truncate a string to max_chars, adding ellipsis if needed.
fn truncate_str(s: &str, max_chars: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max_chars {
        s.to_string()
    } else {
        let truncated: String = chars[..max_chars].iter().collect();
        format!("{}...", truncated)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_quoted_strings() {
        let text = "张三说：\u{201c}你好，世界。\u{201d}然后走了。";
        let quotes = extract_quoted_strings(text);
        assert_eq!(quotes, vec!["你好，世界。"]);
    }

    #[test]
    fn test_extract_multiple_quotes() {
        let text = "李四道：\u{300c}第一句\u{300d}王五说：\u{300c}第二句\u{300d}";
        let quotes = extract_quoted_strings(text);
        assert_eq!(quotes, vec!["第一句", "第二句"]);
    }

    #[test]
    fn test_extract_speech_profile_template_format() {
        let soul = r#"{"tone":"简洁有力","vocabulary":"精炼","habits":["少说废话","点破关键"],"catchphrases":["不必多说"]}"#;
        let profile = extract_speech_profile(soul).unwrap();
        assert_eq!(profile.tone, "简洁有力");
        assert_eq!(profile.habits, vec!["少说废话", "点破关键"]);
        assert_eq!(profile.catchphrases, vec!["不必多说"]);
    }

    #[test]
    fn test_extract_speech_profile_character_format() {
        let soul = r#"{"matched_template":"热血少年","customization":{"speech":{"tone":"坚定有力","pattern":"短句为主","catchphrase":"星辰不灭"}},"speech_examples":["星辰不灭"]}"#;
        let profile = extract_speech_profile(soul).unwrap();
        assert_eq!(profile.tone, "坚定有力");
        assert_eq!(profile.pattern, "短句为主");
        assert_eq!(profile.catchphrase, "星辰不灭");
    }

    #[test]
    fn test_terse_character_long_dialogue_warning() {
        let soul = r#"{"customization":{"speech":{"tone":"简洁有力","pattern":"短句为主"}}}"#;
        let draft = "张三想了想，说道：\u{201c}其实我早就想告诉你，这件事情的来龙去脉非常复杂，需要从很久以前说起，那时候我还是一个年轻的修士，刚刚踏入修仙之路，什么都不懂，只是凭着一腔热血在九州大陆上四处闯荡，经历过无数生死考验之后才终于明白了修仙的真谛所在。\u{201d}";
        let issues = check_speech_consistency("张三", soul, draft);
        assert!(!issues.is_empty());
        assert!(issues[0].message.contains("偏长"));
    }

    #[test]
    fn test_no_warning_for_matching_speech() {
        let soul = r#"{"customization":{"speech":{"tone":"啰嗦详细","pattern":"长句为主"}}}"#;
        let draft = "张三说：\u{201c}这话说来就长了。\u{201d}";
        let issues = check_speech_consistency("张三", soul, draft);
        // No terseness/verbosity warnings expected
        assert!(issues.is_empty());
    }

    #[test]
    fn test_forbidden_word_detection() {
        let soul_with_habits = r#"{"customization":{"speech":{"tone":"冷酷","pattern":"短句","habits":["不说谢谢"]}}}"#;
        let draft = "张三说：\u{201c}谢谢你的帮助。\u{201d}";
        let issues = check_speech_consistency("张三", soul_with_habits, draft);
        assert!(issues.iter().any(|i| i.message.contains("禁忌用语")));
    }
}
