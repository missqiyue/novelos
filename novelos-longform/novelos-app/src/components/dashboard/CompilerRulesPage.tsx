import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Users,
  Clock,
  Zap,
  Eye,
  Lightbulb,
  FileText,
  Save,
  RotateCcw,
  AlertTriangle,
  Info,
  XCircle,
  Settings,
  SlidersHorizontal,
} from "lucide-react";

// ─── Checker definitions ───

interface CheckerConfig {
  key: string;
  name: string;
  description: string;
  icon: React.ReactNode;
}

const CHECKERS: CheckerConfig[] = [
  {
    key: "canon",
    name: "CanonChecker",
    description:
      "检查章节内容是否违反项目中定义的正典规则（世界观设定、硬性规则等）。硬规则违反将直接导致编译失败。",
    icon: <Shield size={16} className="text-indigo-500" />,
  },
  {
    key: "character",
    name: "CharacterChecker",
    description:
      "根据角色的 SOUL 档案检查角色行为、对话和决策是否符合设定。检查角色引用是否有效，避免引用已死亡或未创建的角色。",
    icon: <Users size={16} className="text-green-500" />,
  },
  {
    key: "timeline",
    name: "TimelineChecker",
    description:
      "检查章节的时间线是否与全局时间线一致，包括日期、相对天数、事件顺序等。防止时间线冲突和逻辑错误。",
    icon: <Clock size={16} className="text-blue-500" />,
  },
  {
    key: "power",
    name: "PowerChecker",
    description:
      "检查能力/技能体系的一致性，包括等级上限、冷却规则、消耗规则等。防止能力系统的矛盾使用。",
    icon: <Zap size={16} className="text-purple-500" />,
  },
  {
    key: "visibility",
    name: "VisibilityChecker",
    description:
      "检查知识可见性状态，确保角色不会知道他们不应该知道的信息。防止观点/知识泄露错误。",
    icon: <Eye size={16} className="text-cyan-500" />,
  },
  {
    key: "foreshadow",
    name: "ForeshadowChecker",
    description:
      "检查伏笔的播种和回收状态，包括超期伏笔、应在本章回收的伏笔等。确保伏笔体系的完整性。",
    icon: <Lightbulb size={16} className="text-amber-500" />,
  },
  {
    key: "word_count",
    name: "WordCountChecker",
    description: "检查章节字数是否在目标范围内，对话比例是否合理，段落结构是否均衡。",
    icon: <FileText size={16} className="text-rose-500" />,
  },
];

// ─── Types for saved state ───

interface CheckerSetting {
  enabled: boolean;
  severity: "info" | "warning" | "error";
}

interface CompilerSettings {
  checkers: Record<string, CheckerSetting>;
  maxWarningsBeforeFail: number;
  maxInfosBeforeWarning: number;
}

const STORAGE_KEY = "novelos_compiler_rules_settings";

const DEFAULT_SETTINGS: CompilerSettings = {
  checkers: Object.fromEntries(
    CHECKERS.map((c) => [c.key, { enabled: true, severity: "warning" as const }]),
  ),
  maxWarningsBeforeFail: 5,
  maxInfosBeforeWarning: 10,
};

// ─── Severity badge ───

const SEVERITY_CONFIG: Record<
  string,
  { bg: string; text: string; border: string; icon: React.ReactNode; label: string }
> = {
  info: {
    bg: "bg-blue-100",
    text: "text-blue-700",
    border: "border-blue-300",
    icon: <Info size={12} className="text-blue-500" />,
    label: "Info",
  },
  warning: {
    bg: "bg-yellow-100",
    text: "text-yellow-700",
    border: "border-yellow-300",
    icon: <AlertTriangle size={12} className="text-yellow-500" />,
    label: "Warning",
  },
  error: {
    bg: "bg-red-100",
    text: "text-red-700",
    border: "border-red-300",
    icon: <XCircle size={12} className="text-red-500" />,
    label: "Error",
  },
};

// ─── Main component ───

export function CompilerRulesPage() {
  const [settings, setSettings] = useState<CompilerSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Ensure all checkers exist in saved data
        const checkers = { ...DEFAULT_SETTINGS.checkers, ...parsed.checkers };
        return {
          checkers,
          maxWarningsBeforeFail:
            parsed.maxWarningsBeforeFail ?? DEFAULT_SETTINGS.maxWarningsBeforeFail,
          maxInfosBeforeWarning:
            parsed.maxInfosBeforeWarning ?? DEFAULT_SETTINGS.maxInfosBeforeWarning,
        };
      }
    } catch {
      // Use defaults
    }
    return { ...DEFAULT_SETTINGS, checkers: { ...DEFAULT_SETTINGS.checkers } };
  });

  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Auto-hide success message
  useEffect(() => {
    if (saved) {
      const timer = setTimeout(() => setSaved(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [saved]);

  const toggleChecker = useCallback((key: string) => {
    setSettings((prev) => ({
      ...prev,
      checkers: {
        ...prev.checkers,
        [key]: {
          ...prev.checkers[key],
          enabled: !prev.checkers[key]?.enabled,
        },
      },
    }));
  }, []);

  const setSeverity = useCallback((key: string, severity: "info" | "warning" | "error") => {
    setSettings((prev) => ({
      ...prev,
      checkers: {
        ...prev.checkers,
        [key]: {
          ...prev.checkers[key],
          severity,
        },
      },
    }));
  }, []);

  const setMaxWarnings = useCallback((val: number) => {
    setSettings((prev) => ({ ...prev, maxWarningsBeforeFail: val }));
  }, []);

  const setMaxInfos = useCallback((val: number) => {
    setSettings((prev) => ({ ...prev, maxInfosBeforeWarning: val }));
  }, []);

  const handleSave = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
      setSaveError(null);
    } catch (e: any) {
      setSaveError(e?.toString() || "保存设置失败");
    }
  }, [settings]);

  const handleReset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, checkers: { ...DEFAULT_SETTINGS.checkers } });
    setSaved(false);
    setSaveError(null);
  }, []);

  // Count enabled checkers
  const enabledCount = Object.values(settings.checkers).filter((c) => c.enabled).length;

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings size={24} className="text-indigo-500" />
            编译器规则引擎
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            配置各检查器的启用状态和严重程度 &middot; 已启用 {enabledCount}/{CHECKERS.length}{" "}
            个检查器
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={15} />
            重置
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            <Save size={15} />
            应用设置
          </button>
        </div>
      </div>

      {/* Save feedback */}
      {saved && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-center gap-2">
          <Save size={14} />
          设置已保存到本地存储
        </div>
      )}
      {saveError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <XCircle size={14} className="shrink-0 mt-0.5" />
          {saveError}
        </div>
      )}

      {/* Global Settings */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal size={18} className="text-gray-600" />
          <h2 className="text-base font-semibold text-gray-900">全局设置</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              最大警告数 (超过后编译失败)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={settings.maxWarningsBeforeFail}
                onChange={(e) => setMaxWarnings(Math.max(1, Number(e.target.value)))}
                className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <span className="text-xs text-gray-500">
                当前: 累计 {settings.maxWarningsBeforeFail} 个警告后标记为失败
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              最大 Info 数 (超过后升级为警告)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={200}
                value={settings.maxInfosBeforeWarning}
                onChange={(e) => setMaxInfos(Math.max(1, Number(e.target.value)))}
                className="w-24 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
              <span className="text-xs text-gray-500">
                当前: 累计 {settings.maxInfosBeforeWarning} 个 Info 后升级为 Warning
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Checker Cards */}
      <div className="space-y-4">
        {CHECKERS.map((checker) => {
          const setting = settings.checkers[checker.key];
          const sev = SEVERITY_CONFIG[setting?.severity ?? "warning"];

          return (
            <div
              key={checker.key}
              className={`bg-white border rounded-lg p-5 transition-colors ${
                setting?.enabled ? "border-gray-200" : "border-gray-100 opacity-60"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Enable/Disable checkbox */}
                <label className="shrink-0 mt-0.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={setting?.enabled ?? true}
                    onChange={() => toggleChecker(checker.key)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </label>

                {/* Checker info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {checker.icon}
                    <h3 className="text-sm font-semibold text-gray-900">{checker.name}</h3>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        setting?.enabled
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {setting?.enabled ? "已启用" : "已禁用"}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-3">
                    {checker.description}
                  </p>

                  {/* Severity selector */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-gray-500">严重程度:</span>
                    <div className="flex items-center gap-1">
                      {(["info", "warning", "error"] as const).map((level) => {
                        const cfg = SEVERITY_CONFIG[level];
                        const isSelected = setting?.severity === level;
                        return (
                          <button
                            key={level}
                            onClick={() => setSeverity(checker.key, level)}
                            disabled={!setting?.enabled}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                              isSelected
                                ? `${cfg.bg} ${cfg.text} ${cfg.border}`
                                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                            } disabled:opacity-40 disabled:cursor-not-allowed`}
                          >
                            {cfg.icon}
                            {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom info */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
        <div className="flex items-start gap-2">
          <Info size={14} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-gray-700 mb-1">关于编译器规则引擎</p>
            <p>
              编译器在每次编译章节时会按照以上配置依次执行各检查器。 检查顺序: CanonChecker →
              CharacterChecker → TimelineChecker → PowerChecker → VisibilityChecker →
              ForeshadowChecker → WordCountChecker。 所有检查结果将汇总为最终编译状态 (Pass /
              Warning / Fail)。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
