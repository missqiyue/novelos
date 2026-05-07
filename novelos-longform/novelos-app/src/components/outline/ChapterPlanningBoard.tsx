import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useOutlineStore, useChapterStore } from "../../stores";
import type { VolumeInfo, ChapterInfo } from "../../lib/api";
import { BookOpen, FileText, Loader2, AlertTriangle } from "lucide-react";

// ─── Status helpers ───

function statusBadge(status: string) {
  switch (status) {
    case "finalized":
    case "approved":
    case "archived":
      return { label: "已定稿", bg: "bg-green-100", text: "text-green-700" };
    case "draft_generated":
    case "review_pending":
    case "task_ready":
      return { label: "草稿中", bg: "bg-yellow-100", text: "text-yellow-700" };
    case "compile_failed":
    case "rewrite_required":
    case "needs_revalidate":
      return { label: "需修复", bg: "bg-red-100", text: "text-red-700" };
    default:
      return { label: status, bg: "bg-gray-100", text: "text-gray-600" };
  }
}

function statusBorderColor(status: string): string {
  switch (status) {
    case "finalized":
    case "approved":
    case "archived":
      return "border-l-green-500";
    case "draft_generated":
    case "review_pending":
    case "task_ready":
      return "border-l-yellow-500";
    case "compile_failed":
    case "rewrite_required":
    case "needs_revalidate":
      return "border-l-red-500";
    default:
      return "border-l-gray-300";
  }
}

// ─── Volume Column ───

function VolumeColumn({
  volume,
  chapters,
  onChapterClick,
}: {
  volume: VolumeInfo;
  chapters: ChapterInfo[];
  onChapterClick: (chapterNumber: number) => void;
}) {
  return (
    <div className="flex-shrink-0 w-72 flex flex-col bg-gray-50 rounded-lg border border-gray-200">
      {/* Column header */}
      <div className="p-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm truncate">
          第{volume.volume_number}卷{volume.title ? `: ${volume.title}` : ""}
        </h3>
        {(volume.chapter_start != null || volume.chapter_end != null) && (
          <p className="text-xs text-gray-500 mt-0.5">
            第{volume.chapter_start ?? "?"} - {volume.chapter_end ?? "?"}章 &middot;{" "}
            {chapters.length} 个章节
          </p>
        )}
        {volume.goal && (
          <p className="text-xs text-gray-400 mt-1 truncate" title={volume.goal}>
            {volume.goal}
          </p>
        )}
      </div>

      {/* Chapter cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {chapters.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 text-sm">
            暂无章节
          </div>
        ) : (
          chapters.map((ch) => {
            const badge = statusBadge(ch.status);
            return (
              <button
                key={ch.id}
                onClick={() => onChapterClick(ch.chapter_number)}
                className={`w-full text-left bg-white rounded-md border border-gray-200 border-l-4 ${statusBorderColor(ch.status)} p-3 hover:shadow-sm hover:border-gray-300 transition-all`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    <FileText size={14} className="text-gray-400 shrink-0" />第{ch.chapter_number}章
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}
                  >
                    {badge.label}
                  </span>
                </div>
                {ch.title && <p className="text-xs text-gray-600 truncate">{ch.title}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                  {ch.word_count != null && <span>{ch.word_count.toLocaleString()} 字</span>}
                  {ch.compiler_status && (
                    <span
                      className={
                        ch.compiler_status === "fail"
                          ? "text-red-500"
                          : ch.compiler_status === "warning"
                            ? "text-yellow-500"
                            : "text-green-500"
                      }
                    >
                      {ch.compiler_status === "fail"
                        ? "编译失败"
                        : ch.compiler_status === "warning"
                          ? "编译警告"
                          : "编译通过"}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───

export function ChapterPlanningBoard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { volumes, loading: volumesLoading, error: volumesError, fetchVolumes } = useOutlineStore();
  const {
    chapters,
    loading: chaptersLoading,
    error: chaptersError,
    fetchChapters,
  } = useChapterStore();

  useEffect(() => {
    fetchVolumes();
    fetchChapters();
  }, [fetchVolumes, fetchChapters]);

  // Group chapters by volume range
  const chaptersByVolume = useMemo(() => {
    const map = new Map<string, ChapterInfo[]>();

    // Initialize all volumes with empty arrays
    for (const vol of volumes) {
      map.set(vol.id, []);
    }

    // Assign each chapter to its volume based on chapter_start/chapter_end range
    for (const ch of chapters) {
      const vol = volumes.find(
        (v) =>
          v.chapter_start != null &&
          v.chapter_end != null &&
          ch.chapter_number >= v.chapter_start &&
          ch.chapter_number <= v.chapter_end,
      );
      if (vol) {
        const arr = map.get(vol.id) || [];
        arr.push(ch);
        map.set(vol.id, arr);
      }
    }

    return map;
  }, [volumes, chapters]);

  // Unassigned chapters (not in any volume range)
  const unassignedChapters = useMemo(() => {
    return chapters.filter((ch) => {
      return !volumes.some(
        (v) =>
          v.chapter_start != null &&
          v.chapter_end != null &&
          ch.chapter_number >= v.chapter_start &&
          ch.chapter_number <= v.chapter_end,
      );
    });
  }, [chapters, volumes]);

  const handleChapterClick = (chapterNumber: number) => {
    navigate(`/project/${projectId}/chapter/${chapterNumber}`);
  };

  const loading = volumesLoading || chaptersLoading;
  const error = volumesError || chaptersError;

  // ─── Error state ───
  if (error && !loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  // ─── Loading state ───
  if (loading && volumes.length === 0 && chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Empty state ───
  if (volumes.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={48} className="mx-auto mb-4" />
          <p className="text-lg font-medium">暂无卷结构</p>
          <p className="text-sm mt-1">请先在"剧情树"页面创建卷结构</p>
        </div>
      </div>
    );
  }

  // ─── Board ───
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen size={22} className="text-indigo-600" />
          章节规划看板
        </h1>
        <div className="flex items-center gap-3">
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-green-500" />
              已定稿
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-yellow-500" />
              草稿中
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-red-500" />
              需修复
            </span>
          </div>
        </div>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
        {volumes
          .sort((a, b) => a.volume_number - b.volume_number)
          .map((vol) => (
            <VolumeColumn
              key={vol.id}
              volume={vol}
              chapters={(chaptersByVolume.get(vol.id) || []).sort(
                (a, b) => a.chapter_number - b.chapter_number,
              )}
              onChapterClick={handleChapterClick}
            />
          ))}

        {/* Unassigned chapters column */}
        {unassignedChapters.length > 0 && (
          <VolumeColumn
            volume={{
              id: "__unassigned__",
              volume_number: 0,
              title: "未分配章节",
              chapter_start: null,
              chapter_end: null,
              goal: null,
              main_conflict: null,
              climax: null,
              settlement: null,
              status: null,
            }}
            chapters={unassignedChapters.sort((a, b) => a.chapter_number - b.chapter_number)}
            onChapterClick={handleChapterClick}
          />
        )}
      </div>
    </div>
  );
}
