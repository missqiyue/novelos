import { useState, useEffect } from "react";
import { FileText, Trash2, Brain, Clock, BookOpen } from "lucide-react";

interface ImportedWork {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  importDate: string;
}

function loadWorks(): ImportedWork[] {
  try {
    const raw = localStorage.getItem("bestseller_imports");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWorks(works: ImportedWork[]) {
  localStorage.setItem("bestseller_imports", JSON.stringify(works));
}

export function BestsellerImportPage() {
  const [textInput, setTextInput] = useState("");
  const [works, setWorks] = useState<ImportedWork[]>([]);
  const [parseError, setParseError] = useState("");

  useEffect(() => {
    setWorks(loadWorks());
  }, []);

  const handleParse = () => {
    const trimmed = textInput.trim();
    if (!trimmed) {
      setParseError("请输入参考作品文本");
      return;
    }

    const lines = trimmed.split("\n");
    const title = lines[0].trim();
    const content = lines.slice(1).join("\n").trim();

    if (!content) {
      setParseError("内容不能为空（至少需要标题行和一行正文）");
      return;
    }

    const wordCount = content.replace(/\s/g, "").length;

    const newWork: ImportedWork = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2),
      title: title || "未命名作品",
      content,
      wordCount,
      importDate: new Date().toISOString(),
    };

    const updated = [newWork, ...works];
    setWorks(updated);
    saveWorks(updated);
    setTextInput("");
    setParseError("");
  };

  const handleDelete = (id: string) => {
    const updated = works.filter((w) => w.id !== id);
    setWorks(updated);
    saveWorks(updated);
  };

  const handleAnalyze = (work: ImportedWork) => {
    alert(
      `将在后续版本中支持对「${work.title}」的AI分析。\n\n作品字数: ${work.wordCount.toLocaleString()}`,
    );
  };

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-lg font-semibold mb-4">爆款作品导入</h2>
      <p className="text-sm text-gray-500 mb-4">
        将参考作品的文本粘贴到下方，系统会自动提取标题（第一行）和正文内容，用于后续的爆款模式分析。
      </p>

      {/* Input area */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">粘贴参考作品文本</label>
        <textarea
          value={textInput}
          onChange={(e) => {
            setTextInput(e.target.value);
            if (parseError) setParseError("");
          }}
          placeholder={`作品标题（第一行）\n\n正文内容从这里开始...\n可以粘贴多行文本，支持整章内容。`}
          rows={10}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {parseError && <p className="text-sm text-red-500 mt-1">{parseError}</p>}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleParse}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
          >
            解析并导入
          </button>
          <span className="text-xs text-gray-400">第一行自动作为标题，其余为正文</span>
        </div>
      </div>

      {/* Imported works list */}
      <h3 className="text-md font-medium text-gray-800 mb-3">已导入作品 ({works.length})</h3>

      {works.length === 0 ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">尚未导入任何参考作品</p>
          <p className="text-gray-300 text-xs mt-1">粘贴文本并点击「解析并导入」开始</p>
        </div>
      ) : (
        <div className="space-y-3">
          {works.map((work) => (
            <div
              key={work.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-indigo-200 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-indigo-500 shrink-0" />
                    <h4 className="font-medium text-gray-900 truncate">{work.title}</h4>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <BookOpen size={12} />
                      字数: {work.wordCount.toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      导入: {new Date(work.importDate).toLocaleDateString("zh-CN")}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    {work.content.slice(0, 80)}
                    {work.content.length > 80 ? "..." : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={() => handleAnalyze(work)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs hover:bg-indigo-100 transition-colors"
                  >
                    <Brain size={12} />
                    分析
                  </button>
                  <button
                    onClick={() => handleDelete(work.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
