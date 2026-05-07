import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChapterStore } from "../../stores";
import { ledgerApi, type CharacterStateInfo } from "../../lib/api";
import { Users, Crown, Shield, User, UserCircle, Loader2 } from "lucide-react";

const roleColors: Record<string, { bg: string; text: string; border: string }> = {
  protagonist: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  antagonist: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  supporting: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
  minor: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
};

const roleLabels: Record<string, string> = {
  protagonist: "主角",
  antagonist: "反派",
  supporting: "配角",
  minor: "次要",
};

const roleIcons: Record<string, any> = {
  protagonist: Crown,
  antagonist: Shield,
  supporting: Users,
  minor: UserCircle,
};

export function CharacterStatusCards() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { characters, fetchCharacters, loading: storeLoading } = useChapterStore();
  const [characterStates, setCharacterStates] = useState<CharacterStateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await fetchCharacters();
        const states = await ledgerApi.listCharacterStates();
        setCharacterStates(states);
      } catch (e: any) {
        setError(e.toString());
      }
      setLoading(false);
    };
    load();
  }, [fetchCharacters]);

  const getLatestState = (characterId: string): CharacterStateInfo | undefined => {
    const states = characterStates
      .filter((s) => s.character_id === characterId)
      .sort((a, b) => {
        const aTo = a.chapter_to ?? a.chapter_from ?? 0;
        const bTo = b.chapter_to ?? b.chapter_from ?? 0;
        return bTo - aTo;
      });
    return states[0];
  };

  if (loading || storeLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Loader2 size={36} className="animate-spin mb-3" />
        <p className="text-sm">加载角色数据中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <User size={48} className="mb-4" />
        <p className="text-sm text-red-500">加载失败: {error}</p>
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Users size={48} className="mb-4" />
        <p className="text-sm">暂无角色数据</p>
        <p className="text-xs mt-1">在角色页面创建角色后，此处将显示角色状态卡片</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">角色状态卡片</h2>
      <p className="text-sm text-gray-500 mb-4">展示所有角色当前状态，点击可跳转到角色详情</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {characters.map((char) => {
          const state = getLatestState(char.id);
          const colors = roleColors[char.role_type] || roleColors.minor;
          const RoleIcon = roleIcons[char.role_type] || User;

          return (
            <button
              key={char.id}
              onClick={() => navigate(`/project/${projectId}/character/${char.id}`)}
              className={`text-left border rounded-lg p-4 transition-all cursor-pointer hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${colors.bg} ${colors.border}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <RoleIcon size={18} className={colors.text} />
                  <span className="font-semibold text-gray-900">{char.name}</span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.text} ${colors.bg} border ${colors.border}`}
                >
                  {roleLabels[char.role_type] || char.role_type}
                </span>
              </div>

              {char.identity_core && (
                <p className="text-xs text-gray-500 mb-2 truncate">{char.identity_core}</p>
              )}

              {state ? (
                <div className="space-y-1.5 border-t border-gray-200 pt-2 mt-2">
                  {state.level_state && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">等级</span>
                      <span className="text-gray-700 font-medium truncate ml-2">
                        {state.level_state}
                      </span>
                    </div>
                  )}
                  {state.emotion_state && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">情绪</span>
                      <span className="text-gray-700 font-medium truncate ml-2">
                        {state.emotion_state}
                      </span>
                    </div>
                  )}
                  {state.goal_state && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">目标</span>
                      <span className="text-gray-700 font-medium truncate ml-2">
                        {state.goal_state}
                      </span>
                    </div>
                  )}
                  {state.physical_state && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">身体</span>
                      <span className="text-gray-700 font-medium truncate ml-2">
                        {state.physical_state}
                      </span>
                    </div>
                  )}
                  {state.chapter_to != null && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">最新</span>
                      <span className="text-gray-500">第{state.chapter_to}章</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <p className="text-xs text-gray-400 italic">
                    {char.status === "active" ? "暂无状态记录" : `状态: ${char.status}`}
                  </p>
                </div>
              )}

              {char.core_motivation && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <p className="text-xs text-gray-400 truncate" title={char.core_motivation}>
                    动机: {char.core_motivation}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
