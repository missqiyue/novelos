import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgentStore, useBookshelfStore, useProjectStore } from "../../stores";
import { projectApi, outlineApi, canonApi, chapterApi } from "../../lib/api";
import { ArrowLeft, ArrowRight, Sparkles, Loader2, Check } from "lucide-react";

const steps = [
  { key: "desc", label: "作品描述" },
  { key: "genre", label: "题材匹配" },
  { key: "style", label: "文风确定" },
  { key: "volumes", label: "卷纲确认" },
  { key: "outline", label: "大纲确认" },
  { key: "naming", label: "角色命名" },
  { key: "soul", label: "SOUL匹配" },
  { key: "title", label: "书名生成" },
];

interface GenreCandidate {
  genre_id: string;
  genre_name: string;
  match_score: number;
  reason: string;
  typical_features: string[];
}

interface NameCandidate {
  name: string;
  meaning: string;
  reason: string;
}

interface CharacterNames {
  role: string;
  candidates: NameCandidate[];
  selectedName?: string;
}

interface BookTitleCandidate {
  title: string;
  approach: string;
  reason: string;
  collision_risk: string;
}

interface VolumeInfo {
  volume_number: number;
  title: string;
  goal: string;
  main_conflict: string;
  climax: string;
  settlement: string;
}

interface SoulMatchResult {
  matched_template: string;
  customization: {
    personality: Record<string, string>;
    speech: Record<string, string>;
    behavior: Record<string, string>;
    relationships: Record<string, string>;
  };
  speech_examples: string[];
}

interface StyleAnalysis {
  style_name: string;
  narrative_perspective: string;
  language_style: string;
  dialogue_style: string;
  description_preference: string;
  rhythm: string;
  rhetoric: string;
  word_preferences: string[];
  sample_sentences: string[];
  writing_guidelines: string;
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

export function ProjectSetupPage() {
  const navigate = useNavigate();
  const { runAgent, running } = useAgentStore();
  const { addProject } = useBookshelfStore();
  const { switchProject } = useProjectStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [confirmed, setConfirmed] = useState<boolean[]>(new Array(8).fill(false));

  // Step 1
  const [description, setDescription] = useState("");
  // Step 2
  const [genreResult, setGenreResult] = useState("");
  const [genreCandidates, setGenreCandidates] = useState<GenreCandidate[]>([]);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [selectedGenreId, setSelectedGenreId] = useState("");
  // Step 3
  const [styleMode, setStyleMode] = useState<"default" | "reference" | "benchmark">("default");
  const [referenceText, setReferenceText] = useState("");
  const [benchmarkWork, setBenchmarkWork] = useState("");
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(null);
  const [styleRawResult, setStyleRawResult] = useState("");
  // Step 4
  const [targetVolumes, setTargetVolumes] = useState(8);
  const [volumeStructure, setVolumeStructure] = useState("");
  const [volumesParsed, setVolumesParsed] = useState<VolumeInfo[]>([]);
  // Step 5
  const [outlineResult, setOutlineResult] = useState("");
  // Step 6
  const [characterDescs, setCharacterDescs] = useState("");
  const [namingResult, setNamingResult] = useState("");
  const [characterNames, setCharacterNames] = useState<CharacterNames[]>([]);
  // Step 7
  const [soulResults, setSoulResults] = useState<Map<string, SoulMatchResult>>(new Map());
  const [soulRawResult, setSoulRawResult] = useState("");
  // Step 8
  const [titleResult, setTitleResult] = useState("");
  const [titleCandidates, setTitleCandidates] = useState<BookTitleCandidate[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const confirm = (step: number) => {
    const next = [...confirmed];
    next[step] = true;
    setConfirmed(next);
  };

  // Step 2: Genre Match
  const handleGenreMatch = async () => {
    const result = await runAgent("genre_match", { description });
    if (result) {
      setGenreResult(result.content);
      const parsed = parseJsonSafe(result.content);
      if (parsed?.candidates) {
        setGenreCandidates(parsed.candidates);
      }
    }
  };

  // Step 3: Style analysis
  const handleStyleAnalysis = async () => {
    const text =
      styleMode === "reference"
        ? referenceText
        : `分析作品《${benchmarkWork}》的写作风格特征，这是一部${selectedGenre || "玄幻"}题材的小说。`;
    const result = await runAgent("style_extractor", { text });
    if (result) {
      setStyleRawResult(result.content);
      const parsed = parseJsonSafe(result.content);
      if (parsed?.style_name) {
        setStyleAnalysis(parsed as StyleAnalysis);
      }
      confirm(2);
    }
  };

  // Step 4: Generate volume structure
  const handleGenerateVolumes = async () => {
    const result = await runAgent("volume_outline", {
      description,
      genre: selectedGenre || genreCandidates[0]?.genre_name || "待定",
      target_volumes: String(targetVolumes),
      style_preference:
        styleMode === "default" ? "默认风格" : styleAnalysis?.style_name || "自定义风格",
    });
    if (result) {
      const parsed = parseJsonSafe(result.content);
      if (parsed?.volumes) {
        setVolumesParsed(parsed.volumes);
        const text = parsed.volumes
          .map(
            (v: VolumeInfo) =>
              `第${v.volume_number}卷: ${v.title}\n  目标: ${v.goal}\n  冲突: ${v.main_conflict}\n  爆点: ${v.climax}\n  余波: ${v.settlement}`,
          )
          .join("\n\n");
        setVolumeStructure(text);
      } else {
        setVolumeStructure(result.content);
      }
    }
  };

  // Step 5: Generate outline
  const handleGenerateOutline = async () => {
    const result = await runAgent("book_outline", {
      description,
      genre: selectedGenre || genreCandidates[0]?.genre_name || "待定",
      volume_structure: volumeStructure,
      style_preference:
        styleMode === "default" ? "默认风格" : styleAnalysis?.style_name || "自定义风格",
    });
    if (result) {
      setOutlineResult(result.content);
    }
  };

  // Step 6: Name Generation
  const handleNameGeneration = async () => {
    const result = await runAgent("name_generator", {
      genre: selectedGenre || genreCandidates[0]?.genre_name || "玄幻",
      world_framework: description,
      character_descriptions: characterDescs,
      banned_names: "",
    });
    if (result) {
      setNamingResult(result.content);
      const parsed = parseJsonSafe(result.content);
      if (parsed?.characters) {
        const chars: CharacterNames[] = parsed.characters.map((c: any) => ({
          ...c,
          selectedName: c.candidates?.[0]?.name || "",
        }));
        setCharacterNames(chars);
      }
    }
  };

  // Step 7: SOUL Match
  const handleSoulMatch = async () => {
    const results = new Map<string, SoulMatchResult>();
    for (const char of characterNames) {
      const name = char.selectedName || char.candidates[0]?.name || char.role;
      const result = await runAgent("soul_matcher", {
        name,
        role_type: char.role,
        identity_core: characterDescs,
        soul_templates: "使用内置SOUL模板库",
      });
      if (result) {
        setSoulRawResult(result.content);
        const parsed = parseJsonSafe(result.content);
        if (parsed?.matched_template) {
          results.set(name, parsed as SoulMatchResult);
        }
      }
    }
    setSoulResults(results);
    if (results.size > 0) {
      confirm(6);
    }
  };

  // Step 8: Book Title
  const handleBookTitle = async () => {
    const mainConflict = volumeStructure.split("\n").slice(0, 3).join(" ");
    const result = await runAgent("book_title", {
      description,
      genre: selectedGenre || genreCandidates[0]?.genre_name || "待定",
      main_conflict: mainConflict,
      outline_summary: outlineResult.slice(0, 500),
    });
    if (result) {
      setTitleResult(result.content);
      const parsed = parseJsonSafe(result.content);
      if (parsed?.candidates) {
        setTitleCandidates(parsed.candidates);
      }
    }
  };

  // Final: Create project with all data
  const handleCreateProject = async () => {
    setCreating(true);
    const title = selectedTitle || titleCandidates[0]?.title || "未命名作品";

    const project = await addProject(title, selectedGenreId || undefined);
    if (!project) {
      setCreating(false);
      return;
    }

    await switchProject(project.id);

    try {
      // Update project with metadata
      await projectApi.update(title, "active");

      // Save volume structure as book outline
      if (volumeStructure.trim()) {
        await outlineApi.saveBookOutline(
          JSON.stringify({ volumes: volumesParsed, raw: volumeStructure }),
          "完整开书向导: 卷纲确认",
        );
      }

      // Save full outline
      if (outlineResult.trim()) {
        const existingOutline = await outlineApi.getBookOutline();
        const combined = existingOutline?.content_json
          ? JSON.stringify({
              ...JSON.parse(existingOutline.content_json),
              outline: outlineResult,
            })
          : JSON.stringify({ outline: outlineResult });
        await outlineApi.saveBookOutline(combined, "完整开书向导: 大纲确认");
      }

      // Create characters with SOUL
      for (const char of characterNames) {
        const name = char.selectedName || char.candidates[0]?.name || char.role;
        const soulData = soulResults.get(name);
        const soulJson = soulData ? JSON.stringify(soulData) : "{}";
        const created = await chapterApi.createCharacter(name, char.role, soulJson);
        if (created && soulData?.customization) {
          const c = soulData.customization;
          await chapterApi.updateCharacter(
            created.id,
            name,
            soulJson,
            char.role,
            characterDescs,
            c.personality ? JSON.stringify(c.personality) : undefined,
            c.behavior ? Object.values(c.behavior).join("；") : undefined,
          );
        }
      }

      // Save style as a canon rule
      const styleContent =
        styleMode === "default"
          ? `${selectedGenre || "通用"}题材默认风格`
          : styleAnalysis
            ? styleAnalysis.writing_guidelines
            : styleMode === "reference"
              ? `参考文段风格: ${referenceText.slice(0, 200)}`
              : `对标作品风格: ${benchmarkWork}`;
      await canonApi.create({
        rule_key: "style_guide",
        rule_name: "文风指南",
        rule_type: "style",
        scope_type: "book",
        content: styleContent,
        is_hard: false,
        source_type: "setup",
      });

      // Save genre as a canon rule
      if (selectedGenre) {
        await canonApi.create({
          rule_key: "genre",
          rule_name: "题材设定",
          rule_type: "world",
          scope_type: "book",
          content: `${selectedGenre}题材，包含${genreCandidates.find((c) => c.genre_name === selectedGenre)?.typical_features.join("、") || "标准特征"}`,
          is_hard: true,
          source_type: "setup",
        });
      }

      navigate(`/project/${project.id}`);
    } catch (e) {
      console.error("Failed to save setup data:", e);
      navigate(`/project/${project.id}`);
    }
    setCreating(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate("/")} className="p-2 hover:bg-gray-200 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">完整开书向导</h1>
            <p className="text-sm text-gray-500 mt-1">
              适合逐项细调题材、文风、卷纲、大纲、角色、SOUL 和书名。
            </p>
          </div>
        </div>

        {/* Step indicator with progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">
              步骤 {currentStep + 1} / {steps.length}: {steps[currentStep].label}
            </h2>
            <span className="text-sm text-gray-500">
              {Math.round((confirmed.filter(Boolean).length / steps.length) * 100)}% 完成
            </span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500"
              style={{ width: `${(confirmed.filter(Boolean).length / steps.length) * 100}%` }}
            />
          </div>
          {/* Step dots with labels */}
          <div className="flex items-start gap-0 overflow-x-auto pb-2">
            {steps.map((step, i) => (
              <div
                key={step.key}
                className="flex items-start shrink-0"
                style={{ minWidth: i < steps.length - 1 ? "auto" : "max-content" }}
              >
                <button
                  onClick={() => setCurrentStep(i)}
                  className="flex flex-col items-center gap-1 group"
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      confirmed[i]
                        ? "bg-green-500 text-white shadow-sm"
                        : i === currentStep
                          ? running
                            ? "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600 animate-pulse"
                            : "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600"
                          : i < currentStep
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {confirmed[i] ? (
                      <Check size={14} />
                    ) : running && i === currentStep ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 whitespace-nowrap ${
                      i <= currentStep ? "text-indigo-600 font-medium" : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {i < steps.length - 1 && (
                  <div className="flex-1 flex items-start mt-4 mx-0.5">
                    <div
                      className={`flex-1 h-0.5 rounded ${
                        i < currentStep ? "bg-indigo-600" : "bg-gray-200"
                      }`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 min-h-[400px]">
          {/* Step 1: Description */}
          {currentStep === 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 1: 作品描述</h2>
              <p className="text-gray-500 text-sm mb-4">
                描述你想要创作的长篇小说的核心概念、故事梗概或任何灵感。
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：一个修仙世界中，主角从凡人开始，经历重重磨难，最终成为一代宗师的故事..."
                className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
              {description.trim() && (
                <button
                  onClick={() => confirm(0)}
                  className="mt-4 flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check size={16} />
                  确认描述
                </button>
              )}
            </div>
          )}

          {/* Step 2: Genre Match */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 2: 题材匹配</h2>
              <p className="text-gray-500 text-sm mb-4">AI 将根据你的描述识别最匹配的题材类型。</p>
              <button
                onClick={handleGenreMatch}
                disabled={running || !description.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {running ? "分析中..." : "开始匹配"}
              </button>

              {genreCandidates.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-gray-500">选择最合适的题材：</p>
                  {genreCandidates.map((c) => (
                    <button
                      key={c.genre_id}
                      onClick={() => {
                        setSelectedGenre(c.genre_name);
                        setSelectedGenreId(c.genre_id);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedGenre === c.genre_name
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{c.genre_name}</span>
                        <span className="text-sm text-indigo-600">匹配度 {c.match_score}/10</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{c.reason}</p>
                      {c.typical_features.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {c.typical_features.map((f, i) => (
                            <span
                              key={i}
                              className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {genreResult && genreCandidates.length === 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap">
                  {genreResult}
                </div>
              )}

              {selectedGenre && (
                <button
                  onClick={() => confirm(1)}
                  className="mt-4 flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check size={16} />
                  确认题材: {selectedGenre}
                </button>
              )}
            </div>
          )}

          {/* Step 3: Style */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 3: 文风确定</h2>
              <p className="text-gray-500 text-sm mb-4">
                选择作品的写作风格。AI可分析参考文本或对标作品来提取风格特征。
              </p>

              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="style"
                    checked={styleMode === "default"}
                    onChange={() => setStyleMode("default")}
                  />
                  <div>
                    <span className="font-medium text-gray-900">默认风格</span>
                    <p className="text-sm text-gray-500">使用题材推荐的默认写作风格</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="style"
                    checked={styleMode === "reference"}
                    onChange={() => setStyleMode("reference")}
                  />
                  <div>
                    <span className="font-medium text-gray-900">参考文段</span>
                    <p className="text-sm text-gray-500">提供一段文字，AI将分析并提取其风格特征</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-gray-300 cursor-pointer">
                  <input
                    type="radio"
                    name="style"
                    checked={styleMode === "benchmark"}
                    onChange={() => setStyleMode("benchmark")}
                  />
                  <div>
                    <span className="font-medium text-gray-900">对标作品</span>
                    <p className="text-sm text-gray-500">
                      指定一部已出版的作品，AI将分析其典型风格
                    </p>
                  </div>
                </label>
              </div>

              {styleMode === "reference" && (
                <div>
                  <textarea
                    value={referenceText}
                    onChange={(e) => setReferenceText(e.target.value)}
                    placeholder="粘贴一段你希望模仿的文字风格（建议500字以上）..."
                    className="mt-3 w-full h-32 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <button
                    onClick={handleStyleAnalysis}
                    disabled={running || !referenceText.trim()}
                    className="mt-2 flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
                  >
                    {running ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    {running ? "分析中..." : "AI 提取风格"}
                  </button>
                </div>
              )}

              {styleMode === "benchmark" && (
                <div>
                  <input
                    type="text"
                    value={benchmarkWork}
                    onChange={(e) => setBenchmarkWork(e.target.value)}
                    placeholder="如：《遮天》《诡秘之主》"
                    className="mt-3 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={handleStyleAnalysis}
                    disabled={running || !benchmarkWork.trim()}
                    className="mt-2 flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
                  >
                    {running ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    {running ? "分析中..." : "AI 分析风格"}
                  </button>
                </div>
              )}

              {styleAnalysis && (
                <div className="mt-4 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                  <h4 className="font-medium text-indigo-900 mb-2">{styleAnalysis.style_name}</h4>
                  <div className="space-y-1.5 text-sm text-gray-700">
                    <p>
                      <span className="text-gray-500">叙事视角:</span>{" "}
                      {styleAnalysis.narrative_perspective}
                    </p>
                    <p>
                      <span className="text-gray-500">语言风格:</span>{" "}
                      {styleAnalysis.language_style}
                    </p>
                    <p>
                      <span className="text-gray-500">对话风格:</span>{" "}
                      {styleAnalysis.dialogue_style}
                    </p>
                    <p>
                      <span className="text-gray-500">描写偏好:</span>{" "}
                      {styleAnalysis.description_preference}
                    </p>
                    <p>
                      <span className="text-gray-500">节奏特征:</span> {styleAnalysis.rhythm}
                    </p>
                    {styleAnalysis.word_preferences.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {styleAnalysis.word_preferences.map((w, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded"
                          >
                            {w}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {styleAnalysis.writing_guidelines && (
                    <p className="mt-2 text-sm text-gray-600 bg-white p-2 rounded border">
                      {styleAnalysis.writing_guidelines}
                    </p>
                  )}
                </div>
              )}

              {styleRawResult && !styleAnalysis && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-60 overflow-auto">
                  {styleRawResult}
                </div>
              )}

              {styleMode === "default" && (
                <button
                  onClick={() => confirm(2)}
                  className="mt-4 flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check size={16} />
                  使用默认风格
                </button>
              )}
            </div>
          )}

          {/* Step 4: Volume Structure */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 4: 卷纲确认</h2>
              <p className="text-gray-500 text-sm mb-4">
                设定全书分卷结构，AI 可协助生成卷纲（含目标/冲突/爆点/余波）。
              </p>

              <div className="flex items-center gap-3 mb-3">
                <label className="text-sm text-gray-700">目标卷数</label>
                <input
                  type="number"
                  value={targetVolumes}
                  onChange={(e) => setTargetVolumes(parseInt(e.target.value) || 8)}
                  min={1}
                  max={30}
                  className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 mb-3">
                <button
                  onClick={handleGenerateVolumes}
                  disabled={running}
                  className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
                >
                  {running ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  AI 生成卷纲
                </button>
              </div>

              {volumesParsed.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {volumesParsed.map((v) => (
                    <div key={v.volume_number} className="p-3 border border-gray-200 rounded-lg">
                      <h4 className="font-medium text-gray-900">
                        第{v.volume_number}卷: {v.title}
                      </h4>
                      <div className="mt-1.5 space-y-1 text-sm">
                        <p>
                          <span className="text-gray-500">目标:</span> {v.goal}
                        </p>
                        <p>
                          <span className="text-amber-600">冲突:</span> {v.main_conflict}
                        </p>
                        <p>
                          <span className="text-red-600">爆点:</span> {v.climax}
                        </p>
                        <p>
                          <span className="text-indigo-600">余波:</span> {v.settlement}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <textarea
                  value={volumeStructure}
                  onChange={(e) => setVolumeStructure(e.target.value)}
                  placeholder="每卷一行，格式如：第1卷：起源 — 主角觉醒，踏入修仙路..."
                  className="w-full h-48 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
                />
              )}

              {volumeStructure.trim() && (
                <button
                  onClick={() => confirm(3)}
                  className="mt-4 flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check size={16} />
                  确认卷纲
                </button>
              )}
            </div>
          )}

          {/* Step 5: Outline */}
          {currentStep === 4 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 5: 大纲确认</h2>
              <p className="text-gray-500 text-sm mb-4">生成全书大纲和分卷大纲，可手动修改。</p>

              <button
                onClick={handleGenerateOutline}
                disabled={running || !volumeStructure.trim()}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                AI 生成大纲
              </button>

              <textarea
                value={outlineResult}
                onChange={(e) => setOutlineResult(e.target.value)}
                placeholder="AI 将根据前面的信息生成大纲，你也可以直接编辑..."
                className="mt-3 w-full h-64 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono"
              />

              {outlineResult.trim() && (
                <button
                  onClick={() => confirm(4)}
                  className="mt-4 flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check size={16} />
                  确认大纲
                </button>
              )}
            </div>
          )}

          {/* Step 6: Character Naming */}
          {currentStep === 5 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 6: 角色命名</h2>
              <p className="text-gray-500 text-sm mb-4">
                描述需要命名的角色，AI将为每个角色生成3套候选名字。
              </p>

              <textarea
                value={characterDescs}
                onChange={(e) => setCharacterDescs(e.target.value)}
                placeholder="每行一个角色，格式如：&#10;主角：少年出身，性格坚韧&#10;女主：神秘世家出身，外冷内热&#10;反派：野心勃勃的宗门长老"
                className="w-full h-32 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />

              <button
                onClick={handleNameGeneration}
                disabled={running || !characterDescs.trim()}
                className="mt-3 flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                生成候选名字
              </button>

              {characterNames.length > 0 && (
                <div className="mt-4 space-y-4">
                  {characterNames.map((char, ci) => (
                    <div key={ci} className="p-3 border border-gray-200 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">{char.role}</h4>
                      <div className="space-y-2">
                        {char.candidates.map((c, ni) => (
                          <button
                            key={ni}
                            onClick={() => {
                              const next = [...characterNames];
                              next[ci] = { ...next[ci], selectedName: c.name };
                              setCharacterNames(next);
                            }}
                            className={`w-full text-left flex items-start gap-2 p-2 rounded transition-colors ${
                              char.selectedName === c.name
                                ? "bg-indigo-50 border border-indigo-300"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <span
                              className={`w-4 h-4 mt-0.5 rounded-full border-2 shrink-0 ${
                                char.selectedName === c.name
                                  ? "border-indigo-600 bg-indigo-600"
                                  : "border-gray-300"
                              }`}
                            />
                            <div>
                              <span className="font-medium text-indigo-700">{c.name}</span>
                              <span className="text-gray-500 ml-2">{c.meaning}</span>
                              <p className="text-xs text-gray-400 mt-0.5">{c.reason}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {namingResult && characterNames.length === 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap">
                  {namingResult}
                </div>
              )}

              {(characterNames.length > 0 || namingResult.trim()) && (
                <button
                  onClick={() => confirm(5)}
                  className="mt-4 flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check size={16} />
                  确认命名
                </button>
              )}
            </div>
          )}

          {/* Step 7: SOUL Match */}
          {currentStep === 6 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 7: SOUL 匹配</h2>
              <p className="text-gray-500 text-sm mb-4">
                AI 将根据角色设定逐个匹配最合适的 SOUL 性格模板，并生成定制化调整。
              </p>

              <button
                onClick={handleSoulMatch}
                disabled={running || characterNames.length === 0}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {running ? "匹配中..." : "开始 SOUL 匹配"}
              </button>

              {!characterNames.length && (
                <p className="text-sm text-amber-600 mt-2">请先在步骤 6 完成角色命名</p>
              )}

              {soulResults.size > 0 && (
                <div className="mt-4 space-y-4">
                  {Array.from(soulResults.entries()).map(([name, soul]) => (
                    <div key={name} className="p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-medium text-gray-900">{name}</h4>
                        <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                          匹配模板: {soul.matched_template}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {soul.customization.personality && (
                          <div className="p-2 bg-blue-50 rounded">
                            <p className="text-blue-700 font-medium text-xs mb-1">性格</p>
                            {Object.entries(soul.customization.personality).map(([k, v]) => (
                              <p key={k} className="text-gray-700">
                                <span className="text-gray-500">{k}:</span> {v}
                              </p>
                            ))}
                          </div>
                        )}
                        {soul.customization.speech && (
                          <div className="p-2 bg-green-50 rounded">
                            <p className="text-green-700 font-medium text-xs mb-1">语言</p>
                            {Object.entries(soul.customization.speech).map(([k, v]) => (
                              <p key={k} className="text-gray-700">
                                <span className="text-gray-500">{k}:</span> {v}
                              </p>
                            ))}
                          </div>
                        )}
                        {soul.customization.behavior && (
                          <div className="p-2 bg-orange-50 rounded">
                            <p className="text-orange-700 font-medium text-xs mb-1">行为</p>
                            {Object.entries(soul.customization.behavior).map(([k, v]) => (
                              <p key={k} className="text-gray-700">
                                <span className="text-gray-500">{k}:</span> {v}
                              </p>
                            ))}
                          </div>
                        )}
                        {soul.customization.relationships && (
                          <div className="p-2 bg-purple-50 rounded">
                            <p className="text-purple-700 font-medium text-xs mb-1">关系</p>
                            {Object.entries(soul.customization.relationships).map(([k, v]) => (
                              <p key={k} className="text-gray-700">
                                <span className="text-gray-500">{k}:</span> {v}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                      {soul.speech_examples.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">典型对话:</p>
                          <div className="space-y-1">
                            {soul.speech_examples.map((ex, i) => (
                              <p
                                key={i}
                                className="text-sm text-gray-700 italic bg-gray-50 px-2 py-1 rounded"
                              >
                                "{ex}"
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {soulRawResult && soulResults.size === 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-80 overflow-auto">
                  {soulRawResult}
                </div>
              )}

              {soulResults.size > 0 && !confirmed[6] && (
                <button
                  onClick={() => confirm(6)}
                  className="mt-4 flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Check size={16} />
                  确认 SOUL
                </button>
              )}
            </div>
          )}

          {/* Step 8: Book Title */}
          {currentStep === 7 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">步骤 8: 书名生成</h2>
              <p className="text-gray-500 text-sm mb-4">AI 将生成3-5个候选书名，并检查碰撞风险。</p>

              <button
                onClick={handleBookTitle}
                disabled={running}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
              >
                {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                生成书名
              </button>

              {titleCandidates.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-gray-500">选择一个书名：</p>
                  {titleCandidates.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedTitle(c.title)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedTitle === c.title
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 text-lg">{c.title}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            c.collision_risk === "safe"
                              ? "bg-green-100 text-green-700"
                              : c.collision_risk === "warn"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                          }`}
                        >
                          {c.collision_risk === "safe"
                            ? "安全"
                            : c.collision_risk === "warn"
                              ? "相似"
                              : "碰撞"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{c.reason}</p>
                    </button>
                  ))}

                  {/* Custom title input */}
                  <div className="mt-2">
                    <label className="text-sm text-gray-500">或自定义书名：</label>
                    <input
                      type="text"
                      value={selectedTitle}
                      onChange={(e) => setSelectedTitle(e.target.value)}
                      placeholder="输入自定义书名"
                      className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              {titleResult && titleCandidates.length === 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap">
                  {titleResult}
                </div>
              )}

              {selectedTitle && (
                <button
                  onClick={handleCreateProject}
                  disabled={creating}
                  className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-base font-medium"
                >
                  {creating ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  {creating ? "创建项目中..." : `创建项目「${selectedTitle}」`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <ArrowLeft size={16} />
            上一步
          </button>
          <div className="flex gap-2">
            {confirmed[currentStep] && (
              <span className="flex items-center gap-1 px-3 py-2 text-green-700 text-sm">
                <Check size={14} />
                已确认
              </span>
            )}
            <button
              onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              下一步
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
