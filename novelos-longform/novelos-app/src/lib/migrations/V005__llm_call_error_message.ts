// V005: Add error_message to llm_api_calls
export const sql = `
ALTER TABLE llm_api_calls ADD COLUMN error_message TEXT;
`;
