import { useEffect, useState } from 'react';
import { Sparkles, Edit3, Type, Scissors, Zap } from 'lucide-react';

export function InvisibleCopilot() {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 只有当选区在编辑器内时才显示
        if (rect.width > 0) {
          setPosition({
            x: rect.left + rect.width / 2,
            y: rect.bottom + window.scrollY + 10 // Display below the selection
          });
        }
      } else {
        setPosition(null);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      // 如果点击的是悬浮菜单本身，不关闭
      if ((e.target as HTMLElement).closest('#invisible-copilot')) return;
      setPosition(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  if (!position) return null;

  return (
    <div 
      id="invisible-copilot"
      className="absolute z-50 bg-white shadow-2xl border border-zinc-200 rounded-lg p-1.5 flex items-center space-x-1 animate-in fade-in zoom-in-95 duration-200"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translateX(-50%)' // Center horizontally below selection
      }}
    >
      <div className="px-2 border-r border-zinc-100 flex items-center">
        <Sparkles className="w-3.5 h-3.5 text-blue-500 mr-1.5" />
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">AI 伴写</span>
      </div>
      
      <button className="p-1.5 text-zinc-600 hover:text-blue-600 hover:bg-blue-50 rounded group relative" title="加强感官描写">
        <Zap className="w-4 h-4" />
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">加强感官</span>
      </button>
      
      <button className="p-1.5 text-zinc-600 hover:text-blue-600 hover:bg-blue-50 rounded group relative" title="改变语气 (更狠毒)">
        <Edit3 className="w-4 h-4" />
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">更狠毒</span>
      </button>
      
      <button className="p-1.5 text-zinc-600 hover:text-blue-600 hover:bg-blue-50 rounded group relative" title="精简缩写">
        <Scissors className="w-4 h-4" />
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">精简缩写</span>
      </button>
      
      <button className="p-1.5 text-zinc-600 hover:text-blue-600 hover:bg-blue-50 rounded group relative" title="修复病句">
        <Type className="w-4 h-4" />
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">修复病句</span>
      </button>
    </div>
  );
}
