use crate::llm::provider::LlmProvider;
use crate::llm::retry::retry_async;
use crate::llm::{ChatMessage, ChatResponse, LlmConfig, StreamChunk};
use futures::StreamExt;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Clone)]
struct OllamaRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Debug, Serialize, Clone)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Clone)]
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

#[derive(Debug, Serialize, Clone)]
struct OllamaEmbedRequest {
    model: String,
    prompt: String,
}

#[derive(Debug, Deserialize)]
struct OllamaEmbedResponse {
    embedding: Vec<f32>,
}

pub struct OllamaProvider {
    config: LlmConfig,
    client: reqwest::Client,
}

impl OllamaProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            client: crate::llm::shared_client(),
        }
    }

    fn base_url(&self) -> String {
        if self.config.base_url.is_empty() {
            "http://localhost:11434".to_string()
        } else {
            self.config.base_url.trim_end_matches('/').to_string()
        }
    }
}

impl LlmProvider for OllamaProvider {
    fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>>,
                > + Send
                + '_,
        >,
    > {
        let body = OllamaRequest {
            model: self.config.model.clone(),
            messages: messages
                .iter()
                .map(|m| OllamaMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect(),
            stream: false,
            options: OllamaOptions {
                temperature: self.config.temperature,
                num_predict: self.config.max_tokens,
            },
        };
        let base_url = self.base_url();
        let client = self.client.clone();

        Box::pin(async move {
            let data = retry_async(2, move |_attempt| {
                let client = client.clone();
                let base_url = base_url.clone();
                let body = body.clone();
                async move {
                    let resp = client
                        .post(format!("{}/api/chat", base_url))
                        .json(&body)
                        .send()
                        .await
                        .map_err(|e| format!("Network error: {}", e))?;

                    let status = resp.status();
                    if !status.is_success() {
                        let err_text = resp.text().await.unwrap_or_default();
                        return Err(format!(
                            "Ollama API error {}: {}",
                            status.as_u16(),
                            err_text
                        ));
                    }

                    resp.json::<OllamaResponse>()
                        .await
                        .map_err(|e| format!("JSON parse error: {}", e))
                }
            })
            .await
            .map_err(|e| <Box<dyn std::error::Error + Send + Sync>>::from(e))?;

            Ok(ChatResponse {
                content: data.message.content,
                reasoning_content: String::new(),
                prompt_tokens: data.prompt_eval_count.unwrap_or(0),
                completion_tokens: data.eval_count.unwrap_or(0),
                total_tokens: data.prompt_eval_count.unwrap_or(0) + data.eval_count.unwrap_or(0),
                model: data.model,
            })
        })
    }

    fn chat_completion_stream(
        self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<
            dyn tokio_stream::Stream<
                    Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>,
                > + Send,
        >,
    >
    where
        Self: Sized + Send + 'static,
    {
        let config = self.config.clone();
        let client = self.client;
        let stream = async_stream::stream! {
            let ollama_messages: Vec<OllamaMessage> = messages
                .iter()
                .map(|m| OllamaMessage {
                    role: m.role.clone(),
                    content: m.content.clone(),
                })
                .collect();

            let body = OllamaRequest {
                model: config.model.clone(),
                messages: ollama_messages,
                stream: true,
                options: OllamaOptions {
                    temperature: config.temperature,
                    num_predict: config.max_tokens,
                },
            };

            let base_url = if config.base_url.is_empty() {
                "http://localhost:11434".to_string()
            } else {
                config.base_url.trim_end_matches('/').to_string()
            };
            let model = config.model.clone();

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
                        reasoning_delta: String::new(),
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

    fn embed(
        &self,
        text: &str,
        model: &str,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<Vec<f32>, Box<dyn std::error::Error + Send + Sync>>,
                > + Send
                + '_,
        >,
    > {
        let base_url = self.base_url();
        let client = self.client.clone();
        let model = model.to_string();
        let prompt = text.to_string();

        Box::pin(async move {
            let api_resp = retry_async(2, move |_attempt| {
                let client = client.clone();
                let base_url = base_url.clone();
                let body = OllamaEmbedRequest {
                    model: model.clone(),
                    prompt: prompt.clone(),
                };
                async move {
                    let response = client
                        .post(format!("{}/api/embeddings", base_url))
                        .json(&body)
                        .send()
                        .await
                        .map_err(|e| format!("Network error: {}", e))?;

                    let status = response.status();
                    if !status.is_success() {
                        let text = response.text().await.unwrap_or_default();
                        return Err(format!("Ollama embedding error ({}): {}", status, text));
                    }

                    response
                        .json::<OllamaEmbedResponse>()
                        .await
                        .map_err(|e| format!("JSON parse error: {}", e))
                }
            })
            .await
            .map_err(|e| <Box<dyn std::error::Error + Send + Sync>>::from(e))?;

            Ok(api_resp.embedding)
        })
    }
}

impl OllamaProvider {
    /// Check if Ollama is reachable at the configured base URL.
    pub async fn is_available(base_url: &str) -> bool {
        let url = if base_url.is_empty() {
            "http://localhost:11434".to_string()
        } else {
            base_url.trim_end_matches('/').to_string()
        };
        crate::llm::shared_client()
            .get(format!("{}/api/tags", url))
            .timeout(std::time::Duration::from_secs(2))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }
}
