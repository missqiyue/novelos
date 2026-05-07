import { useState, useEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Binder } from './components/Binder';
import { CommandPalette } from './components/CommandPalette';
import { WorldBible } from './components/WorldBible';
import { SettingsModal } from './components/SettingsModal';
import { Board } from './components/Board';
import { Planning } from './components/Planning';
import { NewBookModal } from './components/NewBookModal';
import { Settings, ChevronDown, CheckCircle2, FileText, MessageSquare, Plus, Lock as LockIcon, Unlock as UnlockIcon, Play, Activity, Wand2, Maximize2, AlertCircle, BookOpen, Layers } from 'lucide-react';


export interface AuditReport {
  expert_name: String;
  passed: boolean;
  suggestions: string[];
}

export interface ReaderReaction {
  reader_type: string;
  comment: string;
  timestamp: string;
}

export interface StructuredReview {
  audit_reports: AuditReport[];
  reader_reactions: ReaderReaction[];
  new_hooks: string[];
  resolved_hook_ids: number[];
  meta?: {
    cached: boolean;
    mock: boolean;
    forced: boolean;
  };
}

export interface StructuredReviewHistoryItem {
  id: number;
  chapter_number: number;
  created_at: number;
  content_hash: string;
  result: StructuredReview;
}

export interface PendingHook {
  id: number;
  hook_desc: string;
  created_at_chapter: number;
  staleness: number;
  is_resolved: boolean;
  resolved_at_chapter: number | null;
}



import { InvisibleCopilot } from './components/InvisibleCopilot';



export interface Chapter {
  id: number;
  chapter_number: number;
  title: string;
  content: string;
  outline: string;
  draft_raw?: string | null;
  status: string;
}

function extractDraftBlock(raw: string, tag: string): string {
  const re = new RegExp(`===\\s*${tag}\\s*===([\\s\\S]*?)(?=\\n===\\s*[A-Z_]+\\s*===|$)`, 'm');
  const m = raw.match(re);
  return (m?.[1] ?? '').trim();
}

function parseChapterDraft(raw: string): { preWriteCheck: string; title: string; content: string } {
  const preWriteCheck = extractDraftBlock(raw, 'PRE_WRITE_CHECK');
  const title = extractDraftBlock(raw, 'CHAPTER_TITLE');
  const content = extractDraftBlock(raw, 'CHAPTER_CONTENT');
  if (content) return { preWriteCheck, title, content };
  return { preWriteCheck, title, content: raw.trim() };
}

export interface WorkspaceBook {
  id: number;
  title: string;
  db_file: string;
  created_at: string;
  last_opened: string;
}

export interface BookMeta {

  title: string;
  genre: string;
  logline: string;
}

export interface AppConfig {
  api_key: string;
  base_url: string;
  model_name: string;
  anti_ai_rules_md: string;
}

function App() {
  const [zenMode, setZenMode] = useState(false);
  const [workspaceBooks, setWorkspaceBooks] = useState<WorkspaceBook[]>([]);
  const [activeBookId, setActiveBookId] = useState<number | null>(null);
  const [showBooksDropdown, setShowBooksDropdown] = useState(false);
  const [deleteTargetBook, setDeleteTargetBook] = useState<WorkspaceBook | null>(null);
  const [deleteBookError, setDeleteBookError] = useState<string | null>(null);
  const [isDeletingBook, setIsDeletingBook] = useState(false);

  const [hooks, setHooks] = useState<PendingHook[]>([]);
  const [showAllHooks, setShowAllHooks] = useState(false);
  const [dynamicContext, setDynamicContext] = useState<string>("");
  const [content, setContent] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditReports, setAuditReports] = useState<AuditReport[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [readerReactions, setReaderReactions] = useState<ReaderReaction[]>([]);
  const [reviewHistory, setReviewHistory] = useState<StructuredReviewHistoryItem[]>([]);
  const [reviewSnapshot, setReviewSnapshot] = useState<string>('latest');
  const [reviewDropdownOpen, setReviewDropdownOpen] = useState(false);
  const reviewDropdownRef = useRef<HTMLDivElement | null>(null);
  const [lastReviewMeta, setLastReviewMeta] = useState<StructuredReview['meta'] | null>(null);
  const [complianceReport, setComplianceReport] = useState<any | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'editor' | 'board' | 'planning' | 'bible' | 'anti_ai'>('editor');
  const [activeChapter, setActiveChapter] = useState(3);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [bookMeta, setBookMeta] = useState<BookMeta>({ title: '', genre: '', logline: '' });
  const [isNewBookOpen, setIsNewBookOpen] = useState(false);
  const [antiAiRulesMd, setAntiAiRulesMd] = useState('');
  const [antiAiDirty, setAntiAiDirty] = useState(false);
  const [isSavingAntiAi, setIsSavingAntiAi] = useState(false);

  const fetchChapters = async () => {
    if (isTauri()) {
      try {
        const list = await invoke<Chapter[]>('get_chapters');
        setChapters(list);
        
        // When fetching chapters finishes, update the content of the currently active chapter
        const active = list.find(c => c.chapter_number === activeChapter);
        if (active && active.content) {
          setContent(active.content);
        } else {
          setContent("");
        }
      } catch (e) {
        console.error(e);
        setChapters([]);
        setContent('');
      }
    } else {
      setChapters([
        { id: 1, chapter_number: 1, title: '第一章：落魄少爷', outline: '', content: "", status: 'draft' },
        { id: 2, chapter_number: 2, title: '第二章：退婚之辱', outline: '', content: "", status: 'draft' },
        { id: 3, chapter_number: 3, title: '第三章：夜雨截杀', outline: '', content: "", status: 'draft' },
      ]);
    }
  };

  useEffect(() => {
    fetchChapters();
  }, []);


  const fetchWorkspaceBooks = async () => {
    if (isTauri()) {
      const books = await invoke<WorkspaceBook[]>('get_workspace_books');
      setWorkspaceBooks(books);
      if (books.length > 0) {
        const exists = activeBookId !== null && books.some(b => b.id === activeBookId);
        if (!exists) {
          setActiveBookId(books[0].id);
        }
      } else {
        setActiveBookId(null);
      }
    } else {
      setWorkspaceBooks([{ id: 1, title: "测试小说", db_file: "test.db", created_at: "", last_opened: "" }]);
    }
  };

  const handleSwitchBook = async (id: number) => {
    if (isTauri()) {
      await invoke('switch_workspace_book', { id });
      setShowBooksDropdown(false);
      setActiveBookId(id);
      // reload everything
      fetchWorkspaceBooks();
      fetchBookMeta();
      fetchChapters();
      fetchHooks();
    }
  };

  const openDeleteBook = (b: WorkspaceBook) => {
    setDeleteTargetBook(b);
    setDeleteBookError(null);
  };

  const confirmDeleteBook = async () => {
    if (!isTauri()) return;
    if (!deleteTargetBook) return;
    setIsDeletingBook(true);
    try {
      const deletingId = deleteTargetBook.id;
      if (activeBookId === null || activeBookId === deletingId) {
        const fallback = workspaceBooks.find(b => b.id !== deletingId);
        if (!fallback) {
          setDeleteBookError('不能删除最后一本书。请先创建另一本文档/项目后再删除。');
          return;
        }
        await invoke('switch_workspace_book', { id: fallback.id });
        setActiveBookId(fallback.id);
      }

      await invoke('delete_workspace_book', { id: deletingId, deleteFile: true });
      setDeleteTargetBook(null);
      setShowBooksDropdown(false);
      const books = await invoke<WorkspaceBook[]>('get_workspace_books');
      setWorkspaceBooks(books);

      if (books.length === 0) {
        setActiveBookId(null);
        setBookMeta({ title: '', genre: '', logline: '' });
        setChapters([]);
        setHooks([]);
        setActiveChapter(1);
        setContent('');
        setCurrentView('editor');
        setIsNewBookOpen(true);
        return;
      }

      const nextId = books[0].id;
      await invoke('switch_workspace_book', { id: nextId });
      setActiveBookId(nextId);
      await fetchBookMeta();
      await fetchChapters();
      await fetchHooks();
      setActiveChapter(1);
    } catch (e) {
      console.error(e);
      setDeleteBookError(String(e));
    } finally {
      setIsDeletingBook(false);
    }
  };


  useEffect(() => {
    fetchWorkspaceBooks();
  }, []);

  const fetchBookMeta = async () => {
    if (isTauri()) {
      try {
        const meta = await invoke<BookMeta>('get_book_meta');
        setBookMeta(meta);
        // Only open the New Book modal if the database is completely empty (no chapters and no title)
        try {
          const chapterList = await invoke<Chapter[]>('get_chapters');
          if (!meta.title && chapterList.length === 0) {
            setIsNewBookOpen(true);
          }
        } catch {
          if (!meta.title) {
            setIsNewBookOpen(true);
          }
        }
      } catch (e) {
        console.error(e);
        setBookMeta({ title: '', genre: '', logline: '' });
      }
    }
  };

  useEffect(() => {
    fetchBookMeta();
  }, []);

  const fetchAntiAiRules = async () => {
    if (!isTauri()) return;
    try {
      const cfg = await invoke<AppConfig>('get_config');
      setAntiAiRulesMd(cfg.anti_ai_rules_md || '');
      setAntiAiDirty(false);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAntiAiRules();
  }, []);

  const handleSaveAntiAiRules = async () => {
    if (!isTauri()) return;
    setIsSavingAntiAi(true);
    try {
      const cfg = await invoke<AppConfig>('get_config');
      await invoke('save_config', { config: { ...cfg, anti_ai_rules_md: antiAiRulesMd } });
      setAntiAiDirty(false);
    } catch (e) {
      console.error(e);
      alert(`保存失败: ${String(e)}`);
    }
    setIsSavingAntiAi(false);
  };

  const activeChapterData = chapters.find(c => c.chapter_number === activeChapter);
  const volumeLabel = bookMeta.title ? `第一卷：${bookMeta.title}` : '第一卷';
  const totalBookChars = chapters.reduce((sum, c) => {
    const t = (c.content || '').trim();
    if (!t) return sum;
    if (t.includes('AI 正在疯狂码字中')) return sum;
    return sum + t.length;
  }, 0);

  const getChapterTitle = () => {
    if (!activeChapterData) return '未选择章节';
    if (!activeChapterData.title) return `第${activeChapterData.chapter_number}章`;
    return activeChapterData.title;
  };

  // Removed unused getChapterContent function

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const fetchHooks = async () => {
    if (isTauri()) {
      try {
        const h = await invoke<PendingHook[]>('get_pending_hooks', { currentChapter: activeChapter });
        setHooks(h);
      } catch (e) {
        console.error(e);
        setHooks([]);
      }
    } else {
      setHooks([
        { id: 1, hook_desc: '林老的真实身份与遗言之谜', created_at_chapter: 2, staleness: 3, is_resolved: false, resolved_at_chapter: null }
      ]);
    }
  };

  useEffect(() => {
    fetchHooks();
    setShowAllHooks(false);
  }, [activeChapter]);

  const fetchDynamicContext = async () => {
    if (!isTauri()) return;
    try {
      const ctx = await invoke<string>('get_dynamic_context', { chapterNumber: activeChapter });
      setDynamicContext(ctx);
    } catch (e) {
      console.error(e);
      setDynamicContext("");
    }
  };

  useEffect(() => {
    fetchDynamicContext();
  }, [activeChapter, activeChapterData?.outline]);

  const fetchLatestCompliance = async () => {
    if (!isTauri()) return;
    try {
      const r = await invoke<any | null>('get_latest_compliance_report', { chapterNumber: activeChapter });
      setComplianceReport(r);
    } catch (e) {
      console.error(e);
      setComplianceReport(null);
    }
  };

  useEffect(() => {
    fetchLatestCompliance();
  }, [activeChapter]);

  const formatReviewTime = (unixSeconds: number) => {
    try {
      return new Date(unixSeconds * 1000).toLocaleString();
    } catch {
      return String(unixSeconds);
    }
  };

  const getReviewStats = (r: StructuredReview) => {
    const failed = r.audit_reports.filter(x => !x.passed).length;
    const suggestions = r.audit_reports.reduce((sum, x) => sum + (x.suggestions?.length || 0), 0);
    const reactions = r.reader_reactions?.length || 0;
    const hooksNew = r.new_hooks?.length || 0;
    const hooksResolved = r.resolved_hook_ids?.length || 0;
    return { failed, suggestions, reactions, hooksNew, hooksResolved };
  };

  const formatReviewOptionLabel = (h: StructuredReviewHistoryItem, idx: number) => {
    const { failed, suggestions, reactions, hooksNew, hooksResolved } = getReviewStats(h.result);
    const seq = reviewHistory.length - idx;
    const hashShort = h.content_hash ? h.content_hash.slice(0, 6) : '';
    return `第${seq}次 · ${formatReviewTime(h.created_at)} · ${failed}红/${suggestions}条 · 弹幕${reactions} · 伏笔+${hooksNew}/-${hooksResolved}${hashShort ? ` · ${hashShort}` : ''}`;
  };

  const fetchLatestReview = async () => {
    if (!isTauri()) return;
    try {
      const res = await invoke<StructuredReview | null>('get_latest_structured_review', { chapterNumber: activeChapter });
      if (res) {
        setAuditReports(res.audit_reports);
        setReaderReactions(res.reader_reactions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReviewHistory = async () => {
    if (!isTauri()) return;
    try {
      const list = await invoke<StructuredReviewHistoryItem[]>('get_structured_review_history', {
        chapterNumber: activeChapter,
        limit: 20
      });
      setReviewHistory(list);
    } catch (e) {
      console.error(e);
      setReviewHistory([]);
    }
  };

  useEffect(() => {
    setReviewSnapshot('latest');
    setReviewDropdownOpen(false);
    fetchLatestReview();
    fetchReviewHistory();
  }, [activeChapter]);

  const handleSelectReviewSnapshot = async (value: string) => {
    setReviewSnapshot(value);
    setLastReviewMeta(null);
    setReviewDropdownOpen(false);
    if (value === 'latest') {
      await fetchLatestReview();
      return;
    }
    const id = Number(value);
    const item = reviewHistory.find(x => x.id === id);
    if (item) {
      setAuditReports(item.result.audit_reports);
      setReaderReactions(item.result.reader_reactions);
    }
  };

  useEffect(() => {
    if (!reviewDropdownOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (!reviewDropdownRef.current) return;
      if (!reviewDropdownRef.current.contains(target)) {
        setReviewDropdownOpen(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReviewDropdownOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [reviewDropdownOpen]);

  const getReviewSnapshotLabel = () => {
    if (reviewSnapshot === 'latest') return '最新';
    const id = Number(reviewSnapshot);
    const item = reviewHistory.find(h => h.id === id);
    if (!item) return '历史';
    return formatReviewTime(item.created_at);
  };

  const handleToggleHookResolved = async (hookId: number, resolved: boolean) => {
    if (!isTauri()) return;
    try {
      await invoke('set_hook_resolved', { hookId, resolved, currentChapter: activeChapter });
      await fetchHooks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCleanupHooks = async () => {
    if (!isTauri()) return;
    if (!confirm('将清理疑似“镜头细节/氛围描写类”的历史伏笔（不可撤销），继续？')) return;
    try {
      const deleted = await invoke<number>('cleanup_pending_hooks', { currentChapter: activeChapter });
      await fetchHooks();
      alert(`已清理 ${deleted} 条历史伏笔`);
    } catch (e) {
      console.error(e);
      alert(`清理失败: ${String(e)}`);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      let draftRaw: string;
      if (isTauri()) {
        const outlineToUse = activeChapterData?.outline;
        if (!outlineToUse || outlineToUse.trim() === '') {
          setIsGenerating(false);
          alert('请先生成本章大纲（200字以内），再生成正文。');
          return;
        }
        
        setContent("AI 正在疯狂码字中，请稍候..."); 
        
        try {
          draftRaw = await invoke<string>('generate_chapter_pipeline', { 
            chapterNumber: activeChapter,
            chapterTitle: activeChapterData?.title || "",
            outline: outlineToUse
          });
          
          const parsed = parseChapterDraft(draftRaw);
          const finalTitle = parsed.title || activeChapterData?.title || "";
          const finalContent = parsed.content;

          const newChapters = chapters.map(c => {
            if (c.chapter_number === activeChapter) {
              return { ...c, title: finalTitle, content: finalContent, draft_raw: draftRaw };
            }
            return c;
          });
          setChapters(newChapters);

          setContent(finalContent);

          await invoke('save_chapter_draft_raw', { chapterNumber: activeChapter, draftRaw });
          if (parsed.title && parsed.title.trim() !== '') {
            await invoke('save_chapter_title', { chapterNumber: activeChapter, title: parsed.title });
          }
          await invoke('save_chapter_content', { chapterNumber: activeChapter, content: finalContent });
          fetchHooks();

          const report = await invoke<any>('compute_compliance_report', { chapterNumber: activeChapter, draftRaw });
          setComplianceReport(report);
          if (report?.overall === 'FAIL') {
            const failed = Array.isArray(report.checks)
              ? report.checks.filter((c: any) => c?.status === 'FAIL').map((c: any) => c?.name).filter(Boolean)
              : [];
            const msg = failed.length ? `合规失败：${failed.join('、')}` : '合规失败';
            if (confirm(`${msg}\n\n是否一键重写修复？`)) {
              const rewrite = Array.isArray(report.actions)
                ? report.actions.find((a: any) => a?.type === 'rewrite_request')
                : null;
              const mustCloseHooks: number[] = Array.isArray(rewrite?.must_close_hooks) ? rewrite.must_close_hooks : [];
              const mustAdvanceThreads: string[] = Array.isArray(rewrite?.must_advance_threads) ? rewrite.must_advance_threads : [];
              const rewrittenRaw = await invoke<string>('rewrite_chapter_with_constraints', {
                req: {
                  chapterNumber: activeChapter,
                  draftRaw,
                  mustCloseHooks,
                  mustAdvanceThreads,
                  mustFollowOneLiner: true
                }
              });
              const rewrittenParsed = parseChapterDraft(rewrittenRaw);
              const rewrittenTitle = rewrittenParsed.title || finalTitle;
              const rewrittenContent = rewrittenParsed.content;
              const updated = chapters.map(c => {
                if (c.chapter_number === activeChapter) {
                  return { ...c, title: rewrittenTitle, content: rewrittenContent, draft_raw: rewrittenRaw };
                }
                return c;
              });
              setChapters(updated);
              setContent(rewrittenContent);
              await invoke('save_chapter_draft_raw', { chapterNumber: activeChapter, draftRaw: rewrittenRaw });
              if (rewrittenParsed.title && rewrittenParsed.title.trim() !== '') {
                await invoke('save_chapter_title', { chapterNumber: activeChapter, title: rewrittenParsed.title });
              }
              await invoke('save_chapter_content', { chapterNumber: activeChapter, content: rewrittenContent });
              await invoke<any>('compute_compliance_report', { chapterNumber: activeChapter, draftRaw: rewrittenRaw });
              await fetchLatestCompliance();
            }
          }
        } catch (e: any) {
          console.error("Invoke failed:", e);
          setContent(`[生成失败]: ${e.toString()}`);
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
        draftRaw = `=== PRE_WRITE_CHECK ===
| 检查项 | 本章记录 | 备注 |
|--------|----------|------|
| 大纲锚定 | （Mock）按本章大纲推进 | |
| 风险扫描 | （Mock）无 | |
| 伏笔闭环 | （Mock）无 | |

=== CHAPTER_TITLE ===
雨夜断剑

=== CHAPTER_CONTENT ===
雨丝如断线的珠子，绵密地砸在青石板上，溅起细碎的水花。楚风握紧了手中的断剑，冰冷的雨水顺着剑身滑落，滴答、滴答，在死寂的小巷中格外清晰。`;
        setContent(parseChapterDraft(draftRaw).content);
      }
    } catch (e: any) {
      console.error(e);
      setContent(`[生成失败]: ${e.toString()}`);
    }
    setIsGenerating(false);
  };

  const handleGenerateOutline = async () => {
    if (!activeChapterData?.title) return;
    setIsGenerating(true);
    try {
      let outline: string;
      if (isTauri()) {
        outline = await invoke<string>('generate_chapter_outline', {
          chapterNumber: activeChapter,
          chapterTitle: activeChapterData.title
        });
        await invoke('save_chapter_outline', { chapterNumber: activeChapter, outline });
        const list = await invoke<Chapter[]>('get_chapters');
        setChapters(list);
      } else {
        await new Promise(resolve => setTimeout(resolve, 800));
        outline = '（Mock）开场钩子：雨夜追杀逼迫主角出手；冲突升级：断剑反击却引来更强者；章末钩子：敌人吐出“王家长老”四字后自尽。';
        const newChapters = chapters.map(c => {
          if (c.chapter_number === activeChapter) {
            return { ...c, outline };
          }
          return c;
        });
        setChapters(newChapters);
      }
    } catch (e) {
      console.error(e);
      alert(`生成大纲失败: ${String(e)}`);
    }
    setIsGenerating(false);
  };

  const handleToggleStatus = async () => {
    if (!activeChapterData) return;
    const newStatus = activeChapterData.status === 'finalized' ? 'draft' : 'finalized';
    if (isTauri()) {
      try {
        await invoke('update_chapter_status', { 
          chapterNumber: activeChapter, 
          status: newStatus 
        });
        const list = await invoke<Chapter[]>('get_chapters');
        setChapters(list);
        if (newStatus === 'finalized') {
          invoke('ai_extract_world_facts_from_chapters', {
            startChapter: activeChapter,
            endChapter: activeChapter,
            clearPending: false
          }).catch(() => {});
          invoke('ai_propose_outline_patch_from_chapter', {
            chapterNumber: activeChapter
          }).catch(() => {});
          invoke('ai_propose_threads_from_chapter', {
            chapterNumber: activeChapter
          }).catch(() => {});
          invoke('ai_propose_soul_timeline_from_chapter', {
            chapterNumber: activeChapter
          }).catch(() => {});
        }
      } catch (e) {
        console.error(e);
        alert(`更新状态失败: ${String(e)}`);
      }
    } else {
      const newChapters = chapters.map(c => {
        if (c.chapter_number === activeChapter) {
          return { ...c, status: newStatus };
        }
        return c;
      });
      setChapters(newChapters);
    }
  };

  const handleStructuredReview = async (forceRefresh: boolean = false) => {
    if (!content) return;
    const outlineToUse = activeChapterData?.outline || '';
    if (outlineToUse.trim() === '') {
      alert('请先生成本章大纲');
      return;
    }

    setIsAuditing(true);
    setIsSimulating(true);
    try {
      if (isTauri()) {
        const res = await invoke<StructuredReview>('run_structured_review', {
          chapterNumber: activeChapter,
          outline: outlineToUse,
          chapterText: content,
          forceRefresh
        });
        setAuditReports(res.audit_reports);
        setReaderReactions(res.reader_reactions);
        setLastReviewMeta(res.meta || null);
        fetchHooks();
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        setAuditReports([
          { expert_name: "逻辑与战力专家", passed: true, suggestions: [] },
          { expert_name: "人设与视角专家", passed: true, suggestions: [] },
          { expert_name: "节奏与爽点专家", passed: false, suggestions: ["建议在冲突升级段增加具体动作与反应，避免空泛总结。"] }
        ]);
        setReaderReactions([
          { reader_type: "逻辑党", comment: "这段动机有点牵强，前面铺垫呢？", timestamp: "00:15" },
          { reader_type: "爽文受众", comment: "别憋了，快打脸！", timestamp: "00:45" },
          { reader_type: "剧情党", comment: "章末钩子再狠一点我才追。", timestamp: "01:20" }
        ]);
      }
    } catch (e) {
      console.error(e);
      alert(`结构化评审失败: ${String(e)}`);
    }
    setIsAuditing(false);
    setIsSimulating(false);
  };

  const handleApplyFullReviewFix = async () => {
    if (!content) return;
    if (auditReports.length === 0 || readerReactions.length === 0) {
      alert('请先完成：结构化评审');
      return;
    }

    const expertIssues = auditReports.flatMap(r => r.suggestions);
    const readerComments = readerReactions.map(r => r.comment);
    if (expertIssues.length === 0 && readerComments.length === 0) return;

    setIsGenerating(true);
    try {
      if (isTauri()) {
        const newDraft = await invoke<string>('apply_full_review_fix', {
          chapterNumber: activeChapter,
          originalText: content,
          expertIssues,
          readerComments
        });
        await invoke('save_chapter_content', { chapterNumber: activeChapter, content: newDraft });
        fetchHooks();
        setContent(newDraft);
        const list = await invoke<Chapter[]>('get_chapters');
        setChapters(list);
      } else {
        await new Promise(resolve => setTimeout(resolve, 1500));
        setContent(content + `\n\n[模拟综合修复]：已综合处理专家问题与读者吐槽。`);
      }
    } catch (e) {
      console.error(e);
      alert(`综合修复失败: ${String(e)}`);
    }
    setIsGenerating(false);
  };

  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-800 font-sans selection:bg-blue-200">
      {/* --- Left Sidebar (Navigator & Assets) --- */}
      {!zenMode && (
        <aside className="w-64 border-r border-zinc-200 bg-zinc-100 flex flex-col transition-all duration-300">
          {/* Header */}
          <div className="relative h-14 flex items-center px-4 border-b border-zinc-200 bg-zinc-50 font-semibold tracking-wide text-sm text-zinc-700 cursor-pointer hover:bg-zinc-100 transition-colors" onClick={() => setShowBooksDropdown(!showBooksDropdown)}>
            <div className="flex items-center justify-between w-full">
              <span className="truncate">📚 {bookMeta.title ? bookMeta.title : 'INKOS STUDIO'}</span>
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            </div>
            
            {showBooksDropdown && (
              <div className="absolute top-14 left-0 w-full bg-white border border-zinc-200 shadow-lg rounded-b-lg z-50 py-2">
                <div className="px-3 py-1 text-xs text-zinc-400 uppercase tracking-wider font-bold">所有项目</div>
                <div className="max-h-48 overflow-y-auto">
                  {workspaceBooks.map(b => (
                    <div 
                      key={b.id} 
                      className="px-4 py-2 hover:bg-blue-50 text-sm cursor-pointer flex items-center gap-2"
                      onClick={(e) => { e.stopPropagation(); handleSwitchBook(b.id); }}
                    >
                      <span className="truncate flex-1">{b.title}</span>
                      <button
                        className={`text-xs px-2 py-0.5 rounded ${
                          activeBookId === b.id ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-red-50 text-red-600 hover:bg-red-100'
                        }`}
                        onClick={(e) => { e.stopPropagation(); openDeleteBook(b); }}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zinc-100 mt-2"></div>
                <div 
                  className="px-4 py-2 hover:bg-zinc-50 text-sm cursor-pointer text-blue-600 flex items-center"
                  onClick={(e) => { e.stopPropagation(); setShowBooksDropdown(false); setIsNewBookOpen(true); }}
                >
                  <Plus className="w-4 h-4 mr-1" /> 新建项目...
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-6">
            <div>
              <div className="text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider px-2 flex items-center justify-between">
                <span>Navigator</span>
                <ChevronDown className="w-3 h-3" />
              </div>
              <Binder 
                chapters={chapters}
                activeChapter={activeChapter} 
                volumeLabel={volumeLabel}
                onSelectChapter={(id) => {
                  setActiveChapter(id);
                  setCurrentView('editor');
                  setAuditReports([]);
                  setReaderReactions([]);
                  setDynamicContext("");
                  const selected = chapters.find(c => c.chapter_number === id);
                  if (selected && selected.content) {
                    setContent(selected.content);
                  } else {
                    setContent("");
                  }
                }} 
                onChapterAdded={fetchChapters}
              />
              <div className="mt-3">
                <div className="text-xs font-bold text-zinc-400 mb-1 uppercase tracking-wider px-2">
                  视图
                </div>
                <div
                  onClick={() => setCurrentView('board')}
                  className={`flex items-center px-2 py-1.5 rounded-md cursor-pointer font-medium text-sm transition-colors ${currentView === 'board' ? 'bg-zinc-200/60 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-200/40'}`}
                >
                  <Layers className="w-4 h-4 mr-2 text-blue-500" /> 故事看板 (Board)
                </div>
                <div
                  onClick={() => setCurrentView('planning')}
                  className={`flex items-center px-2 py-1.5 rounded-md cursor-pointer font-medium text-sm transition-colors ${currentView === 'planning' ? 'bg-zinc-200/60 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-200/40'}`}
                >
                  <Wand2 className="w-4 h-4 mr-2 text-purple-500" /> 策划 (Planning)
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider px-2">
                World Bible
              </div>
              <ul className="space-y-1">
                <li 
                  onClick={() => setCurrentView('bible')}
                  className={`flex items-center px-2 py-1.5 rounded-md cursor-pointer font-medium text-sm transition-colors ${currentView === 'bible' ? 'bg-zinc-200/60 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-200/40'}`}
                >
                  <BookOpen className="w-4 h-4 mr-2 text-amber-500" /> 世界观百科
                </li>
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold text-zinc-400 mb-2 uppercase tracking-wider px-2">
                写作工具
              </div>
              <ul className="space-y-1">
                <li
                  onClick={() => setCurrentView('anti_ai')}
                  className={`flex items-center px-2 py-1.5 rounded-md cursor-pointer font-medium text-sm transition-colors ${currentView === 'anti_ai' ? 'bg-zinc-200/60 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-200/40'}`}
                >
                  <Wand2 className="w-4 h-4 mr-2 text-zinc-600" /> 去AI味规则
                </li>
              </ul>
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t border-zinc-200">
            <div 
              onClick={() => setIsNewBookOpen(true)}
              className="px-4 py-3 flex items-center justify-between text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/50 cursor-pointer transition-colors"
            >
              <span className="text-sm font-medium">创建新书</span>
              <BookOpen className="w-4 h-4" />
            </div>
            <div 
              onClick={() => setIsSettingsOpen(true)}
              className="px-4 py-3 flex items-center justify-between text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/50 cursor-pointer transition-colors"
            >
              <span className="text-sm font-medium">系统与大模型设置</span>
              <Settings className="w-4 h-4" />
            </div>
          </div>
        </aside>
      )}

      {/* --- Middle Column (Dynamic View) --- */}
      {currentView === 'board' ? (
        <Board onNavigateToChapter={(c) => { setActiveChapter(c); setCurrentView('editor'); }} />
      ) : currentView === 'planning' ? (
        <Planning />
      ) : currentView === 'bible' ? (
        <WorldBible />
      ) : currentView === 'anti_ai' ? (
        <main className="flex-1 flex flex-col bg-white relative transition-all duration-300">
          <header className="h-14 border-b border-zinc-200 flex items-center justify-between px-6 bg-white z-10">
            <div className="flex items-center space-x-2 text-sm text-zinc-500">
              <span className="text-zinc-800 font-medium">去AI味规则</span>
              <span className="text-zinc-400">/</span>
              <span className="text-zinc-500">生成正文与综合修复自动注入</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleSaveAntiAiRules}
                disabled={!isTauri() || !antiAiDirty || isSavingAntiAi}
                className="flex items-center px-3 py-1.5 bg-zinc-800 text-white rounded-md hover:bg-zinc-900 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingAntiAi ? '保存中...' : antiAiDirty ? '保存规则' : '已保存'}
              </button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-10 py-8">
            <div className="max-w-4xl mx-auto">
              <div className="text-sm text-zinc-600 mb-3 leading-relaxed">
                支持 Markdown。建议写成可执行的硬约束：禁用词、句式、节奏、叙述方式等。
              </div>
              <textarea
                value={antiAiRulesMd}
                onChange={(e) => {
                  setAntiAiRulesMd(e.target.value);
                  setAntiAiDirty(true);
                }}
                placeholder="# 去AI味写作规则（全局）\n\n## 语言\n- ..."
                rows={22}
                className="w-full min-h-[60vh] px-4 py-3 bg-white border border-zinc-200 rounded-lg text-sm font-mono whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={!isTauri()}
              />
              {!isTauri() && (
                <div className="text-xs text-zinc-500 mt-2">
                  浏览器预览模式无法保存到本地数据库，请使用桌面端窗口。
                </div>
              )}
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex flex-col bg-white relative transition-all duration-300">
          {/* Editor Toolbar */}
        <header className="h-14 border-b border-zinc-200 flex items-center justify-between px-6 bg-white z-10">
          <div className="flex items-center space-x-2 text-sm text-zinc-500">
            <span>写作</span>
            <span>/</span>
            <span className="truncate max-w-[240px]">{volumeLabel}</span>
            <span>/</span>
            <span className="text-zinc-800 font-medium">{getChapterTitle()}</span>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={handleGenerateOutline}
              disabled={isGenerating || !(activeChapterData?.title)}
              className="flex items-center px-3 py-1.5 bg-zinc-900 text-white rounded-md hover:bg-zinc-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="先生成200字以内大纲，再生成正文"
            >
              <FileText className="w-4 h-4 mr-1.5" />
              {isGenerating ? '生成中...' : '生成大纲'}
            </button>
            <button 
              onClick={handleGenerate}
              disabled={isGenerating || activeChapterData?.status === 'finalized'}
              className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={activeChapterData?.status === 'finalized' ? "该章节已定稿，无法重新生成" : ""}
            >
              <Play className="w-4 h-4 mr-1.5" />
              {isGenerating ? '生成中...' : '生成本章'}
            </button>
            <button 
              onClick={(e) => handleStructuredReview(e.shiftKey)}
              disabled={isAuditing || isSimulating || activeChapterData?.status === 'finalized' || !content}
              className="flex items-center px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={activeChapterData?.status === 'finalized' ? "该章节已定稿，无法评审" : "一次性完成：专家审查 + 读者弹幕 + 伏笔回收判定（按住 Shift 强制重新评审）"}
            >
              <Activity className="w-4 h-4 mr-1.5" />
              {(isAuditing || isSimulating) ? '评审中...' : '结构化评审'}
            </button>
            <button 
              onClick={handleApplyFullReviewFix}
              disabled={isGenerating || activeChapterData?.status === 'finalized' || !content || auditReports.length === 0 || readerReactions.length === 0}
              className="flex items-center px-3 py-1.5 bg-zinc-800 text-white rounded-md hover:bg-zinc-900 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={activeChapterData?.status === 'finalized' ? "该章节已定稿，无法修复" : "先完成结构化评审，再一键综合修复"}
            >
              <Wand2 className="w-4 h-4 mr-1.5" />
              综合修复
            </button>
            <div className="w-px h-6 bg-zinc-200 mx-1"></div>
            <button 
              onClick={handleToggleStatus}
              className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeChapterData?.status === 'finalized' ? 'bg-zinc-200 text-zinc-700 hover:bg-zinc-300' : 'bg-green-600 text-white hover:bg-green-700'}`}
              title={activeChapterData?.status === 'finalized' ? "点击解锁以允许修改" : "点击锁定并定稿"}
            >
              {activeChapterData?.status === 'finalized' ? (
                <><UnlockIcon className="w-4 h-4 mr-1.5" /> 解锁修改</>
              ) : (
                <><LockIcon className="w-4 h-4 mr-1.5" /> 审核通过 (定稿)</>
              )}
            </button>
            <button 
              onClick={() => setZenMode(!zenMode)}
              className={`p-2 rounded-md hover:bg-zinc-100 transition-colors ${zenMode ? 'text-blue-600 bg-blue-50' : 'text-zinc-500'}`}
              title="禅模式 (Zen Mode)"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Editor Area */}
        <div className={`flex-1 overflow-y-auto px-12 py-10 flex justify-center ${activeChapterData?.status === 'finalized' ? 'bg-zinc-50' : ''}`}>
          <div className="max-w-2xl w-full relative">
            {activeChapterData?.status === 'finalized' && (
              <div className="absolute -top-4 -right-12 text-green-600 bg-green-100 px-3 py-1 rounded-full text-xs font-bold border border-green-200 shadow-sm flex items-center transform rotate-12">
                <CheckCircle2 className="w-3 h-3 mr-1" /> 已定稿
              </div>
            )}
            
            <h1 className={`text-3xl font-bold text-zinc-800 mb-8 outline-none ${activeChapterData?.status === 'finalized' ? 'opacity-80 select-text' : ''}`} 
                  contentEditable={activeChapterData?.status !== 'finalized'} 
                  suppressContentEditableWarning>
                {getChapterTitle()}
              </h1>
              
              <div className="mb-6 p-4 rounded-lg border border-zinc-200 bg-zinc-50">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">章节大纲（≤200字）</div>
                <div className={`text-sm text-zinc-700 whitespace-pre-wrap outline-none ${activeChapterData?.status === 'finalized' ? 'opacity-80 select-text' : ''}`} 
                     contentEditable={activeChapterData?.status !== 'finalized'} 
                     suppressContentEditableWarning
                     onBlur={(e) => {
                      const newOutline = e.currentTarget.innerText || '';
                      if (isTauri() && activeChapterData && newOutline !== activeChapterData.outline) {
                        invoke('save_chapter_outline', { chapterNumber: activeChapter, outline: newOutline }).then(() => {
                          invoke<Chapter[]>('get_chapters').then(setChapters);
                        });
                      }
                     }}
                >
                  {activeChapterData?.outline ? activeChapterData.outline : <span className="text-zinc-400">先点击右上角“生成大纲”，再生成正文</span>}
                </div>
              </div>
            
            {/* Editor Content */}
            {isGenerating ? (
              <div className="text-lg text-zinc-400 italic flex items-center justify-center min-h-[500px]">
                <Activity className="w-5 h-5 mr-2 animate-pulse text-blue-500" /> AI 正在疯狂码字中，请稍候...
              </div>
            ) : (
              <div 
                key={`editor-${activeChapter}-${content.length}`}
                className={`text-lg text-zinc-700 leading-loose outline-none whitespace-pre-wrap relative min-h-[500px] ${activeChapterData?.status === 'finalized' ? 'opacity-80 select-text' : ''}`} 
                contentEditable={activeChapterData?.status !== 'finalized'} 
                suppressContentEditableWarning
                onBlur={(e) => {
                  const newText = e.currentTarget.innerText || '';
                  if (newText !== content) {
                    setContent(newText);
                    if (isTauri() && activeChapterData) {
                      invoke('save_chapter_content', { chapterNumber: activeChapter, content: newText }).then(() => {
                        invoke<Chapter[]>('get_chapters').then(setChapters);
                      });
                    }
                  }
                }}
              >
                {content || "先生成大纲，再生成正文"}
              </div>
            )}
            
            {activeChapter === 3 && <InvisibleCopilot />}
          </div>
        </div>

          {/* Status Bar */}
          <footer className="h-8 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between px-4 text-xs text-zinc-500">
            <div className="flex items-center space-x-4">
              <span className="flex items-center"><Activity className="w-3 h-3 mr-1 text-green-500" /> Rust Backend Connected</span>
              <span>{content.length} 字</span>
            </div>
            <div>全书：{totalBookChars} 字</div>
          </footer>
        </main>
      )}

      {/* --- Right Sidebar (Context & Inspector) --- */}
      {!zenMode && currentView === 'editor' && (
        <aside className="w-80 border-l border-zinc-200 bg-zinc-50 flex flex-col transition-all duration-300">
          <div className="h-14 flex items-center px-4 border-b border-zinc-200 font-semibold tracking-wide text-sm text-zinc-700">
            💡 智能伴写 (Inspector)
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="bg-white rounded-lg border border-zinc-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold text-zinc-400 mb-3 flex items-center uppercase tracking-wider">
                <AlertCircle className="w-3 h-3 mr-1.5" /> 合规检查
              </h3>
              {!complianceReport ? (
                <div className="text-xs text-zinc-400">暂无合规报告（生成正文后自动生成）</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-700">
                      结果：
                      <span
                        className={`ml-2 inline-flex items-center px-2 py-0.5 rounded border ${
                          complianceReport.overall === 'PASS'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : complianceReport.overall === 'WARN'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {String(complianceReport.overall || '')}
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        if (!isTauri()) return;
                        const raw = activeChapterData?.draft_raw;
                        if (!raw || String(raw).trim() === '') {
                          alert('缺少 draft_raw：请先生成正文');
                          return;
                        }
                        const r = await invoke<any>('compute_compliance_report', { chapterNumber: activeChapter, draftRaw: raw });
                        setComplianceReport(r);
                      }}
                      className="px-2 py-1 rounded text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    >
                      重跑
                    </button>
                  </div>
                  <div className="space-y-1">
                    {(Array.isArray(complianceReport.checks) ? complianceReport.checks : [])
                      .filter((c: any) => c?.status === 'FAIL' || c?.status === 'WARN')
                      .slice(0, 8)
                      .map((c: any, idx: number) => (
                        <div key={`${c?.key ?? idx}`} className="text-xs text-zinc-700 flex items-center justify-between gap-2">
                          <span className="truncate">{String(c?.name || c?.key || '')}</span>
                          <span
                            className={`flex-shrink-0 px-1.5 py-0.5 rounded border ${
                              c?.status === 'FAIL'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {String(c?.status || '')}
                          </span>
                        </div>
                      ))}
                  </div>
                  {complianceReport.overall === 'FAIL' && (
                    <button
                      onClick={async () => {
                        if (!isTauri()) return;
                        const raw = activeChapterData?.draft_raw;
                        if (!raw || String(raw).trim() === '') {
                          alert('缺少 draft_raw：请先生成正文');
                          return;
                        }
                        const rewrite = Array.isArray(complianceReport.actions)
                          ? complianceReport.actions.find((a: any) => a?.type === 'rewrite_request')
                          : null;
                        const mustCloseHooks: number[] = Array.isArray(rewrite?.must_close_hooks) ? rewrite.must_close_hooks : [];
                        const mustAdvanceThreads: string[] = Array.isArray(rewrite?.must_advance_threads) ? rewrite.must_advance_threads : [];
                        const rewrittenRaw = await invoke<string>('rewrite_chapter_with_constraints', {
                          req: {
                            chapterNumber: activeChapter,
                            draftRaw: raw,
                            mustCloseHooks,
                            mustAdvanceThreads,
                            mustFollowOneLiner: true
                          }
                        });
                        const rewrittenParsed = parseChapterDraft(rewrittenRaw);
                        const rewrittenTitle = rewrittenParsed.title || activeChapterData?.title || '';
                        const rewrittenContent = rewrittenParsed.content;
                        setContent(rewrittenContent);
                        const updated = chapters.map(c => {
                          if (c.chapter_number === activeChapter) {
                            return { ...c, title: rewrittenTitle, content: rewrittenContent, draft_raw: rewrittenRaw };
                          }
                          return c;
                        });
                        setChapters(updated);
                        await invoke('save_chapter_draft_raw', { chapterNumber: activeChapter, draftRaw: rewrittenRaw });
                        if (rewrittenParsed.title && rewrittenParsed.title.trim() !== '') {
                          await invoke('save_chapter_title', { chapterNumber: activeChapter, title: rewrittenParsed.title });
                        }
                        await invoke('save_chapter_content', { chapterNumber: activeChapter, content: rewrittenContent });
                        const r = await invoke<any>('compute_compliance_report', { chapterNumber: activeChapter, draftRaw: rewrittenRaw });
                        setComplianceReport(r);
                      }}
                      className="w-full px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                    >
                      一键重写修复
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* Dynamic Context Panel */}
            <div className="bg-white rounded-lg border border-zinc-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold text-zinc-400 mb-3 flex items-center uppercase tracking-wider">
                <MessageSquare className="w-3 h-3 mr-1.5" /> 动态上下文 (RAG)
              </h3>
              {dynamicContext ? (
                <div className="text-xs text-zinc-700 whitespace-pre-wrap leading-relaxed">
                  {dynamicContext}
                </div>
              ) : (
                <div className="text-xs text-zinc-400">暂无动态上下文（生成大纲/正文后会自动注入角色与状态约束）</div>
              )}
            </div>

            {/* Hook Tracker Panel */}
            <div className="bg-white rounded-lg border border-zinc-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold text-zinc-400 mb-3 flex items-center uppercase tracking-wider">
                <Activity className="w-3 h-3 mr-1.5" /> 待回收伏笔 (Hooks)
              </h3>
              <ul className="space-y-2">
                {(showAllHooks ? hooks : hooks.slice(0, 6)).map((hook, i) => (
                  <li key={`${hook.id}-${i}`} className="flex items-start">
                    <input
                      type="checkbox"
                      className="mt-1 mr-2 rounded text-blue-500 border-zinc-300"
                      checked={hook.is_resolved}
                      onChange={(e) => handleToggleHookResolved(hook.id, e.currentTarget.checked)}
                    />
                    <span className="text-sm text-zinc-700 flex-1">
                      {hook.hook_desc}
                    </span>
                    <span className={`text-[10px] px-1 py-0.5 rounded ml-2 ${hook.staleness >= 3 ? 'text-red-600 bg-red-50' : 'text-zinc-500 bg-zinc-100'}`}>
                      滞后 {hook.staleness} 章
                    </span>
                  </li>
                ))}
                {hooks.length === 0 && <div className="text-xs text-zinc-400">暂无未回收伏笔</div>}
              </ul>
              {hooks.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllHooks(v => !v)}
                  className="mt-3 text-xs text-zinc-600 hover:text-zinc-900"
                >
                  {showAllHooks ? '收起' : `显示更多（${hooks.length - 6}）`}
                </button>
              )}
              {isTauri() && hooks.length > 0 && (
                <button
                  type="button"
                  onClick={handleCleanupHooks}
                  className="mt-2 text-xs text-red-600 hover:text-red-700"
                >
                  清理历史噪声伏笔
                </button>
              )}
            </div>

            {/* Audit Panel */}
            <div className="bg-white rounded-lg border border-zinc-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-zinc-400 flex items-center uppercase tracking-wider m-0">
                  <AlertCircle className="w-3 h-3 mr-1.5" /> 结构化评审 (Review)
                </h3>
              </div>
              <div className="relative mb-2" ref={reviewDropdownRef}>
                <button
                  type="button"
                  onClick={() => setReviewDropdownOpen(v => !v)}
                  disabled={!isTauri()}
                  className="flex items-center gap-1 text-xs text-zinc-700 px-2 py-1 rounded hover:bg-zinc-100 disabled:opacity-50 disabled:cursor-not-allowed w-full justify-between"
                  title={!isTauri() ? '仅在桌面端可用' : ''}
                >
                  <span className="truncate">{getReviewSnapshotLabel()}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0" />
                </button>
                {reviewDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-md shadow-lg z-50 overflow-hidden">
                    <div className="max-h-56 overflow-auto">
                      <button
                        type="button"
                        onClick={() => handleSelectReviewSnapshot('latest')}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 ${reviewSnapshot === 'latest' ? 'bg-zinc-100' : ''}`}
                      >
                        最新
                      </button>
                      {reviewHistory.map((h, idx) => (
                        <button
                          key={h.id}
                          type="button"
                          onClick={() => handleSelectReviewSnapshot(String(h.id))}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 ${reviewSnapshot === String(h.id) ? 'bg-zinc-100' : ''}`}
                          title={formatReviewOptionLabel(h, idx)}
                        >
                          <span className="block truncate">{formatReviewOptionLabel(h, idx)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {isTauri() && lastReviewMeta && (
                <div className="text-[10px] text-zinc-500 mb-2">
                  {lastReviewMeta.mock ? '本次评审：模拟（未配置 API Key）' : lastReviewMeta.cached ? '本次评审：命中缓存' : lastReviewMeta.forced ? '本次评审：强制重新评审' : '本次评审：实时评审'}
                </div>
              )}
              {isTauri() && reviewHistory.length > 0 && (
                <div className="text-[10px] text-zinc-500 mb-3">
                  {(() => {
                    const selected = reviewSnapshot === 'latest' ? reviewHistory[0] : reviewHistory.find(x => x.id === Number(reviewSnapshot));
                    if (!selected) return null;
                    const { failed, suggestions, reactions, hooksNew, hooksResolved } = getReviewStats(selected.result);
                    const hashShort = selected.content_hash ? selected.content_hash.slice(0, 10) : '';
                    return `快照：${formatReviewTime(selected.created_at)} · ${failed}红/${suggestions}条建议 · 弹幕${reactions} · 伏笔+${hooksNew}/-${hooksResolved}${hashShort ? ` · hash ${hashShort}` : ''}`;
                  })()}
                </div>
              )}
              <div className="space-y-2">
                {auditReports.length > 0 ? auditReports.map((report, i) => (
                  <div key={i} className="text-sm border-b border-zinc-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-zinc-600 font-medium">{report.expert_name}</span>
                      {report.passed ? (
                        <span className="text-green-500 flex items-center text-xs"><CheckCircle2 className="w-3 h-3 mr-1"/>通过</span>
                      ) : (
                        <span className="text-red-500 flex items-center text-xs"><AlertCircle className="w-3 h-3 mr-1"/>不通过</span>
                      )}
                    </div>
                    {!report.passed && report.suggestions.map((s, j) => (
                      <div key={j} className="text-xs bg-red-50 p-2 rounded mt-1 border border-red-100 relative group">
                        <div className="text-red-700 leading-relaxed">{s}</div>
                      </div>
                    ))}
                  </div>
                )) : (
                  <div className="text-xs text-zinc-400">点击上方“结构化评审”开始评审</div>
                )}
              </div>
            </div>

            {/* Reader Reactions Panel */}
            {readerReactions.length > 0 && (
              <div className="bg-white rounded-lg border border-zinc-200 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold text-zinc-400 flex items-center uppercase tracking-wider m-0">
                    <MessageSquare className="w-3 h-3 mr-1.5" /> 读者本章说模拟
                  </h3>
                </div>
                <div className="space-y-3">
                  {readerReactions.map((reaction, i) => (
                    <div key={i} className="bg-zinc-50 rounded-md p-3 border border-zinc-100 relative group">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                            {reaction.reader_type}
                          </span>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {reaction.timestamp}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-700 leading-relaxed">
                          "{reaction.comment}"
                        </p>
                      </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </aside>
      )}
      {/* Command Palette */}
      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(view) => setCurrentView(view)}
        onGenerate={handleGenerate}
        onAudit={() => handleStructuredReview(false)}
      />

      {/* Settings Modal */}
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      <NewBookModal
        isOpen={isNewBookOpen}
        onClose={() => setIsNewBookOpen(false)}
        onCreated={() => {
          fetchWorkspaceBooks();
          fetchBookMeta();
          fetchChapters();
          setActiveChapter(1);
          setContent('');
          setCurrentView('planning');
        }}
      />

      {deleteTargetBook && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-6">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-zinc-200 bg-zinc-50">
              <div className="text-sm font-bold text-zinc-800">删除书籍</div>
            </div>
            <div className="p-6 space-y-3">
              <div className="text-sm text-zinc-700">
                确定要删除 “{deleteTargetBook.title}” 吗？
              </div>
              <div className="text-xs text-zinc-500">
                将删除本地数据库文件，无法恢复。若删除当前打开的书，会自动切换到其它书（如存在）。
              </div>
              {deleteBookError && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {deleteBookError}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-zinc-200 bg-white flex justify-end space-x-2">
              <button
                onClick={() => setDeleteTargetBook(null)}
                disabled={isDeletingBook}
                className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800 disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={confirmDeleteBook}
                disabled={isDeletingBook}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isDeletingBook ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
