use super::{CompileContext, CompileIssue, CompilePass};

pub struct ProseChecker;

impl CompilePass for ProseChecker {
    fn name(&self) -> &'static str { "ProseChecker" }
    fn description(&self) -> &'static str { "检查文本质感和段落结构" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        let dialogue_markers = (ctx.draft_text.matches('"').count()
            + ctx.draft_text.matches('"').count()
            + ctx.draft_text.matches('「').count()
            + ctx.draft_text.matches('」').count()) / 2;

        let word_count = ctx.draft_text.chars().count();
        let paragraph_count = ctx.draft_text.split("\n\n").filter(|p| !p.trim().is_empty()).count();

        if dialogue_markers < 2 {
            issues.push(CompileIssue {
                checker: self.name().to_string(),
                severity: "info".to_string(),
                message: "章节缺少对话".to_string(),
                detail: Some("纯叙述章节可能读感沉闷，建议增加角色互动对话".to_string()),
                location: None,
            });
        }

        if paragraph_count < 3 && word_count > 1000 {
            issues.push(CompileIssue {
                checker: self.name().to_string(),
                severity: "info".to_string(),
                message: "段落过少".to_string(),
                detail: Some("长文本建议适当分段，提升阅读节奏".to_string()),
                location: None,
            });
        }

        issues
    }
}
