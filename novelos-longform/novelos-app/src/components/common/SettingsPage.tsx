import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLlmStore, useProjectStore } from "../../stores";
import {
  Settings,
  Key,
  Save,
  CheckCircle,
  Shield,
  Users,
  BookOpen,
  Bell,
  ArrowRight,
} from "lucide-react";

export function SettingsPage() {
  const navigate = useNavigate();
  const { project, updateProject } = useProjectStore();
  const { config, fetchConfig, updateConfig, saveConfigToDb } = useLlmStore();
  const [provider, setProvider] = useState("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState(4096);
  const [temperature, setTemperature] = useState(0.7);
  const [saved, setSaved] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useEffect(() => {
    if (config) {
      setProvider(config.provider);
      setBaseUrl(config.base_url);
      setApiKey(config.api_key);
      setModel(config.model);
      setMaxTokens(config.max_tokens);
      setTemperature(config.temperature);
    }
  }, [config]);

  useEffect(() => {
    if (project) {
      setProjectTitle(project.title);
    }
  }, [project]);

  const handleSaveLlm = async () => {
    await updateConfig({
      provider,
      base_url: baseUrl,
      api_key: apiKey,
      model,
      max_tokens: maxTokens,
      temperature,
    });
    await saveConfigToDb({
      provider,
      base_url: baseUrl,
      api_key: apiKey,
      model,
      max_tokens: maxTokens,
      temperature,
    });
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

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-4">
        <Settings size={22} className="text-indigo-600" />
        设置
      </h1>

      {/* Sub-navigation */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {[
          { to: "de-ai-rules", label: "去AI规则", icon: Shield, desc: "管理AI写作痕迹检测规则" },
          { to: "soul-templates", label: "SOUL模板", icon: Users, desc: "浏览内置角色性格模板库" },
          {
            to: "genre-templates",
            label: "题材模板",
            icon: BookOpen,
            desc: "浏览内置题材设定模板",
          },
          {
            to: "notification-prefs",
            label: "通知偏好",
            icon: Bell,
            desc: "管理通知类型和推送偏好",
          },
        ].map(({ to, label, icon: Icon, desc }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
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
              placeholder="sk-..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
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
