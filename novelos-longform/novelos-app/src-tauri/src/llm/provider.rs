use crate::llm::{ChatMessage, ChatResponse, StreamChunk};
use tokio_stream::Stream;

pub trait LlmProvider {
    fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<ChatResponse, Box<dyn std::error::Error + Send + Sync>>> + Send + '_>,
    >;

    fn chat_completion_stream(
        self,
        messages: Vec<ChatMessage>,
    ) -> std::pin::Pin<
        Box<dyn Stream<Item = Result<StreamChunk, Box<dyn std::error::Error + Send + Sync>>> + Send>,
    >
    where
        Self: Sized + Send + 'static;
}
