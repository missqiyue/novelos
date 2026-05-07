import { useMemo, useState } from "react";
import { useProjectStore } from "../../stores";
import { Flame, Calendar, TrendingUp } from "lucide-react";

// ─── Session data from localStorage ───

interface SessionData {
  date: string;
  startTime: number;
  totalSeconds: number;
  startWords: number;
  endWords: number;
}

const STORAGE_KEY = "novelos_writing_stats";

function loadSessions(projectId: string): SessionData[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${projectId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ─── Types for calendar cells ───

interface DayCell {
  date: string; // "YYYY-MM-DD"
  dayOfMonth: number;
  wordCount: number;
  level: 0 | 1 | 2 | 3 | 4; // 0=none, 1-4=intensity levels
}

// ─── Word count → level mapping ───

function wordLevel(words: number): 0 | 1 | 2 | 3 | 4 {
  if (words <= 0) return 0;
  if (words <= 500) return 1;
  if (words <= 2000) return 2;
  if (words <= 5000) return 3;
  return 4;
}

// ─── Level color mapping ───

const LEVEL_COLORS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "bg-gray-100 border-gray-200",
  1: "bg-green-200 border-green-300",
  2: "bg-green-400 border-green-500",
  3: "bg-green-600 border-green-600",
  4: "bg-green-800 border-green-800",
};

const LEVEL_LABELS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: "0 字",
  1: "1-500 字",
  2: "501-2000 字",
  3: "2001-5000 字",
  4: "5000+ 字",
};

// ─── Component ───

export function StreakCalendar() {
  const { project } = useProjectStore();
  const [tooltip, setTooltip] = useState<{
    date: string;
    wordCount: number;
    x: number;
    y: number;
  } | null>(null);

  const projectId = project?.id;

  // ─── Process session data into calendar cells ───

  const { cells, weeks, months, currentStreak, longestStreak } = useMemo(() => {
    if (!projectId) {
      return { cells: [], weeks: [], months: [], currentStreak: 0, longestStreak: 0 };
    }

    const sessions = loadSessions(projectId);

    // Aggregate word counts per day
    const dailyWords: Record<string, number> = {};
    sessions.forEach((s) => {
      const words = Math.max(0, s.endWords - s.startWords);
      dailyWords[s.date] = (dailyWords[s.date] || 0) + words;
    });

    // Build 90-day calendar grid (ending today)
    const days: DayCell[] = [];
    const today = new Date();
    const monthLabels: { label: string; weekIndex: number }[] = [];
    const seenMonths = new Set<string>();

    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const wc = dailyWords[dateStr] || 0;

      days.push({
        date: dateStr,
        dayOfMonth: d.getDate(),
        wordCount: wc,
        level: wordLevel(wc),
      });
    }

    // Group into weeks (columns in GitHub style)
    // Week starts on Sunday; arrange so the most recent week is on the right
    const dayOfWeekOffset = new Date(days[0].date).getDay(); // Sunday=0
    const totalWeeks = Math.ceil((days.length + dayOfWeekOffset) / 7);

    const weeksMatrix: (DayCell | null)[][] = [];
    for (let w = 0; w < totalWeeks; w++) {
      const week: (DayCell | null)[] = [];
      for (let d = 0; d < 7; d++) {
        const cellIndex = w * 7 + d - dayOfWeekOffset;
        if (cellIndex >= 0 && cellIndex < days.length) {
          week.push(days[cellIndex]);
          // Track month label
          const cell = days[cellIndex];
          const monthKey = cell.date.substring(0, 7); // "YYYY-MM"
          if (!seenMonths.has(monthKey)) {
            seenMonths.add(monthKey);
            const monthNames = [
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
            const monthIdx = parseInt(cell.date.substring(5, 7), 10) - 1;
            monthLabels.push({
              label: monthNames[monthIdx] || cell.date.substring(5, 7) + "月",
              weekIndex: w,
            });
          }
        } else {
          week.push(null);
        }
      }
      weeksMatrix.push(week);
    }

    // ─── Streak calculation ───

    // Current streak: consecutive days ending today with wordCount > 0
    let current = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].wordCount > 0) {
        current++;
      } else {
        break;
      }
    }

    // Longest streak
    let longest = 0;
    let streak = 0;
    for (const day of days) {
      if (day.wordCount > 0) {
        streak++;
        if (streak > longest) longest = streak;
      } else {
        streak = 0;
      }
    }

    return {
      cells: days,
      weeks: weeksMatrix,
      months: monthLabels,
      currentStreak: current,
      longestStreak: longest,
    };
  }, [projectId]);

  // ─── Empty/loading state ───

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Calendar size={24} className="mr-2" />
        未加载项目
      </div>
    );
  }

  if (cells.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <Calendar size={24} className="mr-2" />
        暂无写作数据
      </div>
    );
  }

  // ─── Render ───

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">写作连击日历</h1>
          <p className="text-sm text-gray-500 mt-0.5">最近 90 天写作记录</p>
        </div>
      </div>

      {/* Streak stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Flame size={20} className="text-orange-500" />
            <span className="text-sm text-gray-500">当前连续天数</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {currentStreak}
            <span className="text-lg text-gray-400 font-normal ml-1">天</span>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={20} className="text-indigo-500" />
            <span className="text-sm text-gray-500">最长连续天数</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {longestStreak}
            <span className="text-lg text-gray-400 font-normal ml-1">天</span>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex gap-1">
          {/* Day-of-week labels (left side) */}
          <div className="flex flex-col gap-1 mr-1 justify-start pt-5">
            {["", "一", "", "三", "", "五", ""].map((label, i) => (
              <div key={i} className="w-5 h-3.5 flex items-center">
                <span className="text-[10px] text-gray-400">{label}</span>
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex gap-1 relative">
              {weeks.map((week, wi) => {
                // Check if this week has a month label
                const monthLabel = months.find((m) => m.weekIndex === wi);

                return (
                  <div key={wi} className="flex flex-col gap-1">
                    {/* Month label */}
                    <div className="h-4 mb-0.5">
                      {monthLabel && (
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">
                          {monthLabel.label}
                        </span>
                      )}
                    </div>
                    {/* Day cells */}
                    {week.map((cell, di) => {
                      if (!cell) {
                        return <div key={di} className="w-3.5 h-3.5" />;
                      }
                      return (
                        <div
                          key={di}
                          className={`w-3.5 h-3.5 rounded-sm border cursor-pointer transition-transform hover:scale-125 hover:z-10 ${LEVEL_COLORS[cell.level]}`}
                          onMouseEnter={(e) => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setTooltip({
                              date: cell.date,
                              wordCount: cell.wordCount,
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-4 pt-3 border-t border-gray-100">
          <span className="text-[10px] text-gray-400 mr-1">少</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <div
              key={level}
              className={`w-3.5 h-3.5 rounded-sm ${LEVEL_COLORS[level]}`}
              title={LEVEL_LABELS[level]}
            />
          ))}
          <span className="text-[10px] text-gray-400 ml-1">多</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded-md px-2.5 py-1.5 pointer-events-none shadow-lg whitespace-nowrap"
          style={{
            left: tooltip.x,
            top: tooltip.y - 36,
            transform: "translate(-50%, 0)",
          }}
        >
          <div className="font-medium">{tooltip.date}</div>
          <div className="text-gray-300">{tooltip.wordCount.toLocaleString()} 字</div>
        </div>
      )}
    </div>
  );
}
