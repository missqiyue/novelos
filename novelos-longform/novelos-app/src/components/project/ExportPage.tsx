import { useState } from "react";
import { useParams } from "react-router-dom";
import { projectApi } from "../../lib/api";
import {
  FileText,
  FileCode,
  FileArchive,
  BookOpen,
  Loader2,
  Check,
  FolderOpen,
  Download,
} from "lucide-react";

interface ExportFormat {
  key: string;
  name: string;
  description: string;
  icon: typeof FileText;
  extension: string;
  mimeType: string;
  exportFn: (projectId: string) => Promise<string>;
}

const formats: ExportFormat[] = [
  {
    key: "txt",
    name: "TXT",
    description: "纯文本格式，兼容所有文本编辑器和阅读器，适合进一步编辑或归档",
    icon: FileText,
    extension: ".txt",
    mimeType: "text/plain",
    exportFn: projectApi.exportTxt,
  },
  {
    key: "md",
    name: "Markdown",
    description: "保留标题层级、分隔线等基本格式，适合导入笔记工具或博客平台",
    icon: FileCode,
    extension: ".md",
    mimeType: "text/markdown",
    exportFn: projectApi.exportMd,
  },
  {
    key: "docx",
    name: "DOCX",
    description: "Microsoft Word 兼容格式，支持富文本排版，适合打印或提交审稿",
    icon: FileArchive,
    extension: ".docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    exportFn: projectApi.exportDocx,
  },
  {
    key: "epub",
    name: "EPUB",
    description: "电子书标准格式，支持封面、目录、章节导航，适合在阅读器和手机上阅读",
    icon: BookOpen,
    extension: ".epub",
    mimeType: "application/epub+zip",
    exportFn: projectApi.exportEpub,
  },
];

export function ExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [exporting, setExporting] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<{
    format: string;
    path: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: ExportFormat) => {
    if (!projectId) return;
    setExporting(format.key);
    setError(null);
    try {
      const path = await format.exportFn(projectId);
      setLastExport({ format: format.name, path });
    } catch (e: any) {
      setError(e?.toString() || "导出失败");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">导出作品</h1>
        <p className="text-sm text-gray-500 mb-6">选择导出格式，将作品完整导出到本地文件</p>

        {/* Error state */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <span className="text-red-500 font-medium">导出失败：</span>
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600 text-xs"
            >
              关闭
            </button>
          </div>
        )}

        {/* Success notification */}
        {lastExport && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-green-700 mb-1">
              <Check size={16} className="text-green-500" />
              <span className="font-medium">{lastExport.format} 导出完成</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-green-600 mt-1">
              <FolderOpen size={12} />
              <span className="font-mono break-all">{lastExport.path}</span>
            </div>
          </div>
        )}

        {/* Empty state: no projectId */}
        {!projectId ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Download size={48} className="mb-4" />
            <p className="text-sm">无法获取项目信息</p>
            <p className="text-xs mt-1">请从项目页面进入导出</p>
          </div>
        ) : (
          /* Format cards */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {formats.map((format) => {
              const isExporting = exporting === format.key;
              const IconComponent = format.icon;

              return (
                <button
                  key={format.key}
                  onClick={() => handleExport(format)}
                  disabled={exporting !== null}
                  className={`text-left p-5 rounded-lg border transition-all duration-200 ${
                    isExporting
                      ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-200"
                      : "border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md hover:bg-indigo-50/30"
                  } ${exporting !== null && !isExporting ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                        isExporting ? "bg-indigo-200" : "bg-gray-100"
                      }`}
                    >
                      {isExporting ? (
                        <Loader2 size={24} className="text-indigo-600 animate-spin" />
                      ) : (
                        <IconComponent size={24} className="text-gray-600" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{format.name}</h3>
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">
                          {format.extension}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 leading-relaxed">{format.description}</p>

                      {isExporting && (
                        <p className="text-xs text-indigo-600 mt-2 flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" />
                          正在导出 {format.name} 格式...
                        </p>
                      )}

                      {lastExport && lastExport.format === format.name && (
                        <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                          <Check size={12} />
                          上次导出: {lastExport.path}
                        </p>
                      )}
                    </div>

                    <Download
                      size={18}
                      className={`shrink-0 mt-0.5 ${
                        isExporting ? "text-indigo-400" : "text-gray-300"
                      }`}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
