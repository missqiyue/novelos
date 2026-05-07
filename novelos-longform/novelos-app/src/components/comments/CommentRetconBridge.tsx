import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  MessageSquareText,
  FileText,
  Users,
  ScrollText,
  AlertTriangle,
  History,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ExternalLink,
  ThumbsDown,
  ThumbsUp,
  Minus,
  ArrowRight,
} from "lucide-react";
import { useCommentsStore, type ImportedComment } from "../../stores";
import { retconApi, type RetconRequestInfo } from "../../lib/api";

// ─── Helpers ───

function detectTargetType(comment: ImportedComment): "chapter" | "character" | "canon" {
  const text = comment.content;
  // Detect chapter: mentions "第X章" or "章节"
  if (/第\s*\d+\s*章/.test(text) || /章节/.test(text)) {
    return "chapter";
  }
  // Detect character: it's about a person/role name pattern
  if (/角色/.test(text) || /人物/.test(text) || /性格/.test(text) || /人设/.test(text)) {
    return "character";
  }
  // Detect canon rules
  if (
    /规则/.test(text) ||
    /设定/.test(text) ||
    /体系/.test(text) ||
    /世界观/.test(text) ||
    /正典/.test(text)
  ) {
    return "canon";
  }
  // Default to chapter as most common target
  return "chapter";
}

function detectTargetRef(comment: ImportedComment, targetType: string): string {
  if (targetType === "chapter") {
    const match = comment.content.match(/第\s*(\d+)\s*章/);
    if (match) {
      return `第${match[1]}章`;
    }
    return "相关章节";
  }
  if (targetType === "character") {
    // Try to extract character name patterns (Chinese names are typically 2-4 chars)
    const nameMatch = comment.content.match(/(?:角色|人物|人设)[：:]\s*([一-鿿]{2,4})/);
    if (nameMatch) {
      return nameMatch[1];
    }
    return "相关角色";
  }
  // canon
  const ruleMatch = comment.content.match(/(?:规则|设定)[：:]\s*([一-鿿]{2,8})/);
  if (ruleMatch) {
    return ruleMatch[1];
  }
  return "相关规则";
}

function sentimentIcon(sentiment: string) {
  switch (sentiment) {
    case "positive":
      return <ThumbsUp size={12} />;
    case "negative":
      return <ThumbsDown size={12} />;
    case "mixed":
      return <Minus size={12} />;
    default:
      return <MessageSquareText size={12} />;
  }
}

function sentimentBadgeClass(sentiment: string): string {
  switch (sentiment) {
    case "positive":
      return "bg-green-100 text-green-700";
    case "negative":
      return "bg-red-100 text-red-700";
    case "mixed":
      return "bg-yellow-100 text-yellow-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function sentimentLabel(sentiment: string): string {
  switch (sentiment) {
    case "positive":
      return "正面";
    case "negative":
      return "负面";
    case "mixed":
      return "中性";
    default:
      return "未标记";
  }
}

// ─── Retcon request form sub-component ───

interface PrefillData {
  target_type: "chapter" | "character" | "canon";
  target_ref: string;
  reason: string;
}

function RetconRequestForm({
  prefill,
  comment,
  onClose,
  onSuccess,
}: {
  prefill: PrefillData;
  comment: ImportedComment;
  onClose: () => void;
  onSuccess: (retcon: RetconRequestInfo) => void;
}) {
  const [targetType, setTargetType] = useState(prefill.target_type);
  const [targetRef, setTargetRef] = useState(prefill.target_ref);
  const [reason, setReason] = useState(prefill.reason);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!targetRef.trim() || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await retconApi.create({
        target_type: targetType,
        target_ref: targetRef.trim(),
        reason: reason.trim(),
      });
      onSuccess(result);
    } catch (e: any) {
      setError(e?.toString() || "提交修史申请失败");
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = targetRef.trim().length > 0 && reason.trim().length > 0;

  const targetTypeLabel: Record<string, string> = {
    chapter: "章节",
    character: "角色",
    canon: "正典规则",
  };

  return (
    <div className="bg-white rounded-lg border border-indigo-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <History size={16} className="text-indigo-600" />
          创建修史申请
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
        >
          <XCircle size={16} />
        </button>
      </div>

      {/* Source comment preview */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-gray-400">来源评论</span>
          <span
            className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${sentimentBadgeClass(comment.sentiment)}`}
          >
            {sentimentIcon(comment.sentiment)}
            {sentimentLabel(comment.sentiment)}
          </span>
        </div>
        <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{comment.content}</p>
      </div>

      <div className="space-y-3 mb-4">
        {/* Target type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">修史对象类型</label>
          <select
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as typeof targetType)}
            disabled={submitting}
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
            disabled={submitting}
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
            disabled={submitting}
            rows={4}
            placeholder="描述需要修史的原因..."
            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
          />
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-600">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={submitting}
          className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg text-white transition-colors ${
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
            <>
              <Send size={14} />
              提交修史申请
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Comment card sub-component ───

function CommentCard({
  comment,
  onBridge,
  active,
}: {
  comment: ImportedComment;
  onBridge: (comment: ImportedComment) => void;
  active: boolean;
}) {
  const isNegative = comment.sentiment === "negative";
  const isMixed = comment.sentiment === "mixed";

  const contentPreview =
    comment.content.length > 200 ? comment.content.slice(0, 200) + "..." : comment.content;

  const detectedTarget = useMemo(() => {
    const tt = detectTargetType(comment);
    const tr = detectTargetRef(comment, tt);
    return { type: tt, ref: tr };
  }, [comment]);

  return (
    <div
      className={`bg-white rounded-lg border p-4 transition-colors ${
        active
          ? "border-indigo-500 ring-1 ring-indigo-500"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${sentimentBadgeClass(comment.sentiment)}`}
          >
            {sentimentIcon(comment.sentiment)}
            {sentimentLabel(comment.sentiment)}
          </span>
          {comment.sentiment === "negative" && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">
              <AlertTriangle size={10} />
              可修史
            </span>
          )}
        </div>
        {!active && (isNegative || isMixed) && (
          <button
            onClick={() => onBridge(comment)}
            className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded hover:bg-indigo-50 transition-colors font-medium"
          >
            <History size={12} />
            创建修史申请
          </button>
        )}
      </div>

      {/* Content */}
      <p className="text-sm text-gray-700 leading-relaxed mb-3">{contentPreview}</p>

      {/* Detected target hint */}
      <div className="flex items-center gap-3 text-[10px] text-gray-400">
        <span className="flex items-center gap-1">
          {detectedTarget.type === "chapter" ? (
            <FileText size={10} />
          ) : detectedTarget.type === "character" ? (
            <Users size={10} />
          ) : (
            <ScrollText size={10} />
          )}
          {detectedTarget.type === "chapter"
            ? "章节"
            : detectedTarget.type === "character"
              ? "角色"
              : "正典规则"}
        </span>
        <span className="flex items-center gap-1">
          <ArrowRight size={10} />
          {detectedTarget.ref}
        </span>
      </div>
    </div>
  );
}

// ─── Success banner ───

function SuccessBanner({
  retcon,
  projectId,
  onDismiss,
  onView,
}: {
  retcon: RetconRequestInfo;
  projectId: string;
  onDismiss: () => void;
  onView: () => void;
}) {
  const navigate = useNavigate();

  return (
    <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-green-800">修史申请已提交</p>
          <p className="text-xs text-green-600 mt-0.5">
            {retcon.target_type === "chapter"
              ? "章节"
              : retcon.target_type === "character"
                ? "角色"
                : "正典"}
            : {retcon.target_ref} - 状态: {retcon.status === "pending" ? "待审批" : retcon.status}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => {
                onDismiss();
                navigate(`/project/${projectId}/retcon-workflow/${retcon.id}`);
              }}
              className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 bg-green-100 hover:bg-green-200 px-2 py-1 rounded transition-colors font-medium"
            >
              <ExternalLink size={10} />
              查看工作流
            </button>
            <button
              onClick={onDismiss}
              className="text-xs text-green-600 hover:text-green-800 underline"
            >
              关闭
            </button>
          </div>
        </div>
        <button onClick={onDismiss} className="p-1 text-green-400 hover:text-green-600">
          <XCircle size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───

export function CommentRetconBridge() {
  const { projectId } = useParams<{ projectId: string }>();
  const { comments } = useCommentsStore();

  const [activeComment, setActiveComment] = useState<ImportedComment | null>(null);
  const [successRetcon, setSuccessRetcon] = useState<RetconRequestInfo | null>(null);

  // Filter: negative and mixed comments
  const actionableComments = useMemo(
    () => comments.filter((c) => c.sentiment === "negative" || c.sentiment === "mixed"),
    [comments],
  );

  const handleBridge = (comment: ImportedComment) => {
    setActiveComment(comment);
    // Scroll into view handled by the form appearing below
  };

  const handleCloseForm = () => {
    setActiveComment(null);
  };

  const handleSuccess = (retcon: RetconRequestInfo) => {
    setActiveComment(null);
    setSuccessRetcon(retcon);
    // Auto-dismiss success after 8 seconds
    setTimeout(() => setSuccessRetcon(null), 8000);
  };

  const prefillData = useMemo(() => {
    if (!activeComment) return null;
    const tt = detectTargetType(activeComment);
    const tr = detectTargetRef(activeComment, tt);
    return {
      target_type: tt,
      target_ref: tr,
      reason: activeComment.content,
    };
  }, [activeComment]);

  // ─── Empty state for no comments ───

  if (comments.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-6">
            <MessageSquareText size={22} className="text-indigo-600" />
            评论-修史桥梁
          </h1>
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <MessageSquareText size={40} className="text-gray-300" />
            <p className="text-sm">暂无评论数据</p>
            <p className="text-xs">
              请先在评论导入页面导入读者评论，系统将自动识别可转为修史申请的评论
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty state for no actionable comments ───

  if (actionableComments.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-6">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-6">
            <MessageSquareText size={22} className="text-indigo-600" />
            评论-修史桥梁
          </h1>
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <ThumbsUp size={40} className="text-green-300" />
            <p className="text-sm">当前评论均为正面评价，无需修史</p>
            <p className="text-xs">导入包含负面或中性意见的评论后，可以将其转为修史申请</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main render ───

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 max-w-3xl mx-auto w-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquareText size={22} className="text-indigo-600" />
            评论-修史桥梁
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            将读者评论中的负面/中性意见转化为修史申请，一键提交
          </p>
        </div>

        {/* Success banner */}
        {successRetcon && projectId && (
          <SuccessBanner
            retcon={successRetcon}
            projectId={projectId}
            onDismiss={() => setSuccessRetcon(null)}
            onView={() => {}}
          />
        )}

        {/* Stats */}
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-xs text-gray-500">可转化评论</span>
            <span className="text-sm font-bold text-indigo-600 ml-1">
              {actionableComments.length}
            </span>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
            <span className="text-xs text-gray-500">总评论数</span>
            <span className="text-sm font-bold text-gray-900 ml-1">{comments.length}</span>
          </div>
        </div>

        {/* Comment list */}
        <div className="space-y-3">
          {actionableComments.map((comment) => (
            <div key={comment.id}>
              <CommentCard
                comment={comment}
                onBridge={handleBridge}
                active={activeComment?.id === comment.id}
              />

              {/* Inline form for active comment */}
              {activeComment?.id === comment.id && prefillData && (
                <div className="mt-3 ml-4 border-l-2 border-indigo-200 pl-4">
                  <RetconRequestForm
                    prefill={prefillData}
                    comment={comment}
                    onClose={handleCloseForm}
                    onSuccess={handleSuccess}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info footer */}
        <div className="mt-8 p-4 bg-indigo-50 rounded-lg border border-indigo-100">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="text-indigo-500 mt-0.5 shrink-0" />
            <div className="text-xs text-indigo-700">
              <p className="font-medium mb-1">智能检测说明</p>
              <ul className="space-y-0.5 text-indigo-600">
                <li>评论包含「第X章」或「章节」关键字时，自动识别为章节修史</li>
                <li>评论包含「角色」「人物」「性格」「人设」关键字时，自动识别为角色修史</li>
                <li>评论包含「规则」「设定」「体系」「世界观」关键字时，自动识别为正典修史</li>
                <li>当前仅展示负面和中性评论（正面评价不触发修史流程）</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
