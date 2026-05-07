import { useMemo } from "react";
import { ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";

interface DiffLine {
  type: "add" | "remove" | "same";
  lineNum: number;
  content: string;
}

function computeDiff(oldText: string, newText: string): { old: DiffLine[]; new: DiffLine[] } {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Simple line-by-line LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack
  const oldDiff: DiffLine[] = [];
  const newDiff: DiffLine[] = [];
  let i = m,
    j = n;
  const oldResult: { type: "add" | "remove" | "same"; lineNum: number; content: string }[] = [];
  const newResult: { type: "add" | "remove" | "same"; lineNum: number; content: string }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      oldResult.unshift({ type: "same", lineNum: i, content: oldLines[i - 1] });
      newResult.unshift({ type: "same", lineNum: j, content: newLines[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      oldResult.unshift({ type: "add", lineNum: 0, content: "" });
      newResult.unshift({ type: "add", lineNum: j, content: newLines[j - 1] });
      j--;
    } else {
      oldResult.unshift({ type: "remove", lineNum: i, content: oldLines[i - 1] });
      newResult.unshift({ type: "remove", lineNum: 0, content: "" });
      i--;
    }
  }

  return {
    old: oldResult.map((d, idx) => ({ ...d, lineNum: d.type === "add" ? 0 : d.lineNum })),
    new: newResult.map((d, idx) => ({ ...d, lineNum: d.type === "remove" ? 0 : d.lineNum })),
  };
}

interface DiffViewerProps {
  oldText: string;
  newText: string;
  oldLabel?: string;
  newLabel?: string;
}

export function DiffViewer({
  oldText,
  newText,
  oldLabel = "旧版本",
  newLabel = "新版本",
}: DiffViewerProps) {
  const diff = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);

  const addedCount = diff.new.filter((d) => d.type === "add").length;
  const removedCount = diff.old.filter((d) => d.type === "remove").length;

  return (
    <div className="flex flex-col h-full">
      {/* Stats */}
      <div className="flex items-center gap-3 px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">
        <span className="flex items-center gap-1 text-green-600">
          <Plus size={12} /> +{addedCount}
        </span>
        <span className="flex items-center gap-1 text-red-600">
          <Minus size={12} /> -{removedCount}
        </span>
        <span className="flex-1" />
        <span className="text-gray-400">{oldLabel}</span>
        <ArrowRight size={12} />
        <span className="text-gray-400">{newLabel}</span>
      </div>

      {/* Side-by-side diff */}
      <div className="flex-1 overflow-auto">
        <div className="grid grid-cols-2 divide-x divide-gray-200 text-xs font-mono leading-relaxed">
          {/* Old side */}
          <div>
            {diff.old.map((line, i) => (
              <div
                key={`old-${i}`}
                className={`flex min-h-[1.5rem] ${
                  line.type === "remove" ? "bg-red-50" : line.type === "add" ? "bg-gray-50" : ""
                }`}
              >
                <span className="w-10 shrink-0 text-right text-gray-400 pr-2 py-px select-none border-r border-gray-100">
                  {line.type !== "add" ? line.lineNum : ""}
                </span>
                <span
                  className={`flex-1 pl-2 py-px whitespace-pre-wrap break-all ${
                    line.type === "remove" ? "text-red-700" : "text-gray-400"
                  }`}
                >
                  {line.type === "remove" && (
                    <Minus size={10} className="inline mr-1 text-red-400" />
                  )}
                  {line.content}
                </span>
              </div>
            ))}
          </div>
          {/* New side */}
          <div>
            {diff.new.map((line, i) => (
              <div
                key={`new-${i}`}
                className={`flex min-h-[1.5rem] ${
                  line.type === "add" ? "bg-green-50" : line.type === "remove" ? "bg-gray-50" : ""
                }`}
              >
                <span className="w-10 shrink-0 text-right text-gray-400 pr-2 py-px select-none border-r border-gray-100">
                  {line.type !== "remove" ? line.lineNum : ""}
                </span>
                <span
                  className={`flex-1 pl-2 py-px whitespace-pre-wrap break-all ${
                    line.type === "add" ? "text-green-700" : "text-gray-600"
                  }`}
                >
                  {line.type === "add" && <Plus size={10} className="inline mr-1 text-green-400" />}
                  {line.content}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
