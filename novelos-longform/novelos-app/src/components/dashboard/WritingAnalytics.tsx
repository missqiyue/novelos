import { useEffect, useMemo, useState } from "react";
import { useChapterStore } from "../../stores";
import type { ChapterInfo, CharacterInfo } from "../../lib/api";
import {
  BarChart3,
  TrendingUp,
  Activity,
  Users,
  FileText,
  Gauge,
  Loader2,
  AlertCircle,
} from "lucide-react";

// ─── helpers ───

function statusColor(status: string): string {
  const m: Record<string, string> = {
    finalized: "bg-green-500",
    approved: "bg-green-500",
    drafting: "bg-yellow-400",
    draft_done: "bg-blue-500",
    draft_generated: "bg-blue-400",
    reviewing: "bg-purple-500",
    task_ready: "bg-gray-400",
    compile_failed: "bg-red-500",
    review_rejected: "bg-red-400",
  };
  return m[status] || "bg-gray-300";
}

function statusLabel(status: string): string {
  const m: Record<string, string> = {
    finalized: "已定稿",
    approved: "已批准",
    drafting: "草稿中",
    draft_done: "草稿完成",
    draft_generated: "草稿生成",
    reviewing: "审阅中",
    task_ready: "待开始",
    compile_failed: "编译失败",
    review_rejected: "审阅驳回",
  };
  return m[status] || status;
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function countCharMentions(text: string, characters: CharacterInfo[]): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!text) return counts;
  for (const ch of characters) {
    const escaped = ch.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const matches = text.match(regex);
    if (matches) {
      counts[ch.name] = matches.length;
    }
  }
  return counts;
}

// ─── sub-components ───

function WordCountBarChart({ chapters }: { chapters: ChapterInfo[] }) {
  if (chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        暂无章节数据
      </div>
    );
  }

  const maxWords = Math.max(...chapters.map((ch) => ch.word_count || 0), 1);
  const maxDisplay = Math.ceil(maxWords / 1000) * 1000 || 1000;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <BarChart3 size={16} className="text-indigo-600" />
        章节字数趋势
      </h3>
      <div className="flex items-end gap-1 h-40 px-1">
        {chapters.map((ch) => {
          const words = ch.word_count || 0;
          const heightPct = maxWords > 0 ? (words / maxWords) * 100 : 0;
          return (
            <div
              key={ch.id}
              className="flex-1 flex flex-col items-center justify-end h-full group relative"
            >
              <div className="text-[9px] text-gray-400 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {words.toLocaleString()}
              </div>
              <div
                className={`w-full rounded-t-sm transition-all ${statusColor(ch.status)}`}
                style={{ height: `${Math.max(heightPct, 1)}%` }}
                title={`第${ch.chapter_number}章: ${words}字 (${statusLabel(ch.status)})`}
              />
              <div className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">
                {ch.chapter_number}
              </div>
            </div>
          );
        })}
      </div>
      {/* Y-axis scale */}
      <div className="flex justify-between text-[10px] text-gray-400 px-1">
        <span>0</span>
        <span>{maxDisplay.toLocaleString()} 字</span>
      </div>
    </div>
  );
}

function WritingSpeed({ chapters }: { chapters: ChapterInfo[] }) {
  const wordCounts = chapters.map((ch) => ch.word_count || 0);
  const totalWords = wordCounts.reduce((sum, w) => sum + w, 0);
  const avgWords = chapters.length > 0 ? Math.round(totalWords / chapters.length) : 0;
  const sd = chapters.length > 1 ? stdDev(wordCounts, avgWords) : 0;
  const cv = avgWords > 0 ? ((sd / avgWords) * 100).toFixed(1) : "0.0";

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
        <Gauge size={16} className="text-indigo-600" />
        写作速度分析
      </h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">平均每章字数</div>
          <div className="text-lg font-bold text-gray-900">{avgWords.toLocaleString()}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">标准差</div>
          <div className="text-lg font-bold text-gray-900">
            {sd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">变异系数</div>
          <div className="text-lg font-bold text-gray-900">{cv}%</div>
          <div className="text-[10px] text-gray-400 mt-0.5">
            {parseFloat(cv) < 30 ? "长度较均匀" : parseFloat(cv) < 60 ? "长度有波动" : "长度差异大"}
          </div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">总章节数</div>
          <div className="text-lg font-bold text-gray-900">{chapters.length}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500">总字数</div>
          <div className="text-lg font-bold text-gray-900">{totalWords.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

function StatusDistribution({ chapters }: { chapters: ChapterInfo[] }) {
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ch of chapters) {
      const s = ch.status || "unknown";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [chapters]);

  const total = chapters.length || 1;

  // Sort by count desc
  const entries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
          <Activity size={16} className="text-indigo-600" />
          章节状态分布
        </h3>
        <div className="text-sm text-gray-400">暂无章节</div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
        <Activity size={16} className="text-indigo-600" />
        章节状态分布
      </h3>
      {/* Horizontal stacked bar */}
      <div className="w-full h-6 rounded-full overflow-hidden flex bg-gray-100 mb-3">
        {entries.map(([status, count]) => {
          const pct = (count / total) * 100;
          return (
            <div
              key={status}
              className={`h-full ${statusColor(status)}`}
              style={{ width: `${pct}%` }}
              title={`${statusLabel(status)}: ${count} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-3">
        {entries.map(([status, count]) => {
          const pct = ((count / total) * 100).toFixed(1);
          return (
            <div key={status} className="flex items-center gap-1.5 text-xs text-gray-600">
              <div className={`w-3 h-3 rounded-sm ${statusColor(status)}`} />
              <span>{statusLabel(status)}</span>
              <span className="text-gray-400">
                {count} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TopCharacters({ chapters }: { chapters: ChapterInfo[] }) {
  const { characters } = useChapterStore();

  const rankings = useMemo(() => {
    const globalCounts: Record<string, number> = {};
    for (const ch of chapters) {
      const text = ch.draft_text || "";
      const mentions = countCharMentions(text, characters);
      for (const [name, count] of Object.entries(mentions)) {
        globalCounts[name] = (globalCounts[name] || 0) + count;
      }
    }
    return Object.entries(globalCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [chapters, characters]);

  if (rankings.length === 0) {
    return (
      <div>
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
          <Users size={16} className="text-indigo-600" />
          最常出现的角色
        </h3>
        <div className="text-sm text-gray-400">
          {chapters.length === 0
            ? "暂无章节数据"
            : characters.length === 0
              ? "暂无角色数据，请先在角色页面创建角色"
              : "正文中暂未检测到角色名出现"}
        </div>
      </div>
    );
  }

  const maxCount = rankings[0]?.[1] || 1;

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
        <Users size={16} className="text-indigo-600" />
        最常出现的角色 (Top {rankings.length})
      </h3>
      <div className="space-y-2">
        {rankings.map(([name, count], idx) => {
          const barWidth = (count / maxCount) * 100;
          return (
            <div key={name} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-4 text-right">{idx + 1}</span>
              <span className="text-sm text-gray-700 w-20 truncate">{name}</span>
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-purple-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">{count}次</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── main page ───

export function WritingAnalytics() {
  const { chapters, characters, fetchChapters, fetchCharacters, loading, error } =
    useChapterStore();

  useEffect(() => {
    fetchChapters();
    fetchCharacters();
  }, [fetchChapters, fetchCharacters]);

  const totalWords = useMemo(
    () => chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0),
    [chapters],
  );
  const finalizedCount = chapters.filter(
    (ch) => ch.status === "finalized" || ch.status === "approved",
  ).length;

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 gap-2">
        <AlertCircle size={18} />
        <span className="text-sm">加载失败: {error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6">
        {/* header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">写作分析</h1>
          <p className="text-sm text-gray-500 mt-1">章节统计、状态分布与角色活跃度</p>
        </div>

        {loading && chapters.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : chapters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <FileText size={40} className="text-gray-300" />
            <p className="text-sm">暂无章节数据</p>
            <p className="text-xs">创建章节后，写作分析数据将在此展示</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-50">
                    <FileText size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">总字数</p>
                    <p className="text-lg font-semibold text-gray-900">
                      {totalWords.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-50">
                    <TrendingUp size={18} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">章节数</p>
                    <p className="text-lg font-semibold text-gray-900">{chapters.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-50">
                    <Activity size={18} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">已定稿</p>
                    <p className="text-lg font-semibold text-gray-900">{finalizedCount}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-50">
                    <Users size={18} className="text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">角色数</p>
                    <p className="text-lg font-semibold text-gray-900">{characters.length}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Two-column: bar chart + status */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <WordCountBarChart chapters={chapters} />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <StatusDistribution chapters={chapters} />
              </div>
            </div>

            {/* Writing speed */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <WritingSpeed chapters={chapters} />
            </div>

            {/* Top characters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <TopCharacters chapters={chapters} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
