import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLlmStore, useProjectStore, useRagStore } from "../../stores";
import { platform } from "../../lib/platform";
import type { RagRebuildProgressEvent } from "../../lib/api";
import { checkForUpdate, installUpdate } from "../../lib/updater";
import type { UpdateInfo } from "../../lib/updater";
import {
  Settings,
  Key,
  Save,
  CheckCircle,
  Activity,
  ArrowRight,
  RefreshCw,
  Download,
  AlertTriangle,
  X,
} from "lucide-react";

export function SettingsPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { project, updateProject } = useProjectStore();
  const { config, fetchConfig, updateConfig, saveConfigToDb } = useLlmStore();
  const {
    stats: ragStats,
    loading: ragLoading,
    error: ragError,
    fetchStats,
    rebuildIndex,
  } = useRagStore();
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);
  const [embeddingProvider, setEmbeddingProvider] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [ragMessage, setRagMessage] = useState("");
  const [showRagConfirm, setShowRagConfirm] = useState(false);
  const [ragProgress, setRagProgress] = useState<RagRebuildProgressEvent | null>(null);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setBaseUrl(config.base_url);
      const maskedApiKey = config.api_key.startsWith("****");
      setApiKey("");
      setHasSavedApiKey(maskedApiKey || config.api_key.length > 0);
      setModel(config.model);
      setMaxTokens(config.max_tokens);
      setTemperature(config.temperature);
      setEmbeddingProvider(config.embedding_provider || "");
      setEmbeddingModel(config.embedding_model || "");
    }
  }, [config]);

  useEffect(() => {
    if (project) {
      setProjectTitle(project.title);
    }
  }, [project]);

  useEffect(() => {
    if (!platform.isTauri) return;

    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<RagRebuildProgressEvent>("rag-rebuild-progress", (event) => {
          const payload = event.payload;
          setRagProgress(payload);
          if (
            payload.stage === "completed" ||
            payload.stage === "failed" ||
            payload.stage === "cancelled"
          ) {
            if (payload.message) {
              setRagMessage(payload.message);
            }
          } else if (payload.message) {
            setRagMessage("");
          }
        });
      } catch {
        // Not running in Tauri — ignore
      }
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  const handleSaveLlm = async () => {
    await updateConfig({
      provider,
      base_url: baseUrl,
      api_key: apiKey || undefined,
      model,
      max_tokens: maxTokens,
      temperature,
      embedding_provider: embeddingProvider,
      embedding_model: embeddingModel,
    });
    await saveConfigToDb();
    setApiKey("");
    setHasSavedApiKey(apiKey.trim().length > 0 || hasSavedApiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveProject = async () => {
    if (projectTitle.trim() && projectTitle !== project?.title) {
      await updateProject(projectTitle.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const handleRebuildRag = async () => {
    setRagMessage("");
    setRagProgress({
      stage: "started",
      current: 0,
      total: 0,
      chapter_number: null,
      message: "准备开始重建...",
    });
    const stats = await rebuildIndex();
    if (stats) {
      setRagMessage(
        `重建完成：${stats.total_chapters_indexed} 章，${stats.total_chunks} 个切片`
      );
    }
    setShowRagConfirm(false);
  };

  const handleCancelRebuildRag = async () => {
    setRagMessage("正在请求取消重建...");
    try {
      const { ragApi } = await import("../../lib/tauri");
      await ragApi.cancelRebuildBookIndex();
    } catch {
      // Ignore cancellation errors in UI; backend event will settle state.
    }
  };

  const isRagRebuilding =
    ragLoading &&
    ragProgress != null &&
    ragProgress.stage !== "completed" &&
    ragProgress.stage !== "failed" &&
    ragProgress.stage !== "cancelled";
  const ragPercent =
    ragProgress && ragProgress.total > 0
      ? Math.min(100, Math.round((ragProgress.current / ragProgress.total) * 100))
      : 0;
  const providerCompatibilityHint = (() => {
    if (provider !== "anthropic" || !model.trim()) return null;

    const normalizedModel = model.trim().toLowerCase();
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "").toLowerCase();

    if (
      normalizedModel.startsWith("deepseek") &&
      !normalizedBaseUrl.includes("api.deepseek.com/anthropic")
    ) {
      return "DeepSeek 支持 Anthropic 协议，但 base_url 需要填写 `https://api.deepseek.com/anthropic`。如果你填写的是 `https://api.deepseek.com` 这类 OpenAI 兼容地址，请把 Provider 改成“OpenAI / 兼容API”。";
    }

    if (!normalizedModel.startsWith("claude") && !normalizedModel.startsWith("deepseek")) {
      return "当前选择的是 Anthropic Provider，但模型名看起来不是 Claude 或 DeepSeek Anthropic 兼容模型。若你接的是 OpenAI 兼容网关，请改用“OpenAI / 兼容API”。";
    }

    return null;
  })();

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
        <Settings size={22} className="text-indigo-600" />
        设置
      </h1>

      {/* Sub-navigation */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {[
          {
            to: "agent-logs",
            label: "运行日志",
            icon: Activity,
            desc: "查看 Agent、LLM 与系统事件日志",
          },
        ].map(({ to, label, icon: Icon, desc }) => (
          <button
            key={to}
            onClick={() => {
              if (!projectId) return;
              navigate(`/project/${projectId}/${to}`);
            }}
            className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors text-left"
          >
            <Icon size={18} className="text-indigo-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-gray-900">{label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{desc}</div>
            </div>
            <ArrowRight size={14} className="text-gray-300 ml-auto shrink-0 mt-1" />
          </button>
        ))}
      </div>

      <div className="mb-6 p-4 rounded-lg border border-indigo-100 bg-indigo-50/60">
        <p className="text-sm font-medium text-indigo-900">配置入口已调整</p>
        <p className="text-xs text-indigo-700 mt-1">
          去AI规则、SOUL模板、题材模板已归入“全局共享资源库”；通知偏好建议从顶部通知铃铛进入。
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            onClick={() => {
              if (!projectId) return;
              navigate(`/project/${projectId}/global-resources`);
            }}
            className="px-3 py-1.5 text-xs rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100"
          >
            打开全局共享资源库
          </button>
        </div>
      </div>

      {/* Project Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">项目设置</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSaveProject}
                className="flex items-center gap-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
              >
                <Save size={14} />
                保存
              </button>
            </div>
          </div>
          {project && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">状态:</span>{" "}
                <span className="font-medium">{project.status}</span>
              </div>
              <div>
                <span className="text-gray-500">创建时间:</span>{" "}
                <span className="font-medium">
                  {new Date(project.created_at).toLocaleDateString()}
                </span>
              </div>
              <div>
                <span className="text-gray-500">目标字数:</span>{" "}
                <span className="font-medium">
                  {project.target_words?.toLocaleString() || "未设置"}
                </span>
              </div>
              <div>
                <span className="text-gray-500">目标卷数:</span>{" "}
                <span className="font-medium">{project.target_volumes || "未设置"}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LLM Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Key size={18} />
          LLM 配置
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                if (e.target.value === "anthropic") {
                  setBaseUrl("https://api.anthropic.com");
                  setModel("claude-sonnet-4-6");
                } else if (e.target.value === "ollama") {
                  setBaseUrl("http://localhost:11434");
                  setModel("llama3");
                } else {
                  setBaseUrl("https://api.openai.com/v1");
                  setModel("gpt-4o");
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="openai">OpenAI / 兼容API</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="ollama">Ollama 本地模型</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasSavedApiKey ? "已保存 API Key；留空则保持不变" : "sk-..."}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {hasSavedApiKey && (
              <p className="text-xs text-gray-500 mt-1">
                当前已存在已保存的 API Key，只有输入新值时才会覆盖。
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">模型</label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {providerCompatibilityHint && (
              <p className="text-xs text-amber-600 mt-1">
                {providerCompatibilityHint}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Tokens</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value) || 4096)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Temperature ({temperature.toFixed(2)})
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full mt-2"
              />
            </div>
          </div>

          {/* Embedding Settings */}
          <div className="border-t border-gray-100 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">嵌入模型配置</h3>
            <p className="text-xs text-gray-400 mb-3">
              用于语义检索（RAG）的嵌入模型。选择"自动检测"将优先使用本地 Ollama，不可用时回退到 OpenAI。
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">嵌入 Provider</label>
                <select
                  value={embeddingProvider}
                  onChange={(e) => {
                    setEmbeddingProvider(e.target.value);
                    if (e.target.value === "ollama") {
                      setEmbeddingModel("nomic-embed-text");
                    } else if (e.target.value === "openai") {
                      setEmbeddingModel("text-embedding-3-small");
                    } else {
                      setEmbeddingModel("");
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">自动检测</option>
                  <option value="ollama">Ollama 本地</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">嵌入模型</label>
                <input
                  type="text"
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  placeholder={embeddingProvider === "ollama" ? "nomic-embed-text" : "text-embedding-3-small"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">RAG 索引管理</h3>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <div className="text-xs text-gray-500">已索引章节</div>
                  <div className="font-medium text-gray-900">
                    {ragStats?.total_chapters_indexed ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">切片数</div>
                  <div className="font-medium text-gray-900">
                    {ragStats?.total_chunks ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">向量数</div>
                  <div className="font-medium text-gray-900">
                    {ragStats?.total_vectors ?? 0}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                当你导入旧项目、批量迁移章节，或怀疑索引缺失时，可以手动执行一次全书重建。
              </p>
              {ragProgress && (
                <div className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-xs font-medium text-gray-700">
                      {ragProgress.stage === "completed"
                        ? "重建完成"
                        : ragProgress.stage === "cancelled"
                          ? "已取消"
                        : ragProgress.stage === "failed"
                          ? "重建失败"
                          : "重建进度"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {ragProgress.total > 0 ? `${ragProgress.current}/${ragProgress.total}` : "--/--"}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
                    <div
                      className={`h-full transition-all ${
                        ragProgress.stage === "failed"
                          ? "bg-red-500"
                          : ragProgress.stage === "cancelled"
                            ? "bg-amber-500"
                          : ragProgress.stage === "completed"
                            ? "bg-green-500"
                            : "bg-indigo-500"
                      }`}
                      style={{ width: `${ragPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-gray-600">
                      {ragProgress.message || "等待开始..."}
                    </span>
                    {ragProgress.chapter_number != null && (
                      <span className="text-gray-500">第 {ragProgress.chapter_number} 章</span>
                    )}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowRagConfirm(true)}
                  disabled={ragLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={14} className={ragLoading ? "animate-spin" : ""} />
                  {ragLoading ? "重建中..." : "全书重建 RAG 索引"}
                </button>
                {isRagRebuilding && (
                  <button
                    onClick={handleCancelRebuildRag}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-700 rounded-lg text-sm hover:bg-amber-50"
                  >
                    <X size={14} />
                    取消重建
                  </button>
                )}
                {ragMessage && (
                  <span
                    className={`text-xs ${
                      ragProgress?.stage === "failed"
                        ? "text-red-600"
                        : ragProgress?.stage === "cancelled"
                          ? "text-amber-700"
                          : "text-green-700"
                    }`}
                  >
                    {ragMessage}
                  </span>
                )}
                {!ragMessage && ragError && (
                  <span className="text-xs text-red-600">{ragError}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleSaveLlm}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
          >
            {saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saved ? "已保存" : "保存配置"}
          </button>
        </div>
      </div>

      {/* Backup Section */}
      <BackupSection />

      {/* Update Section */}
      <UpdateSection />

      {showRagConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle size={20} className="text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">确认重建 RAG 索引</h3>
                  <p className="text-xs text-gray-500">会遍历当前项目全部章节</p>
                </div>
              </div>
              <button
                onClick={() => setShowRagConfirm(false)}
                disabled={isRagRebuilding}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              系统将重新切分并向量化当前项目的所有章节，用于修复旧项目导入、批量迁移或索引缺失问题。
            </p>
            <p className="text-xs text-gray-500 mb-6">
              重建期间可以看到当前处理章节和整体进度。若章节较多，操作可能持续一段时间。
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={isRagRebuilding ? handleCancelRebuildRag : () => setShowRagConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {isRagRebuilding ? "请求取消" : "取消"}
              </button>
              <button
                onClick={handleRebuildRag}
                disabled={isRagRebuilding}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm hover:bg-slate-900 disabled:opacity-50 transition-colors"
              >
                {isRagRebuilding ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                {isRagRebuilding ? "重建中..." : "确认重建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UpdateSection() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");

  const handleCheck = async () => {
    setChecking(true);
    setError("");
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
    } catch (e: any) {
      setError(e.toString());
    }
    setChecking(false);
  };

  const handleInstall = async () => {
    setInstalling(true);
    setError("");
    setProgress("下载中...");
    try {
      await installUpdate((downloaded, total) => {
        if (total) {
          const pct = Math.round((downloaded / total) * 100);
          setProgress(`下载中... ${pct}%`);
        }
      });
    } catch (e: any) {
      setError(e.toString());
      setInstalling(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-3">软件更新</h2>
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={handleCheck}
          disabled={checking || installing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
          {checking ? "检查中..." : "检查更新"}
        </button>
        {updateInfo?.available && (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            <Download size={14} />
            {installing ? progress : `安装 v${updateInfo.version}`}
          </button>
        )}
      </div>
      {updateInfo && !updateInfo.available && (
        <p className="text-xs text-green-600">已是最新版本</p>
      )}
      {updateInfo?.available && (
        <p className="text-xs text-gray-500">
          新版本 v{updateInfo.version} 可用
          {updateInfo.body && (
            <span className="block mt-1 whitespace-pre-wrap text-gray-400">
              {updateInfo.body.slice(0, 200)}
            </span>
          )}
        </p>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function BackupSection() {
  const [backups, setBackups] = useState<
    Array<{ path: string; created_at: string; size_bytes: number }>
  >([]);
  const [backing, setBacking] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const { backupApi } = await import("../../lib/tauri");
      setBackups(await backupApi.list());
    } catch {
      /* no project open */
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleBackup = async () => {
    setBacking(true);
    try {
      const { backupApi } = await import("../../lib/tauri");
      const info = await backupApi.create();
      setMsg(`备份完成: ${(info.size_bytes / 1024).toFixed(1)}KB`);
      await load();
      setTimeout(() => setMsg(""), 3000);
    } catch (e: any) {
      setMsg(`备份失败: ${e}`);
    }
    setBacking(false);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="font-semibold text-gray-900 mb-3">项目备份</h2>
      <p className="text-sm text-gray-500 mb-3">备份当前项目数据库，最多保留 10 份历史备份。</p>
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={handleBackup}
          disabled={backing}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save size={14} />
          {backing ? "备份中..." : "立即备份"}
        </button>
        {msg && <span className="text-xs text-green-600">{msg}</span>}
      </div>
      {backups.length > 0 && (
        <div className="text-sm space-y-1 max-h-32 overflow-auto">
          <p className="text-xs text-gray-400 mb-1">历史备份 ({backups.length}/10)</p>
          {backups.map((b, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-gray-500 py-0.5">
              <span>{b.created_at.replace("T", " ").slice(0, 19)}</span>
              <span>{(b.size_bytes / 1024).toFixed(1)} KB</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
