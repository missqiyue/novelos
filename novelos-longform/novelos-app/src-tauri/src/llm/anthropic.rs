use crate::llm::provider::LlmProvider;
use crate::llm::retry::retry_async;
use crate::llm::{ChatMessage, ChatResponse, LlmConfig, StreamChunk};
use futures::StreamExt;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    temperature: f32,
    system: Option<String>,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<AnthropicThinkingConfig>,
    stream: bool,
}

#[derive(Serialize, Clone)]
struct AnthropicThinkingConfig {
    #[serde(rename = "type")]
    mode: String,
}

#[derive(Serialize, Clone)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContent>,
}

#[derive(Serialize, Clone)]
struct AnthropicContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicResponseContent>,
    model: String,
    usage: AnthropicUsage,
}

#[derive(Deserialize)]
struct AnthropicResponseContent {
    #[serde(rename = "type")]
    content_type: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    thinking: Option<String>,
    #[serde(default)]
    signature: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Deserialize)]
struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<AnthropicStreamDelta>,
    message: Option<AnthropicStreamMessage>,
}

#[derive(Deserialize)]
struct AnthropicStreamDelta {
    #[serde(default, rename = "type")]
    delta_type: Option<String>,
    text: Option<String>,
    thinking: Option<String>,
    stop_reason: Option<String>,
}

#[derive(Deserialize)]
struct AnthropicStreamMessage {
    usage: Option<AnthropicUsage>,
    model: Option<String>,
}

pub struct AnthropicProvider {
    config: LlmConfig,
    client: reqwest::Client,
}

impl AnthropicProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            client: crate::llm::shared_client(),
        }
    }

    fn uses_deepseek_anthropic(&self) -> bool {
        let model = self.config.model.trim().to_lowercase();
        let base_url = self
            .config
            .base_url
            .trim()
            .trim_end_matches('/')
            .to_lowercase();
        model.starts_with("deepseek") && base_url.contains("api.deepseek.com/anthropic")
    }
}

fn summarize_body(text: &str) -> String {
    let compact = text.replace('\n', " ").replace('\r', " ");
    if compact.len() <= 200 {
        compact
    } else {
        let preview: String = compact.chars().take(200).collect();
        format!("{}...", preview)
    }
}

fn extract_anthropic_content(data: &AnthropicResponse) -> (String, String) {
    let mut content = Vec::new();
    let mut reasoning = Vec::new();

    for block in &data.content {
        match block.content_type.as_str() {
            "text" => {
                if let Some(text) = &block.text {
                    content.push(text.clone());
                }
            }
            "thinking" => {
                if let Some(text) = &block.thinking {
                    reasoning.push(text.clone());
                } else if let Some(text) = &block.text {
                    reasoning.push(text.clone());
                }
            }
            _ => {
                if let Some(text) = &block.text {
                    content.push(text.clone());
                } else if let Some(text) = &block.thinking {
                    reasoning.push(text.clone());
                }
            }
        }
    }

    (content.join("\n"), reasoning.join("\n"))
}

impl LlmProvider for AnthropicProvider {
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
        let system_msg = messages
            .iter()
            .find(|m| m.role == "system")
            .map(|m| m.content.clone());
        let chat_messages: Vec<AnthropicMessage> = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| AnthropicMessage {
                role: if m.role == "assistant" {
                    "assistant".to_string()
                } else {
                    "user".to_string()
                },
                content: vec![AnthropicContent {
                    content_type: "text".to_string(),
                    text: m.content.clone(),
                }],
            })
            .collect();

        let body = AnthropicRequest {
            model: self.config.model.clone(),
            max_tokens: self.config.max_tokens,
            temperature: self.config.temperature,
            system: system_msg,
            messages: chat_messages,
            thinking: None,
            stream: false,
        };

        let base_url = if self.config.base_url.is_empty() {
            "https://api.anthropic.com".to_string()
        } else {
            self.config.base_url.trim_end_matches('/').to_string()
        };
        let client = self.client.clone();
        let api_key = self.config.api_key.clone();

        Box::pin(async move {
            let data = retry_async(3, move |_attempt| {
                let client = client.clone();
                let api_key = api_key.clone();
                let base_url = base_url.clone();
                let body = body.clone();
                async move {
                    let resp = client
                        .post(format!("{}/v1/messages", base_url))
                        .header("x-api-key", &api_key)
                        .header("anthropic-version", "2023-06-01")
                        .header("Content-Type", "application/json")
                        .json(&body)
                        .send()
                        .await
                        .map_err(|e| format!("Network error: {}", e))?;

                    let status = resp.status();
                    if status.as_u16() == 429 || status.as_u16() >= 500 {
                        let text = resp.text().await.unwrap_or_default();
                        return Err(format!("Anthropic API error {}: {}", status.as_u16(), text));
                    }
                    if !status.is_success() {
                        let text = resp.text().await.unwrap_or_default();
                        return Err(format!("Anthropic API error {}: {}", status.as_u16(), text));
                    }

                    let text = resp.text().await.unwrap_or_default();
                    if text.trim().is_empty() {
                        return Err(format!(
                            "Anthropic API returned empty body (HTTP {}). This may indicate a timeout, content filter, or DeepSeek compatibility issue with max_tokens={}.",
                            status.as_u16(),
                            body.max_tokens,
                        ));
                    }
                    serde_json::from_str::<AnthropicResponse>(&text).map_err(|e| {
                        let snippet = summarize_body(&text);
                        let hint = if text.contains("\"choices\"") || text.contains("\"object\"") {
                            "；返回体看起来更像 OpenAI 兼容格式，请将 Provider 改为 `openai`"
                        } else {
                            ""
                        };
                        format!("JSON parse error: {}；response snippet: {}{}", e, snippet, hint)
                    })
                }
            }).await.map_err(|e| <Box<dyn std::error::Error + Send + Sync>>::from(e))?;

            let (content, reasoning_content) = extract_anthropic_content(&data);

            Ok(ChatResponse {
                content,
                reasoning_content,
                prompt_tokens: data.usage.input_tokens,
                completion_tokens: data.usage.output_tokens,
                total_tokens: data.usage.input_tokens + data.usage.output_tokens,
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
            let system_msg = messages.iter().find(|m| m.role == "system").map(|m| m.content.clone());
            let chat_messages: Vec<AnthropicMessage> = messages
                .iter()
                .filter(|m| m.role != "system")
                .map(|m| AnthropicMessage {
                    role: if m.role == "assistant" { "assistant".to_string() } else { "user".to_string() },
                    content: vec![AnthropicContent {
                        content_type: "text".to_string(),
                        text: m.content.clone(),
                    }],
                })
                .collect();

            let body = AnthropicRequest {
                model: config.model.clone(),
                max_tokens: config.max_tokens,
                temperature: config.temperature,
                system: system_msg,
                messages: chat_messages,
                thinking: None,
                stream: true,
            };

            let base_url = if config.base_url.is_empty() {
                "https://api.anthropic.com".to_string()
            } else {
                config.base_url.trim_end_matches('/').to_string()
            };
            let model = config.model.clone();

            let response = match client
                .post(format!("{}/v1/messages", base_url))
                .header("x-api-key", &config.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
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
                yield Err(format!("Anthropic stream error {}: {}", status.as_u16(), err_text).into());
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

                    if line.is_empty() || !line.starts_with("data: ") {
                        continue;
                    }
                    let data = &line[6..];

                    let event: AnthropicStreamEvent = match serde_json::from_str(data) {
                        Ok(e) => e,
                        Err(_) => continue,
                    };

                    match event.event_type.as_str() {
                        "content_block_delta" => {
                            if let Some(delta) = event.delta {
                                let text = delta.text.unwrap_or_default();
                                let reasoning_delta = delta.thinking.unwrap_or_default();
                                if !text.is_empty() {
                                    yield Ok(StreamChunk {
                                        delta: text,
                                        reasoning_delta: String::new(),
                                        done: false,
                                        prompt_tokens: 0,
                                        completion_tokens: 0,
                                        model: model.clone(),
                                    });
                                } else if !reasoning_delta.is_empty() {
                                    yield Ok(StreamChunk {
                                        delta: String::new(),
                                        reasoning_delta,
                                        done: false,
                                        prompt_tokens: 0,
                                        completion_tokens: 0,
                                        model: model.clone(),
                                    });
                                }
                            }
                        }
                        "message_delta" => {
                            if let Some(delta) = event.delta {
                                if delta.stop_reason.as_deref() == Some("end_turn") {
                                    yield Ok(StreamChunk {
                                        delta: String::new(),
                                        reasoning_delta: String::new(),
                                        done: true,
                                        prompt_tokens: 0,
                                        completion_tokens: 0,
                                        model: model.clone(),
                                    });
                                    return;
                                }
                            }
                        }
                        "message_stop" => {
                            yield Ok(StreamChunk {
                                delta: String::new(),
                                reasoning_delta: String::new(),
                                done: true,
                                prompt_tokens: 0,
                                completion_tokens: 0,
                                model: model.clone(),
                            });
                            return;
                        }
                        _ => {}
                    }
                }
            }
        };
        Box::pin(stream)
    }

    fn embed(
        &self,
        _text: &str,
        _model: &str,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<
                    Output = Result<Vec<f32>, Box<dyn std::error::Error + Send + Sync>>,
                > + Send
                + '_,
        >,
    > {
        Box::pin(async move { Err("Anthropic does not support embeddings".into()) })
    }
}
