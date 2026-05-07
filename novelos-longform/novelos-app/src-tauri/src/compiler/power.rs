use super::{CompileContext, CompileIssue, CompilePass};

pub struct PowerChecker;

impl CompilePass for PowerChecker {
    fn name(&self) -> &'static str { "PowerChecker" }
    fn description(&self) -> &'static str { "检查战力异常跳变" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        let power_inconsistencies = [
            ("竟然能", "战力可能跳变"),
            ("怎么可能", "战力逻辑可能不连贯"),
            ("实力暴涨", "战力增长可能过快"),
            ("一招击败", "战力差距可能不合理"),
            ("轻松碾压", "战力差距可能不合理"),
        ];

        for (keyword, issue_desc) in &power_inconsistencies {
            if ctx.draft_text.contains(keyword) {
                issues.push(CompileIssue {
                    checker: self.name().to_string(),
                    severity: "info".to_string(),
                    message: format!("潜在战力跳变: {}", issue_desc),
                    detail: Some(format!("发现关键词 \"{}\", 请确认战力逻辑是否合理", keyword)),
                    location: None,
                });
            }
        }

        issues
    }
}
