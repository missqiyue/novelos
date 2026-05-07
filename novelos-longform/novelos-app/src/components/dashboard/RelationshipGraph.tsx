import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { useChapterStore, useCanonStore } from "../../stores";
import { ledgerApi, type RelationshipStateInfo, type CharacterInfo } from "../../lib/api";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";

interface GraphNode {
  id: string;
  name: string;
  roleType: string;
  identityCore?: string | null;
  stateCount: number;
}

interface GraphLink {
  source: string;
  target: string;
  relationType: string;
  trustScore?: number | null;
  conflictScore?: number | null;
}

const roleColors: Record<string, string> = {
  protagonist: "#6366f1",
  supporting: "#8b5cf6",
  antagonist: "#ef4444",
  villain: "#dc2626",
  cameo: "#9ca3af",
};

function getRoleColor(role: string): string {
  return roleColors[role] || "#6b7280";
}

export function RelationshipGraph() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const { characters, fetchCharacters } = useChapterStore();

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  useEffect(() => {
    if (characters.length === 0) return;
    buildGraph();
  }, [characters]);

  const buildGraph = async () => {
    let relationships: RelationshipStateInfo[] = [];
    try {
      relationships = await ledgerApi.listRelationshipStates();
    } catch {
      /* no relationships yet */
    }

    const nodes: GraphNode[] = characters
      .filter((c) => c.status === "active")
      .map((c) => ({
        id: c.id,
        name: c.name,
        roleType: c.role_type,
        identityCore: c.identity_core,
        stateCount: 0,
      }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = relationships
      .filter((r) => nodeIds.has(r.source_character_id) && nodeIds.has(r.target_character_id))
      .map((r) => ({
        source: r.source_character_id,
        target: r.target_character_id,
        relationType: r.relation_type,
        trustScore: r.trust_score,
        conflictScore: r.conflict_score,
      }));

    // If no relationships exist, create a default star layout
    if (links.length === 0 && nodes.length > 1) {
      const center = nodes[0];
      for (let i = 1; i < nodes.length; i++) {
        links.push({
          source: center.id,
          target: nodes[i].id,
          relationType: "unknown",
        });
      }
    }

    renderGraph(nodes, links);
  };

  const renderGraph = (nodes: GraphNode[], links: GraphLink[]) => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current) as any;
    svg.selectAll("*").remove();

    const width = svgRef.current?.clientWidth || 800;
    const height = svgRef.current?.clientHeight || 600;

    const g = svg.append("g");

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (event: any) => {
        g.attr("transform", event.transform);
        setZoomLevel(Math.round(event.transform.k * 100) / 100);
      });

    svg.call(zoom);
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2));

    // Arrow markers for directed edges
    svg
      .append("defs")
      .selectAll("marker")
      .data(["ally", "enemy", "neutral", "lovers", "master_student", "family", "unknown"])
      .join("marker")
      .attr("id", (d: any) => `arrow-${d}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 28)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", (d: string) => {
        const colors: Record<string, string> = {
          ally: "#22c55e",
          enemy: "#ef4444",
          neutral: "#9ca3af",
          lovers: "#ec4899",
          master_student: "#f59e0b",
          family: "#8b5cf6",
          unknown: "#d1d5db",
        };
        return colors[d] || "#d1d5db";
      });

    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((d: any) => d.id)
          .distance(150),
      )
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(0, 0))
      .force("collision", d3.forceCollide().radius(40));

    // Links
    const link = g
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d: GraphLink) => {
        const colors: Record<string, string> = {
          ally: "#22c55e",
          enemy: "#ef4444",
          neutral: "#9ca3af",
          lovers: "#ec4899",
          master_student: "#f59e0b",
          family: "#8b5cf6",
          unknown: "#d1d5db",
        };
        return colors[d.relationType] || "#d1d5db";
      })
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", (d: GraphLink) => (d.relationType === "unknown" ? "4,4" : "none"))
      .attr("marker-end", (d: GraphLink) =>
        d.relationType !== "unknown" ? `url(#arrow-${d.relationType})` : null,
      );

    // Link labels
    const linkLabel = g
      .append("g")
      .selectAll("text")
      .data(links)
      .join("text")
      .text((d: GraphLink) => (d.relationType === "unknown" ? "" : d.relationType))
      .attr("font-size", 8)
      .attr("fill", "#9ca3af")
      .attr("text-anchor", "middle")
      .attr("dy", -5);

    // Nodes
    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3
          .drag<any, any>()
          .on("start", (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event: any, d: any) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }) as any,
      );

    // Node circles
    node
      .append("circle")
      .attr("r", (d: GraphNode) =>
        d.roleType === "protagonist" ? 28 : d.roleType === "antagonist" ? 24 : 20,
      )
      .attr("fill", (d: GraphNode) => getRoleColor(d.roleType))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("opacity", 0.9);

    // Node labels
    node
      .append("text")
      .text((d: GraphNode) => d.name)
      .attr("text-anchor", "middle")
      .attr("dy", (d: GraphNode) => (d.roleType === "protagonist" ? 38 : 32))
      .attr("font-size", 11)
      .attr("fill", "#374151")
      .attr("font-weight", 500);

    // Role type badges
    node
      .append("text")
      .text((d: GraphNode) => d.roleType)
      .attr("text-anchor", "middle")
      .attr("dy", (d: GraphNode) => (d.roleType === "protagonist" ? -34 : -28))
      .attr("font-size", 8)
      .attr("fill", "#fff")
      .attr("font-weight", 600);

    node.on("click", (_event: any, d: any) => setSelectedNode(d));

    // Tooltip on hover
    node
      .append("title")
      .text((d: GraphNode) => `${d.name}\n${d.roleType}\n${d.identityCore || ""}`);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkLabel
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 relative">
        <div className="absolute top-2 right-2 flex gap-1 z-10">
          <button
            onClick={() => {
              const svg = d3.select(svgRef.current);
              svg
                .transition()
                .duration(300)
                .call(d3.zoom<SVGSVGElement, unknown>().scaleBy as any, 1.3);
            }}
            className="p-1.5 bg-white rounded shadow hover:bg-gray-50"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => {
              const svg = d3.select(svgRef.current);
              svg
                .transition()
                .duration(300)
                .call(d3.zoom<SVGSVGElement, unknown>().scaleBy as any, 0.7);
            }}
            className="p-1.5 bg-white rounded shadow hover:bg-gray-50"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => {
              const svg = d3.select(svgRef.current);
              const w = svgRef.current?.clientWidth || 800;
              const h = svgRef.current?.clientHeight || 600;
              svg
                .transition()
                .duration(500)
                .call(
                  d3.zoom<SVGSVGElement, unknown>().transform as any,
                  d3.zoomIdentity.translate(w / 2, h / 2).scale(1),
                );
            }}
            className="p-1.5 bg-white rounded shadow hover:bg-gray-50"
          >
            <Maximize2 size={14} />
          </button>
        </div>
        <svg ref={svgRef} className="w-full h-full" />
        <div className="absolute bottom-3 left-3 bg-white/80 rounded px-2 py-1 text-xs text-gray-400">
          缩放: {zoomLevel}x | 拖拽节点可调整位置
        </div>
      </div>

      {/* Sidebar: node details */}
      {selectedNode && (
        <div className="w-64 border-l border-gray-200 bg-white p-4 overflow-auto shrink-0">
          <h3 className="font-semibold text-gray-900 mb-2">{selectedNode.name}</h3>
          <div className="space-y-1.5 text-sm">
            <p className="text-gray-500">
              角色类型: <span className="text-gray-700">{selectedNode.roleType}</span>
            </p>
            {selectedNode.identityCore && (
              <p className="text-gray-500">
                身份核心: <span className="text-gray-700">{selectedNode.identityCore}</span>
              </p>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div
              className="w-4 h-4 rounded-full inline-block mr-2"
              style={{ backgroundColor: getRoleColor(selectedNode.roleType) }}
            />
            <span className="text-xs text-gray-400">{selectedNode.roleType}</span>
          </div>
          <button
            onClick={() => setSelectedNode(null)}
            className="mt-4 text-xs text-indigo-600 hover:underline"
          >
            关闭详情
          </button>
        </div>
      )}
    </div>
  );
}
