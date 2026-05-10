import { useEffect, useMemo, useRef, useState } from "react";
import {
  agentApi,
  ledgerApi,
  llmApi,
  type AgentLogEntry,
  type LlmApiCallEntry,
  type LlmStreamEventEntry,
  type NotificationInfo,
} from "../../lib/api";
import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle,
  Clock,
  Cpu,
  Filter,
  Hash,
  RefreshCw,
  XCircle,
} from "lucide-react";

function truncate(text: string | null, maxLen: number): string {
  if (!text) return "—";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

function formatKind(kind: string): string {
  if (kind === "thinking") return "thinking";
  if (kind === "content") return "content";
  if (kind === "done") return "done";
  return kind;
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
      second: "2-digit",
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

type LogTab = "agent" | "llm" | "event";
type StatusFilter = "all" | "success" | "failed" | "warning" | "info";
type EventScope = "pipeline" | "all";

function isPipelineEvent(log: NotificationInfo): boolean {
  return (
    log.notif_type === "pipeline" ||
    log.notif_type === "pipeline_step" ||
    log.related_entity_type === "chapter_pipeline" ||
    log.related_entity_type === "chapter_pipeline_step"
  );
}

function stableSerialize(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function mergeNewestFirstById<T extends { id: string }>(
  prev: T[],
  next: T[],
): { merged: T[]; changed: boolean; newIds: string[] } {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const newIds: string[] = [];

  const merged = next.map((item) => {
    const existing = prevById.get(item.id);
    if (!existing) {
      newIds.push(item.id);
      return item;
    }
    return stableSerialize(existing) === stableSerialize(item) ? existing : item;
  });

  const sameLength = prev.length === merged.length;
  const sameRefs =
    sameLength && prev.every((item, index) => item === merged[index]);

  return {
    merged: sameRefs ? prev : merged,
    changed: !sameRefs,
    newIds,
  };
}

export function AgentLogPage() {
  const [tab, setTab] = useState<LogTab>("event");
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [llmLogs, setLlmLogs] = useState<LlmApiCallEntry[]>([]);
  const [eventLogs, setEventLogs] = useState<NotificationInfo[]>([]);
  const [tokenSummary, setTokenSummary] = useState<Awaited<ReturnType<typeof llmApi.getTokenUsage>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [agentNameFilter, setAgentNameFilter] = useState("");
  const [eventScope, setEventScope] = useState<EventScope>("pipeline");
  const [refreshing, setRefreshing] = useState(false);
  const [newAgentLogIds, setNewAgentLogIds] = useState<string[]>([]);
  const [newLlmLogIds, setNewLlmLogIds] = useState<string[]>([]);
  const [newEventLogIds, setNewEventLogIds] = useState<string[]>([]);
  const hasLoadedOnceRef = useRef(false);

  const load = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    const [agentRes, llmRes, notifRes, summaryRes] = await Promise.allSettled([
      agentApi.listLogs(agentNameFilter || undefined, 200),
      llmApi.listApiCalls(agentNameFilter || undefined, 200),
      ledgerApi.listNotifications(false),
      llmApi.getTokenUsage(),
    ]);

    const failures: string[] = [];

    if (agentRes.status === "fulfilled") {
      setAgentLogs((prev) => {
        const result = mergeNewestFirstById(prev, agentRes.value);
        if (hasLoadedOnceRef.current && result.newIds.length > 0) {
          setNewAgentLogIds(result.newIds);
        }
        return result.merged;
      });
    } else {
      setAgentLogs([]);
      failures.push(`Agent日志: ${String(agentRes.reason)}`);
    }

    if (llmRes.status === "fulfilled") {
      setLlmLogs((prev) => {
        const result = mergeNewestFirstById(prev, llmRes.value);
        if (hasLoadedOnceRef.current && result.newIds.length > 0) {
          setNewLlmLogIds(result.newIds);
        }
        return result.merged;
      });
    } else {
      setLlmLogs([]);
      failures.push(`LLM日志: ${String(llmRes.reason)}`);
    }

    if (notifRes.status === "fulfilled") {
      setEventLogs((prev) => {
        const result = mergeNewestFirstById(prev, notifRes.value);
        if (hasLoadedOnceRef.current && result.newIds.length > 0) {
          setNewEventLogIds(result.newIds);
        }
        return result.merged;
      });
    } else {
      setEventLogs([]);
      failures.push(`系统事件: ${String(notifRes.reason)}`);
    }

    if (summaryRes.status === "fulfilled") {
      setTokenSummary((prev) =>
        stableSerialize(prev) === stableSerialize(summaryRes.value) ? prev : summaryRes.value
      );
    } else {
      setTokenSummary(null);
      failures.push(`Token统计: ${String(summaryRes.reason)}`);
    }

    if (failures.length > 0) {
      setError(`部分日志加载失败：${failures.join("；")}`);
    }
    if (silent) {
      setRefreshing(false);
    } else {
      setLoading(false);
    }
    hasLoadedOnceRef.current = true;
  };

  useEffect(() => {
    load({ silent: false });
  }, [agentNameFilter]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => {
      load({ silent: true });
    }, 3000);
    return () => window.clearInterval(id);
  }, [autoRefresh, agentNameFilter]);

  useEffect(() => {
    if (newAgentLogIds.length === 0) return;
    const timer = window.setTimeout(() => setNewAgentLogIds([]), 2500);
    return () => window.clearTimeout(timer);
  }, [newAgentLogIds]);

  useEffect(() => {
    if (newLlmLogIds.length === 0) return;
    const timer = window.setTimeout(() => setNewLlmLogIds([]), 2500);
    return () => window.clearTimeout(timer);
  }, [newLlmLogIds]);

  useEffect(() => {
    if (newEventLogIds.length === 0) return;
    const timer = window.setTimeout(() => setNewEventLogIds([]), 2500);
    return () => window.clearTimeout(timer);
  }, [newEventLogIds]);

  const agentNames = useMemo(() => {
    const names = new Set<string>();
    agentLogs.forEach((log) => names.add(log.agent_name));
    llmLogs.forEach((log) => {
      if (log.agent_name) names.add(log.agent_name);
    });
    return [...names].sort();
  }, [agentLogs, llmLogs]);

  const filteredAgentLogs = useMemo(() => {
    return agentLogs.filter((log) => {
      if (statusFilter === "all") return true;
      return log.status === statusFilter;
    });
  }, [agentLogs, statusFilter]);

  const filteredLlmLogs = useMemo(() => {
    return llmLogs.filter((log) => {
      if (statusFilter === "all") return true;
      return log.status === statusFilter;
    });
  }, [llmLogs, statusFilter]);

  const filteredEventLogs = useMemo(() => {
    const filtered = eventLogs.filter((log) => {
      if (eventScope === "pipeline" && !isPipelineEvent(log)) return false;
      if (statusFilter === "all") return true;
      return log.severity === statusFilter || log.notif_type === statusFilter;
    });
    return [...filtered].sort((a, b) => {
      const aPipeline = isPipelineEvent(a) ? 1 : 0;
      const bPipeline = isPipelineEvent(b) ? 1 : 0;
      if (aPipeline !== bPipeline) return bPipeline - aPipeline;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [eventLogs, eventScope, statusFilter]);

  const agentStats = useMemo(() => {
    const total = agentLogs.length;
    const success = agentLogs.filter((log) => log.status === "success").length;
    const failed = agentLogs.filter((log) => log.status === "failed").length;
    return { total, success, failed };
  }, [agentLogs]);

  const llmStats = useMemo(() => {
    const total = llmLogs.length;
    const failed = llmLogs.filter((log) => log.status !== "success").length;
    const totalTokens = llmLogs.reduce((sum, log) => sum + log.total_tokens, 0);
    return { total, failed, totalTokens };
  }, [llmLogs]);

  const eventStats = useMemo(() => {
    const total = eventLogs.length;
    const unread = eventLogs.filter((log) => !log.read_status).length;
    const warnings = eventLogs.filter((log) => log.severity === "warning" || log.severity === "error").length;
    const pipeline = eventLogs.filter((log) => isPipelineEvent(log)).length;
    return { total, unread, warnings, pipeline };
  }, [eventLogs]);

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold">运行日志</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            统一查看 Agent 执行、LLM 调用与系统事件，便于排查全链路卡顿和失败原因
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => load({ silent: false })}
            className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "刷新中" : "刷新"}
          </button>
          <button
            onClick={() => setAutoRefresh((value) => !value)}
            className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border ${
              autoRefresh
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-gray-200 bg-white text-gray-600"
            }`}
          >
            <Activity size={14} />
            {autoRefresh ? "自动刷新中" : "自动刷新关闭"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <MiniStat icon={<Bot size={14} />} label="Agent日志" value={String(agentStats.total)} color="gray" />
        <MiniStat icon={<CheckCircle size={14} />} label="Agent成功" value={String(agentStats.success)} color="green" />
        <MiniStat icon={<XCircle size={14} />} label="Agent失败" value={String(agentStats.failed)} color="red" />
        <MiniStat icon={<Cpu size={14} />} label="LLM调用" value={String(tokenSummary?.total_calls ?? llmStats.total)} color="indigo" />
        <MiniStat icon={<Bell size={14} />} label="流水线事件" value={String(eventStats.pipeline)} color="amber" />
      </div>

      <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
        章节全链路生成中的实时进展会优先写入“系统事件”，默认展示流水线事件，方便你边跑边看。
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={14} className="text-gray-400" />
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as LogTab)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="agent">Agent执行</option>
          <option value="llm">LLM调用</option>
          <option value="event">系统事件</option>
        </select>
        {tab === "event" && (
          <select
            value={eventScope}
            onChange={(e) => setEventScope(e.target.value as EventScope)}
            className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
          >
            <option value="pipeline">仅看流水线</option>
            <option value="all">全部系统事件</option>
          </select>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="all">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="warning">警告</option>
          <option value="info">信息</option>
        </select>
        <select
          value={agentNameFilter}
          onChange={(e) => setAgentNameFilter(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">全部Agent</option>
          {agentNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        {tokenSummary && (
          <span className="text-xs text-gray-400 ml-1">
            累计 Token {tokenSummary.total_tokens.toLocaleString()} / 预估 ${tokenSummary.total_cost_estimate_usd.toFixed(2)}
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-8 text-center">加载中...</div>
      ) : (
        <>
          {error && (
            <div className="flex items-center gap-2 p-4 mb-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle size={16} />
              {error}
            </div>
          )}
          {tab === "agent" && <AgentLogTable logs={filteredAgentLogs} highlightedIds={newAgentLogIds} />}
          {tab === "llm" && <LlmLogTable logs={filteredLlmLogs} highlightedIds={newLlmLogIds} />}
          {tab === "event" && <EventLogTable logs={filteredEventLogs} highlightedIds={newEventLogIds} />}
        </>
      )}
    </div>
  );
}

function AgentLogTable({
  logs,
  highlightedIds,
}: {
  logs: AgentLogEntry[];
  highlightedIds: string[];
}) {
  if (logs.length === 0) {
    return <EmptyState icon={<Bot size={48} className="mb-3 text-gray-300" />} title="暂无 Agent 日志" desc="当 Agent 被调用后，执行日志会出现在这里" />;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
        <span className="col-span-2">Agent</span>
        <span className="col-span-1">状态</span>
        <span className="col-span-3">输入摘要</span>
        <span className="col-span-3">输出摘要</span>
        <span className="col-span-1">耗时</span>
        <span className="col-span-2">时间</span>
      </div>
      <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
        {logs.map((entry) => (
          <div
            key={entry.id}
            className={`grid grid-cols-12 gap-2 px-4 py-2 items-center text-xs hover:bg-gray-50 transition-colors ${
              highlightedIds.includes(entry.id) ? "bg-amber-50" : ""
            }`}
          >
            <span className="col-span-2 font-medium text-gray-800 truncate">{entry.agent_name}</span>
            <StatusBadge value={entry.status} />
            <span className="col-span-3 text-gray-500 truncate" title={entry.input_summary ?? undefined}>
              {truncate(entry.input_summary, 64)}
            </span>
            <span className="col-span-3 text-gray-500 truncate" title={entry.output_summary ?? undefined}>
              {truncate(entry.output_summary, 64)}
            </span>
            <span className="col-span-1 text-gray-500 font-mono">{formatDuration(entry.duration_ms)}</span>
            <span className="col-span-2 text-gray-400">{formatDate(entry.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LlmLogTable({
  logs,
  highlightedIds,
}: {
  logs: LlmApiCallEntry[];
  highlightedIds: string[];
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [eventsByRequest, setEventsByRequest] = useState<Record<string, LlmStreamEventEntry[]>>({});

  if (logs.length === 0) {
    return <EmptyState icon={<Cpu size={48} className="mb-3 text-gray-300" />} title="暂无 LLM 调用日志" desc="当模型被调用后，请求日志会出现在这里" />;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
        <span className="col-span-2">Agent</span>
        <span className="col-span-1">状态</span>
        <span className="col-span-1">Provider</span>
        <span className="col-span-2">Model</span>
        <span className="col-span-2">Token</span>
        <span className="col-span-1">耗时</span>
        <span className="col-span-1">时间</span>
        <span className="col-span-2">失败原因</span>
      </div>
      <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
        {logs.map((entry) => (
          <div
            key={entry.id}
            className={`border-b border-gray-100 last:border-b-0 transition-colors ${
              highlightedIds.includes(entry.id) ? "bg-amber-50" : ""
            }`}
          >
            <button
              type="button"
              onClick={async () => {
                setExpandedId((current) => (current === entry.id ? null : entry.id));
                const requestId = entry.request_id || entry.id;
                if (!eventsByRequest[requestId]) {
                  const events = await llmApi.listStreamEvents(requestId);
                  setEventsByRequest((prev) => ({ ...prev, [requestId]: events }));
                }
              }}
              className="w-full grid grid-cols-12 gap-2 px-4 py-2 items-center text-xs hover:bg-gray-50 text-left"
            >
              <span className="col-span-2 font-medium text-gray-800 truncate">{entry.agent_name || "direct"}</span>
              <StatusBadge value={entry.status} />
              <span className="col-span-1 text-gray-500">{entry.provider}</span>
              <span className="col-span-2 text-gray-600 truncate" title={entry.model}>{entry.model}</span>
              <span className="col-span-2 text-gray-600 font-mono">
                {entry.total_tokens.toLocaleString()} / P{entry.prompt_tokens} C{entry.completion_tokens}
              </span>
              <span className="col-span-1 text-gray-500 font-mono">{formatDuration(entry.latency_ms)}</span>
              <span className="col-span-1 text-gray-400">{formatDate(entry.created_at)}</span>
              <span className="col-span-2 text-red-500 truncate" title={entry.error_message ?? undefined}>
                {truncate(entry.error_message, 72)}
              </span>
            </button>
            {expandedId === entry.id && entry.error_message && (
              <div className="px-4 pb-3">
                <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
                  <div className="text-[11px] font-medium text-red-700 mb-1">完整失败原因</div>
                  <pre className="text-xs text-red-700 whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {entry.error_message}
                  </pre>
                </div>
              </div>
            )}
            {expandedId === entry.id && (
              <div className="px-4 pb-3">
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <div className="text-[11px] font-medium text-gray-700 mb-2">过程日志</div>
                  <div className="space-y-2 max-h-64 overflow-auto">
                    {(eventsByRequest[entry.request_id || entry.id] || []).map((event) => (
                      <div key={event.id} className="text-xs font-mono rounded border border-gray-100 bg-gray-50 px-2 py-1">
                        <span className="text-indigo-600">{formatKind(event.kind)}</span>
                        {event.reasoning_delta && <span className="text-amber-700"> thinking: {truncate(event.reasoning_delta, 120)}</span>}
                        {event.delta && <span className="text-gray-700"> content: {truncate(event.delta, 120)}</span>}
                      </div>
                    ))}
                    {(eventsByRequest[entry.request_id || entry.id] || []).length === 0 && (
                      <div className="text-xs text-gray-400">暂无过程事件</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventLogTable({
  logs,
  highlightedIds,
}: {
  logs: NotificationInfo[];
  highlightedIds: string[];
}) {
  if (logs.length === 0) {
    return <EmptyState icon={<Bell size={48} className="mb-3 text-gray-300" />} title="暂无系统事件" desc="全链路开始后，这里会优先显示 pipeline 与 pipeline_step 事件" />;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
        <span className="col-span-2">类型</span>
        <span className="col-span-1">级别</span>
        <span className="col-span-5">消息</span>
        <span className="col-span-2">关联对象</span>
        <span className="col-span-2">时间</span>
      </div>
      <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
        {logs.map((entry) => (
          <div
            key={entry.id}
            className={`grid grid-cols-12 gap-2 px-4 py-2 items-center text-xs hover:bg-gray-50 transition-colors ${
              highlightedIds.includes(entry.id) ? "bg-amber-50" : ""
            }`}
          >
            <span className="col-span-2 font-medium text-gray-800 truncate">
              {isPipelineEvent(entry) ? `流水线 / ${entry.notif_type}` : entry.notif_type}
            </span>
            <StatusBadge value={entry.severity} />
            <span className="col-span-5 text-gray-600" title={entry.message}>{truncate(entry.message, 120)}</span>
            <span className="col-span-2 text-gray-400 truncate" title={entry.related_entity_id ?? undefined}>
              {entry.related_entity_id || entry.related_entity_type || entry.related_entity || "—"}
            </span>
            <span className="col-span-2 text-gray-400">{formatDate(entry.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const isSuccess = value === "success" || value === "completed" || value === "info";
  const isFailed = value === "failed" || value === "error";
  const isWarning = value === "warning";
  const isRunning = value === "running";

  return (
    <span className="col-span-1 flex items-center gap-1">
      {isSuccess ? (
        <CheckCircle size={14} className="text-green-500" />
      ) : isFailed ? (
        <XCircle size={14} className="text-red-500" />
      ) : isWarning ? (
        <AlertTriangle size={14} className="text-amber-500" />
      ) : isRunning ? (
        <Activity size={14} className="text-indigo-500" />
      ) : (
        <Clock size={14} className="text-gray-400" />
      )}
      <span
        className={
          isSuccess
            ? "text-green-600"
            : isFailed
              ? "text-red-600"
              : isWarning
                ? "text-amber-600"
                : isRunning
                  ? "text-indigo-600"
                  : "text-gray-500"
        }
      >
        {value}
      </span>
    </span>
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
  color: "gray" | "green" | "red" | "indigo" | "amber";
}) {
  const colorMap: Record<string, string> = {
    gray: "text-gray-500 bg-gray-100",
    green: "text-green-600 bg-green-50",
    red: "text-red-600 bg-red-50",
    indigo: "text-indigo-600 bg-indigo-50",
    amber: "text-amber-600 bg-amber-50",
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

function EmptyState({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      {icon}
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{desc}</p>
    </div>
  );
}
