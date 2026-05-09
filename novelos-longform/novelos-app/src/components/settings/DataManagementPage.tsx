import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore, useChapterStore, useCharacterStore } from "../../stores";
import {
  backupApi,
  projectApi,
  ledgerApi,
  type BackupInfo,
  type LedgerSummary,
} from "../../lib/api";
import {
  Database,
  HardDrive,
  FileText,
  Users,
  Shield,
  BookMarked,
  Download,
  Trash2,
  PlusCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  ChevronDown,
  Clock,
} from "lucide-react";

// ─── Types ───

type ExportFormat = "txt" | "md" | "docx" | "epub" | "pdf";

interface DataStats {
  dbSizeEstimate: string;
  chapterCount: number;
  characterCount: number;
  backupCount: number;
  latestBackupDate: string | null;
  ledgerSummary: LedgerSummary | null;
}

// ─── Component ───

export function DataManagementPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { project } = useProjectStore();
  const chapters = useChapterStore((s) => s.chapters);
  const fetchChapters = useChapterStore((s) => s.fetchChapters);
  const characters = useCharacterStore((s) => s.characters);
  const fetchCharacters = useCharacterStore((s) => s.fetch);

  // Data stats
  const [stats, setStats] = useState<DataStats>({
    dbSizeEstimate: "计算中...",
    chapterCount: 0,
    characterCount: 0,
    backupCount: 0,
    latestBackupDate: null,
    ledgerSummary: null,
  });

  // Backups
  const [backups, setBackups] = useState<BackupInfo[]>([]);

  // Action states
  const [backingUp, setBackingUp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [creatingSample, setCreatingSample] = useState(false);

  // Confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Restore
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupInfo | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  const showFeedback = useCallback((type: "success" | "error", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  // ─── Load store data on mount ───
  useEffect(() => {
    fetchChapters();
    fetchCharacters();
  }, [fetchChapters, fetchCharacters]);

  // ─── Compute stats when chapters/characters are loaded ───
  useEffect(() => {
    let cancelled = false;

    const computeStats = async () => {
      try {
        const backupList = await backupApi.list().catch(() => [] as BackupInfo[]);
        if (cancelled) return;
        setBackups(backupList);

        let summary: LedgerSummary | null = null;
        try {
          summary = await ledgerApi.getSummary();
        } catch {
          // ledger may not be available
        }
        if (cancelled) return;

        // Estimate DB size from backup files
        let dbSizeEstimate = "未知";
        if (backupList.length > 0) {
          const avgSize = backupList.reduce((sum, b) => sum + b.size_bytes, 0) / backupList.length;
          if (avgSize < 1024) {
            dbSizeEstimate = `${avgSize.toFixed(0)} B`;
          } else if (avgSize < 1024 * 1024) {
            dbSizeEstimate = `${(avgSize / 1024).toFixed(1)} KB`;
          } else {
            dbSizeEstimate = `${(avgSize / (1024 * 1024)).toFixed(1)} MB`;
          }
        }

        setStats({
          dbSizeEstimate,
          chapterCount: chapters.length,
          characterCount: characters.length,
          backupCount: backupList.length,
          latestBackupDate:
            backupList.length > 0 ? backupList[backupList.length - 1].created_at : null,
          ledgerSummary: summary,
        });
      } catch {
        if (!cancelled) {
          setStats((prev) => ({ ...prev, dbSizeEstimate: "不可用" }));
        }
      }
    };

    computeStats();
    return () => {
      cancelled = true;
    };
  }, [chapters, characters]);

  // ─── Actions ───

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const result = await backupApi.create();
      showFeedback("success", `备份完成: ${(result.size_bytes / 1024).toFixed(1)} KB`);
      // Refresh backup list
      const list = await backupApi.list().catch(() => [] as BackupInfo[]);
      setBackups(list);
      setStats((prev) => ({
        ...prev,
        backupCount: list.length,
        latestBackupDate: list.length > 0 ? list[list.length - 1].created_at : null,
      }));
    } catch (e: any) {
      showFeedback("error", `备份失败: ${e}`);
    }
    setBackingUp(false);
  };

  const handleExport = async (format: ExportFormat) => {
    if (!projectId) return;
    setExportOpen(false);
    setExporting(true);
    try {
      switch (format) {
        case "txt":
          await projectApi.exportTxt(projectId);
          break;
        case "md":
          await projectApi.exportMd(projectId);
          break;
        case "docx":
          await projectApi.exportDocx(projectId);
          break;
        case "epub":
          await projectApi.exportEpub(projectId);
          break;
        case "pdf":
          await projectApi.exportPdf(projectId);
          break;
      }
      showFeedback("success", `${format.toUpperCase()} 导出已开始`);
    } catch (e: any) {
      showFeedback("error", `导出失败: ${e}`);
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    if (!projectId) return;
    setDeleting(true);
    try {
      await projectApi.delete(projectId);
      setShowDeleteConfirm(false);
      navigate("/", { replace: true });
    } catch (e: any) {
      showFeedback("error", `删除失败: ${e}`);
      setShowDeleteConfirm(false);
    }
    setDeleting(false);
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await backupApi.restore(restoreTarget.path);
      showFeedback("success", "已恢复到选定备份，安全备份已自动创建");
      setShowRestoreConfirm(false);
      setRestoreTarget(null);
      // Refresh all data
      fetchChapters();
      fetchCharacters();
      const list = await backupApi.list().catch(() => [] as BackupInfo[]);
      setBackups(list);
    } catch (e: any) {
      showFeedback("error", `恢复失败: ${e}`);
      setShowRestoreConfirm(false);
      setRestoreTarget(null);
    }
    setRestoring(false);
  };

  const handleCreateSample = async () => {
    setCreatingSample(true);
    try {
      const result = await projectApi.createSample();
      showFeedback(
        "success",
        `示例项目已创建: "${result.title}" (${result.volumes_created}卷, ${result.chapters_created}章, ${result.characters_created}角色)`,
      );
    } catch (e: any) {
      showFeedback("error", `创建失败: ${e}`);
    }
    setCreatingSample(false);
  };

  // ─── Helpers ───

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("zh-CN");
    } catch {
      return iso;
    }
  };

  // ─── Render ───

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Database size={20} className="text-indigo-600" />
          数据管理
        </h2>
        {feedback && (
          <span
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
              feedback.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle size={12} /> : <XCircle size={12} />}
            {feedback.message}
          </span>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard
          icon={<HardDrive size={16} />}
          label="数据库大小 (估算)"
          value={stats.dbSizeEstimate}
          color="indigo"
        />
        <StatCard
          icon={<Clock size={16} />}
          label="备份数量"
          value={`${stats.backupCount} 份`}
          color="amber"
        />
        <StatCard
          icon={<FileText size={16} />}
          label="章节数"
          value={String(stats.chapterCount)}
          color="green"
        />
        <StatCard
          icon={<Users size={16} />}
          label="角色数"
          value={String(stats.characterCount)}
          color="rose"
        />
        <StatCard
          icon={<Shield size={16} />}
          label="正典规则数"
          value={String(stats.ledgerSummary?.character_states_count ?? 0)}
          color="indigo"
        />
        <StatCard
          icon={<BookMarked size={16} />}
          label="最新备份"
          value={stats.latestBackupDate ? formatDate(stats.latestBackupDate) : "无备份"}
          color="green"
        />
      </div>

      {/* Ledger Summary (if available) */}
      {stats.ledgerSummary && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">账簿概览</h3>
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
            <span>角色状态: {stats.ledgerSummary.character_states_count}</span>
            <span>关系状态: {stats.ledgerSummary.relationship_states_count}</span>
            <span>时间线节点: {stats.ledgerSummary.timeline_nodes_count}</span>
            <span>事件节点: {stats.ledgerSummary.event_nodes_count}</span>
            <span>伏笔总数: {stats.ledgerSummary.foreshadow_items_count}</span>
            <span>已埋设: {stats.ledgerSummary.foreshadow_planted_count}</span>
            <span>已回收: {stats.ledgerSummary.foreshadow_resolved_count}</span>
            <span>已过期: {stats.ledgerSummary.foreshadow_overdue_count}</span>
            <span>能力物品: {stats.ledgerSummary.ability_items_count}</span>
          </div>
        </div>
      )}

      {/* Actions Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <h3 className="text-sm font-medium text-gray-700">操作</h3>

        {/* Backup */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">立即备份</p>
            <p className="text-xs text-gray-400">创建当前项目的数据快照</p>
          </div>
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {backingUp ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
            {backingUp ? "备份中..." : "立即备份"}
          </button>
        </div>

        {/* Backup History */}
        {backups.length > 0 && (
          <div className="max-h-28 overflow-auto bg-gray-50 rounded-lg p-2">
            <p className="text-xs text-gray-400 mb-1 px-1">历史备份 ({backups.length})</p>
            {backups.map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs text-gray-500 px-1 py-0.5"
              >
                <span>{b.created_at.replace("T", " ").slice(0, 19)}</span>
                <div className="flex items-center gap-2">
                  <span>{(b.size_bytes / 1024).toFixed(1)} KB</span>
                  <button
                    onClick={() => { setRestoreTarget(b); setShowRestoreConfirm(true); }}
                    className="text-indigo-600 hover:text-indigo-800 transition-colors"
                    title="恢复此备份"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <hr className="border-gray-100" />

        {/* Export */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">导出项目</p>
            <p className="text-xs text-gray-400">导出为不同格式</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {exporting ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {exporting ? "导出中..." : "导出项目"}
              <ChevronDown size={12} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                {(["txt", "md", "docx", "epub", "pdf"] as ExportFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleExport(fmt)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                  >
                    导出 {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <hr className="border-gray-100" />

        {/* Create Sample */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">创建示例项目</p>
            <p className="text-xs text-gray-400">生成带有示例数据的演示项目</p>
          </div>
          <button
            onClick={handleCreateSample}
            disabled={creatingSample}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {creatingSample ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <PlusCircle size={14} />
            )}
            {creatingSample ? "创建中..." : "创建示例"}
          </button>
        </div>

        <hr className="border-gray-100" />

        {/* Delete */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-600">删除项目</p>
            <p className="text-xs text-gray-400">永久删除本项目及其所有数据</p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors"
          >
            <Trash2 size={14} />
            删除项目
          </button>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && restoreTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <RefreshCw size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">确认恢复备份</h3>
                <p className="text-xs text-gray-500">当前数据将被覆盖</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              将项目数据恢复到 <strong>{restoreTarget.created_at.replace("T", " ").slice(0, 19)}</strong> 的备份状态。
            </p>
            <p className="text-xs text-gray-500 mb-6">
              系统将先自动创建当前状态的安全备份，以防需要回退。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRestoreConfirm(false); setRestoreTarget(null); }}
                disabled={restoring}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                {restoring ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {restoring ? "恢复中..." : "确认恢复"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">确认删除项目</h3>
                <p className="text-xs text-gray-500">此操作不可撤销</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              将永久删除项目 "<strong>{project?.title ?? "未命名"}</strong>" 及其所有关联数据:
            </p>
            <ul className="text-xs text-gray-500 list-disc list-inside mb-6 space-y-0.5">
              <li>全部章节及版本历史</li>
              <li>全部角色、地点、派系</li>
              <li>全部正典规则</li>
              <li>全部大纲、伏笔、时间线</li>
              <li>全部备份数据</li>
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StatCard ───

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "indigo" | "green" | "amber" | "rose";
}) {
  const colorClasses: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${colorClasses[color]}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 truncate">{label}</p>
        <p className="text-sm font-semibold text-gray-800 truncate">{value}</p>
      </div>
    </div>
  );
}
