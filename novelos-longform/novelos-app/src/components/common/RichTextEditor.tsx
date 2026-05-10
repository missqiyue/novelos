import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pencil,
  Eye,
  Search,
  Settings2,
  Type,
  Clock,
  BookOpen,
} from "lucide-react";
import { FindReplaceBar } from "./FindReplaceBar";
import { EditorPrefsPanel } from "./EditorPrefsPanel";
import { sharedResourcesApi, type EditorPrefs } from "../../lib/api";

// ─── Paragraph Rendering (inkos-inspired) ───

function parseContent(content: string): { title: string; body: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const titleLine = lines.find((l) => l.startsWith("# "));
  if (titleLine) {
    const title = titleLine.replace(/^#\s*/, "").trim();
    const body = lines
      .filter((l) => l !== titleLine)
      .join("\n")
      .trim();
    console.log("[Editor] parseContent found # title:", title.substring(0, 60), "body len:", body.length);
    return { title, body };
  }
  // No markdown heading — return empty title, body unchanged
  console.log("[Editor] parseContent no # title found, body len:", normalized.length);
  return { title: "", body: normalized };
}

function renderParagraphs(body: string): string[] {
  if (!body.trim()) return [];
  // Normalize line endings
  const normalized = body.replace(/\r\n/g, "\n");
  // Try double-newline first (markdown standard)
  let raw = normalized.split(/\n\n+/).filter((p) => p.trim());
  // If only one block found, fall back to single-newline split
  if (raw.length <= 1) {
    raw = normalized.split(/\n+/).filter((p) => p.trim());
  }
  // If STILL one block (LLM returned text with no line breaks at all),
  // add paragraph breaks at Chinese sentence endings (。！？etc.)
  if (raw.length <= 1 && raw[0]) {
    console.log("[Editor] falling back to splitIntelligentParagraphs, first 300 chars:", raw[0].substring(0, 300));
    raw = splitIntelligentParagraphs(raw[0]);
    console.log("[Editor] splitIntelligentParagraphs returned", raw.length, "paragraphs");
  }
  // Clean up: collapse internal whitespace within each paragraph
  return raw.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/// Insert paragraph breaks at natural boundaries when LLM output has no formatting.
/// Groups 3-5 Chinese sentences per paragraph, breaks at 。！？」
function splitIntelligentParagraphs(text: string): string[] {
  // Split at Chinese sentence-terminating punctuation, keeping the punctuation
  const sentences = text.split(/(?<=[。！？」』）])/);
  console.log("[Editor] splitIntelligentParagraphs: text len:", text.length, "sentences found:", sentences.length, "first sentence:", sentences[0]?.substring(0, 100));
  if (sentences.length <= 1) return [text];

  // Group sentences into paragraphs (3-5 sentences each for ~150-300 chars)
  const paragraphs: string[] = [];
  let current = "";
  let sentenceCount = 0;
  const TARGET_SENTENCES = 4;

  const SENTENCE_END = /[。！？」』）…]$/;
  for (const s of sentences) {
    current += s;
    sentenceCount++;
    if (sentenceCount >= TARGET_SENTENCES && SENTENCE_END.test(s.trim())) {
      paragraphs.push(current.trim());
      current = "";
      sentenceCount = 0;
    }
  }
  // Don't forget the last partial paragraph
  if (current.trim()) {
    paragraphs.push(current.trim());
  }
  return paragraphs.length > 0 ? paragraphs : [text];
}

// ─── Editor CSS Variables Helper ───

function prefsToStyle(prefs: EditorPrefs): React.CSSProperties {
  const style: Record<string, string> = {};
  if (prefs.font_family) style["--editor-font-family"] = prefs.font_family;
  if (prefs.font_size) style["--editor-font-size"] = `${prefs.font_size}px`;
  if (prefs.line_spacing) style["--editor-line-spacing"] = `${prefs.line_spacing}`;
  if (prefs.paragraph_spacing) style["--editor-paragraph-spacing"] = `${prefs.paragraph_spacing}em`;
  if (prefs.margin_width) {
    const widths: Record<string, string> = { narrow: "2rem", medium: "4rem", wide: "6rem" };
    style["--editor-margin-width"] = widths[prefs.margin_width] ?? "4rem";
  }
  return style as React.CSSProperties;
}

// ─── Editor Component ───

interface RichTextEditorProps {
  content: string;
  onChange: (text: string) => void;
  placeholder?: string;
  editable?: boolean;
  chapterNumber?: number;
  fallbackTitle?: string;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "开始写作...",
  editable = true,
  chapterNumber,
  fallbackTitle,
}: RichTextEditorProps) {
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [showFind, setShowFind] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [editorPrefs, setEditorPrefs] = useState<EditorPrefs>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Find/replace state
  const [findQuery, setFindQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const matchPositionsRef = useRef<number[]>([]);

  // Load editor prefs on mount
  useEffect(() => {
    sharedResourcesApi
      .getEditorPrefs()
      .then((p) => setEditorPrefs(p))
      .catch(() => {});
  }, []);

  const handleApplyPrefs = useCallback((prefs: EditorPrefs) => {
    setEditorPrefs(prefs);
  }, []);

  // ─── Find/Replace on raw text ───

  const findAllPositions = useCallback(
    (query: string): number[] => {
      if (!query || !textareaRef.current) return [];
      const text = textareaRef.current.value;
      const positions: number[] = [];
      const lower = text.toLowerCase();
      const lowerQ = query.toLowerCase();
      let idx = lower.indexOf(lowerQ);
      while (idx !== -1) {
        positions.push(idx);
        idx = lower.indexOf(lowerQ, idx + 1);
      }
      return positions;
    },
    [],
  );

  const scrollToMatch = useCallback((pos: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(pos, pos + findQuery.length);
    // Scroll to the line containing this position
    const before = ta.value.substring(0, pos);
    const lineIdx = before.split("\n").length - 1;
    const lineHeight = Number.parseFloat(getComputedStyle(ta).lineHeight) || 20;
    ta.scrollTop = Math.max(0, lineIdx * lineHeight - ta.clientHeight / 2);
  }, [findQuery.length]);

  const handleSearch = useCallback(
    (query: string) => {
      setFindQuery(query);
      const positions = findAllPositions(query);
      matchPositionsRef.current = positions;
      setMatchCount(positions.length);
      setCurrentMatch(0);
      if (positions.length > 0) {
        scrollToMatch(positions[0]);
      }
      return positions.length;
    },
    [findAllPositions, scrollToMatch],
  );

  const handleNext = useCallback(() => {
    const positions = matchPositionsRef.current;
    if (positions.length === 0) return;
    const next = (currentMatch + 1) % positions.length;
    setCurrentMatch(next);
    scrollToMatch(positions[next]);
  }, [currentMatch, scrollToMatch]);

  const handlePrev = useCallback(() => {
    const positions = matchPositionsRef.current;
    if (positions.length === 0) return;
    const prev =
      (currentMatch - 1 + positions.length) % positions.length;
    setCurrentMatch(prev);
    scrollToMatch(positions[prev]);
  }, [currentMatch, scrollToMatch]);

  const handleReplace = useCallback(
    (query: string, replacement: string) => {
      const positions = matchPositionsRef.current;
      if (positions.length === 0) return;
      const pos = positions[currentMatch] || positions[0];
      const ta = textareaRef.current;
      if (!ta) return;
      const before = ta.value.substring(0, pos);
      const after = ta.value.substring(pos + query.length);
      const newText = before + replacement + after;
      onChange(newText);
      // Refresh positions after React re-render
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.value = newText;
          handleSearch(findQuery || query);
        }
      }, 0);
    },
    [currentMatch, onChange, handleSearch, findQuery],
  );

  const handleReplaceAll = useCallback(
    (query: string, replacement: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const newText = ta.value.split(query).join(replacement);
      onChange(newText);
      setMatchCount(0);
      setCurrentMatch(0);
      matchPositionsRef.current = [];
      setFindQuery("");
    },
    [onChange],
  );

  const handleCloseFind = useCallback(() => {
    setShowFind(false);
    setFindQuery("");
    setMatchCount(0);
    setCurrentMatch(0);
    matchPositionsRef.current = [];
  }, []);

  // Cmd/Ctrl+F for find
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowFind(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "h") {
        e.preventDefault();
        setShowFind(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Sync external content into textarea ───

  const lastExternalContent = useRef(content);
  useEffect(() => {
    if (content !== lastExternalContent.current && textareaRef.current) {
      lastExternalContent.current = content;
      textareaRef.current.value = content;
    }
  }, [content]);

  // ─── Content parsing for preview ───

  const { title: parsedTitle, body } = parseContent(content);
  const displayTitle = parsedTitle || fallbackTitle || (chapterNumber ? `第${chapterNumber}章` : "");
  const paragraphs = renderParagraphs(body);
  const charCount = [...body].length;
  // DEBUG: trace paragraph splitting
  console.log("[Editor] content len:", content.length, "\\n\\n count:", (content.match(/\n\n/g) || []).length, "\\n count:", (content.match(/\n/g) || []).length, "paragraphs:", paragraphs.length);
  const readTimeMin = Math.max(1, Math.ceil(charCount / 500));

  // ─── Editor prefs for preview styling ───

  const fontFamily = editorPrefs.font_family
    ? `font-family: var(--editor-font-family, ${editorPrefs.font_family});`
    : "";
  const fontSize = editorPrefs.font_size
    ? `font-size: var(--editor-font-size, ${editorPrefs.font_size}px);`
    : "";
  const lineHeight = editorPrefs.line_spacing
    ? `line-height: var(--editor-line-spacing, ${editorPrefs.line_spacing});`
    : "";
  const paraSpacing = editorPrefs.paragraph_spacing
    ? `margin-bottom: var(--editor-paragraph-spacing, ${editorPrefs.paragraph_spacing}em);`
    : "";
  const marginWidth = editorPrefs.margin_width
    ? (() => {
        const widths: Record<string, string> = {
          narrow: "2rem",
          medium: "4rem",
          wide: "6rem",
        };
        return `padding-left: var(--editor-margin-width, ${widths[editorPrefs.margin_width] ?? "4rem"});
padding-right: var(--editor-margin-width, ${widths[editorPrefs.margin_width] ?? "4rem"});`;
      })()
    : "";

  const editorStyle = prefsToStyle(editorPrefs);

  return (
    <div className="flex flex-col h-full" style={editorStyle}>
      {/* Toolbar */}
      {editable && (
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
          {/* Edit / Preview toggle */}
          <div className="flex items-center bg-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setMode("edit")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === "edit"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              title="编辑"
            >
              <Pencil size={13} />
              <span>编辑</span>
            </button>
            <button
              onClick={() => setMode("preview")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${
                mode === "preview"
                  ? "bg-white text-gray-800 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              title="预览"
            >
              <Eye size={13} />
              <span>预览</span>
            </button>
          </div>

          <div className="flex-1" />

          <div className="relative">
            <button
              onClick={() => setShowPrefs(!showPrefs)}
              className={`p-1.5 rounded hover:bg-gray-200 text-gray-600 ${
                showPrefs ? "bg-gray-200" : ""
              }`}
              title="编辑器偏好"
            >
              <Settings2 size={14} />
            </button>
            <EditorPrefsPanel
              visible={showPrefs}
              onClose={() => setShowPrefs(false)}
              onApply={handleApplyPrefs}
            />
          </div>
          <button
            onClick={() => setShowFind(true)}
            className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
            title="查找替换 (Ctrl/Cmd+F)"
          >
            <Search size={14} />
          </button>
          <span className="text-xs text-gray-400">{charCount} 字</span>
        </div>
      )}

      {/* Find/Replace bar */}
      <FindReplaceBar
        visible={showFind}
        onClose={handleCloseFind}
        onSearch={handleSearch}
        onNext={handleNext}
        onPrev={handlePrev}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
        matchCount={matchCount}
        currentMatch={currentMatch}
      />

      {/* Edit Mode — textarea */}
      {mode === "edit" && (
        <div className="flex-1 overflow-hidden">
          <textarea
            ref={textareaRef}
            defaultValue={content}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full h-full bg-transparent font-serif text-lg leading-[1.8] text-gray-800 focus:outline-none resize-none p-6 md:p-12"
            style={{ fontFamily: "var(--editor-font-family, Georgia, 'Noto Serif SC', serif)" }}
          />
        </div>
      )}

      {/* Preview Mode — inkos-style paper sheet */}
      {mode === "preview" && (
        <div className="flex-1 overflow-auto bg-amber-50/30">
          <style>{`
            .preview-content { ${fontFamily} ${fontSize} ${lineHeight} }
            .preview-content p { ${paraSpacing} }
            .preview-content .paper-sheet { ${marginWidth} }
          `}</style>

          <div className="max-w-4xl mx-auto py-8 md:py-16 px-4">
            <div className="paper-sheet preview-content bg-white rounded-2xl p-8 md:p-16 lg:p-24 shadow-2xl shadow-primary/5 min-h-[75vh] relative overflow-hidden">
              {/* Paper lines decoration */}
              <div className="absolute top-0 left-8 w-px h-full bg-primary/5 hidden md:block" />
              <div className="absolute top-0 right-8 w-px h-full bg-primary/5 hidden md:block" />

              <header className="mb-16 text-center">
                <div className="flex items-center justify-center gap-2 text-gray-300 mb-8 select-none">
                  <div className="h-px w-12 bg-gray-200" />
                  <BookOpen size={20} />
                  <div className="h-px w-12 bg-gray-200" />
                </div>
                {displayTitle && (
                  <h1 className="text-4xl md:text-5xl font-serif font-medium italic text-gray-800 tracking-tight leading-tight">
                    {displayTitle}
                  </h1>
                )}
                {!displayTitle && paragraphs.length === 0 && (
                  <p className="text-gray-400 italic text-lg">暂无内容</p>
                )}
              </header>

              <article className="max-w-none">
                {paragraphs.map((para, i) => (
                  <p
                    key={i}
                    className="font-serif text-lg md:text-xl leading-[1.8] text-gray-800/90 mb-8 first-letter:text-2xl first-letter:font-bold first-letter:text-primary/40"
                  >
                    {para}
                  </p>
                ))}
              </article>

              {paragraphs.length > 0 && (
                <footer className="mt-24 pt-12 border-t border-gray-100 flex flex-col items-center gap-6 text-center">
                  <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50">
                      <Type size={14} className="text-primary/60" />
                      <span>{charCount.toLocaleString()} 字</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50">
                      <Clock size={14} className="text-primary/60" />
                      <span>约 {readTimeMin} 分钟</span>
                    </div>
                  </div>
                  <p className="text-[10px] uppercase tracking-widest text-gray-300 font-bold">
                    — 章节结束 —
                  </p>
                </footer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
