import { useEffect, useState, useCallback } from "react";
import { useOutlineStore, useChapterStore } from "../../stores";
import {
  chapterApi,
  ledgerApi,
  type ChapterInfo,
  type CharacterInfo,
  type ForeshadowItemInfo,
} from "../../lib/api";
import {
  BookOpen,
  FileText,
  Users,
  Eye,
  CheckCircle,
  Loader2,
  AlertTriangle,
  BarChart3,
} from "lucide-react";

// ─── Types ───

interface VolumeStats {
  volumeId: string;
  volumeNumber: number;
  title: string | null;
  chapterStart: number | null;
  chapterEnd: number | null;
  totalWords: number;
  avgChapterWords: number;
  chapterCount: number;
  finalizedCount: number;
  completionPct: number;
  characterNames: string[];
  characterCount: number;
  foreshadowCount: number;
  loading: boolean;
}

// ─── Helpers ───

/** Check if any character name appears in the given text. */
function findCharactersInText(text: string, characters: CharacterInfo[]): string[] {
  if (!text) return [];
  const found: string[] = [];
  const lowerText = text.toLowerCase();
  for (const char of characters) {
    if (lowerText.includes(char.name.toLowerCase())) {
      found.push(char.name);
    }
  }
  return found;
}

// ─── Stats Card ───

function StatsCard({ stats }: { stats: VolumeStats }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">
            第{stats.volumeNumber}卷{stats.title ? `: ${stats.title}` : ""}
          </h3>
          {(stats.chapterStart != null || stats.chapterEnd != null) && (
            <p className="text-xs text-gray-500 mt-0.5">
              第{stats.chapterStart ?? "?"} - {stats.chapterEnd ?? "?"}章
            </p>
          )}
        </div>
        {/* Completion badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
            stats.completionPct >= 100
              ? "bg-green-100 text-green-700"
              : stats.completionPct >= 50
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          <CheckCircle size={12} />
          {stats.completionPct.toFixed(0)}%
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            stats.completionPct >= 100
              ? "bg-green-500"
              : stats.completionPct >= 50
                ? "bg-yellow-500"
                : "bg-indigo-500"
          }`}
          style={{ width: `${Math.min(stats.completionPct, 100)}%` }}
        />
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-0.5">总字数</p>
          <p className="text-lg font-semibold text-gray-900">{stats.totalWords.toLocaleString()}</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-0.5">平均每章</p>
          <p className="text-lg font-semibold text-gray-900">
            {stats.avgChapterWords.toLocaleString()}
            <span className="text-xs text-gray-400 font-normal"> 字</span>
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-0.5">章节数</p>
          <p className="text-lg font-semibold text-gray-900">
            {stats.finalizedCount}
            <span className="text-sm text-gray-400 font-normal">/{stats.chapterCount}</span>
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-0.5">字数范围</p>
          <p className="text-lg font-semibold text-gray-900">
            {stats.totalWords > 0 ? "..." : "-"}
          </p>
        </div>
      </div>

      {/* Characters & Foreshadows */}
      <div className="space-y-2 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2 text-sm">
          <Users size={14} className="text-indigo-500 shrink-0" />
          <span className="text-gray-600">角色数：</span>
          <span className="font-medium text-gray-900">{stats.characterCount}</span>
          {stats.loading && <Loader2 size={12} className="animate-spin text-gray-400" />}
          {!stats.loading && stats.characterNames.length > 0 && (
            <span
              className="text-xs text-gray-400 truncate"
              title={stats.characterNames.join("、")}
            >
              ({stats.characterNames.slice(0, 5).join("、")}
              {stats.characterNames.length > 5 ? "..." : ""})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Eye size={14} className="text-amber-500 shrink-0" />
          <span className="text-gray-600">伏笔数：</span>
          <span className="font-medium text-gray-900">{stats.foreshadowCount}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───

export function VolumeStatsPage() {
  const { volumes, loading: volumesLoading, error: volumesError, fetchVolumes } = useOutlineStore();
  const { chapters, fetchChapters } = useChapterStore();

  const [statsList, setStatsList] = useState<VolumeStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial data fetch
  useEffect(() => {
    fetchVolumes();
    fetchChapters();
  }, [fetchVolumes, fetchChapters]);

  // Compute stats for all volumes
  const computeStats = useCallback(async () => {
    if (volumes.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch all characters once
      let characters: CharacterInfo[] = [];
      try {
        characters = await chapterApi.listCharacters();
      } catch {
        // Characters may not be available
      }

      // Fetch all foreshadows once
      let foreshadows: ForeshadowItemInfo[] = [];
      try {
        foreshadows = await ledgerApi.listForeshadowItems();
      } catch {
        // Foreshadows may not be available
      }

      const results: VolumeStats[] = [];

      for (const vol of volumes.sort((a, b) => a.volume_number - b.volume_number)) {
        // Get chapters in this volume range
        const volChapters: ChapterInfo[] = chapters.filter((ch) => {
          if (vol.chapter_start == null || vol.chapter_end == null) return false;
          return ch.chapter_number >= vol.chapter_start && ch.chapter_number <= vol.chapter_end;
        });

        // Initial stats (before fetching chapter texts)
        const initialStats: VolumeStats = {
          volumeId: vol.id,
          volumeNumber: vol.volume_number,
          title: vol.title,
          chapterStart: vol.chapter_start,
          chapterEnd: vol.chapter_end,
          totalWords: volChapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0),
          avgChapterWords:
            volChapters.length > 0
              ? Math.round(
                  volChapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0) /
                    volChapters.length,
                )
              : 0,
          chapterCount: volChapters.length,
          finalizedCount: volChapters.filter((ch) =>
            ["finalized", "approved", "archived"].includes(ch.status),
          ).length,
          completionPct:
            volChapters.length > 0
              ? Math.round(
                  (volChapters.filter((ch) =>
                    ["finalized", "approved", "archived"].includes(ch.status),
                  ).length /
                    volChapters.length) *
                    100,
                )
              : 0,
          characterNames: [],
          characterCount: 0,
          foreshadowCount: 0,
          loading: true,
        };

        // Add initial stats to results while we fetch details
        results.push(initialStats);
      }

      setStatsList([...results]);

      // Now fetch chapter texts for character matching (for each volume)
      for (let i = 0; i < results.length; i++) {
        const vol = volumes[i];
        if (vol.chapter_start == null || vol.chapter_end == null) {
          results[i] = { ...results[i], loading: false };
          continue;
        }

        const volChapters = chapters.filter(
          (ch) => ch.chapter_number >= vol.chapter_start! && ch.chapter_number <= vol.chapter_end!,
        );

        const allCharNames = new Set<string>();

        // Fetch chapter texts in batches (limit to avoid overwhelming)
        const chaptersToFetch = volChapters.slice(0, 20); // Max 20 chapters per volume for text analysis
        for (const ch of chaptersToFetch) {
          try {
            const detail = await chapterApi.getChapter(ch.chapter_number);
            const text = detail.final_text || detail.draft_text || "";
            const found = findCharactersInText(text, characters);
            for (const name of found) {
              allCharNames.add(name);
            }
          } catch {
            // Skip chapters that can't be fetched
          }
        }

        // Count foreshadows planted in this volume's chapter range
        const volForeshadows = foreshadows.filter(
          (f) => f.seed_chapter >= vol.chapter_start! && f.seed_chapter <= vol.chapter_end!,
        );

        results[i] = {
          ...results[i],
          characterNames: Array.from(allCharNames),
          characterCount: allCharNames.size,
          foreshadowCount: volForeshadows.length,
          loading: false,
        };

        setStatsList([...results]);
      }
    } catch (e: any) {
      setError(e?.toString() || "计算统计数据时出错");
    } finally {
      setLoading(false);
    }
  }, [volumes, chapters]);

  useEffect(() => {
    if (volumes.length > 0 && chapters.length > 0) {
      computeStats();
    }
  }, [volumes.length, chapters.length, computeStats]);

  const totalWords = statsList.reduce((sum, s) => sum + s.totalWords, 0);
  const totalChapters = statsList.reduce((sum, s) => sum + s.chapterCount, 0);
  const totalFinalized = statsList.reduce((sum, s) => sum + s.finalizedCount, 0);
  const totalCharacters = new Set(statsList.flatMap((s) => s.characterNames)).size;
  const totalForeshadows = statsList.reduce((sum, s) => sum + s.foreshadowCount, 0);
  const overallCompletion =
    totalChapters > 0 ? Math.round((totalFinalized / totalChapters) * 100) : 0;

  // ─── Loading ───
  if ((volumesLoading || loading) && volumes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Error ───
  if (volumesError || error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{volumesError || error}</p>
        </div>
      </div>
    );
  }

  // ─── Empty ───
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

  // ─── Stats Page ───
  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={22} className="text-indigo-600" />
          卷统计摘要
        </h1>
      </div>

      {/* Overall summary banner */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">总字数</p>
          <p className="text-xl font-bold text-gray-900">{totalWords.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">总章节</p>
          <p className="text-xl font-bold text-gray-900">{totalChapters}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">完成率</p>
          <p
            className={`text-xl font-bold ${overallCompletion >= 100 ? "text-green-600" : overallCompletion >= 50 ? "text-yellow-600" : "text-gray-900"}`}
          >
            {overallCompletion}%
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">角色数</p>
          <p className="text-xl font-bold text-gray-900">{totalCharacters}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
          <p className="text-xs text-gray-500 mb-1">伏笔数</p>
          <p className="text-xl font-bold text-gray-900">{totalForeshadows}</p>
        </div>
      </div>

      {/* Per-volume stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {statsList.map((stats) => (
          <StatsCard key={stats.volumeId} stats={stats} />
        ))}
      </div>
    </div>
  );
}
