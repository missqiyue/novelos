use reqwest::Client;
use serde::{Deserialize, Serialize};
use anyhow::Result;
use std::time::Duration;
use tokio::time::sleep;

#[derive(Serialize)]
struct OpenAiMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct OpenAiRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Deserialize)]
struct OpenAiChoice {
}

#[derive(Deserialize)]
struct OpenAiMessageResponse {
}

#[derive(Deserialize)]
struct OpenAiResponse {
}

use lazy_static::lazy_static;

lazy_static! {
    static ref HTTP_CLIENT: Client = Client::builder()
        .timeout(Duration::from_secs(300)) // 恢复到 300 秒，专家会诊包含大量前文，模型处理时间很长
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(10)
        .build()
        .unwrap_or_default();
}

pub struct LlmClient {
    client: Client,
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

impl LlmClient {
    pub fn new(api_key: String, mut base_url: String, model: String) -> Self {
        // 如果用户配置的 base_url 以 /chat/completions 结尾，为了兼容后文的拼接，我们把它去掉
        if base_url.ends_with("/chat/completions") {
            base_url = base_url.trim_end_matches("/chat/completions").to_string();
        }
        // 去掉末尾的斜杠，避免拼接出 //chat/completions
        if base_url.ends_with('/') {
            base_url = base_url.trim_end_matches('/').to_string();
        }

        Self {
            client: HTTP_CLIENT.clone(), // 完美复用底层的连接池，避免每次请求都重新 TCP 握手
            api_key,
            base_url,
            model,
        }
    }

    pub async fn test_connection(&self) -> Result<String> {
        if self.api_key.is_empty() {
            return Err(anyhow::anyhow!("API Key is not configured. Please set it in Settings."));
        }

        let req_body = OpenAiRequest {
            model: self.model.clone(),
            messages: vec![
                OpenAiMessage {
                    role: "user".to_string(),
                    content: "Hello, reply with 'connection ok' if you receive this.".to_string(),
                },
            ],
            temperature: 0.1,
            max_tokens: 10,
        };

        let response = self.client
            .post(format!("{}/chat/completions", self.base_url))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&req_body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await?;
            return Err(anyhow::anyhow!("HTTP Status: {}\nResponse: {}", status, error_text));
        }

        let response_text = response.text().await?;
        
        let resp_json: serde_json::Value = serde_json::from_str(&response_text)?;
        
        if let Some(choices) = resp_json.get("choices").and_then(|c| c.as_array()) {
            if let Some(first_choice) = choices.first() {
                if let Some(message) = first_choice.get("message") {
                    if let Some(content) = message.get("content") {
                        if let Some(content_str) = content.as_str() {
                            return Ok(format!("Connection successful! LLM says: {}", content_str));
                        }
                    }
                }
            }
        }
        
        Err(anyhow::anyhow!("No choices returned from LLM"))
    }

    pub async fn chat_completion(&self, system_prompt: &str, user_prompt: &str) -> Result<String> {
        if self.api_key.is_empty() {
            return Err(anyhow::anyhow!("API Key is not configured. Please set it in Settings."));
        }

        let req_body = OpenAiRequest {
            model: self.model.clone(),
            messages: vec![
                OpenAiMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                },
                OpenAiMessage {
                    role: "user".to_string(),
                    content: user_prompt.to_string(),
                },
            ],
            temperature: 0.7,
            max_tokens: 16384, // inkos-master 标准：16384，保证思考模型有足够的空间写完
        };

        let url = format!("{}/chat/completions", self.base_url);
        let mut last_err: Option<anyhow::Error> = None;
        let mut response_text: Option<String> = None;

        for attempt in 0..3 {
            let resp = self.client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .json(&req_body)
                .send()
                .await;

            match resp {
                Ok(response) => {
                    if response.status().is_success() {
                        response_text = Some(response.text().await?);
                        break;
                    }

                    let status = response.status();
                    let error_text = response.text().await.unwrap_or_default();
                    let retryable = matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504);

                    if retryable && attempt < 2 {
                        sleep(Duration::from_millis(600 * (attempt as u64 + 1))).await;
                        continue;
                    }

                    return Err(anyhow::anyhow!("LLM API Error: HTTP {}\n{}", status, error_text));
                }
                Err(e) => {
                    last_err = Some(anyhow::anyhow!(e.to_string()));
                    if attempt < 2 {
                        sleep(Duration::from_millis(600 * (attempt as u64 + 1))).await;
                        continue;
                    }
                }
            }
        }

        let response_text = match response_text {
            Some(t) => t,
            None => {
                return Err(last_err.unwrap_or_else(|| anyhow::anyhow!("error sending request for url ({})", url)));
            }
        };

        let resp_json: serde_json::Value = match serde_json::from_str(&response_text) {
            Ok(json) => json,
            Err(e) => {
                println!("LLM JSON Parse Error: {}", e);
                return Err(anyhow::anyhow!("LLM JSON Parse Error: {}", e));
            }
        };
        
        if let Some(choices) = resp_json.get("choices").and_then(|c| c.as_array()) {
            if let Some(first_choice) = choices.first() {
                if let Some(message) = first_choice.get("message") {
                    if let Some(content) = message.get("content") {
                        if let Some(content_str) = content.as_str() {
                            let text = content_str.to_string();
                            if !text.is_empty() {
                                return Ok(text);
                            }
                        }
                    }
                }
            }
        }
        
        // 尝试适配 kimi-k2.6 这种包含 reasoning_content 的非标准格式，或者它直接返回 text 等情况
        if let Some(choices) = resp_json.get("choices").and_then(|c| c.as_array()) {
            if let Some(first_choice) = choices.first() {
                if let Some(message) = first_choice.get("message") {
                    let mut final_content = String::new();
                    
                    // 严格按照 inkos-master 的标准，丢弃推理内容 reasoning_content。
                    // 仅提取真正的 content，如果大模型尚未思考完毕被截断（content为空），则应该返回空
                    if let Some(content) = message.get("content") {
                        if let Some(content_str) = content.as_str() {
                            if !content_str.is_empty() {
                                final_content.push_str(content_str);
                                return Ok(final_content);
                            }
                        } else if !content.is_null() {
                            final_content.push_str(&content.to_string());
                            return Ok(final_content);
                        }
                    }
                    
                    if !final_content.is_empty() {
                         return Ok(final_content);
                    }

                    // 如果 content 还是空，说明模型由于 4096 token 限制被截断了！
                    // 为了不让界面完全空白，我们只能从 reasoning_content 中抢救性提取最后的文本
                    if let Some(reasoning) = message.get("reasoning_content") {
                        if let Some(reasoning_str) = reasoning.as_str() {
                            if !reasoning_str.is_empty() {
                                return Ok(reasoning_str.to_string());
                            }
                        }
                    }
                    return Ok("".to_string());
                }
            }
        }
        
        println!("No choices or content returned from LLM. Full response might be malformed.");
        Err(anyhow::anyhow!("No choices returned from LLM"))
    }
}
