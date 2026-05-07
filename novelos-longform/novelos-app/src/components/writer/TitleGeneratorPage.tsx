import { useState } from "react";
import { useParams } from "react-router-dom";
import { useProjectStore } from "../../stores";
import {
  BookOpen,
  Sparkles,
  Check,
  Loader2,
  AlertTriangle,
  Shield,
  Star,
  FileText,
  Swords,
  Lightbulb,
  Bookmark,
  ExternalLink,
} from "lucide-react";

// ─── Types ───

interface TitleCandidate {
  title: string;
  approach: string; // 命名思路
  reason: string; // 适用理由
  collisionRisk: string; // "low" | "medium" | "high"
  id: string;
}

function makeId(): string {
  return `title-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Collision risk config ───

const riskConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  low: {
    label: "低风险",
    color: "bg-green-100 text-green-700 border-green-200",
    icon: <Shield size={12} />,
  },
  medium: {
    label: "中风险",
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
    icon: <AlertTriangle size={12} />,
  },
  high: {
    label: "高风险",
    color: "bg-red-100 text-red-700 border-red-200",
    icon: <AlertTriangle size={12} />,
  },
  unknown: {
    label: "未知",
    color: "bg-gray-100 text-gray-500 border-gray-200",
    icon: <Shield size={12} />,
  },
};

// ─── Parse agent output ───

function parseTitleResults(content: string): TitleCandidate[] {
  try {
    const parsed = JSON.parse(content);
    const data = parsed.result || parsed;

    // Handle array of candidates
    if (Array.isArray(data)) {
      return data.map((item: Record<string, string>) => ({
        title: item.title || item.书名 || item.标题 || "",
        approach: item.approach || item.命名思路 || item.命名方式 || "",
        reason: item.reason || item.适用理由 || item.推荐理由 || "",
        collisionRisk: (
          item.collision_risk ||
          item.collisionRisk ||
          item.碰撞风险 ||
          "unknown"
        ).toLowerCase(),
        id: makeId(),
      }));
    }

    // Handle object with titles array
    if (data.titles && Array.isArray(data.titles)) {
      return data.titles.map((item: Record<string, string>) => ({
        title: item.title || item.书名 || item.标题 || "",
        approach: item.approach || item.命名思路 || item.命名方式 || "",
        reason: item.reason || item.适用理由 || item.推荐理由 || "",
        collisionRisk: (
          item.collision_risk ||
          item.collisionRisk ||
          item.碰撞风险 ||
          "unknown"
        ).toLowerCase(),
        id: makeId(),
      }));
    }

    return [];
  } catch {
    // Try to extract from plain text
    const candidates: TitleCandidate[] = [];
    const lines = content.split("\n");
    let currentTitle = "";
    let currentApproach = "";
    let currentReason = "";
    let currentRisk = "unknown";

    for (const line of lines) {
      const titleMatch = line.match(/^(?:书名|标题|推荐书名|候选书名)[：:]\s*(.+)/i);
      const approachMatch = line.match(/^(?:命名思路|命名方式|命名策略)[：:]\s*(.+)/i);
      const reasonMatch = line.match(/^(?:适用理由|推荐理由|理由)[：:]\s*(.+)/i);
      const riskMatch = line.match(/^(?:碰撞风险|重名风险)[：:]\s*(.+)/i);

      if (titleMatch) {
        if (currentTitle && candidates.length < 10) {
          candidates.push({
            title: currentTitle,
            approach: currentApproach,
            reason: currentReason,
            collisionRisk: currentRisk,
            id: makeId(),
          });
        }
        currentTitle = titleMatch[1].trim();
        currentApproach = "";
        currentReason = "";
        currentRisk = "unknown";
      } else if (approachMatch) {
        currentApproach = approachMatch[1].trim();
      } else if (reasonMatch) {
        currentReason = reasonMatch[1].trim();
      } else if (riskMatch) {
        const risk = riskMatch[1].trim().toLowerCase();
        if (risk.includes("低") || risk.includes("low")) currentRisk = "low";
        else if (risk.includes("中") || risk.includes("med")) currentRisk = "medium";
        else if (risk.includes("高") || risk.includes("high")) currentRisk = "high";
      }
    }

    if (currentTitle && candidates.length < 10) {
      candidates.push({
        title: currentTitle,
        approach: currentApproach,
        reason: currentReason,
        collisionRisk: currentRisk,
        id: makeId(),
      });
    }

    return candidates;
  }
}

// ─── Component ───

export function TitleGeneratorPage() {
  const { projectId } = useParams();
  const { project, updateProject } = useProjectStore();

  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState("");
  const [coreConflict, setCoreConflict] = useState("");
  const [candidates, setCandidates] = useState<TitleCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedTitle, setAppliedTitle] = useState<string | null>(null);

  const handleGenerate = async () => {
    setError(null);
    setSelectedId(null);
    setAppliedTitle(null);
    setRunning(true);

    try {
      const { agentApi } = await import("../../lib/tauri");

      const result = await agentApi.run("book_title", {
        description,
        genre,
        core_conflict: coreConflict,
        project_id: project?.id || projectId || "",
        book_mode: "longform",
      });

      if (result) {
        const parsed = parseTitleResults(result.content);
        setCandidates(parsed);
        if (parsed.length === 0) {
          setError("未能解析出书名结果，请重试");
        }
      }
    } catch (e: any) {
      setError(e?.toString() || "生成书名失败");
    }
    setRunning(false);
  };

  const handleApplyTitle = async () => {
    if (!selectedId) return;
    const candidate = candidates.find((c) => c.id === selectedId);
    if (!candidate) return;

    setApplying(true);
    try {
      await updateProject(candidate.title);
      setAppliedTitle(candidate.title);
    } catch (e: any) {
      setError(e?.toString() || "更新书名失败");
    }
    setApplying(false);
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedId);

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen size={22} className="text-indigo-600" />
          书名生成器
        </h1>
        <p className="text-sm text-gray-500 mt-1">输入作品描述和核心冲突，AI 为你推荐匹配的书名</p>
      </div>

      {/* Input form */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="space-y-4">
          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <FileText size={14} className="inline mr-1" />
              作品描述
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简单描述你的作品，如：一个被家族抛弃的少年在秘境中获得上古传承，从此踏上逆天改命的修仙之路..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Genre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Bookmark size={14} className="inline mr-1" />
              题材类型
            </label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="如：修仙、都市、悬疑、科幻..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Core conflict */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <Swords size={14} className="inline mr-1" />
              核心冲突
            </label>
            <input
              type="text"
              value={coreConflict}
              onChange={(e) => setCoreConflict(e.target.value)}
              placeholder="如：废材逆袭、正邪对立、爱恨纠葛..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={running || !description.trim()}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                running
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : !description.trim()
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
                  生成书名
                </>
              )}
            </button>
            {!description.trim() && <span className="text-xs text-gray-400">请先输入作品描述</span>}
          </div>
        </div>
      </div>

      {/* Success notification */}
      {appliedTitle && (
        <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <Check size={16} className="text-green-500 shrink-0" />
          <div className="text-sm text-green-700">已将书名更新为「{appliedTitle}」</div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!running && !error && candidates.length === 0 && !appliedTitle && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-lg border border-gray-200">
          <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
          <p>输入作品描述和核心冲突</p>
          <p className="text-sm mt-1">点击"生成书名"获取 AI 推荐的书名候选</p>
        </div>
      )}

      {/* Running state */}
      {running && (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <Loader2 size={48} className="mx-auto mb-4 text-indigo-400 animate-spin" />
          <p className="text-gray-500 text-sm">AI 正在为你生成书名...</p>
          <p className="text-xs text-gray-400 mt-1">这可能需要几秒钟</p>
        </div>
      )}

      {/* Results */}
      {candidates.length > 0 && (
        <div className="space-y-4">
          {/* Actions bar */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Lightbulb size={16} className="text-indigo-600" />
              候选书名 ({candidates.length})
            </h2>
            {selectedCandidate && (
              <button
                onClick={handleApplyTitle}
                disabled={applying}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  applying
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                {applying ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    应用中...
                  </>
                ) : (
                  <>
                    <Check size={14} />
                    使用「{selectedCandidate.title}」
                  </>
                )}
              </button>
            )}
          </div>

          {/* Current project title reference */}
          {project?.title && (
            <div className="text-xs text-gray-400 flex items-center gap-1.5">
              <BookOpen size={12} />
              当前书名：{project.title}
            </div>
          )}

          {/* Title cards */}
          <div className="grid gap-3">
            {candidates.map((candidate) => {
              const isSelected = selectedId === candidate.id;
              const risk = riskConfig[candidate.collisionRisk] || riskConfig.unknown;

              return (
                <div
                  key={candidate.id}
                  onClick={() => setSelectedId(isSelected ? null : candidate.id)}
                  className={`bg-white rounded-lg border-2 p-4 cursor-pointer transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/30 shadow-sm"
                      : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Title + selected indicator */}
                      <div className="flex items-center gap-2 mb-2">
                        <span
                          className={`text-xl font-bold font-serif ${
                            isSelected ? "text-indigo-700" : "text-gray-900"
                          }`}
                        >
                          {candidate.title}
                        </span>
                        {isSelected && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 font-medium">
                            已选择
                          </span>
                        )}
                      </div>

                      {/* Approach (命名思路) */}
                      {candidate.approach && (
                        <div className="flex items-start gap-2 mb-1.5">
                          <Lightbulb size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-xs font-medium text-gray-500">命名思路：</span>
                            <span className="text-sm text-gray-700">{candidate.approach}</span>
                          </div>
                        </div>
                      )}

                      {/* Reason (适用理由) */}
                      {candidate.reason && (
                        <div className="flex items-start gap-2">
                          <Star size={14} className="text-yellow-500 shrink-0 mt-0.5" />
                          <div>
                            <span className="text-xs font-medium text-gray-500">适用理由：</span>
                            <span className="text-sm text-gray-700">{candidate.reason}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Collision risk badge */}
                    <div
                      className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${risk.color}`}
                    >
                      {risk.icon}
                      {risk.label}
                    </div>
                  </div>

                  {/* Quick apply button per card */}
                  {isSelected && (
                    <div className="mt-3 pt-3 border-t border-indigo-100 flex items-center justify-end">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyTitle();
                        }}
                        disabled={applying}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {applying ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <ExternalLink size={12} />
                        )}
                        {applying ? "应用中..." : "使用此书名"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
