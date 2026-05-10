import { sql as v001 } from "./V001__global_tables";
import { sql as v002 } from "./V002__project_tables";
import { sql as v003 } from "./V003__seed_genre_templates";
import { sql as v004 } from "./V004__seed_soul_templates";
import { sql as v005 } from "./V005__seed_deai_and_banned";
import { sql as v006 } from "./V006__extended_seed_data";
import { sql as v005ProjectLlmError } from "./V005__llm_call_error_message";
import { sql as v006ProjectLlmStreamEvents } from "./V006__llm_stream_events";
import { sql as v007ProjectLlmCallRequestId } from "./V007__llm_call_request_id";
import { sql as v008ProjectChapterPipelineRuns } from "./V008__chapter_pipeline_runs";
import { sql as v009ProjectChapterQualityReports } from "./V009__chapter_quality_reports";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// Global database migrations (schema + seed data for shared tables)
export const globalMigrations: Migration[] = [
  { version: 1, name: "global_tables", sql: v001 },
  { version: 3, name: "seed_genre_templates", sql: v003 },
  { version: 4, name: "seed_soul_templates", sql: v004 },
  { version: 5, name: "seed_deai_and_banned", sql: v005 },
  { version: 6, name: "extended_seed_data", sql: v006 },
];

// Project database migrations (schema only, per-project data)
export const projectMigrations: Migration[] = [
  { version: 2, name: "project_tables", sql: v002 },
  { version: 5, name: "llm_call_error_message", sql: v005ProjectLlmError },
  { version: 6, name: "llm_stream_events", sql: v006ProjectLlmStreamEvents },
  { version: 7, name: "llm_call_request_id", sql: v007ProjectLlmCallRequestId },
  { version: 8, name: "chapter_pipeline_runs", sql: v008ProjectChapterPipelineRuns },
  { version: 9, name: "chapter_quality_reports", sql: v009ProjectChapterQualityReports },
];
