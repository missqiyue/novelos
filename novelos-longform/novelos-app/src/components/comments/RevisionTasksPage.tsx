import { useState, useMemo } from "react";
import { useCommentsStore } from "../../stores";
import {
  CheckSquare,
  Square,
  ArrowUpDown,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronUp,
  ChevronDown,
  ListTodo,
  MessageSquare,
} from "lucide-react";

interface RevisionTask {
  id: number;
  commentId: number;
  content: string;
  sentiment: string;
  priority: "high" | "medium" | "low";
  suggestedChapter: string;
  completed: boolean;
}

function inferChapter(content: string): string {
  const chapterMatch = content.match(/第\s*(\d+)\s*章/);
  if (chapterMatch) return `第${chapterMatch[1]}章`;
  const chMatch = content.match(/[Cc]hapter\s*(\d+)/);
  if (chMatch) return `Chapter ${chMatch[1]}`;
  return "待指定";
}

function getPriority(sentiment: string): "high" | "medium" | "low" {
  if (sentiment === "negative") return "high";
  if (sentiment === "mixed") return "medium";
  return "low";
}

export function RevisionTasksPage() {
  const { comments } = useCommentsStore();
  const [tasks, setTasks] = useState<RevisionTask[]>(() => {
    return comments
      .filter((c) => c.sentiment === "negative" || c.sentiment === "mixed")
      .map((c) => ({
        id: c.id,
        commentId: c.id,
        content: c.content,
        sentiment: c.sentiment,
        priority: getPriority(c.sentiment),
        suggestedChapter: inferChapter(c.content),
        completed: false,
      }));
  });
  const [sortField, setSortField] = useState<"priority" | "chapter">("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [copied, setCopied] = useState(false);

  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

  const sortedTasks = useMemo(() => {
    const sorted = [...tasks];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === "priority") {
        cmp = priorityOrder[a.priority] - priorityOrder[b.priority];
      } else {
        cmp = a.suggestedChapter.localeCompare(b.suggestedChapter, undefined, {
          numeric: true,
        });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [tasks, sortField, sortDir]);

  const toggleSort = (field: "priority" | "chapter") => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const toggleComplete = (id: number) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  const total = tasks.length;
  const completedCount = tasks.filter((t) => t.completed).length;
  const pendingCount = total - completedCount;

  const handleExport = async () => {
    const pendingTasks = sortedTasks.filter((t) => !t.completed);
    const completedTasks = sortedTasks.filter((t) => t.completed);

    const lines: string[] = [];
    lines.push(`修改任务清单 — 总计 ${total} 项，已完成 ${completedCount}，待处理 ${pendingCount}`);
    lines.push("");

    if (pendingTasks.length > 0) {
      lines.push("=== 待处理 ===");
      pendingTasks.forEach((t, i) => {
        const priorityLabel =
          t.priority === "high" ? "[高]" : t.priority === "medium" ? "[中]" : "[低]";
        lines.push(`${i + 1}. ${priorityLabel} ${t.suggestedChapter}: ${t.content}`);
      });
      lines.push("");
    }

    if (completedTasks.length > 0) {
      lines.push("=== 已完成 ===");
      completedTasks.forEach((t, i) => {
        lines.push(`${i + 1}. [完成] ${t.suggestedChapter}: ${t.content}`);
      });
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  const priorityIcon = (p: string) => {
    if (p === "high") return <AlertTriangle size={14} className="text-red-500" />;
    if (p === "medium") return <AlertCircle size={14} className="text-amber-500" />;
    return <Info size={14} className="text-blue-500" />;
  };

  const priorityLabel = (p: string) => {
    if (p === "high") return "高";
    if (p === "medium") return "中";
    return "低";
  };

  const priorityBg = (p: string) => {
    if (p === "high") return "bg-red-50 border-red-200";
    if (p === "medium") return "bg-amber-50 border-amber-200";
    return "bg-blue-50 border-blue-200";
  };

  // Empty state: no comments imported
  if (comments.length === 0) {
    return (
      <div className="p-6 overflow-auto h-full">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-1">修改任务</h1>
          <p className="text-sm text-gray-500 mb-6">根据读者评论的负面/混合情感自动生成修改任务</p>
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <MessageSquare size={48} className="mb-4" />
            <p className="text-sm">暂无评论数据</p>
            <p className="text-xs mt-1">请先在"评论导入"页面导入并标注读者评论</p>
          </div>
        </div>
      </div>
    );
  }

  // Empty state: no negative/mixed comments
  if (tasks.length === 0) {
    return (
      <div className="p-6 overflow-auto h-full">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 mb-1">修改任务</h1>
          <p className="text-sm text-gray-500 mb-6">根据读者评论的负面/混合情感自动生成修改任务</p>
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <CheckSquare size={48} className="mb-4 text-green-400" />
            <p className="text-sm">所有评论均为正面，暂无修改任务</p>
            <p className="text-xs mt-1">当前 {comments.length} 条评论的情感标注均为正面</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">修改任务</h1>
        <p className="text-sm text-gray-500 mb-6">
          根据读者评论的负面/混合情感自动生成修改任务，按优先级排序处理
        </p>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{total}</div>
            <div className="text-sm text-gray-500 mt-1">总计任务</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-red-600">{pendingCount}</div>
            <div className="text-sm text-gray-500 mt-1">待处理</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
            <div className="text-sm text-gray-500 mt-1">已完成</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleSort("priority")}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                sortField === "priority"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <ArrowUpDown size={14} />
              按优先级
              {sortField === "priority" &&
                (sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
            </button>
            <button
              onClick={() => toggleSort("chapter")}
              className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                sortField === "chapter"
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              <ArrowUpDown size={14} />
              按章节
              {sortField === "chapter" &&
                (sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
            </button>
          </div>

          <button
            onClick={handleExport}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg transition-colors ${
              copied ? "bg-green-600 text-white" : "bg-indigo-600 text-white hover:bg-indigo-700"
            }`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "已复制" : "导出任务"}
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-4">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-indigo-500 to-green-500 transition-all duration-300"
            style={{
              width: `${total > 0 ? (completedCount / total) * 100 : 0}%`,
            }}
          />
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {sortedTasks.map((task) => (
            <button
              key={task.id}
              onClick={() => toggleComplete(task.id)}
              className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                task.completed
                  ? "bg-gray-50 border-gray-200 opacity-70"
                  : `${priorityBg(task.priority)} hover:shadow-sm`
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {task.completed ? (
                  <CheckSquare size={18} className="text-green-500" />
                ) : (
                  <Square size={18} className="text-gray-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm leading-relaxed ${
                    task.completed ? "text-gray-400 line-through" : "text-gray-800"
                  }`}
                >
                  {task.content}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded">
                  {task.suggestedChapter}
                </span>
                <span
                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                    task.priority === "high"
                      ? "bg-red-100 text-red-700"
                      : task.priority === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {priorityIcon(task.priority)}
                  {priorityLabel(task.priority)}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Footer stats */}
        <div className="mt-6 flex items-center justify-between text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <ListTodo size={14} />
            {total} 项任务
          </span>
          <span>
            {completedCount}/{total} 已完成
            {pendingCount > 0 && ` — 还有 ${pendingCount} 项待处理`}
          </span>
        </div>
      </div>
    </div>
  );
}
