import { useState, useEffect, useRef } from "react";
import { HelpCircle, X } from "lucide-react";

interface ContextHelpProps {
  id: string;
  text: string;
  position?: "top" | "bottom" | "left" | "right";
  children?: React.ReactNode;
}

const SEEN_KEY = "novelos_help_seen";

function isSeen(id: string): boolean {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    return seen.includes(id);
  } catch {
    return false;
  }
}

function markSeen(id: string) {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
    if (!seen.includes(id)) {
      seen.push(id);
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    }
  } catch {
    // ignore
  }
}

export function ContextHelp({ id, text, position = "top", children }: ContextHelpProps) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(() => isSeen(id));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (dismissed) return;
    // Auto-show on mount if not previously seen
    const timer = setTimeout(() => setShow(true), 500);
    return () => clearTimeout(timer);
  }, [dismissed]);

  useEffect(() => {
    if (!show) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        handleDismiss();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [show]);

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    markSeen(id);
  };

  const posClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <div className="relative inline-flex" ref={ref}>
      {children ?? (
        <button
          onClick={() => setShow(!show)}
          className="text-gray-400 hover:text-indigo-500 transition-colors"
          type="button"
        >
          <HelpCircle size={16} />
        </button>
      )}
      {show && !dismissed && (
        <div
          className={`absolute z-50 ${posClasses[position]} w-64 bg-gray-900 text-white text-sm rounded-lg shadow-lg p-3`}
        >
          <button
            onClick={handleDismiss}
            className="absolute top-1.5 right-1.5 text-gray-400 hover:text-white"
            type="button"
          >
            <X size={14} />
          </button>
          <p className="pr-4 leading-relaxed">{text}</p>
        </div>
      )}
    </div>
  );
}

/** Reset all seen help tooltips (for development/testing). */
export function resetContextHelp() {
  localStorage.removeItem(SEEN_KEY);
}
