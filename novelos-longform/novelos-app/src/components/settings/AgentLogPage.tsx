import { useEffect, useState, useMemo } from "react";
import { agentApi, type AgentLogEntry } from "../../lib/api";
import { CheckCircle, XCircle, Filter, Clock, Cpu, Hash, AlertTriangle } from "lucide-react";

// ─── Helpers ───

function truncate(text: string | null, maxLen: number): string {
  if (!text) return "—";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

function formatDate(iso: string): string {
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

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

type StatusFilter = "all" | "success" | "failed";

// ─── Component ───

export function AgentLogPage() {
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [agentNameFilter, setAgentNameFilter] = useState<string>("");

  // Fetch logs
  const load = async (agentName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await agentApi.listLogs(agentName || undefined);
      setLogs(data);
    } catch (err) {
      setError(`加载日志失败: ${String(err)}`);
      setLogs([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load(agentNameFilter || undefined);
  }, [agentNameFilter]);

  // Derived data
  const agentNames = useMemo(() => {
    // Collect unique agent names from logs (in case the list API fails)
    const names = new Set<string>();
    logs.forEach((l) => names.add(l.agent_name));
    return [...names].sort();
  }, [logs]);

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      return true;
    });
  }, [logs, statusFilter]);

  const stats = useMemo(() => {
    const total = logs.length;
    const success = logs.filter((l) => l.status === "success").length;
    const failed = logs.filter((l) => l.status === "failed").length;
    const totalTokens = logs.reduce((sum, l) => sum + (l.token_usage ?? 0), 0);
    const totalDuration = logs.reduce((sum, l) => sum + (l.duration_ms ?? 0), 0);
    return { total, success, failed, totalTokens, totalDuration };
  }, [logs]);

  // ─── Render ───

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Agent 执行日志</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            查看各Agent的调用历史、执行结果和令牌使用情况
          </p>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <MiniStat
          icon={<Hash size={14} />}
          label="总调用"
          value={String(stats.total)}
          color="gray"
        />
        <MiniStat
          icon={<CheckCircle size={14} />}
          label="成功"
          value={String(stats.success)}
          color="green"
        />
        <MiniStat
          icon={<XCircle size={14} />}
          label="失败"
          value={String(stats.failed)}
          color="red"
        />
        <MiniStat
          icon={<Cpu size={14} />}
          label="总Token"
          value={stats.totalTokens.toLocaleString()}
          color="indigo"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={14} className="text-gray-400" />

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="all">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>

        {/* Agent name filter */}
        <select
          value={agentNameFilter}
          onChange={(e) => setAgentNameFilter(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">全部Agent</option>
          {agentNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

        <span className="text-xs text-gray-400 ml-1">
          {filtered.length} / {logs.length} 条
        </span>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">加载中...</div>
      ) : error ? (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle size={16} />
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Cpu size={48} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">暂无执行日志</p>
          <p className="text-xs text-gray-400 mt-1">当Agent被调用执行任务后，日志将显示在这里</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
            <span className="col-span-2">Agent</span>
            <span className="col-span-1">状态</span>
            <span className="col-span-3">输入摘要</span>
            <span className="col-span-1">耗时</span>
            <span className="col-span-1">Token</span>
            <span className="col-span-2">时间</span>
            <span className="col-span-2">错误信息</span>
          </div>

          {/* Table body */}
          <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
            {filtered.map((entry) => {
              const isSuccess = entry.status === "success";
              const isFailed = entry.status === "failed";

              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-12 gap-2 px-4 py-2 items-center text-xs hover:bg-gray-50"
                >
                  {/* Agent name */}
                  <span className="col-span-2 font-medium text-gray-800 truncate">
                    {entry.agent_name}
                  </span>

                  {/* Status */}
                  <span className="col-span-1 flex items-center gap-1">
                    {isSuccess ? (
                      <CheckCircle size={14} className="text-green-500" />
                    ) : isFailed ? (
                      <XCircle size={14} className="text-red-500" />
                    ) : (
                      <Clock size={14} className="text-gray-400" />
                    )}
                    <span
                      className={
                        isSuccess ? "text-green-600" : isFailed ? "text-red-600" : "text-gray-500"
                      }
                    >
                      {entry.status}
                    </span>
                  </span>

                  {/* Input summary */}
                  <span
                    className="col-span-3 text-gray-500 truncate"
                    title={entry.input_summary ?? undefined}
                  >
                    {truncate(entry.input_summary, 50)}
                  </span>

                  {/* Duration */}
                  <span className="col-span-1 text-gray-500 font-mono">
                    {formatDuration(entry.duration_ms)}
                  </span>

                  {/* Token usage */}
                  <span className="col-span-1 text-gray-600 font-mono">
                    {entry.token_usage != null ? entry.token_usage.toLocaleString() : "—"}
                  </span>

                  {/* Created at */}
                  <span className="col-span-2 text-gray-400">{formatDate(entry.created_at)}</span>

                  {/* Error message */}
                  <span
                    className="col-span-2 text-red-500 truncate"
                    title={entry.error_message ?? undefined}
                  >
                    {entry.error_message || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "gray" | "green" | "red" | "indigo";
}) {
  const colorMap: Record<string, string> = {
    gray: "text-gray-500 bg-gray-100",
    green: "text-green-600 bg-green-50",
    red: "text-red-600 bg-red-50",
    indigo: "text-indigo-600 bg-indigo-50",
  };

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${colorMap[color]}`}>
      {icon}
      <div>
        <p className="text-[10px] text-gray-400">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
