import { useEffect, useState } from "react";
import { ledgerApi, type ForeshadowItemInfo } from "../../lib/api";
import { outlineApi, type VolumeInfo } from "../../lib/api";
import {
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Calendar,
  X,
  Info,
  Star,
  BookOpen,
} from "lucide-react";

// ─── Constants ───

const STATUS_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  planted: { color: "bg-yellow-400", label: "待回收", bg: "bg-yellow-50" },
  resolved: { color: "bg-green-400", label: "已回收", bg: "bg-green-50" },
  overdue: { color: "bg-red-400", label: "超期", bg: "bg-red-50" },
  expired: { color: "bg-gray-400", label: "已过期", bg: "bg-gray-50" },
};

// ─── Types for internal grouping ───

interface VolumeGroup {
  volumeId: string | null;
  volumeNumber: number | null;
  title: string;
  items: ForeshadowItemInfo[];
}

// ─── Detail popup sub-component ───

function DetailPopup({ item, onClose }: { item: ForeshadowItemInfo; onClose: () => void }) {
  const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.planted;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`p-1.5 rounded-lg shrink-0 ${statusCfg.bg}`}>
              <Lightbulb size={16} className={statusCfg.color.replace("bg-", "text-")} />
            </div>
            <h3 className="text-base font-semibold text-gray-900 truncate">{item.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 shrink-0 ml-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Status + importance */}
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                item.status === "resolved"
                  ? "bg-green-100 text-green-700"
                  : item.status === "overdue" || item.status === "expired"
                    ? "bg-red-100 text-red-700"
                    : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {item.status === "resolved" ? (
                <CheckCircle2 size={10} />
              ) : item.status === "overdue" || item.status === "expired" ? (
                <AlertTriangle size={10} />
              ) : (
                <Clock size={10} />
              )}
              {statusCfg.label}
            </span>
            {item.importance != null && (
              <span className="inline-flex items-center gap-0.5 text-xs text-gray-400">
                {Array.from({ length: item.importance }).map((_, i) => (
                  <Star key={i} size={10} fill="currentColor" className="text-yellow-500" />
                ))}
              </span>
            )}
          </div>

          {/* Seed chapter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 w-20 shrink-0">播种章节</span>
            <span className="text-sm text-gray-900">第{item.seed_chapter}章</span>
          </div>

          {/* Maturity condition */}
          {item.maturity_condition && (
            <div>
              <span className="text-xs font-medium text-gray-500 block mb-1">回收条件</span>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2">
                {item.maturity_condition}
              </p>
            </div>
          )}

          {/* Payoff type */}
          {item.payoff_type && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 w-20 shrink-0">回收类型</span>
              <span className="text-sm text-gray-900">{item.payoff_type}</span>
            </div>
          )}

          {/* Resolved chapter */}
          {item.resolved_chapter != null && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 w-20 shrink-0">回收章节</span>
              <span className="text-sm text-green-700 font-medium">
                第{item.resolved_chapter}章
              </span>
            </div>
          )}

          {/* Expected volume */}
          {item.expected_volume_id && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500 w-20 shrink-0">预期卷ID</span>
              <span className="text-sm text-gray-900">{item.expected_volume_id}</span>
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <div>
              <span className="text-xs font-medium text-gray-500 block mb-1">备注</span>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2">{item.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-200 transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Volume row sub-component ───

function VolumeRow({
  group,
  isUnassigned,
  expanded,
  onToggleExpand,
  onItemClick,
}: {
  group: VolumeGroup;
  isUnassigned: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onItemClick: (item: ForeshadowItemInfo) => void;
}) {
  const plantedCount = group.items.filter((f) => f.status === "planted").length;
  const resolvedCount = group.items.filter((f) => f.status === "resolved").length;
  const overdueCount = group.items.filter((f) => f.status === "overdue").length;

  // Sort items: overdue first, then planted, then resolved
  const sortedItems = [...group.items].sort((a, b) => {
    const order: Record<string, number> = { overdue: 0, expired: 0, planted: 1, resolved: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Row header */}
      <button
        onClick={isUnassigned ? onToggleExpand : undefined}
        className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors ${
          isUnassigned ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-indigo-50 shrink-0">
            <BookOpen size={14} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-900 truncate block">
              {group.volumeNumber != null && `第${group.volumeNumber}卷: `}
              {group.title}
            </span>
            <span className="text-xs text-gray-400">{group.items.length} 条伏笔</span>
          </div>
        </div>

        {/* Mini progress bar */}
        <div className="flex-1 hidden sm:block">
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
            {resolvedCount > 0 && (
              <div
                className="h-full bg-green-400"
                style={{ width: `${(resolvedCount / group.items.length) * 100}%` }}
              />
            )}
            {overdueCount > 0 && (
              <div
                className="h-full bg-red-400"
                style={{ width: `${(overdueCount / group.items.length) * 100}%` }}
              />
            )}
            {plantedCount > 0 && (
              <div
                className="h-full bg-yellow-400"
                style={{ width: `${(plantedCount / group.items.length) * 100}%` }}
              />
            )}
          </div>
        </div>

        {/* Count badges */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          {plantedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">
              <Clock size={10} />
              {plantedCount}
            </span>
          )}
          {resolvedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700">
              <CheckCircle2 size={10} />
              {resolvedCount}
            </span>
          )}
          {overdueCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700">
              <AlertTriangle size={10} />
              {overdueCount}
            </span>
          )}
          {isUnassigned && (
            <span className="text-gray-300 text-xs ml-1">{expanded ? "▼" : "▶"}</span>
          )}
        </div>
      </button>

      {/* Foreshadow dots grid */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {sortedItems.length === 0 ? (
            <div className="py-4 text-center text-xs text-gray-400">此卷暂无伏笔</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sortedItems.map((item) => {
                const isOverdue = item.status === "overdue" || item.status === "expired";
                return (
                  <button
                    key={item.id}
                    onClick={() => onItemClick(item)}
                    className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-all hover:shadow-md ${
                      isOverdue
                        ? "border-red-200 bg-red-50 hover:bg-red-100 animate-pulse"
                        : item.status === "resolved"
                          ? "border-green-200 bg-green-50 hover:bg-green-100"
                          : "border-yellow-200 bg-yellow-50 hover:bg-yellow-100"
                    }`}
                    title={item.title}
                  >
                    {/* Dot indicator */}
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${STATUS_CONFIG[item.status]?.color || "bg-gray-400"}`}
                    />
                    {/* Title */}
                    <span className="text-xs text-gray-800 max-w-[140px] truncate">
                      {item.title}
                    </span>
                    {/* Seed chapter hint */}
                    <span className="text-[10px] text-gray-400 shrink-0">
                      Ch.{item.seed_chapter}
                    </span>
                    {/* Info icon on hover */}
                    <Info
                      size={12}
                      className="text-gray-300 group-hover:text-gray-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───

export function ForeshadowCalendar() {
  const [items, setItems] = useState<ForeshadowItemInfo[]>([]);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ForeshadowItemInfo | null>(null);
  const [unassignedExpanded, setUnassignedExpanded] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [foreshadowItems, volumeList] = await Promise.all([
          ledgerApi.listForeshadowItems(),
          outlineApi.listVolumes(),
        ]);
        setItems(foreshadowItems);
        setVolumes(volumeList);
      } catch (e: any) {
        setError(e.toString());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Group items by expected_volume_id
  const volumeGroups: VolumeGroup[] = (() => {
    const assignedGroups: VolumeGroup[] = volumes
      .filter((v) => items.some((f) => f.expected_volume_id === v.id))
      .map((v) => ({
        volumeId: v.id,
        volumeNumber: v.volume_number,
        title: v.title || `第${v.volume_number}卷`,
        items: items.filter((f) => f.expected_volume_id === v.id),
      }));

    const unassignedItems = items.filter(
      (f) => !f.expected_volume_id || !volumes.some((v) => v.id === f.expected_volume_id),
    );
    if (unassignedItems.length > 0) {
      assignedGroups.push({
        volumeId: null,
        volumeNumber: null,
        title: "未分配卷",
        items: unassignedItems,
      });
    }

    return assignedGroups;
  })();

  const overdueCount = items.filter((f) => f.status === "overdue").length;
  const plantedCount = items.filter((f) => f.status === "planted").length;
  const resolvedCount = items.filter((f) => f.status === "resolved").length;

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
        <Calendar size={40} className="text-gray-300 animate-pulse" />
        <p className="text-sm">加载伏笔日历数据...</p>
      </div>
    );
  }

  // ─── Error state ───
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-red-400 gap-3">
        <AlertTriangle size={40} />
        <p className="text-sm">加载失败: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
        >
          重试
        </button>
      </div>
    );
  }

  // ─── Empty state ───
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
        <Lightbulb size={48} className="text-gray-300" />
        <p className="text-sm">暂无伏笔数据</p>
        <p className="text-xs">在账本中添加伏笔后，它们将按预期卷在此日历中显示</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar size={22} className="text-indigo-600" />
            伏笔日历
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            按预期回收卷分组的伏笔时间线，共 {items.length} 条伏笔
          </p>
        </div>
        {/* Status legend */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="text-gray-500">待回收 {plantedCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-400" />
            <span className="text-gray-500">已回收 {resolvedCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <span className="text-gray-500">超期 {overdueCount}</span>
          </div>
        </div>
      </div>

      {/* Overdue warning banner */}
      {overdueCount > 0 && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-red-700">超期预警</span>
            <span className="text-sm text-red-600 ml-2">
              有 {overdueCount}{" "}
              条伏笔已超过预期回收卷号仍未回收，请检查是否需要调整伏笔计划或补写回收内容。
            </span>
          </div>
          <span className="text-lg font-bold text-red-500 shrink-0">{overdueCount}</span>
        </div>
      )}

      {/* Calendar groups */}
      <div className="space-y-4">
        {volumeGroups.map((group, gi) => (
          <VolumeRow
            key={group.volumeId || `unassigned-${gi}`}
            group={group}
            isUnassigned={group.volumeId === null}
            expanded={group.volumeId !== null || unassignedExpanded}
            onToggleExpand={() => setUnassignedExpanded(!unassignedExpanded)}
            onItemClick={setSelectedItem}
          />
        ))}
      </div>

      {/* Detail popup */}
      {selectedItem && <DetailPopup item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}
