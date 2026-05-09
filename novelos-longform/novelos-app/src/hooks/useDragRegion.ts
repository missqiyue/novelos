import { useCallback, useRef, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Hook that returns props for a Tauri v2 window drag region.
 *
 * Uses a native (non-React) mousedown listener for maximum responsiveness.
 * startDragging() must be called during the native mouse event's call stack
 * for macOS to accept the drag — React's synthetic events may arrive too late.
 */
export function useDragRegion() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      // Don't drag if clicking on interactive elements
      const target = e.target as HTMLElement;
      if (target.closest("button, a, input, select, textarea, [role='button']")) return;

      getCurrentWindow().startDragging().catch(() => {});
    };

    el.addEventListener("mousedown", handleMouseDown);
    return () => el.removeEventListener("mousedown", handleMouseDown);
  }, []);

  return { ref };
}
