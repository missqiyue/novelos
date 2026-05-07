import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Search,
  Settings2,
} from "lucide-react";
import { FindReplaceBar } from "./FindReplaceBar";
import { EditorPrefsPanel } from "./EditorPrefsPanel";
import { sharedResourcesApi, type EditorPrefs } from "../../lib/api";

// ─── Search Highlight Extension ───

const searchHighlightKey = new PluginKey("searchHighlight");

function findTextPositions(doc: any, query: string): { from: number; to: number }[] {
  if (!query) return [];
  const results: { from: number; to: number }[] = [];
  const lowerQuery = query.toLowerCase();
  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;
    const text = node.text!.toLowerCase();
    let idx = text.indexOf(lowerQuery);
    while (idx !== -1) {
      results.push({ from: pos + idx, to: pos + idx + query.length });
      idx = text.indexOf(lowerQuery, idx + 1);
    }
  });
  return results;
}

function buildDecorations(doc: any, query: string, activeIndex: number): DecorationSet {
  const positions = findTextPositions(doc, query);
  if (positions.length === 0) return DecorationSet.empty;
  const decorations = positions.map((pos, i) =>
    Decoration.inline(pos.from, pos.to, {
      class: i === activeIndex
        ? "bg-yellow-300 outline outline-1 outline-yellow-500"
        : "bg-yellow-200",
    }),
  );
  return DecorationSet.create(doc, decorations);
}

const SearchHighlight = Extension.create({
  name: "searchHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchHighlightKey,
        state: {
          init: () => ({ query: "", activeIndex: 0 }),
          apply(tr, prev) {
            const meta = tr.getMeta(searchHighlightKey);
            if (meta) return meta;
            return prev;
          },
        },
        props: {
          decorations(state) {
            const { query, activeIndex } = searchHighlightKey.getState(state)!;
            if (!query) return DecorationSet.empty;
            return buildDecorations(state.doc, query, activeIndex);
          },
        },
      }),
    ];
  },
});

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
  onChange: (html: string, text: string) => void;
  placeholder?: string;
  editable?: boolean;
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = "开始写作...",
  editable = true,
}: RichTextEditorProps) {
  const [showFind, setShowFind] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [editorPrefs, setEditorPrefs] = useState<EditorPrefs>({});
  const searchQueryRef = useRef("");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Placeholder.configure({
        placeholder,
      }),
      CharacterCount,
      SearchHighlight,
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[400px] px-6 py-4 text-gray-800 leading-relaxed editor-content",
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const text = editor.getText();
      onChange(html, text);
      refreshSearch(editor);
    },
    immediatelyRender: false,
  });

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

  const refreshSearch = useCallback((ed: Editor) => {
    const q = searchQueryRef.current;
    if (!q || !ed) return;
    const positions = findTextPositions(ed.state.doc, q);
    setMatchCount(positions.length);
    if (positions.length === 0) {
      setCurrentMatch(0);
      return;
    }
    setCurrentMatch((prev) => Math.min(prev, positions.length - 1));
    ed.view.dispatch(
      ed.state.tr.setMeta(searchHighlightKey, {
        query: q,
        activeIndex: Math.min(currentMatch, positions.length - 1),
      }),
    );
  }, [currentMatch]);

  const handleSearch = useCallback(
    (query: string) => {
      searchQueryRef.current = query;
      if (!editor) return 0;
      const positions = findTextPositions(editor.state.doc, query);
      setMatchCount(positions.length);
      setCurrentMatch(0);
      editor.view.dispatch(
        editor.state.tr.setMeta(searchHighlightKey, { query, activeIndex: 0 }),
      );
      if (positions.length > 0) {
        scrollToMatch(editor, positions[0].from);
      }
      return positions.length;
    },
    [editor],
  );

  const scrollToMatch = (ed: Editor, pos: number) => {
    const $pos = ed.state.doc.resolve(pos);
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near($pos)));
    ed.commands.scrollIntoView();
  };

  const handleNext = useCallback(() => {
    if (!editor) return;
    const q = searchQueryRef.current;
    const positions = findTextPositions(editor.state.doc, q);
    if (positions.length === 0) return;
    const next = (currentMatch + 1) % positions.length;
    setCurrentMatch(next);
    editor.view.dispatch(
      editor.state.tr.setMeta(searchHighlightKey, { query: q, activeIndex: next }),
    );
    scrollToMatch(editor, positions[next].from);
  }, [editor, currentMatch]);

  const handlePrev = useCallback(() => {
    if (!editor) return;
    const q = searchQueryRef.current;
    const positions = findTextPositions(editor.state.doc, q);
    if (positions.length === 0) return;
    const prev = (currentMatch - 1 + positions.length) % positions.length;
    setCurrentMatch(prev);
    editor.view.dispatch(
      editor.state.tr.setMeta(searchHighlightKey, { query: q, activeIndex: prev }),
    );
    scrollToMatch(editor, positions[prev].from);
  }, [editor, currentMatch]);

  const handleReplace = useCallback(
    (query: string, replacement: string) => {
      if (!editor) return;
      const positions = findTextPositions(editor.state.doc, query);
      if (positions.length === 0) return;
      const pos = positions[currentMatch] || positions[0];
      const tr = editor.state.tr.insertText(replacement, pos.from, pos.to);
      editor.view.dispatch(tr);
      setTimeout(() => handleSearch(query), 0);
    },
    [editor, currentMatch, handleSearch],
  );

  const handleReplaceAll = useCallback(
    (query: string, replacement: string) => {
      if (!editor) return;
      const positions = findTextPositions(editor.state.doc, query);
      if (positions.length === 0) return;
      let tr = editor.state.tr;
      for (let i = positions.length - 1; i >= 0; i--) {
        tr = tr.insertText(replacement, positions[i].from, positions[i].to);
      }
      editor.view.dispatch(tr);
      setMatchCount(0);
      setCurrentMatch(0);
      searchQueryRef.current = "";
      editor.view.dispatch(
        editor.state.tr.setMeta(searchHighlightKey, { query: "", activeIndex: 0 }),
      );
    },
    [editor],
  );

  const handleCloseFind = useCallback(() => {
    setShowFind(false);
    searchQueryRef.current = "";
    setMatchCount(0);
    setCurrentMatch(0);
    if (editor) {
      editor.view.dispatch(
        editor.state.tr.setMeta(searchHighlightKey, { query: "", activeIndex: 0 }),
      );
    }
  }, [editor]);

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

  if (!editor) return null;

  const MenuBar = () => (
    <div className="flex items-center gap-1 px-4 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded ${editor.isActive("bold") ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-200 text-gray-600"}`}
        title="粗体"
      >
        <Bold size={14} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded ${editor.isActive("italic") ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-200 text-gray-600"}`}
        title="斜体"
      >
        <Italic size={14} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={`p-1.5 rounded ${editor.isActive("strike") ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-200 text-gray-600"}`}
        title="删除线"
      >
        <Strikethrough size={14} />
      </button>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded ${editor.isActive("heading", { level: 2 }) ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-200 text-gray-600"}`}
        title="标题"
      >
        <Heading2 size={14} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded ${editor.isActive("bulletList") ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-200 text-gray-600"}`}
        title="无序列表"
      >
        <List size={14} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-1.5 rounded ${editor.isActive("orderedList") ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-200 text-gray-600"}`}
        title="有序列表"
      >
        <ListOrdered size={14} />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={`p-1.5 rounded ${editor.isActive("blockquote") ? "bg-indigo-100 text-indigo-700" : "hover:bg-gray-200 text-gray-600"}`}
        title="引用"
      >
        <Quote size={14} />
      </button>
      <div className="w-px h-4 bg-gray-300 mx-1" />
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        className="p-1.5 rounded hover:bg-gray-200 text-gray-600 disabled:opacity-30"
        title="撤销"
      >
        <Undo size={14} />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        className="p-1.5 rounded hover:bg-gray-200 text-gray-600 disabled:opacity-30"
        title="重做"
      >
        <Redo size={14} />
      </button>
      <div className="flex-1" />
      <div className="relative">
        <button
          onClick={() => setShowPrefs(!showPrefs)}
          className={`p-1.5 rounded hover:bg-gray-200 text-gray-600 ${showPrefs ? "bg-gray-200" : ""}`}
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
      <span className="text-xs text-gray-400">{editor.storage.characterCount.characters()} 字</span>
    </div>
  );

  const editorStyle = prefsToStyle(editorPrefs);
  const fontVar = editorPrefs.font_family ? `font-family: var(--editor-font-family, ${editorPrefs.font_family});` : "";
  const sizeVar = editorPrefs.font_size ? `font-size: var(--editor-font-size, ${editorPrefs.font_size}px);` : "";
  const lineVar = editorPrefs.line_spacing ? `line-height: var(--editor-line-spacing, ${editorPrefs.line_spacing});` : "";
  const paraVar = editorPrefs.paragraph_spacing ? `margin-bottom: var(--editor-paragraph-spacing, ${editorPrefs.paragraph_spacing}em);` : "";
  const marginVar = editorPrefs.margin_width ? `padding-left: var(--editor-margin-width, 4rem); padding-right: var(--editor-margin-width, 4rem);` : "";

  return (
    <div className="flex flex-col h-full" style={editorStyle}>
      {editable && <MenuBar />}
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
      <div className="flex-1 overflow-auto">
        <style>{`.editor-content { ${fontVar} ${sizeVar} ${lineVar} } .editor-content p { ${paraVar} } .editor-content .ProseMirror { ${marginVar} }`}</style>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
