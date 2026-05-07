import { useChapterStore, useOutlineStore } from "../../stores";

const statusColors: Record<string, string> = {
  finalized: "bg-green-500",
  approved: "bg-green-400",
  drafting: "bg-yellow-400",
  draft_generated: "bg-blue-400",
  reviewing: "bg-purple-400",
  compile_failed: "bg-red-500",
  task_ready: "bg-gray-300",
};

const statusLabels: Record<string, string> = {
  finalized: "定稿",
  approved: "已批准",
  drafting: "草稿",
  draft_generated: "已生成",
  reviewing: "审阅中",
  compile_failed: "失败",
  task_ready: "就绪",
};

export function StoryRoadmap() {
  const { chapters } = useChapterStore();
  const { volumes } = useOutlineStore();

  const maxChapter = Math.max(
    ...chapters.map((ch) => ch.chapter_number),
    ...volumes.map((v) => v.chapter_end || 0),
    1,
  );

  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-lg font-semibold mb-4">故事线路图</h2>

      {/* Volume bars */}
      <div className="space-y-3 mb-6">
        {volumes.map((vol) => {
          const start = vol.chapter_start || 1;
          const end = vol.chapter_end || start + 10;
          const volChapters = chapters.filter(
            (ch) => ch.chapter_number >= start && ch.chapter_number <= end,
          );
          const doneCount = volChapters.filter(
            (ch) => ch.status === "finalized" || ch.status === "approved",
          ).length;

          return (
            <div key={vol.id} className="flex items-center gap-3">
              <div className="w-28 shrink-0 text-right">
                <span className="text-sm font-medium text-gray-900">第{vol.volume_number}卷</span>
                <p className="text-xs text-gray-400 truncate">{vol.title || ""}</p>
              </div>
              <div className="flex-1 flex gap-0.5 h-6 bg-gray-100 rounded overflow-hidden">
                {Array.from({ length: end - start + 1 }, (_, i) => {
                  const chNum = start + i;
                  const ch = chapters.find((c) => c.chapter_number === chNum);
                  const color = ch ? statusColors[ch.status] || "bg-gray-300" : "bg-gray-200";
                  return (
                    <div
                      key={i}
                      className="flex-1"
                      title={
                        ch
                          ? `第${chNum}章: ${statusLabels[ch.status] || ch.status} (${ch.word_count || 0}字)`
                          : `第${chNum}章: 未创建`
                      }
                    >
                      <div className={`h-full ${color} rounded-sm`} />
                    </div>
                  );
                })}
              </div>
              <span className="text-xs text-gray-400 w-16 shrink-0">
                {doneCount}/{end - start + 1}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(statusLabels).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${statusColors[key] || "bg-gray-300"}`} />
            <span className="text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {/* Chapter-level detail */}
      <div className="mt-6">
        <h3 className="font-medium text-gray-900 mb-2">章节详情</h3>
        <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 lg:grid-cols-20 gap-1">
          {Array.from({ length: maxChapter }, (_, i) => {
            const chNum = i + 1;
            const ch = chapters.find((c) => c.chapter_number === chNum);
            const color = ch ? statusColors[ch.status] || "bg-gray-300" : "bg-gray-100";
            return (
              <div
                key={i}
                className={`aspect-square rounded flex items-center justify-center text-[10px] font-medium ${color} ${
                  ch ? "text-white" : "text-gray-400"
                }`}
                title={ch ? `${ch.title || ""} - ${ch.word_count || 0}字` : `第${chNum}章`}
              >
                {chNum}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
