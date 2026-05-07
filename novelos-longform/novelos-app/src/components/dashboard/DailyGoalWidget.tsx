import { useEffect, useState, useCallback } from "react";
import { useProjectStore } from "../../stores";
import { useWritingStats } from "../../hooks/useWritingStats";
import { Target, Edit3, Clock, Flame, Check, X } from "lucide-react";

const STORAGE_KEY_PREFIX = "novelos_daily_goal";

function loadGoal(projectId: string): number {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}_${projectId}`);
    if (raw) {
      const val = parseInt(raw, 10);
      return val > 0 ? val : 0;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function saveGoal(projectId: string, goal: number) {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}_${projectId}`, String(goal));
  } catch {
    /* ignore */
  }
}

function formatTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getMotivationalMessage(progress: number): { text: string; emoji: string; color: string } {
  if (progress >= 100) {
    return { text: "目标达成，太厉害了!", emoji: "trophy", color: "text-amber-600" };
  } else if (progress >= 80) {
    return { text: "加油冲刺!", emoji: "flame", color: "text-orange-500" };
  } else if (progress >= 50) {
    return { text: "坚持就是胜利!", emoji: "thumbs-up", color: "text-blue-600" };
  } else if (progress > 0) {
    return { text: "好的开始是成功的一半", emoji: "seedling", color: "text-green-600" };
  }
  return { text: "开始今天的写作吧", emoji: "pencil", color: "text-gray-400" };
}

// ─── Component ───

export function DailyGoalWidget() {
  const { project } = useProjectStore();
  const projectId = project?.id || "";

  const { todayWords, todayMinutes, sessionActive } = useWritingStats(projectId);

  const [goal, setGoal] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draftGoal, setDraftGoal] = useState("");
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [timerStartTime, setTimerStartTime] = useState<number | null>(null);

  // Load goal from localStorage
  useEffect(() => {
    if (projectId) {
      setGoal(loadGoal(projectId));
    }
  }, [projectId]);

  // Session timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (sessionActive) {
      // Use a local timer to display elapsed seconds
      const start = Date.now();
      setTimerStartTime(start);

      interval = setInterval(() => {
        setSessionSeconds(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      setTimerStartTime(null);
      setSessionSeconds(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [sessionActive]);

  const handleSetGoal = useCallback(() => {
    const val = parseInt(draftGoal, 10);
    if (val > 0) {
      setGoal(val);
      if (projectId) {
        saveGoal(projectId, val);
      }
    }
    setEditing(false);
    setDraftGoal("");
  }, [draftGoal, projectId]);

  const handleStartEdit = () => {
    setDraftGoal(goal > 0 ? String(goal) : "2000");
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
    setDraftGoal("");
  };

  const progress = goal > 0 ? Math.min(100, Math.round((todayWords / goal) * 100)) : 0;
  const msg = getMotivationalMessage(progress);
  const displaySeconds = sessionActive ? sessionSeconds : todayMinutes * 60;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
          <Target size={14} className="text-indigo-600" />
          每日写作目标
        </h3>

        {/* Goal setter */}
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={draftGoal}
              onChange={(e) => setDraftGoal(e.target.value)}
              className="w-20 px-2 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
              placeholder="字数"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSetGoal();
                if (e.key === "Escape") handleCancelEdit();
              }}
            />
            <button
              onClick={handleSetGoal}
              className="p-1 text-green-600 hover:bg-green-50 rounded"
            >
              <Check size={14} />
            </button>
            <button
              onClick={handleCancelEdit}
              className="p-1 text-gray-400 hover:bg-gray-100 rounded"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartEdit}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600 transition-colors"
          >
            {goal > 0 ? (
              <>
                目标: {goal.toLocaleString()}字
                <Edit3 size={10} />
              </>
            ) : (
              <>
                设定目标
                <Edit3 size={10} />
              </>
            )}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {goal > 0 ? (
        <>
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>今日已写: {todayWords.toLocaleString()}字</span>
              <span>
                目标: {goal.toLocaleString()}字 ({progress}%)
              </span>
            </div>
            <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progress >= 100
                    ? "bg-gradient-to-r from-green-500 to-emerald-500"
                    : progress >= 80
                      ? "bg-gradient-to-r from-amber-500 to-orange-500"
                      : progress >= 50
                        ? "bg-gradient-to-r from-blue-500 to-indigo-500"
                        : "bg-gradient-to-r from-indigo-400 to-purple-400"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Session timer */}
          {sessionActive && (
            <div className="flex items-center gap-2 mb-2 text-xs">
              <Clock size={12} className="text-green-500" />
              <span className="text-green-600 font-medium">
                写作中: {formatTime(displaySeconds)}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>
          )}

          {/* Motivational message */}
          <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-gray-100">
            {progress >= 80 ? (
              <Flame size={14} className="text-orange-500" />
            ) : (
              <Target size={14} className={msg.color} />
            )}
            <span className={`text-xs font-medium ${msg.color}`}>{msg.text}</span>
          </div>
        </>
      ) : (
        /* No goal set state */
        <div className="text-center py-4">
          <div className="text-xs text-gray-400 mb-2">
            {todayWords > 0
              ? `今日已写: ${todayWords.toLocaleString()}字`
              : "设定每日写作目标以追踪进度"}
          </div>
          {sessionActive && (
            <div className="flex items-center justify-center gap-2 mb-2 text-xs">
              <Clock size={12} className="text-green-500" />
              <span className="text-green-600 font-medium">
                写作中: {formatTime(displaySeconds)}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            </div>
          )}
          {!goal && !sessionActive && (
            <button
              onClick={handleStartEdit}
              className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
            >
              设定每日字数目标
            </button>
          )}
        </div>
      )}
    </div>
  );
}
