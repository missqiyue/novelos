import { useEffect, useState } from "react";
import { useChapterStore, useOutlineStore } from "../../stores";
import { Users, Activity, AlertCircle } from "lucide-react";

interface CharacterActivity {
  characterId: string;
  characterName: string;
  volumePresence: Record<string, boolean>; // volume_id -> appeared
}

export function CharacterActivityHeatmap() {
  const { characters, chapters, fetchChapters, fetchCharacters } = useChapterStore();
  const { volumes, fetchVolumes } = useOutlineStore();
  const [activityData, setActivityData] = useState<CharacterActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchChapters();
      await fetchCharacters();
      await fetchVolumes();
      setLoading(false);
    };
    load();
  }, [fetchChapters, fetchCharacters, fetchVolumes]);

  useEffect(() => {
    if (characters.length === 0 || volumes.length === 0) {
      setActivityData([]);
      return;
    }

    // Build activity matrix: for each character, check if their name appears in any chapter in each volume's range
    const data: CharacterActivity[] = characters.map((char) => {
      const presence: Record<string, boolean> = {};

      volumes.forEach((vol) => {
        if (vol.chapter_start == null || vol.chapter_end == null) {
          presence[vol.id] = false;
          return;
        }

        const volChapters = chapters.filter(
          (ch) =>
            ch.chapter_number >= (vol.chapter_start ?? 0) &&
            ch.chapter_number <= (vol.chapter_end ?? 9999),
        );

        if (volChapters.length === 0) {
          presence[vol.id] = false;
          return;
        }

        // Check if character name appears in any chapter's draft or final text
        const nameLower = char.name.toLowerCase();
        const appeared = volChapters.some((ch) => {
          const text = (ch.draft_text || "") + (ch.final_text || "");
          return text.toLowerCase().includes(nameLower);
        });

        presence[vol.id] = appeared;
      });

      return {
        characterId: char.id,
        characterName: char.name,
        volumePresence: presence,
      };
    });

    setActivityData(data);
  }, [characters, volumes, chapters]);

  const hasAnyTextData = chapters.some((ch) => ch.draft_text || ch.final_text);

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <Activity size={32} className="mx-auto mb-3 animate-pulse" />
        <p>加载中...</p>
      </div>
    );
  }

  if (characters.length === 0 || volumes.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400">
        <Users size={48} className="mx-auto mb-4" />
        <p>{characters.length === 0 ? "暂无角色数据" : "暂无卷结构"}</p>
      </div>
    );
  }

  if (!hasAnyTextData) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle size={16} className="text-amber-500" />
          <span className="text-sm text-amber-700">暂无章节正文数据，无法检测角色活跃度</span>
        </div>
        <div className="text-center py-12 text-gray-400">
          <Activity size={48} className="mx-auto mb-4" />
          <p>暂无数据</p>
        </div>
      </div>
    );
  }

  // Calculate per-volume active character count
  const volumeActiveCounts: Record<string, number> = {};
  volumes.forEach((vol) => {
    volumeActiveCounts[vol.id] = activityData.filter((d) => d.volumePresence[vol.id]).length;
  });

  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">角色活跃度热力图</h2>
      <p className="text-sm text-gray-500 mb-4">
        基于章节正文中角色名称出现情况检测，绿色表示角色在该卷中出现
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white z-10 text-left px-3 py-2 border-b border-gray-200 font-medium text-gray-600 min-w-[100px]">
                角色
              </th>
              {volumes.map((vol) => (
                <th
                  key={vol.id}
                  className="px-3 py-2 border-b border-gray-200 font-medium text-gray-600 text-center min-w-[80px]"
                  title={`第${vol.volume_number}卷: ${vol.title || ""}`}
                >
                  <div>第{vol.volume_number}卷</div>
                  <div className="text-xs text-gray-400 font-normal">
                    第{vol.chapter_start ?? "?"}-{vol.chapter_end ?? "?"}章
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activityData.map((charActivity) => (
              <tr key={charActivity.characterId} className="hover:bg-gray-50">
                <td className="sticky left-0 bg-white z-10 px-3 py-2 border-b border-gray-100 font-medium text-gray-800">
                  {charActivity.characterName}
                </td>
                {volumes.map((vol) => {
                  const appeared = charActivity.volumePresence[vol.id];
                  return (
                    <td key={vol.id} className="px-3 py-2 border-b border-gray-100 text-center">
                      <span
                        className={`inline-block w-5 h-5 rounded-sm ${
                          appeared ? "bg-green-400" : "bg-gray-200"
                        }`}
                        title={
                          appeared
                            ? `${charActivity.characterName} 出现在第${vol.volume_number}卷`
                            : `${charActivity.characterName} 未出现在第${vol.volume_number}卷`
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50">
              <td className="sticky left-0 bg-gray-50 z-10 px-3 py-2 border-t border-gray-200 font-medium text-gray-600 text-xs">
                活跃角色数
              </td>
              {volumes.map((vol) => (
                <td
                  key={vol.id}
                  className="px-3 py-2 border-t border-gray-200 text-center text-xs text-gray-500"
                >
                  {volumeActiveCounts[vol.id]}/{characters.length}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-400 inline-block" />
          出现
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-gray-200 inline-block" />
          未出现
        </div>
      </div>
    </div>
  );
}
