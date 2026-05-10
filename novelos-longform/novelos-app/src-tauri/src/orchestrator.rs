use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PipelineStep {
    pub name: String,
    pub agent_name: Option<String>,
    pub status: String, // "pending", "running", "completed", "failed", "skipped"
    pub output: Option<String>,
    pub duration_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PipelineResult {
    pub run_id: String,
    pub steps: Vec<PipelineStep>,
    pub chapter_status: String,
    pub compiler_score: Option<i32>,
    pub review_verdict: Option<String>,
    pub review_score: Option<f32>,
    pub total_duration_ms: u64,
    pub conflict_matrix: Option<ConflictMatrix>,
}

/// Build the standard single-chapter production pipeline (WF-010)
pub fn build_chapter_pipeline() -> Vec<PipelineStep> {
    vec![
        PipelineStep {
            name: "生成任务卡".to_string(),
            agent_name: Some("task_card".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "精准召回".to_string(),
            agent_name: Some("recall_agent".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "章节大纲".to_string(),
            agent_name: Some("chapter_outline".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "AI撰写草稿".to_string(),
            agent_name: Some("draft_writer".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "去AI化审校".to_string(),
            agent_name: Some("voice_filter".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "连续性编译".to_string(),
            agent_name: None, // uses compiler directly
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "情节评审".to_string(),
            agent_name: Some("plot_expert".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "角色评审".to_string(),
            agent_name: Some("character_expert".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "节奏评审".to_string(),
            agent_name: Some("pacing_expert".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "世界观评审".to_string(),
            agent_name: Some("worldbuilding_expert".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "文笔评审".to_string(),
            agent_name: Some("prose_expert".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "商业性评审".to_string(),
            agent_name: Some("commercial_expert".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "读者模拟".to_string(),
            agent_name: Some("reader_panel".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "AI痕迹审计".to_string(),
            agent_name: Some("voice_audit".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
        PipelineStep {
            name: "终审裁决".to_string(),
            agent_name: Some("review_chair".to_string()),
            status: "pending".to_string(),
            output: None,
            duration_ms: 0,
        },
    ]
}

/// A single disagreement between two expert reviews
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReviewConflict {
    pub topic: String,
    pub expert_a: String,
    pub position_a: String,
    pub expert_b: String,
    pub position_b: String,
    pub severity: String,                // "low", "medium", "high"
    pub user_resolution: Option<String>, // "favor_a", "favor_b", "ignore", null
}

/// Structured conflict matrix from 8-expert review
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ConflictMatrix {
    pub expert_scores: Vec<(String, f32)>, // (expert_name, score)
    pub conflicts: Vec<ReviewConflict>,
    pub score_spread: f32, // max - min score
}

/// Parse a single expert's score from its JSON output
fn parse_expert_score(output: &str) -> Option<f32> {
    let v: serde_json::Value = serde_json::from_str(output).ok()?;
    v.get("score")?.as_f64().map(|s| s as f32).or_else(|| {
        v.get("ai_score")?
            .as_f64()
            .map(|s| ((100.0 - s) / 10.0) as f32)
    })
}

/// Detect conflicts between 8 expert review outputs
pub fn detect_review_conflicts(expert_outputs: &[Option<String>]) -> ConflictMatrix {
    let expert_names = [
        "plot_expert",
        "character_expert",
        "pacing_expert",
        "worldbuilding_expert",
        "prose_expert",
        "commercial_expert",
        "reader_panel",
        "voice_audit",
    ];

    // Parse scores
    let mut expert_scores: Vec<(String, f32)> = Vec::new();
    for (i, name) in expert_names.iter().enumerate() {
        if let Some(ref output) = expert_outputs.get(i).and_then(|o| o.as_ref()) {
            if let Some(score) = parse_expert_score(output) {
                expert_scores.push((name.to_string(), score));
            }
        }
    }

    let scores: Vec<f32> = expert_scores.iter().map(|(_, s)| *s).collect();
    let score_spread = if scores.is_empty() {
        0.0
    } else {
        scores.iter().cloned().fold(f32::NEG_INFINITY, f32::max)
            - scores.iter().cloned().fold(f32::INFINITY, f32::min)
    };

    let mut conflicts = Vec::new();

    // 1. Score divergence: any pair with gap > 3
    for i in 0..expert_scores.len() {
        for j in (i + 1)..expert_scores.len() {
            let gap = (expert_scores[i].1 - expert_scores[j].1).abs();
            if gap > 3.0 {
                let severity = if gap > 5.0 { "high" } else { "medium" };
                conflicts.push(ReviewConflict {
                    topic: format!(
                        "评分分歧：{}({}) vs {}({})",
                        expert_scores[i].0,
                        expert_scores[i].1,
                        expert_scores[j].0,
                        expert_scores[j].1
                    ),
                    expert_a: expert_scores[i].0.clone(),
                    position_a: format!("评分 {}", expert_scores[i].1),
                    expert_b: expert_scores[j].0.clone(),
                    position_b: format!("评分 {}", expert_scores[j].1),
                    severity: severity.to_string(),
                    user_resolution: None,
                });
            }
        }
    }

    // 2. Must-fix contradictions: one expert's must_fix contradicts another's strengths
    for i in 0..8 {
        let output_a = match expert_outputs.get(i).and_then(|o| o.as_ref()) {
            Some(o) => o,
            None => continue,
        };
        let val_a: serde_json::Value = match serde_json::from_str(output_a) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let must_fix_a: Vec<String> = val_a
            .get("must_fix")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        if must_fix_a.is_empty() {
            continue;
        }

        for j in 0..8 {
            if i == j {
                continue;
            }
            let output_b = match expert_outputs.get(j).and_then(|o| o.as_ref()) {
                Some(o) => o,
                None => continue,
            };
            let val_b: serde_json::Value = match serde_json::from_str(output_b) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let strengths_b: Vec<String> = val_b
                .get("strengths")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();

            for fix in &must_fix_a {
                for strength in &strengths_b {
                    let fix_short: String = fix.chars().take(20).collect();
                    let fix_words: Vec<&str> = fix_short.split_whitespace().take(4).collect();
                    let overlap = fix_words.iter().filter(|w| strength.contains(**w)).count();
                    if overlap >= 2 && fix_words.len() >= 2 {
                        conflicts.push(ReviewConflict {
                            topic: format!("意见冲突：同一方面不同评价"),
                            expert_a: expert_names[i].to_string(),
                            position_a: format!("需要修改：{}", fix),
                            expert_b: expert_names[j].to_string(),
                            position_b: format!("认为是优点：{}", strength),
                            severity: "high".to_string(),
                            user_resolution: None,
                        });
                        break;
                    }
                }
            }
        }
    }

    // 3. Voice audit vs prose expert: if voice_audit says must_rewrite but prose score is high
    {
        let voice_output = expert_outputs.get(7).and_then(|o| o.as_ref());
        let prose_output = expert_outputs.get(4).and_then(|o| o.as_ref());
        if let (Some(vo), Some(po)) = (voice_output, prose_output) {
            if let (Ok(vv), Ok(pv)) = (
                serde_json::from_str::<serde_json::Value>(vo),
                serde_json::from_str::<serde_json::Value>(po),
            ) {
                let voice_verdict = vv
                    .get("overall_verdict")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let prose_score = pv.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0);
                if voice_verdict == "must_rewrite" && prose_score >= 7.0 {
                    conflicts.push(ReviewConflict {
                        topic: "AI痕迹 vs 文笔评分冲突".to_string(),
                        expert_a: "voice_audit".to_string(),
                        position_a: "需要重写（AI痕迹严重）".to_string(),
                        expert_b: "prose_expert".to_string(),
                        position_b: format!("文笔评分 {} (良好)", prose_score),
                        severity: "high".to_string(),
                        user_resolution: None,
                    });
                }
            }
        }
    }

    ConflictMatrix {
        expert_scores,
        conflicts,
        score_spread,
    }
}

/// Determine pipeline status and score from steps
pub fn evaluate_pipeline(steps: &[PipelineStep]) -> (String, Option<i32>, Option<f32>) {
    let failed_steps: Vec<&PipelineStep> = steps.iter().filter(|s| s.status == "failed").collect();
    let review_chair = steps
        .iter()
        .find(|s| s.name == "终审裁决" && s.status == "completed");

    let status = if failed_steps.len() > 2 {
        "review_required"
    } else if failed_steps.is_empty() || failed_steps.iter().all(|s| s.name.contains("评审")) {
        "approved"
    } else {
        "compile_failed"
    };

    // Try to parse compiler score from the compile step
    let compiler_score = steps
        .iter()
        .find(|s| s.name == "连续性编译")
        .and_then(|s| s.output.as_ref())
        .and_then(|o| serde_json::from_str::<serde_json::Value>(o).ok())
        .and_then(|v| v.get("score")?.as_i64())
        .map(|s| s as i32);

    // Try to parse review verdict from review chair
    let review_score = review_chair
        .and_then(|s| s.output.as_ref())
        .and_then(|o| serde_json::from_str::<serde_json::Value>(o).ok())
        .and_then(|v| v.get("overall_score")?.as_f64())
        .map(|s| s as f32);

    (status.to_string(), compiler_score, review_score)
}

// ─── AGT-001~003: Task Queue & Failure Routing ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskItem {
    pub id: String,
    pub agent_name: String,
    pub priority: u8,   // 1=highest, 5=lowest
    pub status: String, // "queued", "running", "completed", "failed", "cancelled"
    pub max_retries: u8,
    pub retry_count: u8,
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct TaskQueue {
    pub items: Vec<TaskItem>,
}

impl TaskQueue {
    pub fn new() -> Self {
        Self { items: Vec::new() }
    }

    pub fn enqueue(&mut self, agent_name: &str, priority: u8) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        self.items.push(TaskItem {
            id: id.clone(),
            agent_name: agent_name.to_string(),
            priority,
            status: "queued".to_string(),
            max_retries: 3,
            retry_count: 0,
            created_at: chrono::Utc::now().to_rfc3339(),
        });
        // Sort by priority (lower = higher priority)
        self.items.sort_by(|a, b| a.priority.cmp(&b.priority));
        id
    }

    pub fn next(&mut self) -> Option<&mut TaskItem> {
        self.items.iter_mut().find(|t| t.status == "queued")
    }

    pub fn mark_running(&mut self, id: &str) {
        if let Some(item) = self.items.iter_mut().find(|t| t.id == id) {
            item.status = "running".to_string();
        }
    }

    pub fn mark_completed(&mut self, id: &str) {
        if let Some(item) = self.items.iter_mut().find(|t| t.id == id) {
            item.status = "completed".to_string();
        }
    }

    pub fn mark_failed(&mut self, id: &str) -> bool {
        if let Some(item) = self.items.iter_mut().find(|t| t.id == id) {
            if item.retry_count < item.max_retries {
                item.retry_count += 1;
                item.status = "queued".to_string();
                true // will retry
            } else {
                item.status = "failed".to_string();
                false // exhausted retries
            }
        } else {
            false
        }
    }

    pub fn pending_count(&self) -> usize {
        self.items.iter().filter(|t| t.status == "queued").count()
    }

    pub fn failed_count(&self) -> usize {
        self.items.iter().filter(|t| t.status == "failed").count()
    }
}

/// AGT-003: Failure routing — determine next action after a failed step
pub fn route_failure(failed_step_name: &str, attempt: u8) -> &str {
    match (failed_step_name, attempt) {
        ("AI撰写草稿", 1..=2) => "retry",
        ("AI撰写草稿", 3) => "skip_to_manual",
        ("连续性编译", 1..=3) => "rewrite",
        ("连续性编译", _) => "needs_human",
        (_, 1..=2) => "retry",
        _ => "needs_human",
    }
}

/// AGT-005: Agent timeout configuration (in seconds)
pub fn get_agent_timeout(agent_name: &str) -> u64 {
    match agent_name {
        "draft_writer" => 300,
        "voice_filter" => 180,
        "task_card" => 60,
        "recall_agent" => 120,
        "chapter_outline" => 120,
        "review_chair" => 90,
        _ => 60, // default
    }
}
