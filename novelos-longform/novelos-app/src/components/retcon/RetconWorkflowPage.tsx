import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  History,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  Circle,
  AlertCircle,
  XCircle,
  Clock,
  FileText,
  Users,
  Shield,
  Search,
  Wrench,
  Play,
  RefreshCw,
  Camera,
  ArrowRight,
} from "lucide-react";
import { retconApi, type RetconRequestInfo, type RetconExecutionResult } from "../../lib/api";

// ─── Workflow step definitions ───

interface WorkflowStep {
  key: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    key: "initiated",
    name: "发起修史申请",
    description: "提交修史申请，描述需要修改的内容、原因及影响范围",
    icon: History,
  },
  {
    key: "impact_analysis",
    name: "影响分析",
    description: "系统自动分析修史对章节、角色、伏笔、时间线的影响",
    icon: Search,
  },
  {
    key: "scheme_selection",
    name: "方案选择",
    description: "查看多个修复方案，选择最优方案执行修史",
    icon: Wrench,
  },
  {
    key: "approval",
    name: "审批",
    description: "负责人审批修史申请，确认修史范围和方案",
    icon: Shield,
  },
  {
    key: "execution",
    name: "执行",
    description: "按照选定方案执行修史，修改受影响的内容",
    icon: Play,
  },
  {
    key: "regression",
    name: "回归检查",
    description: "重新编译检查受影响章节，确保修史后无新问题",
    icon: RefreshCw,
  },
  {
    key: "snapshot_update",
    name: "快照更新",
    description: "更新修史后的章节快照、角色状态和时间线",
    icon: Camera,
  },
];

// ─── Status helpers ───

type StepStatus = "completed" | "current" | "pending" | "error" | "skipped";

function stepStatusToLabel(status: StepStatus): string {
  const map: Record<StepStatus, string> = {
    completed: "已完成",
    current: "进行中",
    pending: "等待中",
    error: "异常",
    skipped: "已跳过",
  };
  return map[status];
}

function stepStatusColor(status: StepStatus): string {
  const map: Record<StepStatus, string> = {
    completed: "text-green-600 bg-green-50 border-green-200",
    current: "text-indigo-600 bg-indigo-50 border-indigo-200",
    pending: "text-gray-400 bg-gray-50 border-gray-200",
    error: "text-red-600 bg-red-50 border-red-200",
    skipped: "text-yellow-600 bg-yellow-50 border-yellow-200",
  };
  return map[status];
}

// ─── Sub-components ───

function StepIcon({
  status,
  Icon,
}: {
  status: StepStatus;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  switch (status) {
    case "completed":
      return (
        <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
          <CheckCircle2 size={14} className="text-white" />
        </div>
      );
    case "current":
      return (
        <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center">
          <Loader2 size={14} className="text-white animate-spin" />
        </div>
      );
    case "error":
      return (
        <div className="w-7 h-7 rounded-full bg-red-500 flex items-center justify-center">
          <XCircle size={14} className="text-white" />
        </div>
      );
    case "skipped":
      return (
        <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center">
          <AlertCircle size={14} className="text-white" />
        </div>
      );
    default:
      // pending
      return (
        <div className="w-7 h-7 rounded-full border-2 border-gray-300 bg-white flex items-center justify-center">
          <Icon size={12} className="text-gray-300" />
        </div>
      );
  }
}

function ProgressBar({ status }: { status: StepStatus }) {
  const colorMap: Record<StepStatus, string> = {
    completed: "bg-green-400",
    current: "bg-gradient-to-r from-green-400 to-gray-200",
    pending: "bg-gray-200",
    error: "bg-red-400",
    skipped: "bg-yellow-400",
  };
  return <div className={`h-0.5 flex-1 mx-0.5 ${colorMap[status] || "bg-gray-200"}`} />;
}

function StepNode({
  step,
  index,
  status,
  isLast,
}: {
  step: WorkflowStep;
  index: number;
  status: StepStatus;
  isLast: boolean;
}) {
  const iconColorClass = stepStatusColor(status);
  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      {/* Icon */}
      <StepIcon status={status} Icon={step.icon} />
      {/* Label */}
      <span
        className={`text-xs font-medium text-center leading-tight ${
          status === "current"
            ? "text-indigo-700"
            : status === "completed"
              ? "text-green-700"
              : status === "error"
                ? "text-red-600"
                : "text-gray-400"
        }`}
      >
        {step.name}
      </span>
      {/* Step number badge */}
      <span className={`text-[10px] px-1.5 py-0 rounded-full font-semibold ${iconColorClass}`}>
        {status === "completed" ? <CheckCircle2 size={10} className="inline" /> : index + 1}
      </span>
    </div>
  );
}

function DetailPanel({
  step,
  status,
  retcon,
  executionResult,
}: {
  step: WorkflowStep;
  status: StepStatus;
  retcon: RetconRequestInfo | null;
  executionResult: RetconExecutionResult | null;
}) {
  const currentStepIndex = WORKFLOW_STEPS.findIndex((s) => s.key === step.key);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`p-2 rounded-lg ${stepStatusColor(status).split(" ")[1]} ${stepStatusColor(status).split(" ")[0]}`}
        >
          <step.icon size={18} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            步骤 {currentStepIndex + 1}: {step.name}
          </h3>
          <p className="text-xs text-gray-500">{stepStatusToLabel(status)}</p>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{step.description}</p>

      {/* Retcon info */}
      {retcon && (
        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2">修史申请信息</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-400 text-xs">对象类型</span>
              <p className="text-gray-800 font-medium">
                {retcon.target_type === "chapter"
                  ? "章节"
                  : retcon.target_type === "character"
                    ? "角色"
                    : "正典规则"}
              </p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">对象</span>
              <p className="text-gray-800 font-medium">{retcon.target_ref}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">状态</span>
              <p className="text-gray-800 font-medium">{retcon.status}</p>
            </div>
            <div>
              <span className="text-gray-400 text-xs">创建时间</span>
              <p className="text-gray-800 font-medium">
                {new Date(retcon.created_at).toLocaleDateString("zh-CN")}
              </p>
            </div>
          </div>
          {retcon.reason && (
            <div className="mt-2">
              <span className="text-gray-400 text-xs">修史原因</span>
              <p className="text-sm text-gray-700 mt-0.5">{retcon.reason}</p>
            </div>
          )}
        </div>
      )}

      {/* Execution result details */}
      {executionResult && (
        <div className="bg-indigo-50 rounded-lg p-3 mb-4">
          <h4 className="text-xs font-medium text-indigo-600 mb-2">执行进度</h4>
          <div className="space-y-1.5">
            {executionResult.steps.map((execStep) => (
              <div key={execStep.step_key} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  {execStep.status === "completed" ? (
                    <CheckCircle2 size={12} className="text-green-500" />
                  ) : execStep.status === "running" ? (
                    <Loader2 size={12} className="text-indigo-500 animate-spin" />
                  ) : execStep.status === "failed" ? (
                    <XCircle size={12} className="text-red-500" />
                  ) : (
                    <Circle size={12} className="text-gray-300" />
                  )}
                  <span className="text-gray-700">{execStep.step_name}</span>
                </div>
                <span className="text-gray-400">{(execStep.duration_ms / 1000).toFixed(1)}s</span>
              </div>
            ))}
          </div>
          {executionResult.affected_chapters.length > 0 && (
            <div className="mt-3 pt-3 border-t border-indigo-200">
              <span className="text-xs font-medium text-indigo-600">受影响章节</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {executionResult.affected_chapters.map((ch) => (
                  <span
                    key={ch.chapter_number}
                    className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium"
                  >
                    第{ch.chapter_number}章 {ch.title || ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───

export function RetconWorkflowPage() {
  const { projectId, retconId } = useParams<{ projectId: string; retconId?: string }>();
  const navigate = useNavigate();

  const [retcon, setRetcon] = useState<RetconRequestInfo | null>(null);
  const [executionResult, setExecutionResult] = useState<RetconExecutionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Determine step statuses from retcon state ───

  const computedSteps = useMemo(() => {
    if (!retcon) {
      // Default: all pending
      return WORKFLOW_STEPS.map(() => "pending" as StepStatus);
    }

    const status = retcon.status;
    // Map retcon status to workflow steps
    // pending -> step 1 is current
    // impact_analysis -> step 1 done, step 2 current
    // scheme_selected -> step 1-2 done, step 3 current
    // approved -> step 1-3 done, step 4 current
    // executing -> step 1-4 done, step 5 current
    // executed -> step 1-5 done, step 6 current
    // completed -> all done
    // rejected -> step 4 error

    const statusOrder: Record<string, number> = {
      pending: 0,
      impact_analysis: 1,
      scheme_selected: 2,
      approved: 3,
      executing: 4,
      executed: 5,
      completed: 6,
    };

    const rejectedOrder: Record<string, number> = {
      pending: 0,
      impact_analysis: 1,
      scheme_selected: 2,
      rejected: 3, // rejection at step 4
    };

    const order = status === "rejected" ? rejectedOrder : statusOrder;
    const currentIdx = order[status] ?? 0;
    const maxIdx = status === "rejected" ? 4 : 7;

    return WORKFLOW_STEPS.map((_, i) => {
      if (status === "rejected" && i === 3) return "error" as StepStatus;
      if (i < currentIdx) return "completed" as StepStatus;
      if (i === currentIdx && status !== "completed" && status !== "rejected")
        return "current" as StepStatus;
      if (i === currentIdx && status === "completed") return "completed" as StepStatus;
      if (i === currentIdx && status === "rejected") return "error" as StepStatus;
      return "pending" as StepStatus;
    });
  }, [retcon]);

  const currentStepIndex = useMemo(() => {
    return computedSteps.findIndex((s) => s === "current");
  }, [computedSteps]);

  const currentDisplayStep =
    currentStepIndex >= 0
      ? WORKFLOW_STEPS[currentStepIndex]
      : retcon?.status === "completed"
        ? WORKFLOW_STEPS[6]
        : WORKFLOW_STEPS[0];

  const currentDisplayStatus =
    currentStepIndex >= 0
      ? computedSteps[currentStepIndex]
      : retcon?.status === "completed"
        ? "completed"
        : "pending";

  // ─── Fetch retcon data ───

  useEffect(() => {
    if (!retconId) {
      setLoading(false);
      setError("缺少修史申请ID");
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch retcon request
        const requests = await retconApi.list();
        const found = requests.find((r) => r.id === retconId);
        if (found) {
          setRetcon(found);
        }

        // If the retcon is being executed or completed, try to get execution status
        if (
          found &&
          (found.status === "executing" ||
            found.status === "executed" ||
            found.status === "completed")
        ) {
          try {
            const execResult = await retconApi.getExecutionStatus(retconId);
            setExecutionResult(execResult);
          } catch {
            // Execution status may not be available yet
          }
        }
      } catch (e: any) {
        setError(e?.toString() || "加载修史数据失败");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [retconId]);

  // ─── Loading state ───

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 size={32} className="animate-spin text-indigo-500" />
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state ───

  if (error && !retcon) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate(`/project/${projectId}/retcon`)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <History size={22} className="text-indigo-600" />
                修史工作流
              </h1>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <AlertCircle size={40} className="text-red-300" />
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => navigate(`/project/${projectId}/retcon`)}
              className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              返回修史申请列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty/idle state (no retconId) ───

  if (!retconId) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate(`/project/${projectId}/retcon`)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <History size={22} className="text-indigo-600" />
              修史工作流
            </h1>
          </div>
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <History size={40} className="text-gray-300" />
            <p className="text-sm">请从修史申请列表中选择一个申请查看工作流</p>
            <button
              onClick={() => navigate(`/project/${projectId}/retcon`)}
              className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              前往修史申请列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ───

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate(`/project/${projectId}/retcon`)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <History size={22} className="text-indigo-600" />
              修史工作流
            </h1>
            <p className="text-sm text-gray-500 mt-1 truncate">
              {retcon?.target_ref
                ? `${retcon.target_type === "chapter" ? "章节" : retcon.target_type === "character" ? "角色" : "正典"}: ${retcon.target_ref}`
                : "修史工作流概览"}
            </p>
          </div>
          {/* Status badge */}
          {retcon && (
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${
                retcon.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : retcon.status === "rejected"
                    ? "bg-red-100 text-red-700"
                    : retcon.status === "executing"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {retcon.status === "completed"
                ? "已完成"
                : retcon.status === "rejected"
                  ? "已拒绝"
                  : retcon.status === "executing"
                    ? "执行中"
                    : retcon.status === "approved"
                      ? "已批准"
                      : "处理中"}
            </span>
          )}
        </div>

        {/* Pipeline */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-5 flex items-center gap-2">
            <ArrowRight size={14} className="text-indigo-600" />
            工作流管道
          </h3>

          <div className="flex items-start justify-between">
            {WORKFLOW_STEPS.map((step, index) => (
              <div key={step.key} className="flex items-start flex-1">
                <StepNode
                  step={step}
                  index={index}
                  status={computedSteps[index]}
                  isLast={index === WORKFLOW_STEPS.length - 1}
                />
                {index < WORKFLOW_STEPS.length - 1 && <ProgressBar status={computedSteps[index]} />}
              </div>
            ))}
          </div>

          {/* Step legend */}
          <div className="flex items-center justify-center gap-4 mt-6 pt-4 border-t border-gray-100">
            {(["completed", "current", "pending", "error"] as StepStatus[]).map((s) => (
              <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
                {s === "completed" ? (
                  <CheckCircle2 size={12} className="text-green-500" />
                ) : s === "current" ? (
                  <Loader2 size={12} className="text-indigo-500" />
                ) : s === "error" ? (
                  <AlertCircle size={12} className="text-red-400" />
                ) : (
                  <Circle size={12} className="text-gray-300" />
                )}
                {stepStatusToLabel(s)}
              </div>
            ))}
          </div>
        </div>

        {/* Detail panel for current step */}
        <DetailPanel
          step={currentDisplayStep}
          status={currentDisplayStatus as StepStatus}
          retcon={retcon}
          executionResult={executionResult}
        />

        {/* Quick actions */}
        <div className="flex items-center justify-center gap-3 mt-6">
          {retcon && retcon.status === "pending" && (
            <button
              onClick={() => navigate(`/project/${projectId}/retcon/${retconId}/impact`)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              查看影响分析
              <Search size={14} />
            </button>
          )}
          {retcon && retcon.status === "impact_analysis" && (
            <button
              onClick={() => navigate(`/project/${projectId}/retcon/${retconId}/impact`)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              选择修复方案
              <Wrench size={14} />
            </button>
          )}
          {retcon && (retcon.status === "approved" || retcon.status === "scheme_selected") && (
            <button
              onClick={() => navigate(`/project/${projectId}/retcon/${retconId}/impact`)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              开始执行
              <Play size={14} />
            </button>
          )}
          <button
            onClick={() => navigate(`/project/${projectId}/retcon`)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            返回列表
          </button>
        </div>
      </div>
    </div>
  );
}
