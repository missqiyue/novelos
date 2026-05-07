import { useEffect, useState, useMemo } from "react";
import { useProjectStore, useChapterStore, useCanonStore, useOutlineStore } from "../../stores";
import { ledgerApi, type LedgerSummary } from "../../lib/api";
import {
  Heart,
  Shield,
  Lightbulb,
  FileText,
  Users,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

// ─── Types ───

interface RiskItem {
  severity: "high" | "medium" | "low";
  category: string;
  message: string;
  description: string;
  suggestion: string;
}

interface MetricCard {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  score: number;
  detail: string;
  subDetail: string;
}

interface HealthReport {
  overallScore: number;
  metrics: {
    compilerPassRate: number;
    compilerPassed: number;
    compilerFailed: number;
    compilerUnchecked: number;
    foreshadowHealth: number;
    foreshadowTotal: number;
    foreshadowResolved: number;
    foreshadowPlanted: number;
    foreshadowOverdue: number;
    chapterProgress: number;
    chapterTotal: number;
    chapterFinalized: number;
    chapterDrafting: number;
    characterCompleteness: number;
    characterTotal: number;
    characterWithSoul: number;
    characterMissingSoul: number;
  };
  risks: RiskItem[];
  recommendations: string[];
}

// ─── Helpers ───

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

function scoreBar(s: number): string {
  if (s >= 80) return "bg-green-500";
  if (s >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function scoreBorder(s: number): string {
  if (s >= 80) return "border-green-500";
  if (s >= 60) return "border-yellow-500";
  return "border-red-500";
}

function severityBadge(severity: "high" | "medium" | "low"): {
  bg: string;
  text: string;
  label: string;
} {
  switch (severity) {
    case "high":
      return { bg: "bg-red-100", text: "text-red-700", label: "高" };
    case "medium":
      return { bg: "bg-yellow-100", text: "text-yellow-700", label: "中" };
    case "low":
      return { bg: "bg-blue-100", text: "text-blue-700", label: "低" };
  }
}

// ─── Component ───

export function ProjectHealthReportPage() {
  const { project } = useProjectStore();
  const { chapters, characters, fetchChapters, fetchCharacters } = useChapterStore();
  const { rules, fetch: fetchCanon } = useCanonStore();
  const { volumes, fetchVolumes } = useOutlineStore();
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchChapters(),
        fetchCharacters(),
        fetchCanon(),
        fetchVolumes(),
        ledgerApi
          .getSummary()
          .then(setLedger)
          .catch(() => {}),
      ]);
    } catch {
      // errors surfaced via store state
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchChapters();
    fetchCharacters();
    fetchCanon();
    fetchVolumes();
    ledgerApi
      .getSummary()
      .then(setLedger)
      .catch(() => {});
    setLoading(false);
  }, [fetchChapters, fetchCharacters, fetchCanon, fetchVolumes]);

  // ─── Compute metrics ───

  const report = useMemo<HealthReport>(() => {
    const totalChapters = chapters.length || 1;
    const finalized = chapters.filter(
      (ch) => ch.status === "finalized" || ch.status === "approved",
    ).length;
    const drafting = chapters.filter(
      (ch) => ch.status === "drafting" || ch.status === "draft_generated",
    ).length;
    const compilePassed = chapters.filter((ch) => ch.compiler_status === "pass").length;
    const compileFailed = chapters.filter((ch) => ch.compiler_status === "fail").length;
    const compileUnchecked = chapters.filter(
      (ch) => ch.compiler_status !== "pass" && ch.compiler_status !== "fail",
    ).length;

    const withSoul = characters.filter((c) => c.soul_json && c.soul_json !== "{}").length;
    const missingSoul = characters.filter((c) => !c.soul_json || c.soul_json === "{}").length;

    const totalWords = chapters.reduce((s, ch) => s + (ch.word_count || 0), 0);
    const avgWords = totalChapters > 0 ? Math.round(totalWords / totalChapters) : 0;

    // Metric scores
    const compilerPassRate =
      totalChapters > 0 ? Math.round(((totalChapters - compileFailed) / totalChapters) * 100) : 100;

    const foreshadowTotal = ledger?.foreshadow_items_count || 0;
    const foreshadowOverdue = ledger?.foreshadow_overdue_count || 0;
    const foreshadowResolved = ledger?.foreshadow_resolved_count || 0;
    const foreshadowPlanted = ledger?.foreshadow_planted_count || 0;
    const foreshadowHealth =
      foreshadowTotal > 0
        ? Math.round(((foreshadowTotal - foreshadowOverdue) / foreshadowTotal) * 100)
        : 100;

    const chapterProgress =
      totalChapters > 0 ? Math.min(100, Math.round((finalized / totalChapters) * 100)) : 0;

    const characterCompleteness =
      characters.length > 0 ? Math.round((withSoul / characters.length) * 100) : 100;

    // Overall: equal weight
    const scores = [compilerPassRate, foreshadowHealth, chapterProgress, characterCompleteness];
    const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    // ─── Risk detection ───

    const risks: RiskItem[] = [];

    if (compileFailed > 2) {
      risks.push({
        severity: "high",
        category: "编译",
        message: `${compileFailed} 章编译失败`,
        description: `共 ${totalChapters} 章中有 ${compileFailed} 章未通过编译检查，存在硬规则违反。`,
        suggestion: "逐章排查硬规则违反项，修复后重新编译。优先处理阻挡性错误。",
      });
    }
    if (compileFailed > 0 && compileFailed <= 2) {
      risks.push({
        severity: "medium",
        category: "编译",
        message: `${compileFailed} 章编译失败`,
        description: `少量章节存在编译问题，需要关注但暂不紧急。`,
        suggestion: "在继续写作前修复这些编译错误，避免问题累积。",
      });
    }

    if (foreshadowOverdue > 3) {
      risks.push({
        severity: "high",
        category: "伏笔",
        message: `${foreshadowOverdue} 个伏笔超期未回收`,
        description: `共 ${foreshadowTotal} 个伏笔中 ${foreshadowOverdue} 个已超期，可能导致故事逻辑断裂。`,
        suggestion: "检查超期伏笔清单，决定每个伏笔的回收时机或标记为废弃。",
      });
    } else if (foreshadowOverdue > 0) {
      risks.push({
        severity: "low",
        category: "伏笔",
        message: `${foreshadowOverdue} 个伏笔超期未回收`,
        description: "少量伏笔超期，尚在可控范围。",
        suggestion: "在近期章节中安排回收这些伏笔。",
      });
    }

    if (missingSoul > characters.length / 2 && characters.length > 0) {
      risks.push({
        severity: "medium",
        category: "角色",
        message: `${missingSoul} 个角色缺少 SOUL 数据`,
        description: `共 ${characters.length} 个角色中 ${missingSoul} 个没有 SOUL 档案，心智一致性检查无法覆盖。`,
        suggestion: "为核心角色设置 SOUL 档案，至少覆盖主角和重要配角。",
      });
    }

    if (chapterProgress < 30 && totalChapters > 5) {
      risks.push({
        severity: "medium",
        category: "进度",
        message: `章节定稿率仅 ${chapterProgress}%`,
        description: `只有 ${finalized}/${totalChapters} 章定稿，进度滞后。`,
        suggestion: "检查是否有章节卡在审阅或修改状态，推动流程前进。",
      });
    }

    const activeHardRules = rules.filter((r) => r.is_hard && r.status === "active").length;
    if (activeHardRules === 0 && totalChapters > 5) {
      risks.push({
        severity: "medium",
        category: "正典",
        message: "没有活跃的硬规则",
        description: "项目缺少硬性正典规则约束，可能导致世界观不一致。",
        suggestion: "至少为关键世界观设定几条硬规则（如等级体系、种族限制等）。",
      });
    }

    if (volumes.length > 0) {
      const unfinishedVolumes = volumes.filter(
        (v) => v.status !== "completed" && v.status !== "archived",
      );
      if (unfinishedVolumes.length === volumes.length && volumes.length > 1) {
        risks.push({
          severity: "low",
          category: "进度",
          message: `所有 ${volumes.length} 卷均未完成`,
          description: "项目尚无完成的卷，整体进度偏慢。",
          suggestion: "集中精力完成当前卷再推进下一卷。",
        });
      }
    }

    if (!project?.target_words && totalChapters > 10) {
      risks.push({
        severity: "low",
        category: "设置",
        message: "未设置目标总字数",
        description: "没有目标字数无法追踪整体进度。",
        suggestion: "在项目设置中设定目标字数。",
      });
    }

    // ─── Recommendations ───

    const recommendations: string[] = [];

    if (compileFailed > 0) {
      recommendations.push(
        `修复 ${compileFailed} 章的编译错误：查看每章的编译报告，对照硬规则逐条修复后重新编译。`,
      );
    }
    if (chapterProgress < 50 && totalChapters > 3) {
      recommendations.push(
        `提高定稿率：当前 ${chapterProgress}%，建议每天至少定稿一章以保持节奏。`,
      );
    }
    if (foreshadowOverdue > 0) {
      recommendations.push(
        `处理 ${foreshadowOverdue} 个超期伏笔：在伏笔面板中查看详情，规划回收路径或标记废弃。`,
      );
    }
    if (missingSoul > 0) {
      recommendations.push(
        `补充角色 SOUL 数据：${missingSoul} 个角色缺少 SOUL，优先为核心角色创建 SOUL 档案。`,
      );
    }
    if (avgWords > 0 && project?.max_chapter_words && avgWords > project.max_chapter_words) {
      recommendations.push(
        `章节平均字数 ${avgWords} 超出上限 ${project.max_chapter_words}，考虑拆分过长章节。`,
      );
    }
    if (project?.min_chapter_words && avgWords < project.min_chapter_words && avgWords > 0) {
      recommendations.push(
        `章节平均字数 ${avgWords} 低于下限 ${project.min_chapter_words}，考虑丰富内容或合并短章。`,
      );
    }
    if (recommendations.length === 0) {
      recommendations.push("项目整体状态良好，继续保持当前的写作节奏和质量控制。");
    }

    return {
      overallScore,
      metrics: {
        compilerPassRate,
        compilerPassed: compilePassed,
        compilerFailed: compileFailed,
        compilerUnchecked: compileUnchecked,
        foreshadowHealth,
        foreshadowTotal,
        foreshadowResolved,
        foreshadowPlanted,
        foreshadowOverdue,
        chapterProgress,
        chapterTotal: totalChapters,
        chapterFinalized: finalized,
        chapterDrafting: drafting,
        characterCompleteness,
        characterTotal: characters.length,
        characterWithSoul: withSoul,
        characterMissingSoul: missingSoul,
      },
      risks,
      recommendations,
    };
  }, [chapters, characters, rules, volumes, project, ledger]);

  // ─── Build metric cards ───

  const metricCards: MetricCard[] = [
    {
      key: "compiler",
      label: "编译通过率",
      icon: Shield,
      score: report.metrics.compilerPassRate,
      detail: `${report.metrics.compilerPassed} 通过 / ${report.metrics.compilerFailed} 失败`,
      subDetail: `${report.metrics.compilerUnchecked} 未检查`,
    },
    {
      key: "foreshadow",
      label: "伏笔健康度",
      icon: Lightbulb,
      score: report.metrics.foreshadowHealth,
      detail: `${report.metrics.foreshadowResolved} 回收 / ${report.metrics.foreshadowTotal} 总计`,
      subDetail: `${report.metrics.foreshadowOverdue} 超期`,
    },
    {
      key: "progress",
      label: "章节进度",
      icon: FileText,
      score: report.metrics.chapterProgress,
      detail: `${report.metrics.chapterFinalized} 定稿 / ${report.metrics.chapterTotal} 总计`,
      subDetail: `${report.metrics.chapterDrafting} 草稿中`,
    },
    {
      key: "character",
      label: "角色完整度",
      icon: Users,
      score: report.metrics.characterCompleteness,
      detail: `${report.metrics.characterWithSoul} 有SOUL / ${report.metrics.characterTotal} 总计`,
      subDetail: `${report.metrics.characterMissingSoul} 缺失`,
    },
  ];

  const topRisks = report.risks.slice(0, 5);

  // ─── Loading state ───

  if (loading && chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  // ─── Render ───

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">项目健康报告</h1>
          {project?.title && <p className="text-sm text-gray-500 mt-0.5">{project.title}</p>}
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
            loading
              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
              : "bg-white text-gray-600 border-gray-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
          }`}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "刷新中..." : "刷新"}
        </button>
      </div>

      {/* Overall Score */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex flex-col items-center">
          <div
            className={`w-32 h-32 rounded-full border-4 flex items-center justify-center mb-4 ${scoreBorder(
              report.overallScore,
            )} ${scoreBg(report.overallScore)}`}
          >
            <span className={`text-4xl font-bold ${scoreColor(report.overallScore)}`}>
              {report.overallScore}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">总体健康分数</h2>
          <p className="text-sm text-gray-500 text-center max-w-md">
            {report.overallScore >= 80
              ? "项目状态良好，各项指标均在健康范围内。继续保持！"
              : report.overallScore >= 60
                ? "项目有一些需要关注的问题，建议逐一排查并制定改进计划。"
                : "项目存在多项风险，需要立即处理以保障写作质量和进度。"}
          </p>
          <div className="flex gap-2 mt-3">
            {[
              { range: "80-100", color: "bg-green-500", label: "良好" },
              { range: "60-79", color: "bg-yellow-500", label: "需关注" },
              { range: "0-59", color: "bg-red-500", label: "需立即处理" },
            ].map(({ range, color, label }) => (
              <span key={range} className="flex items-center gap-1 text-xs text-gray-500">
                <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {metricCards.map((card) => (
          <div
            key={card.key}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600 flex items-center gap-1.5">
                <card.icon size={16} className={scoreColor(card.score)} />
                {card.label}
              </span>
              <span className={`text-lg font-bold ${scoreColor(card.score)}`}>{card.score}</span>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full mb-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${scoreBar(card.score)}`}
                style={{ width: `${card.score}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">{card.detail}</p>
            <p className="text-xs text-gray-400">{card.subDetail}</p>
          </div>
        ))}
      </div>

      {/* Two-column: Risks + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risks */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-amber-500" />
            风险预警
            {topRisks.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {topRisks.length}
              </span>
            )}
          </h3>

          {topRisks.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-600 py-4">
              <CheckCircle size={18} />
              暂无风险，项目一切正常
            </div>
          ) : (
            <div className="space-y-3">
              {topRisks.map((risk, i) => {
                const badge = severityBadge(risk.severity);
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border ${
                      risk.severity === "high"
                        ? "border-red-200 bg-red-50/50"
                        : risk.severity === "medium"
                          ? "border-yellow-200 bg-yellow-50/50"
                          : "border-blue-200 bg-blue-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs text-gray-500">[{risk.category}]</span>
                      <span className="text-sm font-medium text-gray-900">{risk.message}</span>
                    </div>
                    <p className="text-xs text-gray-600 mb-1.5">{risk.description}</p>
                    <div className="flex items-start gap-1">
                      <TrendingUp size={12} className="text-indigo-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-indigo-700">{risk.suggestion}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-4">
            <ArrowRight size={18} className="text-indigo-500" />
            改进建议
          </h3>

          <div className="space-y-3">
            {report.recommendations.map((rec, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100"
              >
                <span className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-medium text-indigo-600">{i + 1}</span>
                </span>
                <p className="text-sm text-gray-700">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Project quick stats footer */}
      <div className="mt-6 grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: "总章节", value: chapters.length.toString() },
          {
            label: "总字数",
            value: chapters.reduce((s, ch) => s + (ch.word_count || 0), 0).toLocaleString(),
          },
          { label: "角色数", value: characters.length.toString() },
          {
            label: "正典规则",
            value: rules.filter((r) => r.status === "active").length.toString(),
          },
          { label: "卷数", value: volumes.length.toString() },
          { label: "伏笔数", value: (ledger?.foreshadow_items_count || 0).toString() },
        ].map(({ label, value }) => (
          <div key={label} className="text-center bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-lg font-bold text-gray-900">{value}</div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
