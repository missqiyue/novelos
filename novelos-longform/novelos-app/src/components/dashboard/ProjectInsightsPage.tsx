import { useEffect, useMemo } from "react";
import { useProjectStore, useChapterStore } from "../../stores";
import type { CharacterInfo } from "../../lib/api";
import {
  TrendingUp,
  Clock,
  BookOpen,
  Users,
  Target,
  BarChart3,
  Loader2,
  AlertCircle,
  FileText,
  Zap,
  Lightbulb,
  Gauge,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

// ─── Session data ───

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

// ─── Insight card types ───

interface InsightCard {
  key: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  color: "green" | "yellow" | "blue";
}

// ─── helpers ───

function countCharMentions(text: string, characters: CharacterInfo[]): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!text) return counts;
  for (const ch of characters) {
    const escaped = ch.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");
    const matches = text.match(regex);
    if (matches) {
      counts[ch.name] = matches.length;
    }
  }
  return counts;
}

function daysBetween(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Sub components for insight display ───

function InsightCardView({ insight }: { insight: InsightCard }) {
  const Icon = insight.icon;

  const colorClasses = {
    green: {
      bg: "bg-green-50 border-green-200",
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      accent: "border-l-green-500",
    },
    yellow: {
      bg: "bg-yellow-50 border-yellow-200",
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
      accent: "border-l-yellow-500",
    },
    blue: {
      bg: "bg-blue-50 border-blue-200",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      accent: "border-l-blue-500",
    },
  };

  const c = colorClasses[insight.color];

  return (
    <div className={`${c.bg} border ${c.accent} border-l-4 rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${c.iconBg}`}>
          <Icon size={18} className={c.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 mb-1">{insight.title}</h3>
          <p className="text-sm text-gray-600 leading-relaxed">{insight.description}</p>
        </div>
      </div>
    </div>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <ArrowUpRight size={14} className="text-green-600 inline" />;
  if (direction === "down") return <ArrowDownRight size={14} className="text-red-600 inline" />;
  return <Minus size={14} className="text-gray-400 inline" />;
}

// ─── Main component ───

export function ProjectInsightsPage() {
  const { project } = useProjectStore();
  const { chapters, characters, fetchChapters, fetchCharacters, loading } = useChapterStore();
  const projectId = project?.id || "";

  useEffect(() => {
    fetchChapters();
    fetchCharacters();
  }, [fetchChapters, fetchCharacters]);

  // ─── Compute insights ───
  const insights = useMemo((): InsightCard[] => {
    if (!projectId || chapters.length === 0) return [];

    const results: InsightCard[] = [];
    const sessions = loadSessions(projectId);

    // ── 1. Writing Pace ──
    {
      // Calculate daily word average from sessions
      const dailyWords: Record<string, number> = {};
      sessions.forEach((s) => {
        dailyWords[s.date] = (dailyWords[s.date] || 0) + Math.max(0, s.endWords - s.startWords);
      });

      const sortedDays = Object.keys(dailyWords).sort();
      let avgDailyWords = 0;
      let totalSessionWords = 0;

      if (sortedDays.length >= 2) {
        const firstDate = new Date(sortedDays[0]);
        const lastDate = new Date(sortedDays[sortedDays.length - 1]);
        const totalDays = Math.max(1, daysBetween(firstDate, lastDate) + 1);
        totalSessionWords = Object.values(dailyWords).reduce((sum, w) => sum + w, 0);
        avgDailyWords = totalSessionWords / totalDays;
      } else if (sortedDays.length === 1) {
        totalSessionWords = Object.values(dailyWords).reduce((sum, w) => sum + w, 0);
        avgDailyWords = totalSessionWords;
      }

      const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
      const targetWords = project?.target_words || 0;

      let paceDescription = "";
      let paceColor: "green" | "yellow" | "blue" = "blue";

      if (avgDailyWords > 0 && targetWords > 0 && totalWords < targetWords) {
        const remaining = targetWords - totalWords;
        const daysNeeded = Math.ceil(remaining / avgDailyWords);
        const estimatedDate = new Date();
        estimatedDate.setDate(estimatedDate.getDate() + daysNeeded);
        const dateStr = `${estimatedDate.getFullYear()}-${String(estimatedDate.getMonth() + 1).padStart(2, "0")}-${String(estimatedDate.getDate()).padStart(2, "0")}`;

        if (avgDailyWords >= 3000) {
          paceColor = "green";
        } else if (avgDailyWords >= 1000) {
          paceColor = "yellow";
        }

        paceDescription = `你平均每天写 ${Math.round(avgDailyWords).toLocaleString()} 字。按此速度，还需要 ${daysNeeded} 天，预计 ${dateStr} 完成。`;
      } else if (totalWords >= targetWords && targetWords > 0) {
        paceDescription = `目标总字数 ${targetWords.toLocaleString()} 字已达成! 共完成 ${totalWords.toLocaleString()} 字。`;
        paceColor = "green";
      } else if (avgDailyWords > 0) {
        paceDescription = `你平均每天写 ${Math.round(avgDailyWords).toLocaleString()} 字。${targetWords <= 0 ? "设定目标字数后可预估完成日期。" : ""}`;
        paceColor = "blue";
      } else {
        paceDescription =
          "还没有足够的写作数据来计算写作速度。开始写作后，这里会显示你的写作节奏。";
        paceColor = "blue";
      }

      results.push({
        key: "pace",
        icon: Gauge,
        title: "写作速度",
        description: paceDescription,
        color: paceColor,
      });
    }

    // ── 2. Most Productive Time ──
    {
      interface HourBucket {
        hour: number;
        words: number;
        sessions: number;
      }
      interface DayBucket {
        day: number;
        words: number;
        sessions: number;
      }

      const hourBuckets: HourBucket[] = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        words: 0,
        sessions: 0,
      }));
      const dayBuckets: DayBucket[] = Array.from({ length: 7 }, (_, i) => ({
        day: i,
        words: 0,
        sessions: 0,
      }));

      sessions.forEach((s) => {
        const d = new Date(s.startTime);
        const hour = d.getHours();
        const day = d.getDay(); // 0=Sun, 1=Mon, ...
        const words = Math.max(0, s.endWords - s.startWords);

        hourBuckets[hour].words += words;
        hourBuckets[hour].sessions += 1;
        dayBuckets[day].words += words;
        dayBuckets[day].sessions += 1;
      });

      const bestHour = hourBuckets.reduce(
        (best, cur) => (cur.words > best.words ? cur : best),
        hourBuckets[0],
      );
      const bestDay = dayBuckets.reduce(
        (best, cur) => (cur.words > best.words ? cur : best),
        dayBuckets[0],
      );

      const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

      let timeDescription = "";
      let timeColor: "green" | "yellow" | "blue" = "blue";

      if (bestHour.words > 0 || bestDay.words > 0) {
        const parts: string[] = [];
        if (bestDay.words > 0) {
          parts.push(`${dayNames[bestDay.day]}是你最高产的一天`);
        }
        if (bestHour.words > 0) {
          const timeRange = `${String(bestHour.hour).padStart(2, "0")}:00-${String(bestHour.hour + 2).padStart(2, "0")}:00`;
          parts.push(`高峰时段在 ${timeRange}`);
        }
        if (parts.length > 0) {
          timeDescription = parts.join("，") + "。建议在这些时间段安排重点写作任务。";
          timeColor = "green";
        } else {
          timeDescription = "写作时间较分散，暂无显著高峰时段。";
        }
      } else {
        timeDescription = "还没有足够的写作会话数据来分析最佳写作时间。";
      }

      results.push({
        key: "productive-time",
        icon: Clock,
        title: "最佳写作时段",
        description: timeDescription,
        color: timeColor,
      });
    }

    // ── 3. Chapter Length Trend ──
    {
      const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
      const first5 = sorted.slice(0, Math.min(5, sorted.length));
      const last5 = sorted.slice(-Math.min(5, sorted.length));

      const first5Avg =
        first5.length > 0
          ? first5.reduce((sum, c) => sum + (c.word_count || 0), 0) / first5.length
          : 0;
      const last5Avg =
        last5.length > 0
          ? last5.reduce((sum, c) => sum + (c.word_count || 0), 0) / last5.length
          : 0;

      let trendDescription = "";
      let trendDirection: "up" | "down" | "flat" = "flat";
      let trendColor: "green" | "yellow" | "blue" = "blue";

      if (sorted.length < 3) {
        trendDescription = "章节数量不足，还需要更多章节来分析长度趋势。";
        trendColor = "blue";
      } else if (first5Avg > 0 && last5Avg > 0) {
        const pctChange = ((last5Avg - first5Avg) / first5Avg) * 100;

        if (Math.abs(pctChange) < 10) {
          trendDescription = `你的章节长度保持稳定，前5章均 ${Math.round(first5Avg).toLocaleString()} 字，近5章均 ${Math.round(last5Avg).toLocaleString()} 字。`;
          trendDirection = "flat";
          trendColor = "blue";
        } else if (pctChange > 0) {
          trendDescription = `你的章节越来越长了! 从早期均 ${Math.round(first5Avg).toLocaleString()} 字增长到近期均 ${Math.round(last5Avg).toLocaleString()} 字 (增长 ${Math.abs(Math.round(pctChange))}%)。`;
          trendDirection = "up";
          trendColor = pctChange > 50 ? "yellow" : "green";
        } else {
          trendDescription = `你的章节在变短。从早期均 ${Math.round(first5Avg).toLocaleString()} 字减少到近期均 ${Math.round(last5Avg).toLocaleString()} 字 (减少 ${Math.abs(Math.round(pctChange))}%)。`;
          trendDirection = "down";
          trendColor = Math.abs(pctChange) > 40 ? "yellow" : "blue";
        }
      } else {
        trendDescription = "章节数据不足，无法分析长度趋势。";
        trendColor = "blue";
      }

      results.push({
        key: "chapter-trend",
        icon: BarChart3,
        title: "章节长度趋势",
        description: (
          <span>
            {trendDescription.split(/(增长|减少)\s*\d+%/).length > 1 ? (
              <>
                {trendDescription.split(/(增长 \d+%|减少 \d+%)/).map((part, i) => {
                  if (part.match(/^(增长|减少)\s*\d+%$/)) {
                    return (
                      <span
                        key={i}
                        className={
                          part.startsWith("增长")
                            ? "text-green-600 font-medium"
                            : "text-red-500 font-medium"
                        }
                      >
                        {part}
                      </span>
                    );
                  }
                  return <span key={i}>{part}</span>;
                })}
              </>
            ) : (
              trendDescription
            )}
          </span>
        ) as unknown as string,
        color: trendColor,
      });
    }

    // ── 4. Character Focus ──
    {
      const globalMentions: Record<string, number> = {};
      for (const ch of chapters) {
        const text = ch.draft_text || "";
        const mentions = countCharMentions(text, characters);
        for (const [name, count] of Object.entries(mentions)) {
          globalMentions[name] = (globalMentions[name] || 0) + count;
        }
      }

      const sortedMentions = Object.entries(globalMentions)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      let charDescription = "";
      let charColor: "green" | "yellow" | "blue" = "blue";

      if (characters.length === 0) {
        charDescription = "还没有创建角色。前往角色页面添加角色后，我们可以追踪他们的出场频率。";
        charColor = "blue";
      } else if (sortedMentions.length === 0) {
        charDescription = "正文中暂未检测到角色名出现。写作时使用角色全名有助于追踪角色活跃度。";
        charColor = "yellow";
      } else {
        const totalMentions = Object.values(globalMentions).reduce((sum, c) => sum + c, 0);
        const topChar = sortedMentions[0];
        const topPct = totalMentions > 0 ? Math.round((topChar[1] / totalMentions) * 100) : 0;

        charDescription = `"${topChar[0]}" 是出现最多的角色 (${topChar[1]}次, 占${topPct}%)`;
        if (sortedMentions.length > 1) {
          charDescription += `，其次是 "${sortedMentions[1][0]}" (${sortedMentions[1][1]}次)`;
        }
        charDescription += "。";

        // Check balance
        if (sortedMentions.length >= 2 && topPct > 60) {
          charDescription += " 主角出场频率远高于其他角色，可适当增加配角戏份以平衡叙事。";
          charColor = "yellow";
        } else if (sortedMentions.length >= 3) {
          charDescription += " 角色出场分布较均衡。";
          charColor = "green";
        }
      }

      results.push({
        key: "character-focus",
        icon: Users,
        title: "角色焦点",
        description: charDescription,
        color: charColor,
      });
    }

    // ── 5. Genre Alignment ──
    {
      let genreDescription = "";
      let genreColor: "green" | "yellow" | "blue" = "blue";

      const genreId = project?.genre_id || "";
      // Simple heuristic: check if chapter lengths match genre expectations
      const avgChapterWords =
        chapters.length > 0
          ? chapters.reduce((sum, c) => sum + (c.word_count || 0), 0) / chapters.length
          : 0;

      // Map genre to expected chapter length range
      const genreExpectations: Record<
        string,
        { name: string; minChapter: number; maxChapter: number; description: string }
      > = {
        xianxia: {
          name: "仙侠",
          minChapter: 2000,
          maxChapter: 5000,
          description: "仙侠类通常每章2000-5000字，节奏明快",
        },
        xuanhuan: {
          name: "玄幻",
          minChapter: 2000,
          maxChapter: 5000,
          description: "玄幻类通常每章2000-5000字",
        },
        urban: {
          name: "都市",
          minChapter: 2000,
          maxChapter: 4000,
          description: "都市类通常每章2000-4000字",
        },
        romance: {
          name: "言情",
          minChapter: 2000,
          maxChapter: 5000,
          description: "言情类通常每章2000-5000字",
        },
        sci_fi: {
          name: "科幻",
          minChapter: 2500,
          maxChapter: 6000,
          description: "科幻类通常每章2500-6000字",
        },
        mystery: {
          name: "悬疑",
          minChapter: 2000,
          maxChapter: 5000,
          description: "悬疑类通常每章2000-5000字",
        },
        history: {
          name: "历史",
          minChapter: 2500,
          maxChapter: 6000,
          description: "历史类通常每章2500-6000字",
        },
        wuxia: {
          name: "武侠",
          minChapter: 2000,
          maxChapter: 5000,
          description: "武侠类通常每章2000-5000字",
        },
        gaming: {
          name: "游戏",
          minChapter: 2000,
          maxChapter: 5000,
          description: "游戏类通常每章2000-5000字",
        },
        fantasy: {
          name: "奇幻",
          minChapter: 2500,
          maxChapter: 6000,
          description: "奇幻类通常每章2500-6000字",
        },
      };

      if (!genreId || !genreExpectations[genreId]) {
        genreDescription =
          "未设置体裁或体裁信息不完整。在项目设置中设定体裁后，可以分析内容与体裁的匹配度。";
        genreColor = "blue";
      } else if (chapters.length < 3) {
        const g = genreExpectations[genreId];
        genreDescription = `体裁: ${g.name}。${g.description}。章节数量不足，还需要更多内容来分析匹配度。`;
        genreColor = "blue";
      } else {
        const g = genreExpectations[genreId];
        const inRange = avgChapterWords >= g.minChapter && avgChapterWords <= g.maxChapter;

        if (inRange) {
          genreDescription = `体裁: ${g.name}。你的章节平均 ${Math.round(avgChapterWords).toLocaleString()} 字，在 ${g.name} 类的推荐范围内 (${g.minChapter.toLocaleString()}-${g.maxChapter.toLocaleString()} 字)。`;
          genreColor = "green";
        } else if (avgChapterWords < g.minChapter) {
          genreDescription = `体裁: ${g.name}。你的章节平均 ${Math.round(avgChapterWords).toLocaleString()} 字，低于 ${g.name} 类的推荐下限 ${g.minChapter.toLocaleString()} 字。考虑扩充章节内容。`;
          genreColor = "yellow";
        } else {
          genreDescription = `体裁: ${g.name}。你的章节平均 ${Math.round(avgChapterWords).toLocaleString()} 字，高于 ${g.name} 类的推荐上限 ${g.maxChapter.toLocaleString()} 字。长篇章节可以拆分以提升阅读体验。`;
          genreColor = "yellow";
        }
      }

      results.push({
        key: "genre-alignment",
        icon: Target,
        title: "体裁匹配度",
        description: genreDescription,
        color: genreColor,
      });
    }

    // ── 6. Writing Consistency ──
    {
      const dailyWords: Record<string, number> = {};
      sessions.forEach((s) => {
        dailyWords[s.date] = (dailyWords[s.date] || 0) + Math.max(0, s.endWords - s.startWords);
      });

      const sortedDates = Object.keys(dailyWords).sort();
      let consistencyDescription = "";
      let consistencyColor: "green" | "yellow" | "blue" = "blue";

      if (sortedDates.length < 5) {
        consistencyDescription = "写作天数不足 (少于5天)，还需更多数据来评估写作一致性。";
        consistencyColor = "blue";
      } else {
        // Calculate streak
        const today = new Date().toISOString().split("T")[0];
        let currentStreak = 0;
        const checkDate = new Date();
        for (let i = 0; i < 365; i++) {
          const dateStr = checkDate.toISOString().split("T")[0];
          if (dailyWords[dateStr] && dailyWords[dateStr] > 0) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }

        // Calculate gap ratio
        const firstDate = new Date(sortedDates[0]);
        const lastDate = new Date(sortedDates[sortedDates.length - 1]);
        const totalDays = daysBetween(firstDate, lastDate) + 1;
        const gapDays = totalDays - sortedDates.length;
        const consistencyRate = totalDays > 0 ? (sortedDates.length / totalDays) * 100 : 0;

        if (consistencyRate >= 70) {
          consistencyDescription = `写作习惯非常好! 在过去 ${totalDays} 天中有 ${sortedDates.length} 天有写作记录 (${Math.round(consistencyRate)}%)。连续 ${currentStreak} 天未中断。`;
          consistencyColor = "green";
        } else if (consistencyRate >= 40) {
          consistencyDescription = `写作习惯良好。过去 ${totalDays} 天中有 ${sortedDates.length} 天有写作记录 (${Math.round(consistencyRate)}%)。尝试减少中断天数。`;
          consistencyColor = "yellow";
        } else {
          consistencyDescription = `写作频率较低，过去 ${totalDays} 天中仅 ${sortedDates.length} 天有写作记录 (${Math.round(consistencyRate)}%)。建议设定每日目标来培养写作习惯。`;
          consistencyColor = "yellow";
        }
      }

      results.push({
        key: "consistency",
        icon: Zap,
        title: "写作一致性",
        description: consistencyDescription,
        color: consistencyColor,
      });
    }

    // ── 7. Project Completion ──
    {
      const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);
      const targetWords = project?.target_words || 0;
      const finalizedCount = chapters.filter(
        (ch) => ch.status === "finalized" || ch.status === "approved",
      ).length;

      let completionDescription = "";
      let completionColor: "green" | "yellow" | "blue" = "blue";

      if (targetWords > 0) {
        const pct = Math.round((totalWords / targetWords) * 100);
        if (pct >= 100) {
          completionDescription = `你已完成目标 ${targetWords.toLocaleString()} 字! 共 ${chapters.length} 章，定稿 ${finalizedCount} 章。`;
          completionColor = "green";
        } else if (pct >= 50) {
          completionDescription = `已完成 ${pct}% (${totalWords.toLocaleString()}/${targetWords.toLocaleString()} 字)。${finalizedCount}/${chapters.length} 章已定稿。`;
          completionColor = "green";
        } else if (pct >= 25) {
          completionDescription = `已完成 ${pct}% (${totalWords.toLocaleString()}/${targetWords.toLocaleString()} 字)。还需 ${(targetWords - totalWords).toLocaleString()} 字。`;
          completionColor = "yellow";
        } else {
          completionDescription = `项目进度 ${pct}% (${totalWords.toLocaleString()}/${targetWords.toLocaleString()} 字)。路还很长，坚持就是胜利!`;
          completionColor = "blue";
        }
      } else {
        completionDescription = `已写 ${totalWords.toLocaleString()} 字，共 ${chapters.length} 章。设定目标字数后可追踪完成度。`;
        completionColor = "blue";
      }

      results.push({
        key: "completion",
        icon: PieChart,
        title: "项目完成度",
        description: completionDescription,
        color: completionColor,
      });
    }

    return results;
  }, [projectId, chapters, characters, project]);

  // ─── Loading / Empty / Error ───

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
        <AlertCircle size={24} />
        <span className="text-sm">未加载项目</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">项目洞察</h1>
          <p className="text-sm text-gray-500 mt-1">基于写作数据的智能分析和建议</p>
        </div>

        {loading && chapters.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400 gap-2">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : chapters.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
            <FileText size={40} className="text-gray-300" />
            <p className="text-sm">暂无章节数据</p>
            <p className="text-xs">创建章节后，项目洞察将在此展示</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-indigo-600" />
                  <span className="text-xs text-gray-500">总字数</span>
                </div>
                <div className="text-lg font-bold text-gray-900 mt-1">
                  {chapters.reduce((sum, c) => sum + (c.word_count || 0), 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-indigo-600" />
                  <span className="text-xs text-gray-500">章节数</span>
                </div>
                <div className="text-lg font-bold text-gray-900 mt-1">{chapters.length}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-indigo-600" />
                  <span className="text-xs text-gray-500">角色数</span>
                </div>
                <div className="text-lg font-bold text-gray-900 mt-1">{characters.length}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-indigo-600" />
                  <span className="text-xs text-gray-500">定稿章</span>
                </div>
                <div className="text-lg font-bold text-gray-900 mt-1">
                  {
                    chapters.filter((c) => c.status === "finalized" || c.status === "approved")
                      .length
                  }
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>正面趋势</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span>需要注意</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>信息提示</span>
              </div>
            </div>

            {/* Insight cards */}
            {insights.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {insights.map((insight) => (
                  <InsightCardView key={insight.key} insight={insight} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-gray-400 gap-2">
                <Lightbulb size={24} className="text-gray-300" />
                <p className="text-sm">暂无洞察数据</p>
              </div>
            )}

            {/* Empty/placeholder for less than 2-column fill */}
            {insights.length > 0 && insights.length % 2 === 1 && (
              <div className="hidden lg:block bg-white rounded-lg border border-gray-200 p-4 opacity-0 pointer-events-none">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-gray-100" />
                  <div className="flex-1">
                    <div className="h-4 bg-gray-100 rounded w-24 mb-2" />
                    <div className="h-4 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
