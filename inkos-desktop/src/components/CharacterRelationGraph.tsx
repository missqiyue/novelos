import { Users } from 'lucide-react';

export interface CharacterGraphNode {
  id: string;
  label: string;
  mentions: number;
}

export interface CharacterGraphEdge {
  source: string;
  target: string;
  weight: number;
}

export interface CharacterGraph {
  nodes: CharacterGraphNode[];
  edges: CharacterGraphEdge[];
}

interface CharacterRelationGraphProps {
  graph: CharacterGraph | null;
  maxNodes?: number;
}

export function CharacterRelationGraph({ graph, maxNodes = 12 }: CharacterRelationGraphProps) {
  const graphNodes = (graph?.nodes ?? []).slice(0, maxNodes);
  const graphNodeIndex = new Map(graphNodes.map((n) => [n.id, n]));
  const graphEdges = (graph?.edges ?? []).filter((e) => graphNodeIndex.has(e.source) && graphNodeIndex.has(e.target));
  const edgeMax = graphEdges.reduce((m, e) => Math.max(m, e.weight), 1);
  const nodeMax = graphNodes.reduce((m, n) => Math.max(m, n.mentions), 1);

  const svgW = 520;
  const svgH = 300;
  const cx = svgW / 2;
  const cy = svgH / 2;
  const r = 110;
  const nodePos = new Map(
    graphNodes.map((n, i) => {
      const angle = (Math.PI * 2 * i) / Math.max(graphNodes.length, 1) - Math.PI / 2;
      return [n.id, { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }];
    })
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
      <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex justify-between items-center">
        <h3 className="font-bold text-zinc-700 flex items-center text-sm">
          <Users className="w-4 h-4 mr-2 text-blue-500" />
          人物关系图谱
        </h3>
      </div>
      <div className="p-5">
        {graphNodes.length < 2 ? (
          <div className="text-sm text-zinc-400">暂无足够人物数据（先在“角色人物”录入角色，且正文/大纲中出现过）。</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="w-full">
              <svg className="w-full h-72 bg-white" viewBox={`0 0 ${svgW} ${svgH}`}>
                {graphEdges.map((e, idx) => {
                  const a = nodePos.get(e.source);
                  const b = nodePos.get(e.target);
                  if (!a || !b) return null;
                  const strokeWidth = 1 + (3 * e.weight) / edgeMax;
                  return (
                    <line
                      key={idx}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#c7d2fe"
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      opacity={0.85}
                    />
                  );
                })}
                {graphNodes.map((n) => {
                  const p = nodePos.get(n.id);
                  if (!p) return null;
                  const rr = 10 + (10 * n.mentions) / nodeMax;
                  return (
                    <g key={n.id}>
                      <circle cx={p.x} cy={p.y} r={rr} fill="#3b82f6" opacity={0.9} />
                      <text x={p.x} y={p.y + rr + 12} textAnchor="middle" fontSize="12" fill="#334155">
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-2">出场 Top</div>
                <div className="grid grid-cols-2 gap-2">
                  {graphNodes.map((n) => (
                    <div key={n.id} className="text-xs bg-zinc-50 border border-zinc-100 rounded px-2 py-1 flex items-center justify-between">
                      <span className="text-zinc-700 truncate">{n.label}</span>
                      <span className="text-zinc-400 ml-2">{n.mentions}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-500 mb-2">强关系 Top</div>
                <div className="space-y-2">
                  {graphEdges
                    .slice()
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 8)
                    .map((e, idx) => (
                      <div key={idx} className="text-xs bg-zinc-50 border border-zinc-100 rounded px-2 py-1 flex items-center justify-between">
                        <span className="text-zinc-700 truncate">
                          {e.source} · {e.target}
                        </span>
                        <span className="text-zinc-400 ml-2">{e.weight}</span>
                      </div>
                    ))}
                </div>
              </div>
              <div className="text-[10px] text-zinc-400">计算口径：统计最近若干章中人物共现（同章出现）次数，权重越高表示同场景共现越多。</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

