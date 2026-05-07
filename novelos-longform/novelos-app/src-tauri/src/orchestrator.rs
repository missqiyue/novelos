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
    pub steps: Vec<PipelineStep>,
    pub chapter_status: String,
    pub compiler_score: Option<i32>,
    pub review_verdict: Option<String>,
    pub review_score: Option<f32>,
    pub total_duration_ms: u64,
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

/// Determine pipeline status and score from steps
pub fn evaluate_pipeline(steps: &[PipelineStep]) -> (String, Option<i32>, Option<f32>) {
    let failed_steps: Vec<&PipelineStep> = steps.iter().filter(|s| s.status == "failed").collect();
    let review_chair = steps.iter().find(|s| s.name == "终审裁决" && s.status == "completed");

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
    pub priority: u8, // 1=highest, 5=lowest
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
        "draft_writer" => 120,
        "voice_filter" => 90,
        "task_card" => 60,
        "recall_agent" => 45,
        "chapter_outline" => 60,
        "review_chair" => 90,
        _ => 60, // default
    }
}
