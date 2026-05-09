import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  BackupInfo,
} from "../tauri";

export const backupApi = {
  async create(): Promise<BackupInfo> {
    throw new WebNotSupportedError("backup");
  },
  async list(): Promise<BackupInfo[]> {
    throw new WebNotSupportedError("backup");
  },
  async restore(_backupPath: string): Promise<void> {
    throw new WebNotSupportedError("backup restore");
  },
};
