use crate::commands::agent::{run_agent, AgentRunResult};
use crate::commands::llm::LlmState;
use crate::db::DbState;
use std::collections::HashMap;
use tauri::State;

/// AGT-005: Run an agent with a configurable timeout.
///
/// If `timeout_secs` is 0, the default timeout for the agent is used
/// (from `orchestrator::get_agent_timeout`). If the agent call does not
/// complete within the timeout, an error is returned.
pub async fn run_agent_with_timeout(
    llm_state: State<'_, LlmState>,
    db: State<'_, DbState>,
    agent_name: String,
    variables: HashMap<String, String>,
    timeout_secs: u64,
) -> Result<AgentRunResult, String> {
    let timeout_duration = if timeout_secs == 0 {
        crate::orchestrator::get_agent_timeout(&agent_name)
    } else {
        timeout_secs
    };

    tokio::time::timeout(
        tokio::time::Duration::from_secs(timeout_duration),
        run_agent(llm_state, db, agent_name.clone(), variables),
    )
    .await
    .map_err(|_elapsed| format!("Agent {} timed out after {}s", agent_name, timeout_duration))?
}
