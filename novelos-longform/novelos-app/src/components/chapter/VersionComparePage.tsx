import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { chapterApi } from "../../lib/api";
import type { ChapterVersionInfo } from "../../lib/api";
import { DiffViewer } from "../common/DiffViewer";
import {
  ArrowLeft,
  GitCompare,
  Loader2,
  AlertTriangle,
  FileText,
  Plus,
  Minus,
  Clock,
  Hash,
  Type,
} from "lucide-react";

interface VersionStats {
  added: number;
  removed: number;
  netChange: number;
}

function countWordDiff(oldText: string, newText: string): VersionStats {
  const oldWords = oldText.replace(/\s+/g, "").length;
  const newWords = newText.replace(/\s+/g, "").length;
  const diff = newWords - oldWords;
  return {
    added: diff > 0 ? diff : 0,
    removed: diff < 0 ? Math.abs(diff) : 0,
    netChange: diff,
  };
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

const contentTypeLabels: Record<string, string> = {
  draft: "草稿",
  final: "定稿",
  snapshot: "快照",
  rollback: "回滚",
};

export function VersionComparePage() {
  const { projectId, chapterNumber } = useParams();
  const navigate = useNavigate();
  const [versions, setVersions] = useState<ChapterVersionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedA, setSelectedA] = useState<string>("");
  const [selectedB, setSelectedB] = useState<string>("");

  const num = parseInt(chapterNumber || "1", 10);

  // Fetch versions
  useEffect(() => {
    const fetchVersions = async () => {
      setLoading(true);
      setError(null);
      try {
        const list = await chapterApi.listVersions(num);
        // Sort by version_no descending
        list.sort((a, b) => b.version_no - a.version_no);
        setVersions(list);
        // Auto-select: A = second latest (or latest if only one), B = latest
        if (list.length >= 2) {
          setSelectedA(list[1].id);
          setSelectedB(list[0].id);
        } else if (list.length === 1) {
          setSelectedA(list[0].id);
          setSelectedB(list[0].id);
        }
      } catch (e: any) {
        setError(e.toString());
      } finally {
        setLoading(false);
      }
    };
    fetchVersions();
  }, [num]);

  const versionA = useMemo(() => {
    return versions.find((v) => v.id === selectedA) || null;
  }, [versions, selectedA]);

  const versionB = useMemo(() => {
    return versions.find((v) => v.id === selectedB) || null;
  }, [versions, selectedB]);

  const diffStats = useMemo(() => {
    if (versionA && versionB) {
      return countWordDiff(versionA.content || "", versionB.content || "");
    }
    return null;
  }, [versionA, versionB]);

  // ─── Render helpers ───
  const versionOption = (v: ChapterVersionInfo) => {
    const ctLabel = contentTypeLabels[v.content_type] || v.content_type;
    return (
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-900">v{v.version_no}</span>
        <span className="text-xs text-gray-500">{ctLabel}</span>
        <span className="text-xs text-gray-400">
          {v.content ? v.content.replace(/\s+/g, "").length.toLocaleString() : 0}字
        </span>
      </div>
    );
  };

  // ─── Loading state ───
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Error state ───
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => navigate(`/project/${projectId}/dashboard`)}
          className="text-xs text-indigo-600 hover:underline"
        >
          返回工作台
        </button>
      </div>
    );
  }

  // ─── Empty state ───
  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <GitCompare size={32} className="text-gray-300" />
        <p className="text-sm text-gray-400">该章节暂无版本记录</p>
        <button
          onClick={() => navigate(`/project/${projectId}/chapter/${num}`)}
          className="text-xs text-indigo-600 hover:underline"
        >
          返回章节编辑
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/project/${projectId}/chapter/${num}`)}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="返回"
          >
            <ArrowLeft size={20} className="text-gray-500" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">版本对比</h1>
          <span className="text-sm text-gray-400">
            第{num}章 / {versions.length} 个版本
          </span>
        </div>
      </div>

      {/* Version selectors */}
      <div className="grid grid-cols-2 gap-4 shrink-0">
        {/* Version A */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">版本 A (旧版)</label>
          <select
            value={selectedA}
            onChange={(e) => setSelectedA(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_no} - {contentTypeLabels[v.content_type] || v.content_type} -{" "}
                {v.content ? v.content.replace(/\s+/g, "").length.toLocaleString() : 0}字
              </option>
            ))}
          </select>
          {versionA && (
            <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Hash size={12} /> v{versionA.version_no}
              </span>
              <span className="flex items-center gap-1">
                <Type size={12} />{" "}
                {contentTypeLabels[versionA.content_type] || versionA.content_type}
              </span>
              <span className="flex items-center gap-1">
                <FileText size={12} />{" "}
                {versionA.content
                  ? versionA.content.replace(/\s+/g, "").length.toLocaleString()
                  : 0}
                字
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> {formatDate(versionA.created_at)}
              </span>
            </div>
          )}
        </div>

        {/* Version B */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">版本 B (新版)</label>
          <select
            value={selectedB}
            onChange={(e) => setSelectedB(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_no} - {contentTypeLabels[v.content_type] || v.content_type} -{" "}
                {v.content ? v.content.replace(/\s+/g, "").length.toLocaleString() : 0}字
              </option>
            ))}
          </select>
          {versionB && (
            <div className="mt-1.5 flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Hash size={12} /> v{versionB.version_no}
              </span>
              <span className="flex items-center gap-1">
                <Type size={12} />{" "}
                {contentTypeLabels[versionB.content_type] || versionB.content_type}
              </span>
              <span className="flex items-center gap-1">
                <FileText size={12} />{" "}
                {versionB.content
                  ? versionB.content.replace(/\s+/g, "").length.toLocaleString()
                  : 0}
                字
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> {formatDate(versionB.created_at)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Diff stats */}
      {diffStats && (
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm shrink-0">
          <span className="font-medium text-gray-700">变更统计:</span>
          <span className="flex items-center gap-1 text-green-600">
            <Plus size={14} /> +{diffStats.added.toLocaleString()} 字
          </span>
          <span className="flex items-center gap-1 text-red-600">
            <Minus size={14} /> -{diffStats.removed.toLocaleString()} 字
          </span>
          <span className="flex items-center gap-1 text-gray-600">
            <GitCompare size={14} />
            净变化:{" "}
            <span
              className={
                diffStats.netChange > 0
                  ? "text-green-600"
                  : diffStats.netChange < 0
                    ? "text-red-600"
                    : "text-gray-600"
              }
            >
              {diffStats.netChange >= 0 ? "+" : ""}
              {diffStats.netChange.toLocaleString()} 字
            </span>
          </span>
        </div>
      )}

      {/* Diff view */}
      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden min-h-0">
        {versionA && versionB ? (
          <DiffViewer
            oldText={versionA.content || ""}
            newText={versionB.content || ""}
            oldLabel={`v${versionA.version_no} (${contentTypeLabels[versionA.content_type] || versionA.content_type})`}
            newLabel={`v${versionB.version_no} (${contentTypeLabels[versionB.content_type] || versionB.content_type})`}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            请选择两个版本进行对比
          </div>
        )}
      </div>

      {/* Version list summary */}
      <div className="shrink-0 border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600">
          所有版本 ({versions.length})
        </div>
        <div className="overflow-x-auto max-h-32 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-3 py-1.5">版本</th>
                <th className="px-3 py-1.5">类型</th>
                <th className="px-3 py-1.5">字数</th>
                <th className="px-3 py-1.5">时间</th>
                <th className="px-3 py-1.5">创建者</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {versions.map((v) => {
                const wordCount = v.content ? v.content.replace(/\s+/g, "").length : 0;
                const isA = v.id === selectedA;
                const isB = v.id === selectedB;
                return (
                  <tr key={v.id} className={`${isA || isB ? "bg-indigo-50" : "hover:bg-gray-50"}`}>
                    <td className="px-3 py-1.5 font-medium text-gray-900">
                      v{v.version_no}
                      {isA && <span className="ml-1 text-[10px] text-indigo-600">(A)</span>}
                      {isB && <span className="ml-1 text-[10px] text-indigo-600">(B)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">
                      {contentTypeLabels[v.content_type] || v.content_type}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{wordCount.toLocaleString()}</td>
                    <td className="px-3 py-1.5 text-gray-500">{formatDate(v.created_at)}</td>
                    <td className="px-3 py-1.5 text-gray-400">{v.created_by || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
