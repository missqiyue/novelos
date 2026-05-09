import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  complianceApi,
  type ComplianceScanResult,
  type ComplianceWordEntry,
  type ComplianceHit,
} from "../../lib/api";

const CATEGORIES: Record<string, string> = {
  politics: "政治",
  violence: "暴力",
  sexual: "色情",
  drug: "毒品",
  gambling: "赌博",
  superstition: "迷信",
  platform_rule: "平台规则",
};

const RISK_COLORS: Record<string, string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  medium: "text-amber-600 bg-amber-50 border-amber-200",
  low: "text-blue-600 bg-blue-50 border-blue-200",
};

const RISK_LABELS: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

function RiskBadge({ level }: { level: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${RISK_COLORS[level] || RISK_COLORS.low}`}
    >
      {RISK_LABELS[level] || level}
    </span>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
      {CATEGORIES[category] || category}
    </span>
  );
}

function ScanResults({
  results,
  onScanChapter,
}: {
  results: ComplianceScanResult[];
  onScanChapter: (cn: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const chaptersWithHits = results.filter((r) => r.total_hits > 0);
  const totalHigh = results.reduce((s, r) => s + r.high_risk_count, 0);
  const totalMedium = results.reduce((s, r) => s + r.medium_risk_count, 0);
  const totalLow = results.reduce((s, r) => s + r.low_risk_count, 0);

  if (results.length === 0)
    return (
      <div className="text-center py-12 text-gray-400">
        点击"扫描全文"检查合规风险
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-4">
        <div className="flex items-center gap-1.5 text-red-600">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm font-medium">
            高风险 {totalHigh}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-amber-600">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm font-medium">
            中风险 {totalMedium}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-blue-600">
          <Info className="w-4 h-4" />
          <span className="text-sm font-medium">
            低风险 {totalLow}
          </span>
        </div>
      </div>

      {chaptersWithHits.length === 0 ? (
        <div className="text-center py-8 text-green-600">
          <Shield className="w-8 h-8 mx-auto mb-2" />
          全部章节合规，未发现敏感词
        </div>
      ) : (
        <div className="space-y-2">
          {chaptersWithHits.map((r) => (
            <div key={r.chapter_number} className="border rounded-lg">
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                onClick={() =>
                  setExpanded(
                    expanded === r.chapter_number ? null : r.chapter_number,
                  )
                }
              >
                <div className="flex items-center gap-3">
                  {expanded === r.chapter_number ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="font-medium">
                    第{r.chapter_number}章
                  </span>
                  <span className="text-sm text-gray-500">
                    {r.total_hits}处命中
                  </span>
                </div>
                <div className="flex gap-2">
                  {r.high_risk_count > 0 && (
                    <span className="text-xs text-red-600 font-medium">
                      高{r.high_risk_count}
                    </span>
                  )}
                  {r.medium_risk_count > 0 && (
                    <span className="text-xs text-amber-600 font-medium">
                      中{r.medium_risk_count}
                    </span>
                  )}
                  {r.low_risk_count > 0 && (
                    <span className="text-xs text-blue-600 font-medium">
                      低{r.low_risk_count}
                    </span>
                  )}
                </div>
              </button>
              {expanded === r.chapter_number && (
                <div className="px-4 pb-3 border-t">
                  <HitTable hits={r.hits} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HitTable({ hits }: { hits: ComplianceHit[] }) {
  return (
    <table className="w-full text-sm mt-2">
      <thead>
        <tr className="text-left text-gray-500 border-b">
          <th className="pb-2 pr-4">敏感词</th>
          <th className="pb-2 pr-4">分类</th>
          <th className="pb-2 pr-4">风险</th>
          <th className="pb-2 pr-4">出现次数</th>
          <th className="pb-2">替换建议</th>
        </tr>
      </thead>
      <tbody>
        {hits.map((h, i) => (
          <tr key={i} className="border-b last:border-0">
            <td className="py-2 pr-4 font-mono text-red-700">{h.word}</td>
            <td className="py-2 pr-4">
              <CategoryBadge category={h.category} />
            </td>
            <td className="py-2 pr-4">
              <RiskBadge level={h.risk_level} />
            </td>
            <td className="py-2 pr-4">{h.positions.length}</td>
            <td className="py-2 text-gray-600">{h.suggestion || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WordDictionary({
  words,
  onAdd,
  onDelete,
}: {
  words: ComplianceWordEntry[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const filtered = words.filter((w) => {
    if (filter && !w.word.includes(filter)) return false;
    if (catFilter && w.category !== catFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索词条..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">全部分类</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          添加
        </button>
      </div>

      <div className="text-sm text-gray-500">
        共 {words.length} 条（内置 {words.filter((w) => w.is_builtin).length}
        ，自定义 {words.filter((w) => !w.is_builtin).length}）
        {filter || catFilter ? ` · 筛选结果 ${filtered.length}` : ""}
      </div>

      <div className="border rounded-lg divide-y max-h-[60vh] overflow-y-auto">
        {filtered.map((w) => (
          <div
            key={w.id}
            className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm">{w.word}</span>
              <CategoryBadge category={w.category} />
              <RiskBadge level={w.risk_level} />
              {w.is_builtin && (
                <span className="text-xs text-gray-400">内置</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {w.suggestion && (
                <span className="text-xs text-gray-500">{w.suggestion}</span>
              )}
              {!w.is_builtin && (
                <button
                  onClick={() => onDelete(w.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400">无匹配词条</div>
        )}
      </div>
    </div>
  );
}

function AddWordModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [word, setWord] = useState("");
  const [category, setCategory] = useState("politics");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [suggestion, setSuggestion] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!word.trim()) return;
    setSaving(true);
    try {
      await complianceApi.addWord(
        word.trim(),
        category,
        riskLevel,
        suggestion.trim() || undefined,
      );
      onSaved();
      onClose();
    } catch (e) {
      console.error("Failed to add word:", e);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">添加自定义敏感词</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              敏感词
            </label>
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="输入敏感词"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                风险等级
              </label>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
              >
                <option value="high">高风险</option>
                <option value="medium">中风险</option>
                <option value="low">低风险</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              替换建议（可选）
            </label>
            <input
              type="text"
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="如：改为'XXX'"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!word.trim() || saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ComplianceShieldPage() {
  const [tab, setTab] = useState<"scan" | "dict">("scan");
  const [scanResults, setScanResults] = useState<ComplianceScanResult[]>([]);
  const [words, setWords] = useState<ComplianceWordEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadWords = useCallback(async () => {
    try {
      const w = await complianceApi.listWords();
      setWords(w);
    } catch (e) {
      console.error("Failed to load words:", e);
    }
  }, []);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  const handleScanAll = async () => {
    setScanning(true);
    try {
      const results = await complianceApi.scanAll();
      setScanResults(results);
    } catch (e) {
      console.error("Scan failed:", e);
    }
    setScanning(false);
  };

  const handleDeleteWord = async (id: string) => {
    try {
      await complianceApi.deleteWord(id);
      loadWords();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-indigo-600" />
        <h1 className="text-xl font-semibold">合规盾</h1>
        <span className="text-sm text-gray-500">
          违禁词/敏感词扫描与替换建议
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        <button
          onClick={() => setTab("scan")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "scan"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          扫描结果
        </button>
        <button
          onClick={() => setTab("dict")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "dict"
              ? "border-indigo-600 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          词库管理
        </button>
      </div>

      {tab === "scan" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleScanAll}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {scanning ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              {scanning ? "扫描中..." : "扫描全文"}
            </button>
            {scanResults.length > 0 && (
              <span className="text-sm text-gray-500">
                已扫描 {scanResults.length} 章
              </span>
            )}
          </div>
          <ScanResults results={scanResults} onScanChapter={() => {}} />
        </div>
      )}

      {tab === "dict" && (
        <WordDictionary
          words={words}
          onAdd={() => setShowAddModal(true)}
          onDelete={handleDeleteWord}
        />
      )}

      {showAddModal && (
        <AddWordModal
          onClose={() => setShowAddModal(false)}
          onSaved={loadWords}
        />
      )}
    </div>
  );
}
