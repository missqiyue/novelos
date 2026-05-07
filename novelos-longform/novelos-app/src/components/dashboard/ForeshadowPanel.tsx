import { useEffect, useState } from "react";
import { ledgerApi, type ForeshadowItemInfo } from "../../lib/api";
import { Lightbulb, CheckCircle2, Clock, AlertTriangle, Star } from "lucide-react";

function ImportanceBadge({ level }: { level: number | null }) {
  if (level == null) return null;
  const stars = Math.max(1, Math.min(5, level));
  const colors: Record<number, string> = {
    1: "text-gray-400",
    2: "text-blue-400",
    3: "text-yellow-500",
    4: "text-orange-500",
    5: "text-red-500",
  };
  return (
    <span
      className={`flex items-center gap-0.5 ${colors[stars] || "text-gray-400"}`}
      title={`重要性: ${stars}/5`}
    >
      {Array.from({ length: stars }).map((_, i) => (
        <Star key={i} size={10} fill="currentColor" />
      ))}
    </span>
  );
}

export function ForeshadowPanel() {
  const [items, setItems] = useState<ForeshadowItemInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await ledgerApi.listForeshadowItems();
        setItems(all);
      } catch (e: any) {
        setError(e.toString());
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const planted = items.filter((f) => f.status === "planted");
  const resolved = items.filter((f) => f.status === "resolved");
  const overdue = items.filter((f) => f.status === "overdue");

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <Lightbulb size={32} className="mx-auto mb-3 animate-pulse" />
        <p>加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-400">
        <AlertTriangle size={32} className="mx-auto mb-3" />
        <p>加载失败: {error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-gray-400">
        <Lightbulb size={48} className="mx-auto mb-4" />
        <p>暂无伏笔数据</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">伏笔总览</h2>
      <p className="text-sm text-gray-500 mb-4">
        共 {items.length} 条伏笔，已回收 {resolved.length} 条
        {overdue.length > 0 && (
          <span className="text-red-500 ml-1">，超期 {overdue.length} 条</span>
        )}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 待回收 (planted) */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-blue-600" />
              <span className="font-medium text-blue-900 text-sm">待回收</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              {planted.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {planted.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">暂无待回收伏笔</div>
            ) : (
              planted.map((item) => (
                <div key={item.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 flex-1">{item.title}</span>
                    <ImportanceBadge level={item.importance} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>播种: 第{item.seed_chapter}章</span>
                    {item.maturity_condition && (
                      <span className="truncate max-w-[150px]" title={item.maturity_condition}>
                        | 触发: {item.maturity_condition}
                      </span>
                    )}
                  </div>
                  {item.notes && (
                    <div className="mt-1 text-xs text-gray-500 truncate" title={item.notes}>
                      {item.notes}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* 已回收 (resolved) */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600" />
              <span className="font-medium text-green-900 text-sm">已回收</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              {resolved.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {resolved.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">暂无已回收伏笔</div>
            ) : (
              resolved.map((item) => (
                <div key={item.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 flex-1">{item.title}</span>
                    <ImportanceBadge level={item.importance} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>播种: 第{item.seed_chapter}章</span>
                    {item.resolved_chapter != null && (
                      <span className="text-green-600">| 回收: 第{item.resolved_chapter}章</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 超期 (overdue) */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
              <span className="font-medium text-red-900 text-sm">超期</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
              {overdue.length}
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {overdue.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">暂无超期伏笔</div>
            ) : (
              overdue.map((item) => (
                <div key={item.id} className="px-4 py-3 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800 flex-1">{item.title}</span>
                    <ImportanceBadge level={item.importance} />
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                    <span>播种: 第{item.seed_chapter}章</span>
                    <span className="text-red-500">| 超期未回收</span>
                  </div>
                  {item.maturity_condition && (
                    <div
                      className="mt-1 text-xs text-red-400 truncate"
                      title={item.maturity_condition}
                    >
                      回收条件: {item.maturity_condition}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
