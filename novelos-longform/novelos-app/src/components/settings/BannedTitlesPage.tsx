import { useState } from "react";
import { Search, AlertTriangle, Flame, TrendingUp, Thermometer, BookX } from "lucide-react";

interface BannedTitle {
  id: string;
  title: string;
  reason: string;
  heat_level: "extreme" | "high" | "medium";
}

const MOCK_BANNED_TITLES: BannedTitle[] = [
  { id: "1", title: "重生之我是秦始皇", reason: "涉及历史政治人物恶搞", heat_level: "extreme" },
  { id: "2", title: "穿越成习近平秘书", reason: "涉及现任国家领导人", heat_level: "extreme" },
  { id: "3", title: "我和习近平做网友", reason: "涉及现任国家领导人", heat_level: "extreme" },
  { id: "4", title: "六四之恋", reason: "敏感历史事件", heat_level: "extreme" },
  { id: "5", title: "法轮功修炼日记", reason: "涉及非法组织", heat_level: "extreme" },
  { id: "6", title: "天安门之恋", reason: "可能引起不当联想", heat_level: "high" },
  { id: "7", title: "老江秘史", reason: "涉及历史政治人物", heat_level: "high" },
  { id: "8", title: "黑帮太子爷", reason: "可能美化黑恶势力", heat_level: "high" },
  { id: "9", title: "毒枭的日常", reason: "可能美化违法行为", heat_level: "high" },
  { id: "10", title: "末世种马传", reason: "低俗暗示", heat_level: "medium" },
  { id: "11", title: "总裁的玩物", reason: "低俗暗示，物化女性", heat_level: "medium" },
  { id: "12", title: "床上征服全世界", reason: "低俗色情暗示", heat_level: "medium" },
];

const heatLevelLabels: Record<string, string> = {
  extreme: "极高风险",
  high: "高风险",
  medium: "中风险",
};

const heatLevelStyles: Record<string, { badge: string; icon: React.ReactNode }> = {
  extreme: {
    badge: "bg-red-100 text-red-700",
    icon: <Flame size={14} className="text-red-500" />,
  },
  high: {
    badge: "bg-orange-100 text-orange-700",
    icon: <TrendingUp size={14} className="text-orange-500" />,
  },
  medium: {
    badge: "bg-yellow-100 text-yellow-700",
    icon: <Thermometer size={14} className="text-yellow-500" />,
  },
};

export function BannedTitlesPage() {
  const [search, setSearch] = useState("");
  const [heatFilter, setHeatFilter] = useState<string>("");

  const filtered = MOCK_BANNED_TITLES.filter((item) => {
    if (heatFilter && item.heat_level !== heatFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return item.title.toLowerCase().includes(q) || item.reason.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">敏感书名管理</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            管理系统检测到的禁用书名，避免生成的章节标题或项目名称中出现违规内容
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          当前为只读预览模式，数据来自本地示例。编辑/CRUD功能将在后续版本中添加。
        </p>
      </div>

      {/* Search & filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索书名或原因..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={heatFilter}
          onChange={(e) => setHeatFilter(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">全部风险等级</option>
          <option value="extreme">极高风险</option>
          <option value="high">高风险</option>
          <option value="medium">中风险</option>
        </select>
        <span className="text-xs text-gray-400">
          {filtered.length} / {MOCK_BANNED_TITLES.length} 条
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
          <span className="col-span-5">书名</span>
          <span className="col-span-4">原因</span>
          <span className="col-span-3">风险等级</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">未找到匹配的敏感书名</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((item) => {
              const style = heatLevelStyles[item.heat_level];
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm hover:bg-gray-50"
                >
                  <span className="col-span-5 flex items-center gap-2">
                    {style.icon}
                    <span className="font-medium text-gray-800 truncate">{item.title}</span>
                  </span>
                  <span className="col-span-4 text-gray-600 text-xs">{item.reason}</span>
                  <span className="col-span-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${style.badge}`}>
                      {heatLevelLabels[item.heat_level]}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
