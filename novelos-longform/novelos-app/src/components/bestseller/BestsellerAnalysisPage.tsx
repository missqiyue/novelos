import { useState, useEffect } from "react";
import {
  FileText,
  BrainCircuit,
  BookOpen,
  ChevronRight,
  Hash,
  AlignLeft,
  Clock,
  Sparkles,
  TrendingUp,
  Link2,
  BarChart3,
} from "lucide-react";

interface ImportedWork {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  importDate: string;
}

interface WorkStats {
  totalChars: number;
  paragraphCount: number;
  estimatedReadingTimeMin: number;
  avgCharsPerParagraph: number;
}

function loadWorks(): ImportedWork[] {
  try {
    const raw = localStorage.getItem("bestseller_imports");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function computeStats(content: string): WorkStats {
  const totalChars = content.replace(/\s/g, "").length;
  const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const paragraphCount = paragraphs.length;
  const estimatedReadingTimeMin = Math.ceil(totalChars / 500); /* ~500 chars/min for Chinese */
  const avgCharsPerParagraph = paragraphCount > 0 ? Math.round(totalChars / paragraphCount) : 0;

  return { totalChars, paragraphCount, estimatedReadingTimeMin, avgCharsPerParagraph };
}

export function BestsellerAnalysisPage() {
  const [works, setWorks] = useState<ImportedWork[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setWorks(loadWorks());
  }, []);

  const selected = works.find((w) => w.id === selectedId) ?? null;
  const stats = selected ? computeStats(selected.content) : null;

  const handleAiAnalyze = async () => {
    if (!selected) return;
    setAnalyzing(true);
    try {
      const { agentApi } = await import("../../lib/tauri");
      await agentApi.run("bestseller_parser", {
        work_title: selected.title,
        work_text: selected.content,
      });
      alert("AI分析已启动，请查看分析结果。");
    } catch (e: any) {
      alert(`分析失败: ${e?.message || e}`);
    }
    setAnalyzing(false);
  };

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-lg font-semibold mb-1">爆款分析报告</h2>
      <p className="text-sm text-gray-500 mb-6">
        选择已导入的参考作品，查看字数统计和AI分析维度报告。
      </p>

      {works.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
          <BookOpen size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">尚未导入任何参考作品</p>
          <p className="text-gray-300 text-xs mt-1">请先在「爆款作品导入」页面导入参考作品</p>
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Left: work list */}
          <div className="w-64 shrink-0">
            <h3 className="text-sm font-medium text-gray-700 mb-2">作品列表</h3>
            <div className="space-y-1">
              {works.map((work) => (
                <button
                  key={work.id}
                  onClick={() => setSelectedId(work.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    selectedId === work.id
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <FileText size={14} className="shrink-0" />
                    <span className="truncate">{work.title}</span>
                  </span>
                  <ChevronRight size={14} className="shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Right: detail */}
          <div className="flex-1 min-w-0">
            {!selected ? (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                <BarChart3 size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-400 text-sm">请从左侧选择一个作品查看分析</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Title & actions */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{selected.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      导入日期: {new Date(selected.importDate).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                  <button
                    onClick={handleAiAnalyze}
                    disabled={analyzing}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    <BrainCircuit size={16} />
                    {analyzing ? "分析中..." : "AI 分析"}
                  </button>
                </div>

                {/* Basic stats */}
                {stats && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatCard
                      icon={<Hash size={16} />}
                      label="总字数"
                      value={stats.totalChars.toLocaleString()}
                    />
                    <StatCard
                      icon={<AlignLeft size={16} />}
                      label="段落数"
                      value={stats.paragraphCount.toString()}
                    />
                    <StatCard
                      icon={<Clock size={16} />}
                      label="预计阅读"
                      value={`${stats.estimatedReadingTimeMin} 分钟`}
                    />
                    <StatCard
                      icon={<BarChart3 size={16} />}
                      label="平均段长"
                      value={`${stats.avgCharsPerParagraph} 字`}
                    />
                  </div>
                )}

                {/* AI analysis sections (placeholder) */}
                <div className="space-y-3">
                  <AnalysisPlaceholder
                    icon={<TrendingUp size={16} />}
                    title="开篇模式"
                    description="分析作品开头几章的节奏、冲突设置和读者吸引力"
                  />
                  <AnalysisPlaceholder
                    icon={<Sparkles size={16} />}
                    title="爽点节奏"
                    description="分析作品中爽点的分布密度、类型和节奏规律"
                  />
                  <AnalysisPlaceholder
                    icon={<Link2 size={16} />}
                    title="钩子技巧"
                    description="分析作品在章节衔接、悬念设置上的技巧模式"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function AnalysisPlaceholder({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-indigo-500">{icon}</span>
        <h4 className="font-medium text-sm text-gray-800">{title}</h4>
      </div>
      <p className="text-xs text-gray-500 mb-2">{description}</p>
      <div className="bg-gray-50 rounded border border-gray-100 px-3 py-2">
        <p className="text-xs text-gray-300 italic">AI分析后可查看</p>
      </div>
    </div>
  );
}
