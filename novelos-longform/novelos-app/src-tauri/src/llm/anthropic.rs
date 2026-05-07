use super::{ChatMessage, ChatResponse, LlmConfig, StreamChunk};
use super::provider::LlmProvider;
use futures::StreamExt;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    temperature: f32,
    system: Option<String>,
    messages: Vec<AnthropicMessage>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
}

#[derive(Debug, Serialize)]
struct AnthropicMessage {
    role: String,
    content: Vec<AnthropicContent>,
}

#[derive(Debug, Serialize)]
struct AnthropicContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicResponseContent>,
    model: String,
    usage: AnthropicUsage,
}

#[derive(Debug, Deserialize)]
struct AnthropicResponseContent {
    #[serde(rename = "type")]
    content_type: String,
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicUsage {
    input_tokens: u32,
    output_tokens: u32,
}

#[derive(Debug, Deserialize)]
struct AnthropicError {
    error: AnthropicErrorDetail,
}

#[derive(Debug, Deserialize)]
struct AnthropicErrorDetail {
    message: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamEvent {
    #[serde(rename = "type")]
    event_type: String,
    delta: Option<AnthropicStreamDelta>,
    message: Option<AnthropicStreamMessage>,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamDelta {
    #[serde(default, rename = "type")]
    delta_type: Option<String>,
    text: Option<String>,
    stop_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AnthropicStreamMessage {
    usage: Option<AnthropicUsage>,
    model: Option<String>,
}

pub struct AnthropicProvider {
    config: LlmConfig,
}

impl AnthropicProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self { config }
    }
}

impl LlmProvider for AnthropicProvider {
    fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>>> + Send + '_>,
    > {
        let config = self.config.clone();
        Box::pin(async move {
            let provider = AnthropicProvider { config };
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
            let provider = AnthropicProvider { config };

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
                model: provider.config.model.clone(),
                max_tokens: provider.config.max_tokens,
                temperature: provider.config.temperature,
                system: system_msg,
                messages: chat_messages,
                stream: true,
            };

            let base_url = if provider.config.base_url.is_empty() {
                "https://api.anthropic.com".to_string()
            } else {
                provider.config.base_url.trim_end_matches('/').to_string()
            };
            let model = provider.config.model.clone();

            let client = reqwest::Client::new();
            let response = match client
                .post(format!("{}/v1/messages", base_url))
                .header("x-api-key", &provider.config.api_key)
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

                    if !line.starts_with("data: ") {
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
                                if !text.is_empty() {
                                    yield Ok(StreamChunk {
                                        delta: text,
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
}

impl AnthropicProvider {
    async fn do_chat(
        &self,
        messages: Vec<ChatMessage>,
    ) -> Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>> {
        let client = reqwest::Client::new();

        // Separate system message from user/assistant messages
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
            model: self.config.model.clone(),
            max_tokens: self.config.max_tokens,
            temperature: self.config.temperature,
            system: system_msg,
            messages: chat_messages,
            stream: false,
        };

        let base_url = if self.config.base_url.is_empty() {
            "https://api.anthropic.com".to_string()
        } else {
            self.config.base_url.trim_end_matches('/').to_string()
        };

        let resp = client
            .post(format!("{}/v1/messages", base_url))
            .header("x-api-key", &self.config.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error {}: {}", status.as_u16(), err_text).into());
        }

        let data: AnthropicResponse = resp.json().await?;

        let content = data.content.iter()
            .filter(|c| c.content_type == "text")
            .map(|c| c.text.clone())
            .collect::<Vec<_>>()
            .join("\n");

        Ok(ChatResponse {
            content,
            prompt_tokens: data.usage.input_tokens,
            completion_tokens: data.usage.output_tokens,
            total_tokens: data.usage.input_tokens + data.usage.output_tokens,
            model: data.model,
        })
    }
}
