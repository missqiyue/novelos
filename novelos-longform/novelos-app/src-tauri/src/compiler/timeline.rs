use super::{CompileContext, CompileIssue, CompilePass};

pub struct TimelineChecker;

impl CompilePass for TimelineChecker {
    fn name(&self) -> &'static str { "TimelineChecker" }
    fn description(&self) -> &'static str { "检查时间线事件覆盖" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        for tn in ctx.timeline_nodes {
            if tn.chapter_number == Some(ctx.chapter_number) {
                let keywords: Vec<&str> = tn.event_summary
                    .split(|c: char| !c.is_alphanumeric() && c != ' ' && c as u32 > 127)
                    .filter(|w| w.len() >= 2)
                    .take(5)
                    .collect();
                let found_count = keywords.iter().filter(|kw| ctx.draft_text.contains(*kw)).count();
                if found_count < keywords.len() / 2 && !keywords.is_empty() {
                    issues.push(CompileIssue {
                        checker: self.name().to_string(),
                        severity: "info".to_string(),
                        message: format!("时间线事件可能未覆盖: {}", tn.event_summary),
                        detail: Some("检查本章是否遗漏了该时间线节点的事件".to_string()),
                        location: Some(format!("第{}章时间线", ctx.chapter_number)),
                    });
                }
            }
        }

        issues
    }
}
