import { useState, useEffect } from "react";
import { llmApi, type TokenUsageSummary } from "../../lib/api";
import { Coins, Zap, BarChart3 } from "lucide-react";

export function TokenUsage() {
  const [usage, setUsage] = useState<TokenUsageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setUsage(await llmApi.getTokenUsage());
    } catch {
      /* no data */
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <div className="p-4 text-sm text-gray-400">加载中...</div>;
  if (!usage || usage.total_calls === 0)
    return <div className="p-4 text-sm text-gray-400">暂无LLM调用记录</div>;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Zap size={12} /> 总调用
          </div>
          <div className="text-xl font-bold text-gray-900">{usage.total_calls}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <BarChart3 size={12} /> 总Token
          </div>
          <div className="text-xl font-bold text-gray-900">
            {(usage.total_tokens / 1000).toFixed(0)}K
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <div className="text-xs text-gray-500 flex items-center gap-1">
            <Coins size={12} /> 预估费用
          </div>
          <div className="text-xl font-bold text-gray-900">
            ${usage.total_cost_estimate_usd.toFixed(2)}
          </div>
        </div>
      </div>

      {/* By agent */}
      {usage.by_agent.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1.5">按Agent用量</h4>
          <div className="space-y-1">
            {usage.by_agent.map((a) => (
              <div
                key={a.agent_name}
                className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded p-1.5"
              >
                <span className="text-gray-700">{a.agent_name}</span>
                <div className="flex items-center gap-2 text-gray-400">
                  <span>{a.calls}次</span>
                  <span>{(a.total_tokens / 1000).toFixed(1)}K</span>
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (a.total_tokens / Math.max(usage.total_tokens, 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By model */}
      {usage.by_model.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1.5">按模型用量</h4>
          <div className="space-y-1">
            {usage.by_model.map((m) => (
              <div
                key={m.model}
                className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded p-1.5"
              >
                <span className="text-gray-700">{m.model}</span>
                <div className="flex items-center gap-2 text-gray-400">
                  <span>{m.calls}次</span>
                  <span>{(m.total_tokens / 1000).toFixed(1)}K</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
