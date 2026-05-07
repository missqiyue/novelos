import { useState } from "react";
import { Search, ShieldAlert, ShieldX, ShieldCheck, AlertTriangle } from "lucide-react";

interface BannedName {
  id: string;
  name: string;
  reason: string;
  ban_level: "high" | "medium" | "low";
}

const MOCK_BANNED_NAMES: BannedName[] = [
  { id: "1", name: "毛泽东", reason: "政治敏感人物", ban_level: "high" },
  { id: "2", name: "习近平", reason: "现任国家领导人", ban_level: "high" },
  { id: "3", name: "邓小平", reason: "历史政治人物", ban_level: "high" },
  { id: "4", name: "江泽民", reason: "历史政治人物", ban_level: "medium" },
  { id: "5", name: "胡锦涛", reason: "历史政治人物", ban_level: "medium" },
  { id: "6", name: "周恩来", reason: "历史政治人物", ban_level: "medium" },
  { id: "7", name: "希特勒", reason: "敏感历史人物", ban_level: "high" },
  { id: "8", name: "川普", reason: "现任外国领导人", ban_level: "low" },
  { id: "9", name: "普京", reason: "现任外国领导人", ban_level: "low" },
  { id: "10", name: "金正恩", reason: "现任外国领导人", ban_level: "low" },
];

const banLevelLabels: Record<string, string> = {
  high: "高危",
  medium: "中危",
  low: "低危",
};

const banLevelStyles: Record<string, { badge: string; icon: React.ReactNode }> = {
  high: {
    badge: "bg-red-100 text-red-700",
    icon: <ShieldX size={14} className="text-red-500" />,
  },
  medium: {
    badge: "bg-yellow-100 text-yellow-700",
    icon: <ShieldAlert size={14} className="text-yellow-500" />,
  },
  low: {
    badge: "bg-blue-100 text-blue-700",
    icon: <ShieldCheck size={14} className="text-blue-500" />,
  },
};

export function BannedNamesPage() {
  const [search, setSearch] = useState("");

  const filtered = MOCK_BANNED_NAMES.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.reason.toLowerCase().includes(q);
  });

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">敏感人名单管理</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            管理系统检测到的禁用人物名称，避免AI生成内容中出现敏感信息
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

      {/* Search & count */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索人名或原因..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-xs text-gray-400">
          {filtered.length} / {MOCK_BANNED_NAMES.length} 条
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
          <span className="col-span-4">人名</span>
          <span className="col-span-4">原因</span>
          <span className="col-span-4">风险等级</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">未找到匹配的敏感人名</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((item) => {
              const levelStyle = banLevelStyles[item.ban_level];
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm hover:bg-gray-50"
                >
                  <span className="col-span-4 flex items-center gap-2">
                    {levelStyle.icon}
                    <span className="font-medium text-gray-800">{item.name}</span>
                  </span>
                  <span className="col-span-4 text-gray-600">{item.reason}</span>
                  <span className="col-span-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${levelStyle.badge}`}>
                      {banLevelLabels[item.ban_level]}
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
