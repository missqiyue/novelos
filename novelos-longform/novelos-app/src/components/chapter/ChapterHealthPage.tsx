import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useChapterStore, useProjectStore } from "../../stores";
import { compilerApi, type CompileResult, type CompileIssue } from "../../lib/api";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  FileText,
  Gauge,
  Clock,
} from "lucide-react";

// ─── Checker rule descriptions (hardcoded, supplemented by compilerApi) ───

const CHECKER_DESCRIPTIONS: Record<string, { name: string; description: string }> = {
  word_count: {
    name: "字数检查",
    description:
      "验证章节字数在项目设定的最小和最大字数范围内。低于最小字数可能导致内容不充实，超出最大字数可能需要拆分。",
  },
  hard_rules: {
    name: "硬规则检查",
    description:
      "检查章节内容是否违反项目中定义的硬性正典规则（如世界观设定、等级体系、禁忌等）。硬规则违反将直接导致编译失败。",
  },
  soft_rules: {
    name: "软规则检查",
    description:
      "检查章节内容是否符合项目中定义的软性正典规则。软规则违反不会导致编译失败，但会发出警告。",
  },
  character_soul: {
    name: "角色心智检查",
    description: "根据角色的 SOUL 档案检查对话和行为是否符合角色的性格、说话方式和行为模式设定。",
  },
  foreshadow: {
    name: "伏笔检查",
    description: "检查章节中涉及的伏笔状态，包括是否已超期、是否需要在本章回收等。",
  },
  dialogue_ratio: {
    name: "对话比例检查",
    description: "检查章节中对话所占比例是否合理。对话过多可能显得拖沓，过少可能显得单薄。",
  },
  character_reference: {
    name: "角色引用检查",
    description: "验证章节中引用的角色是否都存在且活跃，避免引用已死亡或未创建的角色。",
  },
  taboo_words: {
    name: "禁忌词检查",
    description: "检查章节中是否使用 AI 常见套话、平台禁忌词或用户自定义的禁用词。",
  },
};

// ─── Helpers ───

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: string): {
  bg: string;
  text: string;
  icon: React.ReactNode;
  label: string;
} {
  switch (status) {
    case "pass":
      return {
        bg: "bg-green-100 border-green-300",
        text: "text-green-700",
        icon: <CheckCircle size={18} className="text-green-600" />,
        label: "通过",
      };
    case "warning":
      return {
        bg: "bg-yellow-100 border-yellow-300",
        text: "text-yellow-700",
        icon: <AlertTriangle size={18} className="text-yellow-600" />,
        label: "警告",
      };
    case "fail":
      return {
        bg: "bg-red-100 border-red-300",
        text: "text-red-700",
        icon: <XCircle size={18} className="text-red-600" />,
        label: "失败",
      };
    default:
      return {
        bg: "bg-gray-100 border-gray-300",
        text: "text-gray-600",
        icon: <Info size={18} className="text-gray-500" />,
        label: status || "未知",
      };
  }
}

function severityIcon(severity: string) {
  switch (severity) {
    case "error":
      return <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />;
    case "warning":
      return <AlertTriangle size={14} className="text-yellow-500 shrink-0 mt-0.5" />;
    case "info":
      return <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />;
    default:
      return <Info size={14} className="text-gray-400 shrink-0 mt-0.5" />;
  }
}

function scoreColor(s: number): string {
  if (s >= 80) return "text-green-600";
  if (s >= 60) return "text-yellow-600";
  return "text-red-600";
}

function scoreBg(s: number): string {
  if (s >= 80) return "bg-green-100";
  if (s >= 60) return "bg-yellow-100";
  return "bg-red-100";
}

function scoreBorder(s: number): string {
  if (s >= 80) return "border-green-500";
  if (s >= 60) return "border-yellow-500";
  return "border-red-500";
}

// ─── Word Count Gauge Component ───

function WordCountGauge({ current, min, max }: { current: number; min: number; max: number }) {
  const pct = max > min ? Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100)) : 50;
  const inRange = current >= min && current <= max;
  const rangeLabel =
    current < min ? `低于下限 ${min}` : current > max ? `超出上限 ${max}` : "在合理范围";

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-3">
        <Gauge size={16} className="text-indigo-500" />
        字数仪表
      </h4>
      <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
        {/* background zones */}
        <div
          className="absolute h-full bg-red-100"
          style={{ left: 0, width: `${(min / max) * 100}%` }}
        />
        <div
          className="absolute h-full bg-green-100"
          style={{ left: `${(min / max) * 100}%`, width: `${((max - min) / max) * 100}%` }}
        />
        {/* current marker */}
        <div
          className="absolute top-0 h-full w-1 bg-indigo-600 rounded transition-all duration-300"
          style={{ left: `${Math.min(100, (current / max) * 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>0</span>
        <span className="text-red-500">{min} (下限)</span>
        <span className="text-green-600">{max} (上限)</span>
      </div>
      <div className="mt-2 text-center">
        <span className="text-lg font-bold text-gray-900">{current.toLocaleString()}</span>
        <span className="text-sm text-gray-500"> 字</span>
        <span
          className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
            inRange ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
          }`}
        >
          {rangeLabel}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ───

export function ChapterHealthPage() {
  const { chapterNumber: chapterNumberParam } = useParams<{ chapterNumber: string }>();
  const chapterNumber = Number(chapterNumberParam);
  const { currentChapter, selectChapter } = useChapterStore();
  const { project } = useProjectStore();

  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);
  const [expandedCheckers, setExpandedCheckers] = useState<Set<string>>(new Set());

  // Load chapter
  useEffect(() => {
    if (!isNaN(chapterNumber) && chapterNumber > 0) {
      selectChapter(chapterNumber);
    }
  }, [chapterNumber, selectChapter]);

  const runCompiler = useCallback(async () => {
    if (!currentChapter) return;
    const text = currentChapter.draft_text || currentChapter.final_text || "";
    if (!text.trim()) {
      setError("章节内容为空，无法编译检查。请先撰写内容。");
      return;
    }

    setCompiling(true);
    setError(null);
    try {
      const result = await compilerApi.compile(chapterNumber, text);
      setCompileResult(result);
      setLastCheckTime(new Date().toISOString());
      // Auto-expand checkers with issues
      const withIssues = new Set<string>();
      result.issues.forEach((issue) => withIssues.add(issue.checker));
      setExpandedCheckers(withIssues);
    } catch (e: any) {
      setError(e?.toString() || "编译检查失败");
      setCompileResult(null);
    }
    setCompiling(false);
  }, [currentChapter, chapterNumber]);

  // ─── Group issues by checker ───

  const issuesByChecker: Record<string, CompileIssue[]> = {};
  if (compileResult) {
    compileResult.issues.forEach((issue) => {
      const key = issue.checker;
      if (!issuesByChecker[key]) issuesByChecker[key] = [];
      issuesByChecker[key].push(issue);
    });
  }

  const toggleChecker = (checker: string) => {
    setExpandedCheckers((prev) => {
      const next = new Set(prev);
      if (next.has(checker)) next.delete(checker);
      else next.add(checker);
      return next;
    });
  };

  // ─── Edge: invalid chapter number ───

  if (isNaN(chapterNumber) || chapterNumber <= 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <AlertTriangle size={24} className="mr-2 text-yellow-500" />
        无效的章节编号
      </div>
    );
  }

  // ─── Chapter not loaded yet ───

  if (!currentChapter) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-2" />
        加载章节 {chapterNumber}...
      </div>
    );
  }

  const badge = compileResult ? statusBadge(compileResult.status) : null;
  const wordCount = compileResult?.stats?.word_count ?? currentChapter.word_count ?? 0;
  const minWords = project?.min_chapter_words || 2000;
  const maxWords = project?.max_chapter_words || 8000;

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">第 {chapterNumber} 章 健康检查</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {currentChapter.title || "未命名"} &middot; 状态: {currentChapter.status}
          </p>
        </div>
        <button
          onClick={runCompiler}
          disabled={compiling}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border transition-colors text-sm font-medium ${
            compiling
              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
              : "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700"
          }`}
        >
          <RefreshCw size={16} className={compiling ? "animate-spin" : ""} />
          {compiling ? "编译中..." : "重新编译"}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
          <XCircle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Result summary card */}
      {compileResult && badge && (
        <div className={`border rounded-lg p-5 mb-6 ${badge.bg}`}>
          <div className="flex items-center gap-4">
            <div
              className={`w-20 h-20 rounded-full border-4 flex items-center justify-center ${scoreBorder(
                compileResult.score,
              )} ${scoreBg(compileResult.score)}`}
            >
              <span className={`text-2xl font-bold ${scoreColor(compileResult.score)}`}>
                {compileResult.score}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {badge.icon}
                <span className={`text-lg font-bold ${badge.text}`}>{badge.label}</span>
                <span className="text-sm text-gray-500">评分: {compileResult.score}/100</span>
              </div>
              <p className="text-sm text-gray-600">
                {compileResult.status === "pass"
                  ? "编译检查全部通过，章节状态良好。"
                  : compileResult.status === "warning"
                    ? `发现 ${compileResult.issues.length} 个问题，建议处理后重新编译。`
                    : `发现 ${compileResult.issues.length} 个问题，存在需要立即修复的错误。`}
              </p>
              {compileResult.suggestions.length > 0 && (
                <p className="text-sm text-indigo-600 mt-1">
                  建议: {compileResult.suggestions.join("；")}
                </p>
              )}
              {lastCheckTime && (
                <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                  <Clock size={12} />
                  最后检查: {formatTime(lastCheckTime)}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No compile result yet */}
      {!compileResult && !error && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center mb-6">
          <FileText size={48} className="mx-auto text-gray-300 mb-3" />
          <h3 className="font-medium text-gray-700 mb-1">尚未编译检查</h3>
          <p className="text-sm text-gray-400 mb-4">
            点击「重新编译」按钮对本章进行编译检查和健康分析
          </p>
        </div>
      )}

      {/* Word count gauge + stats */}
      {compileResult && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <WordCountGauge current={wordCount} min={minWords} max={maxWords} />

            {/* Compile stats */}
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1.5 mb-3">
                <Info size={16} className="text-indigo-500" />
                编译统计
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500">硬规则检查</span>
                  <span className="font-medium text-gray-900">
                    {compileResult.stats.hard_rules_violated}/
                    {compileResult.stats.hard_rules_checked}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500">软规则检查</span>
                  <span className="font-medium text-gray-900">
                    {compileResult.stats.soft_rules_violated}/
                    {compileResult.stats.soft_rules_checked}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500">段落数</span>
                  <span className="font-medium text-gray-900">
                    {compileResult.stats.paragraph_count}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500">对话标记</span>
                  <span className="font-medium text-gray-900">
                    {compileResult.stats.dialogue_markers}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500">引用角色</span>
                  <span className="font-medium text-gray-900">
                    {compileResult.stats.characters_referenced.length}
                  </span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="text-gray-500">伏笔检查</span>
                  <span className="font-medium text-gray-900">
                    {compileResult.stats.foreshadow_items_overdue > 0
                      ? `${compileResult.stats.foreshadow_items_overdue} 超期`
                      : `${compileResult.stats.foreshadow_items_checked} 正常`}
                  </span>
                </div>
              </div>
              {compileResult.stats.characters_missing_soul.length > 0 && (
                <div className="mt-2 p-2 bg-yellow-50 rounded text-xs text-yellow-700">
                  缺少 SOUL 的角色: {compileResult.stats.characters_missing_soul.join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Checker results — expandable sections */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-gray-900 mb-3">检查器详情</h3>

            {Object.keys(CHECKER_DESCRIPTIONS).map((checkerKey) => {
              const checker = CHECKER_DESCRIPTIONS[checkerKey];
              const checkerIssues = issuesByChecker[checkerKey] || [];
              const isExpanded = expandedCheckers.has(checkerKey);
              const hasIssues = checkerIssues.length > 0;

              // Determine status for this checker
              const errorCount = checkerIssues.filter((i) => i.severity === "error").length;
              const warningCount = checkerIssues.filter((i) => i.severity === "warning").length;
              const infoCount = checkerIssues.filter((i) => i.severity === "info").length;

              return (
                <div
                  key={checkerKey}
                  className="border border-gray-100 rounded-lg mb-2 overflow-hidden"
                >
                  <button
                    onClick={() => toggleChecker(checkerKey)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown size={16} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={16} className="text-gray-400" />
                      )}
                      <span className="text-sm font-medium text-gray-900">{checker.name}</span>
                      {hasIssues ? (
                        <span className="flex items-center gap-1 text-xs">
                          {errorCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                              {errorCount} 错误
                            </span>
                          )}
                          {warningCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
                              {warningCount} 警告
                            </span>
                          )}
                          {infoCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                              {infoCount} 提示
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle size={12} /> 通过
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 pt-2 mb-2">{checker.description}</p>

                      {checkerIssues.length === 0 ? (
                        <p className="text-xs text-green-600 py-1">未发现问题</p>
                      ) : (
                        <div className="space-y-1.5 mt-2">
                          {checkerIssues.map((issue, idx) => (
                            <div
                              key={idx}
                              className={`flex items-start gap-2 p-2 rounded text-xs ${
                                issue.severity === "error"
                                  ? "bg-red-50 text-red-800"
                                  : issue.severity === "warning"
                                    ? "bg-yellow-50 text-yellow-800"
                                    : "bg-blue-50 text-blue-800"
                              }`}
                            >
                              {severityIcon(issue.severity)}
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{issue.message}</span>
                                {issue.detail && (
                                  <p className="mt-0.5 opacity-75">{issue.detail}</p>
                                )}
                                {issue.location && (
                                  <p className="text-xs mt-0.5 opacity-60">
                                    位置: {issue.location}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
