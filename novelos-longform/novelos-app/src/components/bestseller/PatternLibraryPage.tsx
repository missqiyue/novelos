import { useState } from "react";
import { Library, Zap, Tag, Rocket, ArrowRightLeft, Heart, TrendingUp } from "lucide-react";

interface WritingPattern {
  id: string;
  name: string;
  description: string;
  genres: string;
  icon: React.ReactNode;
}

const SEED_PATTERNS: WritingPattern[] = [
  {
    id: "three-chapter-climax",
    name: "三章小高潮",
    description: "每3章设置一个小爽点，保持读者持续兴奋，避免阅读疲劳",
    genres: "玄幻/都市",
    icon: <Zap size={18} />,
  },
  {
    id: "suspense-chain",
    name: "悬念链",
    description: "章末悬念 → 下章解答 → 新悬念，制造「根本停不下来」的追读体验",
    genres: "悬疑/灵异",
    icon: <ArrowRightLeft size={18} />,
  },
  {
    id: "gap-moe",
    name: "反差萌",
    description: "强者拥有可爱/笨拙的弱点，增强角色魅力和读者好感度",
    genres: "通用",
    icon: <Heart size={18} />,
  },
  {
    id: "face-slap-rhythm",
    name: "打脸节奏",
    description: "被轻视 → 证明自己 → 震惊众人 的循环模式，提供强烈的情绪释放",
    genres: "玄幻/都市",
    icon: <Rocket size={18} />,
  },
  {
    id: "emotional-rollercoaster",
    name: "情感过山车",
    description: "甜 → 虐 → 甜 的交替节奏，放大情感张力，增强读者共鸣",
    genres: "言情",
    icon: <TrendingUp size={18} />,
  },
  {
    id: "level-up-thrill",
    name: "升级快感",
    description: "清晰的等级体系 + 突破的爽感，让读者获得「变强」的代入体验",
    genres: "仙侠/玄幻",
    icon: <Rocket size={18} />,
  },
];

export function PatternLibraryPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const genreCategories = [...new Set(SEED_PATTERNS.flatMap((p) => p.genres.split("/")))];

  const filtered =
    selectedCategory === "all"
      ? SEED_PATTERNS
      : SEED_PATTERNS.filter((p) => p.genres.includes(selectedCategory));

  const handleApply = (pattern: WritingPattern) => {
    alert(
      `将在后续版本中支持将「${pattern.name}」模式应用到当前项目。\n\n适用题材: ${pattern.genres}`,
    );
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">爆款写作模式库</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            经过验证的网文写作节奏模式，可应用到您的项目中
          </p>
        </div>
      </div>

      {/* Genre filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`px-3 py-1 rounded-full text-xs transition-colors ${
            selectedCategory === "all"
              ? "bg-indigo-600 text-white"
              : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          全部 ({SEED_PATTERNS.length})
        </button>
        {genreCategories.map((genre) => (
          <button
            key={genre}
            onClick={() => setSelectedCategory(genre)}
            className={`px-3 py-1 rounded-full text-xs transition-colors ${
              selectedCategory === genre
                ? "bg-indigo-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {genre}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
          <Library size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400 text-sm">该题材暂无匹配的写作模式</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((pattern) => (
            <div
              key={pattern.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  {pattern.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-gray-900 text-sm">{pattern.name}</h3>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Tag size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-400">{pattern.genres}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed mb-4">{pattern.description}</p>

              <button
                onClick={() => handleApply(pattern)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs hover:bg-indigo-100 transition-colors"
              >
                <Rocket size={12} />
                应用到项目
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
