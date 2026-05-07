import { useEffect, useState } from "react";
import { ledgerApi, type TimelineNodeInfo } from "../../lib/api";
import { Clock, MapPin, Loader2 } from "lucide-react";

const chapterColors = [
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-violet-500",
  "bg-orange-500",
  "bg-teal-500",
];

function getChapterColor(chapterNumber: number | null): string {
  if (chapterNumber == null) return "bg-gray-400";
  return chapterColors[(chapterNumber - 1) % chapterColors.length];
}

export function TimelineMap() {
  const [nodes, setNodes] = useState<TimelineNodeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await ledgerApi.listTimelineNodes();
        // Sort by relative_day then chapter_number
        const sorted = [...data].sort((a, b) => {
          const dayA = a.relative_day ?? Number.MAX_SAFE_INTEGER;
          const dayB = b.relative_day ?? Number.MAX_SAFE_INTEGER;
          if (dayA !== dayB) return dayA - dayB;
          const chA = a.chapter_number ?? Number.MAX_SAFE_INTEGER;
          const chB = b.chapter_number ?? Number.MAX_SAFE_INTEGER;
          return chA - chB;
        });
        setNodes(sorted);
      } catch (e: any) {
        setError(e.toString());
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Loader2 size={36} className="animate-spin mb-3" />
        <p className="text-sm">加载时间线数据中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Clock size={48} className="mb-4" />
        <p className="text-sm text-red-500">加载失败: {error}</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Clock size={48} className="mb-4" />
        <p className="text-sm">暂无时间线节点</p>
        <p className="text-xs mt-1">完成章节写作后，时间线节点将在此处展示</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">时间线地图</h2>
      <p className="text-sm text-gray-500 mb-6">按故事内相对天数排序的时间线节点</p>

      <div className="relative pl-8">
        {/* Continuous vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-gray-200" />

        <div className="space-y-6">
          {nodes.map((node, index) => {
            const dotColor = getChapterColor(node.chapter_number);
            const isFirst = index === 0;

            return (
              <div key={node.id} className="relative">
                {/* Dot on the line */}
                <div
                  className={`absolute -left-8 top-1 w-2.5 h-2.5 rounded-full border-2 border-white ring-2 ring-offset-1 ${dotColor} ${
                    isFirst ? "ring-4 ring-offset-2" : ""
                  }`}
                  style={{ marginTop: "4px" }}
                />

                {/* Card */}
                <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
                      <span className="text-sm font-medium text-gray-500">
                        {node.chapter_number != null ? `第${node.chapter_number}章` : "未关联章节"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      {node.relative_day != null && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />第{node.relative_day}天
                        </span>
                      )}
                      {node.world_date && <span>{node.world_date}</span>}
                      {node.location_id && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {node.location_id}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-gray-700 leading-relaxed">{node.summary}</p>

                  {node.participants && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(() => {
                        try {
                          const participants: string[] = JSON.parse(node.participants);
                          return participants.map((p, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
                            >
                              {p}
                            </span>
                          ));
                        } catch {
                          return null;
                        }
                      })()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mt-6 pt-4 border-t border-gray-200">
        <span className="text-xs text-gray-500">图例:</span>
        {chapterColors.map((color, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`} />第{i + 1}章
          </div>
        ))}
      </div>
    </div>
  );
}
