import { useEffect, useState } from "react";
import { useProjectStore, useChapterStore, useOutlineStore } from "../../stores";
import { Target, FileText, Users, BookOpen, Calendar, Loader2 } from "lucide-react";

interface SessionData {
  date: string;
  startTime: number;
  totalSeconds: number;
  startWords: number;
  endWords: number;
}

function getDaysSinceLastSession(projectId: string): number | null {
  try {
    const raw = localStorage.getItem(`novelos_writing_stats_${projectId}`);
    if (!raw) return null;
    const sessions: SessionData[] = JSON.parse(raw);
    if (sessions.length === 0) return null;
    const lastSession = sessions[sessions.length - 1];
    const lastDate = new Date(lastSession.date);
    const diffMs = Date.now() - lastDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

/** Compact circular progress SVG */
function ProgressCircle({ pct }: { pct: number }) {
  const r = 14;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="#4f46e5"
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        className="transition-all duration-500"
      />
      <text
        x="18"
        y="18"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="9"
        fontWeight="bold"
        fill="#4f46e5"
      >
        {pct}
      </text>
    </svg>
  );
}

interface GlanceCardProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  color: string;
  children?: React.ReactNode;
}

function GlanceCard({ icon: Icon, label, value, color, children }: GlanceCardProps) {
  return (
    <div className="flex items-center gap-2.5 bg-white rounded-lg border border-gray-100 px-3 py-2.5 min-w-0">
      <div className={`p-1.5 rounded-md ${color}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{value}</p>
      </div>
      {children}
    </div>
  );
}

export function ProjectGlanceWidget() {
  const { project } = useProjectStore();
  const { chapters, characters, fetchChapters, fetchCharacters } = useChapterStore();
  const { volumes, fetchVolumes } = useOutlineStore();
  const [daysSince, setDaysSince] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchChapters(), fetchCharacters(), fetchVolumes()]);
      setLoaded(true);
    };
    load();
  }, [fetchChapters, fetchCharacters, fetchVolumes]);

  useEffect(() => {
    if (project?.id) {
      setDaysSince(getDaysSinceLastSession(project.id));
    }
  }, [project?.id]);

  const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
  const targetWords = project?.target_words || 0;
  const progressPct =
    targetWords > 0 ? Math.min(100, Math.round((totalWords / targetWords) * 100)) : 0;
  const finalizedCount = chapters.filter(
    (ch) => ch.status === "finalized" || ch.status === "approved",
  ).length;
  const totalChapters = chapters.length;
  const activeChars = characters.filter((c) => c.status === "active").length;
  const totalChars = characters.length;
  const currentVolume =
    volumes.find((v) => v.status === "active" || v.status === "drafting") ||
    volumes[volumes.length - 1];
  const volumeLabel = currentVolume
    ? `第${currentVolume.volume_number}卷${currentVolume.title ? `: ${currentVolume.title}` : ""}`
    : "未设置";

  // Empty state
  if (!loaded) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  const showEmpty = chapters.length === 0 && characters.length === 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
        <Target size={14} className="text-indigo-600" />
        项目一览
      </h3>

      {showEmpty ? (
        <p className="text-sm text-gray-400 text-center py-3">暂无数据，开始创建章节和角色吧</p>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          {/* Progress circle */}
          <GlanceCard
            icon={Target}
            label="目标进度"
            value={`${progressPct}%`}
            color="bg-indigo-50 text-indigo-600"
          >
            <ProgressCircle pct={progressPct} />
          </GlanceCard>

          {/* Chapter count */}
          <GlanceCard
            icon={FileText}
            label="章节"
            value={totalChapters > 0 ? `${finalizedCount}/${totalChapters}` : "0"}
            color="bg-blue-50 text-blue-600"
          />

          {/* Character count */}
          <GlanceCard
            icon={Users}
            label="角色"
            value={
              totalChars > 0
                ? activeChars === totalChars
                  ? String(totalChars)
                  : `${activeChars} / ${totalChars}`
                : "0"
            }
            color="bg-purple-50 text-purple-600"
          />

          {/* Days since last writing */}
          <GlanceCard
            icon={Calendar}
            label="最后写作"
            value={daysSince === null ? "--" : daysSince === 0 ? "今天" : `${daysSince} 天前`}
            color="bg-amber-50 text-amber-600"
          />

          {/* Current volume */}
          <GlanceCard
            icon={BookOpen}
            label="当前卷"
            value={volumeLabel}
            color="bg-green-50 text-green-600"
          />
        </div>
      )}
    </div>
  );
}
