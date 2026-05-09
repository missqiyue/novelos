import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChapterStore, useProjectStore } from "../../stores";
import {
 BookOpen,
 ChevronLeft,
 ChevronRight,
 Edit3,
 Moon,
 Sun,
 Clock,
 FileText,
 Loader2,
 AlertTriangle,
 ArrowLeft,
} from "lucide-react";

function estimateReadingTime(chars: number): number {
 // Average 500 chars/min for Chinese reading
 return Math.max(1, Math.ceil(chars / 500));
}

export function ReadingModePage() {
 const { projectId, chapterNumber } = useParams();
 const navigate = useNavigate();
 const num = parseInt(chapterNumber || "1", 10);

 const { currentChapter, chapters, loading, error, selectChapter, fetchChapters } =
 useChapterStore();
 const { project, switchProject } = useProjectStore();

 const [darkMode, setDarkMode] = useState(false);
 const [initialized, setInitialized] = useState(false);

 // Initialize: switch project and load chapter
 useEffect(() => {
 const init = async () => {
 if (projectId && project?.id !== projectId) {
 await switchProject(projectId);
 }
 await fetchChapters();
 await selectChapter(num);
 setInitialized(true);
 };
 init();
 }, [projectId, num]); // eslint-disable-line react-hooks/exhaustive-deps

 // Re-select chapter when chapterNumber changes
 useEffect(() => {
 if (initialized) {
 selectChapter(num);
 }
 }, [num, initialized, selectChapter]);

 // Keyboard navigation
 const handleKeyDown = useCallback(
 (e: KeyboardEvent) => {
 if (e.key === "ArrowLeft" && (e.metaKey || e.ctrlKey)) {
 e.preventDefault();
 handlePrevChapter();
 } else if (e.key === "ArrowRight" && (e.metaKey || e.ctrlKey)) {
 e.preventDefault();
 handleNextChapter();
 }
 },
 [num, chapters], // eslint-disable-line react-hooks/exhaustive-deps
 );

 useEffect(() => {
 window.addEventListener("keydown", handleKeyDown);
 return () => window.removeEventListener("keydown", handleKeyDown);
 }, [handleKeyDown]);

 const chapterText = currentChapter?.final_text || currentChapter?.draft_text || "";
 const wordCount = chapterText.length;
 const readingTime = estimateReadingTime(wordCount);

 // Find previous and next chapters
 const sortedChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
 const currentIdx = sortedChapters.findIndex((ch) => ch.chapter_number === num);
 const prevChapter = currentIdx > 0 ? sortedChapters[currentIdx - 1] : null;
 const nextChapter =
 currentIdx >= 0 && currentIdx < sortedChapters.length - 1
 ? sortedChapters[currentIdx + 1]
 : null;

 const handlePrevChapter = () => {
 if (prevChapter) {
 navigate(`/project/${projectId}/read/${prevChapter.chapter_number}`);
 }
 };

 const handleNextChapter = () => {
 if (nextChapter) {
 navigate(`/project/${projectId}/read/${nextChapter.chapter_number}`);
 }
 };

 const handleEditMode = () => {
 navigate(`/project/${projectId}/chapter/${num}`);
 };

 const handleBackToDashboard = () => {
 navigate(`/project/${projectId}/dashboard`);
 };

 // Loading state
 if (loading || !initialized) {
 return (
 <div className="flex items-center justify-center h-full">
 <div className="text-center text-gray-400">
 <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
 <p className="text-sm">正在加载章节...</p>
 </div>
 </div>
 );
 }

 // Error state
 if (error) {
 return (
 <div className="flex items-center justify-center h-full p-6">
 <div className="max-w-md text-center">
 <AlertTriangle size={32} className="mx-auto mb-3 text-red-400" />
 <p className="text-sm text-red-600 mb-4">{error}</p>
 <button
 onClick={handleBackToDashboard}
 className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
 >
 返回看板
 </button>
 </div>
 </div>
 );
 }

 // Empty state - chapter not found
 if (!currentChapter) {
 return (
 <div className="flex items-center justify-center h-full">
 <div className="text-center text-gray-400">
 <BookOpen size={48} className="mx-auto mb-4 text-gray-300" />
 <p className="text-sm">未找到第{num}章</p>
 <button
 onClick={handleBackToDashboard}
 className="mt-4 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
 >
 返回看板
 </button>
 </div>
 </div>
 );
 }

 // Empty state - no content
 if (!chapterText.trim()) {
 return (
 <div className="flex items-center justify-center h-full">
 <div className="text-center text-gray-400">
 <FileText size={48} className="mx-auto mb-4 text-gray-300" />
 <p className="text-sm">第{num}章暂无内容</p>
 <p className="text-xs mt-1 text-gray-400">请先在编辑模式中撰写内容</p>
 <button
 onClick={handleEditMode}
 className="mt-4 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
 >
 前往编辑
 </button>
 </div>
 </div>
 );
 }

 return (
 <div
 className={`flex flex-col h-full overflow-auto ${
 darkMode ? "bg-gray-900 text-gray-200" : "bg-amber-50/30 text-gray-900"
 }`}
 >
 {/* Top toolbar */}
 <div
 className={`shrink-0 flex items-center justify-between px-6 py-3 border-b transition-colors ${
 darkMode ? "bg-gray-800 border-gray-700" : "bg-white/80 backdrop-blur border-gray-200"
 }`}
 >
 {/* Left: back + title */}
 <div className="flex items-center gap-3 min-w-0">
 <button
 onClick={handleBackToDashboard}
 className={`p-1.5 rounded-lg transition-colors ${
 darkMode
 ? "text-gray-400 hover:text-gray-200 hover:bg-gray-700"
 : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
 }`}
 title="返回看板"
 >
 <ArrowLeft size={18} />
 </button>
 <div className="min-w-0">
 <h2
 className={`text-sm font-medium truncate ${
 darkMode ? "text-gray-200" : "text-gray-900"
 }`}
 >
 {project?.title || "未知项目"}
 </h2>
 </div>
 </div>

 {/* Right: reading info + buttons */}
 <div className="flex items-center gap-3 shrink-0">
 {/* Reading time */}
 <div
 className={`flex items-center gap-1.5 text-xs ${
 darkMode ? "text-gray-400" : "text-gray-500"
 }`}
 >
 <Clock size={13} />
 <span>约{readingTime}分钟</span>
 </div>

 {/* Word count */}
 <div
 className={`flex items-center gap-1.5 text-xs ${
 darkMode ? "text-gray-400" : "text-gray-500"
 }`}
 >
 <FileText size={13} />
 <span>{wordCount.toLocaleString()}字</span>
 </div>

 {/* Dark mode toggle */}
 <button
 onClick={() => setDarkMode(!darkMode)}
 className={`p-1.5 rounded-lg transition-colors ${
 darkMode
 ? "text-yellow-400 hover:bg-gray-700"
 : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
 }`}
 title={darkMode ? "切换亮色背景" : "切换暗色背景"}
 >
 {darkMode ? <Sun size={17} /> : <Moon size={17} />}
 </button>

 {/* Edit mode button */}
 <button
 onClick={handleEditMode}
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
 darkMode
 ? "bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600"
 : "bg-white text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200"
 }`}
 >
 <Edit3 size={14} />
 <span>编辑模式</span>
 </button>
 </div>
 </div>

 {/* Reading content */}
 <div className="flex-1 overflow-auto px-6 py-10">
 <article className="max-w-2xl mx-auto">
 {/* Chapter header */}
 <header className="mb-10 text-center">
 <h1
 className={`text-3xl font-bold mb-3 font-serif ${
 darkMode ? "text-gray-100" : "text-gray-900"
 }`}
 >
 第{num}章{currentChapter?.title ? ` ${currentChapter.title}` : ""}
 </h1>
 <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
 {wordCount.toLocaleString()}字 / 约{readingTime}分钟阅读
 </p>
 </header>

 {/* Chapter body */}
 <div
 className={`text-lg leading-relaxed font-serif whitespace-pre-wrap ${
 darkMode ? "text-gray-300" : "text-gray-800"
 }`}
 style={{ lineHeight: "2" }}
 >
 {chapterText}
 </div>

 {/* Chapter footer - navigation */}
 <footer className="mt-16 pt-8 border-t border-gray-200">
 <div className="flex items-center justify-between">
 {prevChapter ? (
 <button
 onClick={handlePrevChapter}
 className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
 darkMode
 ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
 : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
 }`}
 >
 <ChevronLeft size={16} />
 <div className="text-left">
 <div className="text-xs opacity-60">上一章</div>
 <div className="font-medium">
 第{prevChapter.chapter_number}章
 {prevChapter.title ? ` ${prevChapter.title}` : ""}
 </div>
 </div>
 </button>
 ) : (
 <div />
 )}

 {nextChapter ? (
 <button
 onClick={handleNextChapter}
 className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm transition-colors ${
 darkMode
 ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
 : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-200"
 }`}
 >
 <div className="text-right">
 <div className="text-xs opacity-60">下一章</div>
 <div className="font-medium">
 第{nextChapter.chapter_number}章
 {nextChapter.title ? ` ${nextChapter.title}` : ""}
 </div>
 </div>
 <ChevronRight size={16} />
 </button>
 ) : (
 <div />
 )}
 </div>

 {/* Keyboard shortcuts hint */}
 <p
 className={`text-center text-xs mt-6 ${darkMode ? "text-gray-500" : "text-gray-400"}`}
 >
 Ctrl+方向键 切换章节
 </p>
 </footer>
 </article>
 </div>
 </div>
 );
}
