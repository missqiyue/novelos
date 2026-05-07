// NovelOS Longform — 全部数据表 TypeScript 类型定义
// 对应设计文档 §25 全部35+表 + 补全表

// ─── 通用工具类型 ───
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// ─── 全局库表 ───

export interface GenreTemplate {
  id: string;
  genre_id: string;
  genre_name: string;
  world_framework: string | null; // JSON
  volume_rhythm: string | null; // JSON
  character_archetypes: string | null; // JSON
  thrill_params: string | null; // JSON
  taboo_rules: string | null; // JSON
  default_style_id: string | null;
  default_min_chapter_words: number;
  default_max_chapter_words: number;
  trope_library: string | null; // JSON
  sub_genres: string | null; // JSON
  naming_style: string | null;
  naming_examples: string | null; // JSON
}

export interface StyleProfile {
  id: string;
  name: string;
  metrics: string; // JSON
  preferred_patterns: string; // JSON
  anti_ai_features: string; // JSON
  sample_paragraphs: string; // JSON
  banned_patterns: string; // JSON
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

export interface DeAiRule {
  id: string;
  category: string;
  pattern: string;
  replacement: string | null;
  severity: string;
  is_enabled: number;
  description: string | null;
  created_at: string;
}

export interface WritingPattern {
  id: string;
  source_type: string;
  source_ref: string | null;
  pattern_name: string;
  genre_compat: string | null; // JSON
  description: string;
  usage_guide: string | null;
  sample_text: string | null;
  created_at: string;
}

export interface ReferenceWork {
  id: string;
  title: string;
  author: string | null;
  genre: string;
  platform: string | null;
  key_patterns: string | null; // JSON
  notes: string | null;
  created_at: string;
}

export interface BannedName {
  id: string;
  name: string;
  source_work: string | null;
  source_genre: string | null;
  ban_level: string; // hard_ban | soft_warn | info
  affected_genres: string | null; // JSON
  is_user_added: number;
  created_at: string;
}

export interface SoulTemplate {
  id: string;
  soul_name: string;
  category: string; // protagonist | antagonist | supporting | relationship
  genre_compat: string | null; // JSON
  personality_json: string;
  speech_json: string;
  behavior_json: string;
  relationships_json: string | null;
  is_builtin: number;
  created_at: string;
  updated_at: string;
}

export interface BannedBookTitle {
  id: string;
  title: string;
  source_platform: string | null;
  source_genre: string | null;
  popularity: string; // top10 | top50 | top200 | normal
  ban_level: string; // hard_ban | soft_warn | info
  is_user_added: number;
  created_at: string;
}

export interface BookshelfEntry {
  id: string;
  project_id: string;
  display_order: number;
  cover_image: string | null;
  last_opened_at: string | null;
  created_at: string;
}

export interface GlobalSetting {
  key: string;
  value: string;
  updated_at: string;
}

// ─── 项目库表 ───

export interface Project {
  id: string;
  title: string;
  genre_id: string | null;
  style_profile_id: string | null;
  logline: string | null;
  target_words: number | null;
  target_volumes: number | null;
  min_chapter_words: number;
  max_chapter_words: number;
  mode: string;
  status: string;
  reference_work_ids: string | null; // JSON
  created_at: string;
  updated_at: string;
}

export interface CanonRule {
  id: string;
  project_id: string;
  rule_key: string;
  rule_name: string;
  rule_type: string; // hard_rule | soft_rule | open_rule
  scope_type: string;
  scope_ref: string | null;
  content: string;
  is_hard: number;
  status: string;
  version: number;
  source_type: string | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface CanonRuleVersion {
  id: string;
  canon_rule_id: string;
  version: number;
  content: string;
  change_reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Character {
  id: string;
  project_id: string;
  name: string;
  alias: string | null;
  role_type: string; // protagonist | antagonist | supporting | minor
  identity_core: string | null;
  persona_core: string | null;
  soul_template_id: string | null;
  soul_json: string;
  taboo_rules: string | null; // JSON
  core_motivation: string | null;
  status: string; // active | dormant | dead
  created_at: string;
  updated_at: string;
}

export interface CharacterState {
  id: string;
  project_id: string;
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

export interface RelationshipState {
  id: string;
  project_id: string;
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

export interface Location {
  id: string;
  project_id: string;
  name: string;
  location_type: string | null;
  owner_faction_id: string | null;
  danger_level: number | null;
  status: string | null;
  description: string | null;
}

export interface Faction {
  id: string;
  project_id: string;
  name: string;
  faction_type: string | null;
  goal: string | null;
  resource_summary: string | null;
  status: string | null;
}

export interface AbilityItem {
  id: string;
  project_id: string;
  item_type: string;
  name: string;
  owner_character_id: string | null;
  source_rule_id: string | null;
  cost_rule: string | null;
  cooldown_rule: string | null;
  limit_rule: string | null;
  status: string | null;
}

export interface Volume {
  id: string;
  project_id: string;
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

export interface Arc {
  id: string;
  project_id: string;
  volume_id: string | null;
  arc_type: string;
  title: string | null;
  chapter_start: number | null;
  chapter_end: number | null;
  goal: string | null;
  status: string | null;
  priority: number | null;
}

export interface ChapterTask {
  id: string;
  project_id: string;
  chapter_number: number;
  volume_id: string | null;
  arc_id: string | null;
  objective: string;
  must_progress: string | null; // JSON
  must_recall: string | null; // JSON
  must_avoid: string | null; // JSON
  required_hooks: string | null; // JSON
  required_context: string | null; // JSON
  ending_hook: string | null;
  status: string | null;
  created_at: string;
}

export interface Chapter {
  id: string;
  project_id: string;
  chapter_number: number;
  title: string | null;
  status: string;
  draft_text: string | null;
  final_text: string | null;
  word_count: number | null;
  task_id: string | null;
  compiler_status: string | null;
  review_status: string | null;
  snapshot_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChapterVersion {
  id: string;
  chapter_id: string;
  version_no: number;
  content_type: string;
  content: string;
  diff_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EventNode {
  id: string;
  project_id: string;
  arc_id: string | null;
  chapter_number: number | null;
  event_type: string | null;
  summary: string;
  cause_refs: string | null; // JSON
  effect_refs: string | null; // JSON
  participants: string | null; // JSON
  impact_scope: string | null; // JSON
  status: string | null;
}

export interface ForeshadowItem {
  id: string;
  project_id: string;
  seed_chapter: number;
  expected_volume_id: string | null;
  title: string;
  maturity_condition: string | null;
  payoff_type: string | null;
  status: string; // planted | matured | resolved | expired
  resolved_chapter: number | null;
  importance: number | null;
  notes: string | null;
}

export interface TimelineNode {
  id: string;
  project_id: string;
  chapter_number: number | null;
  world_date: string | null;
  relative_day: number | null;
  location_id: string | null;
  summary: string;
  participants: string | null; // JSON
  dependencies: string | null; // JSON
}

export interface KnowledgeVisibility {
  id: string;
  project_id: string;
  knowledge_key: string;
  holder_type: string;
  holder_ref: string;
  visibility_state: string;
  chapter_acquired: number | null;
  source_event_id: string | null;
}

export interface Snapshot {
  id: string;
  project_id: string;
  snapshot_type: string; // chapter | arc | volume
  chapter_start: number | null;
  chapter_end: number | null;
  volume_id: string | null;
  arc_id: string | null;
  summary_json: string;
  created_at: string;
}

export interface CompilerReport {
  id: string;
  project_id: string;
  chapter_id: string;
  report_type: string;
  status: string; // pass | warning | fail
  issues_json: string;
  score: number | null;
  created_at: string;
}

export interface RetconRequest {
  id: string;
  project_id: string;
  request_type: string;
  target_type: string;
  target_ref: string;
  reason: string;
  impact_summary: string | null;
  risk_level: string | null;
  strategy: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RetconImpact {
  id: string;
  retcon_request_id: string;
  affected_type: string;
  affected_ref: string;
  impact_reason: string | null;
  impact_level: string | null;
}

export interface ReaderComment {
  id: string;
  project_id: string;
  source: string;
  chapter_range: string | null;
  content: string;
  sentiment: string | null;
  cluster_id: string | null;
  status: string;
  created_at: string;
}

export interface CommentAnalysis {
  id: string;
  project_id: string;
  cluster_id: string;
  cluster_label: string;
  sentiment_summary: string;
  revision_suggestion: string | null;
  affected_chapters: string | null; // JSON
  affected_characters: string | null; // JSON
  priority: string | null;
  created_at: string;
}

export interface BookOutline {
  id: string;
  project_id: string;
  version: number;
  content_json: string;
  change_reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface VolumeOutline {
  id: string;
  project_id: string;
  volume_id: string;
  version: number;
  content_json: string;
  change_reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ChapterOutline {
  id: string;
  project_id: string;
  chapter_number: number;
  task_id: string | null;
  version: number;
  content_json: string;
  confirmed: number;
  change_reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── 补全表 ───

export interface Notification {
  id: string;
  project_id: string | null;
  type: string;
  severity: string; // info | warning | critical
  message: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: number;
  created_at: string;
}

export interface AgentExecutionLog {
  id: string;
  project_id: string | null;
  agent_name: string;
  input_summary: string | null;
  output_summary: string | null;
  status: string; // success | failed | timeout
  duration_ms: number | null;
  token_usage: number | null;
  error_message: string | null;
  created_at: string;
}

export interface LlmApiCall {
  id: string;
  project_id: string | null;
  agent_name: string | null;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number | null;
  cost_usd: number | null;
  status: string; // success | rate_limited | error
  created_at: string;
}

export interface ProjectSetting {
  id: string;
  project_id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface WritingSession {
  id: string;
  project_id: string;
  chapter_id: string | null;
  words_written: number;
  duration_seconds: number;
  started_at: string;
  ended_at: string;
}

export interface ChapterWordStats {
  id: string;
  chapter_id: string;
  project_id: string;
  word_count: number;
  paragraph_count: number;
  dialogue_ratio: number | null;
  description_ratio: number | null;
  action_ratio: number | null;
  recorded_at: string;
}

export interface VolumeWordStats {
  id: string;
  volume_id: string;
  project_id: string;
  total_words: number;
  chapter_count: number;
  avg_chapter_words: number;
  recorded_at: string;
}

export interface ProjectWordStats {
  id: string;
  project_id: string;
  total_words: number;
  archived_chapters: number;
  avg_chapter_words: number;
  recorded_at: string;
}

// ─── Agent 相关类型 ───

export interface AgentInput {
  project_id: string;
  book_mode: string;
  objective: string;
  chapter_number: number | null;
  volume_id: string | null;
  arc_id: string | null;
  task_id: string | null;
  genre_id: string | null;
  style_profile_id: string | null;
  constraints: {
    hard_rules: string[];
    soft_rules: string[];
    do_not_change: string[];
    de_ai_rules: string[];
  };
  context: {
    canon_refs: string[];
    snapshot_refs: string[];
    state_refs: string[];
    foreshadow_refs: string[];
    timeline_refs: string[];
    pattern_refs: string[];
    soul_refs: {
      active_souls: string[];
      soul_template_ids: string[];
    };
    outline_refs: {
      book_outline_id: string | null;
      volume_outline_id: string | null;
      prev_5_outline_ids: string[];
      current_outline_id: string | null;
    };
  };
}

export interface AgentOutput {
  result: Json;
  reasons: string[];
  risk_flags: Array<{
    type: string;
    severity: string;
    message: string;
    evidence_refs?: string[];
  }>;
  confidence: number;
  next_action: string;
}

// ─── 章节状态机枚举 ───

export type ChapterStatus =
  | "task_ready"
  | "draft_generated"
  | "compile_failed"
  | "review_pending"
  | "rewrite_required"
  | "approved"
  | "archived"
  | "needs_revalidate";

export type ProjectStatus = "planning" | "active" | "paused" | "completed" | "archived";

// ─── SOUL 子结构类型 ───

export interface SoulPersonality {
  core_traits: string[];
  emotional_range: string;
  stress_response: string;
  growth_direction: string;
}

export interface SoulSpeech {
  tone: string;
  vocabulary: string;
  sentence_pattern: string;
  catchphrases: string[];
  taboo_words: string[];
  emotion_expressions: string[];
  dialogue_examples: Array<{ context: string; line: string }>;
}

export interface SoulBehavior {
  posture: string;
  fighting_style: string;
  decision_pattern: string;
  conflict_style: string;
  habit: string;
}

export interface SoulRelationships {
  default_stance: string;
  trust_pattern: string;
  conflict_reaction: string;
  loyalty_trigger: string;
}

export interface SoulProfile {
  soul_id: string;
  soul_name: string;
  personality: SoulPersonality;
  speech: SoulSpeech;
  behavior: SoulBehavior;
  relationships: SoulRelationships;
}

// ─── LLM Provider 配置 ───

export interface LlmProviderConfig {
  provider: string; // openai | anthropic | ollama | custom
  base_url: string;
  api_key: string;
  model: string;
  max_tokens: number;
  temperature: number;
}
