import { useProjectStore, useChapterStore, useCanonStore, useOutlineStore } from "../../stores";
import { useState, useEffect } from "react";
import { ledgerApi, type LedgerSummary } from "../../lib/api";
import {
  Heart,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Shield,
  Users,
  Lightbulb,
  Activity,
} from "lucide-react";

interface HealthMetrics {
  overallScore: number;
  chapterHealth: { score: number; total: number; finalized: number; drafting: number };
  compilerHealth: { score: number; passed: number; failed: number; unchecked: number };
  foreshadowHealth: {
    score: number;
    total: number;
    resolved: number;
    planted: number;
    overdue: number;
  };
  characterHealth: { score: number; total: number; withSoul: number; missingSoul: number };
  canonHealth: { score: number; total: number; hard: number; soft: number };
  writingConsistency: { score: number; avgWordsPerChapter: number; targetWords: number };
  risks: RiskItem[];
}

interface RiskItem {
  severity: "high" | "medium" | "low";
  message: string;
  category: string;
  suggestion: string;
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

function scoreBar(s: number): string {
  if (s >= 80) return "bg-green-500";
  if (s >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

export function HealthDashboard() {
  const { project } = useProjectStore();
  const { chapters, characters } = useChapterStore();
  const { rules } = useCanonStore();
  const [ledger, setLedger] = useState<LedgerSummary | null>(null);

  useEffect(() => {
    ledgerApi
      .getSummary()
      .then(setLedger)
      .catch(() => {});
  }, []);

  // Compute health metrics
  const total = chapters.length || 1;
  const finalized = chapters.filter(
    (ch) => ch.status === "finalized" || ch.status === "approved",
  ).length;
  const drafting = chapters.filter(
    (ch) => ch.status === "drafting" || ch.status === "draft_generated",
  ).length;
  const compilePassed = chapters.filter((ch) => ch.compiler_status === "pass").length;
  const compileFailed = chapters.filter((ch) => ch.compiler_status === "fail").length;
  const withSoul = characters.filter((c) => c.soul_json && c.soul_json !== "{}").length;
  const missingSoul = characters.filter((c) => !c.soul_json || c.soul_json === "{}").length;
  const totalWords = chapters.reduce((s, ch) => s + (ch.word_count || 0), 0);
  const avgWords = total > 0 ? Math.round(totalWords / total) : 0;

  const chapterScore = Math.min(100, Math.round((finalized / Math.max(total, 1)) * 100));
  const compilerScore = total > 0 ? Math.round(((total - compileFailed) / total) * 100) : 100;
  const foreshadowScore = ledger
    ? Math.round(
        ((ledger.foreshadow_items_count - ledger.foreshadow_overdue_count) /
          Math.max(ledger.foreshadow_items_count, 1)) *
          100,
      )
    : 100;
  const characterScore =
    characters.length > 0 ? Math.round((withSoul / characters.length) * 100) : 100;
  const canonScore =
    rules.length > 0
      ? Math.min(
          100,
          Math.round(
            (rules.filter((r) => r.is_hard).length / Math.max(rules.length, 1)) * 100 + 30,
          ),
        )
      : 100;
  const consistencyScore = project?.target_words
    ? Math.min(100, Math.round((avgWords / (project.target_words / 100)) * 100))
    : 85;

  const scores = [
    chapterScore,
    compilerScore,
    foreshadowScore,
    characterScore,
    canonScore,
    consistencyScore,
  ];
  const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Risk detection
  const risks: RiskItem[] = [];
  if (ledger && ledger.foreshadow_overdue_count > 3) {
    risks.push({
      severity: "high",
      message: `${ledger.foreshadow_overdue_count}个伏笔超期未回收`,
      category: "伏笔",
      suggestion: "请检查超期伏笔，决定回收或废弃",
    });
  }
  if (compileFailed > 2) {
    risks.push({
      severity: "high",
      message: `${compileFailed}章编译失败`,
      category: "编译",
      suggestion: "修复硬规则违反后重新编译",
    });
  }
  if (missingSoul > characters.length / 2 && characters.length > 0) {
    risks.push({
      severity: "medium",
      message: `${missingSoul}个角色缺少SOUL数据`,
      category: "角色",
      suggestion: "为角色设置SOUL档案以启用心智一致性检查",
    });
  }
  if (chapterScore < 30 && total > 5) {
    risks.push({
      severity: "medium",
      message: `章节定稿率仅${chapterScore}%`,
      category: "进度",
      suggestion: "加快章节定稿进度",
    });
  }
  if (!project?.target_words && total > 10) {
    risks.push({
      severity: "low",
      message: "未设置目标总字数",
      category: "设置",
      suggestion: "在项目设置中设定目标字数以便追踪进度",
    });
  }

  const metrics: HealthMetrics = {
    overallScore,
    chapterHealth: { score: chapterScore, total, finalized, drafting },
    compilerHealth: {
      score: compilerScore,
      passed: compilePassed,
      failed: compileFailed,
      unchecked: total - compilePassed - compileFailed,
    },
    foreshadowHealth: {
      score: foreshadowScore,
      total: ledger?.foreshadow_items_count || 0,
      resolved: ledger?.foreshadow_resolved_count || 0,
      planted: ledger?.foreshadow_planted_count || 0,
      overdue: ledger?.foreshadow_overdue_count || 0,
    },
    characterHealth: { score: characterScore, total: characters.length, withSoul, missingSoul },
    canonHealth: {
      score: canonScore,
      total: rules.length,
      hard: rules.filter((r) => r.is_hard).length,
      soft: rules.filter((r) => !r.is_hard).length,
    },
    writingConsistency: {
      score: consistencyScore,
      avgWordsPerChapter: avgWords,
      targetWords: project?.target_words || 0,
    },
    risks,
  };

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Overall score */}
      <div className="flex items-center gap-4 mb-6 p-4 bg-white border border-gray-200 rounded-lg">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center ${scoreBg(overallScore)}`}
        >
          <span className={`text-2xl font-bold ${scoreColor(overallScore)}`}>{overallScore}</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">项目健康度</h2>
          <p className="text-sm text-gray-500">
            {overallScore >= 80
              ? "项目状态良好"
              : overallScore >= 60
                ? "有一些问题需要关注"
                : "需要立即处理多项风险"}
          </p>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {[
          {
            label: "章节定稿",
            score: metrics.chapterHealth.score,
            detail: `${finalized}/${total}`,
            icon: CheckCircle,
          },
          {
            label: "编译通过",
            score: metrics.compilerHealth.score,
            detail: `${compilePassed}通过 ${compileFailed}失败`,
            icon: Shield,
          },
          {
            label: "伏笔健康",
            score: metrics.foreshadowHealth.score,
            detail: `${ledger?.foreshadow_resolved_count || 0}/${ledger?.foreshadow_items_count || 0}`,
            icon: Lightbulb,
          },
          {
            label: "角色完整",
            score: metrics.characterHealth.score,
            detail: `${withSoul}/${characters.length}有SOUL`,
            icon: Users,
          },
          {
            label: "正典覆盖",
            score: metrics.canonHealth.score,
            detail: `${rules.length}规则`,
            icon: Activity,
          },
          {
            label: "字数一致",
            score: metrics.writingConsistency.score,
            detail: `均${avgWords}字/章`,
            icon: TrendingUp,
          },
        ].map(({ label, score, detail, icon: Icon }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600 flex items-center gap-1">
                <Icon size={14} /> {label}
              </span>
              <span className={`text-sm font-bold ${scoreColor(score)}`}>{score}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-100 rounded-full mb-1">
              <div
                className={`h-full rounded-full transition-all ${scoreBar(score)}`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{detail}</span>
          </div>
        ))}
      </div>

      {/* Risks */}
      {risks.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-500" />
            风险预警 ({risks.length})
          </h3>
          <div className="space-y-2">
            {risks.map((r, i) => (
              <div
                key={i}
                className={`p-2 rounded text-sm ${
                  r.severity === "high"
                    ? "bg-red-50 text-red-800"
                    : r.severity === "medium"
                      ? "bg-yellow-50 text-yellow-800"
                      : "bg-blue-50 text-blue-800"
                }`}
              >
                <div className="flex items-center gap-1 font-medium">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      r.severity === "high"
                        ? "bg-red-500"
                        : r.severity === "medium"
                          ? "bg-yellow-500"
                          : "bg-blue-500"
                    }`}
                  />
                  [{r.category}] {r.message}
                </div>
                <p className="text-xs mt-0.5 opacity-75">{r.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
