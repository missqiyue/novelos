import { useState } from "react";
import { useCommentsStore, type ImportedComment } from "../../stores";
import { FileText, Upload, Trash2, Smile, Frown, Meh, ChevronDown } from "lucide-react";

const sentimentOptions = [
  { value: "positive", label: "正面", icon: Smile, color: "text-green-500" },
  { value: "negative", label: "负面", icon: Frown, color: "text-red-500" },
  { value: "mixed", label: "混合", icon: Meh, color: "text-amber-500" },
];

export function CommentImportPage() {
  const { comments, setComments, updateSentiment, clearComments } = useCommentsStore();
  const [textInput, setTextInput] = useState("");
  const [parsed, setParsed] = useState<ImportedComment[]>([]);

  const handleParse = () => {
    if (!textInput.trim()) return;
    const lines = textInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const newComments: ImportedComment[] = lines.map((content, i) => ({
      id: Date.now() + i,
      content,
      sentiment: "",
    }));
    setParsed(newComments);
    setComments(newComments);
  };

  const handleClear = () => {
    setTextInput("");
    setParsed([]);
    clearComments();
  };

  const handleSentimentChange = (id: number, sentiment: string) => {
    updateSentiment(id, sentiment);
    setParsed((prev) => prev.map((c) => (c.id === id ? { ...c, sentiment } : c)));
  };

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">导入读者评论</h1>
        <p className="text-sm text-gray-500 mb-6">
          粘贴读者评论内容，每行一条评论，解析后可标注情感倾向
        </p>

        {/* Input area */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">评论内容</label>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="在此粘贴读者评论，每行一条...&#10;&#10;例如：&#10;这个角色刻画得真棒，性格非常立体&#10;节奏太慢了，希望加快剧情推进&#10;对话写得很有意思，感同身受"
            rows={8}
            className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-gray-400">
              {textInput.trim()
                ? `${textInput.split("\n").filter((l) => l.trim()).length} 条待解析`
                : "尚未输入内容"}
            </span>
            <div className="flex items-center gap-2">
              {textInput.trim() && (
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={14} />
                  清空
                </button>
              )}
              <button
                onClick={handleParse}
                disabled={!textInput.trim()}
                className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-colors ${
                  textInput.trim()
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-gray-200 text-gray-400 cursor-not-allowed"
                }`}
              >
                <Upload size={14} />
                解析评论
              </button>
            </div>
          </div>
        </div>

        {/* Parsed comments list */}
        {parsed.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText size={18} className="text-indigo-600" />
                已解析评论 ({parsed.length} 条)
              </h2>
              <span className="text-xs text-gray-400">
                已标注: {parsed.filter((c) => c.sentiment).length}/{parsed.length}
              </span>
            </div>

            <div className="space-y-2">
              {parsed.map((comment, index) => {
                const sentiment = sentimentOptions.find((s) => s.value === comment.sentiment);
                const SentimentIcon = sentiment?.icon;

                return (
                  <div
                    key={comment.id}
                    className="bg-white border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-gray-400 font-mono mt-1 shrink-0 w-6">
                        #{index + 1}
                      </span>
                      <p className="text-sm text-gray-700 flex-1 leading-relaxed">
                        {comment.content}
                      </p>
                      <div className="relative shrink-0">
                        <select
                          value={comment.sentiment}
                          onChange={(e) => handleSentimentChange(comment.id, e.target.value)}
                          className="appearance-none text-xs border border-gray-200 rounded-lg px-2 py-1.5 pr-6 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-gray-600 cursor-pointer"
                        >
                          <option value="">未标注</option>
                          {sentimentOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={12}
                          className="absolute right-1.5 top-2.5 text-gray-400 pointer-events-none"
                        />
                      </div>
                    </div>
                    {sentiment && SentimentIcon && (
                      <div className="flex items-center gap-1 mt-2 ml-9">
                        <SentimentIcon size={12} className={sentiment.color} />
                        <span className={`text-xs ${sentiment.color}`}>{sentiment.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state when no comments parsed */}
        {parsed.length === 0 && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText size={48} className="mb-4" />
            <p className="text-sm">暂无评论数据</p>
            <p className="text-xs mt-1">在上方粘贴评论内容并点击"解析评论"开始</p>
          </div>
        )}
      </div>
    </div>
  );
}
