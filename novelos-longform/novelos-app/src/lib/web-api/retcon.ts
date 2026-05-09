import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  RetconRequestInfo,
  RetconImpactInfo,
  RetconExecutionResult,
  RetconWorkflowState,
} from "../tauri";

export const retconApi = {
  async list(status?: string): Promise<RetconRequestInfo[]> {
    const rows = webDb.all<{
      id: string; project_id: string; request_type: string; target_type: string;
      target_ref: string; reason: string; impact_summary: string | null;
      risk_level: string | null; strategy: string | null; status: string;
      created_at: string; updated_at: string; scheme: string | null;
      approved_at: string | null; rejection_reason: string | null;
    }>(
      "SELECT id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at, scheme, approved_at, rejection_reason FROM retcon_requests ORDER BY created_at DESC",
    );
    let filtered = rows;
    if (status) filtered = rows.filter((r) => r.status === status);
    return filtered.map((r) => ({
      id: r.id, target_type: r.target_type, target_ref: r.target_ref,
      reason: r.reason, status: r.status, rejection_reason: r.rejection_reason,
      selected_scheme_id: r.scheme, created_at: r.created_at, updated_at: r.updated_at,
    }));
  },

  async create(input: { target_type: string; target_ref: string; reason: string }): Promise<RetconRequestInfo> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    webDb.run(
      `INSERT INTO retcon_requests (id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at)
       VALUES (?, ?, 'correction', ?, ?, ?, NULL, NULL, NULL, 'pending', ?, ?)`,
      [id, projectId, input.target_type, input.target_ref, input.reason, ts, ts],
    );
    return {
      id, target_type: input.target_type, target_ref: input.target_ref,
      reason: input.reason, status: "pending", rejection_reason: null,
      selected_scheme_id: null, created_at: ts, updated_at: ts,
    };
  },

  async approve(id: string): Promise<RetconRequestInfo> {
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?",
      [ts, ts, id],
    );
    const row = webDb.get<{
      id: string; target_type: string; target_ref: string; reason: string;
      status: string; scheme: string | null; approved_at: string | null;
      rejection_reason: string | null; created_at: string; updated_at: string;
    }>(
      "SELECT id, target_type, target_ref, reason, status, scheme, approved_at, rejection_reason, created_at, updated_at FROM retcon_requests WHERE id = ?",
      [id],
    );
    return {
      id: row!.id, target_type: row!.target_type, target_ref: row!.target_ref,
      reason: row!.reason, status: row!.status, rejection_reason: row!.rejection_reason,
      selected_scheme_id: row!.scheme, created_at: row!.created_at, updated_at: row!.updated_at,
    };
  },

  async reject(id: string, reason: string): Promise<RetconRequestInfo> {
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET status = 'rejected', rejection_reason = ?, updated_at = ? WHERE id = ?",
      [reason, ts, id],
    );
    const row = webDb.get<{
      id: string; target_type: string; target_ref: string; reason: string;
      status: string; scheme: string | null; rejection_reason: string | null;
      created_at: string; updated_at: string;
    }>(
      "SELECT id, target_type, target_ref, reason, status, scheme, rejection_reason, created_at, updated_at FROM retcon_requests WHERE id = ?",
      [id],
    );
    return {
      id: row!.id, target_type: row!.target_type, target_ref: row!.target_ref,
      reason: row!.reason, status: row!.status, rejection_reason: row!.rejection_reason,
      selected_scheme_id: row!.scheme, created_at: row!.created_at, updated_at: row!.updated_at,
    };
  },

  async getImpact(_id: string): Promise<RetconImpactInfo> {
    throw new WebNotSupportedError("retcon impact analysis (requires AI agent)");
  },

  async applyScheme(id: string, schemeId: string): Promise<RetconRequestInfo> {
    const ts = now();
    webDb.run("UPDATE retcon_requests SET scheme = ?, updated_at = ? WHERE id = ?", [schemeId, ts, id]);
    const row = webDb.get<{
      id: string; target_type: string; target_ref: string; reason: string;
      status: string; scheme: string | null; rejection_reason: string | null;
      created_at: string; updated_at: string;
    }>(
      "SELECT id, target_type, target_ref, reason, status, scheme, rejection_reason, created_at, updated_at FROM retcon_requests WHERE id = ?",
      [id],
    );
    return {
      id: row!.id, target_type: row!.target_type, target_ref: row!.target_ref,
      reason: row!.reason, status: row!.status, rejection_reason: row!.rejection_reason,
      selected_scheme_id: row!.scheme, created_at: row!.created_at, updated_at: row!.updated_at,
    };
  },

  async execute(_id: string): Promise<RetconExecutionResult> {
    throw new WebNotSupportedError("retcon execution (requires AI agent)");
  },

  async getExecutionStatus(_id: string): Promise<RetconExecutionResult> {
    throw new WebNotSupportedError("retcon execution status");
  },

  async startWorkflow(targetType: string, targetRef: string, reason: string): Promise<RetconWorkflowState> {
    const id = uuid();
    const ts = now();
    const projectId = requireProjectId();
    webDb.run(
      `INSERT INTO retcon_requests (id, project_id, request_type, target_type, target_ref, reason, impact_summary, risk_level, strategy, status, created_at, updated_at)
       VALUES (?, ?, 'correction', ?, ?, ?, NULL, NULL, NULL, 'analyzing', ?, ?)`,
      [id, projectId, targetType, targetRef, reason, ts, ts],
    );
    return {
      retcon_id: id,
      current_step: "analyze_impact",
      steps_completed: ["create_request"],
      impact_report: null,
      hard_rule_violation: false,
      hard_rule_details: null,
      selected_scheme: null,
      execution_plan: null,
      post_check_result: null,
      snapshot_result: null,
      warnings: ["Web mode: AI-powered analysis not available. Manual review required."],
    };
  },

  async continueWorkflow(retconId: string, schemeType: string, confirm: boolean): Promise<RetconWorkflowState> {
    if (!confirm) {
      return {
        retcon_id: retconId, current_step: "aborted", steps_completed: ["create_request"],
        impact_report: null, hard_rule_violation: false, hard_rule_details: null,
        selected_scheme: null, execution_plan: null, post_check_result: null, snapshot_result: null,
        warnings: ["Workflow aborted by user."],
      };
    }
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET scheme = ?, status = 'approved', approved_at = ?, updated_at = ? WHERE id = ?",
      [schemeType, ts, ts, retconId],
    );
    return {
      retcon_id: retconId,
      current_step: "execute",
      steps_completed: ["create_request", "analyze_impact", "check_hard_rules", "select_scheme", "approve"],
      impact_report: null, hard_rule_violation: false, hard_rule_details: null,
      selected_scheme: schemeType,
      execution_plan: { retcon_id: retconId, status: "pending", affected_chapters: [], estimated_duration_seconds: 0 },
      post_check_result: null, snapshot_result: null,
      warnings: ["Web mode: execution requires backend service."],
    };
  },

  async completeWorkflow(retconId: string): Promise<RetconWorkflowState> {
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET status = 'completed', updated_at = ? WHERE id = ?",
      [ts, retconId],
    );
    return {
      retcon_id: retconId, current_step: "completed",
      steps_completed: ["create_request", "analyze_impact", "check_hard_rules", "select_scheme", "approve", "execute", "post_check", "update_snapshots"],
      impact_report: null, hard_rule_violation: false, hard_rule_details: null,
      selected_scheme: null,
      execution_plan: { retcon_id: retconId, status: "completed", affected_chapters: [], estimated_duration_seconds: 0 },
      post_check_result: { passed_count: 0, failed_count: 0, needs_attention: [] },
      snapshot_result: { retcon_id: retconId, snapshots_regenerated: 0, chapter_numbers: [] },
      warnings: [],
    };
  },

  async rollback(retconId: string, _reason: string): Promise<RetconWorkflowState> {
    const ts = now();
    webDb.run(
      "UPDATE retcon_requests SET status = 'rolled_back', updated_at = ? WHERE id = ?",
      [ts, retconId],
    );
    return {
      retcon_id: retconId, current_step: "rolled_back",
      steps_completed: ["create_request"],
      impact_report: null, hard_rule_violation: false, hard_rule_details: null,
      selected_scheme: null, execution_plan: null, post_check_result: null, snapshot_result: null,
      warnings: [],
    };
  },
};
