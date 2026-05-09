import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type { CrashRecoveryInfo } from "../tauri";

// Crash recovery is a desktop-only feature (uses filesystem).
// On web, these are no-ops.
export const crashRecoveryApi = {
  async emergencySave(_chapterNumber: number, _draftText: string): Promise<void> {},
  async check(): Promise<CrashRecoveryInfo[]> { return []; },
  async restore(_chapterNumber: number): Promise<string> { return ""; },
  async discard(_chapterNumber: number): Promise<void> {},
};
