import { useState } from "react";
import { useParams } from "react-router-dom";
import { useAgentStore } from "../../stores";
import {
  Sparkles,
  Loader2,
  CheckCircle,
  FileText,
  Tag,
  BookOpen,
  MessageSquare,
  Type,
  Eye,
  AlertTriangle,
} from "lucide-react";

interface StyleAnalysisResult {
  style_name: string;
  narrative_perspective: string;
  language_style: string;
  dialogue_style: string;
  word_preferences: string[];
  writing_guidelines: string;
}

function parseJsonSafe(text: string): any {
  try {
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export function StyleExtractorPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { runAgent, running } = useAgentStore();

  const [referenceText, setReferenceText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<StyleAnalysisResult | null>(null);
  const [rawResult, setRawResult] = useState("");
  const [analyzed, setAnalyzed] = useState(false);
  const [error, setError] = useState("");

  const handleExtractStyle = async () => {
    if (!referenceText.trim()) return;
    setAnalyzing(true);
    setError("");
    setAnalyzed(false);
    try {
      const agentResult = await runAgent("style_extractor", { text: referenceText });
      if (agentResult) {
        setRawResult(agentResult.content);
        const parsed = parseJsonSafe(agentResult.content);
        if (parsed?.style_name) {
          setResult(parsed as StyleAnalysisResult);
          setAnalyzed(true);
        } else {
          setResult(null);
          setError("未能解析风格分析结果，请检查AI返回格式");
        }
      }
    } catch {
      setError("风格分析失败，请重试");
    }
    setAnalyzing(false);
  };

  const charCount = referenceText.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-8">
          <FileText size={20} className="text-indigo-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">文风提取器</h1>
            <p className="text-sm text-gray-500">粘贴参考文本，AI将分析并提取写作风格特征</p>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {/* Input section */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">参考文段</label>
            <textarea
              value={referenceText}
              onChange={(e) => {
                setReferenceText(e.target.value);
                setAnalyzed(false);
                setResult(null);
                setError("");
              }}
              placeholder="粘贴一段你希望分析的文字风格（建议500字以上）。AI将提取：风格名称、叙事视角、语言风格、对话风格、用词偏好、写作指南..."
              className="w-full h-52 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${charCount < 500 ? "text-amber-600" : "text-gray-400"}`}>
                {charCount} 字 {charCount < 500 && "(建议500字以上以获得更好的分析效果)"}
              </span>
              <button
                onClick={handleExtractStyle}
                disabled={analyzing || running || !referenceText.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm"
              >
                {analyzing || running ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {analyzing || running ? "分析中..." : "AI 提取风格"}
              </button>
            </div>
          </div>

          {/* Error state */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Empty state (before analysis) */}
          {!result && !rawResult && !error && (
            <div className="py-12 text-center text-gray-400">
              <BookOpen size={40} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">粘贴参考文本后点击"AI 提取风格"开始分析</p>
            </div>
          )}

          {/* Analyzed badge */}
          {analyzed && result && (
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                <CheckCircle size={12} />
                已分析
              </span>
            </div>
          )}

          {/* Result display */}
          {result && (
            <div className="space-y-4">
              {/* Style name */}
              <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                <h3 className="text-lg font-semibold text-indigo-900">{result.style_name}</h3>
              </div>

              {/* Attribute chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Narrative perspective */}
                <div className="p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye size={14} className="text-blue-500" />
                    <span className="text-xs font-medium text-gray-500">叙事视角</span>
                  </div>
                  <span className="text-sm text-gray-900">
                    {result.narrative_perspective || "未指定"}
                  </span>
                </div>

                {/* Language style */}
                <div className="p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Type size={14} className="text-green-500" />
                    <span className="text-xs font-medium text-gray-500">语言风格</span>
                  </div>
                  <span className="text-sm text-gray-900">{result.language_style || "未指定"}</span>
                </div>

                {/* Dialogue style */}
                <div className="p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={14} className="text-purple-500" />
                    <span className="text-xs font-medium text-gray-500">对话风格</span>
                  </div>
                  <span className="text-sm text-gray-900">{result.dialogue_style || "未指定"}</span>
                </div>

                {/* Word preferences */}
                <div className="p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Tag size={14} className="text-orange-500" />
                    <span className="text-xs font-medium text-gray-500">用词偏好</span>
                  </div>
                  {result.word_preferences && result.word_preferences.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {result.word_preferences.map((word, i) => (
                        <span
                          key={i}
                          className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full border border-orange-200"
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">未指定</span>
                  )}
                </div>
              </div>

              {/* Writing guidelines */}
              {result.writing_guidelines && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h4 className="text-sm font-medium text-amber-800 mb-2">写作指南</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {result.writing_guidelines}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Raw result fallback (when parsing fails but we have content) */}
          {rawResult && !result && (
            <div className="p-4 bg-gray-50 rounded-lg text-sm whitespace-pre-wrap max-h-96 overflow-auto border border-gray-200">
              {rawResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
