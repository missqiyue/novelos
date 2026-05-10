import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Edit3,
  Ghost,
  Library,
  Loader2,
  Palette,
  PenTool,
  Plus,
  Save,
  Shield,
  Trash2,
} from "lucide-react";
import {
  deAiRulesApi,
  sharedResourcesApi,
  templateApi,
  type DeAiRuleInfo,
  type GenreTemplateInfo,
  type GlobalResourcesOverview,
  type StyleProfileInfo,
  type WritingPatternInfo,
} from "../../lib/api";

type TabKey = "genre" | "style" | "deai" | "patterns" | "overview";
type FormKind = "genre" | "style" | "pattern" | "deai" | null;
type FormItem = GenreTemplateInfo | StyleProfileInfo | WritingPatternInfo | DeAiRuleInfo;

const tabConfig: { key: TabKey; label: string; icon: typeof Library }[] = [
  { key: "overview", label: "总览", icon: Library },
  { key: "genre", label: "题材模板", icon: BookOpen },
  { key: "style", label: "文风档案", icon: Palette },
  { key: "deai", label: "去AI规则", icon: Shield },
  { key: "patterns", label: "写作模式库", icon: PenTool },
];

const builtinGenreIds = new Set([
  "gt-001",
  "gt-002",
  "gt-003",
  "gt-004",
  "gt-005",
  "gt-006",
  "gt-007",
  "gt-008",
  "gt-009",
  "gt-010",
]);

function emptyStyle(): StyleProfileInfo {
  return {
    id: "",
    name: "",
    metrics: "{}",
    preferred_patterns: "",
    anti_ai_features: "",
    sample_paragraphs: "",
    banned_patterns: "",
    is_builtin: false,
    created_at: "",
    updated_at: "",
  };
}

function emptyGenre(): GenreTemplateInfo {
  return {
    id: "",
    genre_id: "",
    genre_name: "",
    world_framework: "",
    volume_rhythm: "",
    character_archetypes: "",
    thrill_params: "",
    taboo_rules: "",
    naming_style: "",
    naming_examples: "",
  };
}

function emptyPattern(): WritingPatternInfo {
  return {
    id: "",
    source_type: "custom",
    source_ref: "",
    pattern_name: "",
    genre_compat: "",
    description: "",
    usage_guide: "",
    sample_text: "",
    created_at: "",
  };
}

function emptyDeAi(): DeAiRuleInfo {
  return {
    id: "",
    category: "通用",
    pattern: "",
    replacement: "",
    severity: "medium",
    is_enabled: true,
    description: "",
    created_at: "",
  };
}

export function GlobalResourcesPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [overview, setOverview] = useState<GlobalResourcesOverview | null>(null);
  const [genres, setGenres] = useState<GenreTemplateInfo[]>([]);
  const [styles, setStyles] = useState<StyleProfileInfo[]>([]);
  const [deaiRules, setDeaiRules] = useState<DeAiRuleInfo[]>([]);
  const [patterns, setPatterns] = useState<WritingPatternInfo[]>([]);
  const [effectiveDeAiRules, setEffectiveDeAiRules] = useState<DeAiRuleInfo[]>([]);
  const [importedDeAiIds, setImportedDeAiIds] = useState<Set<string>>(new Set());
  const [selectedDeAi, setSelectedDeAi] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<FormKind>(null);
  const [genreForm, setGenreForm] = useState<GenreTemplateInfo>(emptyGenre());
  const [styleForm, setStyleForm] = useState<StyleProfileInfo>(emptyStyle());
  const [patternForm, setPatternForm] = useState<WritingPatternInfo>(emptyPattern());
  const [deaiForm, setDeaiForm] = useState<DeAiRuleInfo>(emptyDeAi());

  const importedCount = importedDeAiIds.size;
  const overviewItems = useMemo(
    () => [
      {
        key: "genre" as TabKey,
        label: "题材模板",
        value: overview?.genre_templates ?? 0,
        icon: BookOpen,
        color: "text-blue-600",
      },
      {
        key: "style" as TabKey,
        label: "文风档案",
        value: overview?.style_profiles ?? 0,
        icon: Palette,
        color: "text-purple-600",
      },
      {
        key: "deai" as TabKey,
        label: "去AI规则",
        value: overview?.de_ai_rules ?? 0,
        icon: Shield,
        color: "text-green-600",
      },
      {
        key: "overview" as TabKey,
        label: "魂魄模板",
        value: overview?.soul_templates ?? 0,
        icon: Ghost,
        color: "text-amber-600",
      },
      {
        key: "patterns" as TabKey,
        label: "写作模式",
        value: overview?.writing_patterns ?? 0,
        icon: PenTool,
        color: "text-pink-600",
      },
      {
        key: "overview" as TabKey,
        label: "禁用名",
        value: overview?.banned_names ?? 0,
        icon: Ban,
        color: "text-red-600",
      },
      {
        key: "overview" as TabKey,
        label: "禁用书名",
        value: overview?.banned_titles ?? 0,
        icon: Ban,
        color: "text-red-500",
      },
    ],
    [overview],
  );

  const refreshOverview = async () => {
    setOverview(await sharedResourcesApi.listGlobalResources());
  };

  const refreshGenre = async () => setGenres(await templateApi.listGenreTemplates());
  const refreshStyle = async () => setStyles(await sharedResourcesApi.listStyleProfiles());
  const refreshPatterns = async () => setPatterns(await sharedResourcesApi.listWritingPatterns());
  const refreshDeAi = async () => {
    const [rules, imported, effective] = await Promise.all([
      deAiRulesApi.list(),
      sharedResourcesApi.listImportedDeAiRules(),
      sharedResourcesApi.getEffectiveDeAiRules(),
    ]);
    setDeaiRules(rules);
    setImportedDeAiIds(new Set(imported));
    setSelectedDeAi(new Set(imported));
    setEffectiveDeAiRules(effective);
  };

  useEffect(() => {
    refreshOverview().catch(() => {});
  }, []);

  useEffect(() => {
    setMessage(null);
    if (tab === "genre") refreshGenre().catch(() => {});
    if (tab === "style") refreshStyle().catch(() => {});
    if (tab === "deai") refreshDeAi().catch(() => {});
    if (tab === "patterns") refreshPatterns().catch(() => {});
  }, [tab]);

  const openForm = (kind: FormKind, item?: FormItem, copy = false) => {
    setFormKind(kind);
    if (kind === "genre") {
      const genre = item as GenreTemplateInfo | undefined;
      setGenreForm(
        copy && genre
          ? {
              ...genre,
              id: "",
              genre_id: `${genre.genre_id}_custom`,
              genre_name: `${genre.genre_name} 副本`,
            }
          : (genre ?? emptyGenre()),
      );
    }
    if (kind === "style") {
      const style = item as StyleProfileInfo | undefined;
      setStyleForm(
        copy && style
          ? { ...style, id: "", name: `${style.name} 副本`, is_builtin: false }
          : (style ?? emptyStyle()),
      );
    }
    if (kind === "pattern")
      setPatternForm((item as WritingPatternInfo | undefined) ?? emptyPattern());
    if (kind === "deai") setDeaiForm((item as DeAiRuleInfo | undefined) ?? emptyDeAi());
  };

  const closeForm = () => setFormKind(null);

  const handleSaveForm = async () => {
    setApplying("form");
    try {
      if (formKind === "genre") {
        await sharedResourcesApi.upsertGenreTemplate({
          id: genreForm.id || undefined,
          genre_id: genreForm.genre_id,
          genre_name: genreForm.genre_name,
          world_framework: genreForm.world_framework,
          volume_rhythm: genreForm.volume_rhythm,
          character_archetypes: genreForm.character_archetypes,
          thrill_params: genreForm.thrill_params,
          taboo_rules: genreForm.taboo_rules,
          naming_style: genreForm.naming_style,
          naming_examples: genreForm.naming_examples,
        });
        await refreshGenre();
      }
      if (formKind === "style") {
        await sharedResourcesApi.upsertStyleProfile({
          id: styleForm.id || undefined,
          name: styleForm.name,
          metrics: styleForm.metrics || "{}",
          preferred_patterns: styleForm.preferred_patterns,
          anti_ai_features: styleForm.anti_ai_features,
          sample_paragraphs: styleForm.sample_paragraphs,
          banned_patterns: styleForm.banned_patterns,
        });
        await refreshStyle();
      }
      if (formKind === "pattern") {
        await sharedResourcesApi.upsertWritingPattern({
          id: patternForm.id || undefined,
          source_type: patternForm.source_type || "custom",
          source_ref: patternForm.source_ref,
          pattern_name: patternForm.pattern_name,
          genre_compat: patternForm.genre_compat,
          description: patternForm.description,
          usage_guide: patternForm.usage_guide,
          sample_text: patternForm.sample_text,
        });
        await refreshPatterns();
      }
      if (formKind === "deai") {
        await deAiRulesApi.upsert({
          id: deaiForm.id || undefined,
          category: deaiForm.category,
          pattern: deaiForm.pattern,
          replacement: deaiForm.replacement ?? undefined,
          severity: deaiForm.severity,
          is_enabled: deaiForm.is_enabled,
          description: deaiForm.description ?? undefined,
        });
        await refreshDeAi();
      }
      await refreshOverview();
      setMessage("已保存");
      closeForm();
    } catch (e: unknown) {
      setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(null);
    }
  };

  const handleApplyGenre = async (id: string) => {
    setApplying(id);
    try {
      await sharedResourcesApi.applyGenreTemplate(id);
      setMessage("题材模板已应用到当前项目");
    } catch (e: unknown) {
      setMessage(`应用失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(null);
    }
  };

  const handleApplyStyle = async (id: string) => {
    setApplying(id);
    try {
      await sharedResourcesApi.applyStyleProfile(id);
      setMessage("文风档案已应用到当前项目");
    } catch (e: unknown) {
      setMessage(`应用失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(null);
    }
  };

  const handleImportDeAi = async () => {
    const ids = Array.from(selectedDeAi);
    if (ids.length === 0) return;
    setApplying("deai-batch");
    try {
      const count = await sharedResourcesApi.importDeAiRules(ids);
      await Promise.all([refreshDeAi(), refreshOverview()]);
      setMessage(`已导入 ${count} 条去AI规则到当前项目，后续生成和去AI审校会优先使用这些规则。`);
    } catch (e: unknown) {
      setMessage(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setApplying(null);
    }
  };

  const handleDeleteDeAi = async (id: string) => {
    if (!confirm("确认删除这条去AI规则？")) return;
    await deAiRulesApi.delete(id);
    await Promise.all([refreshDeAi(), refreshOverview()]);
  };

  const toggleDeAi = (id: string) => {
    setSelectedDeAi((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const initStyleSamples = async () => {
    await sharedResourcesApi.upsertStyleProfile({
      name: "干净克制叙事",
      metrics: '{"sentence":"短中句为主","dialogue":"自然推进"}',
      preferred_patterns: "动作承接心理，少解释，多让角色选择显露动机",
      anti_ai_features: "避免总结式抒情、避免连续排比",
      sample_paragraphs: "他没有立刻回答。杯沿停在唇边，茶雾遮住了眼神。",
      banned_patterns: "命运的齿轮；空气仿佛凝固；内心五味杂陈",
    });
    await refreshStyle();
    await refreshOverview();
  };

  const initPatternSamples = async () => {
    await sharedResourcesApi.upsertWritingPattern({
      source_type: "custom",
      pattern_name: "冲突后置钩子",
      genre_compat: "长篇通用",
      description: "章节前半解决显性问题，末尾暴露更高层冲突。",
      usage_guide: "适合用于中段章节，避免连续平铺。",
      sample_text: "胜负刚定，真正的令牌却从死人袖中滑出。",
    });
    await refreshPatterns();
    await refreshOverview();
  };

  const statusBadge = (rule: DeAiRuleInfo) => {
    if (!importedDeAiIds.has(rule.id)) return "未导入";
    const imported = effectiveDeAiRules.find((item) => item.id === rule.id);
    if (!imported) return "已导入";
    return imported.pattern === rule.pattern && imported.replacement === rule.replacement
      ? "已导入"
      : "已更新";
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold text-gray-900">
        <Library size={22} className="text-indigo-600" />
        全局共享资源库
      </h1>
      <p className="mb-4 text-sm text-gray-500">
        管理跨书共享的题材模板、文风档案、去AI规则和写作模式库。
      </p>
      {message && (
        <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
          {message}
        </div>
      )}

      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {tabConfig.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
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

      {tab === "overview" && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {overviewItems.map((item) => (
            <button
              key={item.label}
              onClick={() => item.key !== "overview" && setTab(item.key)}
              className="rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-indigo-200 hover:bg-indigo-50"
            >
              <div className="mb-2 flex items-center gap-2">
                <item.icon size={18} className={item.color} />
                <span className="text-sm text-gray-600">{item.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900">{item.value}</p>
            </button>
          ))}
        </div>
      )}

      {tab === "genre" && (
        <div className="space-y-3">
          <button
            onClick={() => openForm("genre")}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
          >
            <Plus size={14} /> 新增题材模板
          </button>
          {genres.map((g) => {
            const builtin = builtinGenreIds.has(g.id);
            return (
              <div key={g.id} className="rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => setExpanded(expanded === g.id ? null : g.id)}
                  className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    {expanded === g.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="font-medium text-gray-900">{g.genre_name}</span>
                    <span className="text-xs text-gray-400">ID: {g.genre_id}</span>
                    {builtin && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                        内置
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openForm("genre", g, builtin);
                      }}
                      className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                    >
                      {builtin ? "复制编辑" : "编辑"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApplyGenre(g.id);
                      }}
                      disabled={applying === g.id}
                      className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      <Download size={12} /> {applying === g.id ? "应用中..." : "应用到项目"}
                    </button>
                  </div>
                </button>
                {expanded === g.id && (
                  <div className="space-y-2 border-t border-gray-100 px-4 pb-4 pt-3 text-sm text-gray-700">
                    {g.world_framework && (
                      <p>
                        <span className="text-gray-500">世界观框架：</span>
                        {g.world_framework}
                      </p>
                    )}
                    {g.volume_rhythm && (
                      <p>
                        <span className="text-gray-500">卷节奏：</span>
                        {g.volume_rhythm}
                      </p>
                    )}
                    {g.character_archetypes && (
                      <p>
                        <span className="text-gray-500">角色原型：</span>
                        {g.character_archetypes}
                      </p>
                    )}
                    {g.thrill_params && (
                      <p>
                        <span className="text-gray-500">爽感参数：</span>
                        {g.thrill_params}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "style" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => openForm("style")}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
            >
              <Plus size={14} /> 新增文风档案
            </button>
            {styles.length === 0 && (
              <button
                onClick={initStyleSamples}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                初始化内置示例
              </button>
            )}
          </div>
          {styles.length === 0 ? <p className="text-sm text-gray-500">暂无文风档案</p> : null}
          {styles.map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                className="flex w-full items-center justify-between px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  {expanded === s.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span className="font-medium text-gray-900">{s.name}</span>
                  {s.is_builtin && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                      内置
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openForm("style", s, s.is_builtin);
                    }}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                  >
                    {s.is_builtin ? "复制编辑" : "编辑"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApplyStyle(s.id);
                    }}
                    disabled={applying === s.id}
                    className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <Download size={12} /> {applying === s.id ? "应用中..." : "应用到项目"}
                  </button>
                </div>
              </button>
              {expanded === s.id && (
                <div className="space-y-2 border-t border-gray-100 px-4 pb-4 pt-3 text-sm text-gray-700">
                  <p>
                    <span className="text-gray-500">反AI特征：</span>
                    {s.anti_ai_features}
                  </p>
                  <p>
                    <span className="text-gray-500">禁用模式：</span>
                    {s.banned_patterns}
                  </p>
                  <p>
                    <span className="text-gray-500">偏好模式：</span>
                    {s.preferred_patterns}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "deai" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-100 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-800">当前项目生效规则</p>
            <p className="mt-1 text-xs text-green-700">
              {effectiveDeAiRules.length} 条规则生效；已导入 {importedCount}{" "}
              条。导入后生成、去AI审校和完整 pipeline 会优先读取项目规则。
            </p>
            {effectiveDeAiRules.slice(0, 4).map((rule) => (
              <p key={rule.id} className="mt-1 line-clamp-1 text-xs text-green-700">
                [{rule.category}] {rule.pattern}
              </p>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {deaiRules.length} 条规则，已选 {selectedDeAi.size} 条
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => openForm("deai")}
                className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100"
              >
                <Plus size={12} /> 新增规则
              </button>
              <button
                onClick={handleImportDeAi}
                disabled={selectedDeAi.size === 0 || applying === "deai-batch"}
                className="flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {applying === "deai-batch" ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Download size={12} />
                )}
                导入选中规则 ({selectedDeAi.size})
              </button>
            </div>
          </div>
          <div className="space-y-1">
            {deaiRules.map((r) => (
              <div
                key={r.id}
                className={`rounded border px-3 py-2 text-sm ${selectedDeAi.has(r.id) ? "border-indigo-200 bg-indigo-50" : "border-gray-200 bg-white"}`}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleDeAi(r.id)}
                    className={`flex h-4 w-4 items-center justify-center rounded border ${selectedDeAi.has(r.id) ? "border-indigo-600 bg-indigo-600" : "border-gray-300"}`}
                  >
                    {selectedDeAi.has(r.id) && <Check size={10} className="text-white" />}
                  </button>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                    {statusBadge(r)}
                  </span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
                    {r.severity}
                  </span>
                  <span className="text-xs text-gray-500">[{r.category}]</span>
                  <span className="flex-1 font-mono text-xs text-gray-900">{r.pattern}</span>
                  {!r.is_enabled && <span className="text-xs text-gray-400">已禁用</span>}
                  <button
                    onClick={() => openForm("deai", r)}
                    className="text-gray-400 hover:text-indigo-600"
                  >
                    <Edit3 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteDeAi(r.id)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {r.description && (
                  <p className="ml-7 mt-1 text-xs text-gray-500">{r.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "patterns" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => openForm("pattern")}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700"
            >
              <Plus size={14} /> 新增写作模式
            </button>
            {patterns.length === 0 && (
              <button
                onClick={initPatternSamples}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                初始化内置示例
              </button>
            )}
          </div>
          {patterns.length === 0 ? <p className="text-sm text-gray-500">暂无写作模式</p> : null}
          {patterns.map((p) => (
            <div key={p.id} className="rounded-lg border border-gray-200 bg-white">
              <button
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                {expanded === p.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span className="font-medium text-gray-900">{p.pattern_name}</span>
                <span className="text-xs text-gray-400">来源: {p.source_type}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openForm("pattern", p);
                  }}
                  className="ml-auto rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  编辑
                </button>
              </button>
              {expanded === p.id && (
                <div className="space-y-2 border-t border-gray-100 px-4 pb-4 pt-3 text-sm text-gray-700">
                  <p>{p.description}</p>
                  {p.usage_guide && (
                    <p>
                      <span className="text-gray-500">使用指南：</span>
                      {p.usage_guide}
                    </p>
                  )}
                  {p.sample_text && (
                    <p className="rounded bg-gray-50 p-2 font-mono text-xs">{p.sample_text}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {formKind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {formKind === "genre" && "题材模板"}
                {formKind === "style" && "文风档案"}
                {formKind === "pattern" && "写作模式"}
                {formKind === "deai" && "去AI规则"}
              </h2>
              <button onClick={closeForm} className="text-gray-400 hover:text-gray-700">
                关闭
              </button>
            </div>

            {formKind === "genre" && (
              <FormGrid>
                <Input
                  label="题材 ID"
                  value={genreForm.genre_id}
                  onChange={(v) => setGenreForm({ ...genreForm, genre_id: v })}
                />
                <Input
                  label="题材名"
                  value={genreForm.genre_name}
                  onChange={(v) => setGenreForm({ ...genreForm, genre_name: v })}
                />
                <TextArea
                  label="世界观框架"
                  value={genreForm.world_framework ?? ""}
                  onChange={(v) => setGenreForm({ ...genreForm, world_framework: v })}
                />
                <TextArea
                  label="卷节奏"
                  value={genreForm.volume_rhythm ?? ""}
                  onChange={(v) => setGenreForm({ ...genreForm, volume_rhythm: v })}
                />
                <TextArea
                  label="角色原型"
                  value={genreForm.character_archetypes ?? ""}
                  onChange={(v) => setGenreForm({ ...genreForm, character_archetypes: v })}
                />
                <TextArea
                  label="爽感参数"
                  value={genreForm.thrill_params ?? ""}
                  onChange={(v) => setGenreForm({ ...genreForm, thrill_params: v })}
                />
              </FormGrid>
            )}
            {formKind === "style" && (
              <FormGrid>
                <Input
                  label="名称"
                  value={styleForm.name}
                  onChange={(v) => setStyleForm({ ...styleForm, name: v })}
                />
                <TextArea
                  label="指标 JSON"
                  value={styleForm.metrics}
                  onChange={(v) => setStyleForm({ ...styleForm, metrics: v })}
                />
                <TextArea
                  label="偏好模式"
                  value={styleForm.preferred_patterns}
                  onChange={(v) => setStyleForm({ ...styleForm, preferred_patterns: v })}
                />
                <TextArea
                  label="反 AI 特征"
                  value={styleForm.anti_ai_features}
                  onChange={(v) => setStyleForm({ ...styleForm, anti_ai_features: v })}
                />
                <TextArea
                  label="样例段落"
                  value={styleForm.sample_paragraphs}
                  onChange={(v) => setStyleForm({ ...styleForm, sample_paragraphs: v })}
                />
                <TextArea
                  label="禁用模式"
                  value={styleForm.banned_patterns}
                  onChange={(v) => setStyleForm({ ...styleForm, banned_patterns: v })}
                />
              </FormGrid>
            )}
            {formKind === "pattern" && (
              <FormGrid>
                <Input
                  label="模式名"
                  value={patternForm.pattern_name}
                  onChange={(v) => setPatternForm({ ...patternForm, pattern_name: v })}
                />
                <Input
                  label="来源类型"
                  value={patternForm.source_type}
                  onChange={(v) => setPatternForm({ ...patternForm, source_type: v })}
                />
                <Input
                  label="适用题材"
                  value={patternForm.genre_compat ?? ""}
                  onChange={(v) => setPatternForm({ ...patternForm, genre_compat: v })}
                />
                <TextArea
                  label="描述"
                  value={patternForm.description}
                  onChange={(v) => setPatternForm({ ...patternForm, description: v })}
                />
                <TextArea
                  label="使用指南"
                  value={patternForm.usage_guide ?? ""}
                  onChange={(v) => setPatternForm({ ...patternForm, usage_guide: v })}
                />
                <TextArea
                  label="样例"
                  value={patternForm.sample_text ?? ""}
                  onChange={(v) => setPatternForm({ ...patternForm, sample_text: v })}
                />
              </FormGrid>
            )}
            {formKind === "deai" && (
              <FormGrid>
                <Input
                  label="分类"
                  value={deaiForm.category}
                  onChange={(v) => setDeaiForm({ ...deaiForm, category: v })}
                />
                <Input
                  label="严重度"
                  value={deaiForm.severity}
                  onChange={(v) => setDeaiForm({ ...deaiForm, severity: v })}
                />
                <TextArea
                  label="匹配模式"
                  value={deaiForm.pattern}
                  onChange={(v) => setDeaiForm({ ...deaiForm, pattern: v })}
                />
                <TextArea
                  label="替换建议"
                  value={deaiForm.replacement ?? ""}
                  onChange={(v) => setDeaiForm({ ...deaiForm, replacement: v })}
                />
                <TextArea
                  label="说明"
                  value={deaiForm.description ?? ""}
                  onChange={(v) => setDeaiForm({ ...deaiForm, description: v })}
                />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={deaiForm.is_enabled}
                    onChange={(e) => setDeaiForm({ ...deaiForm, is_enabled: e.target.checked })}
                  />
                  启用
                </label>
              </FormGrid>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={closeForm}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                onClick={handleSaveForm}
                disabled={applying === "form"}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {applying === "form" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3">{children}</div>;
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm text-gray-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm text-gray-700">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
      />
    </label>
  );
}
