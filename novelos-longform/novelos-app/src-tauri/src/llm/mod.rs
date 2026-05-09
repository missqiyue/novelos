pub mod anthropic;
pub mod ollama;
pub mod openai;
pub mod provider;

use provider::LlmProvider;
pub mod retry;

use std::sync::Arc;

/// Shared HTTP client for all LLM providers.
/// Reuses connection pools and keep-alive across requests.
pub fn shared_client() -> reqwest::Client {
    reqwest::Client::builder()
        .pool_max_idle_per_host(4)
        .pool_idle_timeout(std::time::Duration::from_secs(90))
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .unwrap_or_default()
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
            embedding_model: String::new(),   // use provider default
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
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
    pub model: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StreamChunk {
    pub delta: String,
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

    pub async fn chat(&self, messages: Vec<ChatMessage>) -> Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>> {
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
    ) -> std::pin::Pin<Box<dyn tokio_stream::Stream<Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>> + Send>> {
        match self.config.provider.as_str() {
            "anthropic" => {
                anthropic::AnthropicProvider::new(self.config.clone()).chat_completion_stream(messages)
            }
            "ollama" => {
                ollama::OllamaProvider::new(self.config.clone()).chat_completion_stream(messages)
            }
            _ => {
                openai::OpenAiProvider::new(self.config.clone()).chat_completion_stream(messages)
            }
        }
    }

    /// Generate an embedding vector for the given text.
    /// Dispatches based on `embedding_provider` config with auto-detect fallback:
    /// - "ollama": use local Ollama embedding endpoint
    /// - "openai": use OpenAI-compatible embedding endpoint
    /// - empty (auto-detect): try Ollama first, fall back to OpenAI
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>, Box<dyn std::error::Error + Send + Sync>> {
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
