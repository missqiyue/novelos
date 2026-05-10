-- V005: 为 LLM 调用日志补充错误详情

ALTER TABLE llm_api_calls ADD COLUMN error_message TEXT;
