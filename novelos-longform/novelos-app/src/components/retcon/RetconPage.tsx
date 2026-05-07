import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  History,
  Plus,
  X,
  Clock,
  FileText,
  Users,
  ScrollText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowUpRight,
  Search,
  Play,
  MessageSquareText,
} from "lucide-react";

// ─── types ───

interface RetconRequest {
  id: string;
  target_type: "chapter" | "character" | "canon";
  target_ref: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "applied";
  rejection_reason?: string;
  created_at: string;
}

type FilterStatus = "all" | "pending" | "approved" | "rejected" | "applied";

// ─── helpers ───

const targetTypeLabel: Record<string, string> = {
  chapter: "章节",
  character: "角色",
  canon: "正典",
};

const targetTypeIcon: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  chapter: FileText,
  character: Users,
  canon: ScrollText,
};

function statusLabel(status: string): string {
  const m: Record<string, string> = {
    pending: "待审批",
    approved: "已批准",
    rejected: "已拒绝",
    applied: "已应用",
  };
  return m[status] || status;
}

function statusBadgeClass(status: string): string {
  const m: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-blue-100 text-blue-700",
    rejected: "bg-red-100 text-red-700",
    applied: "bg-green-100 text-green-700",
  };
  return m[status] || "bg-gray-100 text-gray-600";
}

function statusIcon(status: string) {
  switch (status) {
    case "pending":
      return <Clock size={12} />;
    case "approved":
      return <CheckCircle2 size={12} />;
    case "rejected":
      return <XCircle size={12} />;
    case "applied":
      return <CheckCircle2 size={12} />;
    default:
      return <AlertCircle size={12} />;
  }
}

// ─── mock data ───

const MOCK_REQUESTS: RetconRequest[] = [
  {
    id: "retcon-1",
    target_type: "chapter",
    target_ref: "第3章",
    reason:
      "第3章的章节大纲中，主角在前往京城的途中经过了云澜山，但根据第7章的综合设定，需要在第3章中提前交代云澜山的地理位置和势力范围。",
    status: "pending",
    created_at: "2026-05-02T10:30:00",
  },
  {
    id: "retcon-2",
    target_type: "character",
    target_ref: "柳如烟",
    reason:
      "在加入了「血影殿」背景后，柳如烟的性格线需要提前展示其隐忍特质。目前的角色设定在第12章才展现，但根据大纲应该在前期铺垫。需要修史的角色档案。",
    status: "approved",
    created_at: "2026-05-01T15:20:00",
  },
  {
    id: "retcon-3",
    target_type: "canon",
    target_ref: "修为体系规则",
    reason:
      "根据写到的章节推进，修炼体系产生了新的理解。原有规则「元婴期以上修炼者无法跨境战斗」与第25章的剧情冲突，需要修改正典规则。",
    status: "rejected",
    rejection_reason:
      "该规则已在第2卷多处使用，贸然修改会造成大面积内容不一致。建议在第3卷引入新的修炼分支规则来解决冲突，而非修改已有正典。",
    created_at: "2026-04-28T09:00:00",
  },
  {
    id: "retcon-4",
    target_type: "chapter",
    target_ref: "第18章",
    reason:
      "第18章中提到的「星辰剑法」与正典规则「法器体系」不完全兼容，需要回顾并修正该段落的描述。",
    status: "applied",
    created_at: "2026-04-25T14:15:00",
  },
  {
    id: "retcon-5",
    target_type: "character",
    target_ref: "萧云",
    reason:
      "萧云在第8章中展现的性格特质与之前在第2章的角色设定不一致。第2章中设定他为冷峻寡言的剑客，但第8章中他表现得过于热情，需要修史统一性格线。",
    status: "pending",
    created_at: "2026-05-03T08:45:00",
  },
];

// ─── create form sub-component ───

function CreateRetconForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { target_type: string; target_ref: string; reason: string }) => void;
}) {
  const [targetType, setTargetType] = useState("chapter");
  const [targetRef, setTargetRef] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!targetRef.trim() || !reason.trim()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 400));
    onSubmit({ target_type: targetType, target_ref: targetRef.trim(), reason: reason.trim() });
    setSubmitting(false);
  };

  const isValid = targetRef.trim().length > 0 && reason.trim().length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <Plus size={16} className="text-indigo-600" />
          新建修史申请
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>

      <div className="space-y-4">
        {/* Target type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">修史对象类型</label>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="chapter">章节</option>
            <option value="character">角色</option>
            <option value="canon">正典规则</option>
          </select>
        </div>

        {/* Target ref */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">修史对象</label>
          <input
            type="text"
            value={targetRef}
            onChange={(e) => setTargetRef(e.target.value)}
            placeholder={
              targetType === "chapter"
                ? "如: 第3章"
                : targetType === "character"
                  ? "如: 柳如烟"
                  : "如: 修为体系规则"
            }
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        {/* Reason */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">修史原因</label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="描述需要修史的原因，引用涉及的章节、角色或正典规则..."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          />
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className={`px-4 py-1.5 text-sm rounded-lg text-white flex items-center gap-1.5 transition-colors ${
              isValid && !submitting
                ? "bg-indigo-600 hover:bg-indigo-700"
                : "bg-indigo-300 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                提交中...
              </>
            ) : (
              "提交申请"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── rejection dialog ───

function RejectionDialog({
  request,
  onClose,
  onConfirm,
}: {
  request: RetconRequest;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 300));
    onConfirm(reason.trim());
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={submitting ? undefined : onClose} />
      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md mx-4 p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-red-50">
              <XCircle size={16} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">拒绝修史申请</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                拒绝{" "}
                {request.target_type === "chapter"
                  ? "章节"
                  : request.target_type === "character"
                    ? "角色"
                    : "正典"}
                : {request.target_ref}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            拒绝原因 <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="请填写拒绝原因，帮助申请人理解修改方向..."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
            disabled={submitting}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!reason.trim() || submitting}
            className={`px-4 py-1.5 text-sm rounded-lg text-white flex items-center gap-1.5 transition-colors ${
              reason.trim() && !submitting
                ? "bg-red-600 hover:bg-red-700"
                : "bg-red-300 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                处理中...
              </>
            ) : (
              <>
                <XCircle size={14} />
                确认拒绝
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── filter tabs ───

const FILTER_OPTIONS: { key: FilterStatus; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待审批" },
  { key: "approved", label: "已批准" },
  { key: "rejected", label: "已拒绝" },
  { key: "applied", label: "已应用" },
];

function FilterTabs({
  active,
  counts,
  onChange,
}: {
  active: FilterStatus;
  counts: Record<FilterStatus, number>;
  onChange: (f: FilterStatus) => void;
}) {
  return (
    <div className="flex items-center gap-1 mb-4 p-1 bg-gray-100 rounded-lg">
      {FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            active === opt.key
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
          }`}
        >
          <span>{opt.label}</span>
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full ${
              active === opt.key ? "bg-indigo-100 text-indigo-700" : "bg-gray-200 text-gray-500"
            }`}
          >
            {counts[opt.key] ?? 0}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── request card sub-component ───

function RetconCard({
  request,
  onApprove,
  onReject,
  onViewImpact,
  onExecute,
}: {
  request: RetconRequest;
  onApprove: (id: string) => void;
  onReject: (req: RetconRequest) => void;
  onViewImpact: (id: string) => void;
  onExecute: (id: string) => void;
}) {
  const IconComponent = targetTypeIcon[request.target_type] || FileText;
  const reasonPreview =
    request.reason.length > 120 ? request.reason.slice(0, 120) + "..." : request.reason;

  const createdDate = new Date(request.created_at).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-indigo-50 shrink-0">
            <IconComponent size={14} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <span className="text-xs text-gray-400">{targetTypeLabel[request.target_type]}</span>
            <h4 className="text-sm font-medium text-gray-900 truncate">{request.target_ref}</h4>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0 ml-2 ${statusBadgeClass(request.status)}`}
        >
          {statusIcon(request.status)}
          {statusLabel(request.status)}
        </span>
      </div>

      {/* Reason preview */}
      <p className="text-xs text-gray-600 leading-relaxed mb-3 flex-1">{reasonPreview}</p>

      {/* Rejection reason */}
      {request.status === "rejected" && request.rejection_reason && (
        <div className="mb-3 p-2 rounded bg-red-50 border border-red-100">
          <span className="text-[10px] font-medium text-red-500 flex items-center gap-1 mb-0.5">
            <MessageSquareText size={10} />
            拒绝原因
          </span>
          <p className="text-xs text-red-700 leading-relaxed">
            {request.rejection_reason.length > 100
              ? request.rejection_reason.slice(0, 100) + "..."
              : request.rejection_reason}
          </p>
        </div>
      )}

      {/* Footer: date + actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className="flex items-center gap-1 text-[10px] text-gray-400">
          <Clock size={10} />
          {createdDate}
        </span>
        <div className="flex items-center gap-1">
          {/* View impact — always available */}
          <button
            onClick={() => onViewImpact(request.id)}
            className="flex items-center gap-1 text-[11px] text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 transition-colors"
          >
            <Search size={11} />
            查看影响
          </button>

          {/* Approve — only for pending */}
          {request.status === "pending" && (
            <>
              <button
                onClick={() => onApprove(request.id)}
                className="flex items-center gap-1 text-[11px] text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50 transition-colors font-medium"
              >
                <CheckCircle2 size={11} />
                批准
              </button>
              <button
                onClick={() => onReject(request)}
                className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
              >
                <XCircle size={11} />
                拒绝
              </button>
            </>
          )}

          {/* Execute — only for approved */}
          {request.status === "approved" && (
            <button
              onClick={() => onExecute(request.id)}
              className="flex items-center gap-1 text-[11px] text-green-600 hover:text-green-800 px-2 py-1 rounded hover:bg-green-50 transition-colors font-medium"
            >
              <Play size={11} />
              执行修史
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── main page ───

export function RetconPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<RetconRequest[]>(MOCK_REQUESTS);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // Rejection dialog state
  const [rejectingRequest, setRejectingRequest] = useState<RetconRequest | null>(null);

  // Future: fetch from API
  // useEffect(() => {
  //   retconApi.list().then(setRequests).catch(() => setRequests(MOCK_REQUESTS));
  // }, []);

  // ─── handlers ───

  const handleCreate = (data: { target_type: string; target_ref: string; reason: string }) => {
    const newReq: RetconRequest = {
      id: `retcon-${Date.now()}`,
      target_type: data.target_type as RetconRequest["target_type"],
      target_ref: data.target_ref,
      reason: data.reason,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    setRequests((prev) => [newReq, ...prev]);
    setShowCreateForm(false);
    setSuccessMsg("修史申请已提交");
    setTimeout(() => setSuccessMsg(null), 3000);
    // Future: const result = await retconApi.create({ ... });
  };

  const handleApprove = (id: string) => {
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "approved" as const } : r)),
    );
    setSuccessMsg("申请已批准");
    setTimeout(() => setSuccessMsg(null), 3000);
    // Future: await retconApi.approve(id);
  };

  const handleReject = (reason: string) => {
    if (!rejectingRequest) return;
    setRequests((prev) =>
      prev.map((r) =>
        r.id === rejectingRequest.id
          ? { ...r, status: "rejected" as const, rejection_reason: reason }
          : r,
      ),
    );
    setRejectingRequest(null);
    setSuccessMsg("申请已拒绝");
    setTimeout(() => setSuccessMsg(null), 3000);
    // Future: await retconApi.reject(rejectingRequest.id, reason);
  };

  const handleViewImpact = (retconId: string) => {
    navigate(`/project/${projectId}/retcon/${retconId}/impact`);
  };

  const handleExecute = (retconId: string) => {
    navigate(`/project/${projectId}/retcon/${retconId}/execute`);
  };

  // ─── filtered list ───

  const filteredRequests = useMemo(() => {
    if (filterStatus === "all") return requests;
    return requests.filter((r) => r.status === filterStatus);
  }, [requests, filterStatus]);

  // ─── stats ───

  const stats = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      applied: requests.filter((r) => r.status === "applied").length,
    };
  }, [requests]);

  const filterCounts: Record<FilterStatus, number> = useMemo(() => {
    return {
      all: requests.length,
      pending: stats.pending,
      approved: stats.approved,
      rejected: stats.rejected,
      applied: stats.applied,
    };
  }, [requests, stats]);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6">
        {/* Success toast */}
        {successMsg && (
          <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 size={14} />
            {successMsg}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <History size={22} className="text-indigo-600" />
              修史申请
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              管理对已有内容的修订请求：章节修史、角色修史、正典规则修史
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            disabled={showCreateForm}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg transition-colors ${
              showCreateForm
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            <Plus size={16} />
            新建申请
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{stats.all}</div>
            <div className="text-xs text-gray-500">总申请数</div>
          </div>
          <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-3 text-center">
            <div className="text-lg font-bold text-yellow-700">{stats.pending}</div>
            <div className="text-xs text-yellow-600">待审批</div>
          </div>
          <div className="bg-blue-50 rounded-lg border border-blue-200 p-3 text-center">
            <div className="text-lg font-bold text-blue-700">{stats.approved}</div>
            <div className="text-xs text-blue-600">已批准</div>
          </div>
          <div className="bg-red-50 rounded-lg border border-red-200 p-3 text-center">
            <div className="text-lg font-bold text-red-700">{stats.rejected}</div>
            <div className="text-xs text-red-600">已拒绝</div>
          </div>
          <div className="bg-green-50 rounded-lg border border-green-200 p-3 text-center">
            <div className="text-lg font-bold text-green-700">{stats.applied}</div>
            <div className="text-xs text-green-600">已应用</div>
          </div>
        </div>

        {/* Filter tabs */}
        <FilterTabs active={filterStatus} counts={filterCounts} onChange={setFilterStatus} />

        {/* Create form */}
        {showCreateForm && (
          <CreateRetconForm onClose={() => setShowCreateForm(false)} onSubmit={handleCreate} />
        )}

        {/* Empty state */}
        {filteredRequests.length === 0 && !showCreateForm ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <History size={40} className="text-gray-300" />
            <p className="text-sm">
              {filterStatus === "all"
                ? "暂无修史申请"
                : `暂无${FILTER_OPTIONS.find((f) => f.key === filterStatus)?.label ?? ""}的申请`}
            </p>
            <p className="text-xs">点击「新建申请」创建一个新的修史请求</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredRequests.map((req) => (
              <RetconCard
                key={req.id}
                request={req}
                onApprove={handleApprove}
                onReject={setRejectingRequest}
                onViewImpact={handleViewImpact}
                onExecute={handleExecute}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rejection dialog */}
      {rejectingRequest && (
        <RejectionDialog
          request={rejectingRequest}
          onClose={() => setRejectingRequest(null)}
          onConfirm={handleReject}
        />
      )}
    </div>
  );
}
