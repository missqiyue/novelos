import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore, useChapterStore, useAgentStore } from "../../stores";
import { chapterApi, outlineApi } from "../../lib/api";
import type { ChapterInfo, ChapterTaskInfo } from "../../lib/api";
import { parseOutlineContent, type ChapterOutlineSections } from "../../lib/chapterOutline";
import {
  BookOpen,
  FileText,
  Sparkles,
  Save,
  Loader2,
  AlertTriangle,
  Target,
  Users,
  MessageSquare,
  GitBranch,
  Flag,
  ChevronRight,
  ListOrdered,
  Hash,
  PenLine,
} from "lucide-react";

// ─── Component ───

export function ChapterOutlinePage() {
  const { chapterNumber: paramChapterNumber, projectId } = useParams();
  const inputChapterNumber = paramChapterNumber ? parseInt(paramChapterNumber, 10) : NaN;
  const { project } = useProjectStore();
  const { chapters, currentChapter, selectChapter, fetchChapters } = useChapterStore();
  const { running, lastResult, error: agentError, runAgent } = useAgentStore();

  const [chapter, setChapter] = useState<ChapterInfo | null>(null);
  const [task, setTask] = useState<ChapterTaskInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<ChapterOutlineSections | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Determine which chapter number to use
  const chapterNumber = !isNaN(inputChapterNumber)
    ? inputChapterNumber
    : (currentChapter?.chapter_number ?? chapters[0]?.chapter_number ?? 1);

  // Fetch chapter info and task
  const loadChapterData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchChapters();
      const ch = await chapterApi.getChapter(chapterNumber);
      setChapter(ch);
      await selectChapter(chapterNumber);
    } catch (e: any) {
      // Chapter may not exist yet
      setChapter(null);
    }
    try {
      const tasks = await chapterApi.listTasks();
      const matchingTask = tasks.find((t) => t.chapter_number === chapterNumber);
      setTask(matchingTask || null);
    } catch {
      setTask(null);
    }
    setLoading(false);
  }, [chapterNumber, fetchChapters, selectChapter]);

  useEffect(() => {
    loadChapterData();
  }, [loadChapterData]);

  // Handle generate outline
  const handleGenerate = async () => {
    setSaved(false);
    setError(null);
    const result = await runAgent("chapter_outline", {
      chapter_number: String(chapterNumber),
      project_id: project?.id || "",
      book_mode: "longform",
    });

    if (result) {
      const parsed = parseOutlineContent(result.content);
      setSections(parsed);
      if (!parsed) {
        setError("无法解析大纲内容，请重试");
      }
    }
  };

  // Handle save outline
  const handleSave = async () => {
    if (!sections) return;
    setSaving(true);
    setError(null);
    try {
      await outlineApi.saveChapterOutline(chapterNumber, JSON.stringify(sections), task?.id);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.toString() || "保存失败");
    }
    setSaving(false);
  };

  // ─── Render: Loading ───
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Render: Empty / no chapter ───
  if (!chapter && !loading) {
    return (
      <div className="p-6">
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={48} className="mx-auto mb-4" />
          <p>暂无章节数据</p>
          <p className="text-sm mt-1">请先创建章节或选择有效的章节编号</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch size={22} className="text-indigo-600" />
            章节大纲生成
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            第{chapterNumber}章{chapter?.title ? `: ${chapter.title}` : ""}
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={running}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            running
              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
        >
          {running ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles size={16} />
              生成大纲
            </>
          )}
        </button>
      </div>

      {/* Agent error */}
      {agentError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{agentError}</div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Current task card */}
      {task && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-3">
            <Target size={16} className="text-amber-500" />
            当前任务卡片
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="text-gray-400 shrink-0">目标：</span>
              <span className="text-gray-700">{task.objective || "未设置"}</span>
            </div>
            {task.ending_hook && (
              <div className="flex items-start gap-2">
                <span className="text-gray-400 shrink-0">结尾钩子：</span>
                <span className="text-gray-700">{task.ending_hook}</span>
              </div>
            )}
            {task.required_hooks && (
              <div className="flex items-start gap-2">
                <span className="text-gray-400 shrink-0">必要钩子：</span>
                <span className="text-gray-700">
                  {tryParseJsonArray(task.required_hooks).join("、") || task.required_hooks}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No task warning */}
      {!task && !loading && (
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            当前章节尚无任务卡片。建议先设置章节目标，以便生成更精准的大纲。
          </div>
        </div>
      )}

      {/* Empty state: no sections yet */}
      {!sections && !running && !agentError && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-lg border border-gray-200">
          <Sparkles size={48} className="mx-auto mb-4 text-gray-300" />
          <p>点击"生成大纲"按钮，AI 将分析任务卡片和上下文</p>
          <p className="text-sm mt-1">自动生成本章节的详细大纲</p>
        </div>
      )}

      {/* Outline sections */}
      {sections && (
        <div className="space-y-4">
          {/* 开篇场景 */}
          <SectionCard
            icon={Play}
            title="开篇场景"
            color="text-blue-600"
            bgColor="bg-blue-50"
            iconColor="text-blue-600"
          >
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {sections.开篇场景 || "未生成"}
            </p>
          </SectionCard>

          {/* 情节点列表 */}
          <SectionCard
            icon={ListOrdered}
            title="情节点列表"
            color="text-purple-600"
            bgColor="bg-purple-50"
            iconColor="text-purple-600"
          >
            {sections.情节点列表.length === 0 ? (
              <p className="text-sm text-gray-400">未生成</p>
            ) : (
              <div className="space-y-3">
                {sections.情节点列表.map((point, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold shrink-0 mt-0.5">
                      {point.order || i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800">{point.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {point.characters_involved.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Users size={12} />
                            {point.characters_involved.join("、")}
                          </span>
                        )}
                        {point.estimated_words > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <PenLine size={12} />约{point.estimated_words}字
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* 角色出场 */}
          <SectionCard
            icon={Users}
            title="角色出场"
            color="text-green-600"
            bgColor="bg-green-50"
            iconColor="text-green-600"
          >
            {sections.角色出场.length === 0 ? (
              <p className="text-sm text-gray-400">未生成</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sections.角色出场.map((name, i) => (
                  <span
                    key={i}
                    className="px-3 py-1 text-sm bg-green-50 border border-green-200 rounded-full text-green-700"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>

          {/* 关键对话 */}
          <SectionCard
            icon={MessageSquare}
            title="关键对话"
            color="text-amber-600"
            bgColor="bg-amber-50"
            iconColor="text-amber-600"
          >
            {sections.关键对话.length === 0 ? (
              <p className="text-sm text-gray-400">未生成</p>
            ) : (
              <ul className="space-y-1.5">
                {sections.关键对话.map((dialogue, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <ChevronRight size={14} className="text-amber-400 shrink-0 mt-0.5" />
                    {dialogue}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* 转折点 */}
          <SectionCard
            icon={Flag}
            title="转折点"
            color="text-red-600"
            bgColor="bg-red-50"
            iconColor="text-red-600"
          >
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {sections.转折点 || "未生成"}
            </p>
          </SectionCard>

          {/* 章末状态 */}
          <SectionCard
            icon={Hash}
            title="章末状态"
            color="text-indigo-600"
            bgColor="bg-indigo-50"
            iconColor="text-indigo-600"
          >
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {sections.章末状态 || "未生成"}
            </p>
          </SectionCard>

          {/* Save button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                saved
                  ? "bg-green-100 text-green-700 cursor-default"
                  : saving
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-white border border-gray-200 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
              }`}
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  保存中...
                </>
              ) : saved ? (
                <>
                  <Save size={16} />
                  已保存
                </>
              ) : (
                <>
                  <Save size={16} />
                  保存大纲
                </>
              )}
            </button>
            {saved && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                大纲已保存到数据库
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper: try parse JSON array ───

function tryParseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Section card sub-component ───

function SectionCard({
  icon: Icon,
  title,
  color,
  bgColor,
  iconColor,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  color: string;
  bgColor: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 ${bgColor} border-b border-gray-100`}>
        <Icon size={16} className={iconColor} />
        <h3 className={`text-sm font-medium ${color}`}>{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Play icon (not in lucide-react, create inline) ───

function Play({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
