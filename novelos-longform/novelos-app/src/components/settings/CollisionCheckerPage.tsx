import { useState } from "react";
import {
  Search,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  Flame,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { worldApi, type CollisionItem } from "../../lib/api";

// ─── Result types ───
type CollisionLevel = "safe" | "attention" | "danger";

interface CheckResult {
  level: CollisionLevel;
  matches: CollisionItem[];
}

function classifyCollisions(matches: CollisionItem[]): CheckResult {
  if (matches.length === 0) {
    return { level: "safe", matches: [] };
  }
  const hasHigh = matches.some((m) => m.severity === "high");
  const hasMedium = matches.some((m) => m.severity === "medium");
  if (hasHigh) {
    return { level: "danger", matches };
  }
  if (hasMedium) {
    return { level: "attention", matches };
  }
  return { level: "attention", matches };
}

const levelConfig: Record<
  CollisionLevel,
  { label: string; icon: React.ReactNode; bg: string; text: string; border: string }
> = {
  safe: {
    label: "安全",
    icon: <ShieldCheck size={48} className="text-green-500" />,
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  attention: {
    label: "注意",
    icon: <ShieldAlert size={48} className="text-yellow-500" />,
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-yellow-200",
  },
  danger: {
    label: "危险",
    icon: <ShieldX size={48} className="text-red-500" />,
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
};

const severityBadge: Record<string, { badge: string; icon: React.ReactNode }> = {
  high: {
    badge: "bg-red-100 text-red-700",
    icon: <Flame size={12} className="text-red-500" />,
  },
  medium: {
    badge: "bg-yellow-100 text-yellow-700",
    icon: <TrendingUp size={12} className="text-yellow-500" />,
  },
  low: {
    badge: "bg-blue-100 text-blue-700",
    icon: <AlertTriangle size={12} className="text-blue-500" />,
  },
};

const severityLabel: Record<string, string> = {
  high: "高危",
  medium: "中危",
  low: "低危",
};

const typeLabel: Record<string, string> = {
  name: "人名",
  title: "书名",
};

// ─── Component ───
export function CollisionCheckerPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checked, setChecked] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleCheck = async () => {
    if (!query.trim()) return;
    setChecking(true);
    try {
      const matches = await worldApi.checkCollisions(query.trim());
      const res = classifyCollisions(matches);
      setResult(res);
      setChecked(true);
    } catch {
      setResult({ level: "safe", matches: [] });
      setChecked(true);
    } finally {
      setChecking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !checking) {
      handleCheck();
    }
  };

  const config = result ? levelConfig[result.level] : null;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">碰撞检查工具</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          输入潜在的角色名或书名，检查是否与敏感库中的条目发生碰撞
        </p>
      </div>

      {/* Input area */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          输入名称（角色名 / 书名）
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setChecked(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="输入角色名或书名..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            onClick={handleCheck}
            disabled={!query.trim() || checking}
            className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {checking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Search size={14} />
            )}
            {checking ? "检查中..." : "检查碰撞"}
          </button>
        </div>
      </div>

      {/* Result area */}
      {checked && config && (
        <div className={`rounded-lg border p-6 ${config.bg} ${config.border}`}>
          <div className="flex flex-col items-center mb-4">
            {config.icon}
            <p className={`mt-2 text-lg font-semibold ${config.text}`}>{config.label}</p>
            {result && (
              <p className="text-sm text-gray-500 mt-1">
                {result.level === "safe"
                  ? "未发现碰撞，该名称可以安全使用"
                  : result.level === "attention"
                    ? "发现低相似度匹配项，建议关注"
                    : "发现高危碰撞，强烈建议更换名称"}
              </p>
            )}
          </div>

          {result && result.matches.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                匹配到 {result.matches.length} 条相关记录：
              </p>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
                  <span className="col-span-1">类型</span>
                  <span className="col-span-5">名称</span>
                  <span className="col-span-4">原因</span>
                  <span className="col-span-2">风险等级</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {result.matches.map((item) => {
                    const sev = severityBadge[item.severity] || severityBadge.low;
                    return (
                      <div
                        key={item.id}
                        className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm hover:bg-gray-50"
                      >
                        <span className="col-span-1">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            {typeLabel[item.item_type] || item.item_type}
                          </span>
                        </span>
                        <span className="col-span-5 font-medium text-gray-800 truncate">
                          {item.text}
                        </span>
                        <span className="col-span-4 text-gray-600 text-xs">{item.reason}</span>
                        <span className="col-span-2 flex items-center gap-1">
                          {sev.icon}
                          <span className={`text-xs px-2 py-0.5 rounded-full ${sev.badge}`}>
                            {severityLabel[item.severity] || item.severity}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hint when not yet checked */}
      {!checked && !checking && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Search size={48} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">输入名称后点击"检查碰撞"</p>
          <p className="text-xs text-gray-400 mt-1">系统将在敏感人名库和书名库中进行子串匹配</p>
        </div>
      )}
    </div>
  );
}
