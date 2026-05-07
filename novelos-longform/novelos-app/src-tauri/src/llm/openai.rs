use crate::llm::provider::LlmProvider;
use crate::llm::{ChatMessage, ChatResponse, LlmConfig, StreamChunk};
use futures::StreamExt;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    max_tokens: u32,
    temperature: f32,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
}

#[derive(Serialize, Deserialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
    usage: OpenAiUsage,
    model: String,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

#[derive(Deserialize)]
struct OpenAiUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(Deserialize)]
struct OpenAiStreamDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiStreamChoice {
    delta: OpenAiStreamDelta,
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct OpenAiStreamChunk {
    choices: Vec<OpenAiStreamChoice>,
    model: Option<String>,
}

pub struct OpenAiProvider {
    config: LlmConfig,
}

impl OpenAiProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self { config }
    }
}

impl LlmProvider for OpenAiProvider {
    fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>>> + Send + '_>,
    > {
        Box::pin(async move {
            let url = format!("{}/chat/completions", self.config.base_url.trim_end_matches('/'));

            let openai_messages: Vec<OpenAiMessage> = messages
                .into_iter()
                .map(|m| OpenAiMessage {
                    role: m.role,
                    content: m.content,
                })
                .collect();

            let body = OpenAiRequest {
                model: self.config.model.clone(),
                messages: openai_messages,
                max_tokens: self.config.max_tokens,
                temperature: self.config.temperature,
                stream: false,
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
            if status.as_u16() == 429 {
                return Err(format!("Rate limited (429): {}", status).into());
            }
            if !status.is_success() {
                let text = response.text().await?;
                return Err(format!("LLM API error ({}): {}", status, text).into());
            }

            let api_resp: OpenAiResponse = response.json().await?;

            Ok(ChatResponse {
                content: api_resp
                    .choices
                    .first()
                    .map(|c| c.message.content.clone())
                    .unwrap_or_default(),
                prompt_tokens: api_resp.usage.prompt_tokens,
                completion_tokens: api_resp.usage.completion_tokens,
                total_tokens: api_resp.usage.total_tokens,
                model: api_resp.model,
            })
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
        let url = format!("{}/chat/completions", self.config.base_url.trim_end_matches('/'));
        let api_key = self.config.api_key.clone();
        let model = self.config.model.clone();
        let max_tokens = self.config.max_tokens;
        let temperature = self.config.temperature;

        let openai_messages: Vec<OpenAiMessage> = messages
            .into_iter()
            .map(|m| OpenAiMessage {
                role: m.role,
                content: m.content,
            })
            .collect();

        let stream = async_stream::stream! {
            let body = OpenAiRequest {
                model: model.clone(),
                messages: openai_messages,
                max_tokens,
                temperature,
                stream: true,
            };

            let client = reqwest::Client::new();
            let response = match client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
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
                let text = response.text().await.unwrap_or_default();
                yield Err(format!("LLM stream error ({}): {}", status, text).into());
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
                    if data == "[DONE]" {
                        yield Ok(StreamChunk {
                            delta: String::new(),
                            done: true,
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            model: model.clone(),
                        });
                        return;
                    }

                    match serde_json::from_str::<OpenAiStreamChunk>(data) {
                        Ok(chunk) => {
                            if let Some(choice) = chunk.choices.first() {
                                let delta = choice.delta.content.clone().unwrap_or_default();
                                let done = choice.finish_reason.as_deref() == Some("stop");
                                yield Ok(StreamChunk {
                                    delta,
                                    done,
                                    prompt_tokens: 0,
                                    completion_tokens: 0,
                                    model: chunk.model.clone().unwrap_or_else(|| model.clone()),
                                });
                                if done { return; }
                            }
                        }
                        Err(_) => continue,
                    }
                }
            }
        };

        Box::pin(stream)
    }
}
