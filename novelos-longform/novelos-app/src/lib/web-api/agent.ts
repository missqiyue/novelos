import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  AgentInfo,
  AgentRunResult,
  AgentLogEntry,
} from "../tauri";

const STATIC_AGENT_LIST: AgentInfo[] = [
  { name: "architect", description: "大纲规划Agent" },
  { name: "writer", description: "章节写作Agent" },
  { name: "compiler", description: "编译检查Agent" },
  { name: "reviewer", description: "审稿Agent" },
  { name: "retcon_analyst", description: "修史分析Agent" },
];

export const agentApi = {
  async list(): Promise<AgentInfo[]> {
    return STATIC_AGENT_LIST;
  },

  async run(_agentName: string, _variables: Record<string, string>): Promise<AgentRunResult> {
    throw new WebNotSupportedError("agent execution (requires backend LLM service)");
  },

  async listLogs(agentName?: string, limit?: number): Promise<AgentLogEntry[]> {
    const lmt = limit ?? 50;
    if (agentName) {
      return webDb.all<AgentLogEntry>(
        "SELECT id, agent_name, input_summary, output_summary, status, duration_ms, token_usage, error_message, created_at FROM agent_execution_logs WHERE agent_name = ? ORDER BY created_at DESC LIMIT ?",
        [agentName, lmt],
      );
    }
    return webDb.all<AgentLogEntry>(
      "SELECT id, agent_name, input_summary, output_summary, status, duration_ms, token_usage, error_message, created_at FROM agent_execution_logs ORDER BY created_at DESC LIMIT ?",
      [lmt],
    );
  },
};
