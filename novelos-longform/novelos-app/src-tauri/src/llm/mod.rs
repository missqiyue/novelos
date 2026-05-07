pub mod anthropic;
pub mod ollama;
pub mod openai;
pub mod provider;

use provider::LlmProvider;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct LlmConfig {
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
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

// ─── Embedding types (RAG-001) ───

#[derive(Debug, Clone, serde::Serialize)]
struct EmbeddingRequest {
    model: String,
    input: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Debug, Clone, serde::Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

pub struct LlmService {
    pub config: LlmConfig,
}

impl LlmService {
    pub fn new(config: LlmConfig) -> Self {
        Self { config }
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

    /// RAG-001: Generate an embedding vector for the given text.
    /// Currently only supported for the OpenAI provider.
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>, Box<dyn std::error::Error + Send + Sync>> {
        match self.config.provider.as_str() {
            "anthropic" | "ollama" => {
                Err("embedding not supported for this provider".into())
            }
            _ => {
                let url = format!(
                    "{}/embeddings",
                    self.config.base_url.trim_end_matches('/')
                );

                let body = EmbeddingRequest {
                    model: "text-embedding-3-small".to_string(),
                    input: text.to_string(),
                };

                let client = reqwest::Client::new();
                let response = client
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", self.config.api_key))
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await?;

                let status = response.status();
                if !status.is_success() {
                    let err_text = response.text().await?;
                    return Err(format!("Embedding API error ({}): {}", status, err_text).into());
                }

                let api_resp: EmbeddingResponse = response.json().await?;
                let embedding = api_resp
                    .data
                    .into_iter()
                    .next()
                    .map(|d| d.embedding)
                    .ok_or("No embedding returned from API")?;

                Ok(embedding)
            }
        }
    }
}
