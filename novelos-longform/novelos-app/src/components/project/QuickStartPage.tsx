import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgentStore, useBookshelfStore, useProjectStore } from "../../stores";
import {
  canonApi,
  chapterApi,
  outlineApi,
  projectApi,
  sharedResourcesApi,
  templateApi,
  type GenreTemplateInfo,
  type StyleProfileInfo,
} from "../../lib/api";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
  Zap,
} from "lucide-react";

const steps = [
  { key: "seed", label: "故事种子" },
  { key: "genre", label: "AI 题材" },
  { key: "style", label: "AI 文风" },
  { key: "volumes", label: "AI 卷纲" },
  { key: "outline", label: "AI 大纲" },
  { key: "characters", label: "角色/SOUL" },
  { key: "title", label: "书名落库" },
] as const;

interface GenreCandidate {
  genre_id: string;
  genre_name: string;
  match_score: number;
  reason: string;
  typical_features: string[];
}

interface NameCandidate {
  name: string;
  meaning?: string;
  reason?: string;
}

interface CharacterNames {
  role: string;
  candidates: NameCandidate[];
  selectedName?: string;
  identity_core?: string;
  core_motivation?: string;
  description?: string;
}

interface BookTitleCandidate {
  title: string;
  approach?: string;
  reason?: string;
  collision_risk?: string;
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
  customization?: {
    personality?: Record<string, string>;
    speech?: Record<string, string>;
    behavior?: Record<string, string>;
    relationships?: Record<string, string>;
  };
  speech_examples?: string[];
}

interface StyleAnalysis {
  style_name: string;
  narrative_perspective?: string;
  language_style?: string;
  dialogue_style?: string;
  description_preference?: string;
  rhythm?: string;
  rhetoric?: string;
  word_preferences?: string[];
  sample_sentences?: string[];
  writing_guidelines?: string;
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

function compactText(value: string, max = 240): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function stringifyPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function matchGenreTemplate(
  candidates: GenreCandidate[],
  templates: GenreTemplateInfo[],
): GenreTemplateInfo | null {
  for (const candidate of candidates) {
    const byId = templates.find((t) => t.genre_id === candidate.genre_id);
    if (byId) return byId;
    const byName = templates.find(
      (t) => t.genre_name.includes(candidate.genre_name) || candidate.genre_name.includes(t.genre_name),
    );
    if (byName) return byName;
  }
  return templates[0] ?? null;
}

function matchStyleProfile(genreName: string, profiles: StyleProfileInfo[]): StyleProfileInfo | null {
  if (!profiles.length) return null;
  const normalized = genreName.toLowerCase();
  return (
    profiles.find((p) => p.name.includes(genreName)) ||
    profiles.find((p) => normalized && p.name.toLowerCase().includes(normalized)) ||
    profiles.find((p) => p.name.includes("爽文")) ||
    profiles[0]
  );
}

export function QuickStartPage() {
  const navigate = useNavigate();
  const { runAgent, running } = useAgentStore();
  const { fetch: refreshBookshelf } = useBookshelfStore();
  const { switchProject } = useProjectStore();

  const [currentStep, setCurrentStep] = useState(0);
  const [confirmed, setConfirmed] = useState<boolean[]>(new Array(steps.length).fill(false));
  const [autoRunning, setAutoRunning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [targetReaders, setTargetReaders] = useState("");
  const [coreThrills, setCoreThrills] = useState("");
  const [targetVolumes, setTargetVolumes] = useState(6);

  const [genreTemplates, setGenreTemplates] = useState<GenreTemplateInfo[]>([]);
  const [styleProfiles, setStyleProfiles] = useState<StyleProfileInfo[]>([]);
  const [genreResult, setGenreResult] = useState("");
  const [genreCandidates, setGenreCandidates] = useState<GenreCandidate[]>([]);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [selectedGenreId, setSelectedGenreId] = useState("");
  const [selectedGenreTemplateId, setSelectedGenreTemplateId] = useState("");

  const [styleRawResult, setStyleRawResult] = useState("");
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(null);
  const [selectedStyleProfileId, setSelectedStyleProfileId] = useState("");

  const [volumeStructure, setVolumeStructure] = useState("");
  const [volumesParsed, setVolumesParsed] = useState<VolumeInfo[]>([]);
  const [outlineResult, setOutlineResult] = useState("");
  const [namingResult, setNamingResult] = useState("");
  const [characterNames, setCharacterNames] = useState<CharacterNames[]>([]);
  const [soulResults, setSoulResults] = useState<Map<string, SoulMatchResult>>(new Map());
  const [soulRawResult, setSoulRawResult] = useState("");
  const [titleResult, setTitleResult] = useState("");
  const [titleCandidates, setTitleCandidates] = useState<BookTitleCandidate[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");

  useEffect(() => {
    let mounted = true;
    Promise.all([templateApi.listGenreTemplates(), sharedResourcesApi.listStyleProfiles()])
      .then(([templates, profiles]) => {
        if (!mounted) return;
        setGenreTemplates(templates);
        setStyleProfiles(profiles);
      })
      .catch((e) => setError(`读取资源库失败: ${String(e)}`));
    return () => {
      mounted = false;
    };
  }, []);

  const selectedGenreTemplate = useMemo(
    () => genreTemplates.find((t) => t.id === selectedGenreTemplateId) ?? null,
    [genreTemplates, selectedGenreTemplateId],
  );
  const selectedStyleProfile = useMemo(
    () => styleProfiles.find((p) => p.id === selectedStyleProfileId) ?? null,
    [styleProfiles, selectedStyleProfileId],
  );
  const canStart = description.trim().length >= 10;

  const confirm = (step: number) => {
    const next = [...confirmed];
    next[step] = true;
    setConfirmed(next);
  };

  const seedContext = () =>
    [
      projectName.trim() ? `项目暂名: ${projectName.trim()}` : "",
      `核心简介: ${description.trim()}`,
      targetReaders.trim() ? `目标读者: ${targetReaders.trim()}` : "",
      coreThrills.trim() ? `核心爽点: ${coreThrills.trim()}` : "",
      `目标卷数: ${targetVolumes}`,
    ]
      .filter(Boolean)
      .join("\n");

  const handleGenreMatch = async () => {
    setError(null);
    const result = await runAgent("genre_match", { description: seedContext() });
    if (!result) {
      setError("题材匹配失败，请检查 AI 配置后重试");
      return;
    }
    setGenreResult(result.content);
    const parsed = parseJsonSafe(result.content);
    const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    if (candidates.length > 0) {
      setGenreCandidates(candidates);
      const first = candidates[0] as GenreCandidate;
      setSelectedGenre(first.genre_name);
      setSelectedGenreId(first.genre_id);
      const template = matchGenreTemplate(candidates, genreTemplates);
      if (template) setSelectedGenreTemplateId(template.id);
      confirm(1);
    }
  };

  const handleStyleGeneration = async () => {
    setError(null);
    const genreName = selectedGenre || genreCandidates[0]?.genre_name || "通用";
    const recommended = matchStyleProfile(genreName, styleProfiles);
    if (recommended) setSelectedStyleProfileId(recommended.id);
    const result = await runAgent("style_extractor", {
      text: [
        "请为以下长篇小说开书方案生成一份项目文风指南，返回 JSON。",
        seedContext(),
        `题材: ${genreName}`,
        selectedGenreTemplate ? `题材模板: ${stringifyPretty(selectedGenreTemplate)}` : "",
        recommended ? `推荐文风档案: ${recommended.name}\n${recommended.metrics}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    if (!result) {
      setError("文风生成失败，请检查 AI 配置后重试");
      return;
    }
    setStyleRawResult(result.content);
    const parsed = parseJsonSafe(result.content);
    if (parsed?.style_name) setStyleAnalysis(parsed as StyleAnalysis);
    confirm(2);
  };

  const handleGenerateVolumes = async () => {
    setError(null);
    const result = await runAgent("volume_outline", {
      description: seedContext(),
      genre: selectedGenre || genreCandidates[0]?.genre_name || "待定",
      target_volumes: String(targetVolumes),
      style_preference: styleAnalysis?.style_name || selectedStyleProfile?.name || "AI 推荐文风",
      genre_template: selectedGenreTemplate ? stringifyPretty(selectedGenreTemplate) : "",
    });
    if (!result) {
      setError("卷纲生成失败，请检查 AI 配置后重试");
      return;
    }
    const parsed = parseJsonSafe(result.content);
    if (Array.isArray(parsed?.volumes)) {
      setVolumesParsed(parsed.volumes);
      setVolumeStructure(
        parsed.volumes
          .map(
            (v: VolumeInfo) =>
              `第${v.volume_number}卷: ${v.title}\n目标: ${v.goal}\n冲突: ${v.main_conflict}\n高潮: ${v.climax}\n余波: ${v.settlement}`,
          )
          .join("\n\n"),
      );
    } else {
      setVolumeStructure(result.content);
      setVolumesParsed([]);
    }
    confirm(3);
  };

  const handleGenerateOutline = async () => {
    setError(null);
    const result = await runAgent("book_outline", {
      description: seedContext(),
      genre: selectedGenre || genreCandidates[0]?.genre_name || "待定",
      volume_structure: volumeStructure,
      style_preference: styleAnalysis?.style_name || selectedStyleProfile?.name || "AI 推荐文风",
      genre_template: selectedGenreTemplate ? stringifyPretty(selectedGenreTemplate) : "",
    });
    if (!result) {
      setError("全书大纲生成失败，请检查 AI 配置后重试");
      return;
    }
    setOutlineResult(result.content);
    confirm(4);
  };

  const handleCharactersAndSoul = async () => {
    setError(null);
    const characterBrief = [
      "请基于开书素材生成主角、核心配角、主要对手等 4-6 个角色。",
      seedContext(),
      `题材: ${selectedGenre || "待定"}`,
      `卷纲: ${volumeStructure.slice(0, 1200)}`,
      `全书大纲: ${outlineResult.slice(0, 1600)}`,
    ].join("\n\n");
    const result = await runAgent("name_generator", {
      genre: selectedGenre || genreCandidates[0]?.genre_name || "通用",
      world_framework: description,
      character_descriptions: characterBrief,
      banned_names: "",
    });
    if (!result) {
      setError("角色生成失败，请检查 AI 配置后重试");
      return;
    }
    setNamingResult(result.content);
    const parsed = parseJsonSafe(result.content);
    const chars: CharacterNames[] = Array.isArray(parsed?.characters)
      ? parsed.characters.map((c: any) => ({
          role: c.role || c.role_type || "主要角色",
          candidates: Array.isArray(c.candidates)
            ? c.candidates
            : c.name
              ? [{ name: c.name, reason: c.reason }]
              : [],
          selectedName: c.selectedName || c.name || c.candidates?.[0]?.name || "",
          identity_core: c.identity_core || c.identity || c.description,
          core_motivation: c.core_motivation || c.motivation,
          description: c.description,
        }))
      : [];
    setCharacterNames(chars);

    const results = new Map<string, SoulMatchResult>();
    for (const char of chars) {
      const name = char.selectedName || char.candidates[0]?.name || char.role;
      const soul = await runAgent("soul_matcher", {
        name,
        role_type: char.role,
        identity_core: [char.identity_core, char.core_motivation, char.description, outlineResult.slice(0, 800)]
          .filter(Boolean)
          .join("\n"),
        soul_templates: "使用内置 SOUL 模板库",
      });
      if (soul) {
        setSoulRawResult(soul.content);
        const parsedSoul = parseJsonSafe(soul.content);
        if (parsedSoul?.matched_template) results.set(name, parsedSoul as SoulMatchResult);
      }
    }
    setSoulResults(results);
    confirm(5);
  };

  const handleBookTitle = async () => {
    setError(null);
    const result = await runAgent("book_title", {
      description: seedContext(),
      genre: selectedGenre || genreCandidates[0]?.genre_name || "待定",
      main_conflict: volumeStructure.split("\n").slice(0, 8).join(" "),
      outline_summary: outlineResult.slice(0, 900),
    });
    if (!result) {
      setError("书名生成失败，请检查 AI 配置后重试");
      return;
    }
    setTitleResult(result.content);
    const parsed = parseJsonSafe(result.content);
    if (Array.isArray(parsed?.candidates)) {
      setTitleCandidates(parsed.candidates);
      setSelectedTitle(parsed.candidates[0]?.title || projectName || "");
    }
    confirm(6);
  };

  const runQuickStartPipeline = async () => {
    if (!canStart || autoRunning) return;
    setAutoRunning(true);
    setError(null);
    try {
      confirm(0);
      setCurrentStep(1);
      await handleGenreMatch();
      setCurrentStep(2);
      await handleStyleGeneration();
      setCurrentStep(3);
      await handleGenerateVolumes();
      setCurrentStep(4);
      await handleGenerateOutline();
      setCurrentStep(5);
      await handleCharactersAndSoul();
      setCurrentStep(6);
      await handleBookTitle();
    } finally {
      setAutoRunning(false);
    }
  };

  const handleCreateProject = async () => {
    setCreating(true);
    setError(null);
    try {
      const title = selectedTitle || titleCandidates[0]?.title || projectName || "未命名作品";
      const project = await projectApi.create({
        title,
        genre_id: selectedGenreId || undefined,
        logline: description.trim(),
        target_volumes: targetVolumes,
      });
      await switchProject(project.id);
      await projectApi.update(title, "active");

      if (selectedGenreTemplateId) {
        await sharedResourcesApi.applyGenreTemplate(selectedGenreTemplateId);
      }
      if (selectedStyleProfileId) {
        await sharedResourcesApi.applyStyleProfile(selectedStyleProfileId);
      }

      await outlineApi.saveBookOutline(
        JSON.stringify({
          source: "quick_start",
          seed: {
            project_name: projectName,
            description,
            target_readers: targetReaders,
            core_thrills: coreThrills,
            target_volumes: targetVolumes,
          },
          genre: {
            selected_genre: selectedGenre,
            selected_genre_id: selectedGenreId,
            candidates: genreCandidates,
            template: selectedGenreTemplate,
          },
          style: {
            profile: selectedStyleProfile,
            analysis: styleAnalysis,
            raw: styleRawResult,
          },
          volumes: volumesParsed,
          volume_structure: volumeStructure,
          outline: outlineResult,
          characters: characterNames,
          titles: titleCandidates,
          selected_title: title,
        }),
        "快速开始: AI 全流程开书",
      );

      if (selectedGenre) {
        await canonApi.create({
          rule_key: "quick_start_genre",
          rule_name: "快速开始题材设定",
          rule_type: "world",
          scope_type: "book",
          content: [
            `题材: ${selectedGenre}`,
            selectedGenreTemplate ? `题材模板: ${stringifyPretty(selectedGenreTemplate)}` : "",
            genreCandidates[0]?.reason ? `匹配理由: ${genreCandidates[0].reason}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          is_hard: true,
          source_type: "quick_start",
        });
      }

      await canonApi.create({
        rule_key: "quick_start_style_guide",
        rule_name: "快速开始文风指南",
        rule_type: "style",
        scope_type: "book",
        content: [
          selectedStyleProfile ? `应用文风档案: ${selectedStyleProfile.name}` : "",
          selectedStyleProfile ? stringifyPretty(selectedStyleProfile) : "",
          styleAnalysis?.writing_guidelines
            ? `AI 文风指南: ${styleAnalysis.writing_guidelines}`
            : styleRawResult,
        ]
          .filter(Boolean)
          .join("\n\n"),
        is_hard: false,
        source_type: "quick_start",
      });

      for (const char of characterNames) {
        const name = char.selectedName || char.candidates[0]?.name || char.role;
        const soulData = soulResults.get(name);
        const soulJson = soulData ? JSON.stringify(soulData) : "{}";
        const created = await chapterApi.createCharacter(name, char.role, soulJson);
        await chapterApi.updateCharacter(
          created.id,
          name,
          soulJson,
          char.role,
          char.identity_core || char.description || `${selectedGenre || "本书"}${char.role}`,
          soulData?.customization?.personality
            ? JSON.stringify(soulData.customization.personality)
            : undefined,
          char.core_motivation ||
            (soulData?.customization?.behavior
              ? Object.values(soulData.customization.behavior).join("；")
              : undefined),
        );
      }

      await refreshBookshelf();
      navigate(`/project/${project.id}/dashboard`);
    } catch (e: any) {
      setError(`创建项目失败: ${e?.message || String(e)}`);
    } finally {
      setCreating(false);
    }
  };

  const renderActionButton = (
    label: string,
    onClick: () => Promise<void> | void,
    disabled = false,
    icon: "sparkles" | "refresh" = "sparkles",
  ) => (
    <button
      onClick={onClick}
      disabled={running || autoRunning || disabled}
      className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm"
    >
      {running || autoRunning ? (
        <Loader2 size={15} className="animate-spin" />
      ) : icon === "refresh" ? (
        <RefreshCw size={15} />
      ) : (
        <Sparkles size={15} />
      )}
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate("/")} className="p-2 hover:bg-gray-200 rounded-lg">
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Zap size={22} className="text-amber-500" />
              AI 自动开书流程
            </h1>
          </div>
          <button
            onClick={() => navigate("/setup")}
            className="px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50 rounded-lg"
          >
            进入完整开书向导
          </button>
        </div>

        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-900">
            快速开始会根据故事种子自动生成题材、文风、卷纲、大纲、角色、SOUL 和书名。
            每一步都可以重生成或手动确认；最终只创建项目和开书素材，不自动生成正文。
          </p>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-700">
              步骤 {currentStep + 1} / {steps.length}: {steps[currentStep].label}
            </h2>
            <span className="text-sm text-gray-500">
              {Math.round((confirmed.filter(Boolean).length / steps.length) * 100)}% 完成
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 transition-all duration-500"
              style={{ width: `${(confirmed.filter(Boolean).length / steps.length) * 100}%` }}
            />
          </div>
          <div className="flex items-start gap-0 overflow-x-auto pb-2 mt-4">
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-start shrink-0">
                <button onClick={() => setCurrentStep(i)} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      confirmed[i]
                        ? "bg-green-500 text-white"
                        : i === currentStep
                          ? running || autoRunning
                            ? "bg-amber-100 text-amber-700 ring-2 ring-amber-500 animate-pulse"
                            : "bg-amber-100 text-amber-700 ring-2 ring-amber-500"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {confirmed[i] ? (
                      <Check size={14} />
                    ) : (running || autoRunning) && i === currentStep ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`text-[10px] mt-0.5 whitespace-nowrap ${
                      i <= currentStep ? "text-amber-700 font-medium" : "text-gray-400"
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
                {i < steps.length - 1 && (
                  <div className="w-14 h-0.5 mx-1 mt-4 rounded bg-gray-200">
                    <div
                      className="h-full rounded bg-amber-500 transition-all"
                      style={{ width: confirmed[i] ? "100%" : "0%" }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-6 min-h-[460px]">
          {currentStep === 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">故事种子</h2>
              <p className="text-gray-500 text-sm mb-4">
                输入核心灵感即可。项目名可以是暂名，最终会用 AI 书名候选覆盖。
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="项目暂名，例如：星海旧神"
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="number"
                  value={targetVolumes}
                  onChange={(e) => setTargetVolumes(Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  max={30}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="核心简介：主角是谁，处在什么世界，遇到什么危机，最终想抵达什么目标..."
                className="w-full h-44 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                autoFocus
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                <input
                  value={targetReaders}
                  onChange={(e) => setTargetReaders(e.target.value)}
                  placeholder="目标读者，可选"
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  value={coreThrills}
                  onChange={(e) => setCoreThrills(e.target.value)}
                  placeholder="核心爽点，可选"
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={runQuickStartPipeline}
                  disabled={!canStart || autoRunning || running}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {autoRunning ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {autoRunning ? "AI 自动开书中..." : "AI 自动生成全套开书素材"}
                </button>
                <button
                  onClick={() => {
                    confirm(0);
                    setCurrentStep(1);
                  }}
                  disabled={!canStart}
                  className="flex items-center gap-2 px-4 py-2 text-amber-700 hover:bg-amber-50 rounded-lg disabled:opacity-50"
                >
                  手动逐步生成
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {currentStep === 1 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 题材生成</h2>
              <p className="text-gray-500 text-sm mb-4">
                题材会映射到资源库模板，影响世界观框架、卷节奏、爽点和禁忌。
              </p>
              {renderActionButton(genreCandidates.length ? "重新匹配题材" : "开始匹配题材", handleGenreMatch, !canStart, genreCandidates.length ? "refresh" : "sparkles")}
              {genreCandidates.length > 0 && (
                <div className="mt-4 space-y-3">
                  {genreCandidates.map((c) => (
                    <button
                      key={c.genre_id}
                      onClick={() => {
                        setSelectedGenre(c.genre_name);
                        setSelectedGenreId(c.genre_id);
                        const template = matchGenreTemplate([c], genreTemplates);
                        if (template) setSelectedGenreTemplateId(template.id);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedGenre === c.genre_name
                          ? "border-amber-500 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-gray-900">{c.genre_name}</span>
                        <span className="text-sm text-amber-700">匹配度 {c.match_score}/10</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{c.reason}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.typical_features?.map((f, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-white text-gray-600 rounded border">
                            {f}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                  <select
                    value={selectedGenreTemplateId}
                    onChange={(e) => setSelectedGenreTemplateId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">不应用题材模板</option>
                    {genreTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        应用模板: {t.genre_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {genreResult && genreCandidates.length === 0 && (
                <pre className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-64 overflow-auto">
                  {genreResult}
                </pre>
              )}
            </div>
          )}

          {currentStep === 2 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 文风生成</h2>
              <p className="text-gray-500 text-sm mb-4">
                文风档案会应用到项目设置，AI 生成的文风指南会写入正典软规则。
              </p>
              {renderActionButton(styleRawResult ? "重新生成文风" : "生成文风指南", handleStyleGeneration, !selectedGenre, styleRawResult ? "refresh" : "sparkles")}
              <div className="mt-4">
                <label className="text-sm text-gray-600">应用资源库文风档案</label>
                <select
                  value={selectedStyleProfileId}
                  onChange={(e) => setSelectedStyleProfileId(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">不应用文风档案，仅保存 AI 文风指南</option>
                  {styleProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              {styleAnalysis && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <h3 className="font-medium text-amber-950">{styleAnalysis.style_name}</h3>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                    <p>叙事视角: {styleAnalysis.narrative_perspective || "未说明"}</p>
                    <p>语言风格: {styleAnalysis.language_style || "未说明"}</p>
                    <p>对白风格: {styleAnalysis.dialogue_style || "未说明"}</p>
                    <p>节奏: {styleAnalysis.rhythm || "未说明"}</p>
                  </div>
                  {styleAnalysis.writing_guidelines && (
                    <p className="mt-3 text-sm text-gray-700 bg-white p-3 rounded border">
                      {styleAnalysis.writing_guidelines}
                    </p>
                  )}
                </div>
              )}
              {styleRawResult && !styleAnalysis && (
                <pre className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-64 overflow-auto">
                  {styleRawResult}
                </pre>
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 卷纲生成</h2>
              <p className="text-gray-500 text-sm mb-4">
                卷纲会随全书大纲一起保存，作为后续章节规划的上游素材。
              </p>
              {renderActionButton(volumeStructure ? "重新生成卷纲" : "生成卷纲", handleGenerateVolumes, !selectedGenre, volumeStructure ? "refresh" : "sparkles")}
              {volumesParsed.length > 0 ? (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {volumesParsed.map((v) => (
                    <div key={v.volume_number} className="p-3 border border-gray-200 rounded-lg">
                      <h3 className="font-medium text-gray-900">
                        第{v.volume_number}卷: {v.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">目标: {v.goal}</p>
                      <p className="text-sm text-amber-700 mt-1">冲突: {v.main_conflict}</p>
                      <p className="text-sm text-red-700 mt-1">高潮: {v.climax}</p>
                    </div>
                  ))}
                </div>
              ) : volumeStructure ? (
                <pre className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-80 overflow-auto">
                  {volumeStructure}
                </pre>
              ) : null}
            </div>
          )}

          {currentStep === 4 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 全书大纲生成</h2>
              <p className="text-gray-500 text-sm mb-4">
                全书大纲会和卷纲一起落库，进入项目后可继续细化章节。
              </p>
              {renderActionButton(outlineResult ? "重新生成大纲" : "生成全书大纲", handleGenerateOutline, !volumeStructure, outlineResult ? "refresh" : "sparkles")}
              {outlineResult && (
                <pre className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-96 overflow-auto">
                  {outlineResult}
                </pre>
              )}
            </div>
          )}

          {currentStep === 5 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 角色与 SOUL</h2>
              <p className="text-gray-500 text-sm mb-4">
                角色会创建到角色档案，SOUL 会保存到角色的灵魂模板数据。
              </p>
              {renderActionButton(characterNames.length ? "重新生成角色/SOUL" : "生成角色/SOUL", handleCharactersAndSoul, !outlineResult, characterNames.length ? "refresh" : "sparkles")}
              {characterNames.length > 0 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {characterNames.map((c, idx) => {
                    const name = c.selectedName || c.candidates[0]?.name || c.role;
                    const soul = soulResults.get(name);
                    return (
                      <div key={`${c.role}-${idx}`} className="p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-medium text-gray-900">{name}</h3>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            {c.role}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600">
                          {compactText(c.identity_core || c.description || c.core_motivation || "AI 已生成角色基础档案")}
                        </p>
                        <p className="mt-2 text-xs text-amber-700">
                          SOUL: {soul?.matched_template || "待匹配/使用默认"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
              {namingResult && characterNames.length === 0 && (
                <pre className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-80 overflow-auto">
                  {namingResult}
                  {soulRawResult ? `\n\n${soulRawResult}` : ""}
                </pre>
              )}
            </div>
          )}

          {currentStep === 6 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 书名与创建项目</h2>
              <p className="text-gray-500 text-sm mb-4">
                选择书名后，系统会创建项目并保存题材模板、文风档案、卷纲、大纲、角色和 SOUL。
              </p>
              {renderActionButton(titleCandidates.length ? "重新生成书名" : "生成书名候选", handleBookTitle, !outlineResult, titleCandidates.length ? "refresh" : "sparkles")}
              {titleCandidates.length > 0 && (
                <div className="mt-4 space-y-3">
                  {titleCandidates.map((t, idx) => (
                    <button
                      key={`${t.title}-${idx}`}
                      onClick={() => setSelectedTitle(t.title)}
                      className={`w-full text-left p-3 rounded-lg border ${
                        selectedTitle === t.title
                          ? "border-amber-500 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">{t.title}</span>
                        {t.collision_risk && (
                          <span className="text-xs text-gray-500">撞名风险: {t.collision_risk}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {t.approach ? `${t.approach} - ` : ""}
                        {t.reason || "AI 推荐书名"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {titleResult && titleCandidates.length === 0 && (
                <pre className="mt-4 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-64 overflow-auto">
                  {titleResult}
                </pre>
              )}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="font-medium text-gray-900 mb-3">配置摘要</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                  <p>书名: {selectedTitle || titleCandidates[0]?.title || projectName || "待定"}</p>
                  <p>题材: {selectedGenre || "待生成"}</p>
                  <p>题材模板: {selectedGenreTemplate?.genre_name || "未应用"}</p>
                  <p>文风档案: {selectedStyleProfile?.name || "未应用"}</p>
                  <p>卷数: {volumesParsed.length || targetVolumes}</p>
                  <p>角色: {characterNames.length} 个</p>
                </div>
              </div>
              <button
                onClick={handleCreateProject}
                disabled={creating || running || autoRunning || !description.trim()}
                className="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-base font-medium"
              >
                {creating ? <Loader2 size={18} className="animate-spin" /> : <BookOpen size={18} />}
                {creating ? "创建并写入开书素材中..." : "创建项目并进入看板"}
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-6">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0 || creating || autoRunning}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            <ArrowLeft size={16} />
            上一步
          </button>
          {currentStep < steps.length - 1 && (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={(currentStep === 0 && !canStart) || creating || autoRunning}
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
