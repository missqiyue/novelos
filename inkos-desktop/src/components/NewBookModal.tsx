import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { X, BookPlus } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewBookModal({ isOpen, onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('男频玄幻');
  const [logline, setLogline] = useState('');
  const [targetChapters, setTargetChapters] = useState('5000');
  const [targetTotalWords, setTargetTotalWords] = useState('1500000');
  const [firstGenerateChapters, setFirstGenerateChapters] = useState('400');
  const [stageSize, setStageSize] = useState('100');
  const [isCreating, setIsCreating] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setStatus('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);
    setStatus('创建书库中…');
    try {
      if (!isTauri()) {
        setError('请在桌面端窗口创建新书（浏览器预览模式不写入本地数据库）。');
        setIsCreating(false);
        return;
      }
      const id = await invoke<number>('create_workspace_book', { title, genre, logline });
      setStatus('切换到新书库…');
      await invoke('switch_workspace_book', { id });

      let hasApiKey = false;
      try {
        const cfg = await invoke<any>('get_config');
        hasApiKey = !!(cfg?.api_key || '').trim();
      } catch {
        hasApiKey = false;
      }

      const parsedTargetChapters = Math.max(1, Math.min(5000, Number(targetChapters) || 5000));
      const parsedTargetTotalWords = Math.max(1, Number(targetTotalWords) || 1500000);
      const parsedStageSize = Math.max(50, Math.min(200, Number(stageSize) || 100));
      const parsedFirstGenerate = Math.max(
        1,
        Math.min(parsedTargetChapters, Number(firstGenerateChapters) || Math.min(400, parsedTargetChapters))
      );

      const bookInputJson = JSON.stringify({
        book_title: title,
        genre,
        logline,
        target_chapters: parsedTargetChapters,
        target_total_words: parsedTargetTotalWords
      });
      setStatus('创建蓝图版本…');
      const versionId = await invoke<number>('blueprint_create_version', {
        stageSize: parsedStageSize,
        firstGenerateChapters: parsedFirstGenerate,
        bookInputJson
      });

      if (!hasApiKey) {
        setStatus(`已创建蓝图版本 #${versionId}。未配置 API Key，无法生成策划内容。请先在设置中配置 API Key，然后到“策划”页分步骤生成。`);
      } else {
        setStatus(`已创建蓝图版本 #${versionId}。可在“策划”页按步骤生成（人物/系统/阶段/任务/one-liner），失败可单步重试。`);
      }

      onCreated();
      onClose();
    } catch (e) {
      setError(String(e));
    }
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-6">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-zinc-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50">
          <h2 className="text-lg font-bold text-zinc-800 flex items-center">
            <BookPlus className="w-5 h-5 mr-2 text-blue-600" />
            创建新书
          </h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <div className="text-xs font-semibold text-zinc-500 mb-1">书名</div>
            <input value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border border-zinc-200 rounded text-sm" placeholder="例如：断剑少年" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-500 mb-1">类型</div>
            <select value={genre} onChange={e => setGenre(e.target.value)} className="w-full p-2 border border-zinc-200 rounded text-sm bg-white">
              <option value="男频玄幻">男频玄幻</option>
              <option value="男频都市">男频都市</option>
              <option value="女频古言">女频古言</option>
              <option value="女频现言">女频现言</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-500 mb-1">一句话卖点</div>
            <textarea value={logline} onChange={e => setLogline(e.target.value)} className="w-full p-2 border border-zinc-200 rounded text-sm h-20 resize-none" placeholder="例如：废柴少爷断剑觉醒，每次变强都要付出代价。" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-zinc-500 mb-1">预计章节数（≤5000）</div>
              <input
                type="number"
                value={targetChapters}
                onChange={e => setTargetChapters(e.target.value)}
                className="w-full p-2 border border-zinc-200 rounded text-sm"
                min={1}
                max={5000}
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-500 mb-1">预计总字数</div>
              <input
                type="number"
                value={targetTotalWords}
                onChange={e => setTargetTotalWords(e.target.value)}
                className="w-full p-2 border border-zinc-200 rounded text-sm"
                min={1}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-zinc-500 mb-1">首批生成章节</div>
              <input
                type="number"
                value={firstGenerateChapters}
                onChange={e => setFirstGenerateChapters(e.target.value)}
                className="w-full p-2 border border-zinc-200 rounded text-sm"
                min={1}
                max={Number(targetChapters) || 5000}
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-500 mb-1">阶段大小（高级）</div>
              <input
                type="number"
                value={stageSize}
                onChange={e => setStageSize(e.target.value)}
                className="w-full p-2 border border-zinc-200 rounded text-sm"
                min={50}
                max={200}
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
              {error}
            </div>
          )}
          {status && !error && (
            <div className="text-xs text-zinc-600 bg-zinc-50 border border-zinc-200 rounded p-2">
              {status}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-zinc-200 bg-white flex justify-end space-x-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-800">
            取消
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || !title.trim()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isCreating ? '创建中...' : '创建并生成蓝图'}
          </button>
        </div>
      </div>
    </div>
  );
}
