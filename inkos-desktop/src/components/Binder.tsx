import { useState } from 'react';
import { FileText, Folder, CheckCircle2, AlertCircle, Sparkles, Loader2 } from 'lucide-react';
import { invoke, isTauri } from '@tauri-apps/api/core';

export interface Chapter {
  id: number;
  chapter_number: number;
  title: string;
  outline: string;
  content: string | null;
  status: string;
}

interface Props {
  chapters: Chapter[];
  activeChapter: number;
  volumeLabel: string;
  onSelectChapter: (id: number) => void;
  onChapterAdded: () => void;
}

export function Binder({ chapters, activeChapter, volumeLabel, onSelectChapter, onChapterAdded }: Props) {
  const [isGeneratingNext, setIsGeneratingNext] = useState(false);

  const handleGenerateNext = async () => {
    setIsGeneratingNext(true);
    try {
      if (isTauri()) {
        await invoke('generate_next_chapter_outline');
      }
      onChapterAdded();
    } catch (e) {
      console.error("Failed to generate next chapter", e);
      alert(`生成下一章失败: ${String(e)}`);
    }
    setIsGeneratingNext(false);
  };

  return (
    <div className="space-y-1 mt-2 flex flex-col h-full">
      <div className="flex items-center px-2 py-1.5 hover:bg-zinc-200/40 rounded-md cursor-pointer font-medium text-sm transition-colors text-zinc-700">
        <Folder className="w-4 h-4 mr-2 text-zinc-400" />
        <span className="truncate">{volumeLabel}</span>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-1">
        {chapters.map(ch => (
          <div 
            key={ch.chapter_number}
            onClick={() => onSelectChapter(ch.chapter_number)}
            className={`flex items-center px-2 py-1.5 ml-4 rounded-md cursor-pointer font-medium text-sm transition-colors ${activeChapter === ch.chapter_number ? 'bg-zinc-200/60 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-200/40'}`}
          >
            <FileText className={`w-4 h-4 mr-2 ${activeChapter === ch.chapter_number ? 'text-blue-500' : 'text-zinc-400'}`} />
            <span className={`flex-1 truncate ${activeChapter === ch.chapter_number ? 'font-bold' : ''}`}>
              {ch.title || `第${ch.chapter_number}章`}
            </span>
            {ch.status === 'finalized' && <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />}
            {ch.status === 'draft' && <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />}
          </div>
        ))}
      </div>

      <div className="mt-4 px-4 pb-4">
        <button 
          onClick={handleGenerateNext}
          disabled={isGeneratingNext}
          className="w-full flex items-center justify-center py-2 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors font-medium disabled:opacity-50"
        >
          {isGeneratingNext ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> AI 推演下一章...</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-1.5" /> AI 自动生成下一章</>
          )}
        </button>
      </div>
    </div>
  );
}
