import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { useChapterStore, useCanonStore, useAgentStore, useLlmStore, useProjectStore, useUiStore } from "../../stores";
import { RichTextEditor } from "../common/RichTextEditor";
import {
  FileText,
  Save,
  CheckCircle,
  Clock,
  Shield,
  Sparkles,
  Loader2,
  ClipboardList,
  Wand2,
  ChevronDown,
  ChevronUp,
  Eye,
  History,
  RotateCcw,
  ArrowRight,
  AlertTriangle,
  Archive,
  Edit3,
  XCircle,
  Play,
  StepForward,
  Brain,
  MoreHorizontal,
  Zap,
  AlertCircle,
  RotateCw,
  Maximize2,
  Minimize2,
  Target,
} from "lucide-react";
import {
  compilerApi,
  chapterApi,
  orchestratorApi,
  crashRecoveryApi,
  type CompileResult,
  type PipelineResult,
  type RecalledContext,
  type CrashRecoveryInfo,
  type ReviewConflict,
  type ParagraphRewriteResult,
} from "../../lib/api";
import type { ChapterVersionInfo } from "../../lib/api";
import { DiffViewer } from "../common/DiffViewer";
import { ContextHelp } from "../common/ContextHelp";
import { useWritingStats } from "../../hooks/useWritingStats";
import { platform } from "../../lib/platform";

const statusLabels: Record<string, { label: string; color: string }> = {
  task_ready: { label: "任务就绪", color: "bg-gray-100 text-gray-600" },
  drafting: { label: "草稿中", color: "bg-yellow-100 text-yellow-700" },
  draft_done: { label: "草稿完成", color: "bg-blue-100 text-blue-700" },
  draft_generated: { label: "草稿已生成", color: "bg-blue-100 text-blue-700" },
  reviewing: { label: "审阅中", color: "bg-purple-100 text-purple-700" },
  compile_failed: { label: "编译失败", color: "bg-red-100 text-red-700" },
  approved: { label: "已批准", color: "bg-green-100 text-green-700" },
  finalized: { label: "已定稿", color: "bg-green-100 text-green-700" },
  archived: { label: "已归档", color: "bg-gray-100 text-gray-500" },
  needs_revalidate: { label: "需重新验证", color: "bg-orange-100 text-orange-700" },
};

export function ChapterWorkbench() {
  const { chapterNumber } = useParams();
  const num = parseInt(chapterNumber || "1", 10);
  const {
    currentChapter,
    characters,
    tasks,
    selectChapter,
    updateDraft,
    finalize,
    fetchCharacters,
    fetchTasks,
    rollback,
  } = useChapterStore();
  const { rules, fetch: fetchCanon } = useCanonStore();
  const { runAgent, running: agentRunning } = useAgentStore();
  const { isStreaming, streamingText, chatStream, finishStreaming } = useLlmStore();
  const { zenMode, exitZenMode, enterZenMode } = useUiStore();

  // AI Rewrite (WF-011~013)
  const [rewriting, setRewriting] = useState(false);
  const handleRewrite = async (mode: string) => {
    if (!draftText.trim()) return;
    setRewriting(true);
    try {
      const canonText = rules
        .filter((r) => r.status === "active")
        .map((r) => `[${r.is_hard ? "硬" : "软"}] ${r.rule_name}: ${r.content}`)
        .join("\n");
      const soulText = characters
        .filter((c) => c.status === "active")
        .map((c) => `${c.name}: ${c.soul_json.slice(0, 200)}`)
        .join("\n");

      const result = await runAgent("rewrite_agent", {
        mode,
        requirements:
          mode === "repair"
            ? "修复编译器和评审发现的问题"
            : mode === "compress"
              ? "压缩冗余内容，精简表达"
              : mode === "hook_up"
                ? "增强章末钩子，提升期待感"
                : "去除AI写作痕迹，增加个性化",
        chapter_text: draftText,
        canon_rules: canonText || "暂无",
        soul_refs: soulText || "暂无",
      });
      if (result) {
        // Extract the rewritten text (before the JSON summary)
        const text = result.content.split("\n---\n")[0] || result.content;
        setDraftText(text);
        await updateDraft(num, text);
      }
    } catch {
      /* rewrite failed */
    }
    setRewriting(false);
  };

  const handleRunPipeline = async () => {
    setPipelineRunning(true);
    setPipelineExpanded(true);
    try {
      const result = await orchestratorApi.runPipeline(num);
      setPipelineResult(result);
      // If draft was generated, set it
      const draftStep = result.steps.find((s) => s.name === "AI撰写草稿");
      if (draftStep?.status === "completed" && draftStep.output) {
        setDraftText(draftStep.output);
        await updateDraft(num, draftStep.output);
      }
      // Fetch updated tasks
      await fetchTasks();
    } catch (e: any) {
      console.error("Pipeline failed:", e);
    }
    setPipelineRunning(false);
  };

  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveTimer, setAutoSaveTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [crashRecoveries, setCrashRecoveries] = useState<CrashRecoveryInfo[]>([]);
  const [lastSavedText, setLastSavedText] = useState("");
  const [taskExpanded, setTaskExpanded] = useState(true);
  const [compileExpanded, setCompileExpanded] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineExpanded, setPipelineExpanded] = useState(false);
  const [conflictResolutions, setConflictResolutions] = useState<Record<number, string>>({});
  const { validTransitions, transitionState, fetchValidTransitions, setCompileStatus } =
    useChapterStore();

  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [versions, setVersions] = useState<ChapterVersionInfo[]>([]);
  const [diffTarget, setDiffTarget] = useState<ChapterVersionInfo | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [recallExpanded, setRecallExpanded] = useState(false);
  const [recalledContext, setRecalledContext] = useState<RecalledContext | null>(null);
  const [recalling, setRecalling] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const moreActionsRef = useRef<HTMLDivElement>(null);
  const [rewritingParagraph, setRewritingParagraph] = useState<number | null>(null);
  const [rewriteResult, setRewriteResult] = useState<ParagraphRewriteResult | null>(null);

  useEffect(() => {
    selectChapter(num);
    fetchCharacters();
    fetchCanon();
    fetchTasks();
  }, [num, selectChapter, fetchCharacters, fetchCanon, fetchTasks]);

  useEffect(() => {
    fetchValidTransitions(num);
  }, [num, currentChapter?.status, fetchValidTransitions]);

  useEffect(() => {
    if (currentChapter?.draft_text) {
      setDraftText(currentChapter.draft_text);
      setLastSavedText(currentChapter.draft_text);
      setIsDirty(false);
    }
  }, [currentChapter?.id]); // Only reset when chapter ID changes, not every draft update

  const handleSave = useCallback(async () => {
    if (!draftText.trim()) return;
    setSaving(true);
    await updateDraft(num, draftText); // manual save — creates version record
    setLastSavedText(draftText);
    setIsDirty(false);
    setSaving(false);
  }, [num, draftText, updateDraft]);

  const handleEditorChange = useCallback(
    (_html: string, text: string) => {
      setDraftText(text);
      setIsDirty(text !== lastSavedText);
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      const timer = setTimeout(async () => {
        if (text.trim()) {
          await updateDraft(num, text, true); // auto-save — skip version record
          setLastSavedText(text);
          setIsDirty(false);
        }
      }, 3000);
      setAutoSaveTimer(timer);
    },
    [num, autoSaveTimer, updateDraft, lastSavedText],
  );

  // Keyboard save shortcut listener
  useEffect(() => {
    const handler = () => handleSave();
    window.addEventListener("save-current-chapter", handler);
    return () => window.removeEventListener("save-current-chapter", handler);
  }, [draftText, num, handleSave]);

  // Esc to exit Zen Mode
  useEffect(() => {
    if (!zenMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitZenMode();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zenMode, exitZenMode]);

  // Window close handler — emergency save before quitting
  useEffect(() => {
    if (!platform.isTauri) return;
    const unlisten = import("@tauri-apps/api/event").then(({ listen }) =>
      listen("close-requested", async () => {
        if (isDirty && draftText.trim()) {
          await crashRecoveryApi.emergencySave(num, draftText);
        }
        // Now safe to exit
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().destroy();
      }),
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isDirty, draftText, num]);

  // Browser beforeunload guard (for web mode)
  useEffect(() => {
    if (platform.isTauri) return; // Tauri handles close via event above
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, platform.isTauri]);

  // Check for crash recovery on mount
  useEffect(() => {
    if (!platform.isTauri) return;
    crashRecoveryApi.check().then(setCrashRecoveries).catch(() => {});
  }, []);

  // Click outside handler for "more actions" dropdown
  useEffect(() => {
    if (!moreActionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreActionsRef.current && !moreActionsRef.current.contains(e.target as Node)) {
        setMoreActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreActionsOpen]);

  const handleFinalize = async () => {
    if (!currentChapter) return;
    await finalize(num);
    await fetchValidTransitions(num);
  };

  const handleTransition = async (newStatus: string) => {
    setTransitioning(true);
    await transitionState(num, newStatus);
    setTransitioning(false);
  };

  const handleCompileAndReport = async () => {
    await handleCompile();
    // After compile, set compile status based on result
    if (compileResult) {
      const compilerStatus = compileResult.status === "fail" ? "fail" : "pass";
      await setCompileStatus(num, compilerStatus);
      if (compilerStatus === "fail") {
        try {
          await transitionState(num, "compile_failed");
        } catch {
          /* state may not allow this transition */
        }
      }
    }
  };

  // AI Task Card generation
  const handleGenerateTaskCard = async () => {
    setGenerating(true);
    try {
      const canonText = rules
        .filter((r) => r.status === "active")
        .map((r) => `[${r.is_hard ? "硬" : "软"}] ${r.rule_name}: ${r.content}`)
        .join("\n");

      const result = await runAgent("task_card", {
        genre: "玄幻",
        current_volume: "1",
        chapter_number: String(num),
        outline_context: "",
        prev_chapters_summary: "",
        canon_rules: canonText || "暂无",
        chapter_direction: `第${num}章写作方向`,
      });
      if (result) {
        // Parse the result and create a task card
        const parsed = parseJsonSafe(result.content);
        if (parsed?.objective) {
          try {
            await chapterApi.createTask(
              num,
              parsed.objective,
              undefined,
              undefined,
              parsed.must_progress?.join("；"),
              parsed.must_recall?.join("；"),
              parsed.must_avoid?.join("；"),
            );
            await fetchTasks();
          } catch {
            /* task may already exist */
          }
        }
      }
    } catch {
      /* generation failed */
    }
    setGenerating(false);
  };

  const transitionLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> =
    {
      drafting: {
        label: "开始写作",
        icon: <Edit3 size={12} />,
        color: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200",
      },
      draft_generated: {
        label: "草稿完成",
        icon: <CheckCircle size={12} />,
        color: "bg-blue-100 text-blue-700 hover:bg-blue-200",
      },
      reviewing: {
        label: "提交审阅",
        icon: <Eye size={12} />,
        color: "bg-purple-100 text-purple-700 hover:bg-purple-200",
      },
      approved: {
        label: "批准",
        icon: <CheckCircle size={12} />,
        color: "bg-green-100 text-green-700 hover:bg-green-200",
      },
      finalized: {
        label: "定稿",
        icon: <CheckCircle size={12} />,
        color: "bg-green-600 text-white hover:bg-green-700",
      },
      archived: {
        label: "归档",
        icon: <Archive size={12} />,
        color: "bg-gray-100 text-gray-700 hover:bg-gray-200",
      },
      compile_failed: {
        label: "编译失败",
        icon: <AlertTriangle size={12} />,
        color: "bg-red-100 text-red-700 hover:bg-red-200",
      },
      rewrite_required: {
        label: "需重写",
        icon: <Edit3 size={12} />,
        color: "bg-orange-100 text-orange-700 hover:bg-orange-200",
      },
      needs_revalidate: {
        label: "重新验证",
        icon: <RotateCcw size={12} />,
        color: "bg-orange-100 text-orange-700 hover:bg-orange-200",
      },
      task_ready: {
        label: "重置任务",
        icon: <RotateCcw size={12} />,
        color: "bg-gray-100 text-gray-600 hover:bg-gray-200",
      },
    };

  // AI Draft Generation (streaming)
  const handleAiDraft = async () => {
    setGenerating(true);
    const canonText = rules
      .filter((r) => r.status === "active")
      .map((r) => `[${r.is_hard ? "硬规则" : "软规则"}] ${r.rule_name}: ${r.content}`)
      .join("\n");

    const soulText = characters
      .filter((c) => c.status === "active")
      .map((c) => `${c.name}(${c.role_type}): ${c.soul_json.slice(0, 200)}`)
      .join("\n");

    const taskCard = currentChapter?.task_id || `第${num}章写作任务`;

    try {
      const result = await chatStream([
        {
          role: "system",
          content: `你是一位经验丰富的长篇小说作家。请根据以下信息撰写本章草稿，要求2000-4000字。

正典规则:
${canonText || "暂无"}

角色参考:
${soulText || "暂无"}`,
        },
        {
          role: "user",
          content: `请根据以下任务卡撰写第${num}章草稿:\n${taskCard}\n\n前文摘要:（前文摘要待实现）`,
        },
      ]);

      if (result) {
        setDraftText(result);
        await updateDraft(num, result);
      }
    } catch {
      // Fallback to agent-based generation if streaming fails
      const result = await runAgent("draft_writer", {
        min_words: "2000",
        max_words: "4000",
        soul_refs: soulText || "暂无",
        task_card: taskCard,
        canon_rules: canonText || "暂无",
        prev_summary: "（前文摘要待实现）",
      });

      if (result) {
        setDraftText(result.content);
        await updateDraft(num, result.content);
      }
    }
    setGenerating(false);
  };

  // AI Voice Filter
  const handleVoiceFilter = async () => {
    if (!draftText.trim()) return;
    setFiltering(true);

    const soulText = characters
      .filter((c) => c.status === "active")
      .map((c) => `${c.name}: ${c.soul_json.slice(0, 200)}`)
      .join("\n");

    const result = await runAgent("voice_filter", {
      draft_text: draftText,
      soul_refs: soulText || "暂无",
      de_ai_rules: "避免高频AI用词，打破模板化句式，减少过度比喻",
    });

    if (result) {
      setDraftText(result.content);
      await updateDraft(num, result.content);
    }
    setFiltering(false);
  };

  // Real compiler check via backend
  const handleCompile = async () => {
    if (!draftText.trim()) return;
    setCompileExpanded(true);
    setCompiling(true);
    try {
      const result = await compilerApi.compile(num, draftText);
      setCompileResult(result);
    } catch (e: any) {
      setCompileResult(null);
    }
    setCompiling(false);
  };

  const handleParagraphRewrite = async (paragraphIndex: number, message: string) => {
    setRewritingParagraph(paragraphIndex);
    setRewriteResult(null);
    try {
      const result = await compilerApi.rewriteParagraph(num, paragraphIndex, message);
      setRewriteResult(result);
      if (result.compile_score != null && compileResult) {
        setCompileResult({ ...compileResult, score: result.compile_score });
      }
      // Reload chapter draft
      const updated = await chapterApi.getChapter(num);
      if (updated?.draft_text) {
        setDraftText(updated.draft_text);
        setLastSavedText(updated.draft_text);
      }
    } catch (e: any) {
      console.error("Paragraph rewrite failed:", e);
    }
    setRewritingParagraph(null);
  };

  const handleFetchVersions = useCallback(async () => {
    try {
      const { chapterApi } = await import("../../lib/tauri");
      const v = await chapterApi.listVersions(num);
      setVersions(v);
    } catch {
      /* no versions yet */
    }
  }, [num]);

  const handleRecallContext = async () => {
    setRecallExpanded(true);
    setRecalling(true);
    try {
      const result = await chapterApi.recallContext(num);
      setRecalledContext(result);
    } catch {
      setRecalledContext(null);
    }
    setRecalling(false);
  };

  const handleRollback = async (versionNo: number) => {
    await rollback(num, versionNo);
    if (currentChapter?.draft_text) {
      setDraftText(currentChapter.draft_text);
    }
    handleFetchVersions();
  };

  useEffect(() => {
    if (historyExpanded) handleFetchVersions();
  }, [historyExpanded, handleFetchVersions]);

  const wordCount = draftText.length;
  const parseJsonSafe = (text: string): any => {
    try {
      const cleaned = text
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  };

  // Writing stats
  const { project } = useProjectStore();
  const { todayWords, todayMinutes, sessionActive, startSession, updateWordCount, endSession } =
    useWritingStats(project?.id, wordCount);
  useEffect(() => {
    if (sessionActive) updateWordCount(wordCount);
  }, [wordCount, sessionActive, updateWordCount]);

  const statusInfo = statusLabels[currentChapter?.status || "task_ready"];

  return (
    <div className="flex h-full">
      {/* Main editing area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Zen Mode: minimal floating bar */}
        {zenMode ? (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 bg-white/90 backdrop-blur rounded-full shadow-lg border border-gray-200 text-sm">
            <span className="text-gray-700 font-medium">第{num}章</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-600">{wordCount} 字</span>
            {project?.target_words && (
              <>
                <span className="text-gray-400">|</span>
                <span className="text-gray-500">
                  {Math.round((wordCount / project.target_words) * 100)}%
                </span>
              </>
            )}
            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, project?.target_words ? (wordCount / project.target_words) * 100 : 0)}%` }}
              />
            </div>
            {sessionActive && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                写作中
              </span>
            )}
            <button
              onClick={exitZenMode}
              className="flex items-center gap-1 text-gray-400 hover:text-gray-700 ml-2"
              title="退出专注模式 (Esc)"
            >
              <Minimize2 size={14} />
            </button>
          </div>
        ) : (
        /* Top bar */
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-indigo-600" />
            <h2 className="font-semibold text-gray-900">
              第{num}章 {currentChapter?.title || ""}
            </h2>
            {isDirty && (
              <span className="w-2 h-2 bg-amber-500 rounded-full" title="有未保存的更改" />
            )}
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${statusInfo?.color || "bg-gray-100"}`}
            >
              {statusInfo?.label || currentChapter?.status}
            </span>
            {currentChapter?.compiler_status && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  currentChapter.compiler_status === "pass"
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {currentChapter.compiler_status === "pass" ? "OK" : "FAIL"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{wordCount} 字</span>
            {isDirty && (
              <span className="text-xs text-amber-600">未保存</span>
            )}
            {saving && (
              <span className="text-xs text-blue-500">保存中...</span>
            )}
            {!isDirty && !saving && draftText.trim() && (
              <span className="text-xs text-green-600">已保存</span>
            )}
            {/* Writing session indicator */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {sessionActive ? (
                <>
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  <span className="hidden sm:inline">写作中</span>
                  <button onClick={endSession} className="text-gray-400 hover:text-gray-600">
                    停止
                  </button>
                </>
              ) : (
                <button
                  onClick={() => startSession(wordCount)}
                  className="text-gray-400 hover:text-green-600"
                  title="开始写作统计"
                >
                  <span className="w-1.5 h-1.5 bg-gray-300 rounded-full inline-block mr-1" />
                  计时
                </button>
              )}
              {todayWords > 0 && (
                <span className="hidden sm:inline">
                  今日: +{todayWords}字/{todayMinutes}分钟
                </span>
              )}
            </div>
            {/* Smart action button based on chapter state */}
            {currentChapter?.status === "task_ready" && (
              <button
                onClick={() => handleTransition("drafting")}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
              >
                <Play size={14} /> <span className="hidden sm:inline">开始写作</span>
              </button>
            )}
            {(currentChapter?.status === "drafting" ||
              currentChapter?.status === "draft_generated") && (
              <>
                <button
                  onClick={handleCompileAndReport}
                  disabled={compiling}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50"
                >
                  {compiling ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  <span className="hidden sm:inline">编译检查</span>
                </button>
                <ContextHelp
                  id="compile_button"
                  text="编译检查会自动检测正典规则冲突、角色一致性、伏笔超期等问题，只有通过编译的章节才能定稿。"
                  position="bottom"
                />
                <button
                  onClick={() => handleTransition("reviewing")}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
                >
                  <StepForward size={14} /> <span className="hidden sm:inline">提交审阅</span>
                </button>
              </>
            )}
            {currentChapter?.status === "compile_failed" && (
              <>
                <button
                  onClick={() => handleRewrite("repair")}
                  disabled={rewriting}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
                >
                  {rewriting ? <Loader2 size={14} className="animate-spin" /> : <Edit3 size={14} />}
                  <span className="hidden sm:inline">AI修复</span>
                </button>
                <button
                  onClick={() => handleTransition("drafting")}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700"
                >
                  <span className="hidden sm:inline">手动修改</span>
                </button>
              </>
            )}
            {(currentChapter?.status === "approved" || currentChapter?.status === "finalized") && (
              <button
                onClick={() => handleTransition("archived")}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700"
              >
                <Archive size={14} /> <span className="hidden sm:inline">归档</span>
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
              title="保存 (⌘S)"
            >
              <Save size={14} />
              <span className="hidden sm:inline">{saving ? "保存中..." : "保存"}</span>
            </button>
            <button
              onClick={enterZenMode}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100"
              title="专注模式"
            >
              <Maximize2 size={14} />
              <span className="hidden sm:inline">专注</span>
            </button>
            {currentChapter?.status !== "finalized" && currentChapter?.status !== "archived" && (
              <button
                onClick={handleFinalize}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
              >
                <CheckCircle size={14} />
                <span className="hidden sm:inline">定稿</span>
              </button>
            )}
            {validTransitions.filter(
              (ts) => ts !== "finalized" && ts !== "archived" && transitionLabels[ts],
            ).length > 0 && (
              <div className="flex items-center gap-1">
                {validTransitions
                  .filter((ts) => ts !== "finalized" && ts !== "archived" && transitionLabels[ts])
                  .map((ts) => {
                    const info = transitionLabels[ts];
                    return (
                      <button
                        key={ts}
                        onClick={() => handleTransition(ts)}
                        disabled={transitioning}
                        className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${info.color} disabled:opacity-50`}
                      >
                        {info.icon}
                        {info.label}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Task Card Panel (collapsible) — hidden in Zen Mode */}
        {!zenMode && (
        <div className="border-b border-gray-200 bg-amber-50 shrink-0">
          <button
            onClick={() => setTaskExpanded(!taskExpanded)}
            className="w-full flex items-center justify-between px-6 py-2 text-sm"
          >
            <span className="flex items-center gap-2 font-medium text-amber-800">
              <ClipboardList size={14} />
              章节任务卡
            </span>
            {taskExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {taskExpanded && (
            <div className="px-6 pb-3 text-sm text-amber-900">
              {(() => {
                const task = tasks.find((t) => t.chapter_number === num);
                if (task) {
                  return (
                    <div className="space-y-1">
                      <p className="text-amber-800 font-medium">{task.objective}</p>
                      {task.must_progress && (
                        <p className="text-amber-700">
                          <span className="font-medium">必须推进：</span>
                          {task.must_progress}
                        </p>
                      )}
                      {task.must_recall && (
                        <p className="text-amber-700">
                          <span className="font-medium">必须召回：</span>
                          {task.must_recall}
                        </p>
                      )}
                      {task.must_avoid && (
                        <p className="text-amber-700">
                          <span className="font-medium">必须避免：</span>
                          {task.must_avoid}
                        </p>
                      )}
                      {task.required_hooks && (
                        <p className="text-amber-700">
                          <span className="font-medium">必要钩子：</span>
                          {task.required_hooks}
                        </p>
                      )}
                      {task.ending_hook && (
                        <p className="text-amber-700">
                          <span className="font-medium">章末钩子：</span>
                          {task.ending_hook}
                        </p>
                      )}
                      {task.status && (
                        <span className="inline-block text-xs px-2 py-0.5 bg-amber-200 rounded">
                          {task.status}
                        </span>
                      )}
                    </div>
                  );
                }
                return (
                  <>
                    <p className="text-amber-700">
                      第{num}章写作任务 — 完成本章核心情节推进，保持与前后章节的连贯性。
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="text-xs px-2 py-0.5 bg-amber-200 rounded">推进剧情</span>
                      <span className="text-xs px-2 py-0.5 bg-amber-200 rounded">角色互动</span>
                      <span className="text-xs px-2 py-0.5 bg-amber-200 rounded">章末钩子</span>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
        )}

        {/* AI Action bar — hidden in Zen Mode */}
        {!zenMode && (
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 border-b border-gray-100 bg-gray-50 shrink-0 flex-wrap">
          <button
            onClick={handleRunPipeline}
            disabled={pipelineRunning || agentRunning}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
          >
            {pipelineRunning ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            <span className="hidden sm:inline">
              {pipelineRunning ? "全链路中..." : "全链路生成"}
            </span>
          </button>
          <button
            onClick={handleGenerateTaskCard}
            disabled={generating || agentRunning}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-700 disabled:opacity-50"
          >
            {generating ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ClipboardList size={12} />
            )}
            <span className="hidden sm:inline">{generating ? "生成中..." : "AI 任务卡"}</span>
          </button>
          <button
            onClick={handleAiDraft}
            disabled={generating || agentRunning}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            <span className="hidden sm:inline">{generating ? "生成中..." : "AI 生成草稿"}</span>
          </button>
          <button
            onClick={handleVoiceFilter}
            disabled={filtering || agentRunning || !draftText.trim()}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs hover:bg-purple-700 disabled:opacity-50"
          >
            {filtering ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            <span className="hidden sm:inline">{filtering ? "审校中..." : "去AI化审校"}</span>
          </button>
          <button
            onClick={() => handleRewrite("repair")}
            disabled={rewriting || agentRunning || !draftText.trim()}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 disabled:opacity-50"
            title="根据编译/评审反馈修复问题"
          >
            {rewriting ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />}
            <span className="hidden sm:inline">{rewriting ? "修复中..." : "AI 修复"}</span>
          </button>
          <button
            onClick={handleCompileAndReport}
            disabled={compiling || !draftText.trim()}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-700 disabled:opacity-50"
          >
            {compiling ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
            <span className="hidden sm:inline">{compiling ? "编译中..." : "编译检查"}</span>
          </button>
          <button
            onClick={() => setHistoryExpanded(!historyExpanded)}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-gray-600 text-white rounded-lg text-xs hover:bg-gray-700"
          >
            <History size={12} />
            <span className="hidden sm:inline">版本历史</span>
          </button>
          <button
            onClick={handleRecallContext}
            disabled={recalling}
            className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs hover:bg-teal-700 disabled:opacity-50"
          >
            {recalling ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
            <span className="hidden sm:inline">{recalling ? "召回中..." : "召回上下文"}</span>
          </button>

          {/* 更多操作 dropdown */}
          <div className="relative" ref={moreActionsRef}>
            <button
              onClick={() => setMoreActionsOpen(!moreActionsOpen)}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-gray-500 text-white rounded-lg text-xs hover:bg-gray-600"
              title="更多操作"
            >
              <MoreHorizontal size={12} />
              <span className="hidden sm:inline">更多操作</span>
              <ChevronDown
                size={10}
                className={`transition-transform ${moreActionsOpen ? "rotate-180" : ""}`}
              />
            </button>
            {moreActionsOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1">
                <button
                  onClick={() => {
                    handleRewrite("compress");
                    setMoreActionsOpen(false);
                  }}
                  disabled={rewriting || agentRunning || !draftText.trim()}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                >
                  <Edit3 size={14} className="shrink-0" />
                  <span>压缩章节</span>
                </button>
                <button
                  onClick={() => {
                    handleRewrite("hook_up");
                    setMoreActionsOpen(false);
                  }}
                  disabled={rewriting || agentRunning || !draftText.trim()}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                >
                  <Zap size={14} className="shrink-0" />
                  <span>增强钩子</span>
                </button>
                <div className="border-t border-gray-100 my-1" />
                <button
                  onClick={() => {
                    handleGenerateTaskCard();
                    setMoreActionsOpen(false);
                  }}
                  disabled={generating || agentRunning}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                >
                  <ClipboardList size={14} className="shrink-0" />
                  <span>生成任务卡</span>
                </button>
                <button
                  onClick={() => {
                    handleVoiceFilter();
                    setMoreActionsOpen(false);
                  }}
                  disabled={filtering || agentRunning || !draftText.trim()}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                >
                  <Sparkles size={14} className="shrink-0" />
                  <span>去AI化审校</span>
                </button>
              </div>
            )}
          </div>
        </div>
        )}

        {/* Editor */}
        <div className={`flex-1 overflow-hidden ${zenMode ? "pt-16" : ""}`}>
          <RichTextEditor
            content={isStreaming ? streamingText : draftText}
            onChange={handleEditorChange}
            placeholder={isStreaming ? "AI 正在生成..." : "开始写作... 也可以点击「AI 生成草稿」让AI先写一版"}
          />
        </div>

        {/* Bottom panels — hidden in Zen Mode */}
        {!zenMode && compileExpanded && (
          <div className="border-t border-gray-200 bg-gray-50 max-h-64 overflow-auto shrink-0">
            <div className="flex items-center justify-between px-6 py-2 sticky top-0 bg-gray-50">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Eye size={14} />
                编译结果
                {compileResult && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      compileResult.status === "pass"
                        ? "bg-green-100 text-green-700"
                        : compileResult.status === "warning"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {compileResult.status === "pass"
                      ? "通过"
                      : compileResult.status === "warning"
                        ? "警告"
                        : "失败"}{" "}
                    [{compileResult.score}分]
                  </span>
                )}
              </span>
              <button
                onClick={() => setCompileExpanded(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {compileResult ? (
              <div className="px-6 pb-3 space-y-2">
                {/* Issues */}
                {compileResult.issues.length > 0 && (
                  <div className="space-y-1">
                    {compileResult.issues.map((issue, i) => (
                      <div
                        key={i}
                        className={`text-xs p-2 rounded ${
                          issue.severity === "error"
                            ? "bg-red-50 text-red-800"
                            : issue.severity === "warning"
                              ? "bg-yellow-50 text-yellow-800"
                              : "bg-blue-50 text-blue-800"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <span className="font-medium">[{issue.checker}]</span> {issue.message}
                            {issue.detail && <p className="mt-0.5 opacity-75">{issue.detail}</p>}
                          </div>
                          {issue.paragraph_index != null && (
                            <button
                              onClick={() => handleParagraphRewrite(issue.paragraph_index!, issue.message)}
                              disabled={rewritingParagraph === issue.paragraph_index}
                              className="shrink-0 flex items-center gap-1 px-2 py-0.5 text-xs rounded bg-white/80 hover:bg-white border border-current/20 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="AI修复此段落"
                            >
                              {rewritingParagraph === issue.paragraph_index ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wand2 className="w-3 h-3" />
                              )}
                              修复
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Rewrite result feedback */}
                {rewriteResult && (
                  <div className="text-xs p-2 rounded bg-green-50 text-green-800">
                    <span className="font-medium">段落修复完成</span> 第{rewriteResult.paragraph_index + 1}段
                    {rewriteResult.compile_score != null && (
                      <span className="ml-2">编译评分: {rewriteResult.compile_score}</span>
                    )}
                    <button
                      onClick={() => setRewriteResult(null)}
                      className="ml-2 text-green-600 hover:text-green-800"
                    >×</button>
                  </div>
                )}
                {/* Stats */}
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  <span>字数: {compileResult.stats.word_count}</span>
                  <span>段落: {compileResult.stats.paragraph_count}</span>
                  <span>对话: {compileResult.stats.dialogue_markers}</span>
                  <span>
                    硬规则: {compileResult.stats.hard_rules_violated}/
                    {compileResult.stats.hard_rules_checked}
                  </span>
                  <span>超期伏笔: {compileResult.stats.foreshadow_items_overdue}</span>
                </div>
                {/* Suggestions */}
                {compileResult.suggestions.length > 0 && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">建议: </span>
                    {compileResult.suggestions.map((s, i) => (
                      <span key={i} className="inline-block mr-2 px-1.5 py-0.5 bg-gray-100 rounded">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : compiling ? (
              <div className="px-6 pb-3 text-sm text-gray-400">正在编译检查...</div>
            ) : (
              <div className="px-6 pb-3 text-sm text-gray-400">编译失败，请重试</div>
            )}
          </div>
        )}

        {/* Pipeline result panel (collapsible) — hidden in Zen Mode */}
        {!zenMode && pipelineExpanded && pipelineResult && (
          <div className="border-t border-gray-200 bg-gray-50 max-h-96 overflow-auto shrink-0">
            <div className="flex items-center justify-between px-6 py-2 sticky top-0 bg-gray-50 z-10">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Wand2 size={14} />
                全链路生产
                <span
                  className={`text-xs px-1.5 py-0.5 rounded ${
                    pipelineResult.chapter_status === "approved"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {pipelineResult.chapter_status === "approved" ? "通过" : "需修改"}
                </span>
                {pipelineResult.review_score != null && (
                  <span className="text-xs text-gray-500">
                    评审 {pipelineResult.review_score}分
                  </span>
                )}
                {pipelineResult.compiler_score != null && (
                  <span className="text-xs text-gray-500">
                    编译 {pipelineResult.compiler_score}分
                  </span>
                )}
                {pipelineResult.conflict_matrix && pipelineResult.conflict_matrix.conflicts.length > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                    {pipelineResult.conflict_matrix.conflicts.length}项冲突
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {(pipelineResult.total_duration_ms / 1000).toFixed(1)}s
                </span>
              </span>
              <button
                onClick={() => setPipelineExpanded(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {/* Expert score bar — when conflict_matrix exists */}
            {pipelineResult.conflict_matrix && pipelineResult.conflict_matrix.expert_scores.length > 0 && (
              <div className="px-6 pb-2">
                <div className="flex items-center gap-1 text-xs">
                  {pipelineResult.conflict_matrix.expert_scores.map(([name, score], i) => {
                    const shortName: Record<string, string> = {
                      plot_expert: "情节", character_expert: "角色", pacing_expert: "节奏",
                      worldbuilding_expert: "世界观", prose_expert: "文笔", commercial_expert: "商业",
                      reader_panel: "读者", voice_audit: "AI审计",
                    };
                    return (
                      <div key={i} className="flex flex-col items-center" title={`${name}: ${score}分`}>
                        <div
                          className={`w-7 rounded-sm ${score >= 8 ? "bg-green-400" : score >= 6 ? "bg-yellow-400" : "bg-red-400"}`}
                          style={{ height: `${Math.max(score * 3, 6)}px` }}
                        />
                        <span className="text-gray-500 mt-0.5" style={{ fontSize: 9 }}>{shortName[name] || name}</span>
                        <span className="text-gray-400" style={{ fontSize: 9 }}>{score}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conflict arbitration — when conflicts exist */}
            {pipelineResult.conflict_matrix && pipelineResult.conflict_matrix.conflicts.length > 0 && (
              <div className="px-6 pb-2">
                <div className="text-xs font-medium text-orange-700 mb-1 flex items-center gap-1">
                  <AlertCircle size={12} />
                  专家冲突仲裁
                </div>
                <div className="space-y-1.5">
                  {pipelineResult.conflict_matrix.conflicts.map((conflict, ci) => (
                    <div key={ci} className="bg-white border border-gray-200 rounded p-2 text-xs">
                      <div className="flex items-center gap-1 mb-1">
                        <span className={`px-1 rounded text-white ${
                          conflict.severity === "high" ? "bg-red-500" : conflict.severity === "medium" ? "bg-orange-400" : "bg-yellow-400"
                        }`}>
                          {conflict.severity === "high" ? "高" : conflict.severity === "medium" ? "中" : "低"}
                        </span>
                        <span className="font-medium text-gray-700">{conflict.topic}</span>
                      </div>
                      <div className="flex items-start gap-2 mb-1.5">
                        <div className="flex-1 bg-blue-50 rounded px-1.5 py-1">
                          <span className="text-blue-600 font-medium">{conflict.expert_a}:</span>{" "}
                          <span className="text-gray-600">{conflict.position_a}</span>
                        </div>
                        <span className="text-gray-400 self-center">vs</span>
                        <div className="flex-1 bg-purple-50 rounded px-1.5 py-1">
                          <span className="text-purple-600 font-medium">{conflict.expert_b}:</span>{" "}
                          <span className="text-gray-600">{conflict.position_b}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setConflictResolutions(prev => ({ ...prev, [ci]: "favor_a" }))}
                          className={`px-2 py-0.5 rounded text-xs ${
                            conflictResolutions[ci] === "favor_a"
                              ? "bg-blue-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          采纳{conflict.expert_a}
                        </button>
                        <button
                          onClick={() => setConflictResolutions(prev => ({ ...prev, [ci]: "favor_b" }))}
                          className={`px-2 py-0.5 rounded text-xs ${
                            conflictResolutions[ci] === "favor_b"
                              ? "bg-purple-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          采纳{conflict.expert_b}
                        </button>
                        <button
                          onClick={() => setConflictResolutions(prev => ({ ...prev, [ci]: "ignore" }))}
                          className={`px-2 py-0.5 rounded text-xs ${
                            conflictResolutions[ci] === "ignore"
                              ? "bg-gray-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}
                        >
                          忽略
                        </button>
                        {!conflictResolutions[ci] && (
                          <span className="text-gray-400 ml-1">待裁决</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="px-6 pb-3 space-y-1">
              {pipelineResult.steps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 py-1 text-xs ${
                    step.status === "failed"
                      ? "text-red-600"
                      : step.status === "completed"
                        ? "text-gray-700"
                        : step.status === "skipped"
                          ? "text-gray-300"
                          : "text-gray-400"
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      step.status === "completed"
                        ? "bg-green-100 text-green-600"
                        : step.status === "failed"
                          ? "bg-red-100 text-red-600"
                          : step.status === "skipped"
                            ? "bg-gray-100 text-gray-400"
                            : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {step.status === "completed" ? (
                      <CheckCircle size={10} />
                    ) : step.status === "failed" ? (
                      <AlertTriangle size={10} />
                    ) : step.status === "running" ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="w-20 shrink-0">{step.name}</span>
                  <span className="text-gray-400">
                    {step.duration_ms > 0 ? `${step.duration_ms}ms` : ""}
                  </span>
                  {step.status === "completed" && step.output && (
                    <span className="text-gray-400 truncate flex-1">
                      {step.output.slice(0, 80)}...
                    </span>
                  )}
                  {step.status === "failed" && step.output && (
                    <span className="text-red-400 truncate flex-1">{step.output.slice(0, 80)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Version history panel (collapsible) — hidden in Zen Mode */}
        {!zenMode && historyExpanded && (
          <div className="border-t border-gray-200 bg-gray-50 shrink-0">
            <div className="flex items-center justify-between px-6 py-2">
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <History size={14} />
                版本历史
                {diffTarget && (
                  <span className="text-xs text-indigo-600">— 对比 v{diffTarget.version_no}</span>
                )}
              </span>
              <div className="flex items-center gap-2">
                {diffTarget && (
                  <button
                    onClick={() => setDiffTarget(null)}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    退出对比
                  </button>
                )}
                <button
                  onClick={() => setHistoryExpanded(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>

            {diffTarget ? (
              /* Diff view */
              <div className="max-h-64 overflow-auto border-t border-gray-200">
                <DiffViewer
                  oldText={diffTarget.content}
                  newText={draftText}
                  oldLabel={`v${diffTarget.version_no} (${new Date(diffTarget.created_at).toLocaleString()})`}
                  newLabel="当前草稿"
                />
              </div>
            ) : (
              <div className="px-6 pb-3 max-h-56 overflow-auto">
                {versions.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无历史版本</p>
                ) : (
                  <div className="space-y-1">
                    {versions.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-100 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">v{v.version_no}</span>
                          <span className="text-gray-400 text-xs">{v.content_type}</span>
                          <span className="text-gray-400 text-xs">
                            {new Date(v.created_at).toLocaleString()}
                          </span>
                          <span className="text-gray-400 text-xs">{v.content.length}字</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDiffTarget(v)}
                            className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-200 rounded"
                            title="对比当前版本"
                          >
                            <Eye size={10} />
                            对比
                          </button>
                          <button
                            onClick={() => handleRollback(v.version_no)}
                            className="flex items-center gap-1 px-2 py-0.5 text-xs text-indigo-600 hover:bg-indigo-50 rounded"
                          >
                            <RotateCcw size={10} />
                            恢复
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {/* Recall Context panel (collapsible) — hidden in Zen Mode */}
        {!zenMode && recallExpanded && (
          <div className="border-t border-gray-200 bg-teal-50 shrink-0">
            <div className="flex items-center justify-between px-6 py-2 sticky top-0 bg-teal-50">
              <span className="flex items-center gap-2 text-sm font-medium text-teal-800">
                <Brain size={14} />
                召回上下文
                {recalledContext && (
                  <span className="text-xs text-teal-600">
                    ({recalledContext.total_tokens_estimate} tokens)
                  </span>
                )}
              </span>
              <button
                onClick={() => setRecallExpanded(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ChevronDown size={14} />
              </button>
            </div>
            {recalling ? (
              <div className="px-6 pb-3 text-sm text-gray-400">正在召回上下文...</div>
            ) : recalledContext ? (
              <div className="px-6 pb-3 space-y-3 max-h-80 overflow-auto">
                {/* 硬规则 */}
                <div>
                  <h4 className="text-xs font-medium text-red-700 mb-1 flex items-center gap-1">
                    <Shield size={12} /> 硬规则 ({recalledContext.hard_rules.length})
                  </h4>
                  {recalledContext.hard_rules.length > 0 ? (
                    <ul className="space-y-1">
                      {recalledContext.hard_rules.map((rule, i) => (
                        <li
                          key={i}
                          className="text-xs text-gray-700 bg-white px-2 py-1 rounded border border-red-100"
                        >
                          {rule}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">无硬规则</p>
                  )}
                </div>

                {/* 角色状态 */}
                <div>
                  <h4 className="text-xs font-medium text-blue-700 mb-1 flex items-center gap-1">
                    <Clock size={12} /> 角色状态 ({recalledContext.character_states.length})
                  </h4>
                  {recalledContext.character_states.length > 0 ? (
                    <ul className="space-y-1">
                      {recalledContext.character_states.map((state, i) => (
                        <li
                          key={i}
                          className="text-xs text-gray-700 bg-white px-2 py-1 rounded border border-blue-100"
                        >
                          {state}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">无角色状态</p>
                  )}
                </div>

                {/* 开放伏笔 */}
                <div>
                  <h4 className="text-xs font-medium text-purple-700 mb-1 flex items-center gap-1">
                    <Eye size={12} /> 开放伏笔 ({recalledContext.open_foreshadows.length})
                  </h4>
                  {recalledContext.open_foreshadows.length > 0 ? (
                    <ul className="space-y-1">
                      {recalledContext.open_foreshadows.map((fs, i) => (
                        <li
                          key={i}
                          className="text-xs text-gray-700 bg-white px-2 py-1 rounded border border-purple-100"
                        >
                          {fs}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray-400">无开放伏笔</p>
                  )}
                </div>

                {/* Token估算 */}
                <div>
                  <h4 className="text-xs font-medium text-gray-700 mb-1">Token估算</h4>
                  <div className="text-xs text-gray-600 bg-white px-2 py-1 rounded border border-gray-200">
                    预估上下文 Token:{" "}
                    <span className="font-medium text-teal-700">
                      {recalledContext.total_tokens_estimate.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-6 pb-3 text-sm text-gray-400">召回失败，请重试</div>
            )}
          </div>
        )}
      </div>

      {/* Right sidebar: Canon + Characters — hidden in Zen Mode */}
      {!zenMode && (
      <div className="w-72 border-l border-gray-200 bg-white overflow-auto shrink-0">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-medium text-gray-900 text-sm flex items-center gap-2">
            <Shield size={14} />
            适用正典
          </h3>
        </div>
        <div className="divide-y divide-gray-50">
          {rules
            .filter((r) => r.status === "active")
            .map((rule) => (
              <div key={rule.id} className="px-4 py-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">{rule.is_hard ? "🔒" : "📖"}</span>
                  <span className="text-sm text-gray-900 font-medium">{rule.rule_name}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{rule.content}</p>
              </div>
            ))}
        </div>

        <div className="p-4 border-t border-gray-100">
          <h3 className="font-medium text-gray-900 text-sm flex items-center gap-2">
            <Clock size={14} />
            涉及角色
          </h3>
          <div className="mt-2 space-y-1">
            {characters
              .filter((c) => c.status === "active")
              .map((char) => (
                <div
                  key={char.id}
                  className="text-sm text-gray-700 px-2 py-1 hover:bg-gray-50 rounded"
                >
                  {char.name}
                  <span className="text-xs text-gray-400 ml-1">({char.role_type})</span>
                </div>
              ))}
          </div>
        </div>
      </div>
      )}

      {/* Crash Recovery Dialog */}
      {crashRecoveries.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                <AlertCircle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">检测到未保存的草稿</h3>
                <p className="text-sm text-gray-500">上次退出时可能有未保存的内容</p>
              </div>
            </div>
            <div className="space-y-2 mb-5">
              {crashRecoveries.map((r) => (
                <div key={r.chapter_number} className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-800">第{r.chapter_number}章</span>
                    <span className="text-xs text-gray-500 ml-2">{r.draft_length} 字</span>
                  </div>
                  <span className="text-xs text-gray-400">{new Date(r.saved_at).toLocaleString()}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  for (const r of crashRecoveries) {
                    await crashRecoveryApi.restore(r.chapter_number);
                  }
                  setCrashRecoveries([]);
                  // Reload current chapter
                  selectChapter(num);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <RotateCw size={14} /> 恢复草稿
              </button>
              <button
                onClick={async () => {
                  for (const r of crashRecoveries) {
                    await crashRecoveryApi.discard(r.chapter_number);
                  }
                  setCrashRecoveries([]);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                丢弃
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
