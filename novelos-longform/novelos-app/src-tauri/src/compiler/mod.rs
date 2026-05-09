use serde::{Deserialize, Serialize};

mod canon;
mod character;
mod foreshadow;
mod power;
mod prose;
mod timeline;
mod visibility;
mod word_count;

pub use canon::CanonChecker;
pub use character::CharacterChecker;
pub use foreshadow::ForeshadowChecker;
pub use power::PowerChecker;
pub use prose::ProseChecker;
pub use timeline::TimelineChecker;
pub use visibility::VisibilityChecker;
pub use word_count::WordCountChecker;

// ─── Shared types ───

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileResult {
    pub status: String,
    pub score: i32,
    pub issues: Vec<CompileIssue>,
    pub stats: CompileStats,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileIssue {
    pub checker: String,
    pub severity: String,
    pub message: String,
    pub detail: Option<String>,
    pub location: Option<String>,
    pub paragraph_index: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompileStats {
    pub word_count: usize,
    pub paragraph_count: usize,
    pub dialogue_markers: usize,
    pub hard_rules_checked: usize,
    pub hard_rules_violated: usize,
    pub soft_rules_checked: usize,
    pub soft_rules_violated: usize,
    pub characters_referenced: Vec<String>,
    pub characters_missing_soul: Vec<String>,
    pub foreshadow_items_checked: usize,
    pub foreshadow_items_overdue: usize,
}

pub struct CompileContext<'a> {
    pub draft_text: &'a str,
    pub canon_rules: &'a [CanonRuleForCompiler],
    pub characters: &'a [CharacterForCompiler],
    pub foreshadow_items: &'a [ForeshadowForCompiler],
    pub timeline_nodes: &'a [TimelineForCompiler],
    pub min_words: usize,
    pub max_words: usize,
    pub chapter_number: i64,
}

pub struct CanonRuleForCompiler {
    pub rule_name: String,
    pub content: String,
    pub is_hard: bool,
    pub scope_type: String,
}

pub struct CharacterForCompiler {
    pub name: String,
    pub role_type: String,
    pub soul_json: String,
}

pub struct ForeshadowForCompiler {
    pub id: String,
    pub title: Option<String>,
    pub status: String,
    pub seed_chapter: Option<i64>,
}

pub struct TimelineForCompiler {
    pub id: String,
    pub event_summary: String,
    pub chapter_number: Option<i64>,
}

// ─── Pluggable rule engine trait ───

pub trait CompilePass {
    fn name(&self) -> &'static str;
    fn description(&self) -> &'static str;
    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue>;
}

// ─── Rule descriptions (derived from registered passes) ───

#[derive(Debug, Serialize, Deserialize)]
pub struct CompilerRuleDescription {
    pub checker_name: String,
    pub description: String,
}

pub fn get_compiler_rule_descriptions() -> Vec<CompilerRuleDescription> {
    let passes = default_passes();
    passes.iter().map(|p| CompilerRuleDescription {
        checker_name: p.name().to_string(),
        description: p.description().to_string(),
    }).collect()
}

// ─── Default pass registry ───

fn default_passes() -> Vec<Box<dyn CompilePass>> {
    vec![
        Box::new(CanonChecker),
        Box::new(CharacterChecker),
        Box::new(ForeshadowChecker),
        Box::new(TimelineChecker),
        Box::new(PowerChecker),
        Box::new(VisibilityChecker),
        Box::new(WordCountChecker),
        Box::new(ProseChecker),
    ]
}

// ─── Main entry point ───

/// Find the paragraph index (0-based) where a search string first appears.
/// Paragraphs are split on double-newline; empty paragraphs are skipped.
pub fn find_paragraph_index(draft_text: &str, search: &str) -> Option<usize> {
    let paragraphs: Vec<&str> = draft_text.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
    for (i, para) in paragraphs.iter().enumerate() {
        if para.contains(search) {
            return Some(i);
        }
    }
    None
}

/// Extract a specific paragraph by 0-based index.
pub fn get_paragraph_by_index(draft_text: &str, index: usize) -> Option<String> {
    let paragraphs: Vec<&str> = draft_text.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
    paragraphs.get(index).map(|s| s.to_string())
}

pub fn run_compiler(ctx: &CompileContext) -> CompileResult {
    let passes = default_passes();
    run_compiler_with_passes(ctx, &passes)
}

pub fn run_compiler_with_passes(ctx: &CompileContext, passes: &[Box<dyn CompilePass>]) -> CompileResult {
    let mut issues: Vec<CompileIssue> = Vec::new();

    let word_count = ctx.draft_text.chars().count();
    let paragraphs: Vec<&str> = ctx.draft_text.split("\n\n").filter(|p| !p.trim().is_empty()).collect();
    let paragraph_count = paragraphs.len();
    let dialogue_markers = (ctx.draft_text.matches('"').count()
        + ctx.draft_text.matches('"').count()
        + ctx.draft_text.matches('「').count()
        + ctx.draft_text.matches('」').count()) / 2;

    for pass in passes {
        issues.extend(pass.check(ctx));
    }

    // Derive stats from collected issues
    let hard_rules_violated = issues.iter()
        .filter(|i| i.checker == "CanonChecker" && i.severity == "error")
        .count();
    let soft_rules_violated = issues.iter()
        .filter(|i| i.checker == "CanonChecker" && i.severity == "warning")
        .count();
    let characters_missing_soul = issues.iter()
        .filter(|i| i.checker == "CharacterChecker" && i.severity == "warning")
        .map(|i| i.location.clone().unwrap_or_default())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>();
    let foreshadow_overdue = issues.iter()
        .filter(|i| i.checker == "ForeshadowChecker")
        .count();

    let characters_referenced: Vec<String> = ctx.characters.iter()
        .filter(|ch| ctx.draft_text.contains(&ch.name))
        .map(|ch| ch.name.clone())
        .collect();

    // Calculate score
    let error_count = issues.iter().filter(|i| i.severity == "error").count();
    let warning_count = issues.iter().filter(|i| i.severity == "warning").count();
    let score = (100i32 - (error_count as i32 * 20) - (warning_count as i32 * 5)).max(0);

    // Generate suggestions
    let mut suggestions = Vec::new();
    if hard_rules_violated > 0 {
        suggestions.push(format!("修复 {} 条硬规则违规后重新提交", hard_rules_violated));
    }
    if !characters_missing_soul.is_empty() {
        suggestions.push(format!("为以下角色设置SOUL数据以启用口吻检查: {}", characters_missing_soul.join(", ")));
    }
    if word_count < ctx.min_words {
        suggestions.push("增加内容使字数达到建议范围".to_string());
    }
    if foreshadow_overdue > 0 {
        suggestions.push("检查超过30章未回收的伏笔，决定回收或废弃".to_string());
    }
    if suggestions.is_empty() && score >= 80 {
        suggestions.push("章节质量良好，可以进入审阅流程".to_string());
    }

    let status = if error_count > 0 {
        "fail"
    } else if warning_count > 2 {
        "warning"
    } else {
        "pass"
    };

    let hard_rules_checked = ctx.canon_rules.iter().filter(|r| r.is_hard).count();
    let soft_rules_checked = ctx.canon_rules.iter().filter(|r| !r.is_hard).count();

    CompileResult {
        status: status.to_string(),
        score,
        stats: CompileStats {
            word_count,
            paragraph_count,
            dialogue_markers,
            hard_rules_checked,
            hard_rules_violated,
            soft_rules_checked,
            soft_rules_violated,
            characters_referenced,
            characters_missing_soul,
            foreshadow_items_checked: ctx.foreshadow_items.len(),
            foreshadow_items_overdue: foreshadow_overdue,
        },
        issues,
        suggestions,
    }
}

/// CMP-009: Determine whether a compile result should block chapter approval.
pub fn should_block_approval(result: &CompileResult) -> bool {
    result.status == "fail"
}

/// CMP-010: Return the severity thresholds for compile issues.
pub fn get_severity_threshold() -> (usize, usize) {
    (5, 10)
}
