import { useEffect, useState, useCallback } from "react";
import { useOutlineStore, useChapterStore } from "../../stores";
import { outlineApi, type ArcInfo } from "../../lib/api";
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Layers,
  FileText,
  GitBranch,
  Pencil,
  Check,
  X,
  ChevronsUpDown,
  Plus,
  Target,
  Flag,
} from "lucide-react";

function InlineEditField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | null;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  if (!value && !editing) {
    return (
      <button
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="flex items-center gap-1 px-3 py-1 text-sm text-gray-400 hover:text-gray-600"
      >
        <Pencil size={12} />
        添加{label}
      </button>
    );
  }

  if (editing) {
    return (
      <div className="px-3 py-1 flex items-start gap-2">
        <span className="text-sm font-medium text-gray-500 shrink-0 pt-1">{label}：</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          rows={2}
          autoFocus
        />
        <button
          onClick={() => {
            onSave(draft);
            setEditing(false);
          }}
          className="p-1 text-green-600 hover:bg-green-50 rounded"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => {
            setDraft(value || "");
            setEditing(false);
          }}
          className="p-1 text-gray-400 hover:bg-gray-100 rounded"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="px-3 py-1 text-sm text-gray-600 flex items-start gap-1 group">
      <span className="font-medium text-gray-500 shrink-0">{label}：</span>
      <span className="flex-1">{value}</span>
      <button
        onClick={() => {
          setDraft(value || "");
          setEditing(true);
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-indigo-600 shrink-0"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}

/** Arc creation form shown inline */
function ArcCreateForm({
  volumeId,
  volumeChapterStart,
  volumeChapterEnd,
  onCreated,
  onCancel,
}: {
  volumeId: string;
  volumeChapterStart: number | null;
  volumeChapterEnd: number | null;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [chapterStart, setChapterStart] = useState(volumeChapterStart?.toString() || "");
  const [chapterEnd, setChapterEnd] = useState(volumeChapterEnd?.toString() || "");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await outlineApi.createArc({
        volume_id: volumeId,
        title: title.trim(),
        chapter_start: chapterStart ? parseInt(chapterStart) : undefined,
        chapter_end: chapterEnd ? parseInt(chapterEnd) : undefined,
        goal: goal.trim() || undefined,
      });
      onCreated();
    } catch (e) {
      console.error("Failed to create arc:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ml-4 mt-2 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
      <div className="text-xs font-medium text-indigo-700 mb-2 flex items-center gap-1">
        <Plus size={12} />
        新建事件链
      </div>
      <div className="space-y-2">
        <input
          type="text"
          placeholder="事件链标题（必填）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          autoFocus
        />
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="起始章节"
            value={chapterStart}
            onChange={(e) => setChapterStart(e.target.value)}
            className="w-1/2 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="number"
            placeholder="结束章节"
            value={chapterEnd}
            onChange={(e) => setChapterEnd(e.target.value)}
            className="w-1/2 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <input
          type="text"
          placeholder="目标（可选）"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSave}
          disabled={!title.trim() || saving}
          className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded"
        >
          取消
        </button>
      </div>
    </div>
  );
}

/** Display a single arc row */
function ArcRow({ arc }: { arc: ArcInfo }) {
  const statusLabel =
    arc.status === "active"
      ? "进行中"
      : arc.status === "completed"
        ? "已完成"
        : arc.status === "planned"
          ? "计划中"
          : arc.status || "未知";

  const statusColor =
    arc.status === "active"
      ? "bg-green-100 text-green-700"
      : arc.status === "completed"
        ? "bg-blue-100 text-blue-700"
        : "bg-gray-100 text-gray-600";

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 text-sm ml-4 border-l-2 border-indigo-200 hover:bg-gray-50 rounded-r">
      <Target size={14} className="text-indigo-500 shrink-0" />
      <span className="font-medium text-gray-800 flex-1">{arc.title || "未命名事件链"}</span>
      {(arc.chapter_start != null || arc.chapter_end != null) && (
        <span className="text-xs text-gray-400 shrink-0">
          第{arc.chapter_start ?? "?"}-{arc.chapter_end ?? "?"}章
        </span>
      )}
      {arc.goal && (
        <span className="text-xs text-gray-500 truncate max-w-[200px] shrink" title={arc.goal}>
          <Flag size={10} className="inline mr-0.5" />
          {arc.goal}
        </span>
      )}
      <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${statusColor}`}>{statusLabel}</span>
    </div>
  );
}

export function OutlinePage() {
  const { volumes, fetchVolumes, updateVolume } = useOutlineStore();
  const { chapters, fetchChapters, fetchCharacters } = useChapterStore();
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());
  const [arcsByVolume, setArcsByVolume] = useState<Record<string, ArcInfo[]>>({});
  const [showCreateArc, setShowCreateArc] = useState<Set<string>>(new Set());
  const [loadingArcs, setLoadingArcs] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchVolumes();
    fetchChapters();
    fetchCharacters();
  }, [fetchVolumes, fetchChapters, fetchCharacters]);

  const toggleVolume = useCallback(
    (id: string) => {
      setExpandedVolumes((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
          // Fetch arcs when expanding a volume
          if (!arcsByVolume[id]) {
            setLoadingArcs((s) => new Set(s).add(id));
            outlineApi.listArcs(id).then((arcs) => {
              setArcsByVolume((prev) => ({ ...prev, [id]: arcs }));
              setLoadingArcs((s) => {
                const ns = new Set(s);
                ns.delete(id);
                return ns;
              });
            });
          }
        }
        return next;
      });
    },
    [arcsByVolume],
  );

  const expandAll = useCallback(() => {
    const allIds = new Set(volumes.map((v) => v.id));
    setExpandedVolumes(allIds);
    // Fetch arcs for all volumes
    volumes.forEach((vol) => {
      if (!arcsByVolume[vol.id]) {
        setLoadingArcs((s) => new Set(s).add(vol.id));
        outlineApi.listArcs(vol.id).then((arcs) => {
          setArcsByVolume((prev) => ({ ...prev, [vol.id]: arcs }));
          setLoadingArcs((s) => {
            const ns = new Set(s);
            ns.delete(vol.id);
            return ns;
          });
        });
      }
    });
  }, [volumes, arcsByVolume]);

  const collapseAll = useCallback(() => {
    setExpandedVolumes(new Set());
  }, []);

  const handleArcCreated = useCallback((volumeId: string) => {
    setShowCreateArc((prev) => {
      const next = new Set(prev);
      next.delete(volumeId);
      return next;
    });
    // Refresh arcs for this volume
    outlineApi.listArcs(volumeId).then((arcs) => {
      setArcsByVolume((prev) => ({ ...prev, [volumeId]: arcs }));
    });
  }, []);

  const allExpanded = volumes.length > 0 && expandedVolumes.size === volumes.length;
  const anyExpanded = expandedVolumes.size > 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <GitBranch size={22} className="text-indigo-600" />
          长程剧情树
        </h1>
        {volumes.length > 0 && (
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            <ChevronsUpDown size={14} />
            {allExpanded ? "全部折叠" : "全部展开"}
          </button>
        )}
      </div>

      {volumes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={48} className="mx-auto mb-4" />
          <p>暂无卷结构，请先完成一键启动流程</p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Book level */}
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg">
            <BookOpen size={18} className="text-indigo-600" />
            <span className="font-medium text-indigo-900">全书</span>
          </div>

          {/* Volume level */}
          {volumes.map((vol) => {
            const volArcs = arcsByVolume[vol.id] || [];
            const isLoadingArcs = loadingArcs.has(vol.id);
            const isShowingCreate = showCreateArc.has(vol.id);

            return (
              <div key={vol.id} className="ml-4">
                <button
                  onClick={() => toggleVolume(vol.id)}
                  className="group flex items-center gap-2 w-full px-3 py-2 hover:bg-gray-50 rounded-lg text-left"
                >
                  {expandedVolumes.has(vol.id) ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <Layers size={16} className="text-blue-500" />
                  <span className="font-medium text-gray-900">
                    第{vol.volume_number}卷{vol.title ? `: ${vol.title}` : ""}
                  </span>
                  {vol.title && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const newTitle = prompt("修改卷标题", vol.title || "");
                        if (newTitle !== null) updateVolume(vol.id, newTitle);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-400 hover:text-indigo-600"
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                  {vol.status && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      {vol.status}
                    </span>
                  )}
                </button>

                {expandedVolumes.has(vol.id) && (
                  <div className="ml-8">
                    <InlineEditField
                      label="目标"
                      value={vol.goal}
                      onSave={(v) => updateVolume(vol.id, v)}
                    />
                    <InlineEditField
                      label="冲突"
                      value={vol.main_conflict}
                      onSave={(v) => updateVolume(vol.id, undefined, v)}
                    />
                    <InlineEditField
                      label="爆点"
                      value={vol.climax}
                      onSave={(v) => updateVolume(vol.id, undefined, undefined, v)}
                    />
                    <InlineEditField
                      label="余波"
                      value={vol.settlement}
                      onSave={(v) => updateVolume(vol.id, undefined, undefined, undefined, v)}
                    />

                    {/* Chapters in this volume range */}
                    {chapters
                      .filter((ch) => {
                        if (!vol.chapter_start || !vol.chapter_end) return false;
                        return (
                          ch.chapter_number >= vol.chapter_start &&
                          ch.chapter_number <= vol.chapter_end
                        );
                      })
                      .map((ch) => (
                        <div
                          key={ch.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700"
                        >
                          <FileText size={14} className="text-gray-400" />
                          <span>
                            第{ch.chapter_number}章 {ch.title || ""}
                          </span>
                          <span className="text-xs text-gray-400">{ch.status}</span>
                          {ch.word_count != null && (
                            <span className="text-xs text-gray-400">{ch.word_count}字</span>
                          )}
                        </div>
                      ))}

                    {/* Arcs (event chains) for this volume */}
                    <div className="mt-2 mb-1">
                      <div className="flex items-center gap-2 px-3 py-1">
                        <span className="text-xs font-medium text-indigo-600 uppercase tracking-wide">
                          事件链 ({volArcs.length})
                        </span>
                        <button
                          onClick={() =>
                            setShowCreateArc((prev) => {
                              const next = new Set(prev);
                              if (next.has(vol.id)) next.delete(vol.id);
                              else next.add(vol.id);
                              return next;
                            })
                          }
                          className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 px-1.5 py-0.5 rounded"
                        >
                          <Plus size={12} />
                          {isShowingCreate ? "取消" : "添加"}
                        </button>
                      </div>

                      {isLoadingArcs && (
                        <div className="px-3 py-2 text-xs text-gray-400">加载中...</div>
                      )}

                      {!isLoadingArcs && volArcs.length === 0 && !isShowingCreate && (
                        <div className="px-3 py-2 text-xs text-gray-400">暂无事件链</div>
                      )}

                      {!isLoadingArcs && volArcs.map((arc) => <ArcRow key={arc.id} arc={arc} />)}

                      {isShowingCreate && (
                        <ArcCreateForm
                          volumeId={vol.id}
                          volumeChapterStart={vol.chapter_start}
                          volumeChapterEnd={vol.chapter_end}
                          onCreated={() => handleArcCreated(vol.id)}
                          onCancel={() =>
                            setShowCreateArc((prev) => {
                              const next = new Set(prev);
                              next.delete(vol.id);
                              return next;
                            })
                          }
                        />
                      )}
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
