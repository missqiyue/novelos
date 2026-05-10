import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FileText, Loader2, PenLine, Plus, RefreshCw } from "lucide-react";
import { chapterApi } from "../../lib/api";
import { useChapterStore } from "../../stores";

const statusLabels: Record<string, string> = {
  task_ready: "任务就绪",
  drafting: "草稿中",
  draft_done: "草稿完成",
  draft_generated: "草稿已生成",
  reviewing: "审阅中",
  compile_failed: "编译失败",
  approved: "已批准",
  finalized: "已定稿",
  archived: "已归档",
};

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function ChapterListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { chapters, fetchChapters, loading, error } = useChapterStore();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  const nextChapterNumber = useMemo(() => {
    const max = chapters.reduce((acc, chapter) => Math.max(acc, chapter.chapter_number), 0);
    return max + 1;
  }, [chapters]);

  const openChapter = (chapterNumber: number) => {
    navigate(`/project/${projectId}/chapter/${chapterNumber}`);
  };

  const handleCreateChapter = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const created = await chapterApi.createChapter(nextChapterNumber, `第${nextChapterNumber}章`);
      await fetchChapters();
      openChapter(created.chapter_number);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-auto bg-gray-50">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              <FileText size={22} className="text-indigo-600" />
              章节总览
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              查看所有章节状态，点击任意章节进入写作工作台。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchChapters()}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              刷新
            </button>
            <button
              onClick={handleCreateChapter}
              disabled={creating}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              写一章
            </button>
          </div>
        </div>

        {(error || createError) && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {createError || error}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="grid grid-cols-[90px_1fr_110px_100px_180px] border-b border-gray-100 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500">
            <span>章节</span>
            <span>标题</span>
            <span>状态</span>
            <span>字数</span>
            <span>更新时间</span>
          </div>
          {loading && chapters.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              正在加载章节
            </div>
          ) : chapters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <PenLine size={28} className="mb-3 text-indigo-500" />
              <p className="text-sm font-medium text-gray-800">还没有章节</p>
              <p className="mt-1 text-sm text-gray-500">点击“写一章”创建第 1 章。</p>
            </div>
          ) : (
            chapters.map((chapter) => (
              <button
                key={chapter.id}
                onClick={() => openChapter(chapter.chapter_number)}
                className="grid w-full grid-cols-[90px_1fr_110px_100px_180px] items-center border-b border-gray-100 px-4 py-3 text-left text-sm last:border-b-0 hover:bg-indigo-50"
              >
                <span className="font-medium text-gray-900">第{chapter.chapter_number}章</span>
                <span className="truncate text-gray-800">{chapter.title || "未命名章节"}</span>
                <span className="text-gray-600">
                  {statusLabels[chapter.status] || chapter.status}
                </span>
                <span className="text-gray-500">{chapter.word_count ?? 0}</span>
                <span className="text-xs text-gray-500">{formatTime(chapter.updated_at)}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
