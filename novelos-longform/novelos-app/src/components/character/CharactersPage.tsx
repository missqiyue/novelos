import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCharacterStore, useLlmStore } from "../../stores";
import {
  Users,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ChevronRight,
  Sparkles,
  Loader2,
} from "lucide-react";

const roleLabels: Record<string, { label: string; color: string }> = {
  protagonist: { label: "主角", color: "bg-amber-100 text-amber-700" },
  antagonist: { label: "反派", color: "bg-red-100 text-red-700" },
  supporting: { label: "配角", color: "bg-blue-100 text-blue-700" },
  minor: { label: "龙套", color: "bg-gray-100 text-gray-600" },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  active: { label: "活跃", color: "bg-green-100 text-green-700" },
  dormant: { label: "休眠", color: "bg-gray-100 text-gray-500" },
  dead: { label: "已死", color: "bg-red-100 text-red-600" },
};

interface SoulSections {
  personality?: {
    core_traits?: string[];
    emotional_range?: string;
    stress_response?: string;
    growth_direction?: string;
  };
  speech?: {
    tone?: string;
    vocabulary?: string;
    sentence_pattern?: string;
    catchphrases?: string[];
    taboo_words?: string[];
  };
  behavior?: {
    posture?: string;
    fighting_style?: string;
    decision_pattern?: string;
    conflict_style?: string;
    habit?: string;
  };
  relationships?: {
    default_stance?: string;
    trust_pattern?: string;
    conflict_reaction?: string;
    loyalty_trigger?: string;
  };
}

interface SoulData extends SoulSections {
  profile?: {
    description?: string;
    [key: string]: unknown;
  };
  matched_template?: string;
  customization?: SoulSections;
}

function parseSoulJson(soulJson: string): SoulData {
  try {
    return JSON.parse(soulJson || "{}");
  } catch {
    return {};
  }
}

function getSoulSections(soul: SoulData): SoulSections {
  return {
    personality: soul.personality || soul.customization?.personality,
    speech: soul.speech || soul.customization?.speech,
    behavior: soul.behavior || soul.customization?.behavior,
    relationships: soul.relationships || soul.customization?.relationships,
  };
}

function getSoulDescription(soulJson: string): string {
  const description = parseSoulJson(soulJson).profile?.description;
  return typeof description === "string" ? description : "";
}

function withSoulDescription(soulJson: string, description: string): string {
  const soul = parseSoulJson(soulJson);
  const trimmed = description.trim();
  if (trimmed) {
    soul.profile = {
      ...(soul.profile || {}),
      description: trimmed,
    };
  } else if (soul.profile) {
    const { description: _description, ...profile } = soul.profile;
    soul.profile = Object.keys(profile).length ? profile : undefined;
  }
  return JSON.stringify(soul, null, 2);
}

function SoulEditor({
  soulJson,
  onChange,
}: {
  soulJson: string;
  onChange: (json: string) => void;
}) {
  const soul = parseSoulJson(soulJson);
  const sections = getSoulSections(soul);
  const [activeTab, setActiveTab] = useState<
    "personality" | "speech" | "behavior" | "relationships"
  >("personality");

  const updateField = (section: keyof SoulData, field: string, value: string | string[]) => {
    const updated = { ...soul };
    const currentSection = (sections[section as keyof SoulSections] || {}) as Record<
      string,
      unknown
    >;
    if (updated.customization) {
      updated.customization = {
        ...updated.customization,
        [section]: { ...currentSection, [field]: value },
      };
    } else {
      (updated[section] as any) = { ...currentSection, [field]: value };
    }
    onChange(JSON.stringify(updated, null, 2));
  };

  const tabs = [
    { key: "personality" as const, label: "性格" },
    { key: "speech" as const, label: "语言" },
    { key: "behavior" as const, label: "行为" },
    { key: "relationships" as const, label: "关系" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 text-sm transition-colors ${
              activeTab === key
                ? "text-indigo-700 border-b-2 border-indigo-600 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "personality" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">核心性格特征（逗号分隔）</label>
            <input
              type="text"
              value={(sections.personality?.core_traits || []).join(", ")}
              onChange={(e) =>
                updateField(
                  "personality",
                  "core_traits",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="坚韧, 内敛, 重情义"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">情感范围</label>
            <input
              type="text"
              value={sections.personality?.emotional_range || ""}
              onChange={(e) => updateField("personality", "emotional_range", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">压力反应</label>
            <input
              type="text"
              value={sections.personality?.stress_response || ""}
              onChange={(e) => updateField("personality", "stress_response", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">成长方向</label>
            <input
              type="text"
              value={sections.personality?.growth_direction || ""}
              onChange={(e) => updateField("personality", "growth_direction", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>
      )}

      {activeTab === "speech" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">语调</label>
            <input
              type="text"
              value={sections.speech?.tone || ""}
              onChange={(e) => updateField("speech", "tone", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">词汇风格</label>
            <input
              type="text"
              value={sections.speech?.vocabulary || ""}
              onChange={(e) => updateField("speech", "vocabulary", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">句式特征</label>
            <input
              type="text"
              value={sections.speech?.sentence_pattern || ""}
              onChange={(e) => updateField("speech", "sentence_pattern", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">口头禅（逗号分隔）</label>
            <input
              type="text"
              value={(sections.speech?.catchphrases || []).join(", ")}
              onChange={(e) =>
                updateField(
                  "speech",
                  "catchphrases",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              placeholder="这事情没完, 我自有办法"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">禁用词（逗号分隔）</label>
            <input
              type="text"
              value={(sections.speech?.taboo_words || []).join(", ")}
              onChange={(e) =>
                updateField(
                  "speech",
                  "taboo_words",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>
      )}

      {activeTab === "behavior" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">姿态特征</label>
            <input
              type="text"
              value={sections.behavior?.posture || ""}
              onChange={(e) => updateField("behavior", "posture", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">战斗风格</label>
            <input
              type="text"
              value={sections.behavior?.fighting_style || ""}
              onChange={(e) => updateField("behavior", "fighting_style", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">决策模式</label>
            <input
              type="text"
              value={sections.behavior?.decision_pattern || ""}
              onChange={(e) => updateField("behavior", "decision_pattern", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">冲突风格</label>
            <input
              type="text"
              value={sections.behavior?.conflict_style || ""}
              onChange={(e) => updateField("behavior", "conflict_style", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">习惯</label>
            <input
              type="text"
              value={sections.behavior?.habit || ""}
              onChange={(e) => updateField("behavior", "habit", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>
      )}

      {activeTab === "relationships" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">默认立场</label>
            <input
              type="text"
              value={sections.relationships?.default_stance || ""}
              onChange={(e) => updateField("relationships", "default_stance", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">信任模式</label>
            <input
              type="text"
              value={sections.relationships?.trust_pattern || ""}
              onChange={(e) => updateField("relationships", "trust_pattern", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">冲突反应</label>
            <input
              type="text"
              value={sections.relationships?.conflict_reaction || ""}
              onChange={(e) => updateField("relationships", "conflict_reaction", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">忠诚触发</label>
            <input
              type="text"
              value={sections.relationships?.loyalty_trigger || ""}
              onChange={(e) => updateField("relationships", "loyalty_trigger", e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>
      )}

      <details className="mt-2">
        <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
          原始 JSON
        </summary>
        <textarea
          value={soulJson}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          className="w-full mt-1 px-2 py-1 border border-gray-200 rounded text-xs font-mono text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300"
        />
      </details>
    </div>
  );
}

export function CharactersPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { characters, selectedCharacter, loading, fetch, select, create, update, remove } =
    useCharacterStore();
  const { chatWithSystem } = useLlmStore();
  const [showCreate, setShowCreate] = useState(false);
  const [createMode, setCreateMode] = useState<"blank" | "template" | "ai">("blank");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("supporting");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [aiDesc, setAiDesc] = useState("");
  const [templates, setTemplates] = useState<
    Array<{ id: string; soul_name: string; category: string }>
  >([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editIdentity, setEditIdentity] = useState("");
  const [editPersona, setEditPersona] = useState("");
  const [editMotivation, setEditMotivation] = useState("");
  const [editTaboo, setEditTaboo] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSoulJson, setEditSoulJson] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    let soulJson: string | undefined;
    if (createMode === "template" && selectedTemplate) {
      try {
        const { templateApi } = await import("../../lib/tauri");
        const all = await templateApi.listSoulTemplates();
        const tmpl = all.find((t) => t.id === selectedTemplate);
        if (tmpl) {
          soulJson = JSON.stringify({
            matched_template: tmpl.soul_name,
            customization: {
              personality: JSON.parse(tmpl.personality_json || "{}"),
              speech: JSON.parse(tmpl.speech_json || "{}"),
              behavior: JSON.parse(tmpl.behavior_json || "{}"),
              relationships: tmpl.relationships_json ? JSON.parse(tmpl.relationships_json) : {},
            },
          });
        }
      } catch {
        /* fallback */
      }
    }
    if (createMode === "ai" && aiDesc.trim()) {
      try {
        const { agentApi } = await import("../../lib/tauri");
        const result = await agentApi.run("soul_matcher", {
          name: newName.trim(),
          role_type: newRole,
          identity_core: aiDesc.trim(),
          soul_templates: "使用内置SOUL模板库",
        });
        if (result) {
          const cleaned = result.content
            .replace(/```json\n?/g, "")
            .replace(/```\n?/g, "")
            .trim();
          soulJson = cleaned;
        }
      } catch {
        /* fallback */
      }
    }
    await create(newName.trim(), newRole, soulJson);
    setNewName("");
    setNewRole("supporting");
    setSelectedTemplate("");
    setAiDesc("");
    setCreateMode("blank");
    setShowCreate(false);
  };

  const openWizard = async () => {
    setShowCreate(true);
    try {
      const { templateApi } = await import("../../lib/tauri");
      setTemplates(await templateApi.listSoulTemplates());
    } catch {}
  };

  const startEdit = (char: (typeof characters)[0]) => {
    setEditingId(char.id);
    setEditName(char.name);
    setEditRole(char.role_type);
    setEditIdentity(char.identity_core || "");
    setEditPersona(char.persona_core || "");
    setEditMotivation(char.core_motivation || "");
    setEditTaboo(char.taboo_rules || "");
    setEditDescription(getSoulDescription(char.soul_json));
    setEditSoulJson(char.soul_json);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const nextSoulJson = withSoulDescription(editSoulJson || "{}", editDescription);
    await update(
      editingId,
      editName,
      nextSoulJson,
      editRole,
      editIdentity,
      editPersona,
      editMotivation,
      editTaboo,
    );
    if (selectedCharacter?.id === editingId) {
      select({
        ...selectedCharacter,
        name: editName,
        role_type: editRole,
        identity_core: editIdentity || null,
        persona_core: editPersona || null,
        core_motivation: editMotivation || null,
        taboo_rules: editTaboo || null,
        soul_json: nextSoulJson,
      });
    }
    setEditingId(null);
  };

  const handleAiSoul = async () => {
    if (!editingId || !editName) return;
    setGenerating(true);
    try {
      const userPrompt = [
        `角色名：${editName}`,
        `角色类型：${editRole}`,
        `身份核心：${editIdentity || "待定"}`,
        `人格核心：${editPersona || "待定"}`,
        `核心动机：${editMotivation || "待定"}`,
        `禁忌规则：${editTaboo || "无"}`,
        `角色简介：${editDescription || "待定"}`,
      ].join("\n");
      const result = await chatWithSystem(
        "你是一个角色SOUL（性格-语言-行为）匹配专家。请根据角色基本信息，生成完整的SOUL设定，包含personality、speech、behavior、relationships四个维度。直接输出JSON，不要任何说明。",
        userPrompt,
      );
      if (result) {
        const cleanResult = result
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        JSON.parse(cleanResult); // validate
        setEditSoulJson(withSoulDescription(cleanResult, editDescription));
      }
    } catch {
      // AI generation failed, ignore
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除此角色？此操作不可恢复。")) return;
    await remove(id);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Character list */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Users size={18} className="text-indigo-600" />
            角色管理
          </h2>
          <button
            onClick={openWizard}
            className="flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700"
          >
            <Plus size={14} />
            新建
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {characters.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              暂无角色，点击上方「新建」创建
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {characters.map((char) => {
                const roleInfo = roleLabels[char.role_type] || roleLabels.supporting;
                const statusInfo = statusLabels[char.status] || statusLabels.active;
                const isSelected = selectedCharacter?.id === char.id;
                return (
                  <button
                    key={char.id}
                    onClick={() => select(char)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                      isSelected ? "bg-indigo-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/project/${projectId}/character/${char.id}`);
                        }}
                        className="font-medium text-gray-900 hover:text-indigo-600 transition-colors text-left"
                        title={`查看 ${char.name} 详情`}
                      >
                        {char.name}
                      </button>
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                    <div className="flex gap-1.5 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${roleInfo.color}`}>
                        {roleInfo.label}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Create wizard */}
        {showCreate && (
          <div className="border-t border-gray-200 p-4 bg-gray-50 space-y-3">
            {/* Mode selector */}
            <div className="flex gap-1 bg-gray-200 rounded-lg p-0.5">
              {[
                { key: "blank" as const, label: "空白创建" },
                { key: "template" as const, label: "从模板" },
                { key: "ai" as const, label: "AI 生成" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setCreateMode(key)}
                  className={`flex-1 py-1 text-xs rounded-md transition-colors ${
                    createMode === key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="角色名"
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              autoFocus
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
            >
              <option value="protagonist">主角</option>
              <option value="antagonist">反派</option>
              <option value="supporting">配角</option>
              <option value="minor">龙套</option>
            </select>

            {createMode === "template" && (
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              >
                <option value="">选择SOUL模板...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.soul_name} ({t.category})
                  </option>
                ))}
              </select>
            )}

            {createMode === "ai" && (
              <textarea
                value={aiDesc}
                onChange={(e) => setAiDesc(e.target.value)}
                placeholder="描述角色设定（AI将自动生成SOUL）&#10;例如：少年剑客，性格孤傲但重情义，说话简洁有力"
                className="w-full h-20 px-3 py-1.5 border border-gray-200 rounded-lg text-sm resize-none"
              />
            )}

            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || (createMode === "ai" && !aiDesc.trim())}
                className="flex-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMode === "ai" ? "AI 生成并创建" : "创建"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Character detail / editor */}
      <div className="flex-1 overflow-auto">
        {!selectedCharacter ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            选择左侧角色查看详情
          </div>
        ) : editingId === selectedCharacter.id ? (
          /* Edit mode */
          <div className="max-w-2xl mx-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">编辑角色</h3>
              <div className="flex gap-2">
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                >
                  <Check size={14} />
                  保存
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300"
                >
                  <X size={14} />
                  取消
                </button>
              </div>
            </div>

            {/* Basic info */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">角色名</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">角色类型</label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value="protagonist">主角</option>
                    <option value="antagonist">反派</option>
                    <option value="supporting">配角</option>
                    <option value="minor">龙套</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">身份核心</label>
                <input
                  type="text"
                  value={editIdentity}
                  onChange={(e) => setEditIdentity(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="如：宗门大弟子、市井孤儿"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">人格核心</label>
                <input
                  type="text"
                  value={editPersona}
                  onChange={(e) => setEditPersona(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="如：外冷内热、嫉恶如仇"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">核心动机</label>
                <input
                  type="text"
                  value={editMotivation}
                  onChange={(e) => setEditMotivation(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  placeholder="如：复仇、守护家人、寻找真相"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">禁忌规则</label>
                <textarea
                  value={editTaboo}
                  onChange={(e) => setEditTaboo(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  placeholder="如：不会背叛师门、不能主动伤害无辜、忌用特定口头禅"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">角色简介</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  placeholder="补充角色出身、当前处境、关键关系或读者第一印象"
                />
              </div>
            </div>

            {/* SOUL Editor */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900 text-sm">SOUL 设定</h4>
                <button
                  onClick={handleAiSoul}
                  disabled={generating}
                  className="flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-lg text-xs hover:bg-purple-100 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {generating ? "生成中..." : "AI 生成 SOUL"}
                </button>
              </div>
              <SoulEditor soulJson={editSoulJson} onChange={setEditSoulJson} />
            </div>
          </div>
        ) : (
          /* View mode */
          <div className="max-w-2xl mx-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900">{selectedCharacter.name}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${(roleLabels[selectedCharacter.role_type] || roleLabels.supporting).color}`}
                >
                  {(roleLabels[selectedCharacter.role_type] || roleLabels.supporting).label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${(statusLabels[selectedCharacter.status] || statusLabels.active).color}`}
                >
                  {(statusLabels[selectedCharacter.status] || statusLabels.active).label}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(selectedCharacter)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                >
                  <Edit3 size={14} />
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(selectedCharacter.id)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm hover:bg-red-100"
                >
                  <Trash2 size={14} />
                  删除
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h4 className="font-medium text-gray-900 text-sm mb-3">角色档案</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <ProfileField label="身份核心" value={selectedCharacter.identity_core} />
                <ProfileField label="人格核心" value={selectedCharacter.persona_core} />
                <ProfileField label="核心动机" value={selectedCharacter.core_motivation} />
                <ProfileField label="禁忌规则" value={selectedCharacter.taboo_rules} />
              </div>
              <div className="mt-3">
                <ProfileField
                  label="角色简介"
                  value={getSoulDescription(selectedCharacter.soul_json)}
                  multiline
                />
              </div>
            </div>

            {/* SOUL display */}
            <div className="border-t border-gray-200 pt-4">
              <h4 className="font-medium text-gray-900 text-sm mb-3">SOUL 设定</h4>
              <SoulView soulJson={selectedCharacter.soul_json} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  return (
    <div>
      <h5 className="text-xs text-gray-500 mb-1">{label}</h5>
      <p className={`text-sm text-gray-800 ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value?.trim() || "暂无"}
      </p>
    </div>
  );
}

function SoulView({ soulJson }: { soulJson: string }) {
  const soul = parseSoulJson(soulJson);
  const sections = getSoulSections(soul);
  const [activeTab, setActiveTab] = useState<
    "personality" | "speech" | "behavior" | "relationships"
  >("personality");

  if (!sections.personality && !sections.speech && !sections.behavior && !sections.relationships) {
    return <p className="text-sm text-gray-400">暂无 SOUL 设定</p>;
  }

  const tabs = [
    { key: "personality" as const, label: "性格" },
    { key: "speech" as const, label: "语言" },
    { key: "behavior" as const, label: "行为" },
    { key: "relationships" as const, label: "关系" },
  ];

  return (
    <div className="space-y-3">
      {soul.matched_template && (
        <div className="inline-flex px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs">
          匹配模板：{soul.matched_template}
        </div>
      )}

      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-3 py-1.5 text-sm transition-colors ${
              activeTab === key
                ? "text-indigo-700 border-b-2 border-indigo-600 font-medium"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "personality" && sections.personality && (
        <div className="space-y-2 text-sm">
          {sections.personality.core_traits && sections.personality.core_traits.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sections.personality.core_traits.map((t, i) => (
                <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">
                  {t}
                </span>
              ))}
            </div>
          )}
          {sections.personality.emotional_range && (
            <p>
              <span className="text-gray-500">情感范围：</span>
              {sections.personality.emotional_range}
            </p>
          )}
          {sections.personality.stress_response && (
            <p>
              <span className="text-gray-500">压力反应：</span>
              {sections.personality.stress_response}
            </p>
          )}
          {sections.personality.growth_direction && (
            <p>
              <span className="text-gray-500">成长方向：</span>
              {sections.personality.growth_direction}
            </p>
          )}
        </div>
      )}

      {activeTab === "speech" && sections.speech && (
        <div className="space-y-2 text-sm">
          {sections.speech.tone && (
            <p>
              <span className="text-gray-500">语调：</span>
              {sections.speech.tone}
            </p>
          )}
          {sections.speech.vocabulary && (
            <p>
              <span className="text-gray-500">词汇风格：</span>
              {sections.speech.vocabulary}
            </p>
          )}
          {sections.speech.sentence_pattern && (
            <p>
              <span className="text-gray-500">句式：</span>
              {sections.speech.sentence_pattern}
            </p>
          )}
          {sections.speech.catchphrases && sections.speech.catchphrases.length > 0 && (
            <div>
              <span className="text-gray-500">口头禅：</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {sections.speech.catchphrases.map((p, i) => (
                  <span key={i} className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded text-xs">
                    「{p}」
                  </span>
                ))}
              </div>
            </div>
          )}
          {sections.speech.taboo_words && sections.speech.taboo_words.length > 0 && (
            <div>
              <span className="text-gray-500">禁用词：</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {sections.speech.taboo_words.map((w, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs line-through"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "behavior" && sections.behavior && (
        <div className="space-y-2 text-sm">
          {sections.behavior.posture && (
            <p>
              <span className="text-gray-500">姿态：</span>
              {sections.behavior.posture}
            </p>
          )}
          {sections.behavior.fighting_style && (
            <p>
              <span className="text-gray-500">战斗风格：</span>
              {sections.behavior.fighting_style}
            </p>
          )}
          {sections.behavior.decision_pattern && (
            <p>
              <span className="text-gray-500">决策模式：</span>
              {sections.behavior.decision_pattern}
            </p>
          )}
          {sections.behavior.conflict_style && (
            <p>
              <span className="text-gray-500">冲突风格：</span>
              {sections.behavior.conflict_style}
            </p>
          )}
          {sections.behavior.habit && (
            <p>
              <span className="text-gray-500">习惯：</span>
              {sections.behavior.habit}
            </p>
          )}
        </div>
      )}

      {activeTab === "relationships" && sections.relationships && (
        <div className="space-y-2 text-sm">
          {sections.relationships.default_stance && (
            <p>
              <span className="text-gray-500">默认立场：</span>
              {sections.relationships.default_stance}
            </p>
          )}
          {sections.relationships.trust_pattern && (
            <p>
              <span className="text-gray-500">信任模式：</span>
              {sections.relationships.trust_pattern}
            </p>
          )}
          {sections.relationships.conflict_reaction && (
            <p>
              <span className="text-gray-500">冲突反应：</span>
              {sections.relationships.conflict_reaction}
            </p>
          )}
          {sections.relationships.loyalty_trigger && (
            <p>
              <span className="text-gray-500">忠诚触发：</span>
              {sections.relationships.loyalty_trigger}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
