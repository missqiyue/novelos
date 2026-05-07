import { useState, useEffect, useRef, useCallback } from "react";
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  Zap,
  PenLine,
  History,
  TrendingUp,
  Trash2,
  CheckCircle2,
  Clock,
} from "lucide-react";

// ─── Constants ───

const SPRINT_HISTORY_KEY = "novelos_sprint_history";
const DEFAULT_DURATION = 25 * 60; // 25 minutes in seconds

// ─── Types ───

interface SprintRecord {
  id: string;
  date: string; // ISO string
  durationSeconds: number;
  wordsWritten: number;
  wpm: number; // words per minute at the end of sprint
}

// ─── Helpers ───

function loadHistory(): SprintRecord[] {
  try {
    const raw = localStorage.getItem(SPRINT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(records: SprintRecord[]) {
  try {
    localStorage.setItem(SPRINT_HISTORY_KEY, JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}小时${rm}分` : `${h}小时`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sub-components ───

function SprintHistoryTable({
  records,
  onDelete,
}: {
  records: SprintRecord[];
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <History size={32} className="mx-auto mb-2 text-gray-300" />
        <p className="text-sm">暂无冲刺记录</p>
        <p className="text-xs mt-1">完成一次写作冲刺后，记录将出现在这里</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 text-xs font-medium text-gray-500">日期</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">时长</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">字数</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">WPM</th>
            <th className="text-right py-2 px-3 text-xs font-medium text-gray-500">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {records.map((record) => (
            <tr key={record.id} className="hover:bg-gray-50 transition-colors">
              <td className="py-2.5 px-3 text-gray-700">{formatDate(record.date)}</td>
              <td className="py-2.5 px-3 text-right text-gray-700">
                {formatDuration(record.durationSeconds)}
              </td>
              <td className="py-2.5 px-3 text-right text-gray-900 font-medium">
                {record.wordsWritten.toLocaleString()}
              </td>
              <td className="py-2.5 px-3 text-right">
                <span
                  className={`font-medium ${
                    record.wpm >= 40
                      ? "text-green-600"
                      : record.wpm >= 20
                        ? "text-yellow-600"
                        : "text-gray-500"
                  }`}
                >
                  {record.wpm.toFixed(1)}
                </span>
              </td>
              <td className="py-2.5 px-3 text-right">
                {confirmDelete === record.id ? (
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => {
                        onDelete(record.id);
                        setConfirmDelete(null);
                      }}
                      className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600 hover:bg-red-200"
                    >
                      确认
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-gray-200"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(record.id)}
                    className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                    title="删除记录"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ───

export function SprintTimerPage() {
  // Timer state
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [timeLeft, setTimeLeft] = useState(DEFAULT_DURATION);
  const [isRunning, setIsRunning] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  // Word count state
  const [startingWordCount, setStartingWordCount] = useState<number | null>(null);
  const [currentWordCount, setCurrentWordCount] = useState(0);
  const [showWordInput, setShowWordInput] = useState(false);

  // History
  const [history, setHistory] = useState<SprintRecord[]>(loadHistory);
  const [showHistory, setShowHistory] = useState(false);

  // Flash notification
  const [flash, setFlash] = useState(false);

  // Refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const actualDurationRef = useRef(0); // Track actual elapsed time

  // Preset durations
  const presets = [
    { label: "15分钟", seconds: 15 * 60 },
    { label: "25分钟", seconds: 25 * 60 },
    { label: "45分钟", seconds: 45 * 60 },
    { label: "60分钟", seconds: 60 * 60 },
  ];

  // ─── Timer logic ───

  const clearTimerInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timeLeft <= 0) return;
    setIsRunning(true);
    setIsFinished(false);
    actualDurationRef.current = 0;
    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        actualDurationRef.current += 1;
        if (prev <= 1) {
          clearTimerInterval();
          setIsRunning(false);
          setIsFinished(true);
          // Trigger flash notification
          setFlash(true);
          setTimeout(() => setFlash(false), 3000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timeLeft, clearTimerInterval]);

  const pauseTimer = useCallback(() => {
    clearTimerInterval();
    setIsRunning(false);
  }, [clearTimerInterval]);

  const resetTimer = useCallback(() => {
    clearTimerInterval();
    setIsRunning(false);
    setIsFinished(false);
    setTimeLeft(duration);
    setStartingWordCount(null);
    setCurrentWordCount(0);
    setShowWordInput(false);
    setFlash(false);
    actualDurationRef.current = 0;
  }, [duration, clearTimerInterval]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimerInterval();
  }, [clearTimerInterval]);

  // ─── Word count logic ───

  const handleStartSprint = () => {
    resetTimer();
    setShowWordInput(true);
  };

  const handleSetWordCount = () => {
    setStartingWordCount(currentWordCount);
    setShowWordInput(false);
    startTimer();
  };

  const handleSprintComplete = () => {
    const elapsedSeconds = duration - timeLeft; // Total duration minus remaining
    const actualDuration = elapsedSeconds > 0 ? elapsedSeconds : duration;
    const wordsWritten =
      startingWordCount != null ? Math.max(0, currentWordCount - startingWordCount) : 0;
    const wpm = actualDuration > 0 ? wordsWritten / (actualDuration / 60) : 0;

    const record: SprintRecord = {
      id: `sprint-${Date.now()}`,
      date: new Date().toISOString(),
      durationSeconds: actualDuration,
      wordsWritten,
      wpm: Math.round(wpm * 10) / 10,
    };

    const updated = [record, ...history];
    setHistory(updated);
    saveHistory(updated);
    setIsFinished(false);
    setFlash(false);
  };

  const handleDeleteRecord = (id: string) => {
    const updated = history.filter((r) => r.id !== id);
    setHistory(updated);
    saveHistory(updated);
  };

  const handleClearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  // ─── Compute sprint stats ───

  const sprintWords =
    startingWordCount != null && isRunning ? `${currentWordCount - startingWordCount}` : "0";

  const sprintWPM = (() => {
    if (!isRunning || startingWordCount == null) return 0;
    const elapsedSeconds = duration - timeLeft;
    if (elapsedSeconds <= 0) return 0;
    const words = Math.max(0, currentWordCount - startingWordCount);
    return Math.round((words / (elapsedSeconds / 60)) * 10) / 10;
  })();

  // Calculate overall stats
  const totalSprints = history.length;
  const totalWords = history.reduce((sum, r) => sum + r.wordsWritten, 0);
  const bestWPM = history.length > 0 ? Math.max(...history.map((r) => r.wpm)) : 0;

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Flash notification overlay */}
      {flash && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-500/90 animate-pulse pointer-events-none">
          <div className="text-center text-white">
            <CheckCircle2 size={64} className="mx-auto mb-4" />
            <h2 className="text-3xl font-bold mb-2">冲刺完成!</h2>
            <p className="text-lg opacity-80">太棒了!记下你的字数，准备下一次冲刺吧。</p>
          </div>
        </div>
      )}

      <div className="p-6 max-w-2xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Zap size={22} className="text-indigo-600" />
              写作冲刺
            </h1>
            <p className="text-sm text-gray-500 mt-1">Pomodoro式专注写作计时器</p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              showHistory
                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            <History size={14} />
            历史记录
          </button>
        </div>

        {/* Duration presets */}
        {!isRunning && !showWordInput && (
          <div className="mb-6">
            <label className="block text-xs font-medium text-gray-600 mb-2">选择冲刺时长</label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.seconds}
                  onClick={() => {
                    setDuration(preset.seconds);
                    setTimeLeft(preset.seconds);
                  }}
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                    duration === preset.seconds
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                  }`}
                >
                  <Clock size={14} className="inline mr-1.5" />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Timer display */}
        <div
          className={`rounded-2xl border-2 p-8 mb-6 text-center transition-all ${
            isFinished
              ? "bg-green-50 border-green-300"
              : isRunning
                ? "bg-indigo-50 border-indigo-300"
                : "bg-white border-gray-200"
          }`}
        >
          {/* Countdown */}
          <div
            className={`text-8xl font-mono font-bold tracking-tight mb-4 ${
              isFinished
                ? "text-green-600"
                : isRunning
                  ? "text-indigo-600"
                  : timeLeft <= 60 && timeLeft > 0
                    ? "text-red-500"
                    : "text-gray-900"
            }`}
          >
            {isFinished ? "00:00" : formatTime(timeLeft)}
          </div>

          {/* Status label */}
          {isFinished ? (
            <div className="flex items-center justify-center gap-2 text-green-700 mb-6">
              <CheckCircle2 size={18} />
              <span className="font-medium">冲刺时间到!</span>
            </div>
          ) : isRunning ? (
            <div className="text-sm text-indigo-600 mb-6 font-medium">正在冲刺中...</div>
          ) : (
            <div className="text-sm text-gray-400 mb-6">准备开始新的写作冲刺</div>
          )}

          {/* Live word count during sprint */}
          {isRunning && startingWordCount != null && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white/70 rounded-lg p-3">
                <div className="text-xs text-gray-500">当前字数</div>
                <div className="text-lg font-bold text-gray-900">
                  {currentWordCount.toLocaleString()}
                </div>
              </div>
              <div className="bg-white/70 rounded-lg p-3">
                <div className="text-xs text-gray-500">冲刺字数</div>
                <div className="text-lg font-bold text-indigo-600">{sprintWords}</div>
              </div>
              <div className="bg-white/70 rounded-lg p-3">
                <div className="text-xs text-gray-500">WPM</div>
                <div className="text-lg font-bold text-indigo-600">{sprintWPM}</div>
              </div>
            </div>
          )}

          {/* Control buttons */}
          {!showWordInput ? (
            <div className="flex items-center justify-center gap-3">
              {!isRunning && !isFinished && (
                <button
                  onClick={handleStartSprint}
                  className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-base font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Play size={18} />
                  开始新的冲刺
                </button>
              )}

              {isRunning && (
                <button
                  onClick={pauseTimer}
                  className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-lg text-base font-medium hover:bg-amber-600 transition-colors shadow-sm"
                >
                  <Pause size={18} />
                  暂停
                </button>
              )}

              {(isRunning || isFinished) && (
                <button
                  onClick={resetTimer}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-600 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <RotateCcw size={16} />
                  重置
                </button>
              )}

              {isFinished && startingWordCount != null && (
                <button
                  onClick={handleSprintComplete}
                  className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-lg text-base font-medium hover:bg-green-700 transition-colors shadow-sm"
                >
                  <CheckCircle2 size={18} />
                  完成冲刺并记录
                </button>
              )}
            </div>
          ) : (
            /* Word count input before sprint starts */
            <div className="max-w-xs mx-auto">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <PenLine size={14} className="inline mr-1" />
                当前总字数
              </label>
              <p className="text-xs text-gray-400 mb-2">
                输入你目前的总字数，冲刺结束后将自动计算本次写作量和WPM。
              </p>
              <input
                type="number"
                value={currentWordCount || ""}
                onChange={(e) => setCurrentWordCount(parseInt(e.target.value) || 0)}
                placeholder="如: 12000"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-center text-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSetWordCount();
                }}
              />
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => setShowWordInput(false)}
                  className="flex-1 px-4 py-2 text-sm text-gray-500 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSetWordCount}
                  disabled={currentWordCount <= 0}
                  className={`flex-1 px-4 py-2 text-sm rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
                    currentWordCount > 0
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  <Play size={14} />
                  开始冲刺
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-xl font-bold text-gray-900">{totalSprints}</div>
            <div className="text-xs text-gray-500 mt-1">总冲刺次数</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-xl font-bold text-gray-900">{totalWords.toLocaleString()}</div>
            <div className="text-xs text-gray-500 mt-1">累计冲刺字数</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <div className="text-xl font-bold text-gray-900">
              {bestWPM > 0 ? bestWPM.toFixed(1) : "-"}
            </div>
            <div className="text-xs text-gray-500 mt-1">最佳WPM</div>
          </div>
        </div>

        {/* Sprint history */}
        {showHistory && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <History size={14} className="text-indigo-600" />
                冲刺历史
              </h3>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors flex items-center gap-1"
                >
                  <Trash2 size={12} />
                  清空记录
                </button>
              )}
            </div>
            <SprintHistoryTable records={history} onDelete={handleDeleteRecord} />
          </div>
        )}
      </div>
    </div>
  );
}
