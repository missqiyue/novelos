import { useEffect, useState } from "react";
import { useChapterStore } from "../../stores";
import {
  ledgerApi,
  type LedgerSummary,
  type CharacterStateInfo,
  type RelationshipStateInfo,
  type TimelineNodeInfo,
  type ForeshadowItemInfo,
  type AbilityItemInfo,
  type KnowledgeVisibilityInfo,
} from "../../lib/api";
import {
  BookOpen,
  Users,
  Heart,
  Clock,
  Lightbulb,
  Swords,
  Eye,
  Plus,
  Save,
  Trash2,
  RefreshCw,
} from "lucide-react";

const TAB_LABELS = [
  { key: "summary", label: "总览", icon: BookOpen },
  { key: "character_states", label: "人物状态", icon: Users },
  { key: "relationships", label: "关系状态", icon: Heart },
  { key: "timeline", label: "时间线", icon: Clock },
  { key: "foreshadow", label: "伏笔", icon: Lightbulb },
  { key: "knowledge", label: "信息可见", icon: Eye },
  { key: "abilities", label: "能力/资源", icon: Swords },
];

export function LedgerPage() {
  const [activeTab, setActiveTab] = useState("summary");
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const { characters, fetchCharacters } = useChapterStore();

  // Character states
  const [charStates, setCharStates] = useState<CharacterStateInfo[]>([]);
  // Relationships
  const [relationships, setRelationships] = useState<RelationshipStateInfo[]>([]);
  // Timeline
  const [timelineNodes, setTimelineNodes] = useState<TimelineNodeInfo[]>([]);
  // Foreshadow
  const [foreshadowItems, setForeshadowItems] = useState<ForeshadowItemInfo[]>([]);
  const [foreshadowFilter, setForeshadowFilter] = useState("");
  // Abilities
  const [abilityItems, setAbilityItems] = useState<AbilityItemInfo[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeVisibilityInfo[]>([]);

  const [loading, setLoading] = useState(false);

  const loadTab = async (tab: string) => {
    setLoading(true);
    try {
      switch (tab) {
        case "summary":
          setSummary(await ledgerApi.getSummary());
          break;
        case "character_states":
          setCharStates(await ledgerApi.listCharacterStates());
          break;
        case "relationships":
          setRelationships(await ledgerApi.listRelationshipStates());
          await fetchCharacters();
          break;
        case "timeline":
          setTimelineNodes(await ledgerApi.listTimelineNodes());
          break;
        case "foreshadow":
          setForeshadowItems(await ledgerApi.listForeshadowItems(foreshadowFilter || undefined));
          break;
        case "abilities":
          setAbilityItems(await ledgerApi.listAbilityItems());
          break;
        case "knowledge":
          setKnowledgeItems(await ledgerApi.listKnowledgeVisibility());
          break;
      }
    } catch {
      /* ledger may be empty */
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTab(activeTab);
  }, [activeTab]);

  // ─── Quick-add forms ───
  // Foreshadow quick-add
  const [newForeshadow, setNewForeshadow] = useState({
    seed_chapter: 1,
    title: "",
    importance: 3,
    notes: "",
  });
  const handleAddForeshadow = async () => {
    if (!newForeshadow.title.trim()) return;
    await ledgerApi.upsertForeshadowItem({
      seed_chapter: newForeshadow.seed_chapter,
      title: newForeshadow.title,
      importance: newForeshadow.importance,
      notes: newForeshadow.notes || undefined,
      status: "planted",
    });
    setNewForeshadow({ seed_chapter: 1, title: "", importance: 3, notes: "" });
    setForeshadowItems(await ledgerApi.listForeshadowItems(foreshadowFilter || undefined));
  };

  // Timeline quick-add
  const [newTimeline, setNewTimeline] = useState({
    chapter_number: 1,
    relative_day: 1,
    summary: "",
  });
  const handleAddTimeline = async () => {
    if (!newTimeline.summary.trim()) return;
    await ledgerApi.upsertTimelineNode({
      chapter_number: newTimeline.chapter_number,
      relative_day: newTimeline.relative_day,
      summary: newTimeline.summary,
    });
    setNewTimeline({ chapter_number: 1, relative_day: 1, summary: "" });
    setTimelineNodes(await ledgerApi.listTimelineNodes());
  };

  // Ability quick-add
  const [newAbility, setNewAbility] = useState({ item_type: "technique", name: "" });
  const handleAddAbility = async () => {
    if (!newAbility.name.trim()) return;
    await ledgerApi.upsertAbilityItem({
      item_type: newAbility.item_type,
      name: newAbility.name,
    });
    setNewAbility({ item_type: "technique", name: "" });
    setAbilityItems(await ledgerApi.listAbilityItems());
  };

  // Knowledge quick-add
  const [newKnowledge, setNewKnowledge] = useState({
    knowledge_key: "",
    holder_type: "character",
    holder_ref: "",
    visibility_state: "known",
    chapter_acquired: 1,
  });
  const handleAddKnowledge = async () => {
    if (!newKnowledge.knowledge_key.trim() || !newKnowledge.holder_ref.trim()) return;
    await ledgerApi.upsertKnowledgeVisibility({
      knowledge_key: newKnowledge.knowledge_key,
      holder_type: newKnowledge.holder_type,
      holder_ref: newKnowledge.holder_ref,
      visibility_state: newKnowledge.visibility_state,
      chapter_acquired: newKnowledge.chapter_acquired,
    });
    setNewKnowledge({
      knowledge_key: "",
      holder_type: "character",
      holder_ref: "",
      visibility_state: "known",
      chapter_acquired: 1,
    });
    setKnowledgeItems(await ledgerApi.listKnowledgeVisibility());
  };

  // Relationship quick-add
  const [newRelation, setNewRelation] = useState({
    source_character_id: "",
    target_character_id: "",
    relation_type: "ally",
  });
  const handleAddRelation = async () => {
    if (!newRelation.source_character_id || !newRelation.target_character_id) return;
    await ledgerApi.upsertRelationshipState({
      source_character_id: newRelation.source_character_id,
      target_character_id: newRelation.target_character_id,
      relation_type: newRelation.relation_type,
    });
    setRelationships(await ledgerApi.listRelationshipStates());
  };

  const resolveCharName = (id: string) =>
    characters.find((c) => c.id === id)?.name || id.slice(0, 8);

  return (
    <div className="flex h-full">
      {/* Tab sidebar */}
      <div className="w-48 border-r border-gray-200 bg-white overflow-auto shrink-0">
        <div className="p-3 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">故事账本</h2>
        </div>
        <div className="p-2">
          {TAB_LABELS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                activeTab === key
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-sm text-gray-400">加载中...</div>
        ) : (
          <>
            {/* Summary Tab */}
            {activeTab === "summary" && summary && (
              <div>
                <h3 className="text-lg font-semibold mb-4">账本总览</h3>
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="人物状态" value={summary.character_states_count} />
                  <StatCard label="关系状态" value={summary.relationship_states_count} />
                  <StatCard label="时间线节点" value={summary.timeline_nodes_count} />
                  <StatCard label="事件节点" value={summary.event_nodes_count} />
                  <StatCard label="能力/资源" value={summary.ability_items_count} />
                  <div className="p-4 rounded-lg bg-gray-50">
                    <div className="text-2xl font-bold text-gray-900">
                      {summary.foreshadow_items_count}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">伏笔总数</div>
                    <div className="mt-2 flex gap-2 text-xs">
                      <span className="px-1.5 py-0.5 bg-yellow-100 rounded">
                        待回收 {summary.foreshadow_planted_count}
                      </span>
                      <span className="px-1.5 py-0.5 bg-green-100 rounded">
                        已回收 {summary.foreshadow_resolved_count}
                      </span>
                      {summary.foreshadow_overdue_count > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">
                          超期 {summary.foreshadow_overdue_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Character States */}
            {activeTab === "character_states" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">人物状态账</h3>
                {charStates.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    暂无人物状态记录。章节定稿后会自动创建状态快照。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {charStates.map((cs) => (
                      <div key={cs.id} className="p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">
                            {resolveCharName(cs.character_id)}
                          </span>
                          <span className="text-xs text-gray-400">
                            第{cs.chapter_from}-{cs.chapter_to}章
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
                          {cs.level_state && (
                            <span className="px-1.5 py-0.5 bg-blue-50 rounded">
                              等级: {cs.level_state}
                            </span>
                          )}
                          {cs.emotion_state && (
                            <span className="px-1.5 py-0.5 bg-pink-50 rounded">
                              情绪: {cs.emotion_state}
                            </span>
                          )}
                          {cs.goal_state && (
                            <span className="px-1.5 py-0.5 bg-green-50 rounded">
                              目标: {cs.goal_state}
                            </span>
                          )}
                          {cs.physical_state && (
                            <span className="px-1.5 py-0.5 bg-yellow-50 rounded">
                              身体: {cs.physical_state}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Relationships */}
            {activeTab === "relationships" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">关系状态账</h3>
                {/* Quick-add */}
                <div className="mb-4 flex items-center gap-2">
                  <select
                    value={newRelation.source_character_id}
                    onChange={(e) =>
                      setNewRelation((p) => ({ ...p, source_character_id: e.target.value }))
                    }
                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                  >
                    <option value="">选择角色A</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-gray-400">→</span>
                  <select
                    value={newRelation.target_character_id}
                    onChange={(e) =>
                      setNewRelation((p) => ({ ...p, target_character_id: e.target.value }))
                    }
                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                  >
                    <option value="">选择角色B</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newRelation.relation_type}
                    onChange={(e) =>
                      setNewRelation((p) => ({ ...p, relation_type: e.target.value }))
                    }
                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                  >
                    <option value="ally">同盟</option>
                    <option value="enemy">敌对</option>
                    <option value="neutral">中立</option>
                    <option value="lovers">恋人</option>
                    <option value="master_student">师徒</option>
                    <option value="family">亲属</option>
                  </select>
                  <button
                    onClick={handleAddRelation}
                    className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {relationships.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无关系记录</p>
                ) : (
                  <div className="space-y-1.5">
                    {relationships.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between p-2 border border-gray-100 rounded text-sm"
                      >
                        <span>
                          {resolveCharName(r.source_character_id)}
                          <span className="text-gray-400 mx-1">→</span>
                          {resolveCharName(r.target_character_id)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                            {r.relation_type}
                          </span>
                          {r.trust_score != null && (
                            <span className="text-xs text-gray-400">信任:{r.trust_score}</span>
                          )}
                          {r.conflict_score != null && (
                            <span className="text-xs text-gray-400">冲突:{r.conflict_score}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Timeline */}
            {activeTab === "timeline" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">时间线账</h3>
                <div className="mb-4 flex items-center gap-2">
                  <input
                    type="number"
                    value={newTimeline.chapter_number}
                    onChange={(e) =>
                      setNewTimeline((p) => ({
                        ...p,
                        chapter_number: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="w-20 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="章"
                  />
                  <span className="text-xs text-gray-400">第</span>
                  <input
                    type="number"
                    value={newTimeline.relative_day}
                    onChange={(e) =>
                      setNewTimeline((p) => ({ ...p, relative_day: parseInt(e.target.value) || 1 }))
                    }
                    className="w-20 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="天"
                  />
                  <span className="text-xs text-gray-400">天</span>
                  <input
                    value={newTimeline.summary}
                    onChange={(e) => setNewTimeline((p) => ({ ...p, summary: e.target.value }))}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="事件摘要"
                  />
                  <button
                    onClick={handleAddTimeline}
                    className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {timelineNodes.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无时间线节点</p>
                ) : (
                  <div className="space-y-1">
                    {timelineNodes.map((tn) => (
                      <div
                        key={tn.id}
                        className="flex items-center gap-3 p-2 border border-gray-100 rounded text-sm"
                      >
                        <span className="text-xs text-gray-400 w-16">第{tn.relative_day}天</span>
                        <span className="flex-1 text-gray-800">{tn.summary}</span>
                        <span className="text-xs text-gray-400">第{tn.chapter_number}章</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Foreshadow */}
            {activeTab === "foreshadow" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">伏笔账</h3>
                <div className="flex items-center gap-2 mb-4">
                  <select
                    value={foreshadowFilter}
                    onChange={(e) => {
                      setForeshadowFilter(e.target.value);
                      loadTab("foreshadow");
                    }}
                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                  >
                    <option value="">全部</option>
                    <option value="planted">待回收</option>
                    <option value="resolved">已回收</option>
                    <option value="overdue">超期</option>
                  </select>
                  <div className="flex-1" />
                  <input
                    type="number"
                    value={newForeshadow.seed_chapter}
                    onChange={(e) =>
                      setNewForeshadow((p) => ({
                        ...p,
                        seed_chapter: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="w-16 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="章"
                  />
                  <input
                    value={newForeshadow.title}
                    onChange={(e) => setNewForeshadow((p) => ({ ...p, title: e.target.value }))}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="伏笔标题"
                  />
                  <button
                    onClick={handleAddForeshadow}
                    className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {foreshadowItems.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无伏笔</p>
                ) : (
                  <div className="space-y-1.5">
                    {foreshadowItems.map((fs) => (
                      <div
                        key={fs.id}
                        className="flex items-center justify-between p-2 border border-gray-100 rounded text-sm"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{fs.title}</span>
                          <span className="text-xs text-gray-400 ml-2">
                            埋于第{fs.seed_chapter}章
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              fs.status === "resolved"
                                ? "bg-green-100 text-green-700"
                                : fs.status === "overdue"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {fs.status === "resolved"
                              ? "已回收"
                              : fs.status === "overdue"
                                ? "超期"
                                : "待回收"}
                          </span>
                          {fs.importance != null && (
                            <span className="text-xs text-gray-400">重要度:{fs.importance}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Abilities */}
            {activeTab === "abilities" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">能力/资源账</h3>
                <div className="mb-4 flex items-center gap-2">
                  <select
                    value={newAbility.item_type}
                    onChange={(e) => setNewAbility((p) => ({ ...p, item_type: e.target.value }))}
                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                  >
                    <option value="technique">功法/技能</option>
                    <option value="weapon">武器</option>
                    <option value="item">道具</option>
                    <option value="resource">资源</option>
                  </select>
                  <input
                    value={newAbility.name}
                    onChange={(e) => setNewAbility((p) => ({ ...p, name: e.target.value }))}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="名称"
                  />
                  <button
                    onClick={handleAddAbility}
                    className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {abilityItems.length === 0 ? (
                  <p className="text-sm text-gray-400">暂无能力/资源记录</p>
                ) : (
                  <div className="space-y-1.5">
                    {abilityItems.map((ai) => (
                      <div
                        key={ai.id}
                        className="flex items-center justify-between p-2 border border-gray-100 rounded text-sm"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{ai.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{ai.item_type}</span>
                        </div>
                        <span className="text-xs text-gray-400">{ai.status || "active"}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Knowledge Visibility */}
            {activeTab === "knowledge" && (
              <div>
                <h3 className="text-lg font-semibold mb-4">信息可见性账</h3>
                <div className="mb-4 flex items-center gap-2 flex-wrap">
                  <input
                    value={newKnowledge.knowledge_key}
                    onChange={(e) =>
                      setNewKnowledge((p) => ({ ...p, knowledge_key: e.target.value }))
                    }
                    className="w-32 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="知识键"
                  />
                  <select
                    value={newKnowledge.holder_type}
                    onChange={(e) =>
                      setNewKnowledge((p) => ({ ...p, holder_type: e.target.value }))
                    }
                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                  >
                    <option value="character">角色</option>
                    <option value="faction">势力</option>
                    <option value="reader">读者已知</option>
                    <option value="narrator">旁白已知</option>
                  </select>
                  <input
                    value={newKnowledge.holder_ref}
                    onChange={(e) => setNewKnowledge((p) => ({ ...p, holder_ref: e.target.value }))}
                    className="w-24 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="持有者"
                  />
                  <select
                    value={newKnowledge.visibility_state}
                    onChange={(e) =>
                      setNewKnowledge((p) => ({ ...p, visibility_state: e.target.value }))
                    }
                    className="px-2 py-1 border border-gray-200 rounded text-sm"
                  >
                    <option value="known">已知</option>
                    <option value="unknown">未知</option>
                    <option value="suspected">怀疑</option>
                    <option value="misunderstood">误解</option>
                  </select>
                  <input
                    type="number"
                    value={newKnowledge.chapter_acquired}
                    onChange={(e) =>
                      setNewKnowledge((p) => ({
                        ...p,
                        chapter_acquired: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="w-16 px-2 py-1 border border-gray-200 rounded text-sm"
                    placeholder="章"
                  />
                  <button
                    onClick={handleAddKnowledge}
                    className="p-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {knowledgeItems.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    暂无信息可见性记录 — 添加"谁知道什么"来追踪信息流动
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {knowledgeItems.map((kv) => (
                      <div
                        key={kv.id}
                        className="flex items-center justify-between p-2 border border-gray-100 rounded text-sm"
                      >
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">{kv.knowledge_key}</span>
                          <span className="text-xs text-gray-400 ml-2">
                            {kv.holder_type}:{kv.holder_ref}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded ${
                              kv.visibility_state === "known"
                                ? "bg-green-100 text-green-700"
                                : kv.visibility_state === "unknown"
                                  ? "bg-gray-100 text-gray-500"
                                  : kv.visibility_state === "suspected"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {kv.visibility_state === "known"
                              ? "已知"
                              : kv.visibility_state === "unknown"
                                ? "未知"
                                : kv.visibility_state === "suspected"
                                  ? "怀疑"
                                  : "误解"}
                          </span>
                          <span className="text-xs text-gray-400">第{kv.chapter_acquired}章</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-4 rounded-lg bg-gray-50">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}
