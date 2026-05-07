import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  PlusCircle,
  PlayCircle,
  ShieldCheck,
  BarChart3,
  Download,
  Archive,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Zap,
} from "lucide-react";
import { backupApi } from "../../lib/api";

interface QuickAction {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  route?: string;
  isAsync?: boolean; // whether this is an API call action (not navigation)
  color: string;
  description: string;
}

const ACTIONS: QuickAction[] = [
  {
    key: "new-chapter",
    label: "新建章节",
    icon: PlusCircle,
    route: "/chapter/1",
    color:
      "bg-indigo-50 text-indigo-600 border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200",
    description: "创建或编辑章节内容",
  },
  {
    key: "pipeline",
    label: "全链路生成",
    icon: PlayCircle,
    route: "/chapter/1",
    color: "bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100 hover:border-blue-200",
    description: "运行全链路生成管道",
  },
  {
    key: "compile-check",
    label: "编译检查",
    icon: ShieldCheck,
    route: "/chapter-health/1",
    color:
      "bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100 hover:border-emerald-200",
    description: "运行章节健康检查",
  },
  {
    key: "stats",
    label: "查看统计",
    icon: BarChart3,
    route: "/writing-stats",
    color:
      "bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100 hover:border-purple-200",
    description: "查看写作统计与进度",
  },
  {
    key: "export",
    label: "导出项目",
    icon: Download,
    route: "/export",
    color: "bg-amber-50 text-amber-600 border-amber-100 hover:bg-amber-100 hover:border-amber-200",
    description: "导出项目为不同格式",
  },
  {
    key: "backup",
    label: "备份项目",
    icon: Archive,
    isAsync: true,
    color: "bg-rose-50 text-rose-600 border-rose-100 hover:bg-rose-100 hover:border-rose-200",
    description: "创建项目备份快照",
  },
];

export function QuickActionsWidget() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [backupState, setBackupState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  const handleAction = async (action: QuickAction) => {
    if (action.isAsync) {
      if (action.key === "backup") {
        await handleBackup();
      }
    } else if (action.route) {
      const fullPath = projectId ? `/project/${projectId}${action.route}` : action.route;
      navigate(fullPath);
    }
  };

  const handleBackup = async () => {
    setBackupState("loading");
    setBackupMessage(null);
    try {
      const result = await backupApi.create();
      setBackupState("success");
      setBackupMessage(`备份成功: ${result.path}`);
      // Auto-reset after 5 seconds
      setTimeout(() => {
        setBackupState("idle");
        setBackupMessage(null);
      }, 5000);
    } catch (e: any) {
      setBackupState("error");
      setBackupMessage(e?.toString() || "备份失败");
      setTimeout(() => {
        setBackupState("idle");
        setBackupMessage(null);
      }, 5000);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Zap size={14} className="text-indigo-600" />
          快捷操作
        </h3>
      </div>

      {/* Action grid - responsive: 3x2 on desktop, 6x1 on mobile */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {ACTIONS.map((action) => {
          const isBackup = action.key === "backup";
          const isLoading = isBackup && backupState === "loading";

          return (
            <button
              key={action.key}
              onClick={() => handleAction(action)}
              disabled={isLoading}
              title={action.description}
              className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border transition-all ${action.color} ${
                isLoading ? "opacity-60 cursor-not-allowed" : ""
              }`}
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : isBackup && backupState === "success" ? (
                <CheckCircle2 size={18} className="text-green-500" />
              ) : isBackup && backupState === "error" ? (
                <AlertTriangle size={18} className="text-red-500" />
              ) : (
                <action.icon size={18} />
              )}
              <span className="text-[11px] font-medium leading-tight text-center">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Backup feedback */}
      {backupMessage && (
        <div
          className={`mt-3 px-3 py-2 rounded-lg text-xs ${
            backupState === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <div className="flex items-center gap-1.5">
            {backupState === "success" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {backupMessage}
          </div>
        </div>
      )}
    </div>
  );
}
