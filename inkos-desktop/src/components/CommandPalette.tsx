import { useState, useEffect, useRef } from 'react';
import { Search, UserPlus, FileText, Zap, BookOpen, LayoutDashboard } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: 'editor' | 'board' | 'bible' | 'anti_ai') => void;
  onGenerate: () => void;
  onAudit: () => void;
}

export function CommandPalette({ isOpen, onClose, onNavigate, onGenerate, onAudit }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = [
    { id: 'gen_chapter', icon: Zap, label: '生成本章正文 (AI)', category: '写作', action: () => { onGenerate(); onClose(); } },
    { id: 'audit_chapter', icon: FileText, label: '执行多专家审查', category: '写作', action: () => { onAudit(); onClose(); } },
    { id: 'nav_editor', icon: FileText, label: '切换到: 沉浸编辑器', category: '导航', action: () => { onNavigate('editor'); onClose(); } },
    { id: 'nav_board', icon: LayoutDashboard, label: '切换到: 故事看板', category: '导航', action: () => { onNavigate('board'); onClose(); } },
    { id: 'nav_bible', icon: BookOpen, label: '切换到: 世界观百科', category: '导航', action: () => { onNavigate('bible'); onClose(); } },
    { id: 'nav_anti_ai', icon: FileText, label: '切换到: 去AI味规则', category: '导航', action: () => { onNavigate('anti_ai'); onClose(); } },
    { id: 'new_char', icon: UserPlus, label: '新建角色卡片...', category: '设定', action: () => { onNavigate('bible'); onClose(); } },
  ];

  const filteredCommands = commands.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase()) || 
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredCommands[selectedIndex]) {
          filteredCommands[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] sm:pt-[20vh]">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={onClose} />
      
      {/* Palette */}
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden border border-zinc-200">
        <div className="flex items-center px-4 py-3 border-b border-zinc-100">
          <Search className="w-5 h-5 text-zinc-400 mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-zinc-800 text-lg outline-none placeholder:text-zinc-400"
            placeholder="输入指令或搜索... (例如 '生成')"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
          <span className="text-[10px] font-medium text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">ESC</span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredCommands.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-500">
              未找到匹配的指令
            </div>
          ) : (
            filteredCommands.map((cmd, index) => {
              const Icon = cmd.icon;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  className={`flex items-center px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-600 text-white' : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Icon className={`w-4 h-4 mr-3 ${isSelected ? 'text-blue-200' : 'text-zinc-400'}`} />
                  <div className="flex-1 flex items-center justify-between">
                    <span className="text-sm font-medium">{cmd.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      isSelected ? 'bg-blue-500/50 text-blue-100' : 'bg-zinc-100 text-zinc-500'
                    }`}>
                      {cmd.category}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
