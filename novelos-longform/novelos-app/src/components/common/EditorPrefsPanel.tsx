import { useState, useEffect, useCallback } from "react";
import { Type, AlignLeft, MoveHorizontal, Settings2 } from "lucide-react";
import { sharedResourcesApi, type EditorPrefs } from "../../lib/api";

const FONT_OPTIONS = [
  { value: "", label: "默认" },
  { value: "serif", label: "衬线体 (Serif)" },
  { value: "sans-serif", label: "无衬线 (Sans-serif)" },
  { value: "monospace", label: "等宽体 (Monospace)" },
  { value: "'Noto Serif SC', serif", label: "思源宋体" },
  { value: "'Noto Sans SC', sans-serif", label: "思源黑体" },
];

const MARGIN_OPTIONS = [
  { value: "", label: "默认" },
  { value: "narrow", label: "窄" },
  { value: "medium", label: "中" },
  { value: "wide", label: "宽" },
];

interface EditorPrefsPanelProps {
  visible: boolean;
  onClose: () => void;
  onApply: (prefs: EditorPrefs) => void;
}

export function EditorPrefsPanel({ visible, onClose, onApply }: EditorPrefsPanelProps) {
  const [prefs, setPrefs] = useState<EditorPrefs>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    sharedResourcesApi
      .getEditorPrefs()
      .then((p) => setPrefs(p))
      .catch(() => setPrefs({}))
      .finally(() => setLoading(false));
  }, [visible]);

  const update = useCallback(
    <K extends keyof EditorPrefs>(key: K, value: EditorPrefs[K]) => {
      const next = { ...prefs, [key]: value };
      setPrefs(next);
      sharedResourcesApi.setEditorPrefs(next).catch(() => {});
      onApply(next);
    },
    [prefs, onApply],
  );

  if (!visible) return null;

  return (
    <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 text-sm">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="font-medium text-gray-700 flex items-center gap-1.5">
          <Settings2 size={14} />
          编辑器偏好
        </span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
          &times;
        </button>
      </div>

      {loading ? (
        <div className="px-3 py-4 text-center text-gray-400">加载中...</div>
      ) : (
        <div className="px-3 py-2 space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500 flex items-center gap-1 mb-1">
              <Type size={11} /> 字体
            </span>
            <select
              value={prefs.font_family ?? ""}
              onChange={(e) => update("font_family", e.target.value || undefined)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white"
            >
              {FONT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 flex items-center gap-1 mb-1">
              <Type size={11} /> 字号: {prefs.font_size ?? 14}px
            </span>
            <input
              type="range"
              min={12}
              max={24}
              step={1}
              value={prefs.font_size ?? 14}
              onChange={(e) => update("font_size", parseInt(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 flex items-center gap-1 mb-1">
              <AlignLeft size={11} /> 行距: {prefs.line_spacing ?? 1.75}
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.25}
              value={prefs.line_spacing ?? 1.75}
              onChange={(e) => update("line_spacing", parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 flex items-center gap-1 mb-1">
              <AlignLeft size={11} /> 段间距: {prefs.paragraph_spacing ?? 1}em
            </span>
            <input
              type="range"
              min={0}
              max={3}
              step={0.25}
              value={prefs.paragraph_spacing ?? 1}
              onChange={(e) => update("paragraph_spacing", parseFloat(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </label>

          <label className="block">
            <span className="text-xs text-gray-500 flex items-center gap-1 mb-1">
              <MoveHorizontal size={11} /> 页边距
            </span>
            <select
              value={prefs.margin_width ?? ""}
              onChange={(e) => update("margin_width", e.target.value || undefined)}
              className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white"
            >
              {MARGIN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
