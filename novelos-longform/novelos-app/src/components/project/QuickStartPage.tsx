import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgentStore, useBookshelfStore, useProjectStore } from "../../stores";
import { projectApi } from "../../lib/api";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, Zap, BookOpen } from "lucide-react";

const steps = [
  { key: "desc", label: "作品描述" },
  { key: "genre", label: "题材匹配" },
  { key: "create", label: "创建项目" },
];

interface GenreCandidate {
  genre_id: string;
  genre_name: string;
  match_score: number;
  reason: string;
  typical_features: string[];
}

function parseJsonSafe(text: string): any {
  try {
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function QuickStartPage() {
  const navigate = useNavigate();
  const { runAgent, running } = useAgentStore();
  const { addProject } = useBookshelfStore();
  const { switchProject } = useProjectStore();

  const [currentStep, setCurrentStep] = useState(0);

  // Step 1
  const [description, setDescription] = useState("");

  // Step 2
  const [genreResult, setGenreResult] = useState("");
  const [genreCandidates, setGenreCandidates] = useState<GenreCandidate[]>([]);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [selectedGenreId, setSelectedGenreId] = useState("");
  const [genreConfirmed, setGenreConfirmed] = useState(false);

  // Step 3
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenreMatch = async () => {
    setError(null);
    const result = await runAgent("genre_match", { description });
    if (result) {
      setGenreResult(result.content);
      const parsed = parseJsonSafe(result.content);
      if (parsed?.candidates && parsed.candidates.length > 0) {
        setGenreCandidates(parsed.candidates);
        // Auto-select first candidate
        const first = parsed.candidates[0] as GenreCandidate;
        setSelectedGenre(first.genre_name);
        setSelectedGenreId(first.genre_id);
        setGenreConfirmed(true);
      }
    }
  };

  const handleCreateProject = async () => {
    setCreating(true);
    setError(null);
    try {
      const title = "未命名作品";
      const project = await addProject(title, selectedGenreId || undefined);
      if (!project) {
        setError("创建项目失败，请重试");
        setCreating(false);
        return;
      }

      await switchProject(project.id);

      // Save genre as a canon rule if one was matched
      if (selectedGenre && genreCandidates.length > 0) {
        try {
          const genreInfo = genreCandidates.find((c) => c.genre_name === selectedGenre);
          const { canonApi } = await import("../../lib/tauri");
          await canonApi.create({
            rule_key: "genre",
            rule_name: "题材设定",
            rule_type: "world",
            scope_type: "book",
            content: `${selectedGenre}题材${
              genreInfo?.typical_features?.length
                ? `，包含${genreInfo.typical_features.join("、")}等特征`
                : ""
            }`,
            is_hard: true,
            source_type: "setup",
          });
        } catch {
          // Non-critical, continue
        }
      }

      navigate(`/project/${project.id}/dashboard`);
    } catch {
      setError("创建项目时发生错误");
    }
    setCreating(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-gray-200 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Zap size={22} className="text-amber-500" />
            快速开始
          </h1>
        </div>

        {/* Info note */}
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            快速模式使用默认设置创建项目，你可以之后在设置中调整。
          </p>
          <button
            onClick={() => navigate("/setup")}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 underline"
          >
            切换到完整模式
          </button>
        </div>

        {/* Step indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">
              步骤 {currentStep + 1} / {steps.length}: {steps[currentStep].label}
            </h2>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-center gap-0 mt-4">
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-center">
                <button
                  onClick={() => {
                    if (i < currentStep) setCurrentStep(i);
                  }}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      i < currentStep
                        ? "bg-green-500 text-white shadow-sm"
                        : i === currentStep
                          ? running
                            ? "bg-amber-100 text-amber-700 ring-2 ring-amber-500 animate-pulse"
                            : "bg-amber-100 text-amber-700 ring-2 ring-amber-500"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {i < currentStep ? (
                      <Check size={14} />
                    ) : running && i === currentStep ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 whitespace-nowrap ${
                      i <= currentStep ? "text-amber-600 font-medium" : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {i < steps.length - 1 && (
                  <div className="w-12 h-0.5 mx-1 mt-[-14px] rounded bg-gray-200">
                    <div
                      className="h-full rounded bg-amber-500 transition-all"
                      style={{ width: i < currentStep ? "100%" : "0%" }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step content */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 min-h-[300px]">
          {/* Step 1: Description */}
          {currentStep === 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 1: 作品描述</h2>
              <p className="text-gray-500 text-sm mb-4">
                简单描述你想创作的故事。只需要核心概念即可，其他步骤将自动完成。
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：一个修仙世界中，主角从凡人开始，经历重重磨难，最终成为一代宗师的故事..."
                className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                autoFocus
              />
              {description.trim() && (
                <button
                  onClick={() => setCurrentStep(1)}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                >
                  下一步
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}

          {/* Step 2: Genre Match */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 2: 题材匹配</h2>
              <p className="text-gray-500 text-sm mb-4">
                AI 将分析你的描述并自动匹配最合适的题材类型。
              </p>
              <button
                onClick={handleGenreMatch}
                disabled={running || !description.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
              >
                {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {running ? "分析中..." : "开始匹配"}
              </button>

              {genreCandidates.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-gray-600">已自动选择最佳匹配题材：</p>
                  {genreCandidates.slice(0, 1).map((c) => (
                    <div
                      key={c.genre_id}
                      className="p-3 rounded-lg border border-amber-300 bg-amber-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{c.genre_name}</span>
                        <span className="text-sm text-amber-700">匹配度 {c.match_score}/10</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{c.reason}</p>
                      {c.typical_features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {c.typical_features.map((f, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 bg-white text-gray-600 rounded border border-gray-200"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Show other candidates if available */}
                  {genreCandidates.length > 1 && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-500 mb-2">其他可选题材（点击选择）：</p>
                      <div className="space-y-2">
                        {genreCandidates.slice(1).map((c) => (
                          <button
                            key={c.genre_id}
                            onClick={() => {
                              setSelectedGenre(c.genre_name);
                              setSelectedGenreId(c.genre_id);
                              setGenreConfirmed(true);
                            }}
                            className={`w-full text-left p-3 rounded-lg border transition-colors ${
                              selectedGenre === c.genre_name
                                ? "border-amber-500 bg-amber-50"
                                : "border-gray-200 hover:border-gray-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">{c.genre_name}</span>
                              <span className="text-sm text-gray-500">
                                匹配度 {c.match_score}/10
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{c.reason}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {genreConfirmed && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                      <Check size={16} className="text-green-600" />
                      <span className="text-sm text-green-700">已选择题材: {selectedGenre}</span>
                    </div>
                  )}
                </div>
              )}

              {genreResult && genreCandidates.length === 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-60 overflow-auto">
                  {genreResult}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Create Project */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 3: 创建项目</h2>
              <p className="text-gray-500 text-sm mb-4">一切就绪！将使用以下设置创建项目：</p>

              <div className="space-y-3 mb-6">
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-green-500" />
                  <span className="text-gray-700">
                    作品描述:{" "}
                    <span className="text-gray-900">
                      {description.slice(0, 100)}
                      {description.length > 100 ? "..." : ""}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-green-500" />
                  <span className="text-gray-700">
                    题材: <span className="text-gray-900">{selectedGenre || "未匹配"}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-green-500" />
                  <span className="text-gray-700">文风: 默认风格</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-green-500" />
                  <span className="text-gray-700">卷纲/大纲: 之后设置</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Check size={14} className="text-green-500" />
                  <span className="text-gray-700">角色/SOUL: 之后设置</span>
                </div>
              </div>

              <button
                onClick={handleCreateProject}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-base font-medium transition-colors"
              >
                {creating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    创建中...
                  </>
                ) : (
                  <>
                    <BookOpen size={18} />
                    创建项目并进入看板
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0 || creating}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <ArrowLeft size={16} />
            上一步
          </button>

          {currentStep < steps.length - 1 && (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={
                (currentStep === 0 && !description.trim()) || (currentStep === 1 && !genreConfirmed)
              }
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
            >
              下一步
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
