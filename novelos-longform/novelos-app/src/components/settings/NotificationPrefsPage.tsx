import { useState, useEffect } from "react";
import { Bell, BellOff, Save } from "lucide-react";

interface NotifPrefs {
  compiler_errors: boolean;
  compiler_warnings: boolean;
  review_complete: boolean;
  chapter_finalized: boolean;
  pipeline_complete: boolean;
  system_updates: boolean;
}

const DEFAULT_PREFS: NotifPrefs = {
  compiler_errors: true,
  compiler_warnings: true,
  review_complete: true,
  chapter_finalized: true,
  pipeline_complete: true,
  system_updates: true,
};

const STORAGE_KEY = "novelos_notification_prefs";

function loadPrefs(): NotifPrefs {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_PREFS, ...JSON.parse(saved) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: NotifPrefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

const NOTIF_ITEMS: { key: keyof NotifPrefs; label: string; desc: string }[] = [
  { key: "compiler_errors", label: "编译错误", desc: "当章节编译发现硬规则违反时通知" },
  { key: "compiler_warnings", label: "编译警告", desc: "当章节编译发现潜在问题时通知" },
  { key: "review_complete", label: "评审完成", desc: "当全链路评审完成时通知" },
  { key: "chapter_finalized", label: "章节定稿", desc: "当章节成功定稿时通知" },
  { key: "pipeline_complete", label: "流水线完成", desc: "当全链路生成完成时通知" },
  { key: "system_updates", label: "系统更新", desc: "当有新版本可用时通知" },
];

export function NotificationPrefsPage() {
  const [prefs, setPrefs] = useState<NotifPrefs>(loadPrefs);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    savePrefs(prefs);
  }, []); // no-op initial

  const toggle = (key: keyof NotifPrefs) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    savePrefs(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">通知偏好</h2>
        {saved && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <Save size={12} /> 已保存
          </span>
        )}
      </div>
      <div className="space-y-2">
        {NOTIF_ITEMS.map(({ key, label, desc }) => (
          <div
            key={key}
            className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
          >
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900">{label}</span>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
            <button
              onClick={() => toggle(key)}
              className={`p-2 rounded-lg transition-colors ${
                prefs[key] ? "bg-indigo-50 text-indigo-600" : "bg-gray-50 text-gray-400"
              }`}
            >
              {prefs[key] ? <Bell size={16} /> : <BellOff size={16} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
