import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  LlmConfig,
  ChatMessage,
  ChatResponse,
  TokenUsageSummary,
} from "../tauri";

let memoryLlmConfig: LlmConfig | null = null;

export const llmApi = {
  async getConfig(): Promise<LlmConfig> {
    if (!memoryLlmConfig) {
      await webDb.initGlobal();
      const row = webDb.get<{ value: string }>(
        "SELECT value FROM global_settings WHERE key = 'llm_config'", [], "global",
      );
      if (row) {
        memoryLlmConfig = JSON.parse(row.value);
      } else {
        memoryLlmConfig = {
          provider: "openai", base_url: "", api_key: "", model: "",
          max_tokens: 4096, temperature: 0.7,
          embedding_provider: "", embedding_model: "",
        };
      }
    }
    return memoryLlmConfig!;
  },

  async updateConfig(
    provider?: string, baseUrl?: string, apiKey?: string, model?: string,
    maxTokens?: number, temperature?: number,
    embeddingProvider?: string, embeddingModel?: string,
  ): Promise<LlmConfig> {
    const config = await llmApi.getConfig();
    if (provider !== undefined) config.provider = provider;
    if (baseUrl !== undefined) config.base_url = baseUrl;
    if (apiKey !== undefined) config.api_key = apiKey;
    if (model !== undefined) config.model = model;
    if (maxTokens !== undefined) config.max_tokens = maxTokens;
    if (temperature !== undefined) config.temperature = temperature;
    if (embeddingProvider !== undefined) config.embedding_provider = embeddingProvider;
    if (embeddingModel !== undefined) config.embedding_model = embeddingModel;
    memoryLlmConfig = config;
    return config;
  },

  async chat(_messages: ChatMessage[]): Promise<ChatResponse> {
    throw new WebNotSupportedError("chat completion (requires backend LLM service)");
  },
  async chatWithSystem(_systemPrompt: string, _userPrompt: string): Promise<ChatResponse> {
    throw new WebNotSupportedError("chat with system prompt (requires backend LLM service)");
  },
  async chatStream(_messages: ChatMessage[], _requestId: string): Promise<void> {
    throw new WebNotSupportedError("chat streaming (requires backend LLM service)");
  },

  async saveConfigToDb(config: LlmConfig): Promise<void> {
    await webDb.initGlobal();
    const ts = now();
    webDb.run(
      "INSERT INTO global_settings (key, value, updated_at) VALUES ('llm_config', ?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?",
      [JSON.stringify(config), ts, JSON.stringify(config), ts],
      "global",
    );
    memoryLlmConfig = config;
  },

  async loadConfigFromDb(): Promise<LlmConfig | null> {
    await webDb.initGlobal();
    const row = webDb.get<{ value: string }>(
      "SELECT value FROM global_settings WHERE key = 'llm_config'", [], "global",
    );
    if (row) {
      memoryLlmConfig = JSON.parse(row.value);
      return memoryLlmConfig;
    }
    return null;
  },

  async getTokenUsage(): Promise<TokenUsageSummary> {
    return {
      total_calls: 0, total_prompt_tokens: 0, total_completion_tokens: 0,
      total_tokens: 0, total_cost_estimate_usd: 0, by_agent: [], by_model: [],
    };
  },
};
