const isTauri = (() => {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
})();

export const platform = {
  get isTauri() {
    return isTauri;
  },
  get isWeb() {
    return !isTauri;
  },
};

export interface FileDialogOptions {
  multiple?: boolean;
  filters?: { name: string; extensions: string[] }[];
}

export async function openFileDialog(options?: FileDialogOptions): Promise<string | null> {
  if (platform.isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const result = await open({
      multiple: options?.multiple ?? false,
      filters: options?.filters,
    });
    if (!result) return null;
    return typeof result === "string" ? result : result;
  }
  // Web fallback: use native file input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = options?.multiple ?? false;
    if (options?.filters?.length) {
      const exts = options.filters.flatMap((f) => f.extensions.map((e) => `.${e}`));
      input.accept = exts.join(",");
    }
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) resolve(file.name);
      else resolve(null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
