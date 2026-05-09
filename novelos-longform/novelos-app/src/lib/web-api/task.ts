import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  BackgroundTask,
} from "../tauri";

const taskRegistry = new Map<string, BackgroundTask>();

export const taskApi = {
  async listProjectTasks(projectId: string): Promise<BackgroundTask[]> {
    return Array.from(taskRegistry.values()).filter((t) => t.project_id === projectId);
  },

  async cancelTask(taskId: string): Promise<void> {
    const task = taskRegistry.get(taskId);
    if (task) {
      task.status = "cancelled";
      task.updated_at = now();
    }
  },

  async pauseTask(taskId: string): Promise<void> {
    const task = taskRegistry.get(taskId);
    if (task) {
      task.status = "paused";
      task.updated_at = now();
    }
  },

  async resumeTask(taskId: string): Promise<void> {
    const task = taskRegistry.get(taskId);
    if (task) {
      task.status = "running";
      task.updated_at = now();
    }
  },
};
