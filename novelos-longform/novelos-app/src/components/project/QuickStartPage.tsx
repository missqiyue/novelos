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
  { key: "golden_three", label: "黄金三章" },
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

interface GoldenPlotPoint {
  description: string;
  purpose?: string;
}

interface GoldenChapterDraft {
  chapter_number: number;
  title: string;
  core_goal: string;
  opening_scene: string;
  plot_points: GoldenPlotPoint[];
  character_appearances: string[];
  key_dialogues: string[];
  turning_point: string;
  ending_state: string;
  hook: string;
  must_hits: string[];
  forbidden: string[];
  quick_checks: string[];
}

interface GoldenThreeDraft {
  chapters: GoldenChapterDraft[];
  continuity_checks: string[];
  reader_checks: string[];
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
    parsed = JSON.parse(soulJson || "{}");
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
  return {
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
    soul_json: "{}",
  };
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

function emptyGoldenChapter(chapterNumber: number): GoldenChapterDraft {
  return {
    chapter_number: chapterNumber,
    title: `第${chapterNumber}章`,
    core_goal: "",
    opening_scene: "",
    plot_points: [],
    character_appearances: [],
    key_dialogues: [],
    turning_point: "",
    ending_state: "",
    hook: "",
    must_hits: [],
    forbidden: [],
    quick_checks: [],
  };
}

function defaultGoldenThreeDraft(): GoldenThreeDraft {
  return {
    chapters: [emptyGoldenChapter(1), emptyGoldenChapter(2), emptyGoldenChapter(3)],
    continuity_checks: [],
    reader_checks: [],
  };
}

function normalizeGoldenChapter(source: any, index: number): GoldenChapterDraft {
  const chapter = source && typeof source === "object" ? source : {};
  const plotPoints = Array.isArray(chapter.plot_points)
    ? chapter.plot_points.map((point: any) =>
        typeof point === "string"
          ? { description: point }
          : {
              description: normalizeDraftText(point?.description ?? point?.content ?? point?.事件),
              purpose: normalizeDraftText(point?.purpose ?? point?.作用),
            },
      )
    : normalizeSeedStringList(chapter.plot_points ?? chapter["情节点列表"]).map((description) => ({
        description,
      }));
  return {
    chapter_number: Number(chapter.chapter_number ?? chapter["章节序号"]) || index + 1,
    title: normalizeDraftText(chapter.title ?? chapter["标题"]) || `第${index + 1}章`,
    core_goal: normalizeDraftText(chapter.core_goal ?? chapter.objective ?? chapter["核心目标"]),
    opening_scene: normalizeDraftText(chapter.opening_scene ?? chapter["开篇场景"]),
    plot_points: plotPoints.filter((point: GoldenPlotPoint) => point.description),
    character_appearances: normalizeSeedStringList(
      chapter.character_appearances ?? chapter.characters ?? chapter["角色出场"],
    ),
    key_dialogues: normalizeSeedStringList(chapter.key_dialogues ?? chapter["关键对话"]),
    turning_point: normalizeDraftText(chapter.turning_point ?? chapter["转折点"]),
    ending_state: normalizeDraftText(chapter.ending_state ?? chapter["章末状态"]),
    hook: normalizeDraftText(chapter.hook ?? chapter.ending_hook ?? chapter["章末钩子"]),
    must_hits: normalizeSeedStringList(chapter.must_hits ?? chapter.must_progress ?? chapter["必须命中"]),
    forbidden: normalizeSeedStringList(chapter.forbidden ?? chapter.must_avoid ?? chapter["禁止事项"]),
    quick_checks: normalizeSeedStringList(chapter.quick_checks ?? chapter["检查清单"]),
  };
}

function parseGoldenThreeDraftFromContent(content: string): GoldenThreeDraft {
  const parsed = parseJsonSafe(content);
  const source =
    parsed && typeof parsed === "object"
      ? ((parsed as Record<string, unknown>).result as Record<string, unknown>) ||
        (parsed as Record<string, unknown>)
      : {};
  const chaptersSource = Array.isArray(source.chapters)
    ? source.chapters
    : Array.isArray(source["黄金三章"])
      ? source["黄金三章"]
      : [];
  const chapters = chaptersSource
    .slice(0, 3)
    .map((chapter: any, index: number) => normalizeGoldenChapter(chapter, index));
  while (chapters.length < 3) chapters.push(emptyGoldenChapter(chapters.length + 1));
  return {
    chapters,
    continuity_checks: normalizeSeedStringList(source.continuity_checks ?? source["连续性检查"]),
    reader_checks: normalizeSeedStringList(source.reader_checks ?? source["读者检查"]),
  };
}

function serializeGoldenChapterToOutline(chapter: GoldenChapterDraft): string {
  return serializeOutlineContent({
    开篇场景: chapter.opening_scene,
    情节点列表: chapter.plot_points.map((point, index) => ({
      order: index + 1,
      description: point.purpose ? `${point.description}（作用：${point.purpose}）` : point.description,
      characters_involved: [],
      estimated_words: 0,
    })),
    角色出场: chapter.character_appearances,
    关键对话: chapter.key_dialogues,
    转折点: chapter.turning_point,
    章末状态: [chapter.ending_state, chapter.hook ? `章末钩子：${chapter.hook}` : ""]
      .filter(Boolean)
      .join("\n"),
  });
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
      projectName.trim() ? `项目暂名: ${projectName.trim()}` : "",
      `核心简介: ${description.trim()}`,
      combinedTargetReaders ? `目标读者: ${combinedTargetReaders}` : "",
      combinedCoreThrills ? `核心爽点: ${combinedCoreThrills}` : "",
      `目标总字数: ${targetWords}`,
      `目标卷数: ${targetVolumes}`,
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

  const handleGenreMatch = async () => {
    setError(null);
    const result = await runSetupAgent(
      "genre_match",
      {
        description: [seedContext(), genreSupplement ? `题材补充要求: ${genreSupplement}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      },
      "题材匹配失败",
    );
    if (!result) {
      return;
    }
    setGenreResult(result.content);
    const parsed = parseJsonSafe(result.content);
    const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
    if (candidates.length > 0) {
      setGenreCandidatesDraft(candidates);
      const first = candidates[0] as GenreCandidate;
      setSelectedGenreDraft(first.genre_name, first.genre_id);
      const template = matchGenreTemplate(candidates, genreTemplates);
      if (template) setSelectedGenreTemplateDraft(template.id);
      confirm(1);
    }
  };

  const handleStyleGeneration = async () => {
    setError(null);
    const genreName = snapshot().selectedGenre || selectedGenre || snapshot().genreCandidates[0]?.genre_name || genreCandidates[0]?.genre_name || "通用";
    const recommended = matchStyleProfile(genreName, styleProfiles);
    const result = await runSetupAgent("style_extractor", {
      text: [
        "请为以下长篇小说开书方案生成一份项目文风指南，返回 JSON。",
        seedContext(),
        genreDraftText(),
        styleSupplement ? `文风补充: ${styleSupplement}` : "",
        recommended ? `推荐文风档案: ${recommended.name}\n${recommended.metrics}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
    }, "文风生成失败");
    if (!result) {
      return;
    }
    const parsed = parseJsonSafe(result.content);
    setStyleAnalysisDraft(parsed?.style_name ? (parsed as StyleAnalysis) : null, result.content);
    confirm(2);
  };

  const handleGenerateVolumes = async () => {
    setError(null);
    const currentCharacters = snapshot().characterNames.length ? snapshot().characterNames : characterNames;
    const result = await runSetupAgent("volume_outline", {
      description: [
        seedContext(),
        "请基于已经编辑确认的全书大纲拆分分卷，不要另起新的主线。",
        `全书大纲:\n${snapshot().outlineResult || outlineResult || "待定"}`,
        currentCharacters.length
          ? `角色/SOUL:\n${currentCharacters
              .map((char) =>
                [
                  char.selectedName || char.candidates[0]?.name || char.role,
                  char.role,
                  char.identity_core,
                  char.persona_core,
                  char.core_motivation,
                  char.description,
                ]
                  .filter(Boolean)
                  .join(" | "),
              )
              .join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      genre: snapshot().selectedGenre || selectedGenre || snapshot().genreCandidates[0]?.genre_name || genreCandidates[0]?.genre_name || "待定",
      target_volumes: String(targetVolumes),
      style_preference: styleDraftText() || "AI 推荐文风",
      genre_template: genreDraftText(),
      extra_requirements: [
        "卷纲必须从全书大纲向下拆分，承接角色成长线和主线冲突。",
        volumeSupplement ? `卷纲补充: ${volumeSupplement}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }, "卷纲生成失败");
    if (!result) {
      return;
    }
    const parsed = parseJsonSafe(result.content);
    if (Array.isArray(parsed?.volumes)) {
      setVolumeDrafts(parsed.volumes, formatVolumes(parsed.volumes));
    } else {
      setVolumeDrafts([], result.content);
    }
    confirm(5);
  };

  const handleGenerateOutline = async () => {
    setError(null);
    const currentCharacters = snapshot().characterNames.length ? snapshot().characterNames : characterNames;
    const result = await runSetupAgent("book_outline", {
      description: seedContext(),
      genre: snapshot().selectedGenre || selectedGenre || snapshot().genreCandidates[0]?.genre_name || genreCandidates[0]?.genre_name || "待定",
      volume_structure: [
        "当前阶段尚未生成分卷。请先生成全书级大纲，再由下一步拆分卷纲。",
        currentCharacters.length
          ? `角色/SOUL:\n${currentCharacters
              .map((char) =>
                [
                  char.selectedName || char.candidates[0]?.name || char.role,
                  char.role,
                  char.identity_core,
                  char.persona_core,
                  char.core_motivation,
                  char.taboo_rules ? `禁忌: ${char.taboo_rules}` : "",
                  char.description,
                ]
                  .filter(Boolean)
                  .join(" | "),
              )
              .join("\n")}`
          : "角色/SOUL: 未生成，请基于故事种子和题材先规划核心人物关系。",
      ].join("\n\n"),
      style_preference: styleDraftText() || "AI 推荐文风",
      genre_template: genreDraftText(),
      extra_requirements: [
        "大纲是全书级，不要写成分卷拆表；请综合角色/SOUL、题材和故事种子确定主线、世界观、阵营、角色弧。",
        outlineSupplement ? `大纲补充: ${outlineSupplement}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }, "全书大纲生成失败");
    if (!result) {
      return;
    }
    setOutlineDraft(result.content);
    confirm(4);
  };

  const handleCharactersAndSoul = async () => {
    setError(null);
    setCharactersSoulGenerating(true);
    setCharactersSoulProgress("");
    const characterBrief = [
      "请基于开书素材生成主角、核心配角、主要对手等 4-6 个角色。",
      seedContext(),
      `题材: ${snapshot().selectedGenre || selectedGenre || "待定"}`,
      genreDraftText(),
      styleDraftText(),
      characterSupplement ? `角色/SOUL补充: ${characterSupplement}` : "",
    ].join("\n\n");
    try {
      const result = await runSetupAgent("name_generator", {
        genre: selectedGenre || genreCandidates[0]?.genre_name || "通用",
        world_framework: description,
        character_descriptions: [characterBrief, styleDraftText()].filter(Boolean).join("\n\n"),
        banned_names: "",
      }, "角色生成失败");
      if (!result) {
        return;
      }
      setNamingResult(result.content);
      const chars = parseCharactersFromContent(result.content);
      if (chars.length === 0) {
        setError("角色生成结果解析失败：AI 返回了内容，但没有识别到 characters 数组，请展开原始结果检查。");
      }
      setCharacterDrafts(chars);

      const results = new Map<string, SoulMatchResult>();
      const nextChars = [...chars];
      for (const [index, char] of chars.entries()) {
        const name = char.selectedName || char.candidates[0]?.name || char.role;
        setCharactersSoulProgress(`${index + 1}/${chars.length} ${name}`);
        const soul = await runSetupAgent("soul_matcher", {
          name,
          role_type: char.role,
          identity_core: [
            char.identity_core,
            char.persona_core,
            char.core_motivation,
            char.taboo_rules ? `禁忌: ${char.taboo_rules}` : "",
            char.description,
            characterSupplement,
            styleDraftText(),
            (snapshot().outlineResult || outlineResult).slice(0, 800),
          ]
            .filter(Boolean)
            .join("\n"),
          soul_templates: "使用内置 SOUL 模板库",
        }, `${name} 的 SOUL 匹配失败`);
        if (soul) {
          setSoulRawResult(soul.content);
          const parsedSoul = parseJsonSafe(soul.content);
          const soulJson = parsedSoul ? JSON.stringify(parsedSoul, null, 2) : soul.content;
          nextChars[index] = enrichCharacterWithSoul(nextChars[index], soulJson);
          setCharacterDrafts([...nextChars]);
          if (parsedSoul?.matched_template) results.set(name, parsedSoul as SoulMatchResult);
        }
      }
      setSoulDrafts(results);
      confirm(3);
    } finally {
      setCharactersSoulGenerating(false);
      setCharactersSoulProgress("");
    }
  };

  const handleBookTitle = async () => {
    setError(null);
    const result = await runSetupAgent("book_title", {
      description: seedContext(),
      genre: snapshot().selectedGenre || selectedGenre || snapshot().genreCandidates[0]?.genre_name || genreCandidates[0]?.genre_name || "待定",
      main_conflict: (snapshot().volumeStructure || volumeStructure).split("\n").slice(0, 8).join(" "),
      outline_summary: (snapshot().outlineResult || outlineResult).slice(0, 900),
      extra_requirements: [genreDraftText(), styleDraftText(), titleSupplement].filter(Boolean).join("\n\n"),
    }, "书名生成失败");
    if (!result) {
      return;
    }
    setTitleResult(result.content);
    const parsed = parseJsonSafe(result.content);
    if (Array.isArray(parsed?.candidates)) {
      setTitleDrafts(parsed.candidates, parsed.candidates[0]?.title || projectName || "");
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
      await handleCharactersAndSoul();
      setCurrentStep(4);
      await handleGenerateOutline();
      setCurrentStep(5);
      await handleGenerateVolumes();
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
        target_words: targetWords,
        target_volumes: targetVolumes,
        min_chapter_words: minChapterWords,
        max_chapter_words: Math.max(maxChapterWords, minChapterWords),
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
            target_readers: combinedTargetReaders,
            core_thrills: combinedCoreThrills,
            target_words: targetWords,
            target_volumes: targetVolumes,
            min_chapter_words: minChapterWords,
            max_chapter_words: Math.max(maxChapterWords, minChapterWords),
          },
          genre: {
            selected_genre: selectedGenre,
            selected_genre_id: selectedGenreId,
            supplement: genreSupplement,
            candidates: genreCandidates,
            template: selectedGenreTemplate,
            draft: genreDraftText(),
          },
          style: {
            supplement: styleSupplement,
            profile: selectedStyleProfile,
            analysis: styleAnalysis,
            raw: styleRawResult,
            draft: styleDraftText(),
          },
          volume_supplement: volumeSupplement,
          volumes: volumesParsed,
          volume_structure: volumeStructure,
          outline_supplement: outlineSupplement,
          outline: outlineResult,
          character_supplement: characterSupplement,
          characters: characterNames,
          title_supplement: titleSupplement,
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
            selectedGenreCandidate?.reason ? `匹配理由: ${selectedGenreCandidate.reason}` : "",
            genreSupplement ? `补充要求: ${genreSupplement}` : "",
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
          styleDraftText() || styleRawResult,
        ]
          .filter(Boolean)
          .join("\n\n"),
        is_hard: false,
        source_type: "quick_start",
      });

      for (const char of characterNames) {
        const name = char.selectedName || char.candidates[0]?.name || char.role;
        const soulData = soulResults.get(name);
        const soulJson = normalizeSoulJson(
          char.soul_json || (soulData ? JSON.stringify(soulData) : "{}"),
          char.description,
        );
        const created = await chapterApi.createCharacter(name, char.role, soulJson);
        await chapterApi.updateCharacter(
          created.id,
          name,
          soulJson,
          char.role,
          char.identity_core || char.description || `${selectedGenre || "本书"}${char.role}`,
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
              <textarea
                value={genreSupplement}
                onChange={(e) => setGenreSupplement(e.target.value)}
                placeholder="题材偏好、排除方向、目标平台或读者补充..."
                className="mb-3 w-full h-20 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
              {renderActionButton(genreCandidates.length ? "重新匹配题材" : "开始匹配题材", handleGenreMatch, !canStart, genreCandidates.length ? "refresh" : "sparkles")}
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
              {renderActionButton(styleRawResult ? "重新生成文风" : "生成文风指南", handleStyleGeneration, !selectedGenre, styleRawResult ? "refresh" : "sparkles")}
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
              {renderActionButton(volumeStructure ? "重新生成卷纲" : "生成卷纲", handleGenerateVolumes, !outlineResult, volumeStructure ? "refresh" : "sparkles")}
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
              {renderActionButton(outlineResult ? "重新生成大纲" : "生成全书大纲", handleGenerateOutline, !selectedGenre, outlineResult ? "refresh" : "sparkles")}
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
              {renderActionButton(characterNames.length ? "重新生成角色/SOUL" : "生成角色/SOUL", handleCharactersAndSoul, !selectedGenre, characterNames.length ? "refresh" : "sparkles")}
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
              {renderActionButton(titleCandidates.length ? "重新生成书名" : "生成书名候选", handleBookTitle, !outlineResult, titleCandidates.length ? "refresh" : "sparkles")}
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
      </div>
    </div>
  );
}
