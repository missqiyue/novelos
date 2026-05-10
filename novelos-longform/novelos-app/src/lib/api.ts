import { platform } from "./platform";
import * as tauri from "./tauri";
import * as web from "./web-api";
import { webDb } from "./web-db";

// Re-export all types from tauri.ts (they are shared between platforms)
export type {
  ProjectInfo,
  CreateProjectInput,
  ImportResult,
  SeedResult,
  BookshelfItem,
  CanonRuleInfo,
  CanonRuleVersionInfo,
  CreateCanonRuleInput,
  BookOutlineInfo,
  VolumeOutlineInfo,
  ChapterOutlineInfo,
  VolumeInfo,
  ArcInfo,
  EventNodeInfo,
  ChapterTaskInfo,
  ChapterInfo,
  ChapterVersionInfo,
  ChapterSearchResult,
  RecalledContext,
  CharacterInfo,
  CompileIssue,
  CompileStats,
  CompileResult,
  ParagraphRewriteResult,
  ChapterQualityReport,
  QualityAction,
  QualityArtifacts,
  QualityCheck,
  QuickReviewExpertReport,
  QuickReviewReport,
  RepairChapterResult,
  CharacterStateInfo,
  RelationshipStateInfo,
  TimelineNodeInfo,
  ForeshadowItemInfo,
  AbilityItemInfo,
  KnowledgeVisibilityInfo,
  NotificationInfo,
  LedgerSummary,
  BackupInfo,
  RetconRequestInfo,
  RetconImpactInfo,
  RetconExecutionStepInfo,
  RetconExecutionResult,
  RetconWorkflowState,
  SnapshotInfo,
  DeAiRuleInfo,
  SoulTemplateInfo,
  GenreTemplateInfo,
  LlmConfig,
  ChatMessage,
  ChatResponse,
  StreamChunk,
  StreamMessage,
  TokenUsageSummary,
  AgentInfo,
  AgentRunResult,
  AgentLogEntry,
  PipelineStep,
  PipelineResult,
  ReviewConflict,
  ConflictMatrix,
  BackgroundTask,
  StyleProfileInfo,
  UpsertStyleProfileInput,
  WritingPatternInfo,
  UpsertWritingPatternInput,
  UpsertGenreTemplateInput,
  GlobalResourcesOverview,
  EditorPrefs,
  LocationInfo,
  FactionInfo,
  CollisionItem,
  WritingSessionInfo,
  CrashRecoveryInfo,
  ComplianceHit,
  ComplianceScanResult,
  ComplianceWordEntry,
  SimilarChapterResult,
  RagSemanticRecallItem,
  RagSemanticRecallResponse,
  RagIntentFilter,
  IndexStats,
  RagRebuildProgressEvent,
} from "./tauri";

export { WebNotSupportedError } from "./web-api";

const src = platform.isTauri ? tauri : web;

export const projectApi = src.projectApi;
export const bookshelfApi = src.bookshelfApi;
export const canonApi = src.canonApi;
export const outlineApi = src.outlineApi;
export const chapterApi = src.chapterApi;
export const compilerApi = src.compilerApi;
export const ledgerApi = src.ledgerApi;
export const backupApi = src.backupApi;
export const retconApi = src.retconApi;
export const snapshotApi = src.snapshotApi;
export const deAiRulesApi = src.deAiRulesApi;
export const templateApi = src.templateApi;
export const llmApi = src.llmApi;
export const agentApi = src.agentApi;
export const orchestratorApi = src.orchestratorApi;
export const taskApi = src.taskApi;
export const sharedResourcesApi = src.sharedResourcesApi;
export const worldApi = src.worldApi;
export const writingSessionApi = src.writingSessionApi;
export const crashRecoveryApi = src.crashRecoveryApi;
export const complianceApi = src.complianceApi;
export const ragApi = src.ragApi;

let initialized = false;

export async function initApi(): Promise<void> {
  if (initialized) return;
  if (platform.isWeb) {
    await webDb.initGlobal();
  }
  initialized = true;
}
