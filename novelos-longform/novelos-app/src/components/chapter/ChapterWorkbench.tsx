import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useChapterStore,
  useCanonStore,
  useAgentStore,
  useLlmStore,
  useProjectStore,
  useUiStore,
} from "../../stores";
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
  BookOpen,
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
  List,
} from "lucide-react";
import {
  compilerApi,
  chapterApi,
  outlineApi,
  orchestratorApi,
  ledgerApi,
  crashRecoveryApi,
  type CompileResult,
  type PipelineResult,
  type ChapterQualityReport,
  type QuickReviewReport,
  type ChapterOutlineInfo,
  type RecalledContext,
  type CrashRecoveryInfo,
  type ParagraphRewriteResult,
  type NotificationInfo,
} from "../../lib/api";
import type { ChapterVersionInfo } from "../../lib/api";
import { DiffViewer } from "../common/DiffViewer";
import { ContextHelp } from "../common/ContextHelp";
import { useWritingStats } from "../../hooks/useWritingStats";
import { platform } from "../../lib/platform";

const MAX_REPAIR_ROUNDS = 3;

type RepairResolutionReport = {
  round: number;
  maxRounds: number;
  resolved: string[];
  persisted: string[];
  added: string[];
  previousCount: number;
  currentCount: number;
  isConverging: boolean;
  newIssueCount: number;
  blockerCount: number;
  status: "pending_review" | "converging" | "resolved" | "not_converged";
};

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

/// Extract a block between === TAG === delimiters from LLM structured output.
function extractDraftBlock(raw: string, tag: string): string {
  const re = new RegExp(`===\\s*${tag}\\s*===([\\s\\S]*?)(?=\\n===\\s*[A-Z_]+\\s*===|$)`);
  const m = raw.match(re);
  return (m?.[1] ?? "").trim();
}

/// Parse chapter title and content from LLM structured output.
/// Returns structured output if found, otherwise falls back to raw text as content.
function parseChapterDraft(raw: string): { title: string; content: string } {
  const title = extractDraftBlock(raw, "CHAPTER_TITLE");
  const content = extractDraftBlock(raw, "CHAPTER_CONTENT");
  if (content) return { title, content };
  // Fallback: no structured tags found, treat whole raw as content
  return { title: "", content: raw.trim() };
}

const expertNameLabels: Record<string, string> = {
  plot_expert: "情节",
  character_expert: "角色",
  pacing_expert: "节奏",
  worldbuilding_expert: "世界观",
  prose_expert: "文笔",
  commercial_expert: "商业",
  reader_panel: "读者",
  voice_audit: "AI审计",
};

const compileStatusLabels: Record<string, string> = {
  pass: "通过",
  fail: "未通过",
  warning: "有警告",
};

const reviewStatusLabels: Record<string, string> = {
  approved: "通过",
  rewrite_required: "需重写",
  needs_revision: "需修改",
  rejected: "未通过",
  pending: "待评审",
  compile_failed: "编译未通过",
};

function formatMs(durationMs: number): string {
  if (!durationMs) return "";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatStepStatus(status: string): string {
  if (status === "running") return "执行中";
  if (status === "completed" || status === "completed_with_errors") return "已完成";
  if (status === "failed") return "失败";
  if (status === "skipped") return "已跳过";
  return "等待";
}

function extractJsonObject(raw: string): any | null {
  const cleaned = raw
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
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

function parseReviewScore(output: string | null): number | null {
  if (!output) return null;
  const parsed = extractJsonObject(output);
  const score = Number(parsed?.score);
  if (Number.isFinite(score)) return score;
  const aiScore = Number(parsed?.ai_score);
  if (Number.isFinite(aiScore)) return (100 - aiScore) / 10;
  const looseScore = output.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/)?.[1];
  if (looseScore) return Number(looseScore);
  const looseAiScore = output.match(/"ai_score"\s*:\s*(\d+(?:\.\d+)?)/)?.[1];
  if (looseAiScore) return (100 - Number(looseAiScore)) / 10;
  return null;
}

export function ChapterWorkbench() {
  const { chapterNumber, projectId } = useParams();
  const navigate = useNavigate();
  const num = parseInt(chapterNumber || "1", 10);
  const {
    chapters,
    currentChapter,
    characters,
    tasks,
    fetchChapters,
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
    const runId = crypto.randomUUID();
    setPipelineRunning(true);
    setPipelineRunId(runId);
    setPipelineNotifications([]);
    setPipelineResult(null);
    try {
      const result = await orchestratorApi.runPipeline(num, runId);
      setPipelineResult(result);
      // If draft was generated, set it in editor immediately
      const allSteps = result.steps.map((s) => `${s.name}:${s.status}`);
      console.log("[Pipeline] all steps:", allSteps);
      const draftStep = result.steps.find((s) => s.name === "AI撰写草稿");
      console.log(
        "[Pipeline] draftStep found:",
        !!draftStep,
        "status:",
        draftStep?.status,
        "output len:",
        draftStep?.output?.length,
      );
      if (draftStep?.status === "completed" && draftStep.output) {
        // Parse structured LLM output (=== CHAPTER_TITLE === / === CHAPTER_CONTENT ===)
        const parsed = parseChapterDraft(draftStep.output);
        const finalTitle = parsed.title || "";
        const finalContent = parsed.content;
        console.log("[Pipeline] parsed title:", finalTitle, "content len:", finalContent.length);

        // Save title to DB separately
        if (finalTitle) {
          chapterApi
            .saveTitle(num, finalTitle)
            .catch((e) => console.warn("[Pipeline] save title failed:", e));
        }

        // Format as "# Title\n\nBody" for editor display (backward-compatible)
        const displayText = finalTitle ? `# ${finalTitle}\n\n${finalContent}` : finalContent;
        setDraftText(displayText);
        console.log("[Pipeline] setDraftText done, display text len:", displayText.length);

        // Save to DB — store formatted text (with # title) for editor round-trip
        updateDraft(num, displayText).catch((e) =>
          console.warn("[Pipeline] save draft failed:", e),
        );
        handleQualityGate(displayText).catch((e) =>
          console.warn("[Pipeline] quality gate failed:", e),
        );
      } else {
        console.warn("[Pipeline] draftStep not ready:", draftStep);
      }
      await fetchLatestOutline();
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
  const [outlineExpanded, setOutlineExpanded] = useState(true);
  const [chapterOutline, setChapterOutline] = useState<ChapterOutlineInfo | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [compileExpanded, setCompileExpanded] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [qualityReport, setQualityReport] = useState<ChapterQualityReport | null>(null);
  const [qualityRunning, setQualityRunning] = useState(false);
  const [quickReview, setQuickReview] = useState<QuickReviewReport | null>(null);
  const [quickReviewHistory, setQuickReviewHistory] = useState<QuickReviewReport[]>([]);
  const [quickReviewRunning, setQuickReviewRunning] = useState(false);
  const [quickReviewStale, setQuickReviewStale] = useState(false);
  const [repairingChapter, setRepairingChapter] = useState(false);
  const [lastRepairReasons, setLastRepairReasons] = useState<string[]>([]);
  const [repairIssueFingerprints, setRepairIssueFingerprints] = useState<string[]>([]);
  const [repairRound, setRepairRound] = useState(0);
  const [repairBaselineFingerprints, setRepairBaselineFingerprints] = useState<string[]>([]);
  const [resolvedIssueFingerprints, setResolvedIssueFingerprints] = useState<string[]>([]);
  const [introducedIssueFingerprints, setIntroducedIssueFingerprints] = useState<string[]>([]);
  const [previousNewIssueCount, setPreviousNewIssueCount] = useState<number | null>(null);
  const [resolutionReport, setResolutionReport] = useState<RepairResolutionReport | null>(null);
  const [stalledIssueRounds, setStalledIssueRounds] = useState<Record<string, number>>({});
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeMessage, setFinalizeMessage] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null);
  const [pipelineNotifications, setPipelineNotifications] = useState<NotificationInfo[]>([]);
  // Real-time pipeline step tracking via Tauri events (faster than notification polling)
  const [pipelineLiveSteps, setPipelineLiveSteps] = useState<
    Record<number, { name: string; status: string; duration_ms: number }>
  >({});
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

  const invalidateQuickReview = useCallback(() => {
    setQuickReview(null);
    setQuickReviewStale(true);
    setRepairRound(0);
    setRepairIssueFingerprints([]);
    setRepairBaselineFingerprints([]);
    setResolvedIssueFingerprints([]);
    setIntroducedIssueFingerprints([]);
    setPreviousNewIssueCount(null);
    setResolutionReport(null);
    setStalledIssueRounds({});
  }, []);

  const fetchLatestOutline = useCallback(async () => {
    setOutlineLoading(true);
    try {
      const outline = await outlineApi.getLatestChapterOutline(num);
      setChapterOutline(outline);
    } catch {
      setChapterOutline(null);
    } finally {
      setOutlineLoading(false);
    }
  }, [num]);

  useEffect(() => {
    fetchChapters();
    selectChapter(num);
    fetchCharacters();
    fetchCanon();
    fetchTasks();
    fetchLatestOutline();
  }, [
    num,
    fetchChapters,
    selectChapter,
    fetchCharacters,
    fetchCanon,
    fetchTasks,
    fetchLatestOutline,
  ]);

  useEffect(() => {
    let cancelled = false;

    setPipelineResult(null);
    setPipelineRunId(null);
    setPipelineNotifications([]);
    setPipelineLiveSteps({});
    setQualityReport(null);
    setQuickReview(null);
    setQuickReviewStale(false);
    setQuickReviewHistory([]);

    Promise.all([
      orchestratorApi.getLatestPipelineResult(num).catch((e) => {
        console.warn("[Pipeline] restore latest result failed:", e);
        return null;
      }),
      compilerApi.getLatestQualityReport(num).catch((e) => {
        console.warn("[Quality] restore latest report failed:", e);
        return null;
      }),
      compilerApi.listReviewHistory(num, 6).catch((e) => {
        console.warn("[Review] restore history failed:", e);
        return [];
      }),
    ]).then(([result, latestQuality, reviewItems]) => {
      if (cancelled) return;
      if (result) {
        if (cancelled || !result) return;
        setPipelineResult(result);
        setPipelineRunId(result.run_id);
      }
      if (latestQuality) setQualityReport(latestQuality);
      setQuickReviewHistory(reviewItems);
      if (reviewItems.length > 0) {
        setQuickReview(reviewItems[0]);
        setQuickReviewStale(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [num]);

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
    (text: string) => {
      setDraftText(text);
      invalidateQuickReview();
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
    [num, autoSaveTimer, updateDraft, lastSavedText, invalidateQuickReview],
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
    crashRecoveryApi
      .check()
      .then(setCrashRecoveries)
      .catch(() => {});
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
    if (!currentChapter || finalizing || !draftText.trim()) return;
    setFinalizing(true);
    setFinalizeMessage(null);
    setFinalizeError(null);
    try {
      await finalize(num);
      await selectChapter(num);
      await fetchChapters();
      await fetchValidTransitions(num);
      setFinalizeMessage("定稿成功，章节状态已更新。");
    } catch (e: any) {
      setFinalizeError(e instanceof Error ? e.message : String(e));
    } finally {
      setFinalizing(false);
    }
  };

  const handleTransition = async (newStatus: string) => {
    setTransitioning(true);
    setTransitionError(null);
    try {
      await transitionState(num, newStatus);
      await fetchValidTransitions(num);
    } catch (e: any) {
      setTransitionError(e instanceof Error ? e.message : String(e));
    } finally {
      setTransitioning(false);
    }
  };

  const handleSubmitReview = async () => {
    setTransitioning(true);
    setTransitionError(null);
    try {
      if (currentChapter?.status === "drafting") {
        await transitionState(num, "draft_generated");
      }
      await transitionState(num, "reviewing");
      await fetchValidTransitions(num);
    } catch (e: any) {
      setTransitionError(e instanceof Error ? e.message : String(e));
      console.error("Submit review failed:", e);
    } finally {
      setTransitioning(false);
    }
  };

  const handleCompileAndReport = async () => {
    const result = await handleCompile();
    // After compile, set compile status based on result
    if (result) {
      const compilerStatus = result.status === "fail" ? "fail" : "pass";
      await setCompileStatus(num, compilerStatus);
      await handleQualityGate();
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
    const outlineText = chapterOutline?.content_json || "暂无章节大纲";

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
          content: `请根据以下任务卡和章节大纲撰写第${num}章草稿:\n\n任务卡：\n${taskCard}\n\n章节大纲：\n${outlineText}\n\n前文摘要:（前文摘要待实现）`,
        },
      ]);

      if (result) {
        setDraftText(result);
        invalidateQuickReview();
        await updateDraft(num, result);
        await handleQualityGate(result);
      }
    } catch {
      // Fallback to agent-based generation if streaming fails
      const result = await runAgent("draft_writer", {
        min_words: "2000",
        max_words: "4000",
        soul_refs: soulText || "暂无",
        task_card: taskCard,
        chapter_outline: outlineText,
        canon_rules: canonText || "暂无",
        prev_summary: "（前文摘要待实现）",
      });

      if (result) {
        setDraftText(result.content);
        invalidateQuickReview();
        await updateDraft(num, result.content);
        await handleQualityGate(result.content);
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
      invalidateQuickReview();
      await updateDraft(num, result.content);
      await handleQualityGate(result.content);
    }
    setFiltering(false);
  };

  // Real compiler check via backend
  const handleCompile = async (): Promise<CompileResult | null> => {
    if (!draftText.trim()) return null;
    setCompileExpanded(true);
    setCompiling(true);
    setCompileError(null);
    try {
      const result = await compilerApi.compile(num, draftText);
      setCompileResult(result);
      return result;
    } catch (e: any) {
      const message = e instanceof Error ? e.message : String(e);
      setCompileResult(null);
      setCompileError(message || "未知错误");
      return null;
    } finally {
      setCompiling(false);
    }
  };

  const handleQualityGate = async (textOverride?: string) => {
    const text = textOverride ?? draftText;
    if (!text.trim()) return null;
    setQualityRunning(true);
    try {
      const report = await compilerApi.computeQualityReport(num, text);
      setQualityReport(report);
      return report;
    } catch (e) {
      console.error("Quality report failed:", e);
      return null;
    } finally {
      setQualityRunning(false);
    }
  };

  const handleQuickReview = async () => {
    if (!draftText.trim()) return;
    setQuickReviewRunning(true);
    setQuickReview(null);
    setQuickReviewStale(false);
    try {
      const report = await compilerApi.runQuickReview(num, draftText, true);
      setQuickReview(report);
      const history = await compilerApi.listReviewHistory(num, 6);
      setQuickReviewHistory(history);
      const nextFingerprints = getQuickReviewIssueFingerprints(report);
      if (repairIssueFingerprints.length > 0) {
        const oldSet = new Set(repairIssueFingerprints);
        const nextSet = new Set(nextFingerprints);
        const resolved = repairIssueFingerprints.filter((item) => !nextSet.has(item));
        const persisted = nextFingerprints.filter((item) => oldSet.has(item));
        const added = nextFingerprints.filter((item) => !oldSet.has(item));
        const nextRounds = { ...stalledIssueRounds };
        for (const item of persisted) {
          nextRounds[item] = (nextRounds[item] ?? 0) + 1;
        }
        for (const item of resolved) {
          delete nextRounds[item];
        }
        const nextResolvedTotal = Array.from(
          new Set([...resolvedIssueFingerprints, ...resolved]),
        );
        const nextIntroducedTotal = Array.from(
          new Set([...introducedIssueFingerprints, ...added]),
        );
        const baselineCount = repairIssueFingerprints.length;
        const currentCount = nextFingerprints.length;
        const blockerCount = getQuickReviewBlockerCount(report);
        const isResolved = report.overall === "PASS" || (blockerCount === 0 && added.length === 0);
        const newIssueCountDidNotDrop =
          previousNewIssueCount != null && added.length > 0 && added.length >= previousNewIssueCount;
        const isConverging =
          isResolved ||
          currentCount < baselineCount ||
          (previousNewIssueCount != null && added.length < previousNewIssueCount);
        const status: RepairResolutionReport["status"] = isResolved
          ? "resolved"
          : repairRound >= MAX_REPAIR_ROUNDS || newIssueCountDidNotDrop
            ? "not_converged"
            : "converging";
        setStalledIssueRounds(nextRounds);
        setResolvedIssueFingerprints(nextResolvedTotal);
        setIntroducedIssueFingerprints(nextIntroducedTotal);
        setPreviousNewIssueCount(added.length);
        setResolutionReport({
          round: repairRound,
          maxRounds: MAX_REPAIR_ROUNDS,
          resolved,
          persisted,
          added,
          previousCount: baselineCount,
          currentCount,
          isConverging,
          newIssueCount: added.length,
          blockerCount,
          status,
        });
        setRepairIssueFingerprints(nextFingerprints);
      }
    } catch (e) {
      console.error("Quick review failed:", e);
    } finally {
      setQuickReviewRunning(false);
    }
  };

  const collectRepairReasons = () => {
    const qualityReasons = qualityReport?.actions.map((action) => action.reason) ?? [];
    const reviewReasons =
      quickReview?.experts.flatMap((expert) =>
        expert.suggestions.map((item) => `${expert.expert_name}: ${item}`),
      ) ?? [];
    const compileReasons =
      compileResult?.issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => (issue.detail ? `${issue.message}: ${issue.detail}` : issue.message)) ?? [];
    const persistedReasons =
      resolutionReport?.persisted.map((item) => `仍存在的问题：${formatIssueFingerprint(item)}`) ??
      [];
    const addedReasons =
      resolutionReport?.added.map((item) => `修复后新增的问题：${formatIssueFingerprint(item)}`) ??
      [];
    const regressionGuards =
      resolvedIssueFingerprints.length > 0
        ? [
            `不得回退已解决的问题：${resolvedIssueFingerprints
              .slice(0, 5)
              .map(formatIssueFingerprint)
              .join("；")}`,
          ]
        : [];
    const containmentRules = [
      "本轮只能做最小必要修改，优先局部修句和补足动机，不要整章重写。",
      "不得新增未请求的新人物、新设定、新冲突、新伏笔或章节结构变化。",
      "保持原有剧情事件顺序、人物动机、视角和伏笔状态，不要为修复一个问题制造新的逻辑、人设或节奏问题。",
    ];
    const reasons = [
      ...persistedReasons,
      ...addedReasons,
      ...qualityReasons,
      ...reviewReasons,
      ...compileReasons,
      ...regressionGuards,
      ...containmentRules,
    ]
      .map((item) => item.trim())
      .filter(Boolean);
    return Array.from(new Set(reasons)).slice(0, 12);
  };

  const getQuickReviewIssueFingerprints = (report: QuickReviewReport | null) => {
    if (!report) return [];
    const items = report.experts.flatMap((expert) => {
      const suggestions = expert.suggestions.length
        ? expert.suggestions
        : expert.passed
          ? []
          : [`${expert.expert_name}未通过`];
      return suggestions.map((suggestion) => `${expert.agent_name}:${suggestion.trim()}`);
    });
    return Array.from(new Set(items.filter(Boolean)));
  };

  const getQuickReviewBlockerCount = (report: QuickReviewReport | null) => {
    if (!report) return 0;
    return report.experts.reduce((count, expert) => count + (expert.passed ? 0 : 1), 0);
  };

  const formatIssueFingerprint = (item: string) => item.split(":").slice(1).join(":") || item;

  const handleRepairAndRecheck = async () => {
    if (!draftText.trim()) return;
    const reasons = collectRepairReasons();
    if (reasons.length === 0 || resolutionReport?.status === "not_converged") return;
    const currentFingerprints = getQuickReviewIssueFingerprints(quickReview);
    const nextRound = Math.min(repairRound + 1, MAX_REPAIR_ROUNDS);
    setRepairingChapter(true);
    try {
      if (currentFingerprints.length > 0) {
        setRepairIssueFingerprints(currentFingerprints);
        if (repairBaselineFingerprints.length === 0) {
          setRepairBaselineFingerprints(currentFingerprints);
        }
      }
      setRepairRound(nextRound);
      setLastRepairReasons(reasons);
      setResolutionReport({
        round: nextRound,
        maxRounds: MAX_REPAIR_ROUNDS,
        resolved: [],
        persisted: currentFingerprints,
        added: [],
        previousCount: currentFingerprints.length,
        currentCount: currentFingerprints.length,
        isConverging: false,
        newIssueCount: 0,
        blockerCount: getQuickReviewBlockerCount(quickReview),
        status: "pending_review",
      });
      const result = await compilerApi.repairWithQualityActions(num, draftText, reasons, "repair");
      setDraftText(result.revised_text);
      setQuickReview(null);
      setQuickReviewStale(true);
      setLastRepairReasons(result.repair_reasons?.length ? result.repair_reasons : reasons);
      setLastSavedText(result.revised_text);
      setIsDirty(false);
      setCompileResult(result.compile_result);
      setQualityReport(result.quality_report);
      await fetchValidTransitions(num);
    } catch (e) {
      console.error("Repair and recheck failed:", e);
    } finally {
      setRepairingChapter(false);
    }
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
        invalidateQuickReview();
        setLastSavedText(updated.draft_text);
        await handleQualityGate(updated.draft_text);
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

  // Listen for real-time pipeline step events from Tauri backend
  useEffect(() => {
    if (!platform.isTauri || !pipelineRunId) return;
    let unlisten: (() => void) | null = null;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{
        chapter_number: number;
        run_id: string;
        step_index: number;
        step_name: string;
        status: string;
        duration_ms: number;
      }>("pipeline-step", (event) => {
        const d = event.payload;
        if (d.run_id === pipelineRunId && d.chapter_number === num) {
          setPipelineLiveSteps((prev) => ({
            ...prev,
            [d.step_index]: { name: d.step_name, status: d.status, duration_ms: d.duration_ms },
          }));
        }
      }).then((fn) => {
        unlisten = fn;
      });
    });
    return () => {
      unlisten?.();
    };
  }, [num, pipelineRunId]);

  // DEBUG: trace draftText changes and isStreaming state
  useEffect(() => {
    console.log(
      "[Pipeline] draftText changed, len:",
      draftText.length,
      "preview:",
      draftText.substring(0, 60),
      "isStreaming:",
      isStreaming,
      "streamingText len:",
      streamingText.length,
    );
  }, [draftText, isStreaming, streamingText]);

  // Clear live steps when pipeline run starts
  useEffect(() => {
    if (pipelineRunId) {
      setPipelineLiveSteps({});
    }
  }, [pipelineRunId]);

  useEffect(() => {
    if (!pipelineRunId) return;
    let cancelled = false;

    const loadPipelineNotifications = async () => {
      try {
        const items = await ledgerApi.listNotifications(
          false,
          "chapter_pipeline_step",
          `chapter:${num}:run:${pipelineRunId}`,
        );
        if (!cancelled) {
          setPipelineNotifications(items.slice().reverse());
        }
      } catch {
        if (!cancelled) {
          setPipelineNotifications([]);
        }
      }
    };

    loadPipelineNotifications();
    const timer = window.setInterval(loadPipelineNotifications, pipelineRunning ? 1500 : 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [num, pipelineRunId, pipelineRunning]);

  const wordCount = draftText.length;
  const pipelineSteps = pipelineResult?.steps ?? [];
  const completedPipelineStepsFromResult = pipelineSteps.filter(
    (step) =>
      step.status === "completed" ||
      step.status === "completed_with_errors" ||
      step.status === "skipped" ||
      step.status === "failed",
  ).length;
  const totalPipelineSteps = pipelineSteps.length || 15;
  const completedPipelineStepsFromNotifications = new Set(
    pipelineNotifications
      .map((notif) => {
        const parts = notif.message.split(" · ");
        if (parts.length < 3) return null;
        const statusText = parts[2];
        const isTerminal =
          statusText.includes("已完成") ||
          statusText.includes("执行失败") ||
          statusText.includes("已跳过");
        return isTerminal ? parts[1] : null;
      })
      .filter((name): name is string => Boolean(name)),
  ).size;
  // Count completed steps from real-time Tauri events (fastest source)
  const completedPipelineStepsFromLive = Object.values(pipelineLiveSteps).filter(
    (s) =>
      s.status === "completed" ||
      s.status === "completed_with_errors" ||
      s.status === "failed" ||
      s.status === "skipped",
  ).length;
  // Currently running step from live events
  const currentRunningStepFromLive =
    Object.values(pipelineLiveSteps).find((s) => s.status === "running")?.name ?? null;
  // Also track the currently running step from notifications (fallback)
  const currentRunningStepFromNotifications =
    pipelineNotifications
      .find((notif) => {
        const parts = notif.message.split(" · ");
        return parts.length >= 3 && parts[2].includes("开始执行");
      })
      ?.message.split(" · ")[1] ?? null;
  const currentRunningStep = currentRunningStepFromLive ?? currentRunningStepFromNotifications;
  const completedPipelineSteps = Math.max(
    completedPipelineStepsFromResult,
    completedPipelineStepsFromNotifications,
    completedPipelineStepsFromLive,
  );
  const pipelineProgressPct =
    totalPipelineSteps > 0 ? Math.round((completedPipelineSteps / totalPipelineSteps) * 100) : 0;
  const taskForChapter = tasks.find((t) => t.chapter_number === num);
  const livePipelineStepList = Object.entries(pipelineLiveSteps)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, step]) => step);
  const visiblePipelineSteps = pipelineResult?.steps.length
    ? pipelineResult.steps
    : livePipelineStepList;
  const recentPipelineSteps = visiblePipelineSteps.slice(-5);
  const latestPipelineEvents = pipelineNotifications.slice(-4).reverse();
  const reviewMatrix = pipelineResult?.conflict_matrix ?? null;
  const fallbackExpertScores = (pipelineResult?.steps ?? [])
    .filter((step) => step.agent_name && expertNameLabels[step.agent_name])
    .map((step) => {
      const score = parseReviewScore(step.output);
      return score == null
        ? null
        : ([step.agent_name!, Math.round(score * 10) / 10] as [string, number]);
    })
    .filter((item): item is [string, number] => Boolean(item));
  const hasReviewMatrix = Boolean(
    reviewMatrix && (reviewMatrix.expert_scores.length > 0 || reviewMatrix.conflicts.length > 0),
  );
  const conflictCount = reviewMatrix?.conflicts.length ?? 0;
  const expertScores = reviewMatrix?.expert_scores.length
    ? reviewMatrix.expert_scores
    : fallbackExpertScores;
  const topExpertScores =
    expertScores
      .slice()
      .sort((a, b) => a[1] - b[1])
      .slice(0, 4) ?? [];
  const compileIssueCounts = compileResult?.issues.reduce(
    (acc, issue) => {
      if (issue.severity === "error") acc.errors += 1;
      if (issue.severity === "warning") acc.warnings += 1;
      return acc;
    },
    { errors: 0, warnings: 0 },
  ) ?? { errors: 0, warnings: 0 };
  const compileStatusLabel = compileResult
    ? (compileStatusLabels[compileResult.status] ?? compileResult.status)
    : currentChapter?.compiler_status
      ? (compileStatusLabels[currentChapter.compiler_status] ?? currentChapter.compiler_status)
      : "未检查";
  const reviewVerdictLabel = pipelineResult?.review_verdict
    ? (reviewStatusLabels[pipelineResult.review_verdict] ?? pipelineResult.review_verdict)
    : currentChapter?.review_status
      ? (reviewStatusLabels[currentChapter.review_status] ?? currentChapter.review_status)
      : "未评审";
  const qualityStatusLabel = qualityReport
    ? qualityReport.overall === "PASS"
      ? "通过"
      : qualityReport.overall === "WARN"
        ? "有提醒"
        : "未通过"
    : "未检查";
  const quickReviewStatusLabel = quickReview
    ? quickReview.overall === "PASS"
      ? "通过"
      : quickReview.overall === "WARN"
        ? "有提醒"
        : "未通过"
    : quickReviewStale
      ? "待复评"
      : "未评审";
  const quickReviewIssues =
    quickReview?.experts.reduce(
      (count, expert) => count + expert.suggestions.length + (expert.passed ? 0 : 1),
      0,
    ) ?? 0;
  const repairReasons = collectRepairReasons();
  const chapterStageHint = pipelineRunning
    ? currentRunningStep
      ? `正在执行：${currentRunningStep}`
      : "全链路正在推进"
    : pipelineResult
      ? pipelineResult.chapter_status === "approved"
        ? "全链路已通过，可以进入定稿判断"
        : "全链路已结束，建议先处理反馈"
      : isDirty
        ? "草稿有未保存修改"
        : draftText.trim()
          ? "可继续编译或发起全链路"
          : "建议先生成任务卡或草稿";
  const wordTargetStatus = wordCount < 2000 ? "偏短" : wordCount > 5000 ? "偏长" : "合适";
  const nextActions = [
    !taskForChapter && "补齐章节任务卡",
    !draftText.trim() && "生成或撰写草稿",
    draftText.trim() && !compileResult && "运行编译检查",
    draftText.trim() && !qualityReport && "运行质量闸门",
    draftText.trim() && !quickReview && "快速三专家评审",
    qualityReport?.overall === "FAIL" && "按质量问题修复",
    compileResult?.status === "fail" && "先修复编译错误",
    quickReview && quickReview.overall !== "PASS" && "处理快速评审意见",
    pipelineResult?.chapter_status !== "approved" &&
      pipelineResult &&
      topExpertScores.length > 0 &&
      "处理评审反馈",
    pipelineResult?.chapter_status === "approved" &&
      currentChapter?.status !== "finalized" &&
      "确认后定稿",
  ].filter((item): item is string => Boolean(item));
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
                style={{
                  width: `${Math.min(100, project?.target_words ? (wordCount / project.target_words) * 100 : 0)}%`,
                }}
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
              <button
                onClick={() => navigate(`/project/${projectId}/chapters`)}
                className="flex items-center gap-1 rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                title="返回章节总览"
              >
                <List size={13} />
                总览
              </button>
              <h2 className="font-semibold text-gray-900">
                第{num}章 {currentChapter?.title || ""}
              </h2>
              {chapters.length > 0 && (
                <select
                  value={num}
                  onChange={(event) =>
                    navigate(`/project/${projectId}/chapter/${event.target.value}`)
                  }
                  className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-indigo-400 focus:outline-none"
                  title="切换章节"
                >
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.chapter_number}>
                      第{chapter.chapter_number}章 {chapter.title || ""}
                    </option>
                  ))}
                </select>
              )}
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
              {isDirty && <span className="text-xs text-amber-600">未保存</span>}
              {saving && <span className="text-xs text-blue-500">保存中...</span>}
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
                    onClick={handleSubmitReview}
                    disabled={transitioning}
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
                    {rewriting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Edit3 size={14} />
                    )}
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
              {(currentChapter?.status === "approved" ||
                currentChapter?.status === "finalized") && (
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
                  disabled={finalizing || !draftText.trim()}
                  className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                  title={!draftText.trim() ? "需要先有草稿才能定稿" : "将当前草稿保存为定稿"}
                >
                  {finalizing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CheckCircle size={14} />
                  )}
                  <span className="hidden sm:inline">{finalizing ? "定稿中..." : "定稿"}</span>
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

        {!zenMode && (finalizeMessage || finalizeError || transitionError) && (
          <div
            className={`border-b px-6 py-2 text-sm ${
              finalizeError || transitionError
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-green-200 bg-green-50 text-green-700"
            }`}
          >
            {finalizeError || transitionError || finalizeMessage}
          </div>
        )}

        {/* Chapter outline panel (collapsible) — hidden in Zen Mode */}
        {!zenMode && (
          <div className="border-b border-gray-200 bg-amber-50 shrink-0">
            <button
              onClick={() => setOutlineExpanded(!outlineExpanded)}
              className="w-full flex items-center justify-between px-6 py-2 text-sm"
            >
              <span className="flex items-center gap-2 font-medium text-amber-800">
                <BookOpen size={14} />
                章节大纲
                {chapterOutline && (
                  <span className="text-xs font-normal text-amber-600">
                    v{chapterOutline.version} ·{" "}
                    {chapterOutline.confirmed ? "已确认" : chapterOutline.status}
                  </span>
                )}
              </span>
              {outlineExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {outlineExpanded && (
              <div className="px-6 pb-3 text-sm text-amber-900">
                {outlineLoading ? (
                  <p className="flex items-center gap-2 text-amber-700">
                    <Loader2 size={14} className="animate-spin" />
                    正在读取章节大纲...
                  </p>
                ) : chapterOutline ? (
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-amber-100/60 p-3 text-xs leading-5 text-amber-950">
                    {chapterOutline.content_json}
                  </pre>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 text-amber-700">
                    <span>当前章节还没有大纲。运行全链路后会自动生成并保存。</span>
                    <button
                      onClick={handleRunPipeline}
                      disabled={pipelineRunning || agentRunning}
                      className="rounded bg-amber-200 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-300 disabled:opacity-50"
                    >
                      {pipelineRunning ? "生成中..." : "全链路生成"}
                    </button>
                  </div>
                )}
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
              {pipelineRunning ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Wand2 size={12} />
              )}
              <span className="hidden sm:inline">
                {pipelineRunning ? "全链路中..." : "全链路生成"}
              </span>
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
              onClick={() => handleRewrite("repair")}
              disabled={rewriting || agentRunning || !draftText.trim()}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700 disabled:opacity-50"
              title="根据编译/评审反馈修复问题"
            >
              {rewriting ? <Loader2 size={12} className="animate-spin" /> : <Edit3 size={12} />}
              <span className="hidden sm:inline">{rewriting ? "修复中..." : "AI 修复"}</span>
            </button>
            <button
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-xs hover:bg-gray-100"
            >
              <History size={12} />
              <span className="hidden sm:inline">版本历史</span>
            </button>
            <button
              onClick={handleRecallContext}
              disabled={recalling}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-white text-teal-700 border border-teal-100 rounded-lg text-xs hover:bg-teal-50 disabled:opacity-50"
            >
              {recalling ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
              <span className="hidden sm:inline">{recalling ? "召回中..." : "召回上下文"}</span>
            </button>

            {/* 更多操作 dropdown */}
            <div className="relative" ref={moreActionsRef}>
              <button
                onClick={() => setMoreActionsOpen(!moreActionsOpen)}
                className="flex items-center gap-1 px-2 sm:px-3 py-1.5 bg-white text-gray-700 border border-gray-200 rounded-lg text-xs hover:bg-gray-100"
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
                      handleCompileAndReport();
                      setMoreActionsOpen(false);
                    }}
                    disabled={compiling || !draftText.trim()}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Eye size={14} className="shrink-0" />
                    <span>{compiling ? "编译中..." : "编译检查"}</span>
                  </button>
                  <button
                    onClick={() => {
                      handleGenerateTaskCard();
                      setMoreActionsOpen(false);
                    }}
                    disabled={generating || agentRunning}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
                  >
                    <ClipboardList size={14} className="shrink-0" />
                    <span>{generating ? "生成中..." : "生成任务卡"}</span>
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
                    <span>{filtering ? "审校中..." : "去AI化审校"}</span>
                  </button>
                  <div className="border-t border-gray-100 my-1" />
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
            placeholder={
              isStreaming ? "AI 正在生成..." : "开始写作... 也可以点击「AI 生成草稿」让AI先写一版"
            }
            chapterNumber={num}
            fallbackTitle={currentChapter?.title || ""}
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
                              onClick={() =>
                                handleParagraphRewrite(issue.paragraph_index!, issue.message)
                              }
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
                    <span className="font-medium">段落修复完成</span> 第
                    {rewriteResult.paragraph_index + 1}段
                    {rewriteResult.compile_score != null && (
                      <span className="ml-2">编译评分: {rewriteResult.compile_score}</span>
                    )}
                    <button
                      onClick={() => setRewriteResult(null)}
                      className="ml-2 text-green-600 hover:text-green-800"
                    >
                      ×
                    </button>
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
              <div className="px-6 pb-3 text-sm text-red-600">
                编译失败：{compileError || "请重试"}
              </div>
            )}
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

      {/* Right sidebar: chapter control console — hidden in Zen Mode */}
      {!zenMode && (
        <div className="w-72 border-l border-gray-200 bg-gray-50 overflow-auto shrink-0">
          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium text-gray-900 text-sm flex items-center gap-2">
                <Target size={14} className="text-indigo-600" />
                章节控制台
              </h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full ${statusInfo?.color || "bg-gray-100 text-gray-600"}`}
              >
                {statusInfo?.label || currentChapter?.status || "未开始"}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500 leading-5">{chapterStageHint}</p>
          </div>

          <div className="p-4 space-y-4">
            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                  <Wand2 size={13} className="text-indigo-600" />
                  全链路生产
                </h4>
                <span className="text-xs font-semibold text-indigo-600">
                  {pipelineProgressPct}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                  style={{ width: `${pipelineProgressPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {completedPipelineSteps}/{totalPipelineSteps} 步
                </span>
                {pipelineRunning ? (
                  <span className="flex items-center gap-1 text-indigo-600">
                    <Loader2 size={11} className="animate-spin" />
                    运行中
                  </span>
                ) : pipelineResult ? (
                  <span>{formatMs(pipelineResult.total_duration_ms)}</span>
                ) : (
                  <span>尚未启动</span>
                )}
              </div>
              {currentRunningStep && (
                <div className="mt-2 rounded bg-indigo-50 px-2 py-1.5 text-xs text-indigo-700">
                  当前：{currentRunningStep}
                </div>
              )}
              {recentPipelineSteps.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {recentPipelineSteps.map((step, i) => (
                    <div key={`${step.name}-${i}`} className="flex items-center gap-2 text-xs">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          step.status === "completed" || step.status === "completed_with_errors"
                            ? "bg-green-100 text-green-600"
                            : step.status === "failed"
                              ? "bg-red-100 text-red-600"
                              : step.status === "running"
                                ? "bg-indigo-100 text-indigo-600"
                                : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {step.status === "running" ? (
                          <Loader2 size={9} className="animate-spin" />
                        ) : step.status === "completed" ||
                          step.status === "completed_with_errors" ? (
                          <CheckCircle size={9} />
                        ) : step.status === "failed" ? (
                          <AlertTriangle size={9} />
                        ) : (
                          <Clock size={9} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-gray-700">{step.name}</span>
                      <span className="shrink-0 text-gray-400">
                        {formatStepStatus(step.status)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-400">运行后会显示最近执行步骤。</p>
              )}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h4 className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                <Eye size={13} className="text-amber-600" />
                质量闸门
              </h4>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded border border-gray-100 bg-gray-50 px-2 py-2">
                  <p className="text-xs text-gray-500">质量</p>
                  <p
                    className={`mt-1 text-sm font-semibold ${
                      qualityReport?.overall === "FAIL"
                        ? "text-red-600"
                        : qualityReport?.overall === "WARN"
                          ? "text-amber-600"
                          : qualityReport
                            ? "text-green-600"
                            : "text-gray-900"
                    }`}
                  >
                    {qualityStatusLabel}
                  </p>
                  <p className="text-xs text-gray-500">
                    {qualityReport
                      ? `${qualityReport.checks.filter((c) => c.status !== "PASS").length}项待处理`
                      : "本地闸门"}
                  </p>
                </div>
                <div className="rounded border border-gray-100 bg-gray-50 px-2 py-2">
                  <p className="text-xs text-gray-500">字数</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{wordCount}</p>
                  <p
                    className={`text-xs ${
                      wordTargetStatus === "合适" ? "text-green-600" : "text-amber-600"
                    }`}
                  >
                    {wordTargetStatus}
                  </p>
                </div>
                <div className="rounded border border-gray-100 bg-gray-50 px-2 py-2">
                  <p className="text-xs text-gray-500">编译</p>
                  <p
                    className={`mt-1 text-sm font-semibold ${
                      compileResult?.status === "fail"
                        ? "text-red-600"
                        : compileResult
                          ? "text-green-600"
                          : "text-gray-900"
                    }`}
                  >
                    {compileResult ? `${compileResult.score}分` : compileStatusLabel}
                  </p>
                  <p className="text-xs text-gray-500">
                    {compileIssueCounts.errors}错 / {compileIssueCounts.warnings}警
                  </p>
                </div>
                <div className="rounded border border-gray-100 bg-gray-50 px-2 py-2">
                  <p className="text-xs text-gray-500">快评</p>
                  <p
                    className={`mt-1 text-sm font-semibold ${
                      quickReview?.overall === "FAIL"
                        ? "text-red-600"
                        : quickReview?.overall === "WARN"
                          ? "text-amber-600"
                          : quickReview
                            ? "text-green-600"
                            : "text-gray-900"
                    }`}
                  >
                    {quickReviewStatusLabel}
                  </p>
                  <p className="text-xs text-gray-500">
                    {quickReview
                      ? `${quickReviewIssues}条意见`
                      : quickReviewStale
                        ? "修复后需复评"
                        : "三专家"}
                  </p>
                </div>
                {(pipelineResult?.review_score != null || currentChapter?.review_status) && (
                  <div className="rounded border border-gray-100 bg-gray-50 px-2 py-2">
                    <p className="text-xs text-gray-500">评审</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">
                      {pipelineResult?.review_score != null
                        ? `${pipelineResult.review_score}分`
                        : reviewVerdictLabel}
                    </p>
                    {pipelineResult?.review_score != null && (
                      <p className="text-xs text-gray-500">{reviewVerdictLabel}</p>
                    )}
                  </div>
                )}
                {hasReviewMatrix && (
                  <div className="rounded border border-gray-100 bg-gray-50 px-2 py-2">
                    <p className="text-xs text-gray-500">分歧</p>
                    <p
                      className={`mt-1 text-sm font-semibold ${conflictCount > 0 ? "text-orange-600" : "text-green-600"}`}
                    >
                      {conflictCount > 0 ? `${conflictCount}项` : "无"}
                    </p>
                    {reviewMatrix?.score_spread != null && reviewMatrix.score_spread > 0 && (
                      <p className="text-xs text-gray-500">分差 {reviewMatrix.score_spread}</p>
                    )}
                  </div>
                )}
              </div>
              {qualityReport && (
                <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2">
                  {qualityReport.checks.slice(0, 4).map((check) => (
                    <div key={check.key} className="flex items-start gap-1.5 text-xs">
                      {check.status === "PASS" ? (
                        <CheckCircle size={11} className="mt-0.5 shrink-0 text-green-500" />
                      ) : check.status === "WARN" ? (
                        <AlertCircle size={11} className="mt-0.5 shrink-0 text-amber-500" />
                      ) : (
                        <AlertTriangle size={11} className="mt-0.5 shrink-0 text-red-500" />
                      )}
                      <span className="min-w-0 flex-1 text-gray-600">
                        <span className="font-medium text-gray-700">{check.name}：</span>
                        {check.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  onClick={() => handleQualityGate()}
                  disabled={qualityRunning || !draftText.trim()}
                  className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  {qualityRunning ? "检查中..." : "质量闸门"}
                </button>
                <button
                  onClick={handleQuickReview}
                  disabled={quickReviewRunning || !draftText.trim()}
                  className="rounded bg-purple-50 px-2 py-1 text-xs text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                >
                  {quickReviewRunning ? "评审中..." : "快速评审"}
                </button>
                <button
                  onClick={handleRepairAndRecheck}
                  disabled={
                    repairingChapter ||
                    !draftText.trim() ||
                    repairReasons.length === 0 ||
                    resolutionReport?.status === "not_converged"
                  }
                  className="rounded bg-teal-50 px-2 py-1 text-xs text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                  title={
                    resolutionReport?.status === "not_converged"
                      ? "AI 修复未收敛，请重新生成局部修复方案或调整问题后再试"
                      : undefined
                  }
                >
                  {repairingChapter
                    ? `第 ${Math.max(repairRound, 1)}/${MAX_REPAIR_ROUNDS} 轮修复中...`
                    : repairRound > 0 && resolutionReport?.status !== "resolved"
                      ? `继续 AI 修复第 ${Math.min(repairRound + 1, MAX_REPAIR_ROUNDS)}/${MAX_REPAIR_ROUNDS} 轮`
                      : "一键修复"}
                </button>
              </div>
              {repairReasons.length > 0 && resolutionReport?.status !== "not_converged" && (
                <div className="mt-3 rounded border border-teal-100 bg-teal-50 px-2 py-2">
                  <p className="text-xs font-medium text-teal-800">
                    {repairRound > 0 ? "下一轮将修复的问题" : "本次将修复的问题"}
                  </p>
                  {resolutionReport && (
                    <p className="mt-1 text-xs text-teal-700">
                      仍存在 {resolutionReport.persisted.length} 项，新增{" "}
                      {resolutionReport.added.length} 项；已解决的问题会作为回归防护。
                    </p>
                  )}
                  <ul className="mt-1 space-y-1 text-xs text-teal-700">
                    {repairReasons.slice(0, 7).map((reason) => (
                      <li key={reason} className="line-clamp-2">
                        - {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lastRepairReasons.length > 0 && quickReviewStale && (
                <div className="mt-3 rounded border border-amber-100 bg-amber-50 px-2 py-2 text-xs text-amber-700">
                  已按 {lastRepairReasons.length}{" "}
                  条问题执行修复，上一轮快评已进入历史。请重新运行快速评审确认修复效果。
                </div>
              )}
              {resolutionReport && (
                <div
                  className={`mt-3 rounded border px-2 py-2 text-xs ${
                    resolutionReport.status === "not_converged"
                      ? "border-red-100 bg-red-50 text-red-700"
                      : resolutionReport.status === "resolved"
                        ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                      : "border-blue-100 bg-blue-50 text-blue-700"
                  }`}
                >
                  <p className="font-medium">
                    {resolutionReport.status === "not_converged"
                      ? "AI 修复未收敛"
                      : resolutionReport.status === "resolved"
                        ? "修复闭环已收敛"
                        : resolutionReport.status === "pending_review"
                          ? "等待复评确认"
                          : "修复效果对比"}
                  </p>
                  <p className="mt-1">
                    第 {resolutionReport.round}/{resolutionReport.maxRounds} 轮：已解决{" "}
                    {resolutionReport.resolved.length} 项，仍存在{" "}
                    {resolutionReport.persisted.length} 项，新增 {resolutionReport.added.length} 项；
                    问题数 {resolutionReport.previousCount} {"->"} {resolutionReport.currentCount}。
                  </p>
                  {resolutionReport.status === "not_converged" && (
                    <p className="mt-1">
                      连续修复后仍有新增或阻断问题。建议重新生成更小范围的局部修复方案，再做复评。
                    </p>
                  )}
                  {resolutionReport.added.slice(0, 3).map((item) => (
                    <p key={item} className="mt-1 line-clamp-2">
                      新增：{formatIssueFingerprint(item)}
                    </p>
                  ))}
                  {resolutionReport.persisted.slice(0, 3).map((item) => (
                    <p key={item} className="mt-1 line-clamp-2">
                      仍存在：{formatIssueFingerprint(item)}
                    </p>
                  ))}
                </div>
              )}
            </section>

            {(quickReview || quickReviewStale || quickReviewHistory.length > 0) && (
              <section className="rounded-lg border border-gray-200 bg-white p-3">
                <h4 className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                  <Brain size={13} className="text-violet-600" />
                  快速评审历史
                </h4>
                {quickReview && (
                  <div className="mt-3 space-y-2">
                    {quickReview.experts.map((expert) => (
                      <div
                        key={expert.agent_name}
                        className="rounded border border-gray-100 bg-gray-50 px-2 py-1.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700">{expert.expert_name}</span>
                          <span className={expert.passed ? "text-green-600" : "text-amber-600"}>
                            {expert.passed ? "通过" : "有意见"}
                          </span>
                        </div>
                        {expert.suggestions.slice(0, 2).map((suggestion, i) => (
                          <p key={i} className="mt-1 line-clamp-2 text-xs text-gray-500">
                            {suggestion}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
                {!quickReview && quickReviewStale && (
                  <div className="mt-3 rounded border border-amber-100 bg-amber-50 px-2 py-2 text-xs text-amber-700">
                    草稿已修复或变更，上一轮快速评审已失效。请重新运行快速评审。
                  </div>
                )}
                {quickReviewHistory.length > 1 && (
                  <div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500">
                    历史 {quickReviewHistory.length} 次，最近：
                    {new Date(quickReviewHistory[0].created_at).toLocaleString()}
                  </div>
                )}
              </section>
            )}

            {topExpertScores.length > 0 && (
              <section className="rounded-lg border border-gray-200 bg-white p-3">
                <h4 className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                  <Brain size={13} className="text-purple-600" />
                  评审观点
                </h4>
                <div className="mt-3 space-y-2">
                  {topExpertScores.map(([name, score]) => (
                    <div key={name}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-gray-700">{expertNameLabels[name] || name}</span>
                        <span
                          className={
                            score >= 8
                              ? "text-green-600"
                              : score >= 6
                                ? "text-amber-600"
                                : "text-red-600"
                          }
                        >
                          {score}分
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${
                            score >= 8 ? "bg-green-500" : score >= 6 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${Math.min(100, score * 10)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {pipelineResult?.conflict_matrix?.conflicts.slice(0, 2).map((conflict, i) => (
                    <div
                      key={`${conflict.topic}-${i}`}
                      className="rounded border border-orange-100 bg-orange-50 px-2 py-1.5 text-xs text-orange-800"
                    >
                      <p className="font-medium">{conflict.topic}</p>
                      <p className="mt-0.5 line-clamp-2">
                        {conflict.expert_a} 与 {conflict.expert_b} 意见相左
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {taskForChapter && (
              <section className="rounded-lg border border-gray-200 bg-white p-3">
                <h4 className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                  <ClipboardList size={13} className="text-amber-600" />
                  本章焦点
                </h4>
                <div className="mt-2 space-y-2 text-xs text-gray-600">
                  <p className="line-clamp-3 text-gray-800">{taskForChapter.objective}</p>
                  {taskForChapter.must_progress && (
                    <p className="line-clamp-2">
                      <span className="font-medium text-gray-700">推进：</span>
                      {taskForChapter.must_progress}
                    </p>
                  )}
                  {taskForChapter.ending_hook && (
                    <p className="line-clamp-2">
                      <span className="font-medium text-gray-700">钩子：</span>
                      {taskForChapter.ending_hook}
                    </p>
                  )}
                  {qualityReport?.artifacts.required_foreshadows.length ? (
                    <div>
                      <p className="font-medium text-gray-700">可推进伏笔：</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {qualityReport.artifacts.required_foreshadows.slice(0, 3).map((item) => (
                          <span
                            key={item}
                            className="rounded bg-purple-50 px-1.5 py-0.5 text-purple-700"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-3">
              <h4 className="text-xs font-medium text-gray-800 flex items-center gap-1.5">
                <ArrowRight size={13} className="text-teal-600" />
                下一步
              </h4>
              {nextActions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {nextActions.slice(0, 5).map((action) => {
                    const onClick =
                      action === "补齐章节任务卡"
                        ? handleGenerateTaskCard
                        : action === "运行编译检查"
                          ? handleCompileAndReport
                          : action === "运行质量闸门"
                            ? () => handleQualityGate()
                            : action === "快速三专家评审"
                              ? handleQuickReview
                              : action.includes("修复") || action.includes("处理")
                                ? handleRepairAndRecheck
                                : undefined;
                    return (
                      <button
                        key={action}
                        onClick={onClick}
                        disabled={
                          !onClick || repairingChapter || qualityRunning || quickReviewRunning
                        }
                        className="rounded bg-teal-50 px-2 py-1 text-xs text-teal-700 hover:bg-teal-100 disabled:cursor-default disabled:opacity-70"
                      >
                        {action}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400">当前没有明显阻塞。</p>
              )}
              {latestPipelineEvents.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-2">
                  {latestPipelineEvents.map((notif) => (
                    <div key={notif.id} className="flex items-start gap-1.5 text-xs text-gray-500">
                      {notif.severity === "error" ? (
                        <AlertTriangle size={11} className="mt-0.5 shrink-0 text-red-500" />
                      ) : notif.severity === "warning" ? (
                        <AlertCircle size={11} className="mt-0.5 shrink-0 text-amber-500" />
                      ) : (
                        <CheckCircle size={11} className="mt-0.5 shrink-0 text-green-500" />
                      )}
                      <span className="line-clamp-2">{notif.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
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
                <div
                  key={r.chapter_number}
                  className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-800">
                      第{r.chapter_number}章
                    </span>
                    <span className="text-xs text-gray-500 ml-2">{r.draft_length} 字</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(r.saved_at).toLocaleString()}
                  </span>
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
