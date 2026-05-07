import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type Lang = "zh" | "en";

const translations: Record<Lang, Record<string, string>> = {
  zh: {
    "app.name": "NovelOS Longform",
    "app.tagline": "AI驱动的长篇小说创作系统",
    "nav.dashboard": "看板",
    "nav.canon": "正典",
    "nav.outline": "剧情树",
    "nav.chapter": "章节",
    "nav.characters": "角色",
    "nav.ledger": "账本",
    "nav.settings": "设置",
    "bookshelf.empty": "书架空空如也，点击「新建长篇」开始创作",
    "bookshelf.new": "新建长篇",
    "bookshelf.sample": "示例项目",
    "bookshelf.import": "导入TXT",
    "bookshelf.export": "导出",
    "chapter.save": "保存",
    "chapter.finalize": "定稿",
    "chapter.ai_draft": "AI 生成草稿",
    "chapter.ai_filter": "去AI化审校",
    "chapter.ai_fix": "AI 修复",
    "chapter.compile": "编译检查",
    "chapter.pipeline": "全链路生成",
    "chapter.versions": "版本历史",
    "chapter.diff": "对比",
    "chapter.restore": "恢复",
    "compiler.pass": "通过",
    "compiler.warning": "警告",
    "compiler.fail": "失败",
    "common.loading": "加载中...",
    "common.empty": "暂无数据",
    "common.save": "保存",
    "common.cancel": "取消",
    "common.create": "创建",
    "common.delete": "删除",
    "common.confirm": "确认",
    "common.search": "搜索...",
    "common.back": "返回",
    "common.retry": "重试",
    "error.boundary": "页面出现了错误",
    "error.unknown": "未知错误",
  },
  en: {
    "app.name": "NovelOS Longform",
    "app.tagline": "AI-Powered Long-Form Novel Writing System",
    "nav.dashboard": "Dashboard",
    "nav.canon": "Canon",
    "nav.outline": "Outline",
    "nav.chapter": "Chapter",
    "nav.characters": "Characters",
    "nav.ledger": "Ledger",
    "nav.settings": "Settings",
    "bookshelf.empty": "Your bookshelf is empty. Create a new novel to begin.",
    "bookshelf.new": "New Novel",
    "bookshelf.sample": "Sample",
    "bookshelf.import": "Import TXT",
    "bookshelf.export": "Export",
    "chapter.save": "Save",
    "chapter.finalize": "Finalize",
    "chapter.ai_draft": "AI Draft",
    "chapter.ai_filter": "De-AI Filter",
    "chapter.ai_fix": "AI Fix",
    "chapter.compile": "Compile",
    "chapter.pipeline": "Full Pipeline",
    "chapter.versions": "Versions",
    "chapter.diff": "Diff",
    "chapter.restore": "Restore",
    "compiler.pass": "Pass",
    "compiler.warning": "Warning",
    "compiler.fail": "Fail",
    "common.loading": "Loading...",
    "common.empty": "No data",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.create": "Create",
    "common.delete": "Delete",
    "common.confirm": "Confirm",
    "common.search": "Search...",
    "common.back": "Back",
    "common.retry": "Retry",
    "error.boundary": "Something went wrong",
    "error.unknown": "Unknown error",
  },
};

interface I18nContextType {
  lang: Lang;
  t: (key: string, fallback?: string) => string;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextType>({
  lang: "zh",
  t: (key, fallback) => fallback || key,
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("novelos-lang") as Lang) || "zh";
    } catch {
      return "zh";
    }
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("novelos-lang", l);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      return translations[lang]?.[key] || fallback || key;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, t, setLang }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
