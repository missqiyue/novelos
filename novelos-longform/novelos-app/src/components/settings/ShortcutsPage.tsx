import { Command, Hash, Navigation } from "lucide-react";

// ─── Shortcut definition ───

interface ShortcutEntry {
  keyCombo: string;
  keys: string[];
  description: string;
  category: string;
}

// ─── Static data ───

const SHORTCUTS: ShortcutEntry[] = [
  // 全局
  { keyCombo: "Cmd+K", keys: ["Cmd", "K"], description: "全局搜索", category: "全局" },
  { keyCombo: "Cmd+S", keys: ["Cmd", "S"], description: "保存当前章节", category: "全局" },
  // 导航
  { keyCombo: "Ctrl+1", keys: ["Ctrl", "1"], description: "切换到看板", category: "导航" },
  { keyCombo: "Ctrl+2", keys: ["Ctrl", "2"], description: "切换到剧情树", category: "导航" },
  { keyCombo: "Ctrl+3", keys: ["Ctrl", "3"], description: "切换到正典", category: "导航" },
];

// ─── Categories for grouping ───

const CATEGORIES = [
  {
    key: "全局",
    label: "全局",
    icon: <Command size={14} />,
  },
  {
    key: "编辑器",
    label: "编辑器",
    icon: <Hash size={14} />,
  },
  {
    key: "导航",
    label: "导航",
    icon: <Navigation size={14} />,
  },
];

// ─── Component ───

export function ShortcutsPage() {
  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">键盘快捷键参考</h2>
      <p className="text-xs text-gray-400 mb-6">以下是 NovelOS Longform 中所有可用的键盘快捷键</p>

      {/* Shortcuts grouped by category */}
      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const items = SHORTCUTS.filter((s) => s.category === cat.key);
          if (items.length === 0) return null;

          return (
            <div key={cat.key}>
              {/* Category header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-indigo-500">{cat.icon}</span>
                <h3 className="text-sm font-medium text-gray-700">{cat.label}</h3>
                <span className="text-xs text-gray-400">({items.length})</span>
              </div>

              {/* Table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-3 gap-4 px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
                  <span>快捷键</span>
                  <span>功能</span>
                  <span>分类</span>
                </div>

                {/* Data rows */}
                <div className="divide-y divide-gray-100">
                  {items.map((shortcut, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-3 gap-4 px-4 py-3 items-center text-sm hover:bg-gray-50 transition-colors"
                    >
                      {/* Key combo with kbd styling */}
                      <span className="flex items-center gap-1">
                        {shortcut.keys.map((key, ki) => (
                          <span key={ki} className="inline-flex items-center gap-1">
                            <kbd className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-md bg-gray-100 border border-gray-300 text-xs font-mono font-medium text-gray-700 shadow-sm">
                              {key}
                            </kbd>
                            {ki < shortcut.keys.length - 1 && (
                              <span className="text-gray-400 text-xs">+</span>
                            )}
                          </span>
                        ))}
                      </span>

                      {/* Description */}
                      <span className="text-gray-800">{shortcut.description}</span>

                      {/* Category badge */}
                      <span className="inline-flex items-center justify-self-start px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium">
                        {shortcut.category}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Platform note */}
      <div className="mt-8 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
        <p>
          <strong>注意:</strong> macOS 上{" "}
          <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-gray-200 border border-gray-300 text-[10px] font-mono text-gray-600">
            Cmd
          </kbd>{" "}
          即{" "}
          <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-gray-200 border border-gray-300 text-[10px] font-mono text-gray-600">
            Meta
          </kbd>{" "}
          键, Windows/Linux 上{" "}
          <kbd className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded bg-gray-200 border border-gray-300 text-[10px] font-mono text-gray-600">
            Ctrl
          </kbd>{" "}
          对应相同功能。
        </p>
      </div>
    </div>
  );
}
