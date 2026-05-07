import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useChapterStore } from "../../stores";
import { Activity, ArrowRight, CheckCircle2, Circle, AlertCircle, FileText } from "lucide-react";

// ─── Pipeline definition ───

const PIPELINE_STEPS = [
  { key: "task_ready", label: "任务就绪", index: 0 },
  { key: "drafting", label: "草稿中", index: 1 },
  { key: "draft_generated", label: "草稿生成", index: 2 },
  { key: "reviewing", label: "审阅中", index: 3 },
  { key: "approved", label: "已通过", index: 4 },
  { key: "finalized", label: "已定稿", index: 5 },
  { key: "archived", label: "已归档", index: 6 },
] as const;

const TOTAL_STEPS = PIPELINE_STEPS.length;

// ─── Status to pipeline step index mapping ───

function getCurrentStepIndex(status: string): number {
  const map: Record<string, number> = {
    task_ready: 0,
    drafting: 1,
    draft_generated: 2,
    compile_failed: 2, // treated as still at draft_generated stage
    review_pending: 3,
    reviewing: 3,
    rewrite_required: 3, // still in reviewing loop
    approved: 4,
    finalized: 5,
    archived: 6,
    needs_revalidate: 3, // needs review again
  };
  return map[status] ?? 0;
}

// ─── Status badge styles ───

function getStatusBadge(status: string): { label: string; style: string } {
  const map: Record<string, { label: string; style: string }> = {
    task_ready: { label: "任务就绪", style: "bg-gray-100 text-gray-600" },
    drafting: { label: "草稿中", style: "bg-yellow-100 text-yellow-700" },
    draft_generated: { label: "草稿生成", style: "bg-blue-100 text-blue-700" },
    compile_failed: { label: "编译失败", style: "bg-red-100 text-red-700" },
    review_pending: { label: "待审阅", style: "bg-purple-100 text-purple-700" },
    reviewing: { label: "审阅中", style: "bg-purple-100 text-purple-700" },
    rewrite_required: { label: "需重写", style: "bg-orange-100 text-orange-700" },
    approved: { label: "已通过", style: "bg-emerald-100 text-emerald-700" },
    finalized: { label: "已定稿", style: "bg-green-100 text-green-700" },
    archived: { label: "已归档", style: "bg-teal-100 text-teal-700" },
    needs_revalidate: { label: "需重新验证", style: "bg-amber-100 text-amber-700" },
  };
  return map[status] || { label: status, style: "bg-gray-100 text-gray-600" };
}

// ─── Component ───

export function WorkflowStatusPage() {
  const navigate = useNavigate();
  const { chapters, loading, error, fetchChapters } = useChapterStore();

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  // Filter chapters that are NOT in task_ready (show pipeline progress for active chapters)
  const activeChapters = useMemo(
    () =>
      chapters
        .filter((ch) => ch.status !== "task_ready")
        .sort((a, b) => a.chapter_number - b.chapter_number),
    [chapters],
  );

  const handleNavigateToChapter = (chapterNumber: number) => {
    navigate(`../chapter/${chapterNumber}`);
  };

  // ─── Loading state ───

  if (loading) {
    return (
      <div className="p-6 max-w-6xl">
        <h2 className="text-lg font-semibold mb-4">工作流状态</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Activity size={48} className="mb-3 text-gray-300 animate-pulse" />
          <p className="text-sm text-gray-500">加载章节数据中...</p>
        </div>
      </div>
    );
  }

  // ─── Error state ───

  if (error) {
    return (
      <div className="p-6 max-w-6xl">
        <h2 className="text-lg font-semibold mb-4">工作流状态</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <AlertCircle size={48} className="mb-3 text-red-300" />
          <p className="text-sm font-medium text-red-600">加载失败</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
          <button
            onClick={fetchChapters}
            className="mt-4 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ─── Empty state ───

  if (activeChapters.length === 0) {
    return (
      <div className="p-6 max-w-6xl">
        <h2 className="text-lg font-semibold mb-4">工作流状态</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Activity size={48} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">暂无进行中的章节</p>
          <p className="text-xs text-gray-400 mt-1">
            所有章节目前都在"任务就绪"状态，暂无可追踪的工作流进度
          </p>
        </div>
      </div>
    );
  }

  // ─── Main content ───

  return (
    <div className="p-6 max-w-6xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">工作流状态</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          追踪每个章节在创作流水线中的进度 ({activeChapters.length} 个进行中的章节)
        </p>
      </div>

      {/* Summary legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-500" /> 已完成
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-indigo-500 ring-2 ring-indigo-200" /> 当前
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-200" /> 待进行
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
          <span className="col-span-1">章节</span>
          <span className="col-span-2">标题</span>
          <span className="col-span-2">状态</span>
          <span className="col-span-6">流水线进度</span>
          <span className="col-span-1 text-right">操作</span>
        </div>

        <div className="divide-y divide-gray-100">
          {activeChapters.map((ch) => {
            const currentIdx = getCurrentStepIndex(ch.status);
            const badge = getStatusBadge(ch.status);

            return (
              <div
                key={ch.id}
                className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-gray-50"
              >
                {/* Chapter number */}
                <span className="col-span-1 font-medium text-gray-800">
                  第{ch.chapter_number}章
                </span>

                {/* Title */}
                <span className="col-span-2 text-gray-600 truncate">{ch.title || "未命名"}</span>

                {/* Status badge */}
                <span className="col-span-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${badge.style}`}>
                    {badge.label}
                  </span>
                </span>

                {/* Pipeline progress bar */}
                <div className="col-span-6 flex items-center gap-0.5">
                  {PIPELINE_STEPS.map((step, i) => {
                    const isCompleted = i < currentIdx;
                    const isCurrent = i === currentIdx;
                    const isPending = i > currentIdx;

                    return (
                      <div key={step.key} className="flex items-center gap-0.5 flex-1 min-w-0">
                        {/* Step dot + connector */}
                        <div className="flex-1 flex items-center">
                          {/* Connector line before (except first) */}
                          {i > 0 && (
                            <div
                              className={`flex-1 h-0.5 rounded ${
                                isCompleted || isCurrent ? "bg-green-400" : "bg-gray-200"
                              }`}
                            />
                          )}
                          {/* Step circle */}
                          <div
                            title={step.label}
                            className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
                              isCompleted
                                ? "bg-green-500"
                                : isCurrent
                                  ? "bg-indigo-500 ring-2 ring-indigo-200"
                                  : "bg-gray-200"
                            }`}
                          >
                            {isCompleted && <CheckCircle2 size={10} className="text-white" />}
                            {isCurrent && <Circle size={10} className="text-white" />}
                          </div>
                          {/* Connector line after (except last) */}
                          {i < TOTAL_STEPS - 1 && (
                            <div
                              className={`flex-1 h-0.5 rounded ${
                                isCompleted ? "bg-green-400" : "bg-gray-200"
                              }`}
                            />
                          )}
                        </div>
                        {/* Step label - only show for key steps or last */}
                        {(i === 0 || i === currentIdx || i === TOTAL_STEPS - 1) && (
                          <span
                            className={`text-[10px] whitespace-nowrap ${
                              isCurrent
                                ? "text-indigo-600 font-medium"
                                : isCompleted
                                  ? "text-green-600"
                                  : "text-gray-400"
                            }`}
                          >
                            {step.label}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Action */}
                <span className="col-span-1 text-right">
                  <button
                    onClick={() => handleNavigateToChapter(ch.chapter_number)}
                    className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    跳转
                    <ArrowRight size={12} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary at bottom */}
      <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200">
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <FileText size={12} />
          提示：流水线中的章节会按照{" "}
          <strong>任务就绪 → 草稿中 → 草稿生成 → 审阅中 → 已通过 → 已定稿 → 已归档</strong>{" "}
          的顺序流转。点击"跳转"可进入对应章节的工作台。
        </p>
      </div>
    </div>
  );
}
