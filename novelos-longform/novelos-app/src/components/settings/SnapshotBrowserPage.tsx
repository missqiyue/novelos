import { useEffect, useState, useCallback } from "react";
import { snapshotApi, type SnapshotInfo } from "../../lib/api";
import {
  ChevronDown,
  ChevronRight,
  Camera,
  Filter,
  Clock,
  BookOpen,
  GitBranch,
  Layers,
  FileText,
  AlertCircle,
} from "lucide-react";

// ─── Helpers ───

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN", {
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

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

const typeLabels: Record<string, string> = {
  chapter: "章节",
  arc: "弧线",
  volume: "卷",
};

const typeIcons: Record<string, React.ReactNode> = {
  chapter: <FileText size={14} className="text-blue-500" />,
  arc: <GitBranch size={14} className="text-purple-500" />,
  volume: <Layers size={14} className="text-indigo-500" />,
};

const typeBadgeStyles: Record<string, string> = {
  chapter: "bg-blue-100 text-blue-700",
  arc: "bg-purple-100 text-purple-700",
  volume: "bg-indigo-100 text-indigo-700",
};

// ─── Component ───

export function SnapshotBrowserPage() {
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchSnapshots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await snapshotApi.list();
      setSnapshots(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshots();
  }, [fetchSnapshots]);

  const filtered =
    typeFilter === "all" ? snapshots : snapshots.filter((s) => s.snapshot_type === typeFilter);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ─── Loading state ───

  if (loading) {
    return (
      <div className="p-6 max-w-5xl">
        <h2 className="text-lg font-semibold mb-4">项目快照浏览</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Camera size={48} className="mb-3 text-gray-300 animate-pulse" />
          <p className="text-sm text-gray-500">加载快照数据中...</p>
        </div>
      </div>
    );
  }

  // ─── Error state ───

  if (error) {
    return (
      <div className="p-6 max-w-5xl">
        <h2 className="text-lg font-semibold mb-4">项目快照浏览</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <AlertCircle size={48} className="mb-3 text-red-300" />
          <p className="text-sm font-medium text-red-600">加载失败</p>
          <p className="text-xs text-gray-400 mt-1">{error}</p>
          <button
            onClick={fetchSnapshots}
            className="mt-4 px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // ─── Main content ───

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">项目快照浏览</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          浏览和管理项目各阶段的快照数据，包含章节、弧线和卷级摘要
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-gray-400" />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">全部类型</option>
          <option value="chapter">章节快照</option>
          <option value="arc">弧线快照</option>
          <option value="volume">卷快照</option>
        </select>
        <span className="text-xs text-gray-400">
          {filtered.length} / {snapshots.length} 条
        </span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && !loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Camera size={48} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">暂无快照</p>
          <p className="text-xs text-gray-400 mt-1">完成章节后生成的快照将显示在这里</p>
        </div>
      ) : (
        /* Snapshot cards */
        <div className="space-y-2">
          {filtered.map((snap) => {
            const isExpanded = expandedId === snap.id;
            const badgeStyle = typeBadgeStyles[snap.snapshot_type] || "bg-gray-100 text-gray-600";

            return (
              <div
                key={snap.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* Card header */}
                <button
                  onClick={() => toggleExpand(snap.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="shrink-0">
                    {isExpanded ? (
                      <ChevronDown size={14} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={14} className="text-gray-400" />
                    )}
                  </span>

                  {/* Type badge */}
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${badgeStyle}`}
                  >
                    {typeIcons[snap.snapshot_type]}
                    {typeLabels[snap.snapshot_type] || snap.snapshot_type}
                  </span>

                  {/* Chapter range */}
                  {snap.chapter_start != null && (
                    <span className="text-sm text-gray-700 flex items-center gap-1">
                      <BookOpen size={13} className="text-gray-400" />第{snap.chapter_start}章
                      {snap.chapter_end != null && snap.chapter_end !== snap.chapter_start && (
                        <> - 第{snap.chapter_end}章</>
                      )}
                    </span>
                  )}

                  {/* Volume info */}
                  {snap.volume_id && (
                    <span className="text-xs text-gray-400">
                      卷: {snap.volume_id.slice(0, 8)}...
                    </span>
                  )}

                  {/* Date */}
                  <span className="ml-auto text-xs text-gray-400 flex items-center gap-1 shrink-0">
                    <Clock size={12} />
                    {formatDate(snap.created_at)}
                  </span>
                </button>

                {/* Expanded summary */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <div className="mt-3">
                      <h4 className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                        Summary JSON
                      </h4>
                      <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 overflow-auto max-h-96 font-mono leading-relaxed whitespace-pre-wrap border border-gray-100">
                        {formatJson(snap.summary_json)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
