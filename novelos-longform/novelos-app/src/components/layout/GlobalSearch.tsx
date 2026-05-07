import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChapterStore, useCanonStore } from "../../stores";
import { Search, FileText, Users, Shield, Clock } from "lucide-react";

interface SearchResult {
  type: "chapter" | "character" | "canon" | "event";
  label: string;
  detail: string;
  route: string;
}

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { chapters } = useChapterStore();
  const { rules } = useCanonStore();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const q = query.toLowerCase();
    const res: SearchResult[] = [];

    // Search chapters
    for (const ch of chapters) {
      if (
        ch.title?.toLowerCase().includes(q) ||
        ch.draft_text?.toLowerCase().includes(q) ||
        ch.final_text?.toLowerCase().includes(q)
      ) {
        res.push({
          type: "chapter",
          label: `第${ch.chapter_number}章 ${ch.title || ""}`,
          detail: (ch.draft_text || ch.final_text || "").slice(0, 100),
          route: `/project/${projectId}/chapter/${ch.chapter_number}`,
        });
      }
      if (res.length > 15) break;
    }

    // Search canon rules
    for (const rule of rules) {
      if (rule.rule_name.toLowerCase().includes(q) || rule.content.toLowerCase().includes(q)) {
        res.push({
          type: "canon",
          label: `${rule.is_hard ? "🔒" : "📖"} ${rule.rule_name}`,
          detail: rule.content.slice(0, 80),
          route: `/project/${projectId}/canon`,
        });
      }
    }

    setResults(res.slice(0, 20));
  }, [query, chapters, rules, projectId]);

  const handleSelect = (r: SearchResult) => {
    setOpen(false);
    setQuery("");
    navigate(r.route);
  };

  const typeIcons = {
    chapter: FileText,
    character: Users,
    canon: Shield,
    event: Clock,
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg hover:border-gray-300 hover:text-gray-600 w-40"
      >
        <Search size={12} />
        <span>搜索...</span>
        <kbd className="ml-auto text-[10px] px-1 py-0.5 bg-gray-100 rounded text-gray-400">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
              <Search size={16} className="text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索章节、角色、正典、事件..."
                className="flex-1 text-sm focus:outline-none"
              />
              <button
                onClick={() => setOpen(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ESC
              </button>
            </div>
            {results.length > 0 && (
              <div className="max-h-80 overflow-auto">
                {results.map((r, i) => {
                  const Icon = typeIcons[r.type];
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(r)}
                      className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 text-left"
                    >
                      <Icon size={14} className="mt-0.5 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm text-gray-900 truncate">{r.label}</div>
                        <div className="text-xs text-gray-400 truncate">{r.detail}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {query.trim() && results.length === 0 && (
              <div className="p-6 text-center text-sm text-gray-400">未找到匹配结果</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
