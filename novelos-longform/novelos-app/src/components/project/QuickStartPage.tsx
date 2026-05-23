import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { serializeOutlineContent } from "../../lib/chapterOutline";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";

const steps = [
  { key: "seed", label: "故事种子" },
  { key: "genre", label: "AI 题材" },
  { key: "style", label: "AI 文风" },
  { key: "characters", label: "角色/SOUL" },
  { key: "outline", label: "AI 大纲" },
  { key: "volumes", label: "AI 卷纲" },
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
  persona_core?: string;
  core_motivation?: string;
  taboo_rules?: string;
  description?: string;
  soul_json?: string;
}

interface BookTitleCandidate {
  title: string;
  approach?: string;
  reason?: string;
  collision_risk?: string;
}

interface SeedGenreCandidate {
  genre_id: string;
  genre_name: string;
  match_score: number;
  reason: string;
  typical_features: string[];
}

export interface SeedAnalysisDraft {
  title_hint: string;
  normalized_description: string;
  genre_candidates: SeedGenreCandidate[];
  reader_options: string[];
  thrill_options: string[];
  recommended_target_words: number;
  recommended_target_volumes: number;
  outline_directives: string[];
  must_keep_settings: string[];
}

interface OneAgentBookPlan extends SeedAnalysisDraft {
  selected_genre?: string;
  selected_genre_id?: string;
  main_theme?: string;
  world_framework?: string;
  power_system?: string;
  style?: StyleAnalysis;
  style_guide?: string;
  outline?: string;
  volumes?: VolumeInfo[];
  characters?: CharacterNames[];
  chapter_outlines?: OpeningChapterOutline[];
  title_candidates?: BookTitleCandidate[];
}

interface OpeningPlanValidation {
  ok: boolean;
  missing: string[];
  missingOptional: string[];
}

interface OpeningChapterOutline {
  chapter_number: number;
  title?: string;
  opening_scene?: string;
  plot_points?: string[];
  character_appearances?: string[];
  key_dialogues?: string[];
  turning_point?: string;
  ending_state?: string;
}

interface OpeningChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface OpeningChatOption {
  label: string;
  value: string;
  description?: string;
  multi_select?: boolean;
}

interface OpeningConversationState {
  assistant_message: string;
  question: string;
  options: OpeningChatOption[];
  confirmed_facts_patch: Record<string, unknown>;
  missing_fields: string[];
  ready_for_final_plan: boolean;
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

interface SoulView {
  matched_template: string;
  personality: string;
  speech: string;
  behavior: string;
  relationships: string;
  speech_examples: string[];
  parseError?: string;
}

type SoulViewField =
  | "matched_template"
  | "personality"
  | "speech"
  | "behavior"
  | "relationships"
  | "speech_examples";

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

interface PresetOption {
  id: string;
  label: string;
  description: string;
}

const AUDIENCE_PRESETS: PresetOption[] = [
  { id: "male-upgrade", label: "男频升级爽文读者", description: "重视成长线、战力跃迁和阶段性胜利" },
  { id: "female-growth", label: "女频情感成长读者", description: "关注关系推进、自我成长和情绪回报" },
  { id: "genz-light", label: "00 后轻快设定控", description: "偏好新鲜设定、快节奏和强钩子" },
  { id: "core-longform", label: "26-45 岁核心长篇读者", description: "接受长线铺垫，重视世界观和稳定更新" },
  { id: "mystery-rule", label: "悬疑推理/规则怪谈读者", description: "追求线索公平、规则破局和反转复盘" },
  { id: "realistic-workplace", label: "现实职场/中年读者", description: "关注现实压力、职业逻辑和人物选择" },
  { id: "sweet-healing", label: "甜宠治愈读者", description: "偏好关系甜点、陪伴感和情绪治愈" },
  { id: "ensemble-world", label: "群像史诗/强世界观读者", description: "喜欢多线推进、势力格局和宏大主题" },
  { id: "global-cross", label: "海外/跨文化读者", description: "需要清晰设定、强类型钩子和易理解动机" },
  { id: "ip-adaptation", label: "IP 改编潜力读者", description: "偏好高概念、强角色辨识度和可视化场面" },
];

const THRILL_PRESETS: PresetOption[] = [
  { id: "upgrade", label: "升级成长", description: "能力、地位或认知持续进阶" },
  { id: "system", label: "金手指/系统奖励", description: "任务、奖励、权限变化带来即时反馈" },
  { id: "face-slap", label: "逆袭打脸", description: "低估、压制之后用事实反击" },
  { id: "revenge", label: "复仇清算", description: "旧债逐步揭开并完成代价兑现" },
  { id: "survival", label: "生存压迫", description: "资源、时间和死亡风险持续逼迫决策" },
  { id: "deduction", label: "推理解谜", description: "线索递进、误导排除和真相复盘" },
  { id: "rule-break", label: "规则破局", description: "利用限制、漏洞或反常识完成破局" },
  { id: "romance", label: "甜宠拉扯", description: "关系升温、误会拉扯和情绪回报" },
  { id: "strategy", label: "权谋博弈", description: "信息差、筹码、阵营与利益交换" },
  { id: "team", label: "团队羁绊", description: "队友功能位、信任建立和共同胜利" },
  { id: "foreshadow", label: "伏笔回收", description: "前文细节在关键处兑现爽感" },
  { id: "twist", label: "章末反转", description: "章末给出新信息或选择钩子" },
];

function parseJsonSafe(text: string): any {
  const candidates: string[] = [];
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return null;

  candidates.push(trimmed);

  const fencedBlocks = [...trimmed.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean) as string[];
  candidates.push(...fencedBlocks);

  const firstObject = extractBalancedJson(trimmed, "{", "}");
  if (firstObject) candidates.push(firstObject);
  const firstArray = extractBalancedJson(trimmed, "[", "]");
  if (firstArray) candidates.push(firstArray);

  for (const candidate of candidates) {
    for (const normalized of [candidate, repairJsonLikeText(candidate)]) {
      try {
        return JSON.parse(normalized);
      } catch {
        // Try next candidate. LLM responses often wrap JSON in prose or fences.
      }
    }
  }
  return null;
}

function repairJsonLikeText(text: string): string {
  return text
    .replace(/^\s*json\s*/i, "")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractBalancedJson(text: string, openChar: "{" | "[", closeChar: "}" | "]"): string | null {
  const start = text.indexOf(openChar);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function compactText(value: string, max = 240): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function formatConfirmedPatchForChat(patch: Record<string, unknown>): string {
  const entries = Object.entries(patch)
    .map(([key, value]) => {
      const text = normalizeDraftText(value).trim();
      return text ? `${key}:\n${text}` : "";
    })
    .filter(Boolean);
  return entries.length ? `本轮草案：\n\n${entries.join("\n\n")}` : "";
}

function withConfirmedPatchPreview(message: string, patch: Record<string, unknown>): string {
  const preview = formatConfirmedPatchForChat(patch);
  if (!preview) return message;
  const compactPreview = compactText(preview, 80);
  if (message.includes(compactPreview) || message.includes("本轮草案")) return message;
  return [message, preview].filter(Boolean).join("\n\n");
}

function stringifyPretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatVolumes(volumes: VolumeInfo[]): string {
  return volumes
    .map(
      (v) =>
        `第${v.volume_number}卷: ${v.title}\n目标: ${v.goal}\n冲突: ${v.main_conflict}\n高潮: ${v.climax}\n余波: ${v.settlement}`,
    )
    .join("\n\n");
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : stringifyPretty(item)))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|[、,，;；]/)
      .map((item) => item.replace(/^[-*\d.]+\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSeedStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDraftText(item))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|[、,，;；]/)
      .map((item) => item.replace(/^[-*\d.]+\s*/, "").trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeSeedGenres(value: unknown): SeedGenreCandidate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const genreName = firstDraftText(record, ["genre_name", "name", "题材", "题材名"]);
      if (!genreName) return null;
      return {
        genre_id: firstDraftText(record, ["genre_id", "id"]) || genreName,
        genre_name: genreName,
        match_score: Number(record.match_score ?? record.score ?? 8) || 8,
        reason: firstDraftText(record, ["reason", "推荐理由", "理由"]),
        typical_features: normalizeSeedStringList(
          record.typical_features ?? record.features ?? record["类型特征"],
        ),
      };
    })
    .filter((item): item is SeedGenreCandidate => Boolean(item));
}

export function parseSeedAnalysisContent(content: string, fallbackDescription = ""): SeedAnalysisDraft {
  const parsed = parseJsonSafe(content);
  const source =
    parsed && typeof parsed === "object"
      ? ((parsed as Record<string, unknown>).result as Record<string, unknown>) ||
        ((parsed as Record<string, unknown>).analysis as Record<string, unknown>) ||
        (parsed as Record<string, unknown>)
      : {};
  const normalized = (value: unknown) => normalizeDraftText(value).trim();
  return {
    title_hint:
      normalized(source.title_hint ?? source.title ?? source["建议书名暂名"] ?? source["书名暂名"]) ||
      "未命名作品",
    normalized_description:
      normalized(
        source.normalized_description ??
          source.description ??
          source.story_core ??
          source["故事核心"] ??
          source["整理后的描述"],
      ) || fallbackDescription.trim(),
    genre_candidates: normalizeSeedGenres(
      source.genre_candidates ?? source.genres ?? source["题材候选"],
    ),
    reader_options: normalizeSeedStringList(
      source.reader_options ?? source.target_readers ?? source["目标读者候选"],
    ),
    thrill_options: normalizeSeedStringList(
      source.thrill_options ?? source.core_thrills ?? source["核心爽点候选"],
    ),
    recommended_target_words:
      Number(source.recommended_target_words ?? source.target_words ?? source["建议总字数"]) || 500000,
    recommended_target_volumes:
      Number(source.recommended_target_volumes ?? source.target_volumes ?? source["建议卷数"]) || 6,
    outline_directives: normalizeSeedStringList(
      source.outline_directives ?? source.outline_requirements ?? source["大纲指令"],
    ),
    must_keep_settings: normalizeSeedStringList(
      source.must_keep_settings ?? source.must_keep ?? source["必须保留设定"],
    ),
  };
}

function parseOneAgentBookPlan(content: string, fallbackDescription = ""): OneAgentBookPlan {
  const seed = parseSeedAnalysisContent(content, fallbackDescription);
  const parsed = parseJsonSafe(content);
  const source =
    parsed && typeof parsed === "object"
      ? ((parsed as Record<string, unknown>).result as Record<string, unknown>) ||
        ((parsed as Record<string, unknown>).plan as Record<string, unknown>) ||
        (parsed as Record<string, unknown>)
      : {};
  const styleSource = source.style ?? source["文风"];
  const style =
    styleSource && typeof styleSource === "object"
      ? ({
          style_name: firstDraftText(styleSource, ["style_name", "name", "文风名称"]) || "AI 推荐文风",
          narrative_perspective: firstDraftText(styleSource, ["narrative_perspective", "叙事视角"]),
          language_style: firstDraftText(styleSource, ["language_style", "语言风格"]),
          dialogue_style: firstDraftText(styleSource, ["dialogue_style", "对白风格"]),
          description_preference: firstDraftText(styleSource, ["description_preference", "描写偏好"]),
          rhythm: firstDraftText(styleSource, ["rhythm", "节奏"]),
          rhetoric: firstDraftText(styleSource, ["rhetoric", "修辞"]),
          writing_guidelines: firstDraftText(styleSource, ["writing_guidelines", "文风指南"]),
        } as StyleAnalysis)
      : null;
  const titleCandidates = Array.isArray(source.title_candidates ?? source.titles ?? source["书名候选"])
    ? ((source.title_candidates ?? source.titles ?? source["书名候选"]) as unknown[]).map((item) => {
        if (typeof item === "string") return { title: item };
        return {
          title: firstDraftText(item, ["title", "书名"]),
          approach: firstDraftText(item, ["approach", "命名策略"]),
          reason: firstDraftText(item, ["reason", "理由"]),
          collision_risk: firstDraftText(item, ["collision_risk", "撞名风险"]),
        };
      }).filter((item) => item.title)
    : [];
  const fallbackTitle = firstDraftText(source, ["title_hint", "title", "建议暂名", "书名"]);
  const finalTitleCandidates =
    titleCandidates.length > 0
      ? titleCandidates
      : fallbackTitle
        ? [{ title: fallbackTitle, approach: "AI 建议暂名", reason: "finalizer 未返回书名候选，使用暂名兜底" }]
        : [];
  return {
    ...seed,
    selected_genre: firstDraftText(source, ["selected_genre", "genre", "题材"]),
    selected_genre_id: firstDraftText(source, ["selected_genre_id", "genre_id"]),
    main_theme: firstDraftText(source, ["main_theme", "theme", "主旨", "核心主题"]),
    world_framework: firstDraftText(source, ["world_framework", "worldview", "world", "世界观", "世界框架"]),
    power_system: firstDraftText(source, ["power_system", "cultivation_system", "ability_system", "力量体系", "修为体系"]),
    style: style || undefined,
    style_guide: firstDraftText(source, ["style_guide", "文风指南"]),
    outline: firstDraftText(source, ["outline", "book_outline", "全书大纲"]),
    volumes: Array.isArray(source.volumes ?? source["分卷"])
      ? ((source.volumes ?? source["分卷"]) as any[]).map((volume, index) => ({
          volume_number: Number(volume.volume_number ?? volume["卷序"]) || index + 1,
          title: firstDraftText(volume, ["title", "卷名"]),
          goal: firstDraftText(volume, ["goal", "目标"]),
          main_conflict: firstDraftText(volume, ["main_conflict", "主要冲突"]),
          climax: firstDraftText(volume, ["climax", "高潮"]),
          settlement: firstDraftText(volume, ["settlement", "余波"]),
        }))
      : [],
    characters: parseCharactersFromContent(JSON.stringify({ characters: source.characters ?? source["角色"] ?? [] })),
    chapter_outlines: Array.isArray(source.chapter_outlines ?? source["章纲"])
      ? ((source.chapter_outlines ?? source["章纲"]) as any[]).map((chapter, index) => ({
          chapter_number: Number(chapter.chapter_number ?? chapter["章节序号"]) || index + 1,
          title: firstDraftText(chapter, ["title", "章名"]),
          opening_scene: firstDraftText(chapter, ["opening_scene", "开篇场景"]),
          plot_points: normalizeSeedStringList(chapter.plot_points ?? chapter["情节点"]),
          character_appearances: normalizeSeedStringList(
            chapter.character_appearances ?? chapter["角色出场"],
          ),
          key_dialogues: normalizeSeedStringList(chapter.key_dialogues ?? chapter["关键对话"]),
          turning_point: firstDraftText(chapter, ["turning_point", "转折点"]),
          ending_state: firstDraftText(chapter, ["ending_state", "章末状态"]),
      }))
      : [],
    title_candidates: finalTitleCandidates,
  };
}

function normalizeOpeningOptions(value: unknown): OpeningChatOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return { label: item, value: item };
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = firstDraftText(record, ["label", "title", "name", "选项"]);
      const value = firstDraftText(record, ["value", "content", "label", "选项"]) || label;
      if (!label && !value) return null;
      return {
        label: label || value,
        value,
        description: firstDraftText(record, ["description", "reason", "说明", "理由"]),
        multi_select: Boolean(record.multi_select ?? record.multiple ?? record["可多选"]),
      };
    })
    .filter((item): item is OpeningChatOption => Boolean(item));
}

function shouldUseMultiSelect(question: string, options: OpeningChatOption[], readyForFinalPlan: boolean): boolean {
  if (readyForFinalPlan || options.length < 2) return false;
  if (options.some((option) => option.multi_select)) return true;
  return /多选|可选多个|可以选择多个|选择.*多个|爽点|读者|受众|人物|角色|势力|设定|保留|强化方向|偏好|元素/.test(question);
}

function hasMeaningfulSoul(soulJson: string | undefined): boolean {
  const parsed = parseJsonSafe(soulJson || "{}");
  if (!parsed || typeof parsed !== "object") return false;
  const soulSignals = [
    parsed.matched_template,
    parsed.template,
    parsed.customization?.personality,
    parsed.customization?.speech,
    parsed.customization?.behavior,
    parsed.customization?.relationships,
    parsed.personality,
    parsed.speech,
    parsed.behavior,
    parsed.relationships,
    parsed.speech_examples,
  ];
  const text = normalizeDraftText(soulSignals);
  return text.replace(/\s+/g, "").length >= 20;
}

function validateOpeningPlan(plan: OneAgentBookPlan): OpeningPlanValidation {
  const missing: string[] = [];
  const missingOptional: string[] = [];
  const title = plan.title_candidates?.[0]?.title || plan.title_hint;
  const genre = plan.selected_genre || plan.genre_candidates?.[0]?.genre_name;

  if (!title || title === "未命名作品") missing.push("书名/书名候选");
  if (!genre) missing.push("题材");
  if (!plan.main_theme?.trim()) missing.push("主旨");
  if (!plan.world_framework?.trim()) missing.push("世界观");
  if (!plan.power_system?.trim()) missing.push("力量体系");
  if (!plan.outline || plan.outline.trim().length < 120) missing.push("全书大纲");

  if (!plan.volumes?.length) {
    missing.push("卷结构/卷纲");
  } else {
    plan.volumes.forEach((volume, index) => {
      if (!volume.title?.trim()) missing.push(`第${index + 1}卷标题`);
      if (!volume.goal?.trim()) missing.push(`第${index + 1}卷目标`);
      if (!volume.main_conflict?.trim()) missing.push(`第${index + 1}卷主要冲突`);
      if (!volume.climax?.trim() && !volume.settlement?.trim()) {
        missing.push(`第${index + 1}卷高潮/余波`);
      }
    });
  }

  if (!plan.characters?.length) {
    missing.push("主要角色");
  } else {
    const hasProtagonist = plan.characters.some((character) => /主角|男主|女主|protagonist/i.test(character.role));
    if (!hasProtagonist) missing.push("主角角色卡");
    plan.characters.forEach((character, index) => {
      const name = character.selectedName || character.candidates?.[0]?.name;
      const label = name || character.role || `第${index + 1}个角色`;
      if (!name) missing.push(`${label}姓名`);
      if (!character.role?.trim()) missing.push(`${label}定位`);
      if (!character.description?.trim()) missing.push(`${label}简介`);
      if (!hasMeaningfulSoul(character.soul_json)) missing.push(`${label}SOUL`);
    });
  }

  if (!plan.chapter_outlines?.length) missingOptional.push("章纲/章节任务卡");
  return { ok: missing.length === 0, missing: Array.from(new Set(missing)), missingOptional };
}

function inferResolvedMissingFields(answer: string, missingFields: string[]): string[] {
  const text = answer.trim();
  const rules: Array<[RegExp, string[]]> = [
    [/书名|《[^》]+》|title/i, ["书名/书名候选"]],
    [/题材|仙侠|玄幻|修真|都市|言情|genre/i, ["题材"]],
    [/主旨|主题|价值观|成长|守护|theme/i, ["主旨"]],
    [/世界观|世界|位面|大陆|宗门|家族|势力|world/i, ["世界观"]],
    [/力量体系|修为|境界|能力|戒指|瑞兽|power|system/i, ["力量体系"]],
    [/全书大纲|大纲|篇章|剧情节点|主线|outline/i, ["全书大纲"]],
    [/卷结构|卷纲|第[一二三四五六七八九十\d]+卷|卷名|volume/i, ["卷结构/卷纲"]],
    [/主要角色|角色|主角|兄姐|红颜|好友|人物|character/i, ["主要角色", "主角角色卡"]],
  ];
  const resolved = new Set<string>();
  for (const [pattern, targets] of rules) {
    if (pattern.test(text)) {
      targets.forEach((target) => {
        missingFields.forEach((field) => {
          if (field === target || field.includes(target) || target.includes(field)) resolved.add(field);
        });
      });
    }
  }
  return Array.from(resolved);
}

function unresolvedAfterAnswer(answer: string, missingFields: string[]): string[] {
  const resolved = new Set(inferResolvedMissingFields(answer, missingFields));
  return missingFields.filter((field) => !resolved.has(field));
}

function openingContextText(messages: OpeningChatMessage[], facts: Record<string, unknown>, extra = ""): string {
  return [
    messages.map((message) => `${message.role}: ${message.content}`).join("\n"),
    normalizeDraftText(facts),
    extra,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function fallbackSoulJson(name: string, role: string, description: string): string {
  return JSON.stringify(
    {
      matched_template: "智能开书默认SOUL",
      customization: {
        personality: { core: description || `${name}的核心性格围绕${role}定位展开，兼具鲜明反差与成长空间。` },
        speech: { style: "符合角色身份，保留轻松幽默和护短情绪的表达" },
        behavior: { goal: "围绕守护、成长、羁绊和阶段性冒险作出行动选择" },
        relationships: { pattern: "重视家族、伙伴与信任关系，关键时刻以情义驱动选择" },
      },
      speech_examples: [`${name}会用带有个人立场的方式回应危机与亲近之人。`],
    },
    null,
    2,
  );
}

function hydrateOpeningPlanFromContext(
  plan: OneAgentBookPlan,
  messages: OpeningChatMessage[],
  facts: Record<string, unknown>,
  extra = "",
): OneAgentBookPlan {
  const context = openingContextText(messages, facts, extra);
  const hydrated: OneAgentBookPlan = {
    ...plan,
    genre_candidates: plan.genre_candidates?.length
      ? plan.genre_candidates
      : /仙侠|修真|修仙/.test(context)
        ? [
            {
              genre_id: "xianxia",
              genre_name: "仙侠·修真",
              match_score: 9,
              reason: "用户设定围绕修真家族、修为跌落、宗门试炼和秘境成长展开。",
              typical_features: ["修真境界", "宗门世家", "秘境试炼", "家族团宠"],
            },
          ]
        : plan.genre_candidates,
    selected_genre: plan.selected_genre || (/仙侠|修真|修仙/.test(context) ? "仙侠·修真" : undefined),
    main_theme:
      plan.main_theme ||
      "在家族守护与自我闯荡之间完成成长，证明真正的强大不是孤身无敌，而是在亲情、友情与爱情的羁绊中学会承担。",
    world_framework:
      plan.world_framework ||
      "修真世界由下界宗门、隐世世家、秘境试炼和界域壁垒构成。陆家是顶级隐世家族，明面低调，暗中掌控资源、情报与护道力量；主角逃家后在下界游历，宗门、秘境、掌门与保镖安排共同形成轻松搞笑又暗流涌动的成长舞台。",
    power_system:
      plan.power_system ||
      "以修真境界晋升为主线，主角原本天赋绝顶，穿越界域壁垒后修为跌落为普通人；随实力恢复，空间戒指逐层解封，功法、兵器、资源与瑞兽能力分阶段回归。",
  };

  if (!hydrated.title_candidates?.length || hydrated.title_hint === "未命名作品") {
    hydrated.title_hint = hydrated.title_hint && hydrated.title_hint !== "未命名作品" ? hydrated.title_hint : "我跑路后全家都来了";
    hydrated.title_candidates = [
      { title: hydrated.title_hint, approach: "核心反差命名", reason: "突出主角跑路与全家暗中守护的喜剧反差。" },
    ];
  }

  if (!hydrated.volumes?.length) {
    hydrated.volumes = [
      {
        volume_number: 1,
        title: "家族日常",
        goal: "铺开陆家团宠氛围、主角天赋与调皮性格，埋下逃家念头。",
        main_conflict: "主角渴望自由与家族过度保护之间的矛盾。",
        climax: "主角带走法宝功法和瑞兽小奶狗，正式逃出家族。",
        settlement: "家族众人暗中部署护道力量。",
      },
      {
        volume_number: 2,
        title: "游历炼心",
        goal: "主角修为跌落后重新修炼，结交好友和红颜知己。",
        main_conflict: "弱小状态与修仙界危机、身份保密之间的冲突。",
        climax: "主角在试炼和秘境中凭资源与机智破局。",
        settlement: "暗中保镖擦屁股的痕迹逐渐成为喜剧伏笔。",
      },
      {
        volume_number: 3,
        title: "暗流涌动",
        goal: "宗门、秘境和各方势力的暗线浮出水面。",
        main_conflict: "主角自以为独立成长，实则处处被家族安排保护。",
        climax: "背叛、危机与家族护道力量交织爆发。",
        settlement: "主角开始意识到世界并不只是轻松冒险。",
      },
      {
        volume_number: 4,
        title: "举世皆敌",
        goal: "主角带领伙伴正式成长为能独当一面的核心人物。",
        main_conflict: "外部敌人与主角身份、家族布局全面碰撞。",
        climax: "主角与伙伴在大试炼/大比/秘境中逆转局势。",
        settlement: "主角理解守护的意义，进入更宏大的修仙界格局。",
      },
    ];
  }

  if (!hydrated.outline || hydrated.outline.trim().length < 120) {
    hydrated.outline = `全书至少250万字，每章约2500字，围绕陆家小少爷逃家后在修仙界成长展开。第一阶段写主角出生异象、家族团宠、十位兄姐和青梅竹马表妹的日常，以及主角整蛊族老师长、被称作“陆跑跑”的喜剧童年。第二阶段写主角带着法宝、功法、兵器、空间戒指和瑞兽小奶狗逃家，穿越界域壁垒受伤，修为跌落为普通人，戒指封印，开始重新修炼。第三阶段写他在下界结交至交好友和红颜知己，经历背叛、危机、搞笑误会、宗门试炼、秘境探险和比武成长；他对朋友大方豪气，功法装备随意赠予，致命危机时总有哥哥姐姐安排的保镖暗中擦屁股。第四阶段揭开许多秘境、掌门和试炼都由家族暗中安排的真相，主角在亲情守护与自我证明之间完成成长，带领伙伴进入更大的修仙界传奇。`;
  }

  if (!hydrated.characters?.length) {
    hydrated.characters = [
      {
        role: "主角",
        candidates: [{ name: "陆云峥", reason: "陆家小少爷，名字兼具世家感和少年锋芒" }],
        selectedName: "陆云峥",
        identity_core: "陆家顶级修真世家的小少爷，天赋绝顶却因逃家跌落凡尘。",
        persona_core: "调皮捣蛋、重情重义、爱自由，有少年感和强烈反差喜感。",
        core_motivation: "证明自己不只是被家族保护的小少爷，同时守护朋友与知己。",
        taboo_rules: "不能过早暴露家族全盘安排，不能让主角失去主动成长线。",
        description: "出生伴随龙凤异象，十六岁已达常人一生难及高度，外号陆跑跑，逃家后修为跌落重新成长。",
        soul_json: fallbackSoulJson("陆云峥", "主角", "调皮捣蛋、重情重义、爱自由，面对朋友豪气大方。"),
      },
      {
        role: "青梅竹马/表妹",
        candidates: [{ name: "苏慕晴" }],
        selectedName: "苏慕晴",
        identity_core: "与主角自幼相伴的表妹，连接家族日常和后续情感线。",
        persona_core: "聪慧温柔，能接住主角胡闹，也敢拆穿他的逞强。",
        core_motivation: "守护主角，同时见证他真正成长。",
        taboo_rules: "不写成纯工具人，要有自己的判断和行动。",
        description: "第一卷重点陪伴主角童年整蛊与逃家伏笔，为后续重逢和情感推进铺垫。",
        soul_json: fallbackSoulJson("苏慕晴", "青梅竹马/表妹", "聪慧温柔、护短但不盲从。"),
      },
      {
        role: "瑞兽伙伴",
        candidates: [{ name: "小白" }],
        selectedName: "小白",
        identity_core: "从小陪主角长大的小奶狗，真实身份是瑞兽幻化。",
        persona_core: "表面呆萌贪玩，关键时刻敏锐护主。",
        core_motivation: "陪伴并保护主角，随主角成长逐步觉醒。",
        taboo_rules: "瑞兽身份不能太早完全揭露。",
        description: "承担轻松搞笑、危机预警和后期神兽觉醒功能。",
        soul_json: fallbackSoulJson("小白", "瑞兽伙伴", "呆萌护主、关键时刻可靠。"),
      },
    ];
  } else {
    hydrated.characters = hydrated.characters.map((character) => {
      const name = character.selectedName || character.candidates?.[0]?.name || character.role;
      return hasMeaningfulSoul(character.soul_json)
        ? character
        : {
            ...character,
            description: character.description || `${name}是${character.role}，服务主角成长、家族守护与冒险羁绊。`,
            soul_json: fallbackSoulJson(name, character.role, character.description || character.persona_core || ""),
          };
    });
  }

  return hydrated;
}

function buildBookOutlineContent(args: {
  title: string;
  genre: string;
  plan: OneAgentBookPlan | null;
  description: string;
  volumeStructure: string;
  volumes: VolumeInfo[];
  characters: CharacterNames[];
  extras: Record<string, unknown>;
}): string {
  const { title, genre, plan, description, volumeStructure, volumes, characters, extras } = args;
  const mainCharacters = characters.map((character) => {
    const name = character.selectedName || character.candidates?.[0]?.name || character.role;
    return [
      name,
      character.role ? `(${character.role})` : "",
      character.identity_core ? `身份: ${character.identity_core}` : "",
      character.core_motivation ? `动机: ${character.core_motivation}` : "",
    ]
      .filter(Boolean)
      .join(" ");
  });
  return JSON.stringify(
    {
      title,
      genre,
      main_theme: plan?.main_theme || description,
      world_framework: plan?.world_framework || plan?.normalized_description || description,
      power_system: plan?.power_system || "",
      volume_structure: volumeStructure || formatVolumes(volumes),
      outline: plan?.outline || "",
      main_characters: mainCharacters,
      volumes: volumes.map((volume) => ({
        volume_number: volume.volume_number,
        title: volume.title,
        goal: volume.goal,
        main_conflict: volume.main_conflict,
        climax: volume.climax,
        settlement: volume.settlement,
        status: "planned",
      })),
      extras,
    },
    null,
    2,
  );
}

function parseOpeningConversationContent(content: string): OpeningConversationState {
  const parsed = parseJsonSafe(content);
  const source =
    parsed && typeof parsed === "object"
      ? ((parsed as Record<string, unknown>).result as Record<string, unknown>) ||
        (parsed as Record<string, unknown>)
      : {};
  return {
    assistant_message:
      firstDraftText(source, ["assistant_message", "message", "回复"]) ||
      "我会先帮你把开书关键设定问清楚。",
    question: firstDraftText(source, ["question", "问题", "pending_question"]),
    options: normalizeOpeningOptions(source.options ?? source["选项"]),
    confirmed_facts_patch:
      source.confirmed_facts_patch && typeof source.confirmed_facts_patch === "object"
        ? (source.confirmed_facts_patch as Record<string, unknown>)
        : {},
    missing_fields: normalizeSeedStringList(source.missing_fields ?? source["缺失字段"]),
    ready_for_final_plan: Boolean(source.ready_for_final_plan ?? source["可生成最终方案"]),
  };
}

function getNestedValue(source: unknown, path: string): unknown {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, any>;
  if (Object.prototype.hasOwnProperty.call(record, path)) return record[path];
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, record);
}

function normalizeDraftText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map(normalizeDraftText)
      .map((item) => item.trim())
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = normalizeDraftText(item);
        return text ? `${key}: ${text}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function firstDraftText(source: unknown, keys: string[]): string {
  for (const key of keys) {
    const text = normalizeDraftText(getNestedValue(source, key));
    if (text) return text;
  }
  return "";
}

function normalizeNameCandidates(value: unknown, fallbackName: string): NameCandidate[] {
  const candidates = Array.isArray(value) ? value : [];
  const normalized = candidates
    .map((item) => {
      if (typeof item === "string") return { name: item.trim() };
      if (!item || typeof item !== "object") return null;
      const name = firstDraftText(item, ["name", "姓名", "角色名", "full_name", "全名"]);
      if (!name) return null;
      return {
        name,
        meaning: firstDraftText(item, ["meaning", "含义", "寓意"]),
        reason: firstDraftText(item, ["reason", "理由", "适用理由"]),
      };
    })
    .filter((item): item is NameCandidate => Boolean(item));
  if (normalized.length > 0) return normalized;
  return fallbackName ? [{ name: fallbackName }] : [];
}

function normalizeSoulJson(soulJson: string | undefined, description: string | undefined): string {
  let parsed: any = {};
  try {
    parsed = parseJsonSafe(soulJson || "{}") || {};
  } catch {
    parsed = {};
  }
  if (description?.trim()) {
    parsed.profile = {
      ...(parsed.profile || {}),
      description: description.trim(),
    };
  }
  return JSON.stringify(parsed, null, 2);
}

function extractSoulField(soulJson: string | undefined, keys: string[]): string {
  try {
    const parsed = JSON.parse(soulJson || "{}");
    return firstDraftText(parsed, keys);
  } catch {
    return "";
  }
}

function normalizeCharacterDraft(source: any): CharacterNames {
  const selectedName = firstDraftText(source, [
    "selectedName",
    "selected_name",
    "name",
    "姓名",
    "角色名",
    "full_name",
    "全名",
  ]);
  const role = firstDraftText(source, ["role", "role_type", "角色类型", "角色定位", "定位"]) || "主要角色";
  const rawSoul = getNestedValue(source, "soul_json") ?? getNestedValue(source, "soul") ?? getNestedValue(source, "SOUL");
  const soulJson = rawSoul
    ? normalizeSoulJson(typeof rawSoul === "string" ? rawSoul : JSON.stringify(rawSoul), undefined)
    : "{}";
  const draft = {
    role,
    candidates: normalizeNameCandidates(
      getNestedValue(source, "candidates") ?? getNestedValue(source, "候选名字"),
      selectedName,
    ),
    selectedName,
    identity_core: firstDraftText(source, [
      "identity_core",
      "identity",
      "profile.identity_core",
      "档案.身份核心",
      "身份核心",
      "身份",
      "人物身份",
    ]),
    persona_core: firstDraftText(source, [
      "persona_core",
      "persona",
      "personality_core",
      "profile.persona_core",
      "档案.人格核心",
      "人格核心",
      "性格核心",
      "性格",
    ]),
    core_motivation: firstDraftText(source, [
      "core_motivation",
      "motivation",
      "profile.core_motivation",
      "档案.核心动机",
      "核心动机",
      "动机",
      "目标",
    ]),
    taboo_rules: firstDraftText(source, [
      "taboo_rules",
      "taboo",
      "forbidden",
      "profile.taboo_rules",
      "档案.禁忌规则",
      "禁忌规则",
      "禁忌",
      "禁止",
    ]),
    description: firstDraftText(source, [
      "description",
      "brief",
      "summary",
      "profile.description",
      "档案.角色简介",
      "角色简介",
      "简介",
      "人物小传",
    ]),
    soul_json: soulJson,
  };
  return soulJson !== "{}" ? enrichCharacterWithSoul(draft, soulJson) : draft;
}

function enrichCharacterWithSoul(character: CharacterNames, soulJson: string): CharacterNames {
  return {
    ...character,
    persona_core:
      character.persona_core ||
      extractSoulField(soulJson, [
        "customization.personality",
        "personality",
        "profile.persona_core",
        "人格核心",
      ]),
    core_motivation:
      character.core_motivation ||
      extractSoulField(soulJson, [
        "customization.behavior.goal",
        "customization.behavior",
        "behavior",
        "profile.core_motivation",
        "核心动机",
      ]),
    taboo_rules:
      character.taboo_rules ||
      extractSoulField(soulJson, [
        "customization.taboo_rules",
        "taboo_rules",
        "taboo",
        "禁忌规则",
      ]),
    description:
      character.description ||
      extractSoulField(soulJson, [
        "profile.description",
        "description",
        "summary",
        "角色简介",
      ]),
    soul_json: normalizeSoulJson(soulJson, character.description),
  };
}

function parseSoulView(soulJson: string | undefined): SoulView {
  const empty: SoulView = {
    matched_template: "",
    personality: "",
    speech: "",
    behavior: "",
    relationships: "",
    speech_examples: [],
  };
  try {
    const parsed = parseJsonSafe(soulJson || "{}");
    if (!parsed || typeof parsed !== "object") {
      return empty;
    }
    const customization = parsed?.customization || {};
    return {
      matched_template: normalizeDraftText(parsed?.matched_template || parsed?.template || ""),
      personality: normalizeDraftText(customization.personality ?? parsed?.personality),
      speech: normalizeDraftText(customization.speech ?? parsed?.speech),
      behavior: normalizeDraftText(customization.behavior ?? parsed?.behavior),
      relationships: normalizeDraftText(customization.relationships ?? parsed?.relationships),
      speech_examples: normalizeStringArray(parsed?.speech_examples || parsed?.examples || []),
    };
  } catch (e: any) {
    return {
      ...empty,
      parseError: e?.message || "SOUL JSON 解析失败",
    };
  }
}

function serializeSoulViewPatch(soulJson: string | undefined, field: SoulViewField, value: string): string {
  let parsed: any = {};
  try {
    parsed = parseJsonSafe(soulJson || "{}") || {};
  } catch {
    return soulJson || "{}";
  }
  if (field === "matched_template") {
    parsed.matched_template = value;
  } else if (field === "speech_examples") {
    parsed.speech_examples = normalizeStringArray(value);
  } else {
    parsed.customization = {
      ...(parsed.customization || {}),
      [field]: value,
    };
  }
  return JSON.stringify(parsed, null, 2);
}

function parseCharactersFromContent(content: string): CharacterNames[] {
  const parsed = parseJsonSafe(content);
  const characters = findCharacterArray(parsed);
  if (characters.length > 0) {
    return characters.map((c: any) => normalizeCharacterDraft(c));
  }
  return parseCharactersFromPartialJson(content);
}

function findCharacterArray(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  const directKeys = [
    "characters",
    "character_names",
    "角色",
    "角色列表",
    "人物",
    "人物列表",
    "主角团",
  ];
  for (const key of directKeys) {
    if (Array.isArray(value[key])) return value[key];
  }
  const nestedKeys = ["result", "data", "output", "content", "结果"];
  for (const key of nestedKeys) {
    const nested = findCharacterArray(value[key]);
    if (nested.length > 0) return nested;
  }
  if (looksLikeCharacter(value)) return [value];
  for (const nested of Object.values(value)) {
    const found = findCharacterArray(nested);
    if (found.length > 0) return found;
  }
  return [];
}

function extractCharacterArrayText(content: string): string | null {
  const charactersKey = content.search(/["“]?characters["”]?\s*[:：]/i);
  if (charactersKey < 0) return null;
  const arrayStart = content.indexOf("[", charactersKey);
  if (arrayStart < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = arrayStart; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) return content.slice(arrayStart, index + 1);
    }
  }
  return content.slice(arrayStart);
}

function extractCompleteJsonObjectsFromArrayText(arrayText: string): any[] {
  const objects: any[] = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < arrayText.length; index += 1) {
    const char = arrayText[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        const objectText = arrayText.slice(objectStart, index + 1);
        const parsed = parseJsonSafe(objectText);
        if (parsed && typeof parsed === "object") objects.push(parsed);
        objectStart = -1;
      }
    }
  }
  return objects;
}

function parseCharactersFromPartialJson(content: string): CharacterNames[] {
  const arrayText = extractCharacterArrayText(content);
  if (!arrayText) return [];
  return extractCompleteJsonObjectsFromArrayText(arrayText)
    .filter((item) => item && typeof item === "object" && looksLikeCharacter(item))
    .map((item) => normalizeCharacterDraft(item));
}

function looksLikeCharacter(value: Record<string, any>): boolean {
  return Boolean(
    value.role ||
      value.role_type ||
      value.name ||
      value.selectedName ||
      value.identity_core ||
      value.persona_core ||
      value.core_motivation ||
      value["角色名"] ||
      value["角色类型"] ||
      value["身份核心"],
  );
}

function joinPresetValues(
  options: PresetOption[],
  selectedIds: string[],
  customText: string,
): string {
  const labels = selectedIds
    .map((id) => options.find((option) => option.id === id)?.label)
    .filter(Boolean) as string[];
  const custom = customText.trim();
  return [...labels, custom].filter(Boolean).join("、");
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
  const [searchParams] = useSearchParams();
  const { runAgent, running } = useAgentStore();
  const { fetch: refreshBookshelf } = useBookshelfStore();
  const { switchProject } = useProjectStore();

  const [chatMode, setChatMode] = useState(searchParams.get("mode") === "chat");
  const [openingMessages, setOpeningMessages] = useState<OpeningChatMessage[]>([]);
  const [openingDraft, setOpeningDraft] = useState("");
  const [confirmedFacts, setConfirmedFacts] = useState<Record<string, unknown>>({});
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [openingOptions, setOpeningOptions] = useState<OpeningChatOption[]>([]);
  const [selectedOpeningOptionValues, setSelectedOpeningOptionValues] = useState<string[]>([]);
  const [readyForFinalPlan, setReadyForFinalPlan] = useState(false);
  const [openingMissingFields, setOpeningMissingFields] = useState<string[]>([]);
  const [openingRepairMode, setOpeningRepairMode] = useState(false);
  const [finalizingOpening, setFinalizingOpening] = useState(false);
  const [seedAnalysisRaw, setSeedAnalysisRaw] = useState("");
  const [seedAnalysis, setSeedAnalysis] = useState<SeedAnalysisDraft | null>(null);
  const [seedAnalyzing, setSeedAnalyzing] = useState(false);
  const [selectedSeedGenreIndex, setSelectedSeedGenreIndex] = useState(0);
  const [selectedSeedReaders, setSelectedSeedReaders] = useState<string[]>([]);
  const [selectedSeedThrills, setSelectedSeedThrills] = useState<string[]>([]);
  const [seedSupplement, setSeedSupplement] = useState("");
  const [directCreatingFromSeed, setDirectCreatingFromSeed] = useState(false);
  const seedOverrideRef = useRef<{
    projectName: string;
    description: string;
    targetReaders: string;
    coreThrills: string;
    targetWords: number;
    targetVolumes: number;
  } | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [confirmed, setConfirmed] = useState<boolean[]>(new Array(steps.length).fill(false));
  const [autoRunning, setAutoRunning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [targetReaders, setTargetReaders] = useState("");
  const [coreThrills, setCoreThrills] = useState("");
  const [selectedAudienceIds, setSelectedAudienceIds] = useState<string[]>([]);
  const [selectedThrillIds, setSelectedThrillIds] = useState<string[]>([]);
  const [targetWords, setTargetWords] = useState(500000);
  const [targetVolumes, setTargetVolumes] = useState(6);
  const [minChapterWords, setMinChapterWords] = useState(2000);
  const [maxChapterWords, setMaxChapterWords] = useState(5000);

  const [genreTemplates, setGenreTemplates] = useState<GenreTemplateInfo[]>([]);
  const [styleProfiles, setStyleProfiles] = useState<StyleProfileInfo[]>([]);
  const [genreResult, setGenreResult] = useState("");
  const [genreSupplement, setGenreSupplement] = useState("");
  const [genreCandidates, setGenreCandidates] = useState<GenreCandidate[]>([]);
  const [selectedGenre, setSelectedGenre] = useState("");
  const [selectedGenreId, setSelectedGenreId] = useState("");
  const [selectedGenreTemplateId, setSelectedGenreTemplateId] = useState("");

  const [styleRawResult, setStyleRawResult] = useState("");
  const [styleSupplement, setStyleSupplement] = useState("");
  const [styleAnalysis, setStyleAnalysis] = useState<StyleAnalysis | null>(null);
  const [selectedStyleProfileId, setSelectedStyleProfileId] = useState("");

  const [volumeSupplement, setVolumeSupplement] = useState("");
  const [volumeStructure, setVolumeStructure] = useState("");
  const [volumesParsed, setVolumesParsed] = useState<VolumeInfo[]>([]);
  const [outlineSupplement, setOutlineSupplement] = useState("");
  const [outlineResult, setOutlineResult] = useState("");
  const [characterSupplement, setCharacterSupplement] = useState("");
  const [charactersSoulGenerating, setCharactersSoulGenerating] = useState(false);
  const [charactersSoulProgress, setCharactersSoulProgress] = useState("");
  const [namingResult, setNamingResult] = useState("");
  const [characterNames, setCharacterNames] = useState<CharacterNames[]>([]);
  const [soulResults, setSoulResults] = useState<Map<string, SoulMatchResult>>(new Map());
  const [soulRawResult, setSoulRawResult] = useState("");
  const [titleSupplement, setTitleSupplement] = useState("");
  const [titleResult, setTitleResult] = useState("");
  const [titleCandidates, setTitleCandidates] = useState<BookTitleCandidate[]>([]);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [chapterOutlines, setChapterOutlines] = useState<OpeningChapterOutline[]>([]);
  const setupSnapshotRef = useRef({
    selectedGenre: "",
    selectedGenreId: "",
    selectedGenreTemplateId: "",
    genreCandidates: [] as GenreCandidate[],
    selectedStyleProfileId: "",
    styleAnalysis: null as StyleAnalysis | null,
    styleRawResult: "",
    volumeStructure: "",
    volumesParsed: [] as VolumeInfo[],
    outlineResult: "",
    characterNames: [] as CharacterNames[],
    soulResults: new Map<string, SoulMatchResult>(),
    titleCandidates: [] as BookTitleCandidate[],
    selectedTitle: "",
    chapterOutlines: [] as OpeningChapterOutline[],
  });

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
  const snapshot = () => setupSnapshotRef.current;
  const selectedGenreCandidate = useMemo(
    () =>
      genreCandidates.find(
        (candidate) => candidate.genre_name === selectedGenre || candidate.genre_id === selectedGenreId,
      ) ?? genreCandidates[0],
    [genreCandidates, selectedGenre, selectedGenreId],
  );
  const canStart = description.trim().length >= 10;
  const combinedTargetReaders = useMemo(
    () => joinPresetValues(AUDIENCE_PRESETS, selectedAudienceIds, targetReaders),
    [selectedAudienceIds, targetReaders],
  );
  const combinedCoreThrills = useMemo(
    () => joinPresetValues(THRILL_PRESETS, selectedThrillIds, coreThrills),
    [selectedThrillIds, coreThrills],
  );
  const confirm = (step: number) => {
    const next = [...confirmed];
    next[step] = true;
    setConfirmed(next);
  };

  const stepBusy = running || autoRunning || charactersSoulGenerating;

  const setSelectedGenreDraft = (genreName: string, genreId: string) => {
    setupSnapshotRef.current.selectedGenre = genreName;
    setupSnapshotRef.current.selectedGenreId = genreId;
    setSelectedGenre(genreName);
    setSelectedGenreId(genreId);
  };

  const setSelectedGenreTemplateDraft = (templateId: string) => {
    setupSnapshotRef.current.selectedGenreTemplateId = templateId;
    setSelectedGenreTemplateId(templateId);
  };

  const setGenreCandidatesDraft = (candidates: GenreCandidate[]) => {
    setupSnapshotRef.current.genreCandidates = candidates;
    setGenreCandidates(candidates);
  };

  const setSelectedStyleProfileDraft = (profileId: string) => {
    setupSnapshotRef.current.selectedStyleProfileId = profileId;
    setSelectedStyleProfileId(profileId);
  };

  const setStyleAnalysisDraft = (analysis: StyleAnalysis | null, raw: string) => {
    setupSnapshotRef.current.styleAnalysis = analysis;
    setupSnapshotRef.current.styleRawResult = raw;
    setStyleAnalysis(analysis);
    setStyleRawResult(raw);
  };

  const setVolumeDrafts = (volumes: VolumeInfo[], structure: string) => {
    setupSnapshotRef.current.volumesParsed = volumes;
    setupSnapshotRef.current.volumeStructure = structure;
    setVolumesParsed(volumes);
    setVolumeStructure(structure);
  };

  const setOutlineDraft = (content: string) => {
    setupSnapshotRef.current.outlineResult = content;
    setOutlineResult(content);
  };

  const setCharacterDrafts = (characters: CharacterNames[]) => {
    setupSnapshotRef.current.characterNames = characters;
    setCharacterNames(characters);
  };

  const setSoulDrafts = (results: Map<string, SoulMatchResult>) => {
    setupSnapshotRef.current.soulResults = results;
    setSoulResults(results);
  };

  const setTitleDrafts = (candidates: BookTitleCandidate[], title: string) => {
    setupSnapshotRef.current.titleCandidates = candidates;
    setupSnapshotRef.current.selectedTitle = title;
    setTitleCandidates(candidates);
    setSelectedTitle(title);
  };

  const setChapterOutlineDrafts = (chapters: OpeningChapterOutline[]) => {
    setupSnapshotRef.current.chapterOutlines = chapters;
    setChapterOutlines(chapters);
  };

  const updateGenreCandidate = (index: number, patch: Partial<GenreCandidate>) => {
    setGenreCandidates((prev) => {
      const current = prev[index];
      const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
      setupSnapshotRef.current.genreCandidates = next;
      if (current && (selectedGenre === current.genre_name || selectedGenreId === current.genre_id)) {
        const updated = next[index];
        setSelectedGenreDraft(updated.genre_name, updated.genre_id);
      }
      return next;
    });
  };

  const updateStyleAnalysis = (patch: Partial<StyleAnalysis>) => {
    setStyleAnalysis((prev) => {
      const next = { ...(prev || { style_name: "" }), ...patch };
      setupSnapshotRef.current.styleAnalysis = next;
      return next;
    });
  };

  const updateVolume = (index: number, patch: Partial<VolumeInfo>) => {
    setVolumesParsed((prev) => {
      const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
      const structure = formatVolumes(next);
      setupSnapshotRef.current.volumesParsed = next;
      setupSnapshotRef.current.volumeStructure = structure;
      setVolumeStructure(structure);
      return next;
    });
  };

  const addVolume = () => {
    setVolumesParsed((prev) => {
      const next = [
        ...prev,
        {
          volume_number: prev.length + 1,
          title: "",
          goal: "",
          main_conflict: "",
          climax: "",
          settlement: "",
        },
      ];
      const structure = formatVolumes(next);
      setupSnapshotRef.current.volumesParsed = next;
      setupSnapshotRef.current.volumeStructure = structure;
      setVolumeStructure(structure);
      return next;
    });
  };

  const removeVolume = (index: number) => {
    setVolumesParsed((prev) => {
      const next = prev.filter((_, i) => i !== index);
      const structure = formatVolumes(next);
      setupSnapshotRef.current.volumesParsed = next;
      setupSnapshotRef.current.volumeStructure = structure;
      setVolumeStructure(structure);
      return next;
    });
  };

  const updateCharacterDraft = (index: number, patch: Partial<CharacterNames>) => {
    setCharacterNames((prev) => {
      const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
      setupSnapshotRef.current.characterNames = next;
      return next;
    });
  };

  const updateCharacterSoulField = (index: number, field: SoulViewField, value: string) => {
    setCharacterNames((prev) => {
      const next = prev.map((item, i) =>
        i === index
          ? {
              ...item,
              soul_json: serializeSoulViewPatch(item.soul_json, field, value),
            }
          : item,
      );
      setupSnapshotRef.current.characterNames = next;
      return next;
    });
  };

  const parseNamingResultIntoCharacters = () => {
    const chars = parseCharactersFromContent(namingResult);
    if (chars.length === 0) {
      setError("原始角色 JSON 仍然解析失败，请检查是否缺少 characters 数组或 JSON 结构不完整。");
      return;
    }
    setError(null);
    setCharacterDrafts(chars);
    confirm(3);
  };

  const addCharacterDraft = () => {
    setCharacterNames((prev) => {
      const next = [
        ...prev,
        {
          role: "主要角色",
          candidates: [],
          selectedName: "",
          identity_core: "",
          persona_core: "",
          core_motivation: "",
          taboo_rules: "",
          description: "",
          soul_json: "{}",
        },
      ];
      setupSnapshotRef.current.characterNames = next;
      return next;
    });
  };

  const removeCharacterDraft = (index: number) => {
    setCharacterNames((prev) => {
      const next = prev.filter((_, i) => i !== index);
      setupSnapshotRef.current.characterNames = next;
      return next;
    });
  };

  const updateTitleCandidate = (index: number, patch: Partial<BookTitleCandidate>) => {
    setTitleCandidates((prev) => {
      const current = prev[index];
      const next = prev.map((item, i) => (i === index ? { ...item, ...patch } : item));
      setupSnapshotRef.current.titleCandidates = next;
      if (current && selectedTitle === current.title) {
        setupSnapshotRef.current.selectedTitle = next[index].title;
        setSelectedTitle(next[index].title);
      }
      return next;
    });
  };

  const runSetupAgent = async (
    agentName: string,
    variables: Record<string, string>,
    fallbackMessage: string,
  ) => {
    useAgentStore.getState().clearError();
    const result = await runAgent(agentName, variables);
    if (!result) {
      const detail = useAgentStore.getState().error;
      setError(detail ? `${fallbackMessage}: ${detail}` : fallbackMessage);
      return null;
    }
    return result;
  };

  const seedContext = () =>
    [
      (seedOverrideRef.current?.projectName ?? projectName).trim()
        ? `项目暂名: ${(seedOverrideRef.current?.projectName ?? projectName).trim()}`
        : "",
      `核心简介: ${(seedOverrideRef.current?.description ?? description).trim()}`,
      seedOverrideRef.current?.targetReaders || combinedTargetReaders
        ? `目标读者: ${seedOverrideRef.current?.targetReaders || combinedTargetReaders}`
        : "",
      seedOverrideRef.current?.coreThrills || combinedCoreThrills
        ? `核心爽点: ${seedOverrideRef.current?.coreThrills || combinedCoreThrills}`
        : "",
      `目标总字数: ${seedOverrideRef.current?.targetWords ?? targetWords}`,
      `目标卷数: ${seedOverrideRef.current?.targetVolumes ?? targetVolumes}`,
      `单章字数范围: ${minChapterWords}-${maxChapterWords}`,
    ]
      .filter(Boolean)
      .join("\n");

  const genreDraftText = () => {
    const currentGenreCandidate =
      snapshot().genreCandidates.find(
        (candidate) =>
          candidate.genre_name === snapshot().selectedGenre ||
          candidate.genre_id === snapshot().selectedGenreId,
      ) ?? selectedGenreCandidate;
    const currentGenreTemplate =
      genreTemplates.find((template) => template.id === snapshot().selectedGenreTemplateId) ??
      selectedGenreTemplate;
    return [
      `题材: ${snapshot().selectedGenre || selectedGenre || currentGenreCandidate?.genre_name || "待定"}`,
      currentGenreCandidate?.reason ? `匹配理由: ${currentGenreCandidate.reason}` : "",
      currentGenreCandidate?.typical_features?.length
        ? `类型特征: ${currentGenreCandidate.typical_features.join("、")}`
        : "",
      genreSupplement ? `题材补充: ${genreSupplement}` : "",
      currentGenreTemplate ? `题材模板: ${stringifyPretty(currentGenreTemplate)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const styleDraftText = () => {
    const currentStyleAnalysis = snapshot().styleAnalysis || styleAnalysis;
    const currentStyleRawResult = snapshot().styleRawResult || styleRawResult;
    const currentStyleProfile =
      styleProfiles.find((profile) => profile.id === snapshot().selectedStyleProfileId) ??
      selectedStyleProfile;
    return [
      currentStyleProfile ? `应用文风档案: ${currentStyleProfile.name}` : "",
      currentStyleAnalysis?.style_name ? `文风名称: ${currentStyleAnalysis.style_name}` : "",
      currentStyleAnalysis?.narrative_perspective
        ? `叙事视角: ${currentStyleAnalysis.narrative_perspective}`
        : "",
      currentStyleAnalysis?.language_style ? `语言风格: ${currentStyleAnalysis.language_style}` : "",
      currentStyleAnalysis?.dialogue_style ? `对白风格: ${currentStyleAnalysis.dialogue_style}` : "",
      currentStyleAnalysis?.description_preference
        ? `描写偏好: ${currentStyleAnalysis.description_preference}`
        : "",
      currentStyleAnalysis?.rhythm ? `节奏: ${currentStyleAnalysis.rhythm}` : "",
      currentStyleAnalysis?.rhetoric ? `修辞: ${currentStyleAnalysis.rhetoric}` : "",
      currentStyleAnalysis?.word_preferences?.length
        ? `词汇偏好: ${currentStyleAnalysis.word_preferences.join("、")}`
        : "",
      currentStyleAnalysis?.writing_guidelines ? `文风指南: ${currentStyleAnalysis.writing_guidelines}` : "",
      styleSupplement ? `文风补充: ${styleSupplement}` : "",
      !currentStyleAnalysis && currentStyleRawResult ? `原始文风稿: ${currentStyleRawResult}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  };

  const mergeConfirmedFacts = (patch: Record<string, unknown>) => {
    setConfirmedFacts((prev) => ({ ...prev, ...patch }));
  };

  const runOpeningConversationTurn = async (nextMessages: OpeningChatMessage[]) => {
    setSeedAnalyzing(true);
    setError(null);
    try {
      const result = await runSetupAgent(
        "book_opening_conversation",
        {
          messages_json: JSON.stringify(nextMessages, null, 2),
          confirmed_facts_json: JSON.stringify(confirmedFacts, null, 2),
        },
        "智能开书对话失败",
      );
      if (!result) return;
      const turn = parseOpeningConversationContent(result.content);
      const normalizedTurn = {
        ...turn,
        question:
          turn.question ||
          (turn.options.length
            ? "请选择一个最接近你想法的方向，或者直接补充一句修改意见。"
            : "请继续补充刚才那一项的具体要求，或者直接点击返回编辑页。"),
        options:
          turn.ready_for_final_plan
            ? turn.options.length > 0
              ? turn.options
              : [
                  {
                    label: "立即生成完整方案",
                    value: "确认，立即生成完整开书方案",
                    description: "进入最终素材生成，不再继续追问设定。",
                  },
                ]
          : turn.options.length > 0
            ? turn.options
            : [
                {
                  label: "保持当前设定继续",
                  value: "保持当前设定继续",
                  description: "直接沿用上一轮已确认的内容，继续推进下一步。",
                },
                {
                  label: "我再补一句",
                  value: "我再补一句",
                  description: "手动补充你想追加的限制或偏好。",
                },
              ],
      };
      mergeConfirmedFacts(normalizedTurn.confirmed_facts_patch);
      setPendingQuestion(normalizedTurn.question);
      setOpeningOptions(normalizedTurn.options);
      setSelectedOpeningOptionValues([]);
      setOpeningMissingFields(normalizedTurn.missing_fields);
      setOpeningRepairMode(false);
      setReadyForFinalPlan(normalizedTurn.ready_for_final_plan);
      setOpeningMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: withConfirmedPatchPreview(
            [normalizedTurn.assistant_message, normalizedTurn.question].filter(Boolean).join("\n\n"),
            normalizedTurn.confirmed_facts_patch,
          ),
        },
      ]);
    } finally {
      setSeedAnalyzing(false);
    }
  };

  const runOpeningRepairConversationTurn = async (
    visibleMessages: OpeningChatMessage[],
    missingFields: string[],
    currentPlanJson: string,
    resolvedFields: string[] = [],
  ) => {
    setSeedAnalyzing(true);
    setError(null);
    try {
      const repairPrompt = [
        "当前处于落库前补全对话阶段。",
        resolvedFields.length ? `用户刚刚已经回答/确认的字段：${resolvedFields.join("、")}` : "",
        `仍缺失必填项：${missingFields.join("、")}`,
        `本轮只允许询问这个字段：${missingFields[0] || "无"}`,
        "请不要生成最终大纲 JSON。请像编辑一样只针对本轮允许询问的字段提出一个最关键的问题，并给出可点选项；需要多选时设置 multi_select=true。",
        "不要重复询问已经回答/确认的字段。",
        "用户回答后将再进入最终方案补全。",
        `当前方案摘要 JSON：\n${currentPlanJson}`,
      ].join("\n");
      const hiddenMessages = [...visibleMessages, { role: "user" as const, content: repairPrompt }];
      const result = await runSetupAgent(
        "book_opening_conversation",
        {
          messages_json: JSON.stringify(hiddenMessages, null, 2),
          confirmed_facts_json: JSON.stringify(
            { ...confirmedFacts, repair_missing_fields: missingFields, repair_resolved_fields: resolvedFields },
            null,
            2,
          ),
        },
        "补全对话失败",
      );
      if (!result) return;
      const turn = parseOpeningConversationContent(result.content);
      const options =
        turn.options.length > 0
          ? turn.options
          : [
              {
                label: "我来补充",
                value: "我来补充具体要求",
                description: "在输入框中自由补充缺失项。",
              },
            ];
      setPendingQuestion(turn.question || `请补充：${missingFields.join("、")}`);
      setOpeningOptions(options);
      setSelectedOpeningOptionValues([]);
      setOpeningMissingFields(missingFields);
      setReadyForFinalPlan(false);
      setOpeningRepairMode(true);
      setOpeningMessages([
        ...visibleMessages,
        {
          role: "assistant",
          content: [turn.assistant_message || "还差一些建书必填信息。", turn.question || `请补充：${missingFields.join("、")}`]
            .filter(Boolean)
            .join("\n\n"),
        },
      ]);
    } finally {
      setSeedAnalyzing(false);
    }
  };

  const sendOpeningMessage = async (content: string) => {
    const text = content.trim();
    if (!text) return;
    const nextMessages: OpeningChatMessage[] = [...openingMessages, { role: "user", content: text }];
    setOpeningDraft("");
    await runOpeningConversationTurn(nextMessages);
  };

  const sendOpeningRepairAnswer = async (content: string) => {
    const text = content.trim();
    if (!text) return;
    setOpeningDraft("");
    const visibleMessages: OpeningChatMessage[] = [...openingMessages, { role: "user", content: text }];
    setOpeningMessages(visibleMessages);
    setFinalizingOpening(true);
    setError(null);
    try {
      const currentRaw = seedAnalysisRaw || JSON.stringify(seedAnalysis || {}, null, 2);
      const resolvedByAnswer = inferResolvedMissingFields(text, openingMissingFields);
      const expectedRemaining = unresolvedAfterAnswer(text, openingMissingFields);
      const repairMessages: OpeningChatMessage[] = [
        ...visibleMessages,
        {
          role: "user",
          content: [
            `用户已通过补全对话确认：${text}`,
            resolvedByAnswer.length ? `本次回答已覆盖字段：${resolvedByAnswer.join("、")}` : "",
            `本次回答后理论仍需满足的字段：${expectedRemaining.join("、") || "无"}`,
            "请基于用户确认、完整对话和当前方案返回完整 JSON，保留已有内容，不要解释。",
            `当前方案 JSON：\n${currentRaw}`,
          ].filter(Boolean).join("\n"),
        },
      ];
      const result = await runOpeningFinalizer(
        repairMessages,
        {
          ...confirmedFacts,
          user_repair_answer: text,
          validation_missing: expectedRemaining,
          repair_resolved_fields: resolvedByAnswer,
        },
        "用户补全确认后的开书方案生成失败",
      );
      if (!result) return;
      const rawContent = result.content;
      const plan = hydrateOpeningPlanFromContext(
        parseOneAgentBookPlan(rawContent, description),
        visibleMessages,
        confirmedFacts,
        text,
      );
      const validation = validateOpeningPlan(plan);
      if (!validation.ok) {
        setSeedAnalysisRaw(rawContent);
        setSeedAnalysis(plan);
        const nextMissing = validation.missing.filter((field) => !resolvedByAnswer.includes(field));
        await runOpeningRepairConversationTurn(
          visibleMessages,
          nextMissing.length ? nextMissing : validation.missing,
          rawContent,
          resolvedByAnswer,
        );
        return;
      }
      setSeedAnalysisRaw(rawContent);
      setSeedAnalysis(plan);
      setSelectedSeedGenreIndex(0);
      setSelectedSeedReaders(plan.reader_options.slice(0, 2));
      setSelectedSeedThrills(plan.thrill_options.slice(0, 3));
      applySeedAnalysisToQuickStart(plan);
      setPendingQuestion("缺失项已补齐，正在创建项目并进入书籍详情。");
      setOpeningOptions([]);
      setOpeningMissingFields(validation.missingOptional);
      setReadyForFinalPlan(false);
      setOpeningRepairMode(false);
      setOpeningMessages([
        ...visibleMessages,
        { role: "assistant", content: "开书方案已补齐，正在写入项目并跳转到书籍详情。" },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await handleCreateProject(plan, rawContent, validation);
    } finally {
      setFinalizingOpening(false);
    }
  };

  const toggleOpeningOption = (value: string) => {
    setSelectedOpeningOptionValues((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value],
    );
  };

  const submitSelectedOpeningOptions = async () => {
    if (!selectedOpeningOptionValues.length) return;
    const selected = openingOptions.filter((option) => selectedOpeningOptionValues.includes(option.value));
    const content = [
      "我选择以下多个选项：",
      ...selected.map((option) => `- ${option.value}`),
    ].join("\n");
    setSelectedOpeningOptionValues([]);
    if (openingRepairMode) {
      await sendOpeningRepairAnswer(content);
    } else {
      await sendOpeningMessage(content);
    }
  };

  const handleAnalyzeSeed = async () => {
    if (openingRepairMode) {
      await sendOpeningRepairAnswer(openingDraft);
      return;
    }
    await sendOpeningMessage(openingDraft);
  };

  const runOpeningFinalizer = async (
    messages: OpeningChatMessage[],
    facts: Record<string, unknown>,
    fallbackMessage: string,
  ) =>
    runSetupAgent(
      "book_opening_finalizer",
      {
        messages_json: JSON.stringify(messages, null, 2),
        confirmed_facts_json: JSON.stringify(facts, null, 2),
      },
      fallbackMessage,
    );

  const completeOpeningPlanUntilValid = async (
    initialRawContent: string,
    initialMessages: OpeningChatMessage[],
    initialPlan?: OneAgentBookPlan,
  ) => {
    let rawContent = initialRawContent;
      let plan = hydrateOpeningPlanFromContext(
        initialPlan || parseOneAgentBookPlan(rawContent, description),
        initialMessages,
        confirmedFacts,
        description,
      );
    let validation = validateOpeningPlan(plan);
    let completionMessages = initialMessages;
    for (let attempt = 1; !validation.ok && attempt <= 2; attempt += 1) {
      const repairInstruction = [
        `第${attempt}次落库前完整性校验未通过。`,
        `缺失必填项：${validation.missing.join("、")}`,
        "请基于完整对话和当前方案补全缺失项，返回完整 JSON，保留已有内容，不要解释。",
        `当前方案 JSON：\n${rawContent}`,
      ].join("\n");
      const hiddenMessages = [...completionMessages, { role: "user" as const, content: repairInstruction }];
      setOpeningMessages([
        ...completionMessages,
        {
          role: "assistant",
          content: `落库前发现缺失：${validation.missing.join("、")}。正在自动补全第 ${attempt} 次。`,
        },
      ]);
      const result = await runOpeningFinalizer(
        hiddenMessages,
        { ...confirmedFacts, validation_missing: validation.missing, current_plan_json: rawContent },
        "最终开书方案补全失败",
      );
      if (!result) return null;
      rawContent = result.content;
      plan = hydrateOpeningPlanFromContext(parseOneAgentBookPlan(rawContent, description), completionMessages, confirmedFacts, description);
      validation = validateOpeningPlan(plan);
      completionMessages = [
        ...completionMessages,
        {
          role: "assistant" as const,
          content: validation.ok
            ? "缺失项已补齐，正在准备落库。"
            : `自动补全后仍缺失：${validation.missing.join("、")}。`,
        },
      ];
    }
    return { rawContent, plan, validation, completionMessages };
  };

  const handleFinalizeOpeningPlan = async (confirmationText?: string) => {
    if (!readyForFinalPlan) return;
    const finalMessages = confirmationText?.trim()
      ? [...openingMessages, { role: "user" as const, content: confirmationText.trim() }]
      : openingMessages;
    if (confirmationText?.trim()) {
      setOpeningMessages(finalMessages);
    }
    setFinalizingOpening(true);
    setError(null);
    try {
      let result = await runOpeningFinalizer(finalMessages, confirmedFacts, "最终开书方案生成失败");
      if (!result) return;
      const completed = await completeOpeningPlanUntilValid(result.content, finalMessages);
      if (!completed) return;
      const { rawContent, plan, validation, completionMessages } = completed;

      if (!validation.ok) {
        setSeedAnalysisRaw(rawContent);
        setSeedAnalysis(plan);
        await runOpeningRepairConversationTurn(completionMessages, validation.missing, rawContent);
        return;
      }

      setSeedAnalysisRaw(rawContent);
      setSeedAnalysis(plan);
      setSelectedSeedGenreIndex(0);
      setSelectedSeedReaders(plan.reader_options.slice(0, 2));
      setSelectedSeedThrills(plan.thrill_options.slice(0, 3));
      applySeedAnalysisToQuickStart(plan);
      setPendingQuestion("最终开书方案已生成，正在创建项目并进入书籍详情。");
      setOpeningOptions([]);
      setOpeningMissingFields(validation.missingOptional);
      setOpeningRepairMode(false);
      setReadyForFinalPlan(false);
      setOpeningMessages([
        ...completionMessages,
        {
          role: "assistant",
          content: "完整开书方案已生成，正在写入项目并跳转到书籍详情。",
        },
      ]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await handleCreateProject(plan, rawContent, validation);
    } finally {
      setFinalizingOpening(false);
    }
  };

  const applySeedAnalysisToQuickStart = (providedPlan?: OneAgentBookPlan) => {
    const plan = hydrateOpeningPlanFromContext(
      providedPlan || parseOneAgentBookPlan(seedAnalysisRaw, description),
      openingMessages,
      confirmedFacts,
      description,
    );
    const draft = providedPlan || seedAnalysis || plan;
    const chosenGenre = draft.genre_candidates[selectedSeedGenreIndex] || draft.genre_candidates[0];
    const normalizedDescription = [
      draft.normalized_description || description.trim(),
      plan.main_theme ? `主旨:\n${plan.main_theme}` : "",
      plan.world_framework ? `世界观:\n${plan.world_framework}` : "",
      plan.power_system ? `力量体系:\n${plan.power_system}` : "",
      draft.must_keep_settings.length ? `必须保留设定:\n${draft.must_keep_settings.join("\n")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const nextProjectName = draft.title_hint || projectName;
    const nextTargetWords = Math.max(10000, draft.recommended_target_words || 500000);
    const nextTargetVolumes = Math.max(1, draft.recommended_target_volumes || 6);
    const nextTargetReaders = selectedSeedReaders.join("、");
    const nextCoreThrills = selectedSeedThrills.join("、");
    seedOverrideRef.current = {
      projectName: nextProjectName,
      description: normalizedDescription,
      targetReaders: nextTargetReaders,
      coreThrills: nextCoreThrills,
      targetWords: nextTargetWords,
      targetVolumes: nextTargetVolumes,
    };
    setProjectName(nextProjectName);
    setDescription(normalizedDescription);
    setTargetWords(nextTargetWords);
    setTargetVolumes(nextTargetVolumes);
    setTargetReaders(nextTargetReaders);
    setCoreThrills(nextCoreThrills);
    setSelectedAudienceIds([]);
    setSelectedThrillIds([]);
    setGenreCandidatesDraft(chosenGenre ? [chosenGenre, ...draft.genre_candidates.filter((_, i) => i !== selectedSeedGenreIndex)] : []);
    if (chosenGenre) {
      setSelectedGenreDraft(chosenGenre.genre_name, chosenGenre.genre_id);
      const template = matchGenreTemplate([chosenGenre], genreTemplates);
      if (template) setSelectedGenreTemplateDraft(template.id);
      setGenreSupplement([chosenGenre.reason, ...chosenGenre.typical_features].filter(Boolean).join("\n"));
      confirm(1);
    }
    if (plan.style) {
      setStyleAnalysisDraft(plan.style, JSON.stringify(plan.style, null, 2));
      setStyleSupplement(plan.style_guide || plan.style.writing_guidelines || "");
      confirm(2);
    }
    if (plan.characters?.length) {
      setCharacterDrafts(plan.characters);
      confirm(3);
    }
    if (plan.outline) {
      setOutlineDraft(plan.outline);
      confirm(4);
    }
    if (plan.volumes?.length) {
      setVolumeDrafts(plan.volumes, formatVolumes(plan.volumes));
      confirm(5);
    }
    if (plan.title_candidates?.length) {
      setTitleDrafts(plan.title_candidates, plan.title_candidates[0]?.title || nextProjectName);
      setTitleResult(JSON.stringify({ candidates: plan.title_candidates }, null, 2));
      confirm(6);
    } else if (draft.title_hint) {
      const fallbackTitles = [{ title: draft.title_hint, approach: "AI 建议暂名", reason: "用于满足建书书名要求" }];
      setTitleDrafts(fallbackTitles, draft.title_hint);
      setTitleResult(JSON.stringify({ candidates: fallbackTitles }, null, 2));
      confirm(6);
    }
    if (plan.chapter_outlines?.length) {
      setChapterOutlineDrafts(plan.chapter_outlines);
    }
    const outlineHints = [
      ...draft.outline_directives,
      ...draft.must_keep_settings.map((item) => `必须保留：${item}`),
      seedSupplement.trim(),
    ].filter(Boolean);
    setOutlineSupplement(outlineHints.join("\n"));
    setVolumeSupplement(
      `按约 ${Math.round((draft.recommended_target_words || 500000) / 10000)} 万字、${draft.recommended_target_volumes || 6} 卷规划，篇幅可随剧情弹性调整。`,
    );
    setTitleSupplement(draft.title_hint ? `优先参考暂名：${draft.title_hint}` : "");
    confirm(0);
  };

  const handleSeedGenerateOnly = async () => {
    applySeedAnalysisToQuickStart();
    seedOverrideRef.current = null;
    setChatMode(false);
    setCurrentStep(steps.length - 1);
  };

  const handleSeedDirectCreate = async () => {
    setDirectCreatingFromSeed(true);
    try {
      applySeedAnalysisToQuickStart();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await handleCreateProject();
      seedOverrideRef.current = null;
    } finally {
      setDirectCreatingFromSeed(false);
    }
  };

  const runQuickStartPipeline = async () => {
    const hasSeed = (seedOverrideRef.current?.description ?? description).trim().length >= 10;
    if (!hasSeed || autoRunning) return;
    setAutoRunning(true);
    setError(null);
    try {
      const result = await runSetupAgent(
        "book_seed_analyst",
        {
          user_description: seedContext(),
          extra_context: [
            genreSupplement ? `题材补充：${genreSupplement}` : "",
            styleSupplement ? `文风补充：${styleSupplement}` : "",
            characterSupplement ? `角色/SOUL补充：${characterSupplement}` : "",
            outlineSupplement ? `大纲补充：${outlineSupplement}` : "",
            volumeSupplement ? `卷纲补充：${volumeSupplement}` : "",
            titleSupplement ? `书名补充：${titleSupplement}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        "单 Agent 快速开书失败",
      );
      if (!result) return;
      const plan = hydrateOpeningPlanFromContext(parseOneAgentBookPlan(result.content, description), openingMessages, confirmedFacts, description);
      setSeedAnalysisRaw(result.content);
      setSeedAnalysis(plan);
      setSelectedSeedGenreIndex(0);
      setSelectedSeedReaders(plan.reader_options.slice(0, 2));
      setSelectedSeedThrills(plan.thrill_options.slice(0, 3));
      applySeedAnalysisToQuickStart(plan);
      setChatMode(false);
      setCurrentStep(steps.length - 1);
    } finally {
      setAutoRunning(false);
    }
  };

  const handleCreateProject = async (
    providedPlan?: OneAgentBookPlan,
    providedRawContent?: string,
    providedValidation?: OpeningPlanValidation,
  ) => {
    setCreating(true);
    setError(null);
    try {
      const currentSnapshot = snapshot();
      const currentTitleCandidates = currentSnapshot.titleCandidates.length
        ? currentSnapshot.titleCandidates
        : titleCandidates;
      const currentSelectedTitle = currentSnapshot.selectedTitle || selectedTitle;
      const currentGenreCandidates = currentSnapshot.genreCandidates.length
        ? currentSnapshot.genreCandidates
        : genreCandidates;
      const currentSelectedGenre = currentSnapshot.selectedGenre || selectedGenre;
      const currentSelectedGenreId = currentSnapshot.selectedGenreId || selectedGenreId;
      const currentSelectedGenreTemplateId =
        currentSnapshot.selectedGenreTemplateId || selectedGenreTemplateId;
      const currentSelectedGenreTemplate =
        genreTemplates.find((template) => template.id === currentSelectedGenreTemplateId) ??
        selectedGenreTemplate;
      const currentStyleProfileId = currentSnapshot.selectedStyleProfileId || selectedStyleProfileId;
      const currentSelectedStyleProfile =
        styleProfiles.find((profile) => profile.id === currentStyleProfileId) ?? selectedStyleProfile;
      const currentStyleAnalysis = currentSnapshot.styleAnalysis || styleAnalysis;
      const currentStyleRawResult = currentSnapshot.styleRawResult || styleRawResult;
      const currentVolumesParsed = currentSnapshot.volumesParsed.length
        ? currentSnapshot.volumesParsed
        : volumesParsed;
      const currentVolumeStructure = currentSnapshot.volumeStructure || volumeStructure;
      const currentOutlineResult = currentSnapshot.outlineResult || outlineResult;
      const currentCharacterNames = currentSnapshot.characterNames.length
        ? currentSnapshot.characterNames
        : characterNames;
      const currentSoulResults = currentSnapshot.soulResults.size ? currentSnapshot.soulResults : soulResults;
      const currentChapterOutlines = currentSnapshot.chapterOutlines.length
        ? currentSnapshot.chapterOutlines
        : chapterOutlines;
      const planForOutline =
        providedPlan ||
        (seedAnalysisRaw
          ? hydrateOpeningPlanFromContext(parseOneAgentBookPlan(seedAnalysisRaw, description), openingMessages, confirmedFacts, description)
          : null);
      const rawPlanContent = providedRawContent || seedAnalysisRaw;
      const missingOptional = providedValidation?.missingOptional || (currentChapterOutlines.length ? [] : ["章纲/章节任务卡"]);
      const title =
        currentSelectedTitle ||
        currentTitleCandidates[0]?.title ||
        seedOverrideRef.current?.projectName ||
        projectName ||
        "未命名作品";
      const project = await projectApi.create({
        title,
        genre_id: currentSelectedGenreId || undefined,
        logline: (seedOverrideRef.current?.description ?? description).trim(),
        target_words: seedOverrideRef.current?.targetWords ?? targetWords,
        target_volumes: seedOverrideRef.current?.targetVolumes ?? targetVolumes,
        min_chapter_words: minChapterWords,
        max_chapter_words: Math.max(maxChapterWords, minChapterWords),
      });
      await switchProject(project.id);
      await projectApi.update(title, "active");

      if (currentSelectedGenreTemplateId) {
        await sharedResourcesApi.applyGenreTemplate(currentSelectedGenreTemplateId);
      }
      if (currentStyleProfileId) {
        await sharedResourcesApi.applyStyleProfile(currentStyleProfileId);
      }

      await outlineApi.saveBookOutline(
        buildBookOutlineContent({
          title,
          genre: currentSelectedGenre,
          plan: planForOutline,
          description: seedOverrideRef.current?.description ?? description,
          volumeStructure: currentVolumeStructure,
          volumes: currentVolumesParsed,
          characters: currentCharacterNames,
          extras: {
            quick_start: {
              source: "quick_start",
              seed: {
                project_name: seedOverrideRef.current?.projectName ?? projectName,
                description: seedOverrideRef.current?.description ?? description,
                target_readers: seedOverrideRef.current?.targetReaders || combinedTargetReaders,
                core_thrills: seedOverrideRef.current?.coreThrills || combinedCoreThrills,
                target_words: seedOverrideRef.current?.targetWords ?? targetWords,
                target_volumes: seedOverrideRef.current?.targetVolumes ?? targetVolumes,
                min_chapter_words: minChapterWords,
                max_chapter_words: Math.max(maxChapterWords, minChapterWords),
              },
              genre: {
                selected_genre: currentSelectedGenre,
                selected_genre_id: currentSelectedGenreId,
                supplement: genreSupplement,
                candidates: currentGenreCandidates,
                template: currentSelectedGenreTemplate,
              },
              style: {
                supplement: styleSupplement,
                profile: currentSelectedStyleProfile,
                analysis: currentStyleAnalysis,
                raw: currentStyleRawResult,
              },
              outline_supplement: outlineSupplement,
              character_supplement: characterSupplement,
              chapter_outlines: currentChapterOutlines,
              opening_conversation: openingMessages,
              confirmed_facts: confirmedFacts,
              titles: currentTitleCandidates,
              selected_title: title,
              raw_plan: rawPlanContent,
              missing_optional: missingOptional,
            },
          },
        }),
        "快速开始: AI 全流程开书",
      );

      if (currentSelectedGenre) {
        await canonApi.create({
          rule_key: "quick_start_genre",
          rule_name: "快速开始题材设定",
          rule_type: "world",
          scope_type: "book",
          content: [
            `题材: ${currentSelectedGenre}`,
            currentSelectedGenreTemplate ? `题材模板: ${stringifyPretty(currentSelectedGenreTemplate)}` : "",
            currentGenreCandidates[0]?.reason ? `匹配理由: ${currentGenreCandidates[0].reason}` : "",
            genreSupplement ? `补充要求: ${genreSupplement}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          is_hard: true,
          source_type: "quick_start",
        });
      }

      const styleRuleContent = [
        currentSelectedStyleProfile ? `应用文风档案: ${currentSelectedStyleProfile.name}` : "",
        currentSelectedStyleProfile ? stringifyPretty(currentSelectedStyleProfile) : "",
        styleDraftText() || currentStyleRawResult,
      ]
        .filter(Boolean)
        .join("\n\n");
      if (styleRuleContent.trim()) {
        await canonApi.create({
          rule_key: "quick_start_style_guide",
          rule_name: "快速开始文风指南",
          rule_type: "style",
          scope_type: "book",
          content: styleRuleContent,
          is_hard: false,
          source_type: "quick_start",
        });
      }

      for (const char of currentCharacterNames) {
        const name = char.selectedName || char.candidates[0]?.name || char.role;
        const soulData = currentSoulResults.get(name);
        const soulJson = normalizeSoulJson(
          char.soul_json || (soulData ? JSON.stringify(soulData) : "{}"),
          char.description,
        );
        if (!hasMeaningfulSoul(soulJson)) {
          throw new Error(`角色 ${name} 缺少 SOUL，已阻止落库。`);
        }
        const created = await chapterApi.createCharacter(name, char.role, soulJson);
        await chapterApi.updateCharacter(
          created.id,
          name,
          soulJson,
          char.role,
          char.identity_core || char.description || `${currentSelectedGenre || "本书"}${char.role}`,
          char.persona_core ||
            (soulData?.customization?.personality
            ? JSON.stringify(soulData.customization.personality)
            : undefined),
          char.core_motivation ||
            (soulData?.customization?.behavior
              ? Object.values(soulData.customization.behavior).join("；")
              : undefined),
          char.taboo_rules || undefined,
        );
      }

      const existingChapters = currentChapterOutlines.length ? await chapterApi.listChapters() : [];
      for (const chapter of currentChapterOutlines) {
        const task = await chapterApi.createTask(
          chapter.chapter_number,
          chapter.title || `第${chapter.chapter_number}章章纲`,
          undefined,
          undefined,
          chapter.plot_points?.join("\n"),
          chapter.opening_scene,
          "",
        );
        if (!existingChapters.some((item) => item.chapter_number === chapter.chapter_number)) {
          await chapterApi.createChapter(chapter.chapter_number, chapter.title, task.id);
        }
        await outlineApi.saveChapterOutline(
          chapter.chapter_number,
          serializeOutlineContent({
            开篇场景: chapter.opening_scene || "",
            情节点列表: (chapter.plot_points || []).map((point, index) => ({
              order: index + 1,
              description: point,
              characters_involved: [],
              estimated_words: 0,
            })),
            角色出场: chapter.character_appearances || [],
            关键对话: chapter.key_dialogues || [],
            转折点: chapter.turning_point || "",
            章末状态: chapter.ending_state || "",
          }),
          task.id,
          "智能开书: 对话生成章纲",
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
      disabled={stepBusy || disabled}
      className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm"
    >
      {stepBusy ? (
        <Loader2 size={15} className="animate-spin" />
      ) : icon === "refresh" ? (
        <RefreshCw size={15} />
      ) : (
        <Sparkles size={15} />
      )}
      {label}
    </button>
  );

  const renderRegenerateAllButton = (label = "用单 Agent 重新生成完整方案") =>
    renderActionButton(label, runQuickStartPipeline, !canStart, "refresh");

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
            快速开始会用同一个 Agent 根据故事种子一次性生成题材、文风、卷纲、大纲、角色、SOUL 和书名。
            后续步骤只用于编辑确认；最终只创建项目和开书素材，不自动生成正文。
          </p>
        </div>

        {chatMode && (
          <div className="bg-white rounded-lg border border-gray-200 p-5 min-h-[560px] flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">智能开书</h2>
                <p className="text-sm text-gray-500">先聊清楚，再生成完整开书包。</p>
              </div>
              <button
                onClick={() => setChatMode(false)}
                className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                返回编辑页
              </button>
            </div>

            <div className="flex-1 rounded-xl border border-gray-200 bg-[#f8f7f4] p-4 overflow-y-auto space-y-3">
              {openingMessages.length === 0 ? (
                <div className="text-sm text-gray-500">
                  先丢一段灵感给我，我会按“设定、类型、篇幅、人物势力、摘要确认”一步步问。
                </div>
              ) : (
                openingMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap shadow-sm ${
                        message.role === "user"
                          ? "bg-amber-500 text-white rounded-br-md"
                          : "bg-white border border-gray-200 text-gray-800 rounded-bl-md"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))
              )}
              {seedAnalyzing && (
                <div className="flex items-center gap-2 text-sm text-amber-700 px-1">
                  <Loader2 size={14} className="animate-spin" />
                  正在整理下一轮确认点...
                </div>
              )}

              {pendingQuestion && openingMessages.length > 0 && !seedAnalyzing && (
                <div className="max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-6 bg-white border border-amber-200 text-amber-900 shadow-sm rounded-bl-md">
                  {pendingQuestion}
                </div>
              )}

              {openingOptions.length > 0 && (
                <div className="space-y-2 pt-1">
                  {shouldUseMultiSelect(pendingQuestion, openingOptions, readyForFinalPlan) && (
                    <p className="text-xs text-gray-500 px-1">可多选，选好后点击“确认选择”。</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {openingOptions.map((option) => {
                      const multiSelect = shouldUseMultiSelect(pendingQuestion, openingOptions, readyForFinalPlan);
                      const selected = selectedOpeningOptionValues.includes(option.value);
                      return (
                        <button
                          key={`${option.label}-${option.value}`}
                          onClick={() =>
                            readyForFinalPlan
                              ? handleFinalizeOpeningPlan(option.value)
                              : multiSelect
                                ? toggleOpeningOption(option.value)
                                : openingRepairMode
                                  ? sendOpeningRepairAnswer(option.value)
                                  : sendOpeningMessage(option.value)
                          }
                          disabled={seedAnalyzing || finalizingOpening}
                          className={`text-left rounded-full border px-3 py-2 text-sm bg-white disabled:opacity-50 ${
                            selected
                              ? "border-amber-500 bg-amber-50 text-amber-900"
                              : "border-gray-200 hover:border-amber-400 hover:bg-amber-50"
                          }`}
                        >
                          {multiSelect && (
                            <span className="mr-1 font-medium">{selected ? "✓" : "○"}</span>
                          )}
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {shouldUseMultiSelect(pendingQuestion, openingOptions, readyForFinalPlan) && (
                    <button
                      onClick={submitSelectedOpeningOptions}
                      disabled={!selectedOpeningOptionValues.length || seedAnalyzing || finalizingOpening}
                      className="px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 text-sm"
                    >
                      确认选择
                    </button>
                  )}
                </div>
              )}

              {(Object.keys(confirmedFacts).length > 0 || openingMissingFields.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-sm">
                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <h3 className="font-medium text-gray-900 mb-2">已确认</h3>
                    {Object.keys(confirmedFacts).length ? (
                      <ul className="space-y-1 text-xs text-gray-700 max-h-44 overflow-auto">
                        {Object.entries(confirmedFacts).map(([key, value]) => (
                          <li key={key}>
                            <span className="font-medium">{key}: </span>
                            {compactText(normalizeDraftText(value), 120)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-gray-500">还没有确认信息。</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-3">
                    <h3 className="font-medium text-gray-900 mb-2">待确认</h3>
                    {openingMissingFields.length ? (
                      <ul className="space-y-1 text-gray-700">
                        {openingMissingFields.map((field) => (
                          <li key={field}>- {field}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500">信息已足够生成最终方案。</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <textarea
                value={openingDraft}
                onChange={(e) => setOpeningDraft(e.target.value)}
                placeholder={
                  openingRepairMode
                    ? "回答上方补全问题，或点击选项后继续"
                    : openingMessages.length === 0
                      ? "输入故事灵感、主角设定、冲突、篇幅偏好..."
                      : pendingQuestion || "继续补充你的确认信息..."
                }
                className="flex-1 min-h-40 max-h-[360px] px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y bg-white"
                autoFocus
              />
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={handleAnalyzeSeed}
                  disabled={seedAnalyzing || !openingDraft.trim()}
                  className="px-4 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 disabled:opacity-50 text-sm"
                >
                  {openingRepairMode ? "发送补全回答" : "发送"}
                </button>
                <button
                  onClick={handleFinalizeOpeningPlan}
                  disabled={!readyForFinalPlan || openingRepairMode || finalizingOpening || seedAnalyzing}
                  className="flex items-center justify-center gap-1 px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  {finalizingOpening ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                  {creating || finalizingOpening ? "生成并建书中..." : "生成并创建书籍"}
                </button>
                <button
                  onClick={() => setChatMode(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-xl text-sm"
                >
                  进入分步编辑
                </button>
              </div>
            </div>
          </div>
        )}

        {!chatMode && (
          <>

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
          <div className="overflow-x-auto pt-2 pb-2 mt-2">
          <div className="flex items-start gap-0 min-w-max">
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-start shrink-0">
                <button onClick={() => setCurrentStep(i)} className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                      confirmed[i]
                        ? "bg-green-500 text-white"
                        : i === currentStep
                          ? stepBusy
                            ? "bg-amber-100 text-amber-700 ring-2 ring-amber-500 animate-pulse"
                            : "bg-amber-100 text-amber-700 ring-2 ring-amber-500"
                          : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {confirmed[i] ? (
                      <Check size={14} />
                    ) : stepBusy && i === currentStep ? (
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
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">项目暂名</span>
                  <input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="例如：星海旧神"
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">目标卷数</span>
                  <input
                    type="number"
                    value={targetVolumes}
                    onChange={(e) => setTargetVolumes(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    max={30}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="mt-1 block text-xs text-gray-500">
                    用于决定 AI 生成几卷卷纲，不代表最终必须写满。
                  </span>
                </label>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">目标总字数</span>
                  <input
                    type="number"
                    value={targetWords}
                    onChange={(e) => setTargetWords(Math.max(0, parseInt(e.target.value) || 0))}
                    min={10000}
                    step={10000}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">每章最少字数</span>
                  <input
                    type="number"
                    value={minChapterWords}
                    onChange={(e) => setMinChapterWords(Math.max(1, parseInt(e.target.value) || 1))}
                    min={500}
                    step={100}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">每章最大字数</span>
                  <input
                    type="number"
                    value={maxChapterWords}
                    onChange={(e) => setMaxChapterWords(Math.max(1, parseInt(e.target.value) || 1))}
                    min={500}
                    step={100}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </label>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="核心简介：主角是谁，处在什么世界，遇到什么危机，最终想抵达什么目标..."
                className="w-full h-44 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                autoFocus
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">目标读者</h3>
                      <p className="text-xs text-gray-500">可多选，也可以补充自己的定位。</p>
                    </div>
                    {selectedAudienceIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedAudienceIds([])}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {AUDIENCE_PRESETS.map((option) => {
                      const selected = selectedAudienceIds.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          title={option.description}
                          onClick={() =>
                            setSelectedAudienceIds((prev) =>
                              selected
                                ? prev.filter((id) => id !== option.id)
                                : [...prev, option.id],
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                            selected
                              ? "border-amber-500 bg-amber-50 text-amber-800"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={targetReaders}
                    onChange={(e) => setTargetReaders(e.target.value)}
                    placeholder="自定义目标读者，可选"
                    className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">核心爽点</h3>
                      <p className="text-xs text-gray-500">选择后会进入题材、文风、卷纲和大纲生成。</p>
                    </div>
                    {selectedThrillIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedThrillIds([])}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {THRILL_PRESETS.map((option) => {
                      const selected = selectedThrillIds.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          title={option.description}
                          onClick={() =>
                            setSelectedThrillIds((prev) =>
                              selected
                                ? prev.filter((id) => id !== option.id)
                                : [...prev, option.id],
                            )
                          }
                          className={`px-2.5 py-1.5 rounded-md border text-xs transition-colors ${
                            selected
                              ? "border-amber-500 bg-amber-50 text-amber-800"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={coreThrills}
                    onChange={(e) => setCoreThrills(e.target.value)}
                    placeholder="自定义核心爽点，可选"
                    className="mt-3 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
              {(combinedTargetReaders || combinedCoreThrills) && (
                <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
                  {combinedTargetReaders && <p>目标读者: {combinedTargetReaders}</p>}
                  {combinedCoreThrills && <p className="mt-1">核心爽点: {combinedCoreThrills}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={runQuickStartPipeline}
                  disabled={!canStart || autoRunning || running}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                >
                  {autoRunning ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {autoRunning ? "AI 自动开书中..." : "单 Agent 生成全套开书素材"}
                </button>
                <button
                  onClick={() => {
                    confirm(0);
                    setCurrentStep(1);
                  }}
                  disabled={!canStart}
                  className="flex items-center gap-2 px-4 py-2 text-amber-700 hover:bg-amber-50 rounded-lg disabled:opacity-50"
                >
                  进入编辑确认
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
              <textarea
                value={genreSupplement}
                onChange={(e) => setGenreSupplement(e.target.value)}
                placeholder="题材偏好、排除方向、目标平台或读者补充..."
                className="mb-3 w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
              {renderRegenerateAllButton(genreCandidates.length ? "重新生成完整方案" : "生成完整方案")}
              {genreCandidates.length > 0 && (
                <div className="mt-4 space-y-3">
                  {genreCandidates.map((c, index) => (
                    <div
                      key={c.genre_id}
                      className={`p-3 rounded-lg border transition-colors ${
                        selectedGenre === c.genre_name
                          ? "border-amber-500 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGenreDraft(c.genre_name, c.genre_id);
                            const template = matchGenreTemplate([c], genreTemplates);
                            if (template) setSelectedGenreTemplateDraft(template.id);
                          }}
                          className="font-medium text-gray-900 hover:text-amber-700"
                        >
                          {c.genre_name || "未命名题材"}
                        </button>
                        <span className="text-sm text-amber-700">匹配度 {c.match_score}/10</span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          value={c.genre_name}
                          onChange={(e) => updateGenreCandidate(index, { genre_name: e.target.value })}
                          className="px-3 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="题材名"
                        />
                        <input
                          type="number"
                          value={c.match_score}
                          onChange={(e) => updateGenreCandidate(index, { match_score: Number(e.target.value) || 0 })}
                          className="px-3 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="匹配度"
                        />
                      </div>
                      <textarea
                        value={c.reason}
                        onChange={(e) => updateGenreCandidate(index, { reason: e.target.value })}
                        className="mt-2 w-full h-16 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                        placeholder="匹配理由"
                      />
                      <div className="flex flex-wrap gap-1 mt-2">
                        {c.typical_features?.map((f, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 bg-white text-gray-600 rounded border">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  <select
                    value={selectedGenreTemplateId}
                    onChange={(e) => setSelectedGenreTemplateDraft(e.target.value)}
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
              <textarea
                value={styleSupplement}
                onChange={(e) => setStyleSupplement(e.target.value)}
                placeholder="风格偏好、禁用表达、参考说明补充..."
                className="mb-3 w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
              {renderRegenerateAllButton(styleRawResult ? "重新生成完整方案" : "生成完整方案")}
              <div className="mt-4">
                <label className="text-sm text-gray-600">应用资源库文风档案</label>
                <select
                  value={selectedStyleProfileId}
                  onChange={(e) => setSelectedStyleProfileDraft(e.target.value)}
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
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                  <div>
                    <label className="text-xs text-amber-900">文风名称</label>
                    <input
                      value={styleAnalysis.style_name}
                      onChange={(e) => updateStyleAnalysis({ style_name: e.target.value })}
                      className="mt-1 w-full px-3 py-1.5 border border-amber-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="文风名称"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <label className="text-xs text-amber-900">
                      叙事视角
                      <input
                        value={styleAnalysis.narrative_perspective || ""}
                        onChange={(e) => updateStyleAnalysis({ narrative_perspective: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 border border-amber-200 rounded text-sm"
                      />
                    </label>
                    <label className="text-xs text-amber-900">
                      语言风格
                      <input
                        value={styleAnalysis.language_style || ""}
                        onChange={(e) => updateStyleAnalysis({ language_style: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 border border-amber-200 rounded text-sm"
                      />
                    </label>
                    <label className="text-xs text-amber-900">
                      对白风格
                      <input
                        value={styleAnalysis.dialogue_style || ""}
                        onChange={(e) => updateStyleAnalysis({ dialogue_style: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 border border-amber-200 rounded text-sm"
                      />
                    </label>
                    <label className="text-xs text-amber-900">
                      节奏
                      <input
                        value={styleAnalysis.rhythm || ""}
                        onChange={(e) => updateStyleAnalysis({ rhythm: e.target.value })}
                        className="mt-1 w-full px-3 py-1.5 border border-amber-200 rounded text-sm"
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-amber-900">
                    描写偏好
                    <textarea
                      value={styleAnalysis.description_preference || ""}
                      onChange={(e) => updateStyleAnalysis({ description_preference: e.target.value })}
                      className="mt-1 w-full h-20 px-3 py-1.5 border border-amber-200 rounded text-sm resize-none"
                    />
                  </label>
                  <label className="block text-xs text-amber-900">
                    修辞/表达偏好
                    <textarea
                      value={styleAnalysis.rhetoric || ""}
                      onChange={(e) => updateStyleAnalysis({ rhetoric: e.target.value })}
                      className="mt-1 w-full h-20 px-3 py-1.5 border border-amber-200 rounded text-sm resize-none"
                    />
                  </label>
                  <label className="block text-xs text-amber-900">
                    文风指南
                    <textarea
                      value={styleAnalysis.writing_guidelines || ""}
                      onChange={(e) => updateStyleAnalysis({ writing_guidelines: e.target.value })}
                      className="mt-1 w-full h-28 px-3 py-1.5 border border-amber-200 rounded text-sm resize-none"
                    />
                  </label>
                  <details>
                    <summary className="text-xs text-amber-700 cursor-pointer">原始结果</summary>
                    <textarea
                      value={styleRawResult}
                      onChange={(e) => setStyleAnalysisDraft(styleAnalysis, e.target.value)}
                      className="mt-2 w-full h-40 px-3 py-2 border border-amber-200 rounded text-xs font-mono resize-y"
                    />
                  </details>
                </div>
              )}
              {styleRawResult && !styleAnalysis && (
                <textarea
                  value={styleRawResult}
                  onChange={(e) => setStyleAnalysisDraft(null, e.target.value)}
                  className="mt-4 w-full h-72 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap font-mono border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              )}
            </div>
          )}

          {currentStep === 5 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 卷纲生成</h2>
              <p className="text-gray-500 text-sm mb-4">
                卷纲会基于全书大纲拆分，作为后续章节规划的上游素材。
              </p>
              <textarea
                value={volumeSupplement}
                onChange={(e) => setVolumeSupplement(e.target.value)}
                placeholder="卷数节奏、每卷重点、必须出现的阶段性事件..."
                className="mb-3 w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
              {renderRegenerateAllButton(volumeStructure ? "重新生成完整方案" : "生成完整方案")}
              {volumesParsed.length > 0 ? (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {volumesParsed.map((v, index) => (
                    <div key={v.volume_number} className="p-3 border border-gray-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-medium text-gray-900">第{v.volume_number}卷</h3>
                        <button onClick={() => removeVolume(index)} className="text-xs text-red-500 hover:text-red-600">
                          删除
                        </button>
                      </div>
                      <input
                        value={v.title}
                        onChange={(e) => updateVolume(index, { title: e.target.value })}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm"
                        placeholder="卷标题"
                      />
                      <input
                        type="number"
                        value={v.volume_number}
                        onChange={(e) => updateVolume(index, { volume_number: Number(e.target.value) || index + 1 })}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm"
                        placeholder="卷序号"
                      />
                      <textarea
                        value={v.goal}
                        onChange={(e) => updateVolume(index, { goal: e.target.value })}
                        className="w-full h-16 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                        placeholder="卷目标"
                      />
                      <textarea
                        value={v.main_conflict}
                        onChange={(e) => updateVolume(index, { main_conflict: e.target.value })}
                        className="w-full h-16 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                        placeholder="主要冲突"
                      />
                      <textarea
                        value={v.climax}
                        onChange={(e) => updateVolume(index, { climax: e.target.value })}
                        className="w-full h-16 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                        placeholder="高潮"
                      />
                      <textarea
                        value={v.settlement}
                        onChange={(e) => updateVolume(index, { settlement: e.target.value })}
                        className="w-full h-16 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                        placeholder="余波"
                      />
                    </div>
                  ))}
                </div>
              ) : volumeStructure ? (
                <textarea
                  value={volumeStructure}
                  onChange={(e) => {
                    setVolumeDrafts([], e.target.value);
                  }}
                  className="mt-4 w-full h-72 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-80 overflow-auto font-mono"
                />
              ) : null}
              {volumesParsed.length > 0 && (
                <button
                  onClick={addVolume}
                  className="mt-4 flex items-center gap-1 px-4 py-2 text-amber-700 hover:bg-amber-50 rounded-lg text-sm"
                >
                  <Plus size={14} />
                  添加分卷
                </button>
              )}
            </div>
          )}

          {currentStep === 4 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 全书大纲生成</h2>
              <p className="text-gray-500 text-sm mb-4">
                全书大纲会综合故事种子、题材、文风和角色/SOUL，进入项目后可继续细化章节。
              </p>
              <textarea
                value={outlineSupplement}
                onChange={(e) => setOutlineSupplement(e.target.value)}
                placeholder="主线、反派、感情线、爽点、禁忌情节补充..."
                className="mb-3 w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
              {renderRegenerateAllButton(outlineResult ? "重新生成完整方案" : "生成完整方案")}
              {outlineResult && (
                <textarea
                  value={outlineResult}
                  onChange={(e) => setOutlineDraft(e.target.value)}
                  className="mt-4 w-full h-96 p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap font-mono border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              )}
            </div>
          )}

          {currentStep === 3 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 角色与 SOUL</h2>
              <p className="text-gray-500 text-sm mb-4">
                先确定核心角色、关系和 SOUL，再让全书大纲围绕人物弧线展开。
              </p>
              <textarea
                value={characterSupplement}
                onChange={(e) => setCharacterSupplement(e.target.value)}
                placeholder="角色数量、核心关系、必须出现/禁止出现角色、SOUL偏好..."
                className="mb-3 w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
              {renderRegenerateAllButton(characterNames.length ? "重新生成完整方案" : "生成完整方案")}
              {charactersSoulProgress && (
                <p className="mt-2 text-sm text-amber-700">SOUL 生成进度: {charactersSoulProgress}</p>
              )}
              {characterNames.length > 0 && (
                <div className="mt-4 space-y-4">
                  {characterNames.map((c, idx) => {
                    const name = c.selectedName || c.candidates[0]?.name || c.role;
                    const soul = soulResults.get(name);
                    const soulView = parseSoulView(c.soul_json);
                    return (
                      <div key={`${c.role}-${idx}`} className="p-3 border border-gray-200 rounded-lg space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-medium text-gray-900">{name || "未命名角色"}</h3>
                          <button onClick={() => removeCharacterDraft(idx)} className="text-xs text-red-500 hover:text-red-600">
                            删除
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <input
                            value={c.selectedName || ""}
                            onChange={(e) => updateCharacterDraft(idx, { selectedName: e.target.value })}
                            className="px-3 py-1.5 border border-gray-200 rounded text-sm"
                            placeholder="角色名"
                          />
                          <input
                            value={c.role}
                            onChange={(e) => updateCharacterDraft(idx, { role: e.target.value })}
                            className="px-3 py-1.5 border border-gray-200 rounded text-sm"
                            placeholder="角色类型"
                          />
                          <textarea
                            value={c.identity_core || ""}
                            onChange={(e) => updateCharacterDraft(idx, { identity_core: e.target.value })}
                            className="h-20 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                            placeholder="身份核心"
                          />
                          <textarea
                            value={c.persona_core || ""}
                            onChange={(e) => updateCharacterDraft(idx, { persona_core: e.target.value })}
                            className="h-20 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                            placeholder="人格核心"
                          />
                          <textarea
                            value={c.core_motivation || ""}
                            onChange={(e) => updateCharacterDraft(idx, { core_motivation: e.target.value })}
                            className="h-20 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                            placeholder="核心动机"
                          />
                          <textarea
                            value={c.taboo_rules || ""}
                            onChange={(e) => updateCharacterDraft(idx, { taboo_rules: e.target.value })}
                            className="h-20 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                            placeholder="禁忌规则"
                          />
                        </div>
                        <textarea
                          value={c.description || ""}
                          onChange={(e) => updateCharacterDraft(idx, { description: e.target.value })}
                          className="w-full h-20 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                          placeholder="角色简介"
                        />
                        <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-medium text-amber-900">SOUL 结构化档案</h4>
                            {soulView.parseError && (
                              <span className="text-xs text-red-600">
                                JSON 解析失败，已保留原文
                              </span>
                            )}
                          </div>
                          <input
                            value={soulView.matched_template}
                            onChange={(e) => updateCharacterSoulField(idx, "matched_template", e.target.value)}
                            className="w-full px-3 py-1.5 border border-amber-200 rounded text-sm"
                            placeholder="SOUL 模板名"
                            disabled={Boolean(soulView.parseError)}
                          />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <textarea
                              value={soulView.personality}
                              onChange={(e) => updateCharacterSoulField(idx, "personality", e.target.value)}
                              className="h-24 px-3 py-1.5 border border-amber-200 rounded text-sm resize-none"
                              placeholder="Personality：性格、价值观、心理倾向"
                              disabled={Boolean(soulView.parseError)}
                            />
                            <textarea
                              value={soulView.speech}
                              onChange={(e) => updateCharacterSoulField(idx, "speech", e.target.value)}
                              className="h-24 px-3 py-1.5 border border-amber-200 rounded text-sm resize-none"
                              placeholder="Speech：说话方式、语气、口头禅"
                              disabled={Boolean(soulView.parseError)}
                            />
                            <textarea
                              value={soulView.behavior}
                              onChange={(e) => updateCharacterSoulField(idx, "behavior", e.target.value)}
                              className="h-24 px-3 py-1.5 border border-amber-200 rounded text-sm resize-none"
                              placeholder="Behavior：决策模式、压力反应、行动习惯"
                              disabled={Boolean(soulView.parseError)}
                            />
                            <textarea
                              value={soulView.relationships}
                              onChange={(e) => updateCharacterSoulField(idx, "relationships", e.target.value)}
                              className="h-24 px-3 py-1.5 border border-amber-200 rounded text-sm resize-none"
                              placeholder="Relationships：关系态度、信任模式、冲突边界"
                              disabled={Boolean(soulView.parseError)}
                            />
                          </div>
                          <textarea
                            value={soulView.speech_examples.join("\n")}
                            onChange={(e) => updateCharacterSoulField(idx, "speech_examples", e.target.value)}
                            className="w-full h-20 px-3 py-1.5 border border-amber-200 rounded text-sm resize-none"
                            placeholder="典型台词，一行一句"
                            disabled={Boolean(soulView.parseError)}
                          />
                        </div>
                        <details>
                          <summary className="text-xs text-amber-700 cursor-pointer">
                            SOUL: {soul?.matched_template || "查看/编辑 SOUL JSON"}
                          </summary>
                          <textarea
                            value={c.soul_json || "{}"}
                            onChange={(e) => updateCharacterDraft(idx, { soul_json: e.target.value })}
                            className="mt-2 w-full h-40 px-3 py-2 border border-gray-200 rounded text-xs font-mono resize-y"
                          />
                        </details>
                      </div>
                    );
                  })}
                  <button
                    onClick={addCharacterDraft}
                    className="flex items-center gap-1 px-4 py-2 text-amber-700 hover:bg-amber-50 rounded-lg text-sm"
                  >
                    <Plus size={14} />
                    添加角色
                  </button>
                </div>
              )}
              {namingResult && characterNames.length === 0 && (
                <div className="mt-4 space-y-3">
                  <button
                    type="button"
                    onClick={parseNamingResultIntoCharacters}
                    className="px-4 py-2 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 text-sm"
                  >
                    按当前 JSON 重新解析为人物卡
                  </button>
                  <pre className="p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-80 overflow-auto">
                    {namingResult}
                    {soulRawResult ? `\n\n${soulRawResult}` : ""}
                  </pre>
                </div>
              )}
            </div>
          )}

          {currentStep === 6 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">AI 书名</h2>
              <p className="text-gray-500 text-sm mb-4">
                选择书名后即可创建项目并进入看板。
              </p>
              <textarea
                value={titleSupplement}
                onChange={(e) => setTitleSupplement(e.target.value)}
                placeholder="书名关键词、风格、禁用词、平台偏好..."
                className="mb-3 w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
              {renderRegenerateAllButton(titleCandidates.length ? "重新生成完整方案" : "生成完整方案")}
              {titleCandidates.length > 0 && (
                <div className="mt-4 space-y-3">
                  {titleCandidates.map((t, idx) => (
                    <div
                      key={`${t.title}-${idx}`}
                      className={`p-3 rounded-lg border ${
                        selectedTitle === t.title
                          ? "border-amber-500 bg-amber-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setupSnapshotRef.current.selectedTitle = t.title;
                            setSelectedTitle(t.title);
                          }}
                          className="font-medium text-gray-900 hover:text-amber-700"
                        >
                          {t.title || "未命名书名"}
                        </button>
                        {t.collision_risk && (
                          <span className="text-xs text-gray-500">撞名风险: {t.collision_risk}</span>
                        )}
                      </div>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          value={t.title}
                          onChange={(e) => updateTitleCandidate(idx, { title: e.target.value })}
                          className="px-3 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="书名"
                        />
                        <input
                          value={t.approach || ""}
                          onChange={(e) => updateTitleCandidate(idx, { approach: e.target.value })}
                          className="px-3 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder="命名策略"
                        />
                      </div>
                      <textarea
                        value={t.reason || ""}
                        onChange={(e) => updateTitleCandidate(idx, { reason: e.target.value })}
                        className="mt-2 w-full h-16 px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
                        placeholder="推荐理由"
                      />
                    </div>
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
                  <p>目标总字数: {targetWords.toLocaleString()} 字</p>
                  <p>卷数: {volumesParsed.length || targetVolumes}</p>
                  <p>
                    单章字数: {minChapterWords.toLocaleString()}-{Math.max(maxChapterWords, minChapterWords).toLocaleString()} 字
                  </p>
                  <p>角色: {characterNames.length} 个</p>
                </div>
              </div>

              <button
                onClick={handleCreateProject}
                disabled={creating || running || autoRunning || !description.trim()}
                className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-base font-medium"
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
          </>
        )}
      </div>
    </div>
  );
}
