import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      for (const s of shortcuts) {
        const keyMatch = e.key.toLowerCase() === s.key.toLowerCase();
        const ctrlMatch = s.ctrl ? e.ctrlKey || e.metaKey : true;
        const metaMatch = s.meta ? e.metaKey : true;
        const shiftMatch = s.shift ? e.shiftKey : true;

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch) {
          e.preventDefault();
          s.action();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}

// Global shortcuts in the layout
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectId = location.pathname.split("/")[2];

  useKeyboardShortcuts([
    {
      key: "k",
      meta: true,
      action: () => {
        // Trigger global search focus — dispatched via custom event
        window.dispatchEvent(new CustomEvent("open-global-search"));
      },
      description: "全局搜索",
    },
    {
      key: "s",
      meta: true,
      action: () => {
        window.dispatchEvent(new CustomEvent("save-current-chapter"));
      },
      description: "保存当前章节",
    },
    {
      key: "1",
      ctrl: true,
      action: () => projectId && navigate(`/project/${projectId}/dashboard`),
      description: "切换到看板",
    },
    {
      key: "2",
      ctrl: true,
      action: () => projectId && navigate(`/project/${projectId}/outline`),
      description: "切换到剧情树",
    },
    {
      key: "3",
      ctrl: true,
      action: () => projectId && navigate(`/project/${projectId}/canon`),
      description: "切换到正典",
    },
  ]);
}
