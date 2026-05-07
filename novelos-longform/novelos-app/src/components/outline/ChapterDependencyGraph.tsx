import { useEffect, useState, useCallback, useMemo } from "react";
import { useChapterStore } from "../../stores";
import {
  chapterApi,
  ledgerApi,
  type ChapterInfo,
  type CharacterInfo,
  type ForeshadowItemInfo,
} from "../../lib/api";
import { BookOpen, FileText, Loader2, AlertTriangle, GitBranch } from "lucide-react";

// ─── Types ───

interface Edge {
  from: number;
  to: number;
  type: "sequential" | "shared_characters" | "foreshadow";
}

interface ChapterNode {
  chapterNumber: number;
  title: string | null;
  status: string;
  wordCount: number | null;
  x: number;
  y: number;
}

// ─── Constants ───

const NODES_PER_ROW = 8;
const NODE_SIZE = 44;
const H_GAP = 72;
const V_GAP = 80;
const PADDING = 40;

// ─── Status helpers ───

function nodeColor(status: string): string {
  switch (status) {
    case "finalized":
    case "approved":
    case "archived":
      return "border-green-500 text-green-700 bg-green-50";
    case "draft_generated":
    case "review_pending":
    case "task_ready":
      return "border-yellow-500 text-yellow-700 bg-yellow-50";
    case "compile_failed":
    case "rewrite_required":
    case "needs_revalidate":
      return "border-red-500 text-red-700 bg-red-50";
    default:
      return "border-gray-300 text-gray-600 bg-gray-50";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "finalized":
    case "approved":
    case "archived":
      return "已定稿";
    case "draft_generated":
    case "review_pending":
    case "task_ready":
      return "草稿中";
    case "compile_failed":
    case "rewrite_required":
    case "needs_revalidate":
      return "需修复";
    default:
      return status;
  }
}

// ─── Helpers ───

function findCharactersInText(text: string, characters: CharacterInfo[]): string[] {
  if (!text) return [];
  const found: string[] = [];
  const lowerText = text.toLowerCase();
  for (const char of characters) {
    if (lowerText.includes(char.name.toLowerCase())) {
      found.push(char.name);
    }
  }
  return found;
}

// ─── Main Component ───

export function ChapterDependencyGraph() {
  const {
    chapters,
    loading: chaptersLoading,
    error: chaptersError,
    fetchChapters,
  } = useChapterStore();

  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [chapterChars, setChapterChars] = useState<Map<number, string[]>>(new Map());
  const [foreshadows, setForeshadows] = useState<ForeshadowItemInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<ChapterNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  // Load character names and foreshadows
  const loadData = useCallback(async () => {
    if (chapters.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch characters
      let chars: CharacterInfo[] = [];
      try {
        chars = await chapterApi.listCharacters();
        setCharacters(chars);
      } catch {
        // OK if no characters
      }

      // Fetch foreshadows
      let fItems: ForeshadowItemInfo[] = [];
      try {
        fItems = await ledgerApi.listForeshadowItems();
        setForeshadows(fItems);
      } catch {
        // OK if none
      }

      // Fetch chapter texts for character matching (bounded to 30 chapters)
      const chaptersToFetch = chapters.slice(0, 30);
      const charMap = new Map<number, string[]>();

      for (const ch of chaptersToFetch) {
        try {
          const detail = await chapterApi.getChapter(ch.chapter_number);
          const text = detail.final_text || detail.draft_text || "";
          const found = findCharactersInText(text, chars);
          charMap.set(ch.chapter_number, found);
        } catch {
          // Skip
        }
      }

      setChapterChars(charMap);
    } catch (e: any) {
      setError(e?.toString() || "加载依赖数据时出错");
    } finally {
      setLoading(false);
    }
  }, [chapters]);

  useEffect(() => {
    if (chapters.length > 0) {
      loadData();
    }
  }, [chapters.length, loadData]);

  // Build edges
  const edges: Edge[] = useMemo(() => {
    const result: Edge[] = [];
    if (chapters.length === 0) return result;

    const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);

    // Sequential edges
    for (let i = 0; i < sortedChapters.length - 1; i++) {
      result.push({
        from: sortedChapters[i].chapter_number,
        to: sortedChapters[i + 1].chapter_number,
        type: "sequential",
      });
    }

    // Shared character edges
    const chapterNums = sortedChapters.map((c) => c.chapter_number);
    for (let i = 0; i < chapterNums.length; i++) {
      const charsI = chapterChars.get(chapterNums[i]) || [];
      if (charsI.length === 0) continue;
      for (let j = i + 1; j < chapterNums.length; j++) {
        const charsJ = chapterChars.get(chapterNums[j]) || [];
        if (charsJ.length === 0) continue;
        const shared = charsI.filter((c) => charsJ.includes(c));
        if (shared.length > 0) {
          result.push({
            from: chapterNums[i],
            to: chapterNums[j],
            type: "shared_characters",
          });
        }
      }
    }

    // Foreshadow edges
    for (const f of foreshadows) {
      if (f.resolved_chapter != null && f.seed_chapter !== f.resolved_chapter) {
        result.push({
          from: f.seed_chapter,
          to: f.resolved_chapter,
          type: "foreshadow",
        });
      }
    }

    return result;
  }, [chapters, chapterChars, foreshadows]);

  // Build node positions
  const nodes: ChapterNode[] = useMemo(() => {
    if (chapters.length === 0) return [];

    const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);

    return sorted.map((ch, index) => {
      const row = Math.floor(index / NODES_PER_ROW);
      const col = index % NODES_PER_ROW;
      return {
        chapterNumber: ch.chapter_number,
        title: ch.title,
        status: ch.status,
        wordCount: ch.word_count,
        x: PADDING + col * H_GAP + NODE_SIZE / 2,
        y: PADDING + row * V_GAP + NODE_SIZE / 2,
      };
    });
  }, [chapters]);

  // Compute edge lines
  const edgeLines = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.chapterNumber, n]));
    return edges
      .map((edge) => {
        const fromNode = nodeMap.get(edge.from);
        const toNode = nodeMap.get(edge.to);
        if (!fromNode || !toNode) return null;
        return {
          ...edge,
          x1: fromNode.x,
          y1: fromNode.y,
          x2: toNode.x,
          y2: toNode.y,
        };
      })
      .filter(Boolean) as (Edge & { x1: number; y1: number; x2: number; y2: number })[];
  }, [edges, nodes]);

  // SVG dimensions
  const svgWidth = PADDING * 2 + NODES_PER_ROW * H_GAP;
  const totalRows = Math.ceil(chapters.length / NODES_PER_ROW);
  const svgHeight = PADDING * 2 + totalRows * V_GAP;

  const edgeColor = (type: string): string => {
    switch (type) {
      case "sequential":
        return "#d1d5db"; // gray-300
      case "shared_characters":
        return "#3b82f6"; // blue-500
      case "foreshadow":
        return "#a855f7"; // purple-500
      default:
        return "#d1d5db";
    }
  };

  const edgeWidth = (type: string): number => {
    switch (type) {
      case "sequential":
        return 1;
      case "shared_characters":
        return 1.5;
      case "foreshadow":
        return 2;
      default:
        return 1;
    }
  };

  // ─── Loading ───
  if (chaptersLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Error ───
  if (chaptersError || error) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700">{chaptersError || error}</p>
        </div>
      </div>
    );
  }

  // ─── Empty ───
  if (chapters.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center py-16 text-gray-400">
          <BookOpen size={48} className="mx-auto mb-4" />
          <p className="text-lg font-medium">暂无章节数据</p>
          <p className="text-sm mt-1">请先创建章节</p>
        </div>
      </div>
    );
  }

  // Edge count summary
  const sequentialCount = edges.filter((e) => e.type === "sequential").length;
  const sharedCount = edges.filter((e) => e.type === "shared_characters").length;
  const foreshadowCount = edges.filter((e) => e.type === "foreshadow").length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <GitBranch size={22} className="text-indigo-600" />
          章节依赖图
        </h1>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{chapters.length} 个章节</span>
          <span className="text-gray-300">|</span>
          <span>{edges.length} 条边</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-gray-300" />
          <span className="text-gray-600">顺序依赖</span>
          <span className="text-gray-400">({sequentialCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-blue-500" />
          <span className="text-gray-600">共享角色</span>
          <span className="text-gray-400">({sharedCount})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 bg-purple-500" />
          <span className="text-gray-600">伏笔关联</span>
          <span className="text-gray-400">({foreshadowCount})</span>
        </div>
      </div>

      {/* Graph container */}
      <div
        className="relative bg-white border border-gray-200 rounded-lg overflow-auto"
        style={{ minHeight: "400px" }}
      >
        <div className="relative" style={{ width: svgWidth, height: svgHeight, minWidth: "100%" }}>
          {/* SVG edges layer */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={svgWidth}
            height={svgHeight}
            style={{ overflow: "visible" }}
          >
            {edgeLines.map((edge, i) => (
              <line
                key={`${edge.type}-${edge.from}-${edge.to}-${i}`}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={edgeColor(edge.type)}
                strokeWidth={edgeWidth(edge.type)}
                strokeOpacity={edge.type === "sequential" ? 0.6 : 0.8}
                strokeDasharray={edge.type === "foreshadow" ? "4 2" : undefined}
              />
            ))}
          </svg>

          {/* Nodes layer */}
          {nodes.map((node) => (
            <div
              key={node.chapterNumber}
              className="absolute flex flex-col items-center"
              style={{
                left: node.x - NODE_SIZE / 2,
                top: node.y - NODE_SIZE / 2,
              }}
              onMouseEnter={(e) => {
                setHoveredNode(node);
                setTooltipPos({ x: node.x + NODE_SIZE / 2 + 8, y: node.y - NODE_SIZE / 2 });
              }}
              onMouseLeave={() => setHoveredNode(null)}
            >
              <div
                className={`flex items-center justify-center w-[44px] h-[44px] rounded-full border-2 text-xs font-bold cursor-pointer transition-transform hover:scale-110 ${nodeColor(node.status)}`}
                title={`第${node.chapterNumber}章${node.title ? `: ${node.title}` : ""}`}
              >
                {node.chapterNumber}
              </div>
            </div>
          ))}

          {/* Tooltip */}
          {hoveredNode && (
            <div
              className="absolute z-20 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none whitespace-nowrap"
              style={{
                left: tooltipPos.x,
                top: tooltipPos.y,
              }}
            >
              <p className="font-medium">
                第{hoveredNode.chapterNumber}章{hoveredNode.title ? `: ${hoveredNode.title}` : ""}
              </p>
              <p className="text-gray-300 mt-0.5">
                {statusLabel(hoveredNode.status)}
                {hoveredNode.wordCount != null && (
                  <> &middot; {hoveredNode.wordCount.toLocaleString()} 字</>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
