import React from "react";

/**
 * Chapter state machine visualization.
 * Renders a simple SVG-based state diagram showing valid transitions.
 */

const STATES = [
  { id: "task_ready", label: "任务就绪", x: 80, y: 40 },
  { id: "draft_generated", label: "草稿已生成", x: 280, y: 40 },
  { id: "compile_failed", label: "编译失败", x: 480, y: 40 },
  { id: "review_pending", label: "待评审", x: 480, y: 160 },
  { id: "rewrite_required", label: "需重写", x: 280, y: 160 },
  { id: "approved", label: "已通过", x: 480, y: 280 },
  { id: "needs_human", label: "需人工", x: 80, y: 160 },
  { id: "archived", label: "已归档", x: 680, y: 280 },
  { id: "needs_revalidate", label: "需重验证", x: 680, y: 160 },
] as const;

const TRANSITIONS = [
  { from: "task_ready", to: "draft_generated", label: "生成草稿" },
  { from: "draft_generated", to: "compile_failed", label: "编译失败" },
  { from: "draft_generated", to: "review_pending", label: "编译通过" },
  { from: "compile_failed", to: "rewrite_required", label: "重写" },
  { from: "compile_failed", to: "needs_human", label: "人工介入" },
  { from: "rewrite_required", to: "draft_generated", label: "重写完成" },
  { from: "review_pending", to: "approved", label: "评审通过" },
  { from: "review_pending", to: "rewrite_required", label: "评审否决" },
  { from: "review_pending", to: "needs_human", label: "分歧" },
  { from: "approved", to: "archived", label: "归档" },
  { from: "archived", to: "needs_revalidate", label: "Retcon" },
  { from: "needs_revalidate", to: "review_pending", label: "重编译" },
] as const;

interface StateMachineDiagramProps {
  currentState?: string;
}

export const StateMachineDiagram: React.FC<StateMachineDiagramProps> = ({ currentState }) => {
  const stateMap = Object.fromEntries(STATES.map(s => [s.id, s]));

  return (
    <svg viewBox="0 0 800 340" className="w-full h-auto">
      {/* Arrows */}
      {TRANSITIONS.map((t, i) => {
        const from = stateMap[t.from];
        const to = stateMap[t.to];
        if (!from || !to) return null;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        const x1 = from.x + ux * 50;
        const y1 = from.y + uy * 24;
        const x2 = to.x - ux * 50;
        const y2 = to.y - uy * 24;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;

        return (
          <g key={i}>
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#64748b" strokeWidth={1.5} markerEnd="url(#arrow)"
            />
            <text x={mx} y={my - 6} textAnchor="middle" fontSize={10} fill="#94a3b8">
              {t.label}
            </text>
          </g>
        );
      })}

      {/* Arrow marker */}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
        </marker>
      </defs>

      {/* State nodes */}
      {STATES.map(s => {
        const isCurrent = s.id === currentState;
        return (
          <g key={s.id}>
            <rect
              x={s.x - 48} y={s.y - 18} width={96} height={36} rx={8}
              fill={isCurrent ? "#3b82f6" : "#1e293b"}
              stroke={isCurrent ? "#60a5fa" : "#334155"}
              strokeWidth={isCurrent ? 2 : 1}
            />
            <text
              x={s.x} y={s.y + 4} textAnchor="middle"
              fontSize={12} fill={isCurrent ? "#ffffff" : "#e2e8f0"}
              fontWeight={isCurrent ? "bold" : "normal"}
            >
              {s.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
