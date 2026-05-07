import { useEffect, useState } from "react";
import { useProjectStore, useChapterStore, useCanonStore, useOutlineStore } from "../../stores";
import { RelationshipGraph } from "./RelationshipGraph";
import { HealthDashboard } from "./HealthDashboard";
import { StoryRoadmap } from "./StoryRoadmap";
import { TokenUsage } from "./TokenUsage";
import { DailyGoalWidget } from "./DailyGoalWidget";
import { QuickActionsWidget } from "./QuickActionsWidget";
import { CharacterActivityHeatmap } from "./CharacterActivityHeatmap";
import { ForeshadowPanel } from "./ForeshadowPanel";
import { CharacterStatusCards } from "./CharacterStatusCards";
import { TimelineMap } from "./TimelineMap";
import {
  BookOpen,
  FileText,
  Users,
  Shield,
  GitBranch,
  Activity,
  TrendingUp,
  BarChart3,
  Network,
  LayoutDashboard,
  Clock,
  Target,
  Heart,
  Map,
  Coins,
  Lightbulb,
  RefreshCw,
  IdCard,
} from "lucide-react";

const tabs = [
  { key: "overview", label: "总览", icon: LayoutDashboard },
  { key: "stats", label: "统计", icon: BarChart3 },
  { key: "health", label: "健康", icon: Heart },
  { key: "roadmap", label: "线路图", icon: Map },
  { key: "graph", label: "人物图谱", icon: Network },
  { key: "characters", label: "角色活跃", icon: Users },
  { key: "characterCards", label: "角色卡片", icon: IdCard },
  { key: "timeline", label: "时间线", icon: Clock },
  { key: "foreshadow", label: "伏笔总览", icon: Lightbulb },
];

export function DashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshing, setRefreshing] = useState(false);
  const { project } = useProjectStore();
  const { chapters, characters, fetchChapters, fetchCharacters } = useChapterStore();
  const { rules, fetch: fetchCanon } = useCanonStore();
  const { volumes, fetchVolumes } = useOutlineStore();

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchChapters(), fetchCharacters(), fetchCanon(), fetchVolumes()]);
    } catch {
      // errors handled by individual stores
    }
    setRefreshing(false);
  };

  useEffect(() => {
    fetchChapters();
    fetchCharacters();
    fetchCanon();
    fetchVolumes();
  }, [fetchChapters, fetchCharacters, fetchCanon, fetchVolumes]);

  const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
  const finalizedCount = chapters.filter((ch) => ch.status === "finalized").length;
  const draftCount = chapters.filter(
    (ch) => ch.status === "drafting" || ch.status === "draft_done",
  ).length;
  const hardRules = rules.filter((r) => r.is_hard && r.status === "active").length;
  const activeChars = characters.filter((c) => c.status === "active").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header + Tabs */}
      <div className="p-6 pb-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project?.title || "项目看板"}</h1>
            {project?.logline && <p className="text-sm text-gray-500 mt-1">{project.logline}</p>}
          </div>
          <button
            onClick={refreshAll}
            disabled={refreshing}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              refreshing
                ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                : "bg-white text-gray-600 border-gray-200 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
            }`}
            title="刷新看板数据"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "刷新中..." : "刷新"}
          </button>
        </div>
        <div className="flex items-center gap-1 border-b border-gray-200">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition-colors ${
                activeTab === key
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="p-6 overflow-auto flex-1">
          {/* Daily writing goal widget */}
          <div className="mb-6">
            <DailyGoalWidget />
          </div>

          {/* Quick actions widget */}
          <div className="mb-6">
            <QuickActionsWidget />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={FileText}
              label="总字数"
              value={totalWords.toLocaleString()}
              sub={`目标: ${project?.target_words?.toLocaleString() || "未设置"}`}
              color="text-blue-600"
              bgColor="bg-blue-50"
            />
            <StatCard
              icon={Activity}
              label="章节进度"
              value={`${finalizedCount}/${chapters.length}`}
              sub={`${draftCount} 章草稿中`}
              color="text-green-600"
              bgColor="bg-green-50"
            />
            <StatCard
              icon={Users}
              label="角色数"
              value={activeChars.toString()}
              sub={`${volumes.length} 卷`}
              color="text-purple-600"
              bgColor="bg-purple-50"
            />
            <StatCard
              icon={Shield}
              label="正典规则"
              value={rules.filter((r) => r.status === "active").length.toString()}
              sub={`${hardRules} 条硬规则`}
              color="text-red-600"
              bgColor="bg-red-50"
            />
          </div>

          {/* Progress bar */}
          {project?.target_words && (
            <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">总体进度</span>
                <span className="text-sm text-gray-500">
                  {((totalWords / project.target_words) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (totalWords / project.target_words) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Two-column info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Volume overview */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                <GitBranch size={16} className="text-indigo-600" />
                卷结构
              </h3>
              {volumes.length === 0 ? (
                <p className="text-sm text-gray-400">暂无卷结构</p>
              ) : (
                <div className="space-y-2">
                  {volumes.map((vol) => (
                    <div key={vol.id} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">
                        第{vol.volume_number}卷: {vol.title || "未命名"}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {vol.status || "未开始"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent chapters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                <BarChart3 size={16} className="text-indigo-600" />
                近期章节
              </h3>
              {chapters.length === 0 ? (
                <p className="text-sm text-gray-400">暂无章节</p>
              ) : (
                <div className="space-y-2">
                  {chapters
                    .slice(-5)
                    .reverse()
                    .map((ch) => (
                      <div key={ch.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">
                          第{ch.chapter_number}章 {ch.title || ""}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{ch.word_count || 0}字</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(ch.status)}`}
                          >
                            {ch.status}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "stats" && (
        <div className="p-6 overflow-auto flex-1">
          {/* Volume progress */}
          <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Target size={16} className="text-indigo-600" /> 卷进度
          </h3>
          <div className="space-y-2 mb-6">
            {volumes.map((vol) => {
              const volChapters = chapters.filter(
                (ch) =>
                  ch.chapter_number >= (vol.chapter_start || 0) &&
                  ch.chapter_number <= (vol.chapter_end || 9999),
              );
              const volWords = volChapters.reduce((s, ch) => s + (ch.word_count || 0), 0);
              const volDone = volChapters.filter((ch) => ch.status === "finalized").length;
              const volTotal =
                volChapters.length ||
                (vol.chapter_end && vol.chapter_start
                  ? vol.chapter_end - vol.chapter_start + 1
                  : 0);
              const pct = volTotal > 0 ? Math.round((volDone / volTotal) * 100) : 0;

              return (
                <div key={vol.id} className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-900">
                      第{vol.volume_number}卷: {vol.title || "未命名"}
                    </span>
                    <span className="text-xs text-gray-500">
                      {volDone}/{volTotal} 章 | {volWords.toLocaleString()} 字
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-indigo-500 to-purple-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chapter status distribution */}
          <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <Activity size={16} className="text-indigo-600" /> 章节状态分布
          </h3>
          <div className="grid grid-cols-4 gap-2 mb-6">
            {[
              {
                label: "就绪",
                count: chapters.filter((ch) => ch.status === "task_ready").length,
                color: "bg-gray-100",
              },
              {
                label: "草稿中",
                count: chapters.filter((ch) => ch.status === "drafting").length,
                color: "bg-yellow-100",
              },
              {
                label: "审阅中",
                count: chapters.filter(
                  (ch) => ch.status === "reviewing" || ch.status === "draft_generated",
                ).length,
                color: "bg-purple-100",
              },
              {
                label: "已定稿",
                count: chapters.filter(
                  (ch) => ch.status === "finalized" || ch.status === "approved",
                ).length,
                color: "bg-green-100",
              },
            ].map(({ label, count, color }) => (
              <div key={label} className={`${color} rounded-lg p-2 text-center`}>
                <div className="text-lg font-bold text-gray-800">{count}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            ))}
          </div>

          {/* Writing pace */}
          <h3 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-indigo-600" /> 写作节奏
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">平均每章字数</div>
              <div className="text-xl font-bold text-gray-900">
                {chapters.length > 0
                  ? Math.round(totalWords / chapters.length).toLocaleString()
                  : 0}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">目标总字数</div>
              <div className="text-xl font-bold text-gray-900">
                {project?.target_words?.toLocaleString() || "未设置"}
              </div>
              {project?.target_words && (
                <div className="text-xs text-indigo-600 mt-0.5">
                  完成 {((totalWords / project.target_words) * 100).toFixed(1)}%
                </div>
              )}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">活跃角色</div>
              <div className="text-xl font-bold text-gray-900">{activeChars}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-500">正典规则</div>
              <div className="text-xl font-bold text-gray-900">
                {rules.filter((r) => r.status === "active").length}
              </div>
            </div>
          </div>

          {/* Token usage */}
          <h3 className="font-medium text-gray-900 mb-3 mt-6 flex items-center gap-2">
            <Coins size={16} className="text-indigo-600" /> LLM用量
          </h3>
          <TokenUsage />
        </div>
      )}

      {activeTab === "health" && <HealthDashboard />}
      {activeTab === "roadmap" && <StoryRoadmap />}
      {activeTab === "graph" && (
        <div className="flex-1 overflow-hidden">
          <RelationshipGraph />
        </div>
      )}
      {activeTab === "characters" && (
        <div className="flex-1 overflow-hidden">
          <CharacterActivityHeatmap />
        </div>
      )}
      {activeTab === "characterCards" && (
        <div className="flex-1 overflow-hidden">
          <CharacterStatusCards />
        </div>
      )}
      {activeTab === "timeline" && (
        <div className="flex-1 overflow-hidden">
          <TimelineMap />
        </div>
      )}
      {activeTab === "foreshadow" && (
        <div className="flex-1 overflow-hidden">
          <ForeshadowPanel />
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bgColor,
}: {
  icon: any;
  label: string;
  value: string;
  sub: string;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon size={18} className={color} />
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-lg font-semibold text-gray-900">{value}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2">{sub}</p>
    </div>
  );
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    task_ready: "bg-gray-100 text-gray-600",
    drafting: "bg-yellow-100 text-yellow-700",
    draft_done: "bg-blue-100 text-blue-700",
    reviewing: "bg-purple-100 text-purple-700",
    finalized: "bg-green-100 text-green-700",
  };
  return colors[status] || "bg-gray-100 text-gray-600";
}
