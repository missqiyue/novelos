import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { chapterApi, agentApi, type RecalledContext, type ChapterTaskInfo } from "../../lib/api";
import { useProjectStore } from "../../stores";
import {
  Brain,
  RefreshCw,
  FileText,
  Shield,
  ShieldAlert,
  Users,
  Lightbulb,
  Target,
  ArrowRight,
  Flag,
  Bookmark,
  Zap,
  AlertTriangle,
  Loader2,
  BarChart3,
  Send,
} from "lucide-react";

// ─── Token budget bar ───

function TokenBudgetBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const colorClass = pct < 70 ? "bg-green-500" : pct < 90 ? "bg-yellow-500" : "bg-red-500";
  const textColor = pct < 70 ? "text-green-700" : pct < 90 ? "text-yellow-700" : "text-red-700";
  const bgBar = pct < 70 ? "bg-green-100" : pct < 90 ? "bg-yellow-100" : "bg-red-100";

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <BarChart3 size={14} className="text-gray-500" />
          <span className="text-xs font-medium text-gray-600">Token 预算</span>
        </div>
        <span className={`text-xs font-bold ${textColor}`}>
          {used.toLocaleString()} / {total.toLocaleString()}
          <span className="text-gray-400 font-normal ml-1">({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className={`h-3 rounded-full overflow-hidden ${bgBar}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Section wrapper ───

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
        {icon}
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Empty state ───

function EmptyItem({ label }: { label: string }) {
  return <p className="text-sm text-gray-400 italic">暂无{label}信息</p>;
}

// ─── Main component ───

export function RecallPanelPage() {
  const { chapterNumber: chapterNumberParam } = useParams<{ chapterNumber: string }>();
  const chapterNumber = Number(chapterNumberParam);
  const { project } = useProjectStore();

  const [recalled, setRecalled] = useState<RecalledContext | null>(null);
  const [task, setTask] = useState<ChapterTaskInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  const TOKEN_BUDGET = 3000;

  const fetchContext = useCallback(async () => {
    if (isNaN(chapterNumber) || chapterNumber <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const [context, tasks] = await Promise.all([
        chapterApi.recallContext(chapterNumber),
        chapterApi.listTasks(),
      ]);
      setRecalled(context);
      const matchTask = tasks.find((t) => t.chapter_number === chapterNumber);
      setTask(matchTask || null);
    } catch (e: any) {
      setError(e?.toString() || "获取召回上下文失败");
      setRecalled(null);
    }
    setLoading(false);
  }, [chapterNumber]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const handleGenerateDraft = useCallback(async () => {
    setGeneratingDraft(true);
    try {
      await agentApi.run("draft_writer", { chapter_number: String(chapterNumber) });
    } catch (e: any) {
      setError(e?.toString() || "启动草稿生成失败");
    }
    setGeneratingDraft(false);
  }, [chapterNumber]);

  // ─── Edge: invalid chapter number ───

  if (isNaN(chapterNumber) || chapterNumber <= 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <AlertTriangle size={24} className="mr-2 text-yellow-500" />
        无效的章节编号
      </div>
    );
  }

  // ─── Loading ───

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
        <Loader2 size={28} className="animate-spin" />
        <span className="text-sm">正在加载召回上下文...</span>
      </div>
    );
  }

  // ─── Error ───

  if (error && !recalled) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="flex items-center gap-2 text-red-500">
          <AlertTriangle size={24} />
          <span className="text-sm font-medium">{error}</span>
        </div>
        <button
          onClick={fetchContext}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
        >
          <RefreshCw size={14} />
          重试
        </button>
      </div>
    );
  }

  const usedTokens = recalled?.total_tokens_estimate ?? 0;

  // Parse recalled context arrays (they come as string arrays from backend)
  const hardRules: string[] = recalled?.hard_rules ?? [];
  const softRules: string[] = recalled?.soft_rules ?? [];
  const characterStates: string[] = recalled?.character_states ?? [];
  const openForeshadows: string[] = recalled?.open_foreshadows ?? [];

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Brain size={24} className="text-indigo-500" />第 {chapterNumber} 章 召回面板 (RCL)
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {project?.title ?? "未命名项目"} &middot; 上下文召回视图
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchContext}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            刷新召回
          </button>
          <button
            onClick={handleGenerateDraft}
            disabled={generatingDraft}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              generatingDraft
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {generatingDraft ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {generatingDraft ? "启动中..." : "使用此上下文生成草稿"}
          </button>
        </div>
      </div>

      {/* Token Budget Bar */}
      <TokenBudgetBar used={usedTokens} total={TOKEN_BUDGET} />

      {/* Error banner (non-blocking) */}
      {error && recalled && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-700 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ─── Task Card ─── */}
        <Section icon={<Target size={16} className="text-blue-500" />} title="任务卡">
          {task ? (
            <div className="space-y-3">
              <div>
                <span className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                  <Flag size={12} />
                  本章目标 (Objective)
                </span>
                <p className="text-sm text-gray-900">{task.objective}</p>
              </div>
              {task.must_progress && (
                <div>
                  <span className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                    <ArrowRight size={12} />
                    必须推进 (Must Progress)
                  </span>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.must_progress}</p>
                </div>
              )}
              {task.must_recall && (
                <div>
                  <span className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                    <Bookmark size={12} />
                    必须呼应 (Must Recall)
                  </span>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.must_recall}</p>
                </div>
              )}
              {task.ending_hook && (
                <div>
                  <span className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
                    <Zap size={12} />
                    结尾钩子 (Ending Hook)
                  </span>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.ending_hook}</p>
                </div>
              )}
              {task.must_avoid && (
                <div>
                  <span className="text-xs font-medium text-red-500 flex items-center gap-1 mb-1">
                    <AlertTriangle size={12} />
                    必须避免 (Must Avoid)
                  </span>
                  <p className="text-sm text-red-700 whitespace-pre-wrap">{task.must_avoid}</p>
                </div>
              )}
            </div>
          ) : (
            <EmptyItem label="任务卡" />
          )}
        </Section>

        {/* ─── Hard Rules ─── */}
        <Section
          icon={<Shield size={16} className="text-red-500" />}
          title={`硬规则 (${hardRules.length})`}
        >
          {hardRules.length > 0 ? (
            <div className="space-y-2">
              {hardRules.map((rule, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-red-50 border border-red-100 text-sm text-gray-800 flex items-start gap-2"
                >
                  <ShieldAlert size={14} className="text-red-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{rule}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyItem label="硬规则" />
          )}
          {softRules.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Shield size={14} className="text-yellow-500" />
                <span className="text-xs font-medium text-gray-500">
                  软规则 ({softRules.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {softRules.map((rule, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-yellow-50 border border-yellow-100 text-sm text-gray-700"
                  >
                    <span className="whitespace-pre-wrap">{rule}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* ─── Character States ─── */}
        <Section
          icon={<Users size={16} className="text-green-500" />}
          title={`角色状态 (${characterStates.length})`}
        >
          {characterStates.length > 0 ? (
            <div className="space-y-2">
              {characterStates.map((state, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-green-50 border border-green-100 text-sm text-gray-800 flex items-start gap-2"
                >
                  <Users size={14} className="text-green-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{state}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyItem label="角色状态" />
          )}
        </Section>

        {/* ─── Open Foreshadows ─── */}
        <Section
          icon={<Lightbulb size={16} className="text-amber-500" />}
          title={`开放伏笔 (${openForeshadows.length})`}
        >
          {openForeshadows.length > 0 ? (
            <div className="space-y-2">
              {openForeshadows.map((fs, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-amber-50 border border-amber-100 text-sm text-gray-800 flex items-start gap-2"
                >
                  <Lightbulb size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-wrap">{fs}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyItem label="开放伏笔" />
          )}
        </Section>
      </div>

      {/* Summary footer */}
      {recalled && (
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">上下文摘要</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="text-center p-2 rounded bg-white border border-gray-100">
              <div className="text-lg font-bold text-indigo-600">
                {hardRules.length + softRules.length}
              </div>
              <div className="text-xs text-gray-500">规则总数</div>
            </div>
            <div className="text-center p-2 rounded bg-white border border-gray-100">
              <div className="text-lg font-bold text-green-600">{characterStates.length}</div>
              <div className="text-xs text-gray-500">角色状态</div>
            </div>
            <div className="text-center p-2 rounded bg-white border border-gray-100">
              <div className="text-lg font-bold text-amber-600">{openForeshadows.length}</div>
              <div className="text-xs text-gray-500">开放伏笔</div>
            </div>
            <div className="text-center p-2 rounded bg-white border border-gray-100">
              <div className="text-lg font-bold text-gray-700">{usedTokens}</div>
              <div className="text-xs text-gray-500">预估 Tokens</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
