import { useEffect, useMemo, useState } from "react";
import { useProjectStore, useChapterStore } from "../../stores";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  FileText,
  Clock,
  Loader2,
  AlertCircle,
  Target,
  BookOpen,
  X,
} from "lucide-react";

// ─── Session data interface ───

interface SessionData {
  date: string;
  startTime: number;
  totalSeconds: number;
  startWords: number;
  endWords: number;
}

const SESSION_STORAGE_KEY = "novelos_writing_stats";

function loadSessions(projectId: string): SessionData[] {
  try {
    const raw = localStorage.getItem(`${SESSION_STORAGE_KEY}_${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Types ───

interface DayData {
  dateStr: string; // "YYYY-MM-DD"
  dayOfMonth: number;
  isCurrentMonth: boolean;
  wordCount: number;
  sessionCount: number;
  metGoal: boolean; // green dot
  wrote: boolean; // gray dot
  chaptersWorkedOn: string[]; // chapter IDs via session data (we approximate)
}

interface DayDetail {
  dateStr: string;
  wordCount: number;
  sessionCount: number;
  totalMinutes: number;
  chapters: { number: number; title: string | null }[];
}

// ─── Constants ───

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const MONTH_NAMES = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

// ─── helpers ───

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday=0
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}分钟`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
}

// ─── Component ───

export function ContentCalendarPage() {
  const { project } = useProjectStore();
  const { chapters, fetchChapters, loading } = useChapterStore();
  const projectId = project?.id || "";

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);

  // Load daily goal for green dot
  const [dailyGoal, setDailyGoal] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    try {
      const raw = localStorage.getItem(`novelos_goal_daily_${projectId}`);
      if (raw) {
        const val = parseInt(raw, 10);
        if (val > 0) setDailyGoal(val);
      }
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  // ─── Build calendar grid ───

  const { days, monthStats } = useMemo(() => {
    if (!projectId) {
      return { days: [] as DayData[], monthStats: { totalWords: 0, writingDays: 0, avgPerDay: 0 } };
    }

    const sessions = loadSessions(projectId);

    // Aggregate per day from sessions
    const dailyMap: Record<string, { words: number; sessions: number; minutes: number }> = {};
    sessions.forEach((s) => {
      const words = Math.max(0, s.endWords - s.startWords);
      if (!dailyMap[s.date]) {
        dailyMap[s.date] = { words: 0, sessions: 0, minutes: 0 };
      }
      dailyMap[s.date].words += words;
      dailyMap[s.date].sessions += 1;
      dailyMap[s.date].minutes += Math.round(s.totalSeconds / 60);
    });

    // Build chapter lookup by date (approximate from updated_at / created_at)
    // We'll associate chapters with dates they were worked on via their timestamps
    const chapterDates: Record<string, { number: number; title: string | null }[]> = {};
    chapters.forEach((ch) => {
      // Use updated_at as proxy for when writing happened
      const dateStr = ch.updated_at ? ch.updated_at.split("T")[0] : ch.created_at.split("T")[0];
      if (!chapterDates[dateStr]) chapterDates[dateStr] = [];
      chapterDates[dateStr].push({ number: ch.chapter_number, title: ch.title });
    });

    // Build calendar cells
    const numDays = daysInMonth(viewYear, viewMonth);
    const startDay = firstDayOfWeek(viewYear, viewMonth);

    const cells: DayData[] = [];

    // Previous month fillers
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    const prevDays = daysInMonth(prevYear, prevMonth);
    for (let i = startDay - 1; i >= 0; i--) {
      const d = prevDays - i;
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const info = dailyMap[dateStr];
      cells.push({
        dateStr,
        dayOfMonth: d,
        isCurrentMonth: false,
        wordCount: info?.words || 0,
        sessionCount: info?.sessions || 0,
        metGoal: info ? info.words >= dailyGoal : false,
        wrote: !!info,
        chaptersWorkedOn: [],
      });
    }

    // Current month
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const info = dailyMap[dateStr];
      cells.push({
        dateStr,
        dayOfMonth: d,
        isCurrentMonth: true,
        wordCount: info?.words || 0,
        sessionCount: info?.sessions || 0,
        metGoal: info ? (dailyGoal > 0 ? info.words >= dailyGoal : info.words > 0) : false,
        wrote: !!info,
        chaptersWorkedOn: [],
      });
    }

    // Next month fillers (fill remaining grid cells)
    const totalCells = cells.length;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;
    for (let d = 1; d <= remaining; d++) {
      const dateStr = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const info = dailyMap[dateStr];
      cells.push({
        dateStr,
        dayOfMonth: d,
        isCurrentMonth: false,
        wordCount: info?.words || 0,
        sessionCount: info?.sessions || 0,
        metGoal: info ? info.words >= dailyGoal : false,
        wrote: !!info,
        chaptersWorkedOn: [],
      });
    }

    // Monthly stats
    const monthCells = cells.filter((c) => c.isCurrentMonth);
    const totalWords = monthCells.reduce((sum, c) => sum + c.wordCount, 0);
    const writingDays = monthCells.filter((c) => c.wrote).length;
    const avgPerDay = writingDays > 0 ? Math.round(totalWords / writingDays) : 0;

    return {
      days: cells,
      monthStats: { totalWords, writingDays, avgPerDay },
    };
  }, [projectId, viewYear, viewMonth, chapters, dailyGoal]);

  // ─── Day detail computation ───

  function getDayDetail(dateStr: string): DayDetail {
    if (!projectId) {
      return { dateStr, wordCount: 0, sessionCount: 0, totalMinutes: 0, chapters: [] };
    }

    const sessions = loadSessions(projectId);
    const daySessions = sessions.filter((s) => s.date === dateStr);
    const wordCount = daySessions.reduce(
      (sum, s) => sum + Math.max(0, s.endWords - s.startWords),
      0,
    );
    const totalMinutes = Math.round(daySessions.reduce((sum, s) => sum + s.totalSeconds, 0) / 60);

    // Find chapters worked on that day
    const dayChapters = chapters.filter((ch) => {
      const updateDate = ch.updated_at ? ch.updated_at.split("T")[0] : "";
      const createDate = ch.created_at.split("T")[0];
      return updateDate === dateStr || createDate === dateStr;
    });

    return {
      dateStr,
      wordCount,
      sessionCount: daySessions.length,
      totalMinutes,
      chapters: dayChapters.map((ch) => ({
        number: ch.chapter_number,
        title: ch.title,
      })),
    };
  }

  // ─── Navigation ───

  function goToPrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
    setSelectedDay(null);
  }

  function goToNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
    setSelectedDay(null);
  }

  function goToToday() {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDay(null);
  }

  // ─── Day click ───
  function handleDayClick(day: DayData) {
    if (!day.wrote && day.wordCount === 0) {
      setSelectedDay(null);
      return;
    }
    setSelectedDay(getDayDetail(day.dateStr));
  }

  // ─── Render states ───

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <AlertCircle size={24} className="mr-2" />
        未加载项目
      </div>
    );
  }

  // ─── Day cell color ───
  function getDayDotClass(day: DayData): string {
    if (day.metGoal) return "bg-green-500";
    if (day.wrote) return "bg-gray-400";
    return "";
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">内容日历</h1>
          <p className="text-sm text-gray-500 mt-1">查看每日写作活动和章节产出</p>
        </div>

        {loading && chapters.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar panel */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={goToPrevMonth}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900">
                      {viewYear}年 {MONTH_NAMES[viewMonth]}
                    </h2>
                    <button
                      onClick={goToToday}
                      className="text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
                    >
                      今天
                    </button>
                  </div>
                  <button
                    onClick={goToNextMonth}
                    className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-600"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 mb-1">
                  {WEEKDAYS.map((wd) => (
                    <div key={wd} className="text-center text-xs font-medium text-gray-500 py-1">
                      {wd}
                    </div>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day, idx) => {
                    const isToday = day.dateStr === formatDate(new Date());

                    return (
                      <button
                        key={idx}
                        onClick={() => handleDayClick(day)}
                        className={`relative aspect-square rounded-lg border flex flex-col items-center justify-center transition-colors text-sm ${
                          isToday
                            ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                            : day.isCurrentMonth
                              ? "border-gray-200 bg-white hover:bg-gray-50"
                              : "border-gray-100 bg-gray-50/50 text-gray-300"
                        } ${selectedDay?.dateStr === day.dateStr ? "ring-2 ring-indigo-500" : ""}`}
                      >
                        <span
                          className={`text-xs font-medium ${
                            day.isCurrentMonth ? "text-gray-700" : "text-gray-300"
                          } ${isToday ? "text-indigo-700" : ""}`}
                        >
                          {day.dayOfMonth}
                        </span>
                        {day.wrote && (
                          <>
                            {/* Colored dot */}
                            <div
                              className={`w-1.5 h-1.5 rounded-full mt-0.5 ${getDayDotClass(day)}`}
                            />
                            {/* Word count (small) */}
                            {day.wordCount > 0 && (
                              <span className="text-[9px] text-gray-400 mt-0.5 leading-none">
                                {day.wordCount >= 1000
                                  ? `${(day.wordCount / 1000).toFixed(1)}k`
                                  : day.wordCount}
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span>达成日目标</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-gray-400" />
                    <span>有写作活动</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded-full bg-gray-200" />
                    <span>无写作</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar: Day details / Monthly summary */}
            <div className="space-y-4">
              {/* Selected day detail */}
              {selectedDay ? (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900 flex items-center gap-2">
                      <Calendar size={16} className="text-indigo-600" />
                      {selectedDay.dateStr}
                    </h3>
                    <button
                      onClick={() => setSelectedDay(null)}
                      className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gray-50 rounded-lg p-2">
                        <div className="text-xs text-gray-500">总字数</div>
                        <div className="text-lg font-bold text-gray-900">
                          {selectedDay.wordCount.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2">
                        <div className="text-xs text-gray-500">写作时长</div>
                        <div className="text-lg font-bold text-gray-900">
                          {formatMinutes(selectedDay.totalMinutes)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-gray-500 mb-1">
                        写作段落: {selectedDay.sessionCount} 个
                      </div>
                    </div>

                    {/* Chapters worked on */}
                    {selectedDay.chapters.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <BookOpen size={12} />
                          涉及章节
                        </div>
                        <div className="space-y-1">
                          {selectedDay.chapters.map((ch) => (
                            <div
                              key={ch.number}
                              className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded px-2 py-1"
                            >
                              <FileText size={12} className="text-gray-400" />
                              <span>第{ch.number}章</span>
                              {ch.title && <span className="text-gray-400">- {ch.title}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedDay.chapters.length === 0 && selectedDay.wordCount > 0 && (
                      <p className="text-xs text-gray-400">无章节更新记录</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="text-sm text-gray-400 text-center py-8">点击日历中的日期查看详情</p>
                </div>
              )}

              {/* Monthly summary */}
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="font-medium text-gray-900 flex items-center gap-2 mb-3">
                  <Target size={16} className="text-indigo-600" />
                  {viewYear}年 {MONTH_NAMES[viewMonth]} 总结
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-gray-900">
                      {monthStats.totalWords.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">总字数</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-gray-900">{monthStats.writingDays}</div>
                    <div className="text-xs text-gray-500">写作天数</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-gray-900">
                      {monthStats.avgPerDay.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">日均字数</div>
                  </div>
                </div>

                {/* Daily goal status for month */}
                {dailyGoal > 0 && monthStats.writingDays > 0 && (
                  <div className="mt-3 text-xs text-gray-500">
                    本月日目标达成率:{" "}
                    {(() => {
                      const sessions = loadSessions(projectId);
                      const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-01`;
                      const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(daysInMonth(viewYear, viewMonth)).padStart(2, "0")}`;
                      const dailyMap: Record<string, number> = {};
                      sessions.forEach((s) => {
                        if (s.date >= monthStart && s.date <= monthEnd) {
                          dailyMap[s.date] =
                            (dailyMap[s.date] || 0) + Math.max(0, s.endWords - s.startWords);
                        }
                      });
                      const daysMetGoal = Object.values(dailyMap).filter(
                        (w) => w >= dailyGoal,
                      ).length;
                      return `${daysMetGoal}/${monthStats.writingDays} 天`;
                    })()}
                  </div>
                )}
              </div>

              {/* Writing tips */}
              <div className="bg-indigo-50 rounded-lg border border-indigo-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock size={14} className="text-indigo-600" />
                  <span className="text-xs font-medium text-indigo-700">写作建议</span>
                </div>
                <p className="text-xs text-indigo-600 leading-relaxed">
                  {monthStats.writingDays >= 20
                    ? "本月写作频率很高，保持这个节奏!"
                    : monthStats.writingDays >= 10
                      ? "本月有稳定的写作习惯，继续加油!"
                      : monthStats.writingDays > 0
                        ? "尝试增加写作频率，设定每日小目标有助于养成习惯。"
                        : "本月还没有写作记录，从今天开始写下第一章吧。"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
