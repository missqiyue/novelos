import { invoke } from "@tauri-apps/api/core";

// ─── Project ───
export interface ProjectInfo {
  id: string;
  title: string;
  genre_id: string | null;
  logline: string | null;
  target_words: number | null;
  target_volumes: number | null;
  min_chapter_words: number;
  max_chapter_words: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  title: string;
  genre_id?: string;
  logline?: string;
  target_words?: number;
  target_volumes?: number;
}

export interface ImportResult {
  chapters_imported: number;
  total_words: number;
  chapter_titles: string[];
}

export const projectApi = {
  create: (input: CreateProjectInput) => invoke<ProjectInfo>("create_project", { input }),
  get: () => invoke<ProjectInfo>("get_project"),
  switch: (projectId: string) => invoke<ProjectInfo>("switch_project", { projectId }),
  close: () => invoke<void>("close_project"),
  update: (title?: string, status?: string) => invoke<void>("update_project", { title, status }),
  delete: (projectId: string) => invoke<void>("delete_project", { projectId }),
  exportTxt: (projectId: string) => invoke<string>("export_project_txt", { projectId }),
  exportMd: (projectId: string) => invoke<string>("export_project_md", { projectId }),
  exportDocx: (projectId: string) => invoke<string>("export_project_docx", { projectId }),
  exportEpub: (projectId: string) => invoke<string>("export_project_epub", { projectId }),
  exportPdf: (projectId: string) => invoke<string>("export_project_pdf", { projectId }),
  importTxt: (filePath: string) => invoke<ImportResult>("import_project_txt", { filePath }),
  createSample: () => invoke<SeedResult>("create_sample_project"),
};

export interface SeedResult {
  project_id: string;
  title: string;
  volumes_created: number;
  characters_created: number;
  chapters_created: number;
  canon_rules_created: number;
  foreshadows_created: number;
}

// ─── Bookshelf ───
export interface BookshelfItem {
  id: string;
  project_id: string;
  title: string;
  genre_name: string | null;
  status: string;
  display_order: number;
  cover_image: string | null;
  last_opened_at: string | null;
  created_at: string;
}

export const bookshelfApi = {
  list: () => invoke<BookshelfItem[]>("list_bookshelf"),
  add: (projectId: string, title: string, genreName?: string, status?: string) =>
    invoke<string>("add_to_bookshelf", { projectId, title, genreName, status }),
  remove: (id: string) => invoke<void>("remove_from_bookshelf", { id }),
  update: (projectId: string, title?: string, genreName?: string, status?: string) =>
    invoke<void>("update_bookshelf_item", { projectId, title, genreName, status }),
  reorder: (orderedIds: string[]) => invoke<void>("reorder_bookshelf", { orderedIds }),
};

// ─── Canon ───
export interface CanonRuleInfo {
  id: string;
  rule_key: string;
  rule_name: string;
  rule_type: string;
  scope_type: string;
  scope_ref: string | null;
  content: string;
  is_hard: boolean;
  status: string;
  version: number;
  source_type: string | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanonRuleVersionInfo {
  id: string;
  canon_rule_id: string;
  version: number;
  content: string;
  change_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CreateCanonRuleInput {
  rule_key: string;
  rule_name: string;
  rule_type?: string;
  scope_type: string;
  scope_ref?: string;
  content: string;
  is_hard?: boolean;
  source_type?: string;
  source_ref?: string;
}

export const canonApi = {
  list: (scopeType?: string) => invoke<CanonRuleInfo[]>("list_canon_rules", { scopeType }),
  create: (input: CreateCanonRuleInput) => invoke<CanonRuleInfo>("create_canon_rule", { input }),
  get: (id: string) => invoke<CanonRuleInfo>("get_canon_rule", { id }),
  update: (
    id: string,
    content?: string,
    ruleName?: string,
    status?: string,
    isHard?: boolean,
    changeReason?: string,
  ) =>
    invoke<CanonRuleInfo>("update_canon_rule", {
      id,
      content,
      ruleName,
      status,
      isHard,
      changeReason,
    }),
  delete: (id: string) => invoke<void>("delete_canon_rule", { id }),
  listVersions: (canonRuleId: string) =>
    invoke<CanonRuleVersionInfo[]>("list_canon_rule_versions", { canonRuleId }),
  search: (query: string) => invoke<CanonRuleInfo[]>("search_canon_rules", { query }),
};

// ─── Outline ───
export interface BookOutlineInfo {
  id: string;
  version: number;
  content_json: string;
  change_reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VolumeOutlineInfo {
  id: string;
  volume_id: string;
  version: number;
  content_json: string;
  change_reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ChapterOutlineInfo {
  id: string;
  chapter_number: number;
  task_id: string | null;
  version: number;
  content_json: string;
  confirmed: boolean;
  change_reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VolumeInfo {
  id: string;
  volume_number: number;
  title: string | null;
  chapter_start: number | null;
  chapter_end: number | null;
  goal: string | null;
  main_conflict: string | null;
  climax: string | null;
  settlement: string | null;
  status: string | null;
}

export interface ArcInfo {
  id: string;
  volume_id: string | null;
  arc_type: string;
  title: string | null;
  chapter_start: number | null;
  chapter_end: number | null;
  goal: string | null;
  status: string | null;
  priority: number | null;
}

export interface EventNodeInfo {
  id: string;
  arc_id: string | null;
  chapter_number: number | null;
  event_type: string | null;
  summary: string;
  cause_refs: string | null;
  effect_refs: string | null;
  participants: string | null;
  impact_scope: string | null;
  status: string | null;
}

export const outlineApi = {
  getBookOutline: () => invoke<BookOutlineInfo | null>("get_book_outline"),
  saveBookOutline: (contentJson: string, changeReason?: string) =>
    invoke<BookOutlineInfo>("save_book_outline", { contentJson, changeReason }),
  listVolumeOutlines: () => invoke<VolumeOutlineInfo[]>("list_volume_outlines"),
  saveVolumeOutline: (volumeId: string, contentJson: string, changeReason?: string) =>
    invoke<VolumeOutlineInfo>("save_volume_outline", { volumeId, contentJson, changeReason }),
  listChapterOutlines: () => invoke<ChapterOutlineInfo[]>("list_chapter_outlines"),
  saveChapterOutline: (
    chapterNumber: number,
    contentJson: string,
    taskId?: string,
    changeReason?: string,
  ) =>
    invoke<ChapterOutlineInfo>("save_chapter_outline", {
      chapterNumber,
      contentJson,
      taskId,
      changeReason,
    }),
  confirmChapterOutline: (chapterNumber: number) =>
    invoke<void>("confirm_chapter_outline", { chapterNumber }),
  listVolumes: () => invoke<VolumeInfo[]>("list_volumes"),
  updateVolume: (
    id: string,
    title?: string,
    goal?: string,
    mainConflict?: string,
    climax?: string,
    settlement?: string,
    status?: string,
  ) => invoke<void>("update_volume", { id, title, goal, mainConflict, climax, settlement, status }),
  listArcs: (volumeId?: string) => invoke<ArcInfo[]>("list_arcs", { volumeId }),
  createArc: (input: {
    volume_id: string;
    title: string;
    arc_type?: string;
    chapter_start?: number;
    chapter_end?: number;
    goal?: string;
  }) => invoke<ArcInfo>("create_arc", { input }),
  listEventNodes: (arcId?: string) => invoke<EventNodeInfo[]>("list_event_nodes", { arcId }),
};

// ─── Chapter ───
export interface ChapterTaskInfo {
  id: string;
  chapter_number: number;
  volume_id: string | null;
  arc_id: string | null;
  objective: string;
  must_progress: string | null;
  must_recall: string | null;
  must_avoid: string | null;
  required_hooks: string | null;
  required_context: string | null;
  ending_hook: string | null;
  status: string | null;
  created_at: string;
}

export interface ChapterInfo {
  id: string;
  chapter_number: number;
  title: string | null;
  status: string;
  draft_text: string | null;
  final_text: string | null;
  word_count: number | null;
  task_id: string | null;
  compiler_status: string | null;
  review_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterVersionInfo {
  id: string;
  chapter_id: string;
  version_no: number;
  content_type: string;
  content: string;
  diff_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ChapterSearchResult {
  chapter_number: number;
  title: string | null;
  snippet: string;
  status: string;
  word_count: number | null;
}

export interface RecalledContext {
  hard_rules: string[];
  soft_rules: string[];
  character_states: string[];
  open_foreshadows: string[];
  total_tokens_estimate: number;
}

export interface CharacterInfo {
  id: string;
  name: string;
  alias: string | null;
  role_type: string;
  identity_core: string | null;
  persona_core: string | null;
  soul_template_id: string | null;
  soul_json: string;
  taboo_rules: string | null;
  core_motivation: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export const chapterApi = {
  listTasks: (volumeId?: string) => invoke<ChapterTaskInfo[]>("list_chapter_tasks", { volumeId }),
  createTask: (
    chapterNumber: number,
    objective: string,
    volumeId?: string,
    arcId?: string,
    mustProgress?: string,
    mustRecall?: string,
    mustAvoid?: string,
  ) =>
    invoke<ChapterTaskInfo>("create_chapter_task", {
      chapterNumber,
      objective,
      volumeId,
      arcId,
      mustProgress,
      mustRecall,
      mustAvoid,
    }),
  listChapters: () => invoke<ChapterInfo[]>("list_chapters"),
  getChapter: (chapterNumber: number) => invoke<ChapterInfo>("get_chapter", { chapterNumber }),
  createChapter: (chapterNumber: number, title?: string, taskId?: string) =>
    invoke<ChapterInfo>("create_chapter", { chapterNumber, title, taskId }),
  updateDraft: (chapterNumber: number, draftText: string, skipVersion?: boolean) =>
    invoke<ChapterInfo>("update_chapter_draft", { chapterNumber, draftText, skipVersion }),
  finalize: (chapterNumber: number) => invoke<ChapterInfo>("finalize_chapter", { chapterNumber }),
  listVersions: (chapterNumber: number) =>
    invoke<ChapterVersionInfo[]>("list_chapter_versions", { chapterNumber }),
  rollback: (chapterNumber: number, versionNo: number) =>
    invoke<ChapterInfo>("rollback_chapter", { chapterNumber, versionNo }),
  searchChapters: (query: string) => invoke<ChapterSearchResult[]>("search_chapters", { query }),
  recallContext: (chapterNumber: number) =>
    invoke<RecalledContext>("recall_context_for_chapter", { chapterNumber }),
  listCharacters: () => invoke<CharacterInfo[]>("list_characters"),
  createCharacter: (name: string, roleType?: string, soulJson?: string) =>
    invoke<CharacterInfo>("create_character", { name, roleType, soulJson }),
  updateCharacter: (
    id: string,
    name?: string,
    soulJson?: string,
    roleType?: string,
    identityCore?: string,
    personaCore?: string,
    coreMotivation?: string,
  ) =>
    invoke<void>("update_character", {
      id,
      name,
      soulJson,
      roleType,
      identityCore,
      personaCore,
      coreMotivation,
    }),
  deleteCharacter: (id: string) => invoke<void>("delete_character", { id }),
  transitionState: (chapterNumber: number, newStatus: string) =>
    invoke<ChapterInfo>("transition_chapter_state", { chapterNumber, newStatus }),
  getValidTransitions: (chapterNumber: number) =>
    invoke<string[]>("get_valid_transitions", { chapterNumber }),
  setCompileStatus: (chapterNumber: number, compilerStatus: string) =>
    invoke<void>("set_compile_status", { chapterNumber, compilerStatus }),
  setReviewStatus: (chapterNumber: number, reviewStatus: string) =>
    invoke<void>("set_review_status", { chapterNumber, reviewStatus }),
};

// ─── Compiler ───
export interface CompileIssue {
  checker: string;
  severity: string; // "error", "warning", "info"
  message: string;
  detail: string | null;
  location: string | null;
  paragraph_index: number | null;
}

export interface CompileStats {
  word_count: number;
  paragraph_count: number;
  dialogue_markers: number;
  hard_rules_checked: number;
  hard_rules_violated: number;
  soft_rules_checked: number;
  soft_rules_violated: number;
  characters_referenced: string[];
  characters_missing_soul: string[];
  foreshadow_items_checked: number;
  foreshadow_items_overdue: number;
}

export interface CompileResult {
  status: string; // "pass", "warning", "fail"
  score: number; // 0-100
  issues: CompileIssue[];
  stats: CompileStats;
  suggestions: string[];
}

export interface ParagraphRewriteResult {
  chapter_number: number;
  paragraph_index: number;
  original_paragraph: string;
  revised_paragraph: string;
  compile_score: number | null;
}

export const compilerApi = {
  compile: (chapterNumber: number, draftText: string) =>
    invoke<CompileResult>("compile_chapter", {
      input: { chapter_number: chapterNumber, draft_text: draftText },
    }),
  rewriteParagraph: (chapterNumber: number, paragraphIndex: number, requirements: string) =>
    invoke<ParagraphRewriteResult>("run_paragraph_rewrite", {
      chapterNumber,
      paragraphIndex,
      requirements,
    }),
};

// ─── Ledger ───
export interface CharacterStateInfo {
  id: string;
  character_id: string;
  snapshot_id: string | null;
  chapter_from: number | null;
  chapter_to: number | null;
  level_state: string | null;
  physical_state: string | null;
  emotion_state: string | null;
  goal_state: string | null;
  location_id: string | null;
  resource_state: string | null;
  known_info: string | null;
  secret_info: string | null;
  created_at: string;
}

export interface RelationshipStateInfo {
  id: string;
  source_character_id: string;
  target_character_id: string;
  relation_type: string;
  strength: number | null;
  trust_score: number | null;
  conflict_score: number | null;
  chapter_from: number | null;
  chapter_to: number | null;
  trigger_event_id: string | null;
  notes: string | null;
}

export interface TimelineNodeInfo {
  id: string;
  chapter_number: number | null;
  world_date: string | null;
  relative_day: number | null;
  location_id: string | null;
  summary: string;
  participants: string | null;
  dependencies: string | null;
}

export interface ForeshadowItemInfo {
  id: string;
  seed_chapter: number;
  expected_volume_id: string | null;
  title: string;
  maturity_condition: string | null;
  payoff_type: string | null;
  status: string;
  resolved_chapter: number | null;
  importance: number | null;
  notes: string | null;
}

export interface AbilityItemInfo {
  id: string;
  item_type: string;
  name: string;
  owner_character_id: string | null;
  source_rule_id: string | null;
  cost_rule: string | null;
  cooldown_rule: string | null;
  limit_rule: string | null;
  status: string | null;
}

export interface KnowledgeVisibilityInfo {
  id: string;
  knowledge_key: string;
  holder_type: string;
  holder_ref: string;
  visibility_state: string;
  chapter_acquired: number | null;
  source_event_id: string | null;
}

export interface NotificationInfo {
  id: string;
  notif_type: string;
  severity: string;
  message: string;
  related_entity: string | null;
  read_status: boolean;
  created_at: string;
}

export interface LedgerSummary {
  character_states_count: number;
  relationship_states_count: number;
  timeline_nodes_count: number;
  event_nodes_count: number;
  foreshadow_items_count: number;
  foreshadow_planted_count: number;
  foreshadow_resolved_count: number;
  foreshadow_overdue_count: number;
  ability_items_count: number;
}

export const ledgerApi = {
  // Knowledge visibility
  listKnowledgeVisibility: (holderRef?: string) =>
    invoke<KnowledgeVisibilityInfo[]>("list_knowledge_visibility", { holderRef }),
  upsertKnowledgeVisibility: (input: {
    id?: string;
    knowledge_key: string;
    holder_type: string;
    holder_ref: string;
    visibility_state: string;
    chapter_acquired?: number;
    source_event_id?: string;
  }) => invoke<KnowledgeVisibilityInfo>("upsert_knowledge_visibility", { input }),
  // Character states
  listCharacterStates: (characterId?: string) =>
    invoke<CharacterStateInfo[]>("list_character_states", { characterId }),
  upsertCharacterState: (input: {
    character_id: string;
    chapter_from?: number;
    chapter_to?: number;
    level_state?: string;
    physical_state?: string;
    emotion_state?: string;
    goal_state?: string;
    location_id?: string;
    resource_state?: string;
    known_info?: string;
    secret_info?: string;
  }) => invoke<CharacterStateInfo>("upsert_character_state", { input }),
  deleteCharacterState: (id: string) => invoke<void>("delete_character_state", { id }),
  // Relationship states
  listRelationshipStates: (characterId?: string) =>
    invoke<RelationshipStateInfo[]>("list_relationship_states", { characterId }),
  upsertRelationshipState: (input: {
    source_character_id: string;
    target_character_id: string;
    relation_type: string;
    strength?: number;
    trust_score?: number;
    conflict_score?: number;
    chapter_from?: number;
    chapter_to?: number;
    trigger_event_id?: string;
    notes?: string;
  }) => invoke<RelationshipStateInfo>("upsert_relationship_state", { input }),
  // Timeline nodes
  listTimelineNodes: (chapterNumber?: number) =>
    invoke<TimelineNodeInfo[]>("list_timeline_nodes", { chapterNumber }),
  upsertTimelineNode: (input: {
    id?: string;
    chapter_number?: number;
    world_date?: string;
    relative_day?: number;
    location_id?: string;
    summary: string;
    participants?: string;
    dependencies?: string;
  }) => invoke<TimelineNodeInfo>("upsert_timeline_node", { input }),
  // Foreshadow items
  listForeshadowItems: (status?: string) =>
    invoke<ForeshadowItemInfo[]>("list_foreshadow_items", { status }),
  upsertForeshadowItem: (input: {
    id?: string;
    seed_chapter: number;
    expected_volume_id?: string;
    title: string;
    maturity_condition?: string;
    payoff_type?: string;
    status?: string;
    resolved_chapter?: number;
    importance?: number;
    notes?: string;
  }) => invoke<ForeshadowItemInfo>("upsert_foreshadow_item", { input }),
  // Ability items
  listAbilityItems: (ownerId?: string) =>
    invoke<AbilityItemInfo[]>("list_ability_items", { ownerId }),
  upsertAbilityItem: (input: {
    id?: string;
    item_type: string;
    name: string;
    owner_character_id?: string;
    source_rule_id?: string;
    cost_rule?: string;
    cooldown_rule?: string;
    limit_rule?: string;
    status?: string;
  }) => invoke<AbilityItemInfo>("upsert_ability_item", { input }),
  // Summary
  // Notifications
  listNotifications: (unreadOnly?: boolean) =>
    invoke<NotificationInfo[]>("list_notifications", { unreadOnly }),
  markNotificationRead: (id: string) => invoke<void>("mark_notification_read", { id }),
  getUnreadCount: () =>
    invoke<{ total: number; by_type: Record<string, number> }>("get_unread_notification_count"),
  getSummary: () => invoke<LedgerSummary>("get_ledger_summary"),
};

// ─── Backup ───
export interface BackupInfo {
  path: string;
  created_at: string;
  size_bytes: number;
}

export const backupApi = {
  create: () => invoke<BackupInfo>("create_backup"),
  list: () => invoke<BackupInfo[]>("list_backups"),
  restore: (backupPath: string) => invoke<BackupInfo>("restore_backup", { backupPath }),
};

// ─── Retcon ───
export interface RetconRequestInfo {
  id: string;
  target_type: string;
  target_ref: string;
  reason: string;
  status: string;
  rejection_reason: string | null;
  selected_scheme_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RetconImpactInfo {
  id: string;
  retcon_id: string;
  risk_level: string;
  risk_explanation: string;
  affected_chapters: number[];
  affected_characters: Array<{
    id: string;
    name: string;
    before: string;
    after: string;
    impact_level: string;
  }>;
  affected_foreshadows: Array<{
    id: string;
    title: string;
    seed_chapter: number;
    impact: string;
  }>;
  fix_schemes: Array<{
    id: string;
    title: string;
    description: string;
    difficulty: string;
    estimated_chapters: number;
    estimated_days: number;
    pros: string[];
    cons: string[];
  }>;
}

export interface RetconExecutionStepInfo {
  step_key: string;
  step_name: string;
  status: string;
  details: string | null;
  duration_ms: number;
}

export interface RetconExecutionResult {
  retcon_id: string;
  steps: RetconExecutionStepInfo[];
  affected_chapters: Array<{
    chapter_number: number;
    title: string | null;
    status: string;
  }>;
  total_duration_ms: number;
}

// ─── Retcon Workflow ───

export interface RetconWorkflowState {
  retcon_id: string;
  current_step: string;
  steps_completed: string[];
  impact_report: RetconImpactInfo | null;
  hard_rule_violation: boolean;
  hard_rule_details: string | null;
  selected_scheme: string | null;
  execution_plan: { retcon_id: string; status: string; affected_chapters: number[]; estimated_duration_seconds: number } | null;
  post_check_result: { passed_count: number; failed_count: number; needs_attention: Array<{ chapter_number: number; status: string; score: number }> } | null;
  snapshot_result: { retcon_id: string; snapshots_regenerated: number; chapter_numbers: number[] } | null;
  warnings: string[];
}

// ─── Background Tasks ───

export interface BackgroundTask {
  id: string;
  project_id: string;
  task_type: string;
  label: string;
  status: string;
  progress: number;
  started_at: string;
  updated_at: string;
}

// ─── Shared Resources ───

export interface StyleProfileInfo {
  id: string;
  name: string;
  metrics: string;
  preferred_patterns: string;
  anti_ai_features: string;
  sample_paragraphs: string;
  banned_patterns: string;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface WritingPatternInfo {
  id: string;
  source_type: string;
  source_ref: string | null;
  pattern_name: string;
  genre_compat: string | null;
  description: string;
  usage_guide: string | null;
  sample_text: string | null;
  created_at: string;
}

export interface UpsertWritingPatternInput {
  id?: string;
  source_type: string;
  source_ref?: string | null;
  pattern_name: string;
  genre_compat?: string | null;
  description: string;
  usage_guide?: string | null;
  sample_text?: string | null;
}

export interface GlobalResourcesOverview {
  genre_templates: number;
  style_profiles: number;
  de_ai_rules: number;
  soul_templates: number;
  writing_patterns: number;
  banned_names: number;
  banned_titles: number;
}

export interface EditorPrefs {
  font_family?: string;
  font_size?: number;
  line_spacing?: number;
  paragraph_spacing?: number;
  margin_width?: string;
}

export const retconApi = {
  list: (status?: string) => invoke<RetconRequestInfo[]>("list_retcon_requests", { status }),
  create: (input: { target_type: string; target_ref: string; reason: string }) =>
    invoke<RetconRequestInfo>("create_retcon_request", { input }),
  approve: (id: string) => invoke<RetconRequestInfo>("approve_retcon_request", { id }),
  reject: (id: string, reason: string) =>
    invoke<RetconRequestInfo>("reject_retcon_request", { id, reason }),
  getImpact: (id: string) => invoke<RetconImpactInfo>("get_retcon_impact", { id }),
  applyScheme: (id: string, schemeId: string) =>
    invoke<RetconRequestInfo>("apply_retcon_scheme", { id, schemeId }),
  execute: (id: string) => invoke<RetconExecutionResult>("execute_retcon", { id }),
  getExecutionStatus: (id: string) =>
    invoke<RetconExecutionResult>("get_retcon_execution_status", { id }),
  startWorkflow: (targetType: string, targetRef: string, reason: string) =>
    invoke<RetconWorkflowState>("start_retcon_workflow", { targetType, targetRef, reason }),
  continueWorkflow: (retconId: string, schemeType: string, confirm: boolean) =>
    invoke<RetconWorkflowState>("continue_retcon_workflow", { retconId, schemeType, confirm }),
  completeWorkflow: (retconId: string) =>
    invoke<RetconWorkflowState>("complete_retcon_workflow", { retconId }),
  rollback: (retconId: string, reason: string) =>
    invoke<RetconWorkflowState>("rollback_retcon", { retconId, reason }),
};

// ─── Snapshot ───
export interface SnapshotInfo {
  id: string;
  snapshot_type: string;
  chapter_start: number | null;
  chapter_end: number | null;
  volume_id: string | null;
  arc_id: string | null;
  summary_json: string;
  created_at: string;
}

export const snapshotApi = {
  generate: (chapterNumber: number) =>
    invoke<SnapshotInfo>("generate_chapter_snapshot", { chapterNumber }),
  list: (snapshotType?: string, chapterStart?: number, chapterEnd?: number) =>
    invoke<SnapshotInfo[]>("list_snapshots", { snapshotType, chapterStart, chapterEnd }),
};

// ─── De-AI Rules (global) ───
export interface DeAiRuleInfo {
  id: string;
  category: string;
  pattern: string;
  replacement: string | null;
  severity: string;
  is_enabled: boolean;
  description: string | null;
  created_at: string;
}

export const deAiRulesApi = {
  list: () => invoke<DeAiRuleInfo[]>("list_de_ai_rules"),
  upsert: (input: {
    id?: string;
    category: string;
    pattern: string;
    replacement?: string;
    severity?: string;
    is_enabled?: boolean;
    description?: string;
  }) => invoke<DeAiRuleInfo>("upsert_de_ai_rule", { input }),
  delete: (id: string) => invoke<void>("delete_de_ai_rule", { id }),
};

// ─── SOUL Templates (global) ───
export interface SoulTemplateInfo {
  id: string;
  soul_name: string;
  category: string;
  genre_compat: string | null;
  personality_json: string;
  speech_json: string;
  behavior_json: string;
  relationships_json: string | null;
  is_builtin: boolean;
  created_at: string;
}

// ─── Genre Templates (global) ───
export interface GenreTemplateInfo {
  id: string;
  genre_id: string;
  genre_name: string;
  world_framework: string | null;
  volume_rhythm: string | null;
  character_archetypes: string | null;
  thrill_params: string | null;
  taboo_rules: string | null;
  naming_style: string | null;
  naming_examples: string | null;
}

export const templateApi = {
  listSoulTemplates: (category?: string) =>
    invoke<SoulTemplateInfo[]>("list_soul_templates", { category }),
  listGenreTemplates: () => invoke<GenreTemplateInfo[]>("list_genre_templates"),
};

// ─── LLM ───
export interface LlmConfig {
  provider: string;
  base_url: string;
  api_key: string;
  model: string;
  max_tokens: number;
  temperature: number;
  /** Embedding provider: "ollama" (local), "openai", or empty (auto-detect) */
  embedding_provider: string;
  /** Embedding model name. Defaults: "nomic-embed-text" for Ollama, "text-embedding-3-small" for OpenAI */
  embedding_model: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatResponse {
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  prompt_tokens: number;
  completion_tokens: number;
  model: string;
}

export interface StreamMessage {
  request_id: string;
  chunk: StreamChunk;
}

export const llmApi = {
  getConfig: () => invoke<LlmConfig>("get_llm_config"),
  updateConfig: (
    provider?: string,
    baseUrl?: string,
    apiKey?: string,
    model?: string,
    maxTokens?: number,
    temperature?: number,
    embeddingProvider?: string,
    embeddingModel?: string,
  ) =>
    invoke<LlmConfig>("update_llm_config", {
      input: {
        provider,
        base_url: baseUrl,
        api_key: apiKey,
        model,
        max_tokens: maxTokens,
        temperature,
        embedding_provider: embeddingProvider,
        embedding_model: embeddingModel,
      },
    }),
  chat: (messages: ChatMessage[]) => invoke<ChatResponse>("chat_completion", { messages }),
  chatWithSystem: (systemPrompt: string, userPrompt: string) =>
    invoke<ChatResponse>("chat_with_system_prompt", { systemPrompt, userPrompt }),
  chatStream: (messages: ChatMessage[], requestId: string) =>
    invoke<void>("chat_completion_stream", { messages, requestId }),
  saveConfigToDb: (config: LlmConfig) => invoke<void>("save_llm_config_to_db", { config }),
  loadConfigFromDb: () => invoke<LlmConfig | null>("load_llm_config_from_db"),
  getTokenUsage: () => invoke<TokenUsageSummary>("get_token_usage"),
};

export interface TokenUsageSummary {
  total_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_cost_estimate_usd: number;
  by_agent: Array<{ agent_name: string; calls: number; total_tokens: number }>;
  by_model: Array<{ model: string; calls: number; total_tokens: number }>;
}

// ─── Agent ───
export interface AgentRunResult {
  agent_name: string;
  content: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  duration_ms: number;
  model: string;
}

export interface AgentInfo {
  name: string;
  description: string;
}

export interface AgentLogEntry {
  id: string;
  agent_name: string;
  input_summary: string | null;
  output_summary: string | null;
  status: string;
  duration_ms: number | null;
  token_usage: number | null;
  error_message: string | null;
  created_at: string;
}

export const agentApi = {
  list: () => invoke<AgentInfo[]>("list_agents"),
  run: (agentName: string, variables: Record<string, string>) =>
    invoke<AgentRunResult>("run_agent", { agentName, variables }),
  listLogs: (agentName?: string, limit?: number) =>
    invoke<AgentLogEntry[]>("list_agent_logs", { agentName, limit }),
};

// ─── Orchestrator ───
export interface PipelineStep {
  name: string;
  agent_name: string | null;
  status: string; // "pending", "running", "completed", "failed", "skipped"
  output: string | null;
  duration_ms: number;
}

export interface ReviewConflict {
  topic: string;
  expert_a: string;
  position_a: string;
  expert_b: string;
  position_b: string;
  severity: string; // "low", "medium", "high"
  user_resolution: string | null; // "favor_a", "favor_b", "ignore", null
}

export interface ConflictMatrix {
  expert_scores: [string, number][];
  conflicts: ReviewConflict[];
  score_spread: number;
}

export interface PipelineResult {
  steps: PipelineStep[];
  chapter_status: string;
  compiler_score: number | null;
  review_verdict: string | null;
  review_score: number | null;
  total_duration_ms: number;
  conflict_matrix: ConflictMatrix | null;
}

export const orchestratorApi = {
  runPipeline: (chapterNumber: number) =>
    invoke<PipelineResult>("run_chapter_pipeline", { chapterNumber }),
  runBatchPipeline: (startChapter: number, endChapter: number) =>
    invoke<PipelineResult[]>("run_batch_pipeline", { startChapter, endChapter }),
};

// ─── Task Manager ───

export const taskApi = {
  listProjectTasks: (projectId: string) =>
    invoke<BackgroundTask[]>("list_project_tasks", { projectId }),
  cancelTask: (taskId: string) => invoke<void>("cancel_task", { taskId }),
  pauseTask: (taskId: string) => invoke<void>("pause_task", { taskId }),
  resumeTask: (taskId: string) => invoke<void>("resume_task", { taskId }),
};

// ─── Shared Resources (global) ───

export const sharedResourcesApi = {
  listStyleProfiles: () => invoke<StyleProfileInfo[]>("list_style_profiles"),
  listWritingPatterns: (sourceType?: string) =>
    invoke<WritingPatternInfo[]>("list_writing_patterns", { sourceType }),
  upsertWritingPattern: (input: UpsertWritingPatternInput) =>
    invoke<WritingPatternInfo>("upsert_writing_pattern", { input }),
  applyGenreTemplate: (templateId: string) =>
    invoke<void>("apply_genre_template_to_project", { templateId }),
  applyStyleProfile: (profileId: string) =>
    invoke<void>("apply_style_profile_to_project", { profileId }),
  importDeAiRules: (ruleIds: string[]) =>
    invoke<number>("import_deai_rules_to_project", { ruleIds }),
  listGlobalResources: () => invoke<GlobalResourcesOverview>("list_global_resources"),
  getEditorPrefs: () => invoke<EditorPrefs>("get_editor_prefs"),
  setEditorPrefs: (prefs: EditorPrefs) => invoke<void>("set_editor_prefs", { prefs }),
};

// ─── World ───

export interface LocationInfo {
  id: string;
  name: string;
  location_type?: string;
  owner_faction_id?: string;
  danger_level?: number;
  status?: string;
  description?: string;
}

export interface FactionInfo {
  id: string;
  name: string;
  faction_type?: string;
  goal?: string;
  resource_summary?: string;
  status?: string;
}

export interface CollisionItem {
  id: string;
  item_type: string;
  text: string;
  reason: string;
  severity: string;
}

export const worldApi = {
  listLocations: () => invoke<LocationInfo[]>("list_locations"),
  createLocation: (input: { name: string; location_type?: string; owner_faction_id?: string; danger_level?: number; status?: string; description?: string }) =>
    invoke<LocationInfo>("create_location", { input }),
  updateLocation: (input: { id: string; name?: string; location_type?: string; owner_faction_id?: string; danger_level?: number; status?: string; description?: string }) =>
    invoke<void>("update_location", { input }),
  deleteLocation: (id: string) => invoke<void>("delete_location", { id }),
  listFactions: () => invoke<FactionInfo[]>("list_factions"),
  createFaction: (input: { name: string; faction_type?: string; goal?: string; resource_summary?: string; status?: string }) =>
    invoke<FactionInfo>("create_faction", { input }),
  updateFaction: (input: { id: string; name?: string; faction_type?: string; goal?: string; resource_summary?: string; status?: string }) =>
    invoke<void>("update_faction", { input }),
  deleteFaction: (id: string) => invoke<void>("delete_faction", { id }),
  checkCollisions: (query: string) => invoke<CollisionItem[]>("check_collisions", { query }),
};

// ─── Writing Sessions ───

export interface WritingSessionInfo {
  id: string;
  project_id: string;
  chapter_id: string | null;
  words_written: number;
  duration_seconds: number;
  started_at: string;
  ended_at: string;
}

export const writingSessionApi = {
  startSession: (input: { chapter_id?: string; start_word_count: number }) =>
    invoke<WritingSessionInfo>("start_writing_session", { input }),
  endSession: (input: { session_id: string; end_word_count: number }) =>
    invoke<WritingSessionInfo>("end_writing_session", { input }),
  listSessions: (chapter_id?: string) =>
    invoke<WritingSessionInfo[]>("list_writing_sessions", { chapter_id }),
};

// ─── Crash Recovery ───
export interface CrashRecoveryInfo {
  chapter_number: number;
  saved_at: string;
  draft_length: number;
}

export const crashRecoveryApi = {
  emergencySave: (chapterNumber: number, draftText: string) =>
    invoke<void>("emergency_save_draft", { chapterNumber, draftText }),
  check: () => invoke<CrashRecoveryInfo[]>("check_crash_recovery"),
  restore: (chapterNumber: number) =>
    invoke<string>("restore_crash_draft", { chapterNumber }),
  discard: (chapterNumber: number) =>
    invoke<void>("discard_crash_recovery", { chapterNumber }),
};

// ─── Compliance Shield ───
export interface ComplianceHit {
  word: string;
  category: string;
  risk_level: string;
  suggestion: string | null;
  positions: number[];
}

export interface ComplianceScanResult {
  chapter_number: number;
  total_hits: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  hits: ComplianceHit[];
}

export interface ComplianceWordEntry {
  id: string;
  word: string;
  category: string;
  risk_level: string;
  suggestion: string | null;
  is_builtin: boolean;
}

export const complianceApi = {
  scanChapter: (chapterNumber: number) =>
    invoke<ComplianceScanResult>("scan_chapter_compliance", { chapterNumber }),
  scanAll: () => invoke<ComplianceScanResult[]>("scan_all_chapters_compliance"),
  listWords: () => invoke<ComplianceWordEntry[]>("list_compliance_words"),
  addWord: (word: string, category: string, riskLevel: string, suggestion?: string) =>
    invoke<ComplianceWordEntry>("add_compliance_word", {
      word,
      category,
      riskLevel,
      suggestion: suggestion || null,
    }),
  deleteWord: (id: string) => invoke<void>("delete_compliance_word", { id }),
};

// ─── RAG ───
export interface SimilarChapterResult {
  chapter_number: number;
  similarity: number;
  snippet: string;
}

export interface RagSemanticRecallItem {
  chapter_number: number;
  chunk_text: string;
  similarity: number;
}

export interface RagSemanticRecallResponse {
  results: RagSemanticRecallItem[];
  message: string | null;
}

export interface RagIntentFilter {
  character_names?: string[];
  pov_character?: string;
  active_foreshadows?: string[];
  chapter_range?: [number, number];
}

export interface IndexStats {
  total_chapters_indexed: number;
  total_chunks: number;
  total_vectors: number;
}

export const ragApi = {
  searchSimilar: (query: string, topK?: number) =>
    invoke<SimilarChapterResult[]>("search_similar_chapters", {
      input: { query, top_k: topK || 5 },
    }),
  semanticRecall: (queryText: string, topK?: number, intent?: RagIntentFilter) =>
    invoke<RagSemanticRecallResponse>("rag_semantic_recall", {
      queryText,
      topK: topK || 5,
      intent: intent || null,
    }),
  clearBookIndex: (projectId: string) =>
    invoke<boolean>("clear_book_index", { projectId }),
  getIndexStats: () => invoke<IndexStats>("get_index_stats"),

};

// ─── Window Theme ───
export const windowApi = {
  setWindowTheme: (theme: string) =>
    invoke<void>("set_window_theme", { theme }),
};
