import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore } from "../../stores";
import { projectApi } from "../../lib/api";
import {
  Save,
  CheckCircle,
  XCircle,
  FileText,
  Target,
  Layers,
  Minus,
  Plus,
  Tag,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

// ─── Default values for display ───

const DEFAULTS = {
  target_words: 500000,
  target_volumes: 5,
  min_chapter_words: 2000,
  max_chapter_words: 5000,
} as const;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "planning", label: "规划中" },
  { value: "active", label: "连载中" },
  { value: "paused", label: "暂停" },
  { value: "completed", label: "已完结" },
  { value: "archived", label: "已归档" },
];

// ─── Component ───

export function ProjectSettingsDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { project, fetch } = useProjectStore();

  // Editable form state
  const [title, setTitle] = useState("");
  const [targetWords, setTargetWords] = useState<number | "">("");
  const [targetVolumes, setTargetVolumes] = useState<number | "">("");
  const [minChapterWords, setMinChapterWords] = useState<number>(DEFAULTS.min_chapter_words);
  const [maxChapterWords, setMaxChapterWords] = useState<number>(DEFAULTS.max_chapter_words);
  const [status, setStatus] = useState("planning");
  const [genre, setGenre] = useState("");
  const [logline, setLogline] = useState("");

  // Feedback
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  // Sync form state from store
  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setTargetWords(project.target_words ?? "");
      setTargetVolumes(project.target_volumes ?? "");
      setMinChapterWords(project.min_chapter_words);
      setMaxChapterWords(project.max_chapter_words);
      setStatus(project.status);
      setGenre(project.genre_id ?? "");
      setLogline(project.logline ?? "");
    }
  }, [project]);

  // Ensure project data loaded
  useEffect(() => {
    if (projectId && !project) {
      fetch();
    }
  }, [projectId, project, fetch]);

  const showFeedback = (type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      showFeedback("error", "项目名称不能为空");
      return;
    }
    setSaving(true);
    try {
      // Currently the API supports title + status; other fields shown for read/when backend supports them
      await projectApi.update(title.trim(), status);
      // Re-fetch to get latest state
      await fetch();
      showFeedback("success", "设置已保存");
    } catch (e: any) {
      showFeedback("error", `保存失败: ${e}`);
    }
    setSaving(false);
  };

  // Loading state
  if (!project) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-gray-200 rounded w-1/4" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText size={20} className="text-indigo-600" />
          项目设置
        </h2>
        {feedback && (
          <span
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
              feedback.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {feedback.message}
          </span>
        )}
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        {/* Project Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="输入项目名称"
          />
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">项目状态</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Genre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Tag size={14} className="text-gray-400" />
            题材
          </label>
          <input
            type="text"
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="例如: 玄幻, 都市, 科幻"
          />
          <p className="text-xs text-gray-400 mt-1">当前题材ID: {project.genre_id || "未设置"}</p>
        </div>

        {/* Logline */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <MessageSquare size={14} className="text-gray-400" />
            一句话简介 (Logline)
          </label>
          <textarea
            value={logline}
            onChange={(e) => setLogline(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            placeholder="用一句话概括你的故事..."
          />
        </div>

        {/* Target Words */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Target size={14} className="text-gray-400" />
            目标总字数
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={targetWords}
              onChange={(e) =>
                setTargetWords(e.target.value === "" ? "" : parseInt(e.target.value, 10))
              }
              min={0}
              step={10000}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={`默认: ${DEFAULTS.target_words.toLocaleString()}`}
            />
            <span className="text-xs text-gray-400 whitespace-nowrap">
              默认 {DEFAULTS.target_words.toLocaleString()} 字
            </span>
          </div>
        </div>

        {/* Target Volumes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Layers size={14} className="text-gray-400" />
            目标卷数
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={targetVolumes}
              onChange={(e) =>
                setTargetVolumes(e.target.value === "" ? "" : parseInt(e.target.value, 10))
              }
              min={1}
              step={1}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={`默认: ${DEFAULTS.target_volumes}`}
            />
            <span className="text-xs text-gray-400 whitespace-nowrap">
              默认 {DEFAULTS.target_volumes} 卷
            </span>
          </div>
        </div>

        {/* Min Chapter Words */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Minus size={14} className="text-gray-400" />
            单章最少字数
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={minChapterWords}
              onChange={(e) => setMinChapterWords(parseInt(e.target.value, 10) || 0)}
              min={500}
              step={100}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-400 whitespace-nowrap">
              当前: {project.min_chapter_words.toLocaleString()} 字
            </span>
          </div>
        </div>

        {/* Max Chapter Words */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
            <Plus size={14} className="text-gray-400" />
            单章最多字数
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={maxChapterWords}
              onChange={(e) => setMaxChapterWords(parseInt(e.target.value, 10) || 0)}
              min={1000}
              step={100}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-xs text-gray-400 whitespace-nowrap">
              当前: {project.max_chapter_words.toLocaleString()} 字
            </span>
          </div>
        </div>

        {/* Current vs Default Summary */}
        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600 mb-1">当前值与默认值对比</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span>
              目标字数: {project.target_words?.toLocaleString() ?? "未设置"} / 默认{" "}
              {DEFAULTS.target_words.toLocaleString()}
            </span>
            <span>
              目标卷数: {project.target_volumes ?? "未设置"} / 默认 {DEFAULTS.target_volumes}
            </span>
            <span>
              最少字数: {project.min_chapter_words.toLocaleString()} / 默认{" "}
              {DEFAULTS.min_chapter_words.toLocaleString()}
            </span>
            <span>
              最多字数: {project.max_chapter_words.toLocaleString()} / 默认{" "}
              {DEFAULTS.max_chapter_words.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "保存中..." : "保存设置"}
        </button>
        {project && (
          <span className="text-xs text-gray-400">
            最后更新: {new Date(project.updated_at).toLocaleString("zh-CN")}
          </span>
        )}
      </div>
    </div>
  );
}
