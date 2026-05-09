import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { platform } from "./platform";

export interface UpdateInfo {
  available: boolean;
  version?: string;
  date?: string;
  body?: string;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  if (!platform.isTauri) {
    return { available: false };
  }

  try {
    const update = await check();
    if (update) {
      return {
        available: true,
        version: update.version,
        date: update.date ?? undefined,
        body: update.body ?? undefined,
      };
    }
    return { available: false };
  } catch {
    return { available: false };
  }
}

export async function installUpdate(
  onProgress?: (downloaded: number, total: number | undefined) => void,
): Promise<void> {
  const update = await check();
  if (!update) {
    throw new Error("No update available");
  }

  let downloaded = 0;
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        downloaded = 0;
        break;
      case "Progress":
        downloaded += event.data.chunkLength;
        onProgress?.(downloaded, (event as any).data.contentLength ?? undefined);
        break;
      case "Finished":
        break;
    }
  });

  await relaunch();
}
