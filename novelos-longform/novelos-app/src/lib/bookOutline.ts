export interface BookOutlineVolumeDraft {
  volume_number: number;
  title: string;
  goal: string;
  main_conflict: string;
  climax: string;
  settlement: string;
  chapter_start: string;
  chapter_end: string;
  status: string;
  extras: Record<string, unknown>;
}

export interface BookOutlineDraft {
  title: string;
  genre: string;
  main_theme: string;
  world_framework: string;
  power_system: string;
  volume_structure: string;
  outline: string;
  main_characters_text: string;
  volumes: BookOutlineVolumeDraft[];
  extras: Record<string, unknown>;
}

const TOP_LEVEL_KEYS = new Set([
  "title",
  "genre",
  "main_theme",
  "world_framework",
  "power_system",
  "volume_structure",
  "outline",
  "main_characters",
  "volumes",
]);

const VOLUME_KEYS = new Set([
  "volume_number",
  "title",
  "goal",
  "main_conflict",
  "climax",
  "settlement",
  "chapter_start",
  "chapter_end",
  "status",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringifyInline(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(stringifyInline).filter(Boolean).join("、");
  const record = asRecord(value);
  if (!record) return "";
  return Object.values(record).map(stringifyInline).filter(Boolean).join("；");
}

function normalizeListText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(stringifyInline).map((s) => s.trim()).filter(Boolean).join("\n");
  }
  if (typeof value === "string") {
    return value.replace(/[、,，;；]+/g, "\n").trim();
  }
  return "";
}

function toOptionalInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

function pickExtras(record: Record<string, unknown>, excluded: Set<string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !excluded.has(key)));
}

function parseVolume(value: unknown, index: number): BookOutlineVolumeDraft {
  if (typeof value === "string") {
    return {
      volume_number: index + 1,
      title: value,
      goal: "",
      main_conflict: "",
      climax: "",
      settlement: "",
      chapter_start: "",
      chapter_end: "",
      status: "",
      extras: {},
    };
  }

  const record = asRecord(value) ?? {};
  return {
    volume_number: Number(record.volume_number) || index + 1,
    title: stringifyInline(record.title),
    goal: stringifyInline(record.goal),
    main_conflict: stringifyInline(record.main_conflict),
    climax: stringifyInline(record.climax),
    settlement: stringifyInline(record.settlement),
    chapter_start: stringifyInline(record.chapter_start),
    chapter_end: stringifyInline(record.chapter_end),
    status: stringifyInline(record.status),
    extras: pickExtras(record, VOLUME_KEYS),
  };
}

export function emptyBookOutlineDraft(defaultTitle = ""): BookOutlineDraft {
  return {
    title: defaultTitle,
    genre: "",
    main_theme: "",
    world_framework: "",
    power_system: "",
    volume_structure: "",
    outline: "",
    main_characters_text: "",
    volumes: [],
    extras: {},
  };
}

export function parseBookOutlineContent(contentJson: string, defaultTitle = ""): BookOutlineDraft {
  try {
    const parsed = JSON.parse(contentJson);
    const record = asRecord(parsed) ?? {};
    const volumes = Array.isArray(record.volumes)
      ? record.volumes.map((item, index) => parseVolume(item, index))
      : [];

    return {
      title: stringifyInline(record.title) || defaultTitle,
      genre: stringifyInline(record.genre),
      main_theme: stringifyInline(record.main_theme),
      world_framework: stringifyInline(record.world_framework),
      power_system: stringifyInline(record.power_system),
      volume_structure: stringifyInline(record.volume_structure),
      outline: stringifyInline(record.outline),
      main_characters_text: normalizeListText(record.main_characters),
      volumes,
      extras: pickExtras(record, TOP_LEVEL_KEYS),
    };
  } catch {
    return emptyBookOutlineDraft(defaultTitle);
  }
}

function serializeVolume(volume: BookOutlineVolumeDraft): Record<string, unknown> {
  const result: Record<string, unknown> = {
    ...volume.extras,
    volume_number: volume.volume_number,
    title: volume.title.trim(),
    goal: volume.goal.trim(),
    main_conflict: volume.main_conflict.trim(),
    climax: volume.climax.trim(),
    settlement: volume.settlement.trim(),
  };

  const chapterStart = toOptionalInt(volume.chapter_start);
  const chapterEnd = toOptionalInt(volume.chapter_end);
  const status = volume.status.trim();

  if (chapterStart !== undefined) {
    result.chapter_start = chapterStart;
  }
  if (chapterEnd !== undefined) {
    result.chapter_end = chapterEnd;
  }
  if (status) {
    result.status = status;
  }

  return result;
}

export function serializeBookOutlineDraft(draft: BookOutlineDraft): string {
  const content: Record<string, unknown> = {
    ...draft.extras,
    title: draft.title.trim(),
    genre: draft.genre.trim(),
    main_theme: draft.main_theme.trim(),
    world_framework: draft.world_framework.trim(),
    power_system: draft.power_system.trim(),
    volume_structure: draft.volume_structure.trim(),
    outline: draft.outline.trim(),
    main_characters: draft.main_characters_text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    volumes: draft.volumes.map(serializeVolume),
  };

  return JSON.stringify(content, null, 2);
}
