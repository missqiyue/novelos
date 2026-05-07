import { useState, useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { X, Save, Key, Globe, Cpu, CheckCircle2, AlertCircle, Loader2, Zap } from 'lucide-react';

interface AppConfig {
  api_key: string;
  base_url: string;
  model_name: string;
  anti_ai_rules_md: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: Props) {
  const storageKey = 'inkos_app_config';
  const [config, setConfig] = useState<AppConfig>({
    api_key: '',
    base_url: 'https://api.openai.com/v1',
    model_name: 'gpt-4o-mini',
    anti_ai_rules_md: '# 去AI味写作规则（全局）\n\n## 语言\n- 避免：总之/因此/于是/显然/不由得/不禁/仿佛/似乎/让人不由得\n- 优先：动作+感官+具体物件+短句节奏\n\n## 叙述\n- 少下结论，多给细节，让读者自己推断\n- 禁止：给角色贴标签式总结（如“他很愤怒/他很震惊”）\n\n## 节奏\n- 句子长度交错，段落不堆叠抽象形容词\n- 对话要有语气差异与信息增量\n\n## 禁止输出\n- 不要写“AI/模型/提示/系统输出”等元信息\n- 不要用小标题解释写作思路'
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // 新增: 用于连通性测试的状态
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
      if (isTauri()) {
        invoke<AppConfig>('get_config')
          .then(setConfig)
          .catch(console.error);
      } else {
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            setConfig((prev) => ({
              ...prev,
              ...parsed,
              anti_ai_rules_md: typeof parsed.anti_ai_rules_md === 'string' ? parsed.anti_ai_rules_md : prev.anti_ai_rules_md
            }));
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      if (isTauri()) {
        await invoke('save_config', { config });
      } else {
        localStorage.setItem(storageKey, JSON.stringify(config));
      }
      setSaveStatus('success');
      setTimeout(() => {
        onClose();
        setSaveStatus('idle');
      }, 1000);
    } catch (e) {
      console.error(e);
      setSaveStatus('error');
    }
    setIsSaving(false);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      if (!isTauri()) {
        setTestResult({ success: false, message: '浏览器预览模式无法调用本地 Tauri 后端，请使用桌面端窗口测试连通性。' });
      } else {
        const result = await invoke<string>('test_llm_connection', { 
          apiKey: config.api_key, 
          baseUrl: config.base_url, 
          modelName: config.model_name 
        });
        setTestResult({ success: true, message: result });
      }
    } catch (e) {
      setTestResult({ success: false, message: String(e) });
    }
    setIsTesting(false);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-zinc-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/80">
          <h2 className="text-lg font-bold text-zinc-800">系统与大模型设置</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-200 rounded-md text-zinc-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="flex items-center text-sm font-semibold text-zinc-700">
              <Key className="w-4 h-4 mr-1.5 text-zinc-400" /> API Key
            </label>
            <input 
              type="password"
              value={config.api_key}
              onChange={(e) => setConfig({...config, api_key: e.target.value})}
              placeholder="sk-..."
              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center text-sm font-semibold text-zinc-700">
              <Globe className="w-4 h-4 mr-1.5 text-zinc-400" /> Base URL
            </label>
            <input 
              type="text"
              value={config.base_url}
              onChange={(e) => setConfig({...config, base_url: e.target.value})}
              placeholder="https://api.openai.com/v1"
              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center text-sm font-semibold text-zinc-700">
              <Cpu className="w-4 h-4 mr-1.5 text-zinc-400" /> 模型名称 (Model)
            </label>
            <input 
              type="text"
              value={config.model_name}
              onChange={(e) => setConfig({...config, model_name: e.target.value})}
              placeholder="gpt-4o-mini"
              className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
            />
          </div>

          {/* Test Connection Button & Result */}
          <div className="pt-4 border-t border-zinc-100 flex flex-col space-y-3">
            <button 
              onClick={handleTestConnection}
              disabled={isTesting || !config.api_key}
              className="w-full flex items-center justify-center px-4 py-2 border border-zinc-300 text-zinc-700 text-sm font-medium rounded-md hover:bg-zinc-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTesting ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-zinc-500" /> : <Zap className="w-4 h-4 mr-2 text-yellow-500" />}
              {isTesting ? '正在发送连通性测试请求...' : '测试大模型连通性'}
            </button>

            {testResult && (
              <div className={`p-3 rounded-md text-sm flex items-start ${testResult.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-green-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0 text-red-600" />
                )}
                <div className="break-all whitespace-pre-wrap">{testResult.message}</div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-end space-x-3">
          {saveStatus === 'success' && <span className="text-sm text-green-600 font-medium">保存成功！</span>}
          {saveStatus === 'error' && <span className="text-sm text-red-600 font-medium">保存失败</span>}
          
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-200 rounded-md transition-colors"
          >
            取消
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center px-4 py-2 bg-zinc-800 text-white text-sm font-medium rounded-md hover:bg-zinc-900 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? '保存中...' : '保存并应用'}
          </button>
        </div>
      </div>
    </div>
  );
}
