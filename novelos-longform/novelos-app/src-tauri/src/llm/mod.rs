pub mod anthropic;
pub mod ollama;
pub mod openai;
pub mod provider;

use provider::LlmProvider;
pub mod retry;

/// Shared HTTP client for all LLM providers.
/// Lazily initialized and truly shared across all requests.
use std::sync::LazyLock;

static SHARED_CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder()
        .pool_max_idle_per_host(4)
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .unwrap_or_default()
});

pub fn shared_client() -> reqwest::Client {
    SHARED_CLIENT.clone()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LlmConfig {
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
    /// Embedding provider: "ollama" (local), "openai", or empty (auto-detect).
    /// When empty, auto-detect tries Ollama first, then falls back to OpenAI.
    pub embedding_provider: String,
    /// Embedding model name. Defaults: "nomic-embed-text" for Ollama, "text-embedding-3-small" for OpenAI.
    pub embedding_model: String,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            provider: "openai".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: String::new(),
            model: "gpt-4o".to_string(),
            max_tokens: 4096,
            temperature: 0.7,
            embedding_provider: String::new(), // auto-detect
            embedding_model: String::new(),    // use provider default
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ChatResponse {
    pub content: String,
    pub reasoning_content: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub model: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StreamChunk {
    pub delta: String,
    pub reasoning_delta: String,
    pub done: bool,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub model: String,
}

pub struct LlmService {
    pub config: LlmConfig,
    pub client: reqwest::Client,
}

impl LlmService {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            client: shared_client(),
        }
    }

    pub fn update_config(&mut self, config: LlmConfig) {
        self.config = config;
    }

    pub async fn chat(
        &self,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>> {
        validate_chat_config(&self.config)?;
        match self.config.provider.as_str() {
            "anthropic" => {
                let provider = anthropic::AnthropicProvider::new(self.config.clone());
                provider.chat_completion(messages).await
            }
            "ollama" => {
                let provider = ollama::OllamaProvider::new(self.config.clone());
                provider.chat_completion(messages).await
            }
            _ => {
                let provider = openai::OpenAiProvider::new(self.config.clone());
                provider.chat_completion(messages).await
            }
        }
    }

    pub async fn chat_with_system(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>> {
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: system_prompt.to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: user_prompt.to_string(),
            },
        ];
        self.chat(messages).await
    }

    pub fn chat_stream(
        &self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<
            dyn tokio_stream::Stream<
                    Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>,
                > + Send,
        >,
    > {
        match self.config.provider.as_str() {
            "anthropic" => anthropic::AnthropicProvider::new(self.config.clone())
                .chat_completion_stream(messages),
            "ollama" => {
                ollama::OllamaProvider::new(self.config.clone()).chat_completion_stream(messages)
            }
            _ => openai::OpenAiProvider::new(self.config.clone()).chat_completion_stream(messages),
        }
    }

    /// Generate an embedding vector for the given text.
    /// Dispatches based on `embedding_provider` config with auto-detect fallback:
    /// - "ollama": use local Ollama embedding endpoint
    /// - "openai": use OpenAI-compatible embedding endpoint
    /// - empty (auto-detect): try Ollama first, fall back to OpenAI
    pub async fn embed(
        &self,
        text: &str,
    ) -> Result<Vec<f32>, Box<dyn std::error::Error + Send + Sync>> {
        let emb_provider = self.config.embedding_provider.as_str();
        let emb_model = self.resolve_embedding_model(emb_provider);

        match emb_provider {
            "ollama" => {
                let provider = ollama::OllamaProvider::new(self.config.clone());
                provider.embed(text, &emb_model).await
            }
            "openai" => {
                let provider = openai::OpenAiProvider::new(self.config.clone());
                provider.embed(text, &emb_model).await
            }
            _ => {
                // Auto-detect: try Ollama first, fall back to OpenAI
                let ollama_base = if self.config.provider == "ollama" {
                    self.config.base_url.clone()
                } else {
                    String::new()
                };

                if ollama::OllamaProvider::is_available(&ollama_base).await {
                    let mut config = self.config.clone();
                    if config.base_url.is_empty() {
                        config.base_url = "http://localhost:11434".to_string();
                    }
                    let provider = ollama::OllamaProvider::new(config);
                    let model = self.resolve_embedding_model("ollama");
                    provider.embed(text, &model).await
                } else {
                    let provider = openai::OpenAiProvider::new(self.config.clone());
                    let model = self.resolve_embedding_model("openai");
                    provider.embed(text, &model).await
                }
            }
        }
    }

    /// Resolve the embedding model name based on provider.
    /// If `embedding_model` is set in config, use it; otherwise use provider defaults.
    fn resolve_embedding_model(&self, provider: &str) -> String {
        if !self.config.embedding_model.is_empty() {
            return self.config.embedding_model.clone();
        }
        match provider {
            "ollama" => "nomic-embed-text".to_string(),
            _ => "text-embedding-3-small".to_string(),
        }
    }
}

fn validate_chat_config(
    config: &LlmConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    if config.provider == "anthropic" {
        let model = config.model.trim().to_lowercase();
        let base_url = config.base_url.trim().trim_end_matches('/').to_lowercase();
        let is_deepseek_model = model.starts_with("deepseek");
        let is_deepseek_anthropic_base = base_url.contains("api.deepseek.com/anthropic");

        if is_deepseek_model && !is_deepseek_anthropic_base {
            let current_base = if config.base_url.trim().is_empty() {
                "（空，将回退到 https://api.anthropic.com）"
            } else {
                config.base_url.trim()
            };

            return Err(format!(
                "DeepSeek 支持 Anthropic 协议，但 base_url 需要指向 `https://api.deepseek.com/anthropic`。当前 base_url 为 `{}`；如果你想走 DeepSeek 的 OpenAI 兼容接口 `https://api.deepseek.com`，请把 Provider 改为 `openai`。",
                current_base
            )
            .into());
        }

        let obviously_non_anthropic = [
            "gpt-", "qwen", "glm", "gemini", "moonshot", "kimi", "doubao", "llama", "mistral",
        ];

        if obviously_non_anthropic
            .iter()
            .any(|prefix| model.starts_with(prefix))
        {
            return Err(format!(
                "当前 Provider 为 anthropic，但模型 `{}` 看起来不是 Claude 系列。Anthropic Provider 使用 `/v1/messages` 协议；如果你接的是 OpenAI 兼容网关，请把 Provider 改为 `openai`。",
                config.model
            )
            .into());
        }
    }

    Ok(())
}
