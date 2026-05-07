use super::{ChatMessage, ChatResponse, LlmConfig, StreamChunk};
use super::provider::LlmProvider;
use futures::StreamExt;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct OllamaRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Debug, Serialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct OllamaOptions {
    temperature: f32,
    num_predict: u32,
}

#[derive(Debug, Deserialize)]
struct OllamaResponse {
    message: OllamaResponseMessage,
    model: String,
    prompt_eval_count: Option<u32>,
    eval_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct OllamaResponseMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamChunk {
    message: Option<OllamaStreamMessage>,
    model: Option<String>,
    done: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct OllamaStreamMessage {
    content: Option<String>,
}

pub struct OllamaProvider {
    config: LlmConfig,
}

impl OllamaProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self { config }
    }
}

impl LlmProvider for OllamaProvider {
    fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>>> + Send + '_>,
    > {
        let config = self.config.clone();
        Box::pin(async move {
            let provider = OllamaProvider { config };
            provider.do_chat(messages).await
        })
    }

    fn chat_completion_stream(
        self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<dyn tokio_stream::Stream<Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>> + Send>,
    >
    where
        Self: Sized + Send + 'static,
    {
        let config = self.config.clone();
        let stream = async_stream::stream! {
            let provider = OllamaProvider { config };

            let ollama_messages: Vec<OllamaMessage> = messages
                .iter()
                .map(|m| OllamaMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect();

            let body = OllamaRequest {
                model: provider.config.model.clone(),
                messages: ollama_messages,
                stream: true,
                options: OllamaOptions {
                    temperature: provider.config.temperature,
                    num_predict: provider.config.max_tokens,
                },
            };

            let base_url = if provider.config.base_url.is_empty() {
                "http://localhost:11434".to_string()
            } else {
                provider.config.base_url.trim_end_matches('/').to_string()
            };
            let model = provider.config.model.clone();

            let client = reqwest::Client::new();
            let response = match client
                .post(format!("{}/api/chat", base_url))
                .json(&body)
                .send()
                .await
            {
                Ok(r) => r,
                Err(e) => { yield Err(e.into()); return; }
            };

            let status = response.status();
            if !status.is_success() {
                let err_text = response.text().await.unwrap_or_default();
                yield Err(format!("Ollama stream error {}: {}", status.as_u16(), err_text).into());
                return;
            }

            let mut stream = response.bytes_stream();
            let mut buffer = String::new();

            while let Some(chunk_result) = stream.next().await {
                let bytes = match chunk_result {
                    Ok(b) => b,
                    Err(e) => { yield Err(e.into()); return; }
                };
                buffer.push_str(&String::from_utf8_lossy(&bytes));

                // Ollama uses NDJSON: each line is a complete JSON object
                while let Some(line_end) = buffer.find('\n') {
                    let line = buffer[..line_end].trim().to_string();
                    buffer = buffer[line_end + 1..].to_string();

                    if line.is_empty() {
                        continue;
                    }

                    let chunk: OllamaStreamChunk = match serde_json::from_str(&line) {
                        Ok(c) => c,
                        Err(_) => continue,
                    };

                    let done = chunk.done.unwrap_or(false);
                    let delta = chunk.message
                        .and_then(|m| m.content)
                        .unwrap_or_default();

                    yield Ok(StreamChunk {
                        delta,
                        done,
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        model: chunk.model.unwrap_or_else(|| model.clone()),
                    });

                    if done { return; }
                }
            }
        };
        Box::pin(stream)
    }
}

impl OllamaProvider {
    async fn do_chat(
        &self,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>> {
        let client = reqwest::Client::new();

        let ollama_messages: Vec<OllamaMessage> = messages
            .iter()
            .map(|m| OllamaMessage {
                role: m.role.clone(),
                content: m.content.clone(),
            })
            .collect();

        let body = OllamaRequest {
            model: self.config.model.clone(),
            messages: ollama_messages,
            stream: false,
            options: OllamaOptions {
                temperature: self.config.temperature,
                num_predict: self.config.max_tokens,
            },
        };

        let base_url = if self.config.base_url.is_empty() {
            "http://localhost:11434".to_string()
        } else {
            self.config.base_url.trim_end_matches('/').to_string()
        };

        let resp = client
            .post(format!("{}/api/chat", base_url))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("Ollama API error {}: {}", status.as_u16(), err_text).into());
        }

        let data: OllamaResponse = resp.json().await?;

        Ok(ChatResponse {
            content: data.message.content,
            prompt_tokens: data.prompt_eval_count.unwrap_or(0),
            completion_tokens: data.eval_count.unwrap_or(0),
            total_tokens: data.prompt_eval_count.unwrap_or(0) + data.eval_count.unwrap_or(0),
            model: data.model,
        })
    }
}
