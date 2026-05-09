import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  PipelineResult,
} from "../tauri";

export const orchestratorApi = {
  async runPipeline(_chapterNumber: number): Promise<PipelineResult> {
    throw new WebNotSupportedError("pipeline execution (requires backend LLM service)");
  },
  async runBatchPipeline(_startChapter: number, _endChapter: number): Promise<PipelineResult[]> {
    throw new WebNotSupportedError("batch pipeline execution (requires backend LLM service)");
  },
};
