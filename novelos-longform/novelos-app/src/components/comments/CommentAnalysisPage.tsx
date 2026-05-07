import { useMemo } from "react";
import { useCommentsStore } from "../../stores";
import { BarChart3, TrendingUp, MessageSquare, FileText } from "lucide-react";

// Common Chinese stop words to filter out
const stopWords = new Set([
  "的",
  "了",
  "在",
  "是",
  "我",
  "有",
  "和",
  "就",
  "不",
  "人",
  "都",
  "一",
  "一个",
  "上",
  "也",
  "很",
  "到",
  "说",
  "要",
  "去",
  "你",
  "会",
  "着",
  "没有",
  "看",
  "好",
  "自己",
  "这",
  "他",
  "她",
  "它",
  "们",
  "那",
  "些",
  "但",
  "是",
  "可以",
  "这个",
  "那个",
  "还",
  "被",
  "把",
  "让",
  "从",
  "与",
  "而",
  "或",
  "因为",
  "所以",
  "如果",
  "虽然",
  "但是",
  "只是",
  "已经",
  "并且",
  "不过",
  "的话",
  "啊",
  "吧",
  "呢",
  "吗",
  "哦",
  "嗯",
  "什么",
  "怎么",
  "哪里",
  "谁",
  "几",
  "多",
  "少",
  "一个",
  "非常",
  "比较",
  "更",
  "最",
  "都",
  "才",
  "刚",
  "正在",
  "一直",
  "常常",
  "时候",
  "这里",
  "那里",
  "这样",
  "那样",
  "怎么样",
  "为什么",
  "没",
  "有点",
  "觉得",
  "感觉",
  "出来",
  "起来",
  "过来",
  "进去",
  "真的",
  "还是",
  "就是",
  "应该",
  "需要",
  "想",
  "希望",
  "还是",
  "一点",
  "一些",
  "很多",
  "太",
  "确实",
  "可能",
  "不能",
  // English stop words
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "shall",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "he",
  "his",
  "she",
  "her",
  "it",
  "its",
  "they",
  "their",
  "them",
  "this",
  "that",
  "these",
  "those",
  "to",
  "of",
  "in",
  "for",
  "on",
  "with",
  "at",
  "by",
  "from",
  "as",
  "into",
  "about",
  "or",
  "and",
  "but",
  "not",
  "no",
  "nor",
  "so",
  "if",
  "then",
  "than",
  "too",
  "very",
  "just",
  "also",
  "now",
]);

function tokenize(text: string): string[] {
  // Split by common delimiters and filter short tokens
  const tokens: string[] = [];
  // Try to extract Chinese words (2+ char sequences) and English words
  const segments = text.split(
    /[\s,，。！？、；：""''「」『』【】《》（）\(\)\[\]\{\}…—\-\.\!\?\;\:\"\'\/\\]+/,
  );
  for (const seg of segments) {
    if (!seg) continue;
    // For Chinese text, extract 2-char, 3-char, and 4-char n-grams
    if (/[一-鿿]/.test(seg)) {
      // 2-character words
      for (let i = 0; i < seg.length - 1; i++) {
        const bigram = seg.slice(i, i + 2);
        if (!stopWords.has(bigram)) {
          tokens.push(bigram);
        }
      }
      // 3-character words
      for (let i = 0; i < seg.length - 2; i++) {
        const trigram = seg.slice(i, i + 3);
        if (!stopWords.has(trigram)) {
          tokens.push(trigram);
        }
      }
    } else if (seg.length >= 2) {
      // English words
      const lower = seg.toLowerCase();
      if (!stopWords.has(lower)) {
        tokens.push(lower);
      }
    }
  }
  return tokens;
}

export function CommentAnalysisPage() {
  const { comments } = useCommentsStore();

  const analysis = useMemo(() => {
    if (comments.length === 0) return null;

    const total = comments.length;
    const positive = comments.filter((c) => c.sentiment === "positive").length;
    const negative = comments.filter((c) => c.sentiment === "negative").length;
    const mixed = comments.filter((c) => c.sentiment === "mixed").length;
    const unlabeled = comments.filter((c) => !c.sentiment).length;

    // Word frequency
    const wordCounts: Record<string, number> = {};
    for (const comment of comments) {
      const tokens = tokenize(comment.content);
      for (const token of tokens) {
        wordCounts[token] = (wordCounts[token] || 0) + 1;
      }
    }

    const topWords = Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      total,
      positive,
      negative,
      mixed,
      unlabeled,
      topWords,
    };
  }, [comments]);

  if (comments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <BarChart3 size={48} className="mb-4" />
        <p className="text-sm">暂无评论数据可供分析</p>
        <p className="text-xs mt-1">请先在"导入评论"页面导入读者评论</p>
      </div>
    );
  }

  if (!analysis) return null;

  const maxCount = Math.max(
    1,
    analysis.positive,
    analysis.negative,
    analysis.mixed,
    analysis.unlabeled,
  );

  const maxFreq = Math.max(1, ...analysis.topWords.map(([, n]) => n));

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">评论分析报告</h1>
        <p className="text-sm text-gray-500 mb-6">基于已导入评论的情感分布和关键词分析</p>

        {/* Summary counts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare size={14} className="text-indigo-600" />
              <span className="text-xs text-gray-500">评论总数</span>
            </div>
            <span className="text-2xl font-bold text-gray-900">{analysis.total}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full bg-green-400" />
              <span className="text-xs text-gray-500">正面</span>
            </div>
            <span className="text-2xl font-bold text-green-700">{analysis.positive}</span>
            <span className="text-xs text-gray-400 ml-1">
              ({analysis.total > 0 ? ((analysis.positive / analysis.total) * 100).toFixed(0) : 0}%)
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="text-xs text-gray-500">负面</span>
            </div>
            <span className="text-2xl font-bold text-red-700">{analysis.negative}</span>
            <span className="text-xs text-gray-400 ml-1">
              ({analysis.total > 0 ? ((analysis.negative / analysis.total) * 100).toFixed(0) : 0}%)
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full bg-amber-400" />
              <span className="text-xs text-gray-500">混合/未标注</span>
            </div>
            <span className="text-2xl font-bold text-amber-700">
              {analysis.mixed + analysis.unlabeled}
            </span>
          </div>
        </div>

        {/* Sentiment distribution bar chart */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
            <BarChart3 size={14} className="text-indigo-600" />
            情感分布
          </h2>
          <div className="space-y-3">
            {[
              {
                label: "正面",
                count: analysis.positive,
                color: "bg-green-400",
                textColor: "text-green-700",
              },
              {
                label: "负面",
                count: analysis.negative,
                color: "bg-red-400",
                textColor: "text-red-700",
              },
              {
                label: "混合",
                count: analysis.mixed,
                color: "bg-amber-400",
                textColor: "text-amber-700",
              },
              {
                label: "未标注",
                count: analysis.unlabeled,
                color: "bg-gray-300",
                textColor: "text-gray-500",
              },
            ].map(({ label, count, color, textColor }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">{label}</span>
                  <span className={`text-xs font-medium ${textColor}`}>{count}</span>
                </div>
                <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{
                      width: `${(count / maxCount) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top keywords */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
            <TrendingUp size={14} className="text-indigo-600" />
            高频关键词 Top 10
          </h2>

          {analysis.topWords.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">未能提取到有效的关键词</p>
          ) : (
            <div className="space-y-2">
              {analysis.topWords.map(([word, count], index) => (
                <div key={word} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 font-mono w-5 shrink-0">#{index + 1}</span>
                  <span className="text-sm font-medium text-gray-700 w-20 shrink-0 truncate">
                    {word}
                  </span>
                  <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-400 rounded-full transition-all"
                      style={{
                        width: `${(count / maxFreq) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-8 shrink-0 text-right">{count}次</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
