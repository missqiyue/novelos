import { useState, useEffect, useMemo } from "react";
import { Clock, FileText, Zap, Hash, Calendar, BarChart3, Loader2 } from "lucide-react";
import { writingSessionApi, type WritingSessionInfo } from "../../lib/api";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} 小时 ${minutes} 分`;
  }
  return `${minutes} 分钟`;
}

function formatDurationShort(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  }
  return `${minutes}m`;
}

export function WritingHistoryPage() {
  const [sessions, setSessions] = useState<WritingSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    writingSessionApi
      .listSessions()
      .then((data) => setSessions(data))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const totalWords = sessions.reduce((sum, s) => sum + s.words_written, 0);
    const totalSeconds = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
    const totalMinutes = totalSeconds / 60;
    const totalHours = totalSeconds / 3600;
    const avgWpm = totalMinutes > 0 ? Math.round(totalWords / totalMinutes) : 0;

    return {
      totalSessions: sessions.length,
      totalWords,
      totalHours: Math.round(totalHours * 10) / 10,
      avgWpm,
    };
  }, [sessions]);

  if (loading) {
    return (
      <div className="p-6 max-w-5xl">
        <h2 className="text-lg font-semibold mb-4">写作会话记录</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Loader2 size={32} className="mb-3 animate-spin" />
          <p className="text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (sessions.length === 0) {
    return (
      <div className="p-6 max-w-5xl">
        <h2 className="text-lg font-semibold mb-4">写作会话记录</h2>
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Clock size={48} className="mb-3 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">暂无写作会话记录</p>
          <p className="text-xs text-gray-400 mt-1">开始写一章内容后，写作统计将自动记录在这里</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-lg font-semibold mb-4">写作会话记录</h2>

      {/* Summary stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard
          icon={<Hash size={16} />}
          label="总会话数"
          value={String(stats.totalSessions)}
          color="indigo"
        />
        <StatCard
          icon={<FileText size={16} />}
          label="总字数"
          value={stats.totalWords.toLocaleString()}
          color="green"
        />
        <StatCard
          icon={<Clock size={16} />}
          label="总时长"
          value={`${stats.totalHours} 小时`}
          color="amber"
        />
        <StatCard
          icon={<Zap size={16} />}
          label="平均速度"
          value={`${stats.avgWpm} 字/分`}
          color="rose"
        />
      </div>

      {/* Sessions table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
          <span className="col-span-2 flex items-center gap-1">
            <Calendar size={12} /> 日期
          </span>
          <span className="col-span-2">
            <Clock size={12} className="inline mr-1" />
            时长
          </span>
          <span className="col-span-2">
            <FileText size={12} className="inline mr-1" />
            字数
          </span>
          <span className="col-span-2">
            <Zap size={12} className="inline mr-1" />
            速度
          </span>
          <span className="col-span-4">
            <BarChart3 size={12} className="inline mr-1" />
            会话ID
          </span>
        </div>

        <div className="divide-y divide-gray-100">
          {sessions.map((session) => {
            const wpm =
              session.duration_seconds > 0
                ? Math.round(session.words_written / (session.duration_seconds / 60))
                : 0;

            return (
              <div
                key={session.id}
                className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm hover:bg-gray-50"
              >
                <span className="col-span-2 text-gray-700">{formatDate(session.started_at)}</span>
                <span className="col-span-2 text-gray-600">
                  {formatDurationShort(session.duration_seconds)}
                </span>
                <span className="col-span-2 text-gray-800 font-medium">
                  {session.words_written.toLocaleString()}
                </span>
                <span className="col-span-2 text-gray-600">{wpm} 字/分</span>
                <span className="col-span-4 text-xs text-gray-400 font-mono truncate">
                  {session.id}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "indigo" | "green" | "amber" | "rose";
}) {
  const colorClasses: Record<string, string> = {
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-sm font-semibold text-gray-800">{value}</p>
      </div>
    </div>
  );
}
