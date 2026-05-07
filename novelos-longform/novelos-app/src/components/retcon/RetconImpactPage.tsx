import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  History,
  AlertTriangle,
  AlertCircle,
  Info,
  FileText,
  Users,
  Lightbulb,
  Shield,
  ChevronLeft,
  TrendingUp,
  Wrench,
  ArrowRight,
  CheckCircle2,
  Clock,
  BookOpen,
  GitBranch,
  Target,
} from "lucide-react";

// ─── Mock data types ───

interface AffectedVolume {
  volumeId: string;
  volumeNumber: number;
  title: string;
  affectedChapters: number[];
  reason: string;
}

interface AffectedCharacter {
  id: string;
  name: string;
  role: string;
  before: string;
  after: string;
  impactLevel: "high" | "medium" | "low";
}

interface AffectedForeshadow {
  id: string;
  title: string;
  seedChapter: number;
  maturityCondition: string;
  impact: string;
}

interface FixScheme {
  id: string;
  title: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  estimatedChapters: number;
  estimatedDays: number;
  pros: string[];
  cons: string[];
}

interface RetconDetail {
  id: string;
  requestType: string;
  targetType: string;
  targetRef: string;
  reason: string;
  status: string;
  createdAt: string;
  riskLevel: "low" | "medium" | "high";
  riskExplanation: string;
  affectedVolumes: AffectedVolume[];
  affectedCharacters: AffectedCharacter[];
  affectedForeshadows: AffectedForeshadow[];
  fixSchemes: FixScheme[];
}

// ─── Mock data ───

const MOCK_RETCON: RetconDetail = {
  id: "retcon-2",
  requestType: "角色修史",
  targetType: "character",
  targetRef: "柳如烟",
  reason:
    "在加入了「血影殿」背景后，柳如烟的性格线需要提前展示其隐忍特质。目前的角色设定在第12章才展现，但根据大纲应该在前期铺垫。需要修史的角色档案，并在第3-5章加入暗示性的行为描写。",
  status: "approved",
  createdAt: "2026-05-01T15:20:00",
  riskLevel: "medium",
  riskExplanation:
    "修改涉及前期多个章节的角色行为，可能影响已有的关系线。第12章的伏笔已经与前期角色形象绑定，修改后需要重新检查一致性。风险主要在于修改范围跨度较大（卷1到卷2），需要确保过渡自然。",
  affectedVolumes: [
    {
      volumeId: "vol-1",
      volumeNumber: 1,
      title: "初入江湖",
      affectedChapters: [3, 4, 5],
      reason: "需要在早期章节加入柳如烟的隐忍性格暗示",
    },
    {
      volumeId: "vol-2",
      volumeNumber: 2,
      title: "风云再起",
      affectedChapters: [12, 13],
      reason: "第12章的爆发场景需要调整为「隐忍后的释放」",
    },
  ],
  affectedCharacters: [
    {
      id: "char-liu",
      name: "柳如烟",
      role: "主角",
      before: "前期性格：直爽外向，喜怒形于色。在第12章才展露隐忍一面。",
      after: "前期性格：表面活泼，内心隐忍。在第3-5章通过细微表情和内心独白铺垫。",
      impactLevel: "high",
    },
    {
      id: "char-xiao",
      name: "萧云",
      role: "男主",
      before: "对柳如烟的认识停留在表面活泼的印象，第12章才察觉其隐忍。",
      after: "在第5章已开始察觉柳如烟表里不一的迹象，为后期感情线铺垫。",
      impactLevel: "medium",
    },
    {
      id: "char-xue",
      name: "血影殿主",
      role: "反派",
      before: "作为背景势力，目前只在大纲中提及。",
      after: "在第4章通过侧面描写引入血影殿的存在感。",
      impactLevel: "low",
    },
  ],
  affectedForeshadows: [
    {
      id: "fs-1",
      title: "柳如烟的身世之谜",
      seedChapter: 12,
      maturityCondition: "柳如烟在第12章第一次提到童年记忆",
      impact: "需要提前到第3章播种，在第5章强化暗示",
    },
    {
      id: "fs-2",
      title: "血影殿的暗中布局",
      seedChapter: 18,
      maturityCondition: "血影殿势力第一次正式现身",
      impact: "第4章侧面引入后，需要与第18章的正式现身衔接",
    },
    {
      id: "fs-3",
      title: "柳如烟与萧云的信任裂痕",
      seedChapter: 15,
      maturityCondition: "萧云发现柳如烟隐瞒了关键信息",
      impact: "修史后需要验证：裂痕铺垫是否因前期变化而需要调整",
    },
  ],
  fixSchemes: [
    {
      id: "scheme-compensate",
      title: "后续补偿",
      description:
        "不改动已有章节，在第12章之前补写1-2个过渡章节来补全柳如烟的性格线。这种方式对已有内容影响最小，但会增加额外章节数。",
      difficulty: "easy",
      estimatedChapters: 2,
      estimatedDays: 3,
      pros: ["已有章节完全不变", "实现最快", "风险最低", "不影响已定稿章节"],
      cons: ["增加额外章节", "过渡可能不自然", "读者可能注意到风格差异"],
    },
    {
      id: "scheme-backfill",
      title: "局部回写",
      description:
        "直接修改第3、4、5、12章中与柳如烟性格相关的段落。通过局部增删修改实现性格线的连贯展示。这是最常用的修史策略。",
      difficulty: "medium",
      estimatedChapters: 4,
      estimatedDays: 7,
      pros: ["改动精准", "不增加章节数", "过渡自然", "可以同时修复相关问题"],
      cons: ["需要重新编译检查受影响章节", "修改分散在多个章节", "需要重读确认一致性"],
    },
    {
      id: "scheme-restructure",
      title: "卷级重构",
      description:
        "重新规划第1卷（第1-10章）和第2卷（第11-20章）的柳如烟角色弧线。包括重新设计章节大纲、更新角色状态时间线。这是最彻底的方案。",
      difficulty: "hard",
      estimatedChapters: 20,
      estimatedDays: 21,
      pros: ["角色弧线最完整", "彻底解决一致性问题", "可以同时优化整体结构"],
      cons: ["工作量最大", "影响范围最广", "可能引入新的不一致", "需要重新定稿大量章节"],
    },
  ],
};

// ─── Helpers ───

function riskBadge(level: string) {
  const config: Record<string, { bg: string; text: string; icon: typeof AlertTriangle }> = {
    high: { bg: "bg-red-100 border-red-200", text: "text-red-700", icon: AlertTriangle },
    medium: { bg: "bg-yellow-100 border-yellow-200", text: "text-yellow-700", icon: AlertCircle },
    low: { bg: "bg-green-100 border-green-200", text: "text-green-700", icon: CheckCircle2 },
  };
  const c = config[level] || config.low;
  const IconComponent = c.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${c.bg} ${c.text}`}
    >
      <IconComponent size={12} />
      {level === "high" ? "高风险" : level === "medium" ? "中风险" : "低风险"}
    </span>
  );
}

function difficultyBadge(difficulty: string) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    easy: { bg: "bg-green-50 border-green-200", text: "text-green-700", label: "简单" },
    medium: { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700", label: "中等" },
    hard: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "困难" },
  };
  const c = config[difficulty] || config.easy;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${c.bg} ${c.text}`}
    >
      <Shield size={10} />
      {c.label}
    </span>
  );
}

function impactLevelBadge(level: string) {
  const config: Record<string, string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-yellow-100 text-yellow-700",
    low: "bg-blue-100 text-blue-700",
  };
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${config[level] || "bg-gray-100 text-gray-600"}`}
    >
      {level === "high" ? "高影响" : level === "medium" ? "中影响" : "低影响"}
    </span>
  );
}

// ─── Sub-components ───

function AffectedVolumesSection({ volumes }: { volumes: AffectedVolume[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <BookOpen size={16} className="text-indigo-600" />
        受影响卷/章
      </h3>
      {volumes.length === 0 ? (
        <p className="text-sm text-gray-400">暂无受影响的卷/章</p>
      ) : (
        <div className="space-y-3">
          {volumes.map((vol) => (
            <div key={vol.volumeId} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <GitBranch size={14} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-900">
                  第{vol.volumeNumber}卷: {vol.title}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {vol.affectedChapters.map((ch) => (
                  <span
                    key={ch}
                    className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-medium"
                  >
                    第{ch}章
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-500">{vol.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AffectedCharactersSection({ characters }: { characters: AffectedCharacter[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <Users size={16} className="text-indigo-600" />
        受影响角色
      </h3>
      {characters.length === 0 ? (
        <p className="text-sm text-gray-400">暂无受影响角色</p>
      ) : (
        <div className="space-y-3">
          {characters.map((char) => (
            <div key={char.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <Users size={14} className="text-indigo-600" />
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{char.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{char.role}</span>
                  </div>
                </div>
                {impactLevelBadge(char.impactLevel)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded p-2">
                  <span className="text-[10px] font-medium text-gray-400 uppercase">修史前</span>
                  <p className="text-xs text-gray-700 mt-0.5">{char.before}</p>
                </div>
                <div className="bg-indigo-50 rounded p-2">
                  <span className="text-[10px] font-medium text-indigo-400 uppercase">修史后</span>
                  <p className="text-xs text-indigo-700 mt-0.5">{char.after}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AffectedForeshadowsSection({ items }: { items: AffectedForeshadow[] }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4">
        <Lightbulb size={16} className="text-indigo-600" />
        受影响伏笔
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">暂无受影响伏笔</p>
      ) : (
        <div className="space-y-2">
          {items.map((fs) => (
            <div
              key={fs.id}
              className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="p-1.5 rounded bg-yellow-50 shrink-0 mt-0.5">
                <Lightbulb size={14} className="text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-gray-900 truncate">{fs.title}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    埋于第{fs.seedChapter}章
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-1">回收条件: {fs.maturityCondition}</p>
                <p className="text-xs text-orange-600 flex items-center gap-1">
                  <Info size={10} />
                  {fs.impact}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RiskSection({ level, explanation }: { level: string; explanation: string }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        level === "high"
          ? "bg-red-50 border-red-200"
          : level === "medium"
            ? "bg-yellow-50 border-yellow-200"
            : "bg-green-50 border-green-200"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {riskBadge(level)}
        <span className="text-sm font-medium text-gray-900">风险等级评估</span>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{explanation}</p>
    </div>
  );
}

function FixSchemeCard({
  scheme,
  onSelect,
  selected,
}: {
  scheme: FixScheme;
  onSelect: (id: string) => void;
  selected: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-lg border-2 p-5 transition-all ${
        selected
          ? "border-indigo-500 shadow-md ring-1 ring-indigo-500"
          : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <h4 className="text-base font-semibold text-gray-900">{scheme.title}</h4>
        {difficultyBadge(scheme.difficulty)}
      </div>

      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{scheme.description}</p>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-indigo-600 mb-0.5">
            <FileText size={14} />
            <span className="text-lg font-bold">{scheme.estimatedChapters}</span>
          </div>
          <div className="text-xs text-gray-500">预估涉及章节</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-indigo-600 mb-0.5">
            <Clock size={14} />
            <span className="text-lg font-bold">{scheme.estimatedDays}</span>
          </div>
          <div className="text-xs text-gray-500">预估耗时(天)</div>
        </div>
      </div>

      {/* Pros & Cons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div>
          <span className="text-xs font-medium text-green-600 flex items-center gap-1 mb-1.5">
            <CheckCircle2 size={12} /> 优点
          </span>
          <ul className="space-y-0.5">
            {scheme.pros.map((pro, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                <span className="text-green-400 mt-0.5 shrink-0">+</span>
                {pro}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="text-xs font-medium text-red-600 flex items-center gap-1 mb-1.5">
            <AlertCircle size={12} /> 缺点
          </span>
          <ul className="space-y-0.5">
            {scheme.cons.map((con, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                <span className="text-red-400 mt-0.5 shrink-0">-</span>
                {con}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Select button */}
      <button
        onClick={() => onSelect(scheme.id)}
        className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          selected
            ? "bg-indigo-600 text-white hover:bg-indigo-700"
            : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
        }`}
      >
        {selected ? (
          <>
            <CheckCircle2 size={16} />
            已选择此方案
          </>
        ) : (
          <>
            选择此方案
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </div>
  );
}

// ─── Main page ───

export function RetconImpactPage() {
  const { projectId, retconId } = useParams<{ projectId: string; retconId?: string }>();
  const navigate = useNavigate();

  const [selectedScheme, setSelectedScheme] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  // In the future, fetch from API using retconId:
  // useEffect(() => { retconApi.getImpact(retconId).then(setData); }, [retconId]);
  const data: RetconDetail = MOCK_RETCON;

  const affectedChapterCount = useMemo(
    () => data.affectedVolumes.reduce((sum, v) => sum + v.affectedChapters.length, 0),
    [data],
  );

  const handleSelectScheme = (id: string) => {
    setSelectedScheme(id);
  };

  const handleApplyScheme = () => {
    // In the future: await retconApi.applyScheme(retconId, selectedScheme);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-6 max-w-5xl mx-auto w-full">
        {/* Success toast */}
        {applied && (
          <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 size={14} />
            修复方案已提交执行，系统将按照选定方案开始修史。
          </div>
        )}

        {/* Header with back button */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(`/project/${projectId}/retcon`)}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">修史影响分析</h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">
                {data.requestType}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              申请 #{data.id} -{" "}
              {data.targetType === "character"
                ? "角色"
                : data.targetType === "chapter"
                  ? "章节"
                  : "正典"}
              : {data.targetRef}
            </p>
          </div>
        </div>

        {/* Retcon request summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <History size={16} className="text-indigo-600" />
              <span className="text-sm font-medium text-gray-900">修史原因</span>
            </div>
            <div className="flex items-center gap-2">
              {riskBadge(data.riskLevel)}
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {data.status === "approved" ? "已批准" : data.status}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{data.reason}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              提交时间: {new Date(data.createdAt).toLocaleDateString("zh-CN")}
            </span>
          </div>
        </div>

        {/* Impact summary stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{affectedChapterCount}</div>
            <div className="text-xs text-gray-500">受影响章节</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{data.affectedVolumes.length}</div>
            <div className="text-xs text-gray-500">受影响卷</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{data.affectedCharacters.length}</div>
            <div className="text-xs text-gray-500">受影响角色</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <div className="text-lg font-bold text-gray-900">{data.affectedForeshadows.length}</div>
            <div className="text-xs text-gray-500">受影响伏笔</div>
          </div>
        </div>

        {/* Main content: two-column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          <AffectedVolumesSection volumes={data.affectedVolumes} />
          <AffectedCharactersSection characters={data.affectedCharacters} />
        </div>

        <div className="mb-6">
          <AffectedForeshadowsSection items={data.affectedForeshadows} />
        </div>

        <div className="mb-8">
          <RiskSection level={data.riskLevel} explanation={data.riskExplanation} />
        </div>

        {/* Fix schemes */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={18} className="text-indigo-600" />
            <h2 className="text-lg font-bold text-gray-900">修复方案</h2>
            <span className="text-xs text-gray-400">选择一个方案来执行修史</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.fixSchemes.map((scheme) => (
              <FixSchemeCard
                key={scheme.id}
                scheme={scheme}
                selected={selectedScheme === scheme.id}
                onSelect={handleSelectScheme}
              />
            ))}
          </div>
        </div>

        {/* Apply button */}
        {selectedScheme && (
          <div className="sticky bottom-6 flex justify-center">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 px-6 py-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Target size={18} className="text-indigo-600" />
                <span className="text-sm font-medium text-gray-900">
                  已选择方案: {data.fixSchemes.find((s) => s.id === selectedScheme)?.title}
                </span>
              </div>
              <button
                onClick={handleApplyScheme}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                确认应用修复方案
                <TrendingUp size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
