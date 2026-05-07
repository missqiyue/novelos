import React, { useState } from "react";
import { useGodEyeStore } from "../store/godeye/store";
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ReactECharts from "echarts-for-react";
import * as diff from "diff";
import { Lock, Unlock, Edit3, Volume2, RefreshCw, BarChart2, Target, Play, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";

import { useChatStore } from "../store/chat/store";

// -- 4.3 细纲节拍表 --
function SortableBeatItem({ beat }: { beat: any }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: beat.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="p-3 mb-2 bg-card border border-border rounded shadow-sm cursor-move flex items-center justify-between"
    >
      <div>
        <h4 className="font-bold text-sm">{beat.title}</h4>
        <p className="text-xs text-muted-foreground">{beat.description}</p>
      </div>
      <div className="text-xs font-mono bg-primary/10 text-primary px-2 py-1 rounded">
        情绪值: {beat.emotion}
      </div>
    </div>
  );
}

function BeatSheetModal({ bookId, chapterNumber }: { bookId: string; chapterNumber: number }) {
  const { isBeatSheetOpen, setBeatSheetOpen, beats, setBeats } = useGodEyeStore();

  React.useEffect(() => {
    if (isBeatSheetOpen && bookId && beats.length === 0) {
      // 这里应该调用 API 提取当前章节的真实节拍表 (如 outline/xxx_beats.json)
      // 目前后端暂未暴露读取细纲的接口，展示提示信息
      setBeats([
        { id: 'b0', title: `第 ${chapterNumber} 章 暂无节拍表数据`, description: '后端暂未提供细纲/节拍表读取接口', emotion: 0 }
      ]);
    }
  }, [isBeatSheetOpen, bookId, chapterNumber, beats.length, setBeats]);

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = beats.findIndex((b) => b.id === active.id);
      const newIndex = beats.findIndex((b) => b.id === over.id);
      const newBeats = [...beats];
      const [removed] = newBeats.splice(oldIndex, 1);
      newBeats.splice(newIndex, 0, removed);
      setBeats(newBeats);
    }
  };

  return (
    <Dialog open={isBeatSheetOpen} onOpenChange={setBeatSheetOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>细纲节拍表拦截审批</DialogTitle>
        </DialogHeader>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={beats} strategy={verticalListSortingStrategy}>
            <div className="max-h-[60vh] overflow-y-auto pr-2 mt-4">
              {beats.map((beat) => (
                <SortableBeatItem key={beat.id} beat={beat} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </DialogContent>
    </Dialog>
  );
}

// -- 4.2 手术刀编辑 --
function ScalpelEditor({ bookId, chapterNumber }: { bookId: string; chapterNumber: number }) {
  const [paragraphs, setParagraphs] = useState<{ id: string, text: string }[]>([]);
  const { lockedParagraphs, toggleParagraphLock, inlineFeedback, setInlineFeedback } = useGodEyeStore();

  React.useEffect(() => {
    if (!bookId) return;
    const fetchChapter = async () => {
      try {
        const encId = encodeURIComponent(bookId);
        
        const chapRes = await fetch(`/api/v1/books/${encId}/chapters/${chapterNumber}`);
        if (chapRes.ok) {
          const chapData = await chapRes.json();
          if (chapData.content) {
            const lines = chapData.content.split('\n').filter((l: string) => l.trim().length > 0);
            setParagraphs(lines.map((l: string, i: number) => ({ id: `p-${i}`, text: l.trim() })));
            return;
          }
        }
        
        // 找不到章节时，清空
        setParagraphs([{ id: 'p-0', text: `第 ${chapterNumber} 章 暂无章节数据可供编辑` }]);
      } catch (e) {
        console.error(e);
      }
    };
    fetchChapter();
  }, [bookId, chapterNumber]);

  return (
    <div className="bg-card border border-border rounded-xl p-6 h-full flex flex-col min-h-0">
      <h3 className="text-lg font-serif mb-4 flex items-center gap-2 shrink-0">
        <Edit3 size={20} className="text-primary" />
        手术刀编辑
      </h3>
      <div className="flex-1 overflow-y-auto space-y-4 pr-2 min-h-0">
        {paragraphs.map((p) => (
          <div
            key={p.id}
            className={`p-4 rounded-lg border transition-colors relative group ${
              lockedParagraphs[p.id] ? "bg-secondary/30 border-primary/30" : "bg-background border-border/50 hover:border-primary/50"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <p className={`text-sm leading-relaxed ${lockedParagraphs[p.id] ? "text-muted-foreground" : "text-foreground"}`}>
                {p.text}
              </p>
              <button
                onClick={() => toggleParagraphLock(p.id)}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="锁定段落块"
              >
                {lockedParagraphs[p.id] ? <Lock size={16} className="text-primary" /> : <Unlock size={16} />}
              </button>
            </div>
            
            <div className="mt-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button className="text-xs bg-secondary hover:bg-primary/20 text-foreground px-2 py-1 rounded flex items-center gap-1">
                <RefreshCw size={12} /> 局部重抽
              </button>
              <input
                type="text"
                placeholder="添加划线批注..."
                className="text-xs bg-background border border-border rounded px-2 py-1 flex-1 focus:outline-none focus:border-primary"
                value={inlineFeedback[p.id] || ""}
                onChange={(e) => setInlineFeedback(p.id, e.target.value)}
              />
            </div>
            {inlineFeedback[p.id] && (
              <div className="mt-2 text-xs text-primary/80 bg-primary/5 p-2 rounded italic">
                批注: {inlineFeedback[p.id]}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// -- 4.4 伏笔星图与心电图雷达 --
function EchartsPanels({ bookId, refreshKey }: { bookId: string; refreshKey: number }) {
  const [ecgData, setEcgData] = useState<{ category: string[], values: number[] }>({ category: [], values: [] });

  React.useEffect(() => {
    if (!bookId) return;
    const fetchData = async () => {
      try {
        const encId = encodeURIComponent(bookId);
        
        const ecgRes = await fetch(`/api/v1/books/${encId}/analytics/emotional_arcs`);
        if (ecgRes.ok) {
          const payload = await ecgRes.json();
          const points = payload?.content?.points ?? [];
          const category = points.map((p: any) => `Ch ${p.chapter}`);
          const values = points.map((p: any) => (Number(p.intensity ?? 0) || 0) * 10);
          if (category.length === 0) setEcgData({ category: ['无数据'], values: [0] });
          else setEcgData({ category, values });
        } else {
          setEcgData({ category: ['无数据'], values: [0] });
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchData();
  }, [bookId, refreshKey]);

  const ecgOption = {
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: ecgData.category },
    yAxis: { type: 'value' },
    series: [
      {
        data: ecgData.values,
        type: 'line',
        smooth: true,
        lineStyle: { color: '#8b5cf6', width: 3 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(139, 92, 246, 0.5)' }, { offset: 1, color: 'rgba(139, 92, 246, 0)' }]
          }
        }
      }
    ]
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="bg-card border border-border rounded-xl p-6 flex-1 flex flex-col min-h-0">
        <h3 className="text-lg font-serif mb-4 flex items-center gap-2 shrink-0">
          <BarChart2 size={20} className="text-primary" />
          心电图雷达 (情绪曲线)
        </h3>
        <div className="flex-1 min-h-0 relative">
          <ReactECharts option={ecgOption} style={{ height: '100%', width: '100%', position: 'absolute' }} />
        </div>
      </div>
    </div>
  );
}

// -- 新增：单独把伏笔星图抽出来放到下面 --
function StarMapPanel({ bookId, refreshKey }: { bookId: string; refreshKey: number }) {
  const [graphData, setGraphData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });

  React.useEffect(() => {
    if (!bookId) return;
    const fetchData = async () => {
      try {
        const encId = encodeURIComponent(bookId);
        const [charRes, edgeRes] = await Promise.all([
          fetch(`/api/v1/books/${encId}/truth/character_matrix.md`),
          fetch(`/api/v1/books/${encId}/analytics/character_edges`),
        ]);

        const nodes: any[] = [];
        if (charRes.ok) {
          const { content } = await charRes.json();
          if (content) {
            const lines = content.split('\n');
            lines.forEach((l: string) => {
              const match = l.match(/- roles\/(.*?)\/(.*?)\.md/);
              if (match) {
                const isMain = match[1] === '主要角色';
                nodes.push({
                  name: match[2],
                  symbolSize: isMain ? 50 : 30,
                  itemStyle: { color: isMain ? '#8b5cf6' : '#10b981' }
                });
              }
            });
          }
        }

        let links: any[] = [];
        if (edgeRes.ok) {
          const payload = await edgeRes.json();
          const edges = payload?.content?.edges ?? [];
          const agg = new Map<string, { source: string; target: string; weight: number }>();
          for (const e of edges) {
            const s = String(e.source ?? '').trim();
            const t = String(e.target ?? '').trim();
            if (!s || !t || s === t) continue;
            const key = s < t ? `${s}::${t}` : `${t}::${s}`;
            const prev = agg.get(key);
            const w = Math.max(1, Math.min(5, Number(e.weight ?? 1) || 1));
            if (prev) prev.weight += w;
            else agg.set(key, { source: s, target: t, weight: w });
          }
          links = Array.from(agg.values())
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 80)
            .map((e) => ({
              source: e.source,
              target: e.target,
              lineStyle: { width: Math.min(6, 1 + e.weight / 2), opacity: 0.7, color: '#8b5cf6' },
            }));
        }

        if (nodes.length === 0) {
          setGraphData({ nodes: [{ name: '暂无角色', symbolSize: 30, itemStyle: { color: '#ccc' } }], links: [] });
        } else {
          setGraphData({ nodes, links });
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchData();
  }, [bookId, refreshKey]);

  const starMapOption = {
    tooltip: {},
    series: [
      {
        type: 'graph',
        layout: 'force',
        symbolSize: 40,
        roam: true,
        label: { show: true },
        edgeSymbol: ['none', 'none'],
        edgeSymbolSize: [4, 10],
        data: graphData.nodes,
        links: graphData.links,
        lineStyle: { curveness: 0.2 },
        force: {
          repulsion: 200,
          edgeLength: 80
        }
      }
    ]
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 h-full flex flex-col min-h-0">
      <h3 className="text-lg font-serif mb-4 flex items-center gap-2 shrink-0">
        <Target size={20} className="text-primary" />
        伏笔星图 (故事链)
      </h3>
      <div className="flex-1 min-h-0 relative">
        <ReactECharts option={starMapOption} style={{ height: '100%', width: '100%', position: 'absolute' }} />
      </div>
    </div>
  );
}

// -- 4.5 资产交易所 --
function AssetExchange({ bookId }: { bookId: string }) {
  const { assets, updateAsset, setAssets } = useGodEyeStore();
  const [editingId, setEditingId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!bookId) return;
    const fetchLedger = async () => {
      try {
        const encId = encodeURIComponent(bookId);
        const res = await fetch(`/api/v1/books/${encId}/truth/particle_ledger.md`);
        if (res.ok) {
          const { content } = await res.json();
          if (content && content.trim().length > 0) {
            const lines = content.split('\n').filter((l: string) => l.trim().startsWith('|'));
            const parsedAssets: any[] = [];
            // 跳过表头和分隔行
            for (let i = 2; i < lines.length; i++) {
              const cols = lines[i].split('|').map((c: string) => c.trim());
              if (cols.length >= 5) {
                parsedAssets.push({
                  id: `a-${i}`,
                  name: cols[1] || '未知',
                  type: cols[2] || '类型',
                  value: Number(cols[3]) || 0,
                  affinity: Number(cols[4]) || 50,
                });
              }
            }
            if (parsedAssets.length === 0) {
              setAssets([{ id: 'a-0', name: '暂无资产', type: '-', value: 0, affinity: 0 }]);
            } else {
              setAssets(parsedAssets);
            }
          } else {
            setAssets([{ id: 'a-0', name: '暂无资产', type: '-', value: 0, affinity: 0 }]);
          }
        }
      } catch(e) {
        console.error(e);
      }
    };
    fetchLedger();
  }, [bookId, setAssets]);

  return (
    <div className="bg-card border border-border rounded-xl p-6 h-full flex flex-col min-h-0">
      <h3 className="text-lg font-serif mb-4 flex items-center gap-2 shrink-0">
        <RefreshCw size={20} className="text-primary" />
        资产交易所
      </h3>
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-sm text-left">
          <thead className="text-xs uppercase bg-secondary text-muted-foreground">
            <tr>
              <th className="px-4 py-3 rounded-tl-lg">资产名</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">数值 (双击修改)</th>
              <th className="px-4 py-3 rounded-tr-lg">好感度</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.id} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="px-4 py-3 font-medium">{asset.name}</td>
                <td className="px-4 py-3">{asset.type}</td>
                <td 
                  className="px-4 py-3 cursor-pointer text-primary"
                  onDoubleClick={() => setEditingId(asset.id)}
                >
                  {editingId === asset.id ? (
                    <input
                      type="number"
                      className="w-20 bg-background border border-border rounded px-2 py-1 text-foreground"
                      defaultValue={asset.value}
                      autoFocus
                      onBlur={(e) => {
                        updateAsset(asset.id, { value: Number(e.target.value) });
                        setEditingId(null);
                        // TODO: 模拟反写到底层 SQLite 数据库
                        console.log(`Syncing ${asset.id} to SQLite with value ${e.target.value}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                    />
                  ) : (
                    asset.value
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="w-full bg-secondary rounded-full h-2">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${asset.affinity}%` }}></div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -- 4.6 流式 Diff 与听书试音 --
function StreamingDiffAndTTS({ bookId, chapterNumber }: { bookId: string; chapterNumber: number }) {
  const { isDiffOpen, setDiffOpen, diffOriginal, diffModified, setDiffContents } = useGodEyeStore();
  const [isPlaying, setIsPlaying] = useState(false);

  const fetchRealDiff = async () => {
    try {
      const encId = encodeURIComponent(bookId);

      const chapRes = await fetch(`/api/v1/books/${encId}/chapters/${chapterNumber}`);
      let originalText = `尚未获取到第 ${chapterNumber} 章真实文本。`;
      if (chapRes.ok) {
        const chapData = await chapRes.json();
        originalText = chapData.content || originalText;
      }
      
      // 当前没有专门的 diff 接口，暂时仅展示当前最新章节原文
      // 如需修订对比，需后端补充 revision_history 等接口
      setDiffContents(originalText, originalText);
      setDiffOpen(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTTS = () => {
    setIsPlaying(!isPlaying);
    // TODO: 集成本地 Edge-TTS
    console.log("Triggering Edge-TTS playback...");
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 h-full">
      <h3 className="text-lg font-serif mb-4 flex items-center gap-2">
        <Volume2 size={20} className="text-primary" />
        流式 Diff 与听书试音
      </h3>
      <div className="flex gap-4 mb-6">
        <button
          onClick={fetchRealDiff}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <RefreshCw size={16} /> 拉取真实修订 Diff
        </button>
        <button
          onClick={handleTTS}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
            isPlaying ? "bg-red-500 text-white" : "bg-secondary text-foreground hover:bg-secondary/80"
          }`}
        >
          <Play size={16} /> {isPlaying ? "停止试音" : "听书试音 (TTS)"}
        </button>
      </div>

      {isDiffOpen && (
        <div className="font-mono text-sm bg-background border border-border rounded p-4 h-48 overflow-y-auto">
          {diff.diffChars(diffOriginal, diffModified).map((part, i) => {
            const color = part.added ? 'text-green-500 bg-green-500/10' : part.removed ? 'text-red-500 bg-red-500/10 line-through' : 'text-foreground';
            return <span key={i} className={color}>{part.value}</span>;
          })}
        </div>
      )}
    </div>
  );
}

function OpsPanel({
  bookId,
  chapterNumber,
  onJumpChapter,
  onAnalyticsUpdated,
}: {
  bookId: string;
  chapterNumber: number;
  onJumpChapter: (chapter: number) => void;
  onAnalyticsUpdated: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [ragStatus, setRagStatus] = useState<any>(null);
  const [ragQuery, setRagQuery] = useState("");
  const [ragMode, setRagMode] = useState("auto");
  const [ragResults, setRagResults] = useState<any[]>([]);
  const [backupFiles, setBackupFiles] = useState<string[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<string>("");
  const [reviseMode, setReviseMode] = useState("spot-fix");
  const [reviseBrief, setReviseBrief] = useState("");

  const encId = encodeURIComponent(bookId);

  const refreshRagStatus = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/books/${encId}/rag/status`);
      if (!res.ok) return;
      const data = await res.json();
      setRagStatus(data);
    } catch {
    }
  }, [encId]);

  const refreshBackups = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/books/${encId}/backups/${chapterNumber}`);
      if (!res.ok) return;
      const data = await res.json();
      const files = data.files ?? [];
      setBackupFiles(files);
      setSelectedBackup(files[0] ?? "");
    } catch {
    }
  }, [encId, chapterNumber]);

  React.useEffect(() => {
    if (!bookId) return;
    refreshRagStatus();
  }, [bookId, refreshRagStatus]);

  React.useEffect(() => {
    if (!bookId) return;
    refreshBackups();
  }, [bookId, chapterNumber, refreshBackups]);

  const rebuildAnalytics = async (scope: "chapter" | "book") => {
    setBusy(scope === "book" ? "rebuild-book" : "rebuild-chapter");
    try {
      const res = await fetch(`/api/v1/books/${encId}/analytics/rebuild`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope === "book" ? { scope: "book" } : { scope: "chapter", chapter: chapterNumber }),
      });
      await res.json().catch(() => null);
      onAnalyticsUpdated();
    } finally {
      setBusy(null);
    }
  };

  const reindexRag = async () => {
    setBusy("rag-reindex");
    try {
      const res = await fetch(`/api/v1/books/${encId}/rag/reindex/${chapterNumber}`, { method: "POST" });
      await res.json().catch(() => null);
      await refreshRagStatus();
    } finally {
      setBusy(null);
    }
  };

  const auditChapter = async () => {
    setBusy("audit");
    try {
      const res = await fetch(`/api/v1/books/${encId}/audit/${chapterNumber}`, { method: "POST" });
      await res.json().catch(() => null);
    } finally {
      setBusy(null);
    }
  };

  const reviseChapter = async () => {
    setBusy("revise");
    try {
      const res = await fetch(`/api/v1/books/${encId}/revise/${chapterNumber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: reviseMode, brief: reviseBrief.trim() || undefined }),
      });
      await res.json().catch(() => null);
      onAnalyticsUpdated();
    } finally {
      setBusy(null);
    }
  };

  const repairChapter = async () => {
    setBusy("repair");
    try {
      const res = await fetch(`/api/v1/books/${encId}/repair/${chapterNumber}`, { method: "POST" });
      await res.json().catch(() => null);
      onAnalyticsUpdated();
    } finally {
      setBusy(null);
    }
  };

  const searchRag = async () => {
    if (!ragQuery.trim()) return;
    setBusy("rag-search");
    try {
      const res = await fetch(`/api/v1/books/${encId}/rag/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ragQuery.trim(), top_k: 8, mode: ragMode, chapter: chapterNumber }),
      });
      const data = await res.json().catch(() => ({}));
      setRagResults(data?.data ?? []);
    } finally {
      setBusy(null);
    }
  };

  const restoreBackup = async () => {
    if (!selectedBackup) return;
    setBusy("restore");
    try {
      const res = await fetch(`/api/v1/books/${encId}/backups/${chapterNumber}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: selectedBackup }),
      });
      await res.json().catch(() => null);
      await refreshBackups();
      onAnalyticsUpdated();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            disabled={!!busy}
            onClick={() => rebuildAnalytics("chapter")}
            className="px-3 py-2 bg-secondary text-foreground rounded text-sm font-semibold"
          >
            重建分析(本章)
          </button>
          <button
            disabled={!!busy}
            onClick={() => rebuildAnalytics("book")}
            className="px-3 py-2 bg-secondary text-foreground rounded text-sm font-semibold"
          >
            重建分析(全书)
          </button>
          <button
            disabled={!!busy}
            onClick={auditChapter}
            className="px-3 py-2 bg-secondary text-foreground rounded text-sm font-semibold"
          >
            审稿(本章)
          </button>
          <button
            disabled={!!busy}
            onClick={repairChapter}
            className="px-3 py-2 bg-secondary text-foreground rounded text-sm font-semibold"
          >
            修复状态(本章)
          </button>
          <button
            disabled={!!busy}
            onClick={reindexRag}
            className="px-3 py-2 bg-secondary text-foreground rounded text-sm font-semibold"
          >
            重建 RAG(本章)
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          RAG: {ragStatus?.data?.sync_status ?? ragStatus?.sync_status ?? "-"} | vectors: {ragStatus?.data?.vectors_count ?? "-"} | terms: {ragStatus?.data?.terms_count ?? "-"}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <select
          value={reviseMode}
          onChange={(e) => setReviseMode(e.target.value)}
          className="bg-background border border-border rounded px-2 py-2 text-sm"
        >
          <option value="spot-fix">spot-fix</option>
          <option value="polish">polish</option>
          <option value="rewrite">rewrite</option>
          <option value="rework">rework</option>
          <option value="anti-detect">anti-detect</option>
        </select>
        <input
          value={reviseBrief}
          onChange={(e) => setReviseBrief(e.target.value)}
          placeholder="修订 brief（可选）"
          className="flex-1 min-w-[240px] bg-background border border-border rounded px-3 py-2 text-sm"
        />
        <button
          disabled={!!busy}
          onClick={reviseChapter}
          className="px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold"
        >
          修订(本章)
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
        <div className="bg-secondary/30 border border-border rounded-lg p-4">
          <div className="flex items-center gap-2">
            <input
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="RAG 搜索（人物/线索/地点/事件）"
              className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm"
            />
            <select
              value={ragMode}
              onChange={(e) => setRagMode(e.target.value)}
              className="bg-background border border-border rounded px-2 py-2 text-sm"
            >
              <option value="auto">auto</option>
              <option value="hybrid">hybrid</option>
              <option value="vector">vector</option>
              <option value="bm25">bm25</option>
            </select>
            <button
              disabled={busy === "rag-search"}
              onClick={searchRag}
              className="px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold"
            >
              搜索
            </button>
          </div>
          <div className="mt-3 space-y-2 max-h-[180px] overflow-auto">
            {ragResults.length === 0 ? (
              <div className="text-xs text-muted-foreground">暂无检索结果</div>
            ) : ragResults.map((r: any) => (
              <button
                key={r.chunk_id}
                onClick={() => onJumpChapter(Number(r.chapter || chapterNumber))}
                className="w-full text-left text-xs bg-background/60 border border-border rounded p-2 hover:bg-background/80"
              >
                <div className="flex items-center justify-between">
                  <span>Ch {r.chapter} · {r.source} · {String(r.score ?? 0).slice(0, 5)}</span>
                  <span className="text-muted-foreground">{r.chunk_type ?? ""}</span>
                </div>
                <div className="mt-1 text-muted-foreground line-clamp-3">{r.content}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-secondary/30 border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 justify-between">
            <div className="text-sm font-semibold">章节回滚</div>
            <button
              disabled={!!busy}
              onClick={refreshBackups}
              className="px-3 py-1.5 bg-background border border-border rounded text-xs"
            >
              刷新
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <select
              value={selectedBackup}
              onChange={(e) => setSelectedBackup(e.target.value)}
              className="flex-1 bg-background border border-border rounded px-2 py-2 text-sm"
            >
              {backupFiles.length === 0 ? (
                <option value="">暂无备份</option>
              ) : backupFiles.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <button
              disabled={!!busy || !selectedBackup}
              onClick={restoreBackup}
              className="px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold"
            >
              回滚
            </button>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            回滚后章节会标记为需复审（audit-failed）。
          </div>
        </div>
      </div>
    </div>
  );
}

export function GodEyeDashboard({ bookId, nav }: { bookId: string; nav: any }) {
  const { setBeatSheetOpen } = useGodEyeStore();
  const bookDataVersion = useChatStore((s) => s.bookDataVersion);
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [maxChapter, setMaxChapter] = useState<number>(1);
  const [chapterIndex, setChapterIndex] = useState<Array<{ number: number; title?: string }>>([]);
  const [analyticsTick, setAnalyticsTick] = useState(0);
  const initialLoadRef = React.useRef(true);

  React.useEffect(() => {
    if (!bookId) return;
    const fetchBook = async () => {
      try {
        const encId = encodeURIComponent(bookId);
        const res = await fetch(`/api/v1/books/${encId}`);
        if (res.ok) {
          const data = await res.json();
          setChapterIndex(Array.isArray(data.chapters) ? data.chapters : []);
          const nextChap = data.nextChapter || 1;
          const currentChap = Math.max(1, nextChap - 1);
          setMaxChapter(Math.max(1, nextChap));
          setSelectedChapter((prev) => {
            if (initialLoadRef.current) return currentChap;
            if (prev < 1 || prev > Math.max(1, nextChap)) return currentChap;
            return prev;
          });
          initialLoadRef.current = false;
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchBook();
  }, [bookId, analyticsTick, bookDataVersion]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl mb-2 flex items-center gap-3">
            全景上帝视角监控
          </h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>统揽全局状态、干预生成流程的超级面板 (当前书籍: {bookId})</span>
            <div className="flex items-center gap-2">
              <label htmlFor="chapter-select" className="font-medium text-foreground">章节:</label>
              <select
                id="chapter-select"
                value={selectedChapter}
                onChange={(e) => setSelectedChapter(Number(e.target.value))}
                className="bg-secondary border border-border text-foreground text-sm rounded focus:ring-primary focus:border-primary block p-1"
              >
                {Array.from({ length: maxChapter }, (_, i) => i + 1).map((chap) => {
                  const meta = chapterIndex.find((c) => c?.number === chap);
                  const title = meta?.title ? String(meta.title).trim() : "";
                  const label = title ? `第 ${chap} 章 · ${title}` : `第 ${chap} 章`;
                  return (
                    <option key={chap} value={chap}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>
        <button
          onClick={() => setBeatSheetOpen(true)}
          className="px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:scale-105 transition-transform shadow-lg shadow-primary/20"
        >
          打开细纲节拍表 (拦截审批)
        </button>
      </div>

      <OpsPanel
        bookId={bookId}
        chapterNumber={selectedChapter}
        onJumpChapter={(ch) => setSelectedChapter(ch)}
        onAnalyticsUpdated={() => setAnalyticsTick((v) => v + 1)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Row 1 */}
        <div className="col-span-1 xl:col-span-2 h-[400px]">
          <ScalpelEditor bookId={bookId} chapterNumber={selectedChapter} />
        </div>
        <div className="col-span-1 h-[400px]">
          <EchartsPanels bookId={bookId} refreshKey={analyticsTick} />
        </div>

        {/* Row 2 */}
        <div className="col-span-1 xl:col-span-2 h-[350px]">
          <AssetExchange bookId={bookId} />
        </div>
        <div className="col-span-1 h-[350px]">
          <StarMapPanel bookId={bookId} refreshKey={analyticsTick} />
        </div>

        {/* Row 3 */}
        <div className="col-span-1 xl:col-span-3 h-[400px]">
          <StreamingDiffAndTTS bookId={bookId} chapterNumber={selectedChapter} />
        </div>
      </div>

      <BeatSheetModal bookId={bookId} chapterNumber={selectedChapter} />
    </div>
  );
}
