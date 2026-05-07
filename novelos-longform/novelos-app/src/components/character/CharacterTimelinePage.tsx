import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChapterStore } from "../../stores";
import { ledgerApi, type CharacterStateInfo } from "../../lib/api";
import {
  ArrowLeft,
  Clock,
  TrendingUp,
  Heart,
  Target,
  MapPin,
  User,
  Loader2,
  Calendar,
} from "lucide-react";

interface TimelineNode {
  id: string;
  chapterFrom: number | null;
  chapterTo: number | null;
  date: string;
  levelState: string | null;
  emotionState: string | null;
  goalState: string | null;
  physicalState: string | null;
  locationId: string | null;
  resourceState: string | null;
  knownInfo: string | null;
  secretInfo: string | null;
}

interface StateChange {
  label: string;
  value: string;
  icon: typeof Clock;
  color: string;
  bgClass: string;
}

const stateColors: Record<
  string,
  { color: string; bgClass: string; label: string; icon: typeof Clock }
> = {
  level: {
    color: "text-blue-600",
    bgClass: "bg-blue-50 border-blue-200",
    label: "等级/状态",
    icon: TrendingUp,
  },
  emotion: {
    color: "text-pink-600",
    bgClass: "bg-pink-50 border-pink-200",
    label: "情绪",
    icon: Heart,
  },
  goal: {
    color: "text-green-600",
    bgClass: "bg-green-50 border-green-200",
    label: "目标",
    icon: Target,
  },
  physical: {
    color: "text-yellow-600",
    bgClass: "bg-yellow-50 border-yellow-200",
    label: "身体/位置",
    icon: MapPin,
  },
};

export function CharacterTimelinePage() {
  const { characterId } = useParams<{ characterId: string }>();
  const navigate = useNavigate();
  const { characters, fetchCharacters } = useChapterStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<CharacterStateInfo[]>([]);

  const character = characters.find((c) => c.id === characterId);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await ledgerApi.listCharacterStates(characterId);
        if (!cancelled) {
          setStates(data);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.toString() || "无法加载人物状态时间线");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  // Build change entries from each state record
  const changes: StateChange[] = [];
  for (const key of ["level", "emotion", "goal", "physical"] as const) {
    states.forEach((s) => {
      const fieldMap: Record<string, string | null> = {
        level: s.level_state,
        emotion: s.emotion_state,
        goal: s.goal_state,
        physical: s.physical_state,
      };
      if (fieldMap[key]) {
        // Only add if not already present for this state record + key combo
        const alreadyExists = changes.some(
          (c) => c.value === fieldMap[key] && c.label === stateColors[key].label,
        );
        if (!alreadyExists) {
          changes.push({
            label: stateColors[key].label,
            value: fieldMap[key]!,
            icon: stateColors[key].icon,
            color: stateColors[key].color,
            bgClass: stateColors[key].bgClass,
          });
        }
      }
    });
  }

  // Loading state
  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-3 py-20 justify-center text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-sm">加载人物状态时间线...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft size={14} /> 返回
        </button>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Clock size={48} className="mb-4 text-red-300" />
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 text-xs text-indigo-600 hover:text-indigo-700"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  // Character not found
  if (!character) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft size={14} /> 返回
        </button>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <User size={48} className="mb-4" />
          <p className="text-sm">角色不存在</p>
          <p className="text-xs mt-1">无法找到该角色的信息，可能已被删除</p>
        </div>
      </div>
    );
  }

  // Empty state: no state records
  if (states.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft size={14} /> 返回角色详情
        </button>
        <h1 className="text-xl font-bold text-gray-900 mb-1">{character.name} 状态时间线</h1>
        <p className="text-sm text-gray-500 mb-6">追踪角色在故事中的状态变化轨迹</p>
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Clock size={48} className="mb-4" />
          <p className="text-sm">暂无状态记录</p>
          <p className="text-xs mt-1">章节定稿后会自动创建角色状态快照，或手动在账本中添加</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft size={14} /> 返回角色详情
        </button>

        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <User size={24} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              {character.name}
              <span className="text-base font-normal text-gray-400 ml-2">状态时间线</span>
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">{character.role_type}</span>
              {character.alias && (
                <span className="text-sm text-gray-400">({character.alias})</span>
              )}
              <span className="text-xs text-gray-300">|</span>
              <span className="text-sm text-gray-500">{states.length} 条状态记录</span>
            </div>
          </div>
        </div>

        {/* Vertical timeline */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-0">
            {states.map((state, index) => {
              const isLast = index === states.length - 1;

              // Collect the state summary fields for this record
              const summaries: {
                key: string;
                value: string;
                icon: typeof Clock;
                color: string;
                bgClass: string;
              }[] = [];
              if (state.level_state) {
                summaries.push({
                  key: "level",
                  value: state.level_state,
                  icon: TrendingUp,
                  color: "text-blue-600",
                  bgClass: "bg-blue-50",
                });
              }
              if (state.emotion_state) {
                summaries.push({
                  key: "emotion",
                  value: state.emotion_state,
                  icon: Heart,
                  color: "text-pink-600",
                  bgClass: "bg-pink-50",
                });
              }
              if (state.goal_state) {
                summaries.push({
                  key: "goal",
                  value: state.goal_state,
                  icon: Target,
                  color: "text-green-600",
                  bgClass: "bg-green-50",
                });
              }
              if (state.physical_state) {
                summaries.push({
                  key: "physical",
                  value: state.physical_state,
                  icon: MapPin,
                  color: "text-yellow-600",
                  bgClass: "bg-yellow-50",
                });
              }

              return (
                <div key={state.id} className="relative pb-6">
                  {/* Timeline dot */}
                  <div className="absolute left-5 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-indigo-400 z-10" />

                  <div className="ml-12">
                    {/* Chapter range header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {state.chapter_from != null ? `第${state.chapter_from}章` : "未知章节"}
                        {state.chapter_to != null &&
                          state.chapter_to !== state.chapter_from &&
                          ` - 第${state.chapter_to}章`}
                      </span>
                      {state.created_at && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Calendar size={12} />
                          {new Date(state.created_at).toLocaleDateString("zh-CN", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </span>
                      )}
                    </div>

                    {/* State summary pills */}
                    <div
                      className={`p-3 rounded-lg border border-gray-200 bg-white ${
                        !isLast ? "" : ""
                      }`}
                    >
                      {summaries.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {summaries.map((s) => {
                            const IconComponent = s.icon;
                            return (
                              <span
                                key={s.key}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${s.bgClass} ${s.color}`}
                              >
                                <IconComponent size={12} />
                                {s.value}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">状态快照（无详细标注）</span>
                      )}

                      {/* Extended info */}
                      <div className="mt-2 space-y-0.5">
                        {state.location_id && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <MapPin size={12} className="text-yellow-500" />
                            <span>位置: {state.location_id}</span>
                          </div>
                        )}
                        {state.resource_state && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Target size={12} className="text-purple-500" />
                            <span>资源: {state.resource_state}</span>
                          </div>
                        )}
                        {state.known_info && (
                          <div className="flex items-start gap-1.5 text-xs text-gray-500">
                            <span className="text-green-500 font-medium shrink-0">已知:</span>
                            <span className="line-clamp-2">{state.known_info}</span>
                          </div>
                        )}
                        {state.secret_info && (
                          <div className="flex items-start gap-1.5 text-xs text-gray-500">
                            <span className="text-red-500 font-medium shrink-0">秘密:</span>
                            <span className="line-clamp-2">{state.secret_info}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
