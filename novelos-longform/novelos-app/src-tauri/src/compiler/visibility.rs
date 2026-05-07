use super::{CompileContext, CompileIssue, CompilePass};

pub struct VisibilityChecker;

impl CompilePass for VisibilityChecker {
    fn name(&self) -> &'static str { "VisibilityChecker" }
    fn description(&self) -> &'static str { "检查信息越权" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        let knowledge_leak_patterns = [
            ("竟然知道", "信息越权"),
            ("不知为何", "角色认知可能有问题"),
            ("明明是秘密", "秘密信息可能泄露"),
        ];

        for (keyword, issue_desc) in &knowledge_leak_patterns {
            if ctx.draft_text.contains(keyword) {
                issues.push(CompileIssue {
                    checker: self.name().to_string(),
                    severity: "info".to_string(),
                    message: format!("潜在信息越权: {}", issue_desc),
                    detail: Some(format!("发现关键词 \"{}\", 请确认角色获取此信息的途径是否合理", keyword)),
                    location: None,
                });
            }
        }

        issues
    }
}
