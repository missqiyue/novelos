use super::{CompileContext, CompileIssue, CompilePass};

pub struct ForeshadowChecker;

impl CompilePass for ForeshadowChecker {
    fn name(&self) -> &'static str { "ForeshadowChecker" }
    fn description(&self) -> &'static str { "检查伏笔超期" }

    fn check(&self, ctx: &CompileContext) -> Vec<CompileIssue> {
        let mut issues = Vec::new();

        for fs in ctx.foreshadow_items {
            if fs.status == "planted" || fs.status == "pending" {
                if let Some(planted_ch) = fs.seed_chapter {
                    let chapters_since = ctx.chapter_number - planted_ch;
                    if chapters_since > 30 {
                        issues.push(CompileIssue {
                            checker: self.name().to_string(),
                            severity: "warning".to_string(),
                            message: format!("伏笔超期未回收: {} (已埋设{}章)", fs.title.as_deref().unwrap_or("未命名"), chapters_since),
                            detail: Some("建议在近期章节中回收此伏笔，或评估是否可以废弃".to_string()),
                            location: None,
                        });
                    }
                }
            }
        }

        issues
    }
}
