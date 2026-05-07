import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChapterStore, useProjectStore } from "../../stores";
import { chapterApi, projectApi, compilerApi } from "../../lib/api";
import type { ChapterInfo } from "../../lib/api";
import {
  CheckSquare,
  Square,
  FileText,
  CheckCircle,
  Download,
  Trash2,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Filter,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

type FilterStatus = "all" | "drafting" | "finalized" | "compile_failed";

const filterOptions: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "drafting", label: "草稿中" },
  { value: "finalized", label: "已定稿" },
  { value: "compile_failed", label: "编译失败" },
];

type SortField = "number" | "words" | "status";
type SortDir = "asc" | "desc";

export function BatchOperationsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { chapters, fetchChapters, loading, error } = useChapterStore();
  const { project, fetch: fetchProject, switchProject } = useProjectStore();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortField, setSortField] = useState<SortField>("number");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [actionLabel, setActionLabel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResults, setActionResults] = useState<{ success: number; failed: number } | null>(
    null,
  );

  // Initialize
  useEffect(() => {
    const init = async () => {
      if (projectId && project?.id !== projectId) {
        await switchProject(projectId);
      }
      if (!project) {
        await fetchProject();
      }
      await fetchChapters();
    };
    init();
  }, [projectId]);

  // Filtered and sorted chapters
  const filteredChapters = useMemo(() => {
    let result = [...chapters];
    if (filterStatus !== "all") {
      result = result.filter((ch) => ch.status === filterStatus);
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "number":
          cmp = a.chapter_number - b.chapter_number;
          break;
        case "words":
          cmp = (a.word_count || 0) - (b.word_count || 0);
          break;
        case "status":
          cmp = (a.status || "").localeCompare(b.status || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [chapters, filterStatus, sortField, sortDir]);

  const selectedChapters = useMemo(() => {
    return filteredChapters.filter((ch) => selectedIds.has(ch.id));
  }, [filteredChapters, selectedIds]);

  // Toggle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // Select all / deselect all
  const handleSelectAll = () => {
    if (selectedIds.size === filteredChapters.length && filteredChapters.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredChapters.map((ch) => ch.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Clear state before each action
  const resetActionState = (label: string, total: number) => {
    setProcessing(true);
    setActionLabel(label);
    setProgress({ current: 0, total });
    setActionError(null);
    setActionResults(null);
    setConfirmDelete(false);
  };

  // Run batch action
  const runBatchAction = useCallback(
    async (label: string, action: (ch: ChapterInfo) => Promise<void>) => {
      const list = selectedChapters;
      if (list.length === 0) return;
      resetActionState(label, list.length);
      let success = 0;
      let failed = 0;
      for (let i = 0; i < list.length; i++) {
        try {
          await action(list[i]);
          success++;
        } catch {
          failed++;
        }
        setProgress({ current: i + 1, total: list.length });
      }
      setActionResults({ success, failed });
      setProcessing(false);
      await fetchChapters();
      setSelectedIds(new Set());
    },
    [selectedChapters, fetchChapters],
  );

  // Batch compile
  const handleBatchCompile = () => {
    runBatchAction("批量编译", async (ch) => {
      const draftText = ch.draft_text || "";
      if (!draftText.trim()) return; // skip chapters with no draft
      await compilerApi.compile(ch.chapter_number, draftText);
    });
  };

  // Batch finalize
  const handleBatchFinalize = () => {
    runBatchAction("批量定稿", async (ch) => {
      await chapterApi.finalize(ch.chapter_number);
    });
  };

  // Batch export
  const handleBatchExport = async () => {
    const list = selectedChapters;
    if (list.length === 0) return;
    resetActionState("批量导出", list.length);
    let success = 0;
    let failed = 0;
    try {
      // Use project-level export if available
      await projectApi.exportTxt(projectId || "");
      success = list.length;
    } catch {
      failed = list.length;
    }
    setProgress({ current: list.length, total: list.length });
    setActionResults({ success, failed });
    setProcessing(false);
  };

  // Batch delete
  const handleBatchDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const list = selectedChapters;
    if (list.length === 0) return;
    resetActionState("批量删除", list.length);
    let success = 0;
    let failed = 0;
    for (let i = 0; i < list.length; i++) {
      try {
        // Delete by transitioning to archived or via available method
        await chapterApi.transitionState(list[i].chapter_number, "archived");
        success++;
      } catch {
        failed++;
      }
      setProgress({ current: i + 1, total: list.length });
    }
    setActionResults({ success, failed });
    setProcessing(false);
    await fetchChapters();
    setSelectedIds(new Set());
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  // ─── Status badge ───
  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      task_ready: { label: "待开始", cls: "bg-gray-100 text-gray-600" },
      drafting: { label: "草稿中", cls: "bg-yellow-100 text-yellow-700" },
      draft_done: { label: "草稿完成", cls: "bg-blue-100 text-blue-700" },
      draft_generated: { label: "已生成", cls: "bg-blue-100 text-blue-700" },
      reviewing: { label: "审阅中", cls: "bg-purple-100 text-purple-700" },
      compile_failed: { label: "编译失败", cls: "bg-red-100 text-red-700" },
      approved: { label: "已批准", cls: "bg-green-100 text-green-700" },
      finalized: { label: "已定稿", cls: "bg-green-100 text-green-700" },
      archived: { label: "已归档", cls: "bg-gray-100 text-gray-500" },
    };
    const info = map[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${info.cls}`}>{info.label}</span>
    );
  };

  // ─── Render ───
  if (loading && chapters.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/project/${projectId}/dashboard`)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="返回"
          >
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">批量操作</h1>
          <span className="text-sm text-gray-400">{chapters.length} 章</span>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {filterOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterStatus === opt.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Batch actions bar */}
      {selectedIds.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-indigo-700">已选 {selectedIds.size} 章</span>
          <div className="flex-1" />
          {processing ? (
            <div className="flex items-center gap-2 text-sm text-indigo-600">
              <Loader2 size={16} className="animate-spin" />
              <span>{actionLabel}</span>
              <span>
                正在处理 {progress.current}/{progress.total}...
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleBatchCompile}
                disabled={processing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <FileText size={14} />
                批量编译
              </button>
              <button
                onClick={handleBatchFinalize}
                disabled={processing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                <CheckCircle size={14} />
                批量定稿
              </button>
              <button
                onClick={handleBatchExport}
                disabled={processing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Download size={14} />
                批量导出
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={processing}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  confirmDelete
                    ? "bg-red-600 text-white hover:bg-red-700"
                    : "bg-white border border-red-300 text-red-600 hover:bg-red-50"
                }`}
              >
                <Trash2 size={14} />
                {confirmDelete ? "确认删除" : "批量删除"}
                {confirmDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(false);
                    }}
                    className="ml-1 p-0.5 hover:bg-red-500 rounded"
                  >
                    <X size={12} />
                  </button>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action results */}
      {actionResults && (
        <div
          className={`rounded-lg p-3 text-sm ${
            actionResults.failed === 0
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-yellow-50 border border-yellow-200 text-yellow-700"
          }`}
        >
          {actionLabel}完成: 成功 {actionResults.success} 章
          {actionResults.failed > 0 && `，失败 ${actionResults.failed} 章`}
          <button onClick={() => setActionResults(null)} className="ml-3 underline text-xs">
            关闭
          </button>
        </div>
      )}

      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={14} />
          {actionError}
        </div>
      )}

      {/* Table */}
      {filteredChapters.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
          <FileText size={32} />
          <p className="text-sm">
            {filterStatus !== "all" ? "没有符合条件的章节" : "暂无章节数据"}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-12 px-3 py-2.5">
                    <button
                      onClick={handleSelectAll}
                      className="text-gray-400 hover:text-indigo-600 transition-colors"
                      title={selectedIds.size === filteredChapters.length ? "取消全选" : "全选"}
                    >
                      {selectedIds.size === filteredChapters.length &&
                      filteredChapters.length > 0 ? (
                        <CheckSquare size={18} className="text-indigo-600" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </th>
                  <th
                    className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort("number")}
                  >
                    <span className="flex items-center gap-1">章节 {sortIcon("number")}</span>
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500">标题</th>
                  <th
                    className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort("words")}
                  >
                    <span className="flex items-center gap-1">字数 {sortIcon("words")}</span>
                  </th>
                  <th
                    className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 cursor-pointer select-none hover:text-gray-700"
                    onClick={() => handleSort("status")}
                  >
                    <span className="flex items-center gap-1">状态 {sortIcon("status")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredChapters.map((ch) => {
                  const isSelected = selectedIds.has(ch.id);
                  return (
                    <tr
                      key={ch.id}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                        isSelected ? "bg-indigo-50/50" : ""
                      }`}
                      onClick={() => toggleSelect(ch.id)}
                    >
                      <td className="px-3 py-2.5">
                        {isSelected ? (
                          <CheckSquare size={18} className="text-indigo-600" />
                        ) : (
                          <Square size={18} className="text-gray-300" />
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        第{ch.chapter_number}章
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 max-w-xs truncate">
                        {ch.title || <span className="text-gray-300 italic">未命名</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">
                        {(ch.word_count || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5">{statusBadge(ch.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
            共 {filteredChapters.length} 章{selectedIds.size > 0 && `，已选 ${selectedIds.size} 章`}
          </div>
        </div>
      )}
    </div>
  );
}
