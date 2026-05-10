// V007: Add request_id to llm_api_calls for joining stream events
export const sql = `
ALTER TABLE llm_api_calls ADD COLUMN request_id TEXT;
`;
