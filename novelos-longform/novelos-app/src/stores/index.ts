import { create } from "zustand";
import {
  bookshelfApi,
  projectApi,
  canonApi,
  outlineApi,
  chapterApi,
  llmApi,
  agentApi,
  ragApi,
  type BookshelfItem,
  type ProjectInfo,
  type CanonRuleInfo,
  type VolumeInfo,
  type ChapterInfo,
  type ChapterTaskInfo,
  type CharacterInfo,
  type LlmConfig,
  type AgentRunResult,
  type AgentLogEntry,
  type IndexStats,
} from "../lib/api";

// ─── Bookshelf Store ───
interface BookshelfState {
  items: BookshelfItem[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  addProject: (title: string, genreId?: string) => Promise<ProjectInfo | null>;
  removeItem: (id: string) => Promise<void>;
  openProject: (projectId: string) => Promise<ProjectInfo | null>;
}

export const useBookshelfStore = create<BookshelfState>((set, get) => ({
  items: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const items = await bookshelfApi.list();
      set({ items, loading: false });
    } catch (e: any) {
      set({ error: e.toString(), loading: false });
    }
  },
  addProject: async (title: string, genreId?: string) => {
    try {
      const project = await projectApi.create({ title, genre_id: genreId });
      await get().fetch();
      return project;
    } catch (e: any) {
      set({ error: e.toString() });
      return null;
    }
  },
  removeItem: async (id: string) => {
    try {
      await bookshelfApi.remove(id);
      await get().fetch();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  openProject: async (projectId: string) => {
    try {
      const project = await projectApi.switch(projectId);
      return project;
    } catch (e: any) {
      set({ error: e.toString() });
      return null;
    }
  },
}));

// ─── Project Store ───
interface ProjectState {
  project: ProjectInfo | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  switchProject: (projectId: string) => Promise<void>;
  closeProject: () => Promise<void>;
  updateProject: (title?: string, status?: string) => Promise<void>;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true });
    try {
      const project = await projectApi.get();
      set({ project, loading: false });
    } catch (e: any) {
      set({ project: null, loading: false, error: e.toString() });
    }
  },
  switchProject: async (projectId: string) => {
    set({ loading: true });
    try {
      const project = await projectApi.switch(projectId);
      set({ project, loading: false });
      // RAG index now lives in SQLite — auto-available when project opens
    } catch (e: any) {
      set({ loading: false, error: e.toString() });
    }
  },
  closeProject: async () => {
    try {
      await projectApi.close();
      set({ project: null });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  updateProject: async (title?: string, status?: string) => {
    try {
      await projectApi.update(title, status);
      const project = await projectApi.get();
      set({ project });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
}));

// ─── Canon Store ───
interface CanonState {
  rules: CanonRuleInfo[];
  selectedRule: CanonRuleInfo | null;
  loading: boolean;
  error: string | null;
  fetch: (scopeType?: string) => Promise<void>;
  selectRule: (rule: CanonRuleInfo | null) => void;
  createRule: (input: Parameters<typeof canonApi.create>[0]) => Promise<CanonRuleInfo | null>;
  updateRule: (
    id: string,
    content?: string,
    ruleName?: string,
    status?: string,
    isHard?: boolean,
    changeReason?: string,
  ) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
}

export const useCanonStore = create<CanonState>((set, get) => ({
  rules: [],
  selectedRule: null,
  loading: false,
  error: null,
  fetch: async (scopeType?: string) => {
    set({ loading: true });
    try {
      const rules = await canonApi.list(scopeType);
      set({ rules, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.toString() });
    }
  },
  selectRule: (rule) => set({ selectedRule: rule }),
  createRule: async (input) => {
    try {
      const rule = await canonApi.create(input);
      await get().fetch();
      return rule;
    } catch (e: any) {
      set({ error: e.toString() });
      return null;
    }
  },
  updateRule: async (id, content, ruleName, status, isHard, changeReason) => {
    try {
      await canonApi.update(id, content, ruleName, status, isHard, changeReason);
      await get().fetch();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  deleteRule: async (id) => {
    try {
      await canonApi.delete(id);
      set({ selectedRule: null });
      await get().fetch();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
}));

// ─── Outline Store ───
interface OutlineState {
  volumes: VolumeInfo[];
  loading: boolean;
  error: string | null;
  fetchVolumes: () => Promise<void>;
  updateVolume: (
    id: string,
    title?: string,
    goal?: string,
    mainConflict?: string,
    climax?: string,
    settlement?: string,
    status?: string,
  ) => Promise<void>;
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  volumes: [],
  loading: false,
  error: null,
  fetchVolumes: async () => {
    set({ loading: true });
    try {
      const volumes = await outlineApi.listVolumes();
      set({ volumes, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.toString() });
    }
  },
  updateVolume: async (id, title, goal, mainConflict, climax, settlement, status) => {
    try {
      await outlineApi.updateVolume(id, title, goal, mainConflict, climax, settlement, status);
      await get().fetchVolumes();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
}));

// ─── Chapter Store ───
interface ChapterState {
  chapters: ChapterInfo[];
  currentChapter: ChapterInfo | null;
  characters: CharacterInfo[];
  tasks: ChapterTaskInfo[];
  validTransitions: string[];
  loading: boolean;
  error: string | null;
  fetchChapters: () => Promise<void>;
  fetchCharacters: () => Promise<void>;
  fetchTasks: (volumeId?: string) => Promise<void>;
  selectChapter: (chapterNumber: number) => Promise<void>;
  updateDraft: (chapterNumber: number, draftText: string, skipVersion?: boolean) => Promise<void>;
  finalize: (chapterNumber: number) => Promise<void>;
  rollback: (chapterNumber: number, versionNo: number) => Promise<void>;
  createCharacter: (name: string, roleType?: string, soulJson?: string) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  transitionState: (chapterNumber: number, newStatus: string) => Promise<void>;
  fetchValidTransitions: (chapterNumber: number) => Promise<void>;
  setCompileStatus: (chapterNumber: number, compilerStatus: string) => Promise<void>;
  setReviewStatus: (chapterNumber: number, reviewStatus: string) => Promise<void>;
}

export const useChapterStore = create<ChapterState>((set, get) => ({
  chapters: [],
  currentChapter: null,
  characters: [],
  tasks: [],
  validTransitions: [],
  loading: false,
  error: null,
  fetchChapters: async () => {
    set({ loading: true });
    try {
      const chapters = await chapterApi.listChapters();
      set({ chapters, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.toString() });
    }
  },
  fetchCharacters: async () => {
    try {
      const characters = await chapterApi.listCharacters();
      set({ characters });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  fetchTasks: async (volumeId?: string) => {
    try {
      const tasks = await chapterApi.listTasks(volumeId);
      set({ tasks });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  selectChapter: async (chapterNumber: number) => {
    try {
      const chapter = await chapterApi.getChapter(chapterNumber);
      set({ currentChapter: chapter });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  updateDraft: async (chapterNumber, draftText, skipVersion) => {
    try {
      const chapter = await chapterApi.updateDraft(chapterNumber, draftText, skipVersion);
      set({ currentChapter: chapter });
      const chapters = await chapterApi.listChapters();
      set({ chapters });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  finalize: async (chapterNumber) => {
    try {
      await chapterApi.finalize(chapterNumber);
      const chapter = await chapterApi.getChapter(chapterNumber);
      set({ currentChapter: chapter });
      // RAG index now lives in SQLite — no manual save needed
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  rollback: async (chapterNumber, versionNo) => {
    try {
      const chapter = await chapterApi.rollback(chapterNumber, versionNo);
      set({ currentChapter: chapter });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  createCharacter: async (name, roleType, soulJson) => {
    try {
      await chapterApi.createCharacter(name, roleType, soulJson);
      await get().fetchCharacters();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  deleteCharacter: async (id) => {
    try {
      await chapterApi.deleteCharacter(id);
      await get().fetchCharacters();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  transitionState: async (chapterNumber, newStatus) => {
    try {
      const chapter = await chapterApi.transitionState(chapterNumber, newStatus);
      set({ currentChapter: chapter });
      await get().fetchChapters();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  fetchValidTransitions: async (chapterNumber) => {
    try {
      const transitions = await chapterApi.getValidTransitions(chapterNumber);
      set({ validTransitions: transitions });
    } catch {
      set({ validTransitions: [] });
    }
  },
  setCompileStatus: async (chapterNumber, compilerStatus) => {
    try {
      await chapterApi.setCompileStatus(chapterNumber, compilerStatus);
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  setReviewStatus: async (chapterNumber, reviewStatus) => {
    try {
      await chapterApi.setReviewStatus(chapterNumber, reviewStatus);
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
}));

// ─── Character Store (dedicated for Characters page) ───
interface CharacterState {
  characters: CharacterInfo[];
  selectedCharacter: CharacterInfo | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  select: (char: CharacterInfo | null) => void;
  create: (name: string, roleType?: string, soulJson?: string) => Promise<CharacterInfo | null>;
  update: (
    id: string,
    name?: string,
    soulJson?: string,
    roleType?: string,
    identityCore?: string,
    personaCore?: string,
    coreMotivation?: string,
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useCharacterStore = create<CharacterState>((set, get) => ({
  characters: [],
  selectedCharacter: null,
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true });
    try {
      const characters = await chapterApi.listCharacters();
      set({ characters, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.toString() });
    }
  },
  select: (char) => set({ selectedCharacter: char }),
  create: async (name, roleType, soulJson) => {
    try {
      const char = await chapterApi.createCharacter(name, roleType, soulJson);
      await get().fetch();
      return char;
    } catch (e: any) {
      set({ error: e.toString() });
      return null;
    }
  },
  update: async (id, name, soulJson, roleType, identityCore, personaCore, coreMotivation) => {
    try {
      await chapterApi.updateCharacter(
        id,
        name,
        soulJson,
        roleType,
        identityCore,
        personaCore,
        coreMotivation,
      );
      await get().fetch();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  remove: async (id) => {
    try {
      await chapterApi.deleteCharacter(id);
      set({ selectedCharacter: null });
      await get().fetch();
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
}));

// ─── LLM Store ───
interface LlmState {
  config: LlmConfig | null;
  loading: boolean;
  error: string | null;
  isStreaming: boolean;
  streamingText: string;
  fetchConfig: () => Promise<void>;
  updateConfig: (updates: Partial<LlmConfig>) => Promise<void>;
  saveConfigToDb: (config: LlmConfig) => Promise<void>;
  chat: (messages: { role: string; content: string }[]) => Promise<string | null>;
  chatWithSystem: (systemPrompt: string, userPrompt: string) => Promise<string | null>;
  chatStream: (messages: { role: string; content: string }[]) => Promise<string | null>;
  startStreaming: () => void;
  appendStreamDelta: (delta: string) => void;
  finishStreaming: () => void;
  cancelStreaming: () => void;
}

let streamUnlisten: (() => void) | null = null;

export const useLlmStore = create<LlmState>((set, get) => ({
  config: null,
  loading: false,
  error: null,
  isStreaming: false,
  streamingText: "",
  fetchConfig: async () => {
    try {
      const config = await llmApi.getConfig();
      set({ config });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  updateConfig: async (updates) => {
    try {
      const config = await llmApi.updateConfig(
        updates.provider,
        updates.base_url,
        updates.api_key,
        updates.model,
        updates.max_tokens,
        updates.temperature,
      );
      set({ config });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  saveConfigToDb: async (config: LlmConfig) => {
    try {
      await llmApi.saveConfigToDb(config);
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  chat: async (messages) => {
    try {
      const response = await llmApi.chat(messages);
      return response.content;
    } catch (e: any) {
      set({ error: e.toString() });
      return null;
    }
  },
  chatWithSystem: async (systemPrompt, userPrompt) => {
    try {
      const response = await llmApi.chatWithSystem(systemPrompt, userPrompt);
      return response.content;
    } catch (e: any) {
      set({ error: e.toString() });
      return null;
    }
  },
  startStreaming: () => set({ isStreaming: true, streamingText: "" }),
  appendStreamDelta: (delta: string) => {
    const prev = get().streamingText;
    set({ streamingText: prev + delta });
  },
  finishStreaming: () => set({ isStreaming: false }),
  cancelStreaming: () => {
    if (streamUnlisten) {
      streamUnlisten();
      streamUnlisten = null;
    }
    set({ isStreaming: false, streamingText: "" });
  },
  chatStream: async (messages) => {
    const requestId = crypto.randomUUID();
    set({ isStreaming: true, streamingText: "", error: null });

    try {
      // Set up event listener for Tauri streaming events
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<import("../lib/api").StreamMessage>(
        "llm-stream-chunk",
        (event) => {
          if (event.payload.request_id !== requestId) return;
          const chunk = event.payload.chunk;
          if (chunk.delta) {
            get().appendStreamDelta(chunk.delta);
          }
          if (chunk.done) {
            get().finishStreaming();
          }
        },
      );
      streamUnlisten = unlisten;

      // Start the streaming request
      await llmApi.chatStream(messages, requestId);

      // Clean up listener
      unlisten();
      streamUnlisten = null;

      const result = get().streamingText;
      set({ isStreaming: false });
      return result || null;
    } catch (e: any) {
      set({ isStreaming: false, error: e.toString() });
      return null;
    }
  },
}));

// ─── Agent Store ───
interface AgentState {
  running: boolean;
  lastResult: AgentRunResult | null;
  logs: AgentLogEntry[];
  error: string | null;
  runAgent: (
    agentName: string,
    variables: Record<string, string>,
  ) => Promise<AgentRunResult | null>;
  fetchLogs: (agentName?: string, limit?: number) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set) => ({
  running: false,
  lastResult: null,
  logs: [],
  error: null,
  runAgent: async (agentName, variables) => {
    set({ running: true, error: null });
    try {
      const result = await agentApi.run(agentName, variables);
      set({ running: false, lastResult: result });
      return result;
    } catch (e: any) {
      set({ running: false, error: e.toString() });
      return null;
    }
  },
  fetchLogs: async (agentName, limit) => {
    try {
      const logs = await agentApi.listLogs(agentName, limit);
      set({ logs });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
}));

// ─── Comments Store ───
export interface ImportedComment {
  id: number;
  content: string;
  sentiment: string; // "positive" | "negative" | "mixed" | ""
}

interface CommentsState {
  comments: ImportedComment[];
  setComments: (comments: ImportedComment[]) => void;
  updateSentiment: (id: number, sentiment: string) => void;
  clearComments: () => void;
}

export const useCommentsStore = create<CommentsState>((set) => ({
  comments: [],
  setComments: (comments) => set({ comments }),
  updateSentiment: (id, sentiment) =>
    set((state) => ({
      comments: state.comments.map((c) => (c.id === id ? { ...c, sentiment } : c)),
    })),
  clearComments: () => set({ comments: [] }),
}));

// ─── UI Store ───
interface UiState {
  zenMode: boolean;
  toggleZenMode: () => void;
  enterZenMode: () => void;
  exitZenMode: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  zenMode: false,
  toggleZenMode: () => set((s) => ({ zenMode: !s.zenMode })),
  enterZenMode: () => set({ zenMode: true }),
  exitZenMode: () => set({ zenMode: false }),
}));

// ─── RAG Store ───
interface RagState {
  stats: IndexStats | null;
  loading: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  search: (query: string, topK?: number) => Promise<import("../lib/api").SimilarChapterResult[]>;
  semanticRecall: (queryText: string, topK?: number, intent?: import("../lib/api").RagIntentFilter) => Promise<import("../lib/api").RagSemanticRecallItem[]>;
  clearIndex: () => Promise<void>;
}

export const useRagStore = create<RagState>((set, get) => ({
  stats: null,
  loading: false,
  error: null,
  fetchStats: async () => {
    try {
      const stats = await ragApi.getIndexStats();
      set({ stats });
    } catch (e: any) {
      set({ error: e.toString() });
    }
  },
  search: async (query, topK) => {
    try {
      return await ragApi.searchSimilar(query, topK);
    } catch (e: any) {
      set({ error: e.toString() });
      return [];
    }
  },
  semanticRecall: async (queryText, topK, intent) => {
    try {
      const resp = await ragApi.semanticRecall(queryText, topK, intent);
      return resp.results;
    } catch (e: any) {
      set({ error: e.toString() });
      return [];
    }
  },
  clearIndex: async () => {
    set({ loading: true });
    try {
      const { project } = useProjectStore.getState();
      if (project) await ragApi.clearBookIndex(project.id);
      await get().fetchStats();
      set({ loading: false });
    } catch (e: any) {
      set({ loading: false, error: e.toString() });
    }
  },

}));
