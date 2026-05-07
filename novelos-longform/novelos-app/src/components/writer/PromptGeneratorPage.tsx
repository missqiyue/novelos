import { useState } from "react";
import { useProjectStore, useAgentStore } from "../../stores";
import {
  Sparkles,
  Lightbulb,
  BookOpen,
  User,
  Swords,
  Play,
  ClipboardList,
  Copy,
  Check,
  Loader2,
  AlertTriangle,
  Globe,
} from "lucide-react";

// ─── Genre options ───

const GENRES = [
  { id: "xianxia", label: "仙侠" },
  { id: "wuxia", label: "武侠" },
  { id: "xuanhuan", label: "玄幻" },
  { id: "qihuan", label: "奇幻" },
  { id: "science_fiction", label: "科幻" },
  { id: "dushi", label: "都市" },
  { id: "lishi", label: "历史" },
  { id: "yanqing", label: "言情" },
  { id: "xuanyi", label: "悬疑" },
  { id: "kongbu", label: "恐怖" },
  { id: "junshi", label: "军事" },
  { id: "youxi", label: "游戏" },
  { id: "jingshi", label: "竞技" },
  { id: "qita", label: "其他" },
];

// ─── Types for parsed prompt sections ───

interface PromptSections {
  世界观设定: string;
  主角设定: string;
  核心冲突: string;
  开篇场景: string;
  写作建议: string;
}

function parsePromptContent(content: string): PromptSections | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object") {
      const data = parsed.result || parsed;
      return {
        世界观设定: data.世界观设定 || data.world_setting || "",
        主角设定: data.主角设定 || data.protagonist_setting || "",
        核心冲突: data.核心冲突 || data.core_conflict || "",
        开篇场景: data.开篇场景 || data.opening_scene || "",
        写作建议: data.写作建议 || data.writing_advice || "",
      };
    }
  } catch {
    // Try to extract from text
    const sections: Record<string, string> = {};
    const sectionNames = ["世界观设定", "主角设定", "核心冲突", "开篇场景", "写作建议"];
    let currentSection = "";

    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^#{1,3}\s*(.+)/) || line.match(/^【(.+)】/);
      if (match) {
        const name = match[1].trim();
        const found = sectionNames.find((s) => name.includes(s));
        if (found) {
          currentSection = found;
          sections[currentSection] = "";
          continue;
        }
      }
      if (currentSection) {
        sections[currentSection] += (sections[currentSection] ? "\n" : "") + line;
      }
    }

    if (Object.keys(sections).length === 0) return null;

    return {
      世界观设定: sections["世界观设定"] || "",
      主角设定: sections["主角设定"] || "",
      核心冲突: sections["核心冲突"] || "",
      开篇场景: sections["开篇场景"] || "",
      写作建议: sections["写作建议"] || "",
    };
  }
  return null;
}

// ─── Component ───

export function PromptGeneratorPage() {
  const [genre, setGenre] = useState("");
  const [inspiration, setInspiration] = useState("");
  const [sections, setSections] = useState<PromptSections | null>(null);
  const [copied, setCopied] = useState(false);

  const { project } = useProjectStore();
  const { running, error, runAgent } = useAgentStore();

  const handleGenerate = async () => {
    setCopied(false);
    const genreLabel = GENRES.find((g) => g.id === genre)?.label || genre;

    const result = await runAgent("task_card", {
      mode: "creative_prompt",
      genre: genreLabel,
      genre_id: genre,
      inspiration: inspiration,
      project_id: project?.id || "",
      book_mode: "longform",
    });

    if (result) {
      const parsed = parsePromptContent(result.content);
      setSections(parsed);
    }
  };

  const handleCopy = async () => {
    if (!sections) return;
    const text = `【世界观设定】
${sections.世界观设定}

【主角设定】
${sections.主角设定}

【核心冲突】
${sections.核心冲突}

【开篇场景】
${sections.开篇场景}

【写作建议】
${sections.写作建议}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API may not be available
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Lightbulb size={22} className="text-amber-500" />
          写作灵感生成器
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          选择题材，输入灵感方向，AI 为你生成详细的创作提示
        </p>
      </div>

      {/* Input form */}
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <div className="space-y-4">
          {/* Genre dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">选择题材</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
            >
              <option value="">-- 请选择题材 --</option>
              {GENRES.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>

          {/* Inspiration input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">灵感方向</label>
            <textarea
              value={inspiration}
              onChange={(e) => setInspiration(e.target.value)}
              placeholder="输入你的灵感方向，比如：一个被家族抛弃的少年在秘境中获得上古传承..."
              rows={4}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Generate button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={running || !genre}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                running
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : !genre
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-amber-500 text-white hover:bg-amber-600"
              }`}
            >
              {running ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  生成灵感
                </>
              )}
            </button>
            {!genre && <span className="text-xs text-gray-400">请先选择题材</span>}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!sections && !running && !error && (
        <div className="text-center py-16 text-gray-400 bg-white rounded-lg border border-gray-200">
          <Sparkles size={48} className="mx-auto mb-4 text-gray-300" />
          <p>选择题材并输入灵感方向</p>
          <p className="text-sm mt-1">点击"生成灵感"获取 AI 创作的写作提示</p>
        </div>
      )}

      {/* Generated prompt card */}
      {sections && (
        <div className="space-y-4">
          {/* Copy button row */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <ClipboardList size={16} className="text-indigo-600" />
              生成的创作提示
            </h2>
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                copied
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-white border-gray-200 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
              }`}
            >
              {copied ? (
                <>
                  <Check size={14} />
                  已复制
                </>
              ) : (
                <>
                  <Copy size={14} />
                  复制全文
                </>
              )}
            </button>
          </div>

          {/* 世界观设定 */}
          <PromptSection
            icon={Globe}
            title="世界观设定"
            color="text-indigo-600"
            bgColor="bg-indigo-50"
            iconColor="text-indigo-600"
          >
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {sections.世界观设定 || "未生成"}
            </p>
          </PromptSection>

          {/* 主角设定 */}
          <PromptSection
            icon={User}
            title="主角设定"
            color="text-blue-600"
            bgColor="bg-blue-50"
            iconColor="text-blue-600"
          >
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {sections.主角设定 || "未生成"}
            </p>
          </PromptSection>

          {/* 核心冲突 */}
          <PromptSection
            icon={Swords}
            title="核心冲突"
            color="text-red-600"
            bgColor="bg-red-50"
            iconColor="text-red-600"
          >
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {sections.核心冲突 || "未生成"}
            </p>
          </PromptSection>

          {/* 开篇场景 */}
          <PromptSection
            icon={Play}
            title="开篇场景"
            color="text-green-600"
            bgColor="bg-green-50"
            iconColor="text-green-600"
          >
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {sections.开篇场景 || "未生成"}
            </p>
          </PromptSection>

          {/* 写作建议 */}
          <PromptSection
            icon={BookOpen}
            title="写作建议"
            color="text-purple-600"
            bgColor="bg-purple-50"
            iconColor="text-purple-600"
          >
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
              {sections.写作建议 || "未生成"}
            </p>
          </PromptSection>
        </div>
      )}
    </div>
  );
}

// ─── Prompt section card ───

function PromptSection({
  icon: Icon,
  title,
  color,
  bgColor,
  iconColor,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  color: string;
  bgColor: string;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 ${bgColor} border-b border-gray-100`}>
        <Icon size={16} className={iconColor} />
        <h3 className={`text-sm font-medium ${color}`}>{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
