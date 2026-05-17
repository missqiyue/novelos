import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChapterStore } from "../../stores";
import {
  chapterApi,
  ledgerApi,
  type CharacterInfo,
  type RelationshipStateInfo,
  type ForeshadowItemInfo,
} from "../../lib/api";
import { ArrowLeft, Users, Heart, Lightbulb, Edit3, Save, X } from "lucide-react";

type SoulSection = Record<string, unknown>;

function parseSoulJson(soulJson: string): any {
  try {
    return JSON.parse(soulJson || "{}");
  } catch {
    return {};
  }
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

function getSoulSections(soul: any): {
  personality?: SoulSection;
  speech?: SoulSection;
  behavior?: SoulSection;
  relationships?: SoulSection;
} {
  return {
    personality: soul.personality || soul.customization?.personality,
    speech: soul.speech || soul.customization?.speech,
    behavior: soul.behavior || soul.customization?.behavior,
    relationships: soul.relationships || soul.customization?.relationships,
  };
}

export function CharacterDetailPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const { characters, fetchCharacters } = useChapterStore();
  const [character, setCharacter] = useState<CharacterInfo | null>(null);
  const [relationships, setRelationships] = useState<RelationshipStateInfo[]>([]);
  const [foreshadows, setForeshadows] = useState<ForeshadowItemInfo[]>([]);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editIdentity, setEditIdentity] = useState("");
  const [editPersona, setEditPersona] = useState("");
  const [editMotivation, setEditMotivation] = useState("");
  const [editTaboo, setEditTaboo] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [soulJson, setSoulJson] = useState("");

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  useEffect(() => {
    const ch = characters.find((c) => c.id === characterId);
    if (ch) {
      setCharacter(ch);
      setSoulJson(ch.soul_json);
      loadRelated(ch.id, ch.name);
    }
  }, [characterId, characters]);

  const loadRelated = async (id: string, name: string) => {
    try {
      const rels = await ledgerApi.listRelationshipStates(id);
      setRelationships(rels);
      // Foreshadows mentioning this character
      const allFs = await ledgerApi.listForeshadowItems();
      setForeshadows(allFs.filter((f) => f.notes?.includes(name) || f.title.includes(name)));
    } catch {
      /* empty */
    }
  };

  if (!character) {
    return <div className="p-6 text-sm text-gray-400">角色不存在</div>;
  }

  const soulData = (() => {
    try {
      return JSON.parse(character.soul_json);
    } catch {
      return null;
    }
  })();
  const resolveName = (id: string) => characters.find((c) => c.id === id)?.name || id.slice(0, 8);

  const startEdit = () => {
    setEditName(character.name);
    setEditRole(character.role_type);
    setEditIdentity(character.identity_core || "");
    setEditPersona(character.persona_core || "");
    setEditMotivation(character.core_motivation || "");
    setEditTaboo(character.taboo_rules || "");
    setEditDescription(getSoulDescription(character.soul_json));
    setSoulJson(character.soul_json || "{}");
    setEditing(true);
  };

  const handleSave = async () => {
    const nextSoulJson = withSoulDescription(soulJson || "{}", editDescription);
    await chapterApi.updateCharacter(
      character.id,
      editName,
      nextSoulJson,
      editRole,
      editIdentity,
      editPersona,
      editMotivation,
      editTaboo,
    );
    setEditing(false);
    await fetchCharacters();
  };

  return (
    <div className="p-6 max-w-4xl">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft size={14} /> 返回角色列表
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{character.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">{character.role_type}</span>
            {character.alias && <span className="text-sm text-gray-400">({character.alias})</span>}
          </div>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Save size={14} />
              保存
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <X size={14} />
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <Edit3 size={14} />
            编辑档案
          </button>
        )}
      </div>

      {editing && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4 space-y-3">
          <h3 className="font-medium text-gray-900">编辑角色档案</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">
              角色名
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 border border-gray-200 rounded text-sm"
              />
            </label>
            <label className="text-xs text-gray-500">
              角色类型
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 border border-gray-200 rounded text-sm"
              >
                <option value="protagonist">主角</option>
                <option value="antagonist">反派</option>
                <option value="supporting">配角</option>
                <option value="minor">龙套</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <EditTextarea label="身份核心" value={editIdentity} onChange={setEditIdentity} />
            <EditTextarea label="人格核心" value={editPersona} onChange={setEditPersona} />
            <EditTextarea label="核心动机" value={editMotivation} onChange={setEditMotivation} />
            <EditTextarea label="禁忌规则" value={editTaboo} onChange={setEditTaboo} />
          </div>
          <EditTextarea label="角色简介" value={editDescription} onChange={setEditDescription} rows={4} />
          <label className="block text-xs text-gray-500">
            SOUL JSON
            <textarea
              value={soulJson}
              onChange={(e) => setSoulJson(e.target.value)}
              className="mt-1 w-full h-48 px-3 py-2 border border-gray-200 rounded text-sm font-mono"
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Core Identity */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Users size={16} className="text-indigo-600" /> 核心身份
          </h3>
          <div className="space-y-2 text-sm">
            <KV label="身份核心" value={character.identity_core} />
            <KV label="人格核心" value={character.persona_core} />
            <KV label="核心动机" value={character.core_motivation} />
            <KV label="禁忌规则" value={character.taboo_rules} />
            <KV label="角色简介" value={getSoulDescription(character.soul_json)} />
          </div>
        </div>

        {/* SOUL Profile */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Heart size={16} className="text-pink-600" /> SOUL档案
          </h3>
          {soulData ? (
            <SoulSummary soul={soulData} />
          ) : (
            <p className="text-sm text-gray-400">暂无SOUL数据</p>
          )}
        </div>

        {/* Relationships */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Heart size={16} className="text-red-600" /> 关系列表
          </h3>
          {relationships.length === 0 ? (
            <p className="text-sm text-gray-400">暂无关系记录</p>
          ) : (
            <div className="space-y-1.5">
              {relationships.map((r) => {
                const otherId =
                  r.source_character_id === character.id
                    ? r.target_character_id
                    : r.source_character_id;
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm p-1.5 rounded hover:bg-gray-50"
                  >
                    <span className="text-gray-900">{resolveName(otherId)}</span>
                    <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                      {r.relation_type}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Foreshadows */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Lightbulb size={16} className="text-amber-600" /> 关联伏笔
          </h3>
          {foreshadows.length === 0 ? (
            <p className="text-sm text-gray-400">暂无关联伏笔</p>
          ) : (
            <div className="space-y-1">
              {foreshadows.map((fs) => (
                <div
                  key={fs.id}
                  className="flex items-center justify-between text-sm p-1.5 rounded hover:bg-gray-50"
                >
                  <span className="text-gray-900">{fs.title}</span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      fs.status === "resolved"
                        ? "bg-green-100 text-green-700"
                        : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {fs.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="text-gray-700 mt-0.5 whitespace-pre-wrap">{value?.trim() || "暂无"}</p>
    </div>
  );
}

function EditTextarea({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block text-xs text-gray-500">
      {label}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 w-full px-3 py-1.5 border border-gray-200 rounded text-sm resize-none"
      />
    </label>
  );
}

function SoulSummary({ soul }: { soul: any }) {
  const sections = getSoulSections(soul);
  const sectionEntries: Array<[string, SoulSection | undefined, string]> = [
    ["性格", sections.personality, "bg-blue-50"],
    ["语言", sections.speech, "bg-green-50"],
    ["行为", sections.behavior, "bg-yellow-50"],
    ["关系", sections.relationships, "bg-pink-50"],
  ];

  if (!sections.personality && !sections.speech && !sections.behavior && !sections.relationships) {
    return <p className="text-sm text-gray-400">暂无SOUL数据</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {soul.matched_template && <p className="text-xs text-indigo-600">模板: {soul.matched_template}</p>}
      {sectionEntries.map(([label, section, color]) =>
        section ? (
          <div key={label}>
            <span className="text-xs font-medium text-gray-500">{label}</span>
            <div className="text-xs text-gray-700 mt-1 flex flex-wrap gap-1">
              {Object.entries(section).map(([key, value]) => (
                <span key={key} className={`inline-block px-1.5 py-0.5 ${color} rounded`}>
                  {key}: {Array.isArray(value) ? value.join("、") : String(value)}
                </span>
              ))}
            </div>
          </div>
        ) : null,
      )}
      {Array.isArray(soul.speech_examples) && (
        <div>
          <span className="text-xs font-medium text-gray-500">说话示例</span>
          {soul.speech_examples.map((ex: string, i: number) => (
            <p key={i} className="text-xs text-gray-600 italic mt-0.5">
              "{ex}"
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
