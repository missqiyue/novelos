import { useState, useCallback, useEffect, useRef } from "react";
import { Search, X, ChevronDown, ChevronUp, Replace } from "lucide-react";

interface FindReplaceBarProps {
  visible: boolean;
  onClose: () => void;
  onSearch: (query: string) => number;
  onNext: () => void;
  onPrev: () => void;
  onReplace: (query: string, replacement: string) => void;
  onReplaceAll: (query: string, replacement: string) => void;
  matchCount: number;
  currentMatch: number;
}

export function FindReplaceBar({
  visible,
  onClose,
  onSearch,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  matchCount,
  currentMatch,
}: FindReplaceBarProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && searchRef.current) {
      searchRef.current.focus();
    }
  }, [visible]);

  const handleQueryChange = useCallback(
    (val: string) => {
      setQuery(val);
      if (val) onSearch(val);
    },
    [onSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) onPrev();
        else onNext();
      }
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onNext, onPrev, onClose],
  );

  if (!visible) return null;

  return (
    <div className="flex flex-col border-b border-gray-200 bg-white text-sm">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="p-0.5 rounded hover:bg-gray-200 text-gray-500"
          title="切换替换"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${showReplace ? "rotate-180" : ""}`}
          />
        </button>
        <div className="flex items-center flex-1 border border-gray-300 rounded px-2 py-0.5 focus-within:border-indigo-400">
          <Search size={12} className="text-gray-400 mr-1.5 shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 outline-none bg-transparent text-gray-800 placeholder-gray-400"
            placeholder="查找..."
          />
          {query && (
            <span className="text-xs text-gray-400 whitespace-nowrap ml-1">
              {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : "0/0"}
            </span>
          )}
        </div>
        <button
          onClick={onPrev}
          disabled={!query || matchCount === 0}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-30"
          title="上一个 (Shift+Enter)"
        >
          <ChevronUp size={14} />
        </button>
        <button
          onClick={onNext}
          disabled={!query || matchCount === 0}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 disabled:opacity-30"
          title="下一个 (Enter)"
        >
          <ChevronDown size={14} />
        </button>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-gray-200 text-gray-500"
          title="关闭 (Esc)"
        >
          <X size={14} />
        </button>
      </div>
      {showReplace && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-gray-100">
          <div className="w-5" />
          <div className="flex items-center flex-1 border border-gray-300 rounded px-2 py-0.5 focus-within:border-indigo-400">
            <Replace size={12} className="text-gray-400 mr-1.5 shrink-0" />
            <input
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 outline-none bg-transparent text-gray-800 placeholder-gray-400"
              placeholder="替换为..."
            />
          </div>
          <button
            onClick={() => query && onReplace(query, replacement)}
            disabled={!query || matchCount === 0}
            className="px-2 py-0.5 rounded text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30"
          >
            替换
          </button>
          <button
            onClick={() => query && onReplaceAll(query, replacement)}
            disabled={!query || matchCount === 0}
            className="px-2 py-0.5 rounded text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-30"
          >
            全部替换
          </button>
        </div>
      )}
    </div>
  );
}
