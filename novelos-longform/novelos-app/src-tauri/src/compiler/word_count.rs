use super::{CompileContext, CompileIssue, CompilePass};

pub struct WordCountChecker;

impl CompilePass for WordCountChecker {
    fn name(&self) -> &'static str { "WordCountChecker" }
    fn description(&self) -> &'static str { "检查字数范围" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();
        let word_count = ctx.draft_text.chars().count();

        if word_count < ctx.min_words {
            issues.push(CompileIssue {
                checker: self.name().to_string(),
                severity: "warning".to_string(),
                message: format!("字数偏少: {}字 (建议 {}-{}字)", word_count, ctx.min_words, ctx.max_words),
                detail: Some("考虑增加环境描写、角色心理活动或对话来扩充内容".to_string()),
                location: None,
            });
        }
        if word_count > ctx.max_words {
            issues.push(CompileIssue {
                checker: self.name().to_string(),
                severity: "info".to_string(),
                message: format!("字数偏多: {}字 (建议 {}-{}字)", word_count, ctx.max_words, ctx.min_words),
                detail: Some("考虑拆分长章节或在修订时精简冗余描写".to_string()),
                location: None,
            });
        }

        issues
    }
}
