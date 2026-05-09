import { useState, useEffect } from "react";
import {
 AlertTriangle,
 CheckCircle,
 XCircle,
 Clock,
 ChevronRight,
 ChevronDown,
 Eye,
 Play,
 RotateCcw,
 Shield,
 BookOpen,
 Users,
 Layers,
} from "lucide-react";
import { ContextHelp } from "../common/ContextHelp";
import {
 retconApi,
 type RetconRequestInfo,
 type RetconWorkflowState,
} from "../../lib/api";

// ─── Types ───

interface RetconImpactReport {
 target_type: string;
 target_ref: string;
 reason: string;
 affected_volumes: AffectedVolume[];
 affected_chapters: number[];
 affected_characters: AffectedCharacter[];
 affected_foreshadows: AffectedForeshadow[];
 risk_level: string;
 fix_schemes: FixScheme[];
}

interface AffectedVolume {
 volume_number: number;
 title: string | null;
 chapter_start: number | null;
 chapter_end: number | null;
}
interface AffectedCharacter {
 id: string;
 name: string;
 chapters_involved: number[];
}
interface AffectedForeshadow {
 id: string;
 title: string;
 status: string;
 seed_chapter: number;
 resolved_chapter: number | null;
}
interface FixScheme {
 name: string;
 description: string;
 estimated_work_chapters: number;
}

// ─── Status Badge ───

function StatusBadge({ status }: { status: string }) {
 const styles: Record<string, string> = {
 pending: "bg-yellow-100 text-yellow-800",
 approved: "bg-blue-100 text-blue-800",
 executing: "bg-purple-100 text-purple-800",
 completed: "bg-green-100 text-green-800",
 rejected: "bg-red-100 text-red-800",
 rolled_back: "bg-gray-100 text-gray-800",
 };
 const labels: Record<string, string> = {
 pending: "待审批",
 approved: "已批准",
 executing: "执行中",
 completed: "已完成",
 rejected: "已拒绝",
 rolled_back: "已回滚",
 };
 return (
 <span
 className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-800"}`}
 >
 {labels[status] || status}
 </span>
 );
}

function RiskBadge({ level }: { level: string }) {
 const styles: Record<string, string> = {
 low: "bg-green-100 text-green-800",
 medium: "bg-yellow-100 text-yellow-800",
 high: "bg-orange-100 text-orange-800",
 critical: "bg-red-100 text-red-800",
 };
 const labels: Record<string, string> = {
 low: "低风险",
 medium: "中风险",
 high: "高风险",
 critical: "极高风险",
 };
 return (
 <span
 className={`px-2 py-1 rounded text-xs font-medium ${styles[level] || "bg-gray-100 text-gray-800"}`}
 >
 {labels[level] || level}
 </span>
 );
}

// ─── UI-090: Retcon Approval List ───

export function RetconApprovalPage() {
 const [requests, setRequests] = useState<RetconRequestInfo[]>([]);
 const [filter, setFilter] = useState<"all" | "pending" | "completed" | "rejected">("all");
 const [selectedId, setSelectedId] = useState<string | null>(null);
 const [showCreate, setShowCreate] = useState(false);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 loadRequests();
 }, []);

 async function loadRequests() {
 try {
 const list = await retconApi.list();
 setRequests(list);
 } catch (e) {
 console.error(e);
 }
 setLoading(false);
 }

 const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

 const selected = selectedId ? requests.find((r) => r.id === selectedId) : null;

 return (
 <div className="flex h-full">
 {/* UI-090: Left panel — request list */}
 <div className="w-80 border-r border-gray-200 flex flex-col">
 <div className="p-3 border-b border-gray-200">
 <div className="flex items-center justify-between mb-2">
 <h2 className="text-lg font-bold">修史审批台</h2>
 <button
 onClick={() => setShowCreate(true)}
 className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
 >
 + 新建申请
 </button>
 </div>
 <div className="flex gap-1">
 {(["all", "pending", "completed", "rejected"] as const).map((f) => (
 <button
 key={f}
 onClick={() => setFilter(f)}
 className={`px-2 py-1 rounded text-xs ${filter === f ? "bg-blue-100 text-blue-800" : "text-gray-600 hover:bg-gray-100"}`}
 >
 {{ all: "全部", pending: "待审批", completed: "已完成", rejected: "已拒绝" }[f]}
 </button>
 ))}
 </div>
 </div>
 <div className="flex-1 overflow-y-auto">
 {loading ? (
 <div className="p-4 text-gray-500">加载中...</div>
 ) : filtered.length === 0 ? (
 <div className="p-4 text-gray-500 text-sm">暂无修史申请</div>
 ) : (
 filtered.map((r) => (
 <div
 key={r.id}
 onClick={() => setSelectedId(r.id)}
 className={`p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${selectedId === r.id ? "bg-blue-50" : ""}`}
 >
 <div className="flex items-center justify-between mb-1">
 <StatusBadge status={r.status} />
 </div>
 <div className="text-sm font-medium truncate mt-1">
 {r.target_type === "chapter"
 ? `第${r.target_ref}章`
 : r.target_type === "character"
 ? `角色: ${r.target_ref}`
 : r.target_type === "canon"
 ? `规则: ${r.target_ref}`
 : r.target_ref}
 </div>
 <div className="text-xs text-gray-500 truncate mt-1">
 {r.reason}
 </div>
 <div className="text-xs text-gray-400 mt-1">
 {new Date(r.created_at).toLocaleDateString()}
 </div>
 </div>
 ))
 )}
 </div>
 </div>

 {/* UI-091~093: Right panel — detail & actions */}
 <div className="flex-1 overflow-y-auto p-6">
 {selected ? (
 <RetconDetail request={selected} onRefresh={loadRequests} />
 ) : showCreate ? (
 <CreateRetconForm onClose={() => setShowCreate(false)} onCreated={loadRequests} />
 ) : (
 <div className="text-gray-500 flex items-center justify-center h-full">
 <div className="text-center">
 <Shield className="w-12 h-12 mx-auto mb-3 text-gray-300" />
 <p>选择左侧修史申请查看详情，或新建申请</p>
 </div>
 </div>
 )}
 </div>
 </div>
 );
}

// ─── UI-091: Retcon Detail ───

function RetconDetail({
 request,
 onRefresh,
}: {
 request: RetconRequestInfo;
 onRefresh: () => void;
}) {
 const [impact, setImpact] = useState<RetconImpactReport | null>(null);
 const [loading, setLoading] = useState(false);
 const [scheme, setScheme] = useState<string>(request.selected_scheme_id || "");
 const [workflowState, setWorkflowState] = useState<RetconWorkflowState | null>(null);

 useEffect(() => {
 setWorkflowState(null);
 setImpact(null);
 setScheme(request.selected_scheme_id || "");
 }, [request.id]);

 async function handleAnalyze() {
 setLoading(true);
 try {
 const result = await retconApi.startWorkflow(
 request.target_type,
 request.target_ref,
 request.reason,
 );
 setWorkflowState(result);
 if (result.impact_report) setImpact(result.impact_report as RetconImpactReport);
 onRefresh();
 } catch (e) {
 console.error(e);
 }
 setLoading(false);
 }

 async function handleApprove() {
 if (!scheme) {
 alert("请先选择修复方案");
 return;
 }
 setLoading(true);
 try {
 const result = await retconApi.continueWorkflow(request.id, scheme, true);
 setWorkflowState(result);
 onRefresh();
 } catch (e) {
 console.error(e);
 }
 setLoading(false);
 }

 async function handleReject(reason: string) {
 try {
 await retconApi.reject(request.id, reason);
 onRefresh();
 } catch (e) {
 console.error(e);
 }
 }

 async function handleComplete() {
 setLoading(true);
 try {
 const result = await retconApi.completeWorkflow(request.id);
 setWorkflowState(result);
 onRefresh();
 } catch (e) {
 console.error(e);
 }
 setLoading(false);
 }

 async function handleRollback() {
 const reason = prompt("回滚原因:");
 if (!reason) return;
 try {
 await retconApi.rollback(request.id, reason);
 onRefresh();
 } catch (e) {
 console.error(e);
 }
 }

 return (
 <div className="max-w-3xl mx-auto space-y-6">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div>
 <div className="flex items-center gap-2 mb-1">
 <StatusBadge status={request.status} />
 </div>
 <h2 className="text-xl font-bold">
 {request.target_type === "chapter"
 ? `第${request.target_ref}章修史`
 : request.target_type === "character"
 ? `角色修史: ${request.target_ref}`
 : `规则修史: ${request.target_ref}`}
 </h2>
 </div>
 <span className="text-sm text-gray-500">
 {new Date(request.created_at).toLocaleString()}
 </span>
 </div>

 {/* Reason */}
 <div className="bg-gray-50 rounded-lg p-4">
 <h3 className="text-sm font-medium text-gray-600 mb-2">修史原因</h3>
 <p className="text-sm">{request.reason}</p>
 {request.rejection_reason && (
 <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-800">
 拒绝原因: {request.rejection_reason}
 </div>
 )}
 </div>

 {/* Impact Report */}
 {impact && (
 <div className="bg-gray-50 rounded-lg p-4 space-y-3">
 <h3 className="text-sm font-medium text-gray-600 flex items-center gap-1">
 <AlertTriangle className="w-4 h-4" /> 影响分析
 </h3>
 <div className="grid grid-cols-3 gap-3">
 <div className="bg-white rounded p-3 text-center">
 <div className="text-2xl font-bold text-blue-600">
 {impact.affected_chapters.length}
 </div>
 <div className="text-xs text-gray-500">受影响章节</div>
 </div>
 <div className="bg-white rounded p-3 text-center">
 <div className="text-2xl font-bold text-purple-600">
 {impact.affected_characters.length}
 </div>
 <div className="text-xs text-gray-500">受影响角色</div>
 </div>
 <div className="bg-white rounded p-3 text-center">
 <div className="text-2xl font-bold text-orange-600">
 {impact.affected_foreshadows.length}
 </div>
 <div className="text-xs text-gray-500">受影响伏笔</div>
 </div>
 </div>

 {impact.affected_chapters.length > 0 && (
 <div>
 <h4 className="text-xs font-medium text-gray-500 mb-1">受影响章节</h4>
 <div className="flex flex-wrap gap-1">
 {impact.affected_chapters
 .sort((a, b) => a - b)
 .map((ch) => (
 <span
 key={ch}
 className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
 >
 第{ch}章
 </span>
 ))}
 </div>
 </div>
 )}

 {impact.affected_characters.length > 0 && (
 <div>
 <h4 className="text-xs font-medium text-gray-500 mb-1">受影响角色</h4>
 <div className="flex flex-wrap gap-1">
 {impact.affected_characters.map((c) => (
 <span
 key={c.id}
 className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs"
 >
 {c.name} ({c.chapters_involved.length}章)
 </span>
 ))}
 </div>
 </div>
 )}
 </div>
 )}

 {/* Warnings */}
 {workflowState?.warnings && workflowState.warnings.length > 0 && (
 <div className="space-y-2">
 {workflowState.warnings.map((w, i) => (
 <div
 key={i}
 className="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800 flex items-center gap-2"
 >
 <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {w}
 </div>
 ))}
 </div>
 )}

 {/* Hard Rule Violation */}
 {workflowState?.hard_rule_violation && workflowState.hard_rule_details && (
 <div className="bg-red-50 border border-red-200 rounded p-4">
 <h3 className="text-sm font-medium text-red-800 flex items-center gap-1 mb-2">
 <Shield className="w-4 h-4" /> 触及硬规则
 </h3>
 <pre className="text-xs text-red-700 whitespace-pre-wrap">
 {workflowState.hard_rule_details}
 </pre>
 </div>
 )}

 {/* UI-092: Fix Scheme Selection */}
 {(request.status === "pending" || !impact) && (
 <div className="bg-gray-50 rounded-lg p-4 space-y-3">
 <h3 className="text-sm font-medium text-gray-600">操作</h3>
 {!impact ? (
 <button
 onClick={handleAnalyze}
 disabled={loading}
 className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
 >
 {loading ? "分析中..." : "启动影响分析"}
 </button>
 ) : (
 <div className="space-y-3">
 {impact.fix_schemes.map((fs) => (
 <label
 key={fs.name}
 className={`block p-3 border rounded cursor-pointer transition-colors ${scheme === fs.name ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}
 >
 <div className="flex items-center gap-2">
 <input
 type="radio"
 name="scheme"
 value={fs.name}
 checked={scheme === fs.name}
 onChange={() => setScheme(fs.name)}
 className="text-blue-600"
 />
 <span className="font-medium text-sm">{fs.name}</span>
 <span className="text-xs text-gray-500">
 ≈{fs.estimated_work_chapters}章工作量
 </span>
 </div>
 <p className="text-xs text-gray-600 mt-1 ml-6">
 {fs.description}
 </p>
 </label>
 ))}
 <div className="flex gap-2 pt-2">
 <button
 onClick={handleApprove}
 disabled={!scheme || loading}
 className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
 >
 <CheckCircle className="w-4 h-4" /> {loading ? "执行中..." : "批准并执行"}
 </button>
 <ContextHelp
 id="retcon_approve"
 text="批准修史后，系统会自动重新编译受影响的章节，并重新生成快照。此操作不可撤销，请仔细评估影响范围。"
 position="bottom"
 />
 <button
 onClick={() => {
 const r = prompt("拒绝原因:");
 if (r) handleReject(r);
 }}
 className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1"
 >
 <XCircle className="w-4 h-4" /> 拒绝
 </button>
 </div>
 </div>
 )}
 </div>
 )}

 {/* UI-093: Execution Progress */}
 {workflowState?.execution_plan && (
 <div className="bg-gray-50 rounded-lg p-4 space-y-3">
 <h3 className="text-sm font-medium text-gray-600 flex items-center gap-1">
 <Play className="w-4 h-4" /> 执行计划
 </h3>
 <div className="grid grid-cols-2 gap-3 text-sm">
 <div>
 受影响章节:{" "}
 <span className="font-bold">
 {workflowState.execution_plan.affected_chapters.length}
 </span>
 </div>
 <div>
 预估时间:{" "}
 <span className="font-bold">
 ~{Math.ceil(workflowState.execution_plan.estimated_duration_seconds / 60)}分钟
 </span>
 </div>
 </div>
 <div className="flex flex-wrap gap-1">
 {workflowState.execution_plan.affected_chapters
 .sort((a, b) => a - b)
 .map((ch) => (
 <span
 key={ch}
 className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs"
 >
 第{ch}章
 </span>
 ))}
 </div>
 {(request.status === "executing" || request.status === "approved") && (
 <div className="flex gap-2 pt-2">
 <button
 onClick={handleComplete}
 disabled={loading}
 className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
 >
 <CheckCircle className="w-4 h-4" />{" "}
 {loading ? "执行中..." : "完成修史（编译检查+快照更新）"}
 </button>
 <button
 onClick={handleRollback}
 className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 flex items-center gap-1"
 >
 <RotateCcw className="w-4 h-4" /> 回滚
 </button>
 </div>
 )}
 </div>
 )}

 {/* Post-check Results */}
 {workflowState?.post_check_result && (
 <div className="bg-gray-50 rounded-lg p-4 space-y-2">
 <h3 className="text-sm font-medium text-gray-600 flex items-center gap-1">
 <CheckCircle className="w-4 h-4" /> 回归编译结果
 </h3>
 <div className="grid grid-cols-2 gap-3">
 <div className="bg-green-50 rounded p-2 text-center">
 <div className="text-lg font-bold text-green-600">
 {workflowState.post_check_result.passed_count}
 </div>
 <div className="text-xs text-green-700">通过</div>
 </div>
 <div className="bg-red-50 rounded p-2 text-center">
 <div className="text-lg font-bold text-red-600">
 {workflowState.post_check_result.failed_count}
 </div>
 <div className="text-xs text-red-700">失败</div>
 </div>
 </div>
 {workflowState.post_check_result.needs_attention.length > 0 && (
 <div className="space-y-1">
 {workflowState.post_check_result.needs_attention.map((item) => (
 <div
 key={item.chapter_number}
 className="text-xs flex items-center gap-2 text-red-700"
 >
 <XCircle className="w-3 h-3" /> 第{item.chapter_number}章 — {item.status} (分数:{" "}
 {item.score})
 </div>
 ))}
 </div>
 )}
 </div>
 )}

 {/* Snapshot Update Results */}
 {workflowState?.snapshot_result && (
 <div className="bg-green-50 border border-green-200 rounded p-4">
 <div className="flex items-center gap-2 text-green-800">
 <CheckCircle className="w-5 h-5" />
 <span className="font-medium">
 修史完成 — 已重新生成 {workflowState.snapshot_result.snapshots_regenerated} 个章节快照
 </span>
 </div>
 </div>
 )}
 </div>
 );
}

// ─── Create Retcon Form ───

function CreateRetconForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
 const [targetType, setTargetType] = useState("chapter");
 const [targetRef, setTargetRef] = useState("");
 const [reason, setReason] = useState("");
 const [loading, setLoading] = useState(false);

 async function handleSubmit() {
 if (!targetRef.trim() || !reason.trim()) return;
 setLoading(true);
 try {
 await retconApi.startWorkflow(targetType, targetRef.trim(), reason.trim());
 onCreated();
 onClose();
 } catch (e) {
 alert(`创建失败: ${e}`);
 }
 setLoading(false);
 }

 return (
 <div className="max-w-lg mx-auto space-y-4">
 <h2 className="text-xl font-bold">新建修史申请</h2>
 <div>
 <label className="block text-sm font-medium mb-1">修史目标类型</label>
 <select
 value={targetType}
 onChange={(e) => setTargetType(e.target.value)}
 className="w-full px-3 py-2 border border-gray-300 rounded bg-white"
 >
 <option value="chapter">章节</option>
 <option value="character">角色</option>
 <option value="canon">正典规则</option>
 </select>
 </div>
 <div>
 <label className="block text-sm font-medium mb-1">
 {targetType === "chapter"
 ? "章节编号"
 : targetType === "character"
 ? "角色ID或名称"
 : "规则ID"}
 </label>
 <input
 value={targetRef}
 onChange={(e) => setTargetRef(e.target.value)}
 placeholder={targetType === "chapter" ? "如: 5" : "如: rule-001"}
 className="w-full px-3 py-2 border border-gray-300 rounded bg-white"
 />
 </div>
 <div>
 <label className="block text-sm font-medium mb-1">修史原因</label>
 <textarea
 value={reason}
 onChange={(e) => setReason(e.target.value)}
 rows={4}
 placeholder="详细描述需要修改的原因..."
 className="w-full px-3 py-2 border border-gray-300 rounded bg-white"
 />
 </div>
 <div className="flex gap-2">
 <button
 onClick={handleSubmit}
 disabled={loading || !targetRef.trim() || !reason.trim()}
 className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
 >
 {loading ? "提交中..." : "提交并分析影响"}
 </button>
 <button
 onClick={onClose}
 className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
 >
 取消
 </button>
 </div>
 </div>
 );
}
