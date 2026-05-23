import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useBookshelfStore } from "../../stores";
import { projectApi, bookshelfApi, type ImportResult } from "../../lib/api";
import { openFileDialog } from "../../lib/platform";
import {
  BookOpen,
  Trash2,
  Download,
  Upload,
  Gift,
  Zap,
  FolderOpen,
  Archive,
  FileText,
  Settings,
} from "lucide-react";
import { TaskBadge } from "../common/TaskIndicator";
import { WelcomeWizard, useOnboarding } from "../onboarding/WelcomeWizard";

const statusColors: Record<string, string> = {
  planning: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  paused: "bg-gray-100 text-gray-600",
  completed: "bg-blue-100 text-blue-700",
  archived: "bg-gray-100 text-gray-500",
};

export function BookshelfPage() {
  const { items, loading, fetch, addProject, openProject } = useBookshelfStore();
  const navigate = useNavigate();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const importedProjectId = useRef<string | null>(null);
  const { show: showWizard, complete: completeWizard } = useOnboarding();
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    item: (typeof items)[number];
  } | null>(null);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleOpen = async (projectId: string) => {
    const project = await openProject(projectId);
    if (project) {
      navigate(`/project/${projectId}`);
    }
  };

  const handleDelete = async (projectId: string) => {
    await projectApi.delete(projectId);
    setConfirmDeleteId(null);
    fetch();
  };

  const handleExport = async (
    projectId: string,
    format: "txt" | "md" | "docx" | "epub" | "pdf" = "txt",
  ) => {
    setExporting(projectId);
    try {
      let path: string;
      if (format === "md") path = await projectApi.exportMd(projectId);
      else if (format === "docx") path = await projectApi.exportDocx(projectId);
      else if (format === "epub") path = await projectApi.exportEpub(projectId);
      else if (format === "pdf") path = await projectApi.exportPdf(projectId);
      else path = await projectApi.exportTxt(projectId);
      alert(`已导出至: ${path}`);
    } catch (e: any) {
      alert(`导出失败: ${e}`);
    }
    setExporting(null);
  };

  const handleImport = async () => {
    try {
      const filePath = await openFileDialog({
        multiple: false,
        filters: [{ name: "文本文件", extensions: ["txt"] }],
      });
      if (!filePath) return;

      const title = filePath.split("/").pop()?.replace(".txt", "") || "导入作品";
      const project = await addProject(title);
      if (!project) {
        alert("创建项目失败");
        return;
      }

      await openProject(project.id);

      importedProjectId.current = project.id;
      setImporting(true);
      const result = await projectApi.importTxt(filePath);
      setImportResult(result);
      fetch();
    } catch (e: any) {
      alert(`导入失败: ${e}`);
    }
    setImporting(false);
  };

  const handleImportConfirm = () => {
    const pid = importedProjectId.current;
    setImportResult(null);
    importedProjectId.current = null;
    if (pid) {
      navigate(`/project/${pid}`);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, item: (typeof items)[number]) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  const handleCtxOpen = () => {
    if (!ctxMenu) return;
    handleOpen(ctxMenu.item.project_id);
    setCtxMenu(null);
  };

  const handleCtxArchive = async () => {
    if (!ctxMenu) return;
    try {
      await bookshelfApi.update(ctxMenu.item.project_id, undefined, undefined, "archived");
      fetch();
    } catch (e: any) {
      alert(`归档失败: ${e}`);
    }
    setCtxMenu(null);
  };

  const handleCtxExport = async (format: "txt" | "md" | "docx" | "epub" | "pdf") => {
    if (!ctxMenu) return;
    await handleExport(ctxMenu.item.project_id, format);
    setCtxMenu(null);
  };

  const handleCtxDelete = () => {
    if (!ctxMenu) return;
    setConfirmDeleteId(ctxMenu.item.id);
    setCtxMenu(null);
  };

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  return (
    <div className="min-h-screen bg-gray-50">
      {showWizard && <WelcomeWizard onComplete={completeWizard} />}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <BookOpen size={28} className="text-indigo-600" />
              NovelOS Longform
            </h1>
            <p className="text-gray-500 mt-1">AI驱动的长篇小说创作系统</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/settings")}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Settings size={18} />
              设置
            </button>
            <button
              onClick={() => navigate("/quick-start?mode=chat")}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
            >
              <Zap size={18} />
              智能开书
            </button>
            <button
              onClick={() => navigate("/quick-start")}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Zap size={18} />
              快速开始
            </button>
            <button
              onClick={async () => {
                try {
                  const r = await projectApi.createSample();
                  alert(
                    `示例项目「星辰仙途」已创建！\n${r.volumes_created}卷 ${r.characters_created}角色 ${r.chapters_created}章`,
                  );
                  fetch();
                } catch (e: any) {
                  alert("创建失败: " + e);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm"
            >
              <Gift size={16} />
              示例项目
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <Upload size={18} />
              {importing ? "导入中..." : "导入TXT"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen size={48} className="mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">书架空空如也，可以先导入TXT或创建示例项目</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => handleOpen(item.project_id)}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{item.title}</h3>
                    {item.genre_name && (
                      <p className="text-sm text-gray-500 mt-0.5">{item.genre_name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${statusColors[item.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {item.status}
                    </span>
                    <TaskBadge projectId={item.project_id} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>
                    {item.last_opened_at
                      ? `最近打开: ${new Date(item.last_opened_at).toLocaleDateString()}`
                      : "未打开"}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(item.project_id, "txt");
                      }}
                      disabled={exporting === item.project_id}
                      className="p-1 hover:text-indigo-500 disabled:opacity-50"
                      title="导出TXT"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(item.project_id, "md");
                      }}
                      disabled={exporting === item.project_id}
                      className="p-1 hover:text-indigo-500 disabled:opacity-50 text-xs font-mono"
                      title="导出Markdown"
                    >
                      MD
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(item.project_id, "docx");
                      }}
                      disabled={exporting === item.project_id}
                      className="p-1 hover:text-indigo-500 disabled:opacity-50 text-xs font-mono"
                      title="导出DOCX"
                    >
                      DOCX
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(item.project_id, "epub");
                      }}
                      disabled={exporting === item.project_id}
                      className="p-1 hover:text-indigo-500 disabled:opacity-50 text-xs font-mono"
                      title="导出EPUB"
                    >
                      EPUB
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleExport(item.project_id, "pdf");
                      }}
                      disabled={exporting === item.project_id}
                      className="p-1 hover:text-indigo-500 disabled:opacity-50 text-xs font-mono"
                      title="导出PDF"
                    >
                      PDF
                    </button>
                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(item.project_id);
                          }}
                          className="px-1.5 py-0.5 bg-red-500 text-white rounded text-[10px] hover:bg-red-600"
                        >
                          确认
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(null);
                          }}
                          className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-[10px] hover:bg-gray-300"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(item.id);
                        }}
                        className="p-1 hover:text-red-500"
                        title="删除项目"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import result modal */}
      {importResult && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="font-semibold text-gray-900 mb-3">导入完成</h3>
            <div className="space-y-2 text-sm text-gray-700">
              <p>
                导入章节: <span className="font-medium">{importResult.chapters_imported}</span>
              </p>
              <p>
                总字数:{" "}
                <span className="font-medium">{importResult.total_words.toLocaleString()}</span>
              </p>
              {importResult.chapter_titles.length > 0 && (
                <div className="mt-2">
                  <p className="text-gray-500 text-xs mb-1">章节列表:</p>
                  <div className="max-h-40 overflow-auto space-y-0.5">
                    {importResult.chapter_titles.map((t, i) => (
                      <p key={i} className="text-xs text-gray-600">
                        {i + 1}. {t}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={handleImportConfirm}
              className="mt-4 w-full py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            >
              进入项目
            </button>
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div className="fixed inset-0 z-50" onClick={closeCtxMenu}>
          <div
            className="absolute bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-48"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleCtxOpen}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FolderOpen size={15} className="text-gray-400" />
              打开项目
            </button>
            <button
              onClick={handleCtxArchive}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Archive size={15} className="text-gray-400" />
              归档
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => handleCtxExport("txt")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText size={15} className="text-gray-400" />
              导出 TXT
            </button>
            <button
              onClick={() => handleCtxExport("md")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText size={15} className="text-gray-400" />
              导出 Markdown
            </button>
            <button
              onClick={() => handleCtxExport("docx")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText size={15} className="text-gray-400" />
              导出 DOCX
            </button>
            <button
              onClick={() => handleCtxExport("epub")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText size={15} className="text-gray-400" />
              导出 EPUB
            </button>
            <button
              onClick={() => handleCtxExport("pdf")}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText size={15} className="text-gray-400" />
              导出 PDF
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={handleCtxDelete}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 size={15} />
              删除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
