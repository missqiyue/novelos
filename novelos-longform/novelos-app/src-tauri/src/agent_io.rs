use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// AGT-070: Global input contract for all agents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInput {
    /// Project identifier
    pub project_id: Option<String>,
    /// The goal of this agent call (e.g. "generate chapter 5 task card")
    pub objective: String,
    /// Chapter number context (if applicable)
    pub chapter_number: Option<i64>,
    /// Constraints the agent must follow
    pub constraints: Vec<String>,
    /// Additional context (canon rules, character states, etc.)
    pub context: HashMap<String, String>,
    /// Agent-specific parameters
    pub params: HashMap<String, String>,
}

impl AgentInput {
    pub fn new(objective: &str) -> Self {
        Self {
            project_id: None,
            objective: objective.to_string(),
            chapter_number: None,
            constraints: Vec::new(),
            context: HashMap::new(),
            params: HashMap::new(),
        }
    }

    pub fn with_chapter(mut self, chapter: i64) -> Self {
        self.chapter_number = Some(chapter);
        self
    }

    pub fn with_constraint(mut self, constraint: &str) -> Self {
        self.constraints.push(constraint.to_string());
        self
    }

    pub fn with_context(mut self, key: &str, value: &str) -> Self {
        self.context.insert(key.to_string(), value.to_string());
        self
    }

    pub fn with_param(mut self, key: &str, value: &str) -> Self {
        self.params.insert(key.to_string(), value.to_string());
        self
    }
}

/// AGT-071: Global output contract for all agents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentOutput {
    /// Primary result content
    pub result: String,
    /// Reasons/explanations for the output
    pub reasons: Vec<String>,
    /// Risk flags raised by the agent
    pub risk_flags: Vec<RiskFlag>,
    /// Confidence score (0.0-1.0)
    pub confidence: f32,
    /// Recommended next action
    pub next_action: Option<String>,
    /// Tokens consumed
    pub tokens_used: Option<AgentTokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskFlag {
    pub severity: String, // "high", "medium", "low"
    pub category: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTokenUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

impl AgentOutput {
    pub fn from_content(content: &str) -> Self {
        // Try to parse JSON output from agent response
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(content) {
            Self {
                result: content.to_string(),
                reasons: parsed
                    .get("strengths")
                    .and_then(|v| v.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect()
                    })
                    .unwrap_or_default(),
                risk_flags: parsed
                    .get("must_fix")
                    .and_then(|v| v.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|v| v.as_str())
                            .map(|s| RiskFlag {
                                severity: "high".to_string(),
                                category: "review".to_string(),
                                message: s.to_string(),
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
                confidence: parsed
                    .get("score")
                    .and_then(|v| v.as_f64())
                    .map(|s| (s as f32 / 10.0).min(1.0))
                    .unwrap_or(0.0),
                next_action: parsed
                    .get("verdict")
                    .or(parsed.get("next_action"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                tokens_used: None,
            }
        } else {
            Self {
                result: content.to_string(),
                reasons: Vec::new(),
                risk_flags: Vec::new(),
                confidence: 0.0,
                next_action: None,
                tokens_used: None,
            }
        }
    }
}

/// AGT-072: Agent execution logger
pub fn log_agent_input_output(
    agent_name: &str,
    input: &AgentInput,
    output: &AgentOutput,
    duration_ms: u64,
) -> String {
    serde_json::json!({
        "agent": agent_name,
        "objective": input.objective,
        "chapter": input.chapter_number,
        "constraints": input.constraints,
        "result_preview": output.result.chars().take(200).collect::<String>(),
        "confidence": output.confidence,
        "risk_flags": output.risk_flags.len(),
        "next_action": output.next_action,
        "duration_ms": duration_ms,
    })
    .to_string()
}
