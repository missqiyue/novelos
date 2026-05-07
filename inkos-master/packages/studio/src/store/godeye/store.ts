import { create } from "zustand";

export interface Beat {
  id: string;
  title: string;
  description: string;
  emotion: number;
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  value: number;
  affinity: number;
}

export interface GodEyeState {
  // 细纲节拍表
  isBeatSheetOpen: boolean;
  beats: Beat[];
  setBeatSheetOpen: (open: boolean) => void;
  setBeats: (beats: Beat[]) => void;
  updateBeat: (id: string, updates: Partial<Beat>) => void;
  reorderBeats: (oldIndex: number, newIndex: number) => void;

  // 手术刀编辑
  lockedParagraphs: Record<string, boolean>;
  toggleParagraphLock: (id: string) => void;
  inlineFeedback: Record<string, string>;
  setInlineFeedback: (id: string, feedback: string) => void;

  // 资产交易所
  assets: Asset[];
  setAssets: (assets: Asset[]) => void;
  updateAsset: (id: string, updates: Partial<Asset>) => void;

  // 流式 Diff
  isDiffOpen: boolean;
  setDiffOpen: (open: boolean) => void;
  diffOriginal: string;
  diffModified: string;
  setDiffContents: (original: string, modified: string) => void;
}

export const useGodEyeStore = create<GodEyeState>((set, get) => ({
  isBeatSheetOpen: false,
  beats: [],
  setBeatSheetOpen: (open) => set({ isBeatSheetOpen: open }),
  setBeats: (beats) => set({ beats }),
  updateBeat: (id, updates) =>
    set((state) => ({
      beats: state.beats.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    })),
  reorderBeats: (oldIndex, newIndex) =>
    set((state) => {
      const newBeats = [...state.beats];
      const [removed] = newBeats.splice(oldIndex, 1);
      newBeats.splice(newIndex, 0, removed);
      return { beats: newBeats };
    }),

  lockedParagraphs: {},
  toggleParagraphLock: (id) =>
    set((state) => ({
      lockedParagraphs: {
        ...state.lockedParagraphs,
        [id]: !state.lockedParagraphs[id],
      },
    })),
  inlineFeedback: {},
  setInlineFeedback: (id, feedback) =>
    set((state) => ({
      inlineFeedback: { ...state.inlineFeedback, [id]: feedback },
    })),

  assets: [],
  setAssets: (assets) => set({ assets }),
  updateAsset: (id, updates) =>
    set((state) => ({
      assets: state.assets.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  isDiffOpen: false,
  setDiffOpen: (open) => set({ isDiffOpen: open }),
  diffOriginal: "",
  diffModified: "",
  setDiffContents: (original, modified) =>
    set({ diffOriginal: original, diffModified: modified }),
}));
