import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type { ComplianceScanResult, ComplianceWordEntry } from "../tauri";

// Compliance shield stubs for web mode
export const complianceApi = {
  async scanChapter(_chapterNumber: number): Promise<ComplianceScanResult> {
    return { chapter_number: 0, total_hits: 0, high_risk_count: 0, medium_risk_count: 0, low_risk_count: 0, hits: [] };
  },
  async scanAll(): Promise<ComplianceScanResult[]> { return []; },
  async listWords(): Promise<ComplianceWordEntry[]> { return []; },
  async addWord(_word: string, _category: string, _riskLevel: string, _suggestion?: string): Promise<ComplianceWordEntry> {
    throw new WebNotSupportedError("Compliance shield requires desktop app");
  },
  async deleteWord(_id: string): Promise<void> {
    throw new WebNotSupportedError("Compliance shield requires desktop app");
  },
};
