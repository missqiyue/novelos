import { useEffect, useState, useMemo, useCallback } from "react";
import { useProjectStore, useChapterStore } from "../../stores";
import {
  Target,
  Calendar,
  TrendingUp,
  Edit3,
  Check,
  X,
  Loader2,
  Trophy,
  Clock,
  BookOpen,
  AlertCircle,
} from "lucide-react";

// ─── localStorage helpers ───

interface SessionData {
  date: string;
  startTime: number;
  totalSeconds: number;
  startWords: number;
  endWords: number;
}

const SESSION_STORAGE_KEY = "novelos_writing_stats";
const GOAL_DAILY_KEY = "novelos_goal_daily";
const GOAL_WEEKLY_KEY = "novelos_goal_weekly";
const GOAL_MONTHLY_KEY = "novelos_goal_monthly";
const GOAL_COMPLETION_KEY = "novelos_goal_completion";

function loadSessions(projectId: string): SessionData[] {
  try {
    const raw = localStorage.getItem(`${SESSION_STORAGE_KEY}_${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadGoal(key: string, projectId: string): number {
  try {
    const raw = localStorage.getItem(`${key}_${projectId}`);
    if (raw) {
      const val = parseInt(raw, 10);
      return val > 0 ? val : 0;
    }
  } catch {
    /* ignore */
  }
  return 0;
}

function saveGoal(key: string, projectId: string, value: number) {
  try {
    localStorage.setItem(`${key}_${projectId}`, String(value));
  } catch {
    /* ignore */
  }
}

function loadCompletionDate(projectId: string): string {
  try {
    return localStorage.getItem(`${GOAL_COMPLETION_KEY}_${projectId}`) || "";
  } catch {
    return "";
  }
}

function saveCompletionDate(projectId: string, date: string) {
  try {
    localStorage.setItem(`${GOAL_COMPLETION_KEY}_${projectId}`, date);
  } catch {
    /* ignore */
  }
}

// ─── helpers ───

function getTodayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── ProgressCircle sub-component ───

function ProgressCircle({
  progress,
  size,
  strokeWidth,
  children,
}: {
  progress: number; // 0-100
  size: number;
  strokeWidth: number;
  children: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progress >= 100 ? "#22c55e" : progress >= 50 ? "#6366f1" : "#f59e0b"}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

// ─── Goal editor sub-component ───

function GoalEditor({
  label,
  goal,
  onSave,
  placeholder,
}: {
  label: string;
  goal: number;
  onSave: (val: number) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const handleStartEdit = () => {
    setDraft(goal > 0 ? String(goal) : "");
    setEditing(true);
  };

  const handleSave = () => {
    const val = parseInt(draft, 10);
    if (val > 0) {
      onSave(val);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft("");
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-24 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
        />
        <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-50 rounded">
          <Check size={14} />
        </button>
        <button onClick={handleCancel} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleStartEdit}
      className="flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
    >
      {goal > 0 ? `${label}: ${goal.toLocaleString()}字` : `设定${label}`}
      <Edit3 size={12} />
    </button>
  );
}

// ─── Main Component ───

export function GoalsTrackerPage() {
  const { project } = useProjectStore();
  const { chapters, fetchChapters, loading } = useChapterStore();
  const projectId = project?.id || "";

  // ─── Goals state ───
  const [dailyGoal, setDailyGoal] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState(0);
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [completionDate, setCompletionDate] = useState("");

  // ─── Load goals from localStorage ───
  useEffect(() => {
    if (!projectId) return;
    setDailyGoal(loadGoal(GOAL_DAILY_KEY, projectId));
    setWeeklyGoal(loadGoal(GOAL_WEEKLY_KEY, projectId));
    setMonthlyGoal(loadGoal(GOAL_MONTHLY_KEY, projectId));
    setCompletionDate(loadCompletionDate(projectId));
  }, [projectId]);

  // ─── Fetch chapter data ───
  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  // ─── Derive progress from sessions and chapters ───
  const progress = useMemo(() => {
    if (!projectId) {
      return {
        todayWords: 0,
        weekWords: 0,
        monthWords: 0,
        totalWords: 0,
        todayPct: 0,
        weekPct: 0,
        monthPct: 0,
        todayStatus: "idle" as "done" | "active" | "behind" | "idle",
        weekStatus: "idle" as "done" | "active" | "behind" | "idle",
        monthStatus: "idle" as "done" | "active" | "behind" | "idle",
        estimatedCompletion: "",
        avgDailyWords: 0,
        dailyGoalStatus: "idle" as "done" | "active" | "behind" | "idle",
      };
    }

    const sessions = loadSessions(projectId);
    const today = getTodayStr();
    const weekStart = getWeekStart(new Date()).toISOString().split("T")[0];
    const monthStart = getMonthStart(new Date()).toISOString().split("T")[0];
    const now = new Date();

    // Aggregate daily word counts from sessions
    const dailyWords: Record<string, number> = {};
    sessions.forEach((s) => {
      const words = Math.max(0, s.endWords - s.startWords);
      dailyWords[s.date] = (dailyWords[s.date] || 0) + words;
    });

    const todayWords = dailyWords[today] || 0;

    // Week words
    let weekWords = 0;
    for (const [date, words] of Object.entries(dailyWords)) {
      if (date >= weekStart && date <= today) {
        weekWords += words;
      }
    }

    // Month words
    let monthWords = 0;
    for (const [date, words] of Object.entries(dailyWords)) {
      if (date >= monthStart && date <= today) {
        monthWords += words;
      }
    }

    const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);

    const todayPct = dailyGoal > 0 ? Math.min(100, Math.round((todayWords / dailyGoal) * 100)) : 0;
    const weekPct = weeklyGoal > 0 ? Math.min(100, Math.round((weekWords / weeklyGoal) * 100)) : 0;
    const monthPct =
      monthlyGoal > 0 ? Math.min(100, Math.round((monthWords / monthlyGoal) * 100)) : 0;

    // Status computation based on pace
    function goalStatus(
      current: number,
      target: number,
      periodElapsedRatio: number,
    ): "done" | "active" | "behind" | "idle" {
      if (target <= 0) return "idle";
      if (current >= target) return "done";
      const expectedPace = target * periodElapsedRatio;
      if (current >= expectedPace * 0.8) return "active";
      return "behind";
    }

    // Day elapsed ratio
    const hourRatio = now.getHours() / 24;
    const dayOfWeek = now.getDay();
    const weekdayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday=0
    const weekElapsedRatio = (weekdayIndex + hourRatio / 24) / 7;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthElapsedRatio = (now.getDate() - 1 + hourRatio / 24) / daysInMonth;

    const todayStatus = goalStatus(todayWords, dailyGoal, hourRatio);
    const weekStatus = goalStatus(weekWords, weeklyGoal, Math.min(1, weekElapsedRatio));
    const monthStatus = goalStatus(monthWords, monthlyGoal, Math.min(1, monthElapsedRatio));

    // Estimate completion
    let estimatedCompletion = "";
    const totalTarget = project?.target_words || 0;
    if (totalTarget > 0 && totalWords < totalTarget) {
      // Calculate average daily words from all sessions
      const allDays = Object.keys(dailyWords).sort();
      if (allDays.length >= 3) {
        const firstDate = new Date(allDays[0]);
        const lastDate = new Date(allDays[allDays.length - 1]);
        const totalDays = Math.max(1, daysBetween(firstDate, lastDate) + 1);
        const totalSessionWords = Object.values(dailyWords).reduce((sum, w) => sum + w, 0);
        const avgDailyWords = totalSessionWords / totalDays;
        if (avgDailyWords > 0) {
          const remaining = totalTarget - totalWords;
          const daysNeeded = Math.ceil(remaining / avgDailyWords);
          const completionDate = new Date(now);
          completionDate.setDate(completionDate.getDate() + daysNeeded);
          estimatedCompletion = `${completionDate.getFullYear()}-${String(completionDate.getMonth() + 1).padStart(2, "0")}-${String(completionDate.getDate()).padStart(2, "0")}`;
        }
      }
    }

    // Average daily words for display
    const allSessionDays = Object.keys(dailyWords).sort();
    let avgDailyWords = 0;
    if (allSessionDays.length >= 2) {
      const firstDate = new Date(allSessionDays[0]);
      const lastDate = new Date(allSessionDays[allSessionDays.length - 1]);
      const totalDays = Math.max(1, daysBetween(firstDate, lastDate) + 1);
      const totalSessionWords = Object.values(dailyWords).reduce((sum, w) => sum + w, 0);
      avgDailyWords = Math.round(totalSessionWords / totalDays);
    }

    return {
      todayWords,
      weekWords,
      monthWords,
      totalWords,
      todayPct,
      weekPct,
      monthPct,
      todayStatus,
      weekStatus,
      monthStatus,
      estimatedCompletion,
      avgDailyWords,
      dailyGoalStatus: todayStatus,
    };
  }, [projectId, chapters, dailyGoal, weeklyGoal, monthlyGoal, project]);

  // ─── Save handlers ───
  const handleSaveDaily = useCallback(
    (val: number) => {
      setDailyGoal(val);
      if (projectId) saveGoal(GOAL_DAILY_KEY, projectId, val);
    },
    [projectId],
  );

  const handleSaveWeekly = useCallback(
    (val: number) => {
      setWeeklyGoal(val);
      if (projectId) saveGoal(GOAL_WEEKLY_KEY, projectId, val);
    },
    [projectId],
  );

  const handleSaveMonthly = useCallback(
    (val: number) => {
      setMonthlyGoal(val);
      if (projectId) saveGoal(GOAL_MONTHLY_KEY, projectId, val);
    },
    [projectId],
  );

  const handleSaveCompletionDate = useCallback(
    (date: string) => {
      setCompletionDate(date);
      if (projectId) saveCompletionDate(projectId, date);
    },
    [projectId],
  );

  // ─── Status display helpers ───
  function statusLabel(status: "done" | "active" | "behind" | "idle"): string {
    switch (status) {
      case "done":
        return "已完成!";
      case "active":
        return "进行中";
      case "behind":
        return "落后";
      case "idle":
        return "未设置";
    }
  }

  function statusColor(status: "done" | "active" | "behind" | "idle"): string {
    switch (status) {
      case "done":
        return "text-green-600 bg-green-50";
      case "active":
        return "text-yellow-600 bg-yellow-50";
      case "behind":
        return "text-red-600 bg-red-50";
      case "idle":
        return "text-gray-400 bg-gray-50";
    }
  }

  // ─── Loading / Empty states ───
  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <AlertCircle size={24} className="mr-2" />
        未加载项目
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">写作目标追踪</h1>
          <p className="text-sm text-gray-500 mt-1">设定并追踪每日、每周、每月的写作目标</p>
        </div>

        {loading && chapters.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Today's Goal - Large Circle */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex flex-col lg:flex-row items-center gap-6">
                {/* Large progress circle */}
                <div className="flex-shrink-0">
                  <ProgressCircle progress={progress.todayPct} size={160} strokeWidth={12}>
                    {dailyGoal > 0 ? (
                      <>
                        <span className="text-3xl font-bold text-gray-900">
                          {progress.todayPct}%
                        </span>
                        <span className="text-xs text-gray-500 mt-1">今日进度</span>
                      </>
                    ) : (
                      <>
                        <Target size={28} className="text-gray-300" />
                        <span className="text-xs text-gray-400 mt-1">设定目标</span>
                      </>
                    )}
                  </ProgressCircle>
                </div>

                {/* Details */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Target size={20} className="text-indigo-600" />
                      今天的目标
                    </h2>
                    <GoalEditor
                      label="每日目标"
                      goal={dailyGoal}
                      onSave={handleSaveDaily}
                      placeholder="每日字数"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-gray-500">今日已写</div>
                      <div className="text-xl font-bold text-gray-900">
                        {progress.todayWords.toLocaleString()}
                        <span className="text-sm text-gray-400 font-normal"> 字</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">每日目标</div>
                      <div className="text-xl font-bold text-gray-900">
                        {dailyGoal > 0 ? dailyGoal.toLocaleString() : "--"}
                        {dailyGoal > 0 && (
                          <span className="text-sm text-gray-400 font-normal"> 字</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">状态</div>
                      <span
                        className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-sm font-medium ${statusColor(progress.dailyGoalStatus)}`}
                      >
                        {statusLabel(progress.dailyGoalStatus)}
                      </span>
                    </div>
                  </div>

                  {/* Mini today progress bar */}
                  {dailyGoal > 0 && (
                    <div>
                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            progress.todayPct >= 100
                              ? "bg-gradient-to-r from-green-500 to-emerald-500"
                              : "bg-gradient-to-r from-indigo-500 to-purple-500"
                          }`}
                          style={{ width: `${progress.todayPct}%` }}
                        />
                      </div>
                      {progress.todayPct >= 100 && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <Trophy size={12} />
                          今日目标已达成，太棒了!
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Weekly & Monthly Goals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Weekly Goal */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <Calendar size={16} className="text-blue-600" />
                    本周目标
                  </h3>
                  <GoalEditor
                    label="每周目标"
                    goal={weeklyGoal}
                    onSave={handleSaveWeekly}
                    placeholder="每周字数"
                  />
                </div>

                {weeklyGoal > 0 ? (
                  <>
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <div className="text-2xl font-bold text-gray-900">
                          {progress.weekWords.toLocaleString()}
                          <span className="text-sm text-gray-400 font-normal">
                            {" "}
                            / {weeklyGoal.toLocaleString()} 字
                          </span>
                        </div>
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(progress.weekStatus)}`}
                        >
                          {statusLabel(progress.weekStatus)}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{progress.weekPct}%</div>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress.weekPct >= 100
                            ? "bg-gradient-to-r from-green-500 to-emerald-500"
                            : progress.weekStatus === "behind"
                              ? "bg-gradient-to-r from-red-400 to-red-500"
                              : "bg-gradient-to-r from-blue-500 to-indigo-500"
                        }`}
                        style={{ width: `${progress.weekPct}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 py-4 text-center">
                    设定每周写作目标以追踪进度
                  </div>
                )}
              </div>

              {/* Monthly Goal */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium text-gray-900 flex items-center gap-2">
                    <Calendar size={16} className="text-purple-600" />
                    本月目标
                  </h3>
                  <GoalEditor
                    label="每月目标"
                    goal={monthlyGoal}
                    onSave={handleSaveMonthly}
                    placeholder="每月字数"
                  />
                </div>

                {monthlyGoal > 0 ? (
                  <>
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <div className="text-2xl font-bold text-gray-900">
                          {progress.monthWords.toLocaleString()}
                          <span className="text-sm text-gray-400 font-normal">
                            {" "}
                            / {monthlyGoal.toLocaleString()} 字
                          </span>
                        </div>
                        <span
                          className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(progress.monthStatus)}`}
                        >
                          {statusLabel(progress.monthStatus)}
                        </span>
                      </div>
                      <div className="text-2xl font-bold text-gray-900">{progress.monthPct}%</div>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress.monthPct >= 100
                            ? "bg-gradient-to-r from-green-500 to-emerald-500"
                            : progress.monthStatus === "behind"
                              ? "bg-gradient-to-r from-red-400 to-red-500"
                              : "bg-gradient-to-r from-purple-500 to-indigo-500"
                        }`}
                        style={{ width: `${progress.monthPct}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-400 py-4 text-center">
                    设定每月写作目标以追踪进度
                  </div>
                )}
              </div>
            </div>

            {/* Project Completion & Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Project Completion Goal */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-4">
                  <Trophy size={16} className="text-amber-600" />
                  项目完成目标
                </h3>

                {/* Target date input */}
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-1">目标完成日期</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={completionDate}
                      onChange={(e) => handleSaveCompletionDate(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Current progress towards project total */}
                {project?.target_words && project.target_words > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-500">总进度</span>
                      <span className="text-gray-700 font-medium">
                        {progress.totalWords.toLocaleString()} /{" "}
                        {project.target_words.toLocaleString()} 字
                      </span>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((progress.totalWords / project.target_words) * 100))}%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>
                        {Math.round((progress.totalWords / project.target_words) * 100)}% 完成
                      </span>
                      {progress.avgDailyWords > 0 && (
                        <span>日均 {progress.avgDailyWords.toLocaleString()} 字</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Estimated completion */}
                {progress.estimatedCompletion && (
                  <div className="mt-4 p-3 bg-indigo-50 rounded-lg flex items-center gap-2">
                    <Clock size={16} className="text-indigo-600" />
                    <div>
                      <div className="text-xs text-indigo-700 font-medium">预计完成日期</div>
                      <div className="text-sm text-indigo-900">{progress.estimatedCompletion}</div>
                    </div>
                  </div>
                )}

                {completionDate && project?.target_words && project.target_words > 0 && (
                  <div className="mt-3 text-xs text-gray-500">
                    剩余 {(project.target_words - progress.totalWords).toLocaleString()} 字
                    {(() => {
                      const remaining = project.target_words - progress.totalWords;
                      const daysLeft = daysBetween(
                        new Date(),
                        new Date(completionDate + "T00:00:00"),
                      );
                      if (daysLeft > 0 && remaining > 0) {
                        const neededPerDay = Math.ceil(remaining / daysLeft);
                        return (
                          <span
                            className={
                              neededPerDay > (dailyGoal || 500)
                                ? " text-red-500"
                                : " text-green-600"
                            }
                          >
                            {" "}
                            -- 需要每天 {neededPerDay.toLocaleString()} 字
                            {neededPerDay > (dailyGoal || 500) ? " (高于日目标!)" : ""}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>

              {/* Summary Stats */}
              <div className="bg-white rounded-lg border border-gray-200 p-5">
                <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-indigo-600" />
                  写作概览
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">总字数</div>
                    <div className="text-xl font-bold text-gray-900">
                      {progress.totalWords.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">章节数</div>
                    <div className="text-xl font-bold text-gray-900">{chapters.length}</div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">日均字数</div>
                    <div className="text-xl font-bold text-gray-900">
                      {progress.avgDailyWords > 0 ? progress.avgDailyWords.toLocaleString() : "--"}
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-xs text-gray-500">今日已写</div>
                    <div className="text-xl font-bold text-gray-900">
                      {progress.todayWords.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Project goal card */}
                {project?.target_words && (
                  <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <BookOpen size={14} className="text-indigo-600" />
                      <span className="text-xs text-indigo-700">
                        目标总字数: {project.target_words.toLocaleString()} 字
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
