use super::{CompileContext, CompileIssue, CompilePass};

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

            let prohibitions: Vec<&str> = rule.content
                .split(|c: char| c == '；' || c == ';' || c == '\n')
                .filter(|s| s.contains("不得") || s.contains("禁止") || s.contains("不允许") || s.contains("不能"))
                .collect();

            for proh in &prohibitions {
                let term = proh
                    .split("不得").last()
                    .or_else(|| proh.split("禁止").last())
                    .or_else(|| proh.split("不允许").last())
                    .or_else(|| proh.split("不能").last())
                    .unwrap_or(proh)
                    .trim();

                if !term.is_empty() && ctx.draft_text.contains(term) {
                    issues.push(CompileIssue {
                        checker: self.name().to_string(),
                        severity: if rule.is_hard { "error".to_string() } else { "warning".to_string() },
                        message: format!("违反正典规则: {}", rule.rule_name),
                        detail: Some(format!("发现禁止内容: \"{}\"", term)),
                        location: None,
                    });
                }
            }
        }

        issues
    }
}
