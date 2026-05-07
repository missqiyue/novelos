import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChapterStore } from "../../stores";
import {
  ledgerApi,
  type CharacterInfo,
  type RelationshipStateInfo,
  type ForeshadowItemInfo,
} from "../../lib/api";
import { ArrowLeft, Users, Heart, Lightbulb, Clock, Edit3, Save } from "lucide-react";

export function CharacterDetailPage() {
  const { characterId } = useParams();
  const navigate = useNavigate();
  const { characters, fetchCharacters } = useChapterStore();
  const [character, setCharacter] = useState<CharacterInfo | null>(null);
  const [relationships, setRelationships] = useState<RelationshipStateInfo[]>([]);
  const [foreshadows, setForeshadows] = useState<ForeshadowItemInfo[]>([]);
  const [editingSoul, setEditingSoul] = useState(false);
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

  const handleSaveSoul = async () => {
    const { chapterApi } = await import("../../lib/tauri");
    await chapterApi.updateCharacter(character.id, undefined, soulJson);
    setEditingSoul(false);
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
        <button
          onClick={() => setEditingSoul(!editingSoul)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          {editingSoul ? <Save size={14} /> : <Edit3 size={14} />}
          {editingSoul ? "保存" : "编辑SOUL"}
        </button>
      </div>

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
          </div>
        </div>

        {/* SOUL Profile */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
            <Heart size={16} className="text-pink-600" /> SOUL档案
          </h3>
          {editingSoul ? (
            <textarea
              value={soulJson}
              onChange={(e) => setSoulJson(e.target.value)}
              className="w-full h-40 px-3 py-2 border border-gray-200 rounded text-sm font-mono"
            />
          ) : soulData ? (
            <div className="space-y-3 text-sm">
              {soulData.matched_template && (
                <p className="text-xs text-indigo-600">模板: {soulData.matched_template}</p>
              )}
              {soulData.customization && (
                <>
                  {soulData.customization.personality && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">性格</span>
                      <div className="text-xs text-gray-700 mt-0.5">
                        {Object.entries(
                          soulData.customization.personality as Record<string, string>,
                        ).map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-block mr-2 px-1.5 py-0.5 bg-blue-50 rounded"
                          >
                            {k}:{v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {soulData.customization.speech && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">说话风格</span>
                      <div className="text-xs text-gray-700 mt-0.5">
                        {Object.entries(
                          soulData.customization.speech as Record<string, string>,
                        ).map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-block mr-2 px-1.5 py-0.5 bg-green-50 rounded"
                          >
                            {k}:{v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {soulData.customization.behavior && (
                    <div>
                      <span className="text-xs font-medium text-gray-500">行为模式</span>
                      <div className="text-xs text-gray-700 mt-0.5">
                        {Object.entries(
                          soulData.customization.behavior as Record<string, string>,
                        ).map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-block mr-2 px-1.5 py-0.5 bg-yellow-50 rounded"
                          >
                            {k}:{v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {soulData.speech_examples && (
                <div>
                  <span className="text-xs font-medium text-gray-500">说话示例</span>
                  {(soulData.speech_examples as string[]).map((ex, i) => (
                    <p key={i} className="text-xs text-gray-600 italic mt-0.5">
                      "{ex}"
                    </p>
                  ))}
                </div>
              )}
            </div>
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
  if (!value) return null;
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <p className="text-gray-700 mt-0.5">{value}</p>
    </div>
  );
}
