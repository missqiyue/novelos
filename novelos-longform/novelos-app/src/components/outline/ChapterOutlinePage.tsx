import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore, useChapterStore, useAgentStore } from "../../stores";
import { chapterApi, outlineApi } from "../../lib/api";
import type { ChapterInfo, ChapterTaskInfo } from "../../lib/api";
import {
  emptyChapterOutlineSections,
  parseOutlineContent,
  serializeOutlineContent,
  type ChapterOutlineSections,
  type PlotPoint,
} from "../../lib/chapterOutline";
import {
  BookOpen,
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
  Plus,
  Trash2,
} from "lucide-react";

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <Icon size={16} className="text-indigo-600" />
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function PlotPointEditor({
  point,
  index,
  onChange,
  onRemove,
}: {
  point: PlotPoint;
  index: number;
  onChange: (next: PlotPoint) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">情节点 {index + 1}</span>
        <button onClick={onRemove} className="text-xs text-red-500 hover:text-red-600">
          删除
        </button>
      </div>
      <input
        value={point.order}
        onChange={(e) => onChange({ ...point, order: Number(e.target.value) || index + 1 })}
        type="number"
        className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
      />
      <textarea
        value={point.description}
        onChange={(e) => onChange({ ...point, description: e.target.value })}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        rows={3}
      />
      <input
        value={point.characters_involved.join("、")}
        onChange={(e) =>
          onChange({
            ...point,
            characters_involved: e.target.value
              .split(/[、,，\n]/)
              .map((s) => s.trim())
              .filter(Boolean),
          })
        }
        placeholder="角色（逗号/换行分隔）"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      />
      <input
        value={point.estimated_words || ""}
        onChange={(e) => onChange({ ...point, estimated_words: Number(e.target.value) || 0 })}
        type="number"
        placeholder="约字数"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}

function OutlineListEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <button
          onClick={() => onChange([...values, ""])}
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
        >
          <Plus size={12} />
          添加
        </button>
      </div>
      <div className="space-y-2">
        {values.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-400 text-center">
            暂无内容
          </div>
        ) : (
          values.map((item, index) => (
            <div key={index} className="flex items-start gap-2">
              <textarea
                value={item}
                onChange={(e) => {
                  const next = [...values];
                  next[index] = e.target.value;
                  onChange(next);
                }}
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                rows={2}
              />
              <button
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function ChapterOutlinePage() {
  const { chapterNumber: paramChapterNumber } = useParams();
  const inputChapterNumber = paramChapterNumber ? parseInt(paramChapterNumber, 10) : NaN;
  const { project } = useProjectStore();
  const { chapters, currentChapter, selectChapter, fetchChapters } = useChapterStore();
  const { running, error: agentError, runAgent } = useAgentStore();

  const [chapter, setChapter] = useState<ChapterInfo | null>(null);
  const [task, setTask] = useState<ChapterTaskInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<ChapterOutlineSections>(emptyChapterOutlineSections());
  const [hasOutline, setHasOutline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const chapterNumber = !isNaN(inputChapterNumber)
    ? inputChapterNumber
    : (currentChapter?.chapter_number ?? chapters[0]?.chapter_number ?? 1);

  const loadChapterData = async () => {
    setLoading(true);
    setError(null);
    try {
      await fetchChapters();
      const ch = await chapterApi.getChapter(chapterNumber);
      setChapter(ch);
      await selectChapter(chapterNumber);
    } catch (e: any) {
      setChapter(null);
    }

    try {
      const tasks = await chapterApi.listTasks();
      const matchingTask = tasks.find((t) => t.chapter_number === chapterNumber);
      setTask(matchingTask || null);
    } catch {
      setTask(null);
    }

    try {
      const outline = await outlineApi.getLatestChapterOutline(chapterNumber);
      if (outline) {
        const parsed = parseOutlineContent(outline.content_json);
        if (parsed) {
          setSections(parsed);
          setHasOutline(true);
        } else {
          setSections(emptyChapterOutlineSections());
          setHasOutline(false);
        }
      } else {
        setSections(emptyChapterOutlineSections());
        setHasOutline(false);
      }
    } catch {
      setSections(emptyChapterOutlineSections());
      setHasOutline(false);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadChapterData();
  }, [chapterNumber]);

  const updatePoint = (index: number, next: PlotPoint) => {
    setSections((prev) => {
      const points = [...prev.情节点列表];
      points[index] = next;
      return { ...prev, 情节点列表: points };
    });
  };

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
      if (parsed) {
        setSections(parsed);
        setHasOutline(true);
      } else {
        setError("无法解析大纲内容，请重试");
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await outlineApi.saveChapterOutline(
        chapterNumber,
        serializeOutlineContent(sections),
        task?.id || undefined,
      );
      setHasOutline(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setError(e?.toString() || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const chapterTitle = useMemo(
    () => (chapter?.title ? `: ${chapter.title}` : ""),
    [chapter?.title],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

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
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch size={22} className="text-indigo-600" />
            章节大纲
          </h1>
          <p className="text-sm text-gray-500 mt-1">第{chapterNumber}章{chapterTitle}</p>
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
          {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {running ? "生成中..." : "重新生成"}
        </button>
      </div>

      {agentError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{agentError}</div>
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {task && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
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
                <span className="text-gray-700">{task.required_hooks}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!task && !loading && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-700">
            当前章节尚无任务卡片。建议先设置章节目标，以便生成更精准的大纲。
          </div>
        </div>
      )}

      <div className="space-y-4">
        <SectionCard icon={BookOpen} title="开篇场景">
          <textarea
            value={sections.开篇场景}
            onChange={(e) => setSections((p) => ({ ...p, 开篇场景: e.target.value }))}
            rows={4}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </SectionCard>

        <SectionCard icon={ListOrdered} title="情节点列表">
          <div className="space-y-3">
            {sections.情节点列表.map((point, index) => (
              <PlotPointEditor
                key={index}
                point={point}
                index={index}
                onChange={(next) => updatePoint(index, next)}
                onRemove={() =>
                  setSections((prev) => ({
                    ...prev,
                    情节点列表: prev.情节点列表.filter((_, i) => i !== index),
                  }))
                }
              />
            ))}
            <button
              onClick={() =>
                setSections((prev) => ({
                  ...prev,
                  情节点列表: [
                    ...prev.情节点列表,
                    { order: prev.情节点列表.length + 1, description: "", characters_involved: [], estimated_words: 0 },
                  ],
                }))
              }
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
            >
              <Plus size={14} />
              添加情节点
            </button>
          </div>
        </SectionCard>

        <SectionCard icon={Users} title="角色出场">
          <OutlineListEditor
            label="角色"
            values={sections.角色出场}
            onChange={(next) => setSections((p) => ({ ...p, 角色出场: next }))}
          />
        </SectionCard>

        <SectionCard icon={MessageSquare} title="关键对话">
          <OutlineListEditor
            label="对话"
            values={sections.关键对话}
            onChange={(next) => setSections((p) => ({ ...p, 关键对话: next }))}
          />
        </SectionCard>

        <SectionCard icon={Flag} title="转折点">
          <textarea
            value={sections.转折点}
            onChange={(e) => setSections((p) => ({ ...p, 转折点: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </SectionCard>

        <SectionCard icon={Hash} title="章末状态">
          <textarea
            value={sections.章末状态}
            onChange={(e) => setSections((p) => ({ ...p, 章末状态: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
          />
        </SectionCard>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              saved
                ? "bg-green-100 text-green-700 cursor-default"
                : saving
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-white border border-gray-200 text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
            }`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "保存中..." : saved ? "已保存" : "保存大纲"}
          </button>
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <Check size={16} />
              大纲已保存到数据库
            </span>
          )}
          {hasOutline && (
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <Sparkles size={14} />
              已加载已有大纲
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
