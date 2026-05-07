import { useState, useEffect } from "react";
import {
  Library,
  Palette,
  Shield,
  Ghost,
  BookOpen,
  PenTool,
  Ban,
  ChevronDown,
  ChevronRight,
  Check,
  Download,
} from "lucide-react";
import {
  templateApi,
  deAiRulesApi,
  sharedResourcesApi,
  type GenreTemplateInfo,
  type StyleProfileInfo,
  type DeAiRuleInfo,
  type WritingPatternInfo,
  type GlobalResourcesOverview,
} from "../../lib/api";

type TabKey = "genre" | "style" | "deai" | "patterns" | "overview";

const tabConfig: { key: TabKey; label: string; icon: typeof Library }[] = [
  { key: "overview", label: "总览", icon: Library },
  { key: "genre", label: "题材模板", icon: BookOpen },
  { key: "style", label: "文风档案", icon: Palette },
  { key: "deai", label: "去AI规则", icon: Shield },
  { key: "patterns", label: "写作模式库", icon: PenTool },
];

export function GlobalResourcesPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [overview, setOverview] = useState<GlobalResourcesOverview | null>(null);
  const [genres, setGenres] = useState<GenreTemplateInfo[]>([]);
  const [styles, setStyles] = useState<StyleProfileInfo[]>([]);
  const [deaiRules, setDeaiRules] = useState<DeAiRuleInfo[]>([]);
  const [patterns, setPatterns] = useState<WritingPatternInfo[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    sharedResourcesApi.listGlobalResources()
      .then(setOverview)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (tab === "genre")
      templateApi.listGenreTemplates()
        .then(setGenres)
        .catch(() => {});
    if (tab === "style")
      sharedResourcesApi.listStyleProfiles()
        .then(setStyles)
        .catch(() => {});
    if (tab === "deai")
      deAiRulesApi.list()
        .then(setDeaiRules)
        .catch(() => {});
    if (tab === "patterns")
      sharedResourcesApi.listWritingPatterns()
        .then(setPatterns)
        .catch(() => {});
  }, [tab]);

  const handleApplyGenre = async (id: string) => {
    setApplying(id);
    try {
      await sharedResourcesApi.applyGenreTemplate(id);
      alert("题材模板已应用到当前项目");
    } catch (e: any) {
      alert("应用失败: " + e);
    }
    setApplying(null);
  };

  const handleApplyStyle = async (id: string) => {
    setApplying(id);
    try {
      await sharedResourcesApi.applyStyleProfile(id);
      alert("文风档案已应用到当前项目");
    } catch (e: any) {
      alert("应用失败: " + e);
    }
    setApplying(null);
  };

  const handleImportDeAi = async (ids: string[]) => {
    if (ids.length === 0) return;
    setApplying("deai-batch");
    try {
      const count = await sharedResourcesApi.importDeAiRules(ids);
      alert(`已导入 ${count} 条去AI规则到当前项目`);
    } catch (e: any) {
      alert("导入失败: " + e);
    }
    setApplying(null);
  };

  const [selectedDeAi, setSelectedDeAi] = useState<Set<string>>(new Set());
  const toggleDeAi = (id: string) => {
    setSelectedDeAi((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
        <Library size={22} className="text-indigo-600" />
        全局共享资源库
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        管理跨书共享的题材模板、文风档案、去AI规则和写作模式库
      </p>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabConfig.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              tab === t.key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "题材模板",
              value: overview.genre_templates,
              icon: BookOpen,
              color: "text-blue-600",
            },
            {
              label: "文风档案",
              value: overview.style_profiles,
              icon: Palette,
              color: "text-purple-600",
            },
            {
              label: "去AI规则",
              value: overview.de_ai_rules,
              icon: Shield,
              color: "text-green-600",
            },
            {
              label: "魂魄模板",
              value: overview.soul_templates,
              icon: Ghost,
              color: "text-amber-600",
            },
            {
              label: "写作模式",
              value: overview.writing_patterns,
              icon: PenTool,
              color: "text-pink-600",
            },
            { label: "禁用名", value: overview.banned_names, icon: Ban, color: "text-red-600" },
            { label: "禁用书名", value: overview.banned_titles, icon: Ban, color: "text-red-500" },
          ].map((item) => (
            <div key={item.label} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <item.icon size={18} className={item.color} />
                <span className="text-sm text-gray-600">{item.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{item.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Genre Templates */}
      {tab === "genre" && (
        <div className="space-y-3">
          {genres.length === 0 ? <p className="text-gray-500 text-sm">暂无题材模板</p> : null}
          {genres.map((g) => (
            <div key={g.id} className="bg-white rounded-lg border border-gray-200">
              <button
                onClick={() => setExpanded(expanded === g.id ? null : g.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  {expanded === g.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-medium text-gray-900">{g.genre_name}</span>
                  <span className="text-xs text-gray-400">ID: {g.genre_id}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApplyGenre(g.id);
                  }}
                  disabled={applying === g.id}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <Download size={12} />
                  {applying === g.id ? "应用中..." : "应用到项目"}
                </button>
              </button>
              {expanded === g.id && (
                <div className="px-4 pb-4 text-sm text-gray-700 space-y-2 border-t border-gray-100 pt-3">
                  {g.world_framework && (
                    <p>
                      <span className="text-gray-500">世界观框架:</span> {g.world_framework}
                    </p>
                  )}
                  {g.volume_rhythm && (
                    <p>
                      <span className="text-gray-500">卷节奏:</span> {g.volume_rhythm}
                    </p>
                  )}
                  {g.character_archetypes && (
                    <p>
                      <span className="text-gray-500">角色原型:</span> {g.character_archetypes}
                    </p>
                  )}
                  {g.thrill_params && (
                    <p>
                      <span className="text-gray-500">爽感参数:</span> {g.thrill_params}
                    </p>
                  )}
                  {g.taboo_rules && (
                    <p>
                      <span className="text-gray-500">禁忌规则:</span> {g.taboo_rules}
                    </p>
                  )}
                  {g.naming_style && (
                    <p>
                      <span className="text-gray-500">命名风格:</span> {g.naming_style}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Style Profiles */}
      {tab === "style" && (
        <div className="space-y-3">
          {styles.length === 0 ? <p className="text-gray-500 text-sm">暂无文风档案</p> : null}
          {styles.map((s) => (
            <div key={s.id} className="bg-white rounded-lg border border-gray-200">
              <button
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  {expanded === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-medium text-gray-900">{s.name}</span>
                  {s.is_builtin && (
                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                      内置
                    </span>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApplyStyle(s.id);
                  }}
                  disabled={applying === s.id}
                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <Download size={12} />
                  {applying === s.id ? "应用中..." : "应用到项目"}
                </button>
              </button>
              {expanded === s.id && (
                <div className="px-4 pb-4 text-sm text-gray-700 space-y-2 border-t border-gray-100 pt-3">
                  <p>
                    <span className="text-gray-500">反AI特征:</span> {s.anti_ai_features}
                  </p>
                  <p>
                    <span className="text-gray-500">禁用模式:</span> {s.banned_patterns}
                  </p>
                  <p>
                    <span className="text-gray-500">偏好模式:</span> {s.preferred_patterns}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* De-AI Rules */}
      {tab === "deai" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">
              {deaiRules.length} 条规则，已选 {selectedDeAi.size} 条
            </p>
            <button
              onClick={() => handleImportDeAi(Array.from(selectedDeAi))}
              disabled={selectedDeAi.size === 0 || applying === "deai-batch"}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
            >
              <Download size={12} />
              {applying === "deai-batch" ? "导入中..." : `导入选中规则 (${selectedDeAi.size})`}
            </button>
          </div>
          <div className="space-y-1">
            {deaiRules.map((r) => (
              <div
                key={r.id}
                onClick={() => toggleDeAi(r.id)}
                className={`px-3 py-2 flex items-center gap-3 rounded cursor-pointer text-sm ${
                  selectedDeAi.has(r.id)
                    ? "bg-indigo-50 border border-indigo-200"
                    : "bg-white border border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border flex items-center justify-center ${
                    selectedDeAi.has(r.id) ? "bg-indigo-600 border-indigo-600" : "border-gray-300"
                  }`}
                >
                  {selectedDeAi.has(r.id) && <Check size={10} className="text-white" />}
                </div>
                <span
                  className={`px-1.5 py-0.5 text-[10px] rounded ${
                    r.severity === "high"
                      ? "bg-red-100 text-red-700"
                      : r.severity === "medium"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {r.severity}
                </span>
                <span className="text-gray-500 text-xs">[{r.category}]</span>
                <span className="text-gray-900 font-mono text-xs">{r.pattern}</span>
                {r.replacement && <span className="text-gray-400 text-xs">→ {r.replacement}</span>}
                {!r.is_enabled && <span className="text-xs text-gray-400">（已禁用）</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Writing Patterns */}
      {tab === "patterns" && (
        <div className="space-y-3">
          {patterns.length === 0 ? <p className="text-gray-500 text-sm">暂无写作模式</p> : null}
          {patterns.map((p) => (
            <div key={p.id} className="bg-white rounded-lg border border-gray-200">
              <button
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 text-left"
              >
                {expanded === p.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="font-medium text-gray-900">{p.pattern_name}</span>
                <span className="text-xs text-gray-400">来源: {p.source_type}</span>
                {p.genre_compat && (
                  <span className="text-xs text-gray-400">适用: {p.genre_compat}</span>
                )}
              </button>
              {expanded === p.id && (
                <div className="px-4 pb-4 text-sm text-gray-700 space-y-2 border-t border-gray-100 pt-3">
                  <p>{p.description}</p>
                  {p.usage_guide && (
                    <p>
                      <span className="text-gray-500">使用指南:</span> {p.usage_guide}
                    </p>
                  )}
                  {p.sample_text && (
                    <p className="text-xs font-mono bg-gray-50 p-2 rounded">{p.sample_text}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
