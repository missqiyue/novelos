import { useEffect, useMemo, useState } from "react";
import { useChapterStore } from "../../stores";
import type { ChapterInfo, CharacterInfo } from "../../lib/api";
import {
  GitCompare,
  ArrowLeftRight,
  FileText,
  Users,
  AlertCircle,
  Loader2,
  Gauge,
  Hash,
} from "lucide-react";

// ─── helpers ───

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

function statusColor(status: string): string {
  const m: Record<string, string> = {
    finalized: "text-green-700 bg-green-100",
    approved: "text-green-700 bg-green-100",
    drafting: "text-yellow-700 bg-yellow-100",
    draft_done: "text-blue-700 bg-blue-100",
    draft_generated: "text-blue-700 bg-blue-100",
    reviewing: "text-purple-700 bg-purple-100",
    task_ready: "text-gray-600 bg-gray-100",
    compile_failed: "text-red-700 bg-red-100",
    review_rejected: "text-red-700 bg-red-100",
  };
  return m[status] || "text-gray-600 bg-gray-100";
}

function extractCharNames(text: string, characters: CharacterInfo[]): string[] {
  if (!text) return [];
  const names = new Set<string>();
  for (const ch of characters) {
    const escaped = ch.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    if (regex.test(text)) {
      names.add(ch.name);
    }
  }
  return [...names];
}

function textPreview(text: string | null | undefined, maxLen = 200): string {
  const src = text || "";
  return src.length > maxLen ? src.slice(0, maxLen) + "..." : src;
}

// ─── sub-components ───

function ChapterCard({
  label,
  chapter,
  characters,
  otherWords,
}: {
  label: string;
  chapter: ChapterInfo | null;
  characters: CharacterInfo[];
  otherWords: number;
}) {
  if (!chapter) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex items-center justify-center h-64">
        <span className="text-sm text-gray-400">请选择一个章节</span>
      </div>
    );
  }

  const words = chapter.word_count || 0;
  const diff = otherWords > 0 ? words - otherWords : 0;
  const charNames = extractCharNames(chapter.draft_text || chapter.final_text || "", characters);
  const preview = textPreview(chapter.draft_text || chapter.final_text || "", 200);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">第{chapter.chapter_number}章</h3>
          {chapter.title && <p className="text-xs text-gray-500 mt-0.5">{chapter.title}</p>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(chapter.status)}`}>
          {statusLabel(chapter.status)}
        </span>
      </div>

      {/* Word count */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <Gauge size={12} />
          字数统计
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">{words.toLocaleString()} 字</span>
          {diff !== 0 && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                diff > 0 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
              }`}
            >
              {diff > 0 ? "+" : ""}
              {diff.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {/* Text preview */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <FileText size={12} />
          内容预览
        </div>
        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-28 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
          {preview || "(无内容)"}
        </div>
      </div>

      {/* Characters */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
          <Users size={12} />
          出现的角色 ({charNames.length})
        </div>
        {charNames.length === 0 ? (
          <span className="text-xs text-gray-400">未检测到角色名</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {charNames.map((name) => (
              <span
                key={name}
                className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterOverlap({
  chapterA,
  chapterB,
  characters,
}: {
  chapterA: ChapterInfo | null;
  chapterB: ChapterInfo | null;
  characters: CharacterInfo[];
}) {
  const aChars = chapterA
    ? extractCharNames(chapterA.draft_text || chapterA.final_text || "", characters)
    : [];
  const bChars = chapterB
    ? extractCharNames(chapterB.draft_text || chapterB.final_text || "", characters)
    : [];

  const both = aChars.filter((n) => bChars.includes(n));
  const onlyA = aChars.filter((n) => !bChars.includes(n));
  const onlyB = bChars.filter((n) => !aChars.includes(n));

  if (!chapterA || !chapterB) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 text-sm text-gray-400">
        请选择两个章节以查看角色重叠
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
        <Users size={16} className="text-indigo-600" />
        角色重叠分析
      </h3>

      <div className="grid grid-cols-3 gap-4">
        {/* Both */}
        <div>
          <div className="text-xs text-gray-500 mb-1 font-medium">共同出现 ({both.length})</div>
          <div className="flex flex-wrap gap-1">
            {both.length === 0 ? (
              <span className="text-xs text-gray-400">无</span>
            ) : (
              both.map((name) => (
                <span
                  key={name}
                  className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600"
                >
                  {name}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Only A */}
        <div>
          <div className="text-xs text-gray-500 mb-1 font-medium">仅A ({onlyA.length})</div>
          <div className="flex flex-wrap gap-1">
            {onlyA.length === 0 ? (
              <span className="text-xs text-gray-400">无</span>
            ) : (
              onlyA.map((name) => (
                <span
                  key={name}
                  className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600"
                >
                  {name}
                </span>
              ))
            )}
          </div>
        </div>

        {/* Only B */}
        <div>
          <div className="text-xs text-gray-500 mb-1 font-medium">仅B ({onlyB.length})</div>
          <div className="flex flex-wrap gap-1">
            {onlyB.length === 0 ? (
              <span className="text-xs text-gray-400">无</span>
            ) : (
              onlyB.map((name) => (
                <span
                  key={name}
                  className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600"
                >
                  {name}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── main page ───

export function ChapterComparePage() {
  const { chapters, characters, fetchChapters, fetchCharacters, loading, error } =
    useChapterStore();

  const [chapterANum, setChapterANum] = useState<number | null>(null);
  const [chapterBNum, setChapterBNum] = useState<number | null>(null);

  useEffect(() => {
    fetchChapters();
    fetchCharacters();
  }, [fetchChapters, fetchCharacters]);

  const chapterA = chapters.find((ch) => ch.chapter_number === chapterANum) || null;
  const chapterB = chapters.find((ch) => ch.chapter_number === chapterBNum) || null;

  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.chapter_number - b.chapter_number),
    [chapters],
  );

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
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitCompare size={22} className="text-indigo-600" />
            章节对比
          </h1>
          <p className="text-sm text-gray-500 mt-1">选择两个章节进行字数、状态、角色出现情况对比</p>
        </div>

        {loading && chapters.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : chapters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <ArrowLeftRight size={40} className="text-gray-300" />
            <p className="text-sm">暂无章节数据</p>
            <p className="text-xs">创建至少两个章节后才能进行对比</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Chapter selectors */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">章节 A</label>
                <select
                  value={chapterANum ?? ""}
                  onChange={(e) => setChapterANum(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- 选择章节 --</option>
                  {sortedChapters.map((ch) => (
                    <option key={ch.id} value={ch.chapter_number}>
                      第{ch.chapter_number}章 {ch.title || ""} ({ch.word_count || 0}字)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">章节 B</label>
                <select
                  value={chapterBNum ?? ""}
                  onChange={(e) => setChapterBNum(e.target.value ? Number(e.target.value) : null)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- 选择章节 --</option>
                  {sortedChapters.map((ch) => (
                    <option key={ch.id} value={ch.chapter_number}>
                      第{ch.chapter_number}章 {ch.title || ""} ({ch.word_count || 0}字)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChapterCard
                label="A"
                chapter={chapterA}
                characters={characters}
                otherWords={chapterB?.word_count || 0}
              />
              <ChapterCard
                label="B"
                chapter={chapterB}
                characters={characters}
                otherWords={chapterA?.word_count || 0}
              />
            </div>

            {/* Word count diff summary */}
            {chapterA && chapterB && (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2 mb-3">
                  <Hash size={16} className="text-indigo-600" />
                  字数对比
                </h3>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-600">
                    A: {(chapterA.word_count || 0).toLocaleString()} 字
                  </span>
                  <span className="text-gray-400">vs</span>
                  <span className="text-gray-600">
                    B: {(chapterB.word_count || 0).toLocaleString()} 字
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-500">
                    差值:{" "}
                    <span
                      className={`font-medium ${
                        (chapterA.word_count || 0) >= (chapterB.word_count || 0)
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {Math.abs(
                        (chapterA.word_count || 0) - (chapterB.word_count || 0),
                      ).toLocaleString()}{" "}
                      字
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Character overlap */}
            <CharacterOverlap chapterA={chapterA} chapterB={chapterB} characters={characters} />
          </div>
        )}
      </div>
    </div>
  );
}
