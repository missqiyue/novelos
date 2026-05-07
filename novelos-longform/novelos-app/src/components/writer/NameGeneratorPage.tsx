import { useState } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore } from "../../stores";
import {
  User,
  Sparkles,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  Heart,
  Download,
  BookOpen,
  Users,
  UserPlus,
  UserMinus,
  Tag,
} from "lucide-react";

// ─── Genre options ───

const GENRES = [
  { id: "xianxia", label: "仙侠" },
  { id: "wuxia", label: "武侠" },
  { id: "xuanhuan", label: "玄幻" },
  { id: "qihuan", label: "奇幻" },
  { id: "science_fiction", label: "科幻" },
  { id: "dushi", label: "都市" },
  { id: "lishi", label: "历史" },
  { id: "yanqing", label: "言情" },
  { id: "xuanyi", label: "悬疑" },
  { id: "kongbu", label: "恐怖" },
  { id: "junshi", label: "军事" },
  { id: "youxi", label: "游戏" },
  { id: "jingshi", label: "竞技" },
  { id: "qita", label: "其他" },
];

// ─── Role type options ───

const ROLE_TYPES = [
  { id: "protagonist", label: "主角" },
  { id: "antagonist", label: "反派" },
  { id: "supporting", label: "配角" },
  { id: "minor", label: "龙套" },
  { id: "all", label: "全部角色" },
];

// ─── Types ───

interface NameCandidate {
  name: string;
  meaning: string;
  reason: string;
  role?: string;
  id: string;
}

function makeId(): string {
  return `name-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Parse agent output ───

function parseNameResults(content: string, roleLabel: string): NameCandidate[] {
  try {
    const parsed = JSON.parse(content);
    const data = parsed.result || parsed;
    // Handle array of candidates
    if (Array.isArray(data)) {
      return data.map((item: Record<string, string>) => ({
        name: item.name || item.姓名 || item.名字 || "",
        meaning: item.meaning || item.含义 || item.寓意 || "",
        reason: item.reason || item.理由 || item.推荐理由 || "",
        role: item.role || item.角色 || roleLabel,
        id: makeId(),
      }));
    }
    // Handle object with names array
    if (data.names && Array.isArray(data.names)) {
      return data.names.map((item: Record<string, string>) => ({
        name: item.name || item.姓名 || item.名字 || "",
        meaning: item.meaning || item.含义 || item.寓意 || "",
        reason: item.reason || item.理由 || item.推荐理由 || "",
        role: item.role || item.角色 || roleLabel,
        id: makeId(),
      }));
    }
    // Handle object with role-keyed arrays
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key])) {
        return data[key].map((item: Record<string, string>) => ({
          name: item.name || item.姓名 || item.名字 || "",
          meaning: item.meaning || item.含义 || item.寓意 || "",
          reason: item.reason || item.理由 || item.推荐理由 || "",
          role: key,
          id: makeId(),
        }));
      }
    }
    return [];
  } catch {
    // Try to extract names from plain text
    const candidates: NameCandidate[] = [];
    const lines = content.split("\n");
    let currentName = "";
    let currentMeaning = "";
    let currentReason = "";

    for (const line of lines) {
      const nameMatch = line.match(/^(?:推荐名字|名字|姓名|名称)[：:]\s*(.+)/i);
      const meaningMatch = line.match(/^(?:含义|寓意)[：:]\s*(.+)/i);
      const reasonMatch = line.match(/^(?:理由|推荐理由)[：:]\s*(.+)/i);

      if (nameMatch) {
        if (currentName && candidates.length < 10) {
          candidates.push({
            name: currentName,
            meaning: currentMeaning,
            reason: currentReason,
            role: roleLabel,
            id: makeId(),
          });
        }
        currentName = nameMatch[1].trim();
        currentMeaning = "";
        currentReason = "";
      } else if (meaningMatch) {
        currentMeaning = meaningMatch[1].trim();
      } else if (reasonMatch) {
        currentReason = reasonMatch[1].trim();
      }
    }

    // Push last one
    if (currentName && candidates.length < 10) {
      candidates.push({
        name: currentName,
        meaning: currentMeaning,
        reason: currentReason,
        role: roleLabel,
        id: makeId(),
      });
    }

    return candidates;
  }
}

// ─── Component ───

export function NameGeneratorPage() {
  const { projectId } = useParams();
  const { project } = useProjectStore();

  const [genre, setGenre] = useState("");
  const [roleType, setRoleType] = useState("");
  const [requirements, setRequirements] = useState("");
  const [candidates, setCandidates] = useState<NameCandidate[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setRunning(true);

    try {
      const { agentApi } = await import("../../lib/tauri");
      const genreLabel = GENRES.find((g) => g.id === genre)?.label || genre;
      const roleLabel = ROLE_TYPES.find((r) => r.id === roleType)?.label || roleType;

      const result = await agentApi.run("name_generator", {
        genre: genreLabel,
        genre_id: genre,
        role_type: roleType,
        role_label: roleLabel,
        requirements,
        project_id: project?.id || projectId || "",
        book_mode: "longform",
      });

      if (result) {
        const parsed = parseNameResults(result.content, roleLabel);
        setCandidates(parsed);
        if (parsed.length === 0) {
          setError("未能解析出名字结果，请重试");
        }
      }
    } catch (e: any) {
      setError(e?.toString() || "生成名字失败");
    }
    setRunning(false);
  };

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCopyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopiedName(name);
      setTimeout(() => setCopiedName(null), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = name;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedName(name);
      setTimeout(() => setCopiedName(null), 2000);
    }
  };

  const handleExportFavorites = async () => {
    const selectedNames = candidates
      .filter((c) => favorites.has(c.id))
      .map((c) => {
        let text = c.name;
        if (c.meaning) text += ` — ${c.meaning}`;
        if (c.role) text += ` [${c.role}]`;
        return text;
      })
      .join("\n");

    if (!selectedNames) return;

    try {
      await navigator.clipboard.writeText(selectedNames);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = selectedNames;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  const favoritedCount = candidates.filter((c) => favorites.has(c.id)).length;

  const roleIcon = (role: string | undefined) => {
    switch (role) {
      case "protagonist":
      case "主角":
        return <UserPlus size={14} />;
      case "antagonist":
      case "反派":
        return <UserMinus size={14} />;
      case "supporting":
      case "配角":
        return <Users size={14} />;
      case "minor":
      case "龙套":
        return <User size={14} />;
      default:
        return <Tag size={14} />;
    }
  };

  const roleColor = (role: string | undefined): string => {
    switch (role) {
      case "protagonist":
      case "主角":
        return "bg-blue-100 text-blue-700";
      case "antagonist":
      case "反派":
        return "bg-red-100 text-red-700";
      case "supporting":
      case "配角":
        return "bg-green-100 text-green-700";
      case "minor":
      case "龙套":
        return "bg-gray-100 text-gray-600";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <User size={22} className="text-indigo-600" />
          角色名字生成器
        </h1>
        <p className="text-sm text-gray-500 mt-1">根据题材和角色类型，AI 为你推荐匹配的角色名字</p>
      </div>

      {/* Input form */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="space-y-4">
          {/* Genre dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <BookOpen size={14} className="inline mr-1" />
              选择题材
            </label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="">-- 请选择题材 --</option>
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Role type dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Users size={14} className="inline mr-1" />
              角色类型
            </label>
            <select
              value={roleType}
              onChange={(e) => setRoleType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="">-- 请选择角色类型 --</option>
              {ROLE_TYPES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Special requirements */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">特殊要求</label>
            <textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="输入特殊要求，如：名字需要带有五行元素、需要古风感、避免过于常见的名字..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={running || !genre}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                running
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : !genre
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
                  生成名字
                </>
              )}
            </button>
            {!genre && <span className="text-xs text-gray-400">请先选择题材</span>}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!running && !error && candidates.length === 0 && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-lg border border-gray-200">
          <User size={48} className="mx-auto mb-4 text-gray-300" />
          <p>选择题材和角色类型</p>
          <p className="text-sm mt-1">点击"生成名字"获取 AI 推荐的角色名</p>
        </div>
      )}

      {/* Running state with spinner */}
      {running && (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Loader2 size={48} className="mx-auto mb-4 text-indigo-400 animate-spin" />
          <p className="text-gray-500 text-sm">AI 正在为你生成角色名字...</p>
          <p className="text-xs text-gray-400 mt-1">这可能需要几秒钟</p>
        </div>
      )}

      {/* Results */}
      {candidates.length > 0 && (
        <div className="space-y-4">
          {/* Actions bar */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <User size={16} className="text-indigo-600" />
              生成的名字 ({candidates.length})
            </h2>
            {favoritedCount > 0 && (
              <button
                onClick={handleExportFavorites}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors"
              >
                <Download size={14} />
                导出选中名称 ({favoritedCount})
              </button>
            )}
          </div>

          {/* Name cards */}
          <div className="grid gap-3">
            {candidates.map((candidate) => {
              const isFav = favorites.has(candidate.id);
              const isCopied = copiedName === candidate.name;

              return (
                <div
                  key={candidate.id}
                  className={`bg-white rounded-lg border-2 p-4 transition-colors ${
                    isFav
                      ? "border-indigo-300 bg-indigo-50/30"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Name + role badge */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-bold text-gray-900 font-serif">
                          {candidate.name}
                        </span>
                        {candidate.role && (
                          <span
                            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${roleColor(
                              candidate.role,
                            )}`}
                          >
                            {roleIcon(candidate.role)}
                            {candidate.role}
                          </span>
                        )}
                      </div>

                      {/* Meaning */}
                      {candidate.meaning && (
                        <p className="text-sm text-gray-600 mb-1">
                          <span className="text-xs text-gray-400">含义：</span>
                          {candidate.meaning}
                        </p>
                      )}

                      {/* Reason */}
                      {candidate.reason && (
                        <p className="text-xs text-gray-400">
                          <span className="text-gray-400">理由：</span>
                          {candidate.reason}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Favorite toggle */}
                      <button
                        onClick={() => toggleFavorite(candidate.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isFav
                            ? "text-red-500 bg-red-50 hover:bg-red-100"
                            : "text-gray-300 hover:text-red-400 hover:bg-gray-50"
                        }`}
                        title={isFav ? "取消收藏" : "收藏"}
                      >
                        <Heart size={16} fill={isFav ? "currentColor" : "none"} />
                      </button>

                      {/* Copy button */}
                      <button
                        onClick={() => handleCopyName(candidate.name)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isCopied
                            ? "text-green-500 bg-green-50"
                            : "text-gray-300 hover:text-gray-500 hover:bg-gray-50"
                        }`}
                        title="复制名字"
                      >
                        {isCopied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
