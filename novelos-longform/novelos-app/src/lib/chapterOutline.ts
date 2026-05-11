export interface PlotPoint {
  order: number;
  description: string;
  characters_involved: string[];
  estimated_words: number;
}

export interface ChapterOutlineSections {
  开篇场景: string;
  情节点列表: PlotPoint[];
  角色出场: string[];
  关键对话: string[];
  转折点: string;
  章末状态: string;
  总字数估算?: number;
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/);
  return (fenced?.[1] ?? trimmed).replace(/^\uFEFF/, "").trim();
}

function parseJsonLike(content: string): unknown | null {
  const cleaned = stripJsonFence(content);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stringifyInline(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyInline).filter(Boolean).join("、");
  const record = asRecord(value);
  if (!record) return "";
  return Object.values(record).map(stringifyInline).filter(Boolean).join("；");
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(stringifyInline)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeCharacters(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const record = asRecord(item);
      if (!record) return "";
      const name = stringifyInline(record.name);
      const role = stringifyInline(record.role_in_chapter ?? record.role);
      const action = stringifyInline(record.key_action ?? record.action);
      return [name, role, action].filter(Boolean).join("：");
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeDialogues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      const record = asRecord(item);
      if (!record) return "";
      const participants = stringifyInline(record.participants);
      const purpose = stringifyInline(record.purpose);
      const setting = stringifyInline(record.setting);
      return [participants && `【${participants}】`, purpose, setting && `场景：${setting}`]
        .filter(Boolean)
        .join(" ");
    })
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizePlotPoints(value: unknown): PlotPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === "string") {
        return {
          order: index + 1,
          description: item,
          characters_involved: [],
          estimated_words: 0,
        };
      }
      const record = asRecord(item);
      if (!record) return null;
      const description = stringifyInline(record.description ?? record.desc ?? record.content);
      if (!description) return null;
      return {
        order: asNumber(record.order) || index + 1,
        description,
        characters_involved: normalizeStringList(
          record.characters_involved ?? record.characters ?? record.roles,
        ),
        estimated_words: asNumber(record.estimated_words ?? record.words),
      };
    })
    .filter((point): point is PlotPoint => Boolean(point));
}

function parsePlotPointsFromText(text: string): PlotPoint[] {
  if (!text.trim()) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => ({
      order: idx + 1,
      description: line.replace(/^[-*\d.]+\s*/, "").trim(),
      characters_involved: [],
      estimated_words: 0,
    }))
    .filter((point) => Boolean(point.description));
}

function parseListFromText(text: string): string[] {
  if (!text.trim()) return [];
  return text
    .split("\n")
    .map((l) => l.replace(/^[-*\d.]+\s*/, "").trim())
    .filter(Boolean);
}

function normalizeOutlineData(data: Record<string, unknown>): ChapterOutlineSections {
  return {
    开篇场景: stringifyInline(data.开篇场景 ?? data.opening_scene),
    情节点列表: normalizePlotPoints(data.情节点列表 ?? data.plot_points),
    角色出场: normalizeCharacters(
      data.角色出场 ?? data.character_appearances ?? data.characters_appearing,
    ),
    关键对话: normalizeDialogues(data.关键对话 ?? data.key_dialogues),
    转折点: stringifyInline(data.转折点 ?? data.turning_point),
    章末状态: stringifyInline(data.章末状态 ?? data.ending_state ?? data.chapter_end_state),
    总字数估算: asNumber(data.total_estimated_words) || undefined,
  };
}

export function parseOutlineContent(content: string): ChapterOutlineSections | null {
  const parsed = parseJsonLike(content);
  const parsedRecord = asRecord(parsed);
  const resultRecord = asRecord(parsedRecord?.result) ?? parsedRecord;

  if (resultRecord) {
    return normalizeOutlineData(resultRecord);
  }

  const sections: Record<string, string> = {};
  const sectionNames = ["开篇场景", "情节点列表", "角色出场", "关键对话", "转折点", "章末状态"];
  let currentSection = "";
  const lines = content.split("\n");

  for (const line of lines) {
    const match = line.match(/^#{1,3}\s*(.+)/) || line.match(/^【(.+)】/);
    if (match) {
      const name = match[1].trim();
      const found = sectionNames.find((s) => name.includes(s));
      if (found) {
        currentSection = found;
        sections[currentSection] = "";
        continue;
      }
    }
    if (currentSection) {
      sections[currentSection] += (sections[currentSection] ? "\n" : "") + line;
    }
  }

  if (Object.keys(sections).length === 0) return null;

  return {
    开篇场景: sections["开篇场景"] || "",
    情节点列表: parsePlotPointsFromText(sections["情节点列表"] || ""),
    角色出场: parseListFromText(sections["角色出场"] || ""),
    关键对话: parseListFromText(sections["关键对话"] || ""),
    转折点: sections["转折点"] || "",
    章末状态: sections["章末状态"] || "",
  };
}
