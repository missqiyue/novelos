import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useChapterStore, useProjectStore } from "../../stores";
import {
  ArrowLeft,
  BarChart3,
  FileText,
  Clock,
  Target,
  TrendingUp,
  Calendar,
  Loader2,
  AlertTriangle,
  Award,
  Zap,
} from "lucide-react";

interface SessionData {
  date: string;
  startTime: number;
  totalSeconds: number;
  startWords: number;
  endWords: number;
}

const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const DAY_NAMES_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

export function WritingStatsDashboard() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const {
    chapters,
    fetchChapters,
    loading: chaptersLoading,
    error: chaptersError,
  } = useChapterStore();
  const { project, fetch: fetchProject, switchProject } = useProjectStore();

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize project and load data
  useEffect(() => {
    const init = async () => {
      if (projectId && project?.id !== projectId) {
        await switchProject(projectId);
      }
      if (!project) {
        await fetchProject();
      }
      await fetchChapters();

      // Load sessions from localStorage
      try {
        const raw = localStorage.getItem(`novelos_writing_stats_${projectId}`);
        const list: SessionData[] = raw ? JSON.parse(raw) : [];
        setSessions(list);
      } catch {
        setSessions([]);
      }

      setInitialized(true);
    };
    init();
  }, [projectId]);

  // ─── Computed stats ───

  const totalWordsOverTime = useMemo(() => {
    let cumulative = 0;
    return chapters
      .slice()
      .sort((a, b) => a.chapter_number - b.chapter_number)
      .map((ch) => {
        cumulative += ch.word_count || 0;
        return { chapter: ch.chapter_number, words: cumulative, single: ch.word_count || 0 };
      });
  }, [chapters]);

  const dayOfWeekStats = useMemo(() => {
    const dayWords: number[] = new Array(7).fill(0);
    const daySessions: number[] = new Array(7).fill(0);
    const daySeconds: number[] = new Array(7).fill(0);

    for (const s of sessions) {
      const dayIndex = new Date(s.date).getDay(); // 0=Sun, 1=Mon, ...
      // Convert to Mon=0 ... Sun=6
      const idx = dayIndex === 0 ? 6 : dayIndex - 1;
      const words = Math.max(0, s.endWords - s.startWords);
      dayWords[idx] += words;
      daySessions[idx] += 1;
      daySeconds[idx] += s.totalSeconds;
    }

    return { dayWords, daySessions, daySeconds };
  }, [sessions]);

  const avgWordsPerSession = useMemo(() => {
    if (sessions.length === 0) return 0;
    const totalWords = sessions.reduce((sum, s) => sum + Math.max(0, s.endWords - s.startWords), 0);
    return Math.round(totalWords / sessions.length);
  }, [sessions]);

  const bestDay = useMemo(() => {
    const { dayWords } = dayOfWeekStats;
    let maxIdx = 0;
    for (let i = 1; i < 7; i++) {
      if (dayWords[i] > dayWords[maxIdx]) maxIdx = i;
    }
    return { index: maxIdx, words: dayWords[maxIdx], label: DAY_NAMES[maxIdx] };
  }, [dayOfWeekStats]);

  const totalWritingTime = useMemo(() => {
    return sessions.reduce((sum, s) => sum + s.totalSeconds, 0);
  }, [sessions]);

  const totalSessionWords = useMemo(() => {
    return sessions.reduce((sum, s) => sum + Math.max(0, s.endWords - s.startWords), 0);
  }, [sessions]);

  const totalChapterWords = useMemo(() => {
    return totalWordsOverTime.length > 0
      ? totalWordsOverTime[totalWordsOverTime.length - 1].words
      : 0;
  }, [totalWordsOverTime]);

  const maxDayWords = useMemo(() => {
    const { dayWords } = dayOfWeekStats;
    return Math.max(...dayWords, 1);
  }, [dayOfWeekStats]);

  // ─── Loading state ───
  if (!initialized || chaptersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  // ─── Error state ───
  if (chaptersError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-sm text-red-600">{chaptersError}</p>
      </div>
    );
  }

  // ─── Empty state ───
  if (chapters.length === 0 && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <BarChart3 size={32} className="text-gray-300" />
        <p className="text-sm text-gray-400">暂无写作数据</p>
        <p className="text-xs text-gray-400">开始写作后这里将显示统计数据</p>
        <button
          onClick={() => navigate(`/project/${projectId}/dashboard`)}
          className="text-xs text-indigo-600 hover:underline mt-2"
        >
          返回工作台
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/project/${projectId}/dashboard`)}
          className="p-1 hover:bg-gray-100 rounded transition-colors"
          title="返回"
        >
          <ArrowLeft size={20} className="text-gray-500" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">写作统计</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <FileText size={14} />
            总字数 (章节)
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {totalChapterWords.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Zap size={14} />
            写作产出 (会话)
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {totalSessionWords.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Clock size={14} />
            总写作时间
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {formatMinutes(Math.round(totalWritingTime / 60))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Target size={14} />
            平均每会话字数
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {avgWordsPerSession.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Cumulative word count chart */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-indigo-600" />
          累计字数增长
        </h3>
        {totalWordsOverTime.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            暂无章节数据
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-end gap-1 h-40 px-1">
              {totalWordsOverTime.map((item) => {
                const maxWords =
                  totalWordsOverTime.length > 0
                    ? totalWordsOverTime[totalWordsOverTime.length - 1].words
                    : 1;
                const heightPct = maxWords > 0 ? (item.words / maxWords) * 100 : 0;
                return (
                  <div
                    key={item.chapter}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  >
                    <div className="text-[9px] text-gray-400 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {item.words.toLocaleString()}
                    </div>
                    <div
                      className="w-full rounded-t-sm bg-indigo-500 transition-all group-hover:bg-indigo-600"
                      style={{ height: `${Math.max(heightPct, 1)}%` }}
                      title={`第${item.chapter}章后: ${item.words.toLocaleString()}字`}
                    />
                    <div className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">
                      {item.chapter}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 px-1">
              <span>0</span>
              <span>
                {totalWordsOverTime.length > 0
                  ? totalWordsOverTime[totalWordsOverTime.length - 1].words.toLocaleString()
                  : 0}{" "}
                字
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sessions per day of week */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2 mb-4">
          <Calendar size={16} className="text-indigo-600" />
          每日写作字数分布
        </h3>
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            暂无写作会话数据
          </div>
        ) : (
          <div className="space-y-4">
            {/* Bars */}
            <div className="flex items-end gap-2 h-36 px-1">
              {DAY_NAMES.map((day, idx) => {
                const words = dayOfWeekStats.dayWords[idx];
                const sessions = dayOfWeekStats.daySessions[idx];
                const heightPct = maxDayWords > 0 ? (words / maxDayWords) * 100 : 0;
                const isBest = idx === bestDay.index && bestDay.words > 0;
                return (
                  <div
                    key={day}
                    className="flex-1 flex flex-col items-center justify-end h-full group relative"
                  >
                    <div className="text-[9px] text-gray-400 mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      {words.toLocaleString()} 字 / {sessions} 次
                    </div>
                    <div
                      className={`w-full rounded-t-sm transition-all ${
                        isBest
                          ? "bg-amber-500 group-hover:bg-amber-600"
                          : "bg-emerald-400 group-hover:bg-emerald-500"
                      }`}
                      style={{ height: `${Math.max(heightPct, 2)}%` }}
                      title={`${day}: ${words.toLocaleString()} 字 (${sessions} 次会话)`}
                    />
                    <div className="text-[10px] text-gray-500 mt-1.5 truncate w-full text-center">
                      {DAY_NAMES_SHORT[idx]}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Best day highlight */}
            {bestDay.words > 0 && (
              <div className="flex items-center gap-2 px-2 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <Award size={16} className="text-amber-500" />
                <span className="text-sm text-amber-700">
                  最佳写作日: <strong>{bestDay.label}</strong>
                  {" - "}
                  {bestDay.words.toLocaleString()} 字, {dayOfWeekStats.daySessions[bestDay.index]}{" "}
                  次会话
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Session detail table */}
      {sessions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Clock size={16} className="text-indigo-600" />
              最近写作会话
            </h3>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr className="text-left text-xs text-gray-500">
                  <th className="px-4 py-2">日期</th>
                  <th className="px-4 py-2">字数变化</th>
                  <th className="px-4 py-2">时长</th>
                  <th className="px-4 py-2">速度</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions
                  .slice()
                  .reverse()
                  .slice(0, 30)
                  .map((s, i) => {
                    const words = Math.max(0, s.endWords - s.startWords);
                    const minutes = Math.round(s.totalSeconds / 60);
                    const speed =
                      s.totalSeconds > 0 ? Math.round(words / (s.totalSeconds / 3600)) : 0;
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{s.date}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`font-medium ${
                              words > 0 ? "text-green-600" : "text-gray-400"
                            }`}
                          >
                            {words > 0 ? "+" : ""}
                            {words.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{formatMinutes(minutes)}</td>
                        <td className="px-4 py-2 text-gray-500">{speed.toLocaleString()} 字/时</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
