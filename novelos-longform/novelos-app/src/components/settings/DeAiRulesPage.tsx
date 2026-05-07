import { useEffect, useState } from "react";
import { deAiRulesApi, type DeAiRuleInfo } from "../../lib/api";
import { Plus, Trash2, Save, ToggleLeft, ToggleRight, Search } from "lucide-react";

const CATEGORIES = ["vocabulary", "sentence", "rhetoric", "adverb", "idiom", "other"];
const SEVERITIES = ["high", "medium", "low"];

const catLabels: Record<string, string> = {
  vocabulary: "词汇",
  sentence: "句式",
  rhetoric: "修辞",
  adverb: "副词",
  idiom: "成语",
  other: "其他",
};
const sevColors: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-blue-100 text-blue-700",
};

export function DeAiRulesPage() {
  const [rules, setRules] = useState<DeAiRuleInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // New/edit form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    category: "vocabulary",
    pattern: "",
    replacement: "",
    severity: "medium",
    is_enabled: true,
    description: "",
  });

  const load = async () => {
    setLoading(true);
    try {
      setRules(await deAiRulesApi.list());
    } catch {
      /* empty */
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditId(null);
    setFormData({
      category: "vocabulary",
      pattern: "",
      replacement: "",
      severity: "medium",
      is_enabled: true,
      description: "",
    });
    setShowForm(true);
  };

  const openEdit = (rule: DeAiRuleInfo) => {
    setEditId(rule.id);
    setFormData({
      category: rule.category,
      pattern: rule.pattern,
      replacement: rule.replacement || "",
      severity: rule.severity,
      is_enabled: rule.is_enabled,
      description: rule.description || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formData.pattern.trim()) return;
    await deAiRulesApi.upsert({
      id: editId || undefined,
      category: formData.category,
      pattern: formData.pattern,
      replacement: formData.replacement || undefined,
      severity: formData.severity,
      is_enabled: formData.is_enabled,
      description: formData.description || undefined,
    });
    setShowForm(false);
    await load();
  };

  const handleToggle = async (rule: DeAiRuleInfo) => {
    await deAiRulesApi.upsert({
      id: rule.id,
      category: rule.category,
      pattern: rule.pattern,
      replacement: rule.replacement || undefined,
      severity: rule.severity,
      is_enabled: !rule.is_enabled,
      description: rule.description || undefined,
    });
    await load();
  };

  const handleDelete = async (id: string) => {
    await deAiRulesApi.delete(id);
    await load();
  };

  const filtered = rules.filter((r) => {
    if (filterCategory && r.category !== filterCategory) return false;
    if (
      searchTerm &&
      !r.pattern.includes(searchTerm) &&
      !(r.description || "").includes(searchTerm)
    )
      return false;
    return true;
  });

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">去AI规则管理</h2>
        <button
          onClick={openNew}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          <Plus size={14} /> 新建规则
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索规则..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
        >
          <option value="">全部类别</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {catLabels[c]}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-400">
          {filtered.length} / {rules.length} 条
        </span>
      </div>

      {/* Rules table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-medium text-gray-500 border-b border-gray-200">
          <span className="col-span-1">状态</span>
          <span className="col-span-2">类别</span>
          <span className="col-span-3">匹配模式</span>
          <span className="col-span-2">替换</span>
          <span className="col-span-1">严重度</span>
          <span className="col-span-2">说明</span>
          <span className="col-span-1">操作</span>
        </div>
        {loading ? (
          <div className="p-4 text-sm text-gray-400">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">暂无匹配的规则</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((rule) => (
              <div
                key={rule.id}
                className="grid grid-cols-12 gap-2 px-4 py-2 items-center text-sm hover:bg-gray-50"
              >
                <span className="col-span-1">
                  <button
                    onClick={() => handleToggle(rule)}
                    className="text-gray-400 hover:text-indigo-600"
                  >
                    {rule.is_enabled ? (
                      <ToggleRight size={18} className="text-green-500" />
                    ) : (
                      <ToggleLeft size={18} />
                    )}
                  </button>
                </span>
                <span className="col-span-2 text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                  {catLabels[rule.category] || rule.category}
                </span>
                <span className="col-span-3 font-mono text-xs text-gray-800 break-all">
                  {rule.pattern}
                </span>
                <span className="col-span-2 text-xs text-gray-500 break-all">
                  {rule.replacement || "—"}
                </span>
                <span className="col-span-1">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${sevColors[rule.severity] || ""}`}
                  >
                    {rule.severity}
                  </span>
                </span>
                <span className="col-span-2 text-xs text-gray-400 truncate">
                  {rule.description || "—"}
                </span>
                <span className="col-span-1 flex items-center gap-1">
                  <button onClick={() => openEdit(rule)} className="p-1 hover:text-indigo-600">
                    <Save size={12} />
                  </button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setShowForm(false)}
        >
          <div
            className="bg-white rounded-lg p-6 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold mb-4">{editId ? "编辑规则" : "新建规则"}</h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={formData.category}
                  onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {catLabels[c]}
                    </option>
                  ))}
                </select>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData((p) => ({ ...p, severity: e.target.value }))}
                  className="w-24 px-2 py-1.5 border border-gray-200 rounded text-sm"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={formData.pattern}
                onChange={(e) => setFormData((p) => ({ ...p, pattern: e.target.value }))}
                placeholder="匹配模式（如：不禁、竟然）"
                className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm"
              />
              <input
                value={formData.replacement}
                onChange={(e) => setFormData((p) => ({ ...p, replacement: e.target.value }))}
                placeholder="替换建议（可选）"
                className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm"
              />
              <input
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="说明（可选）"
                className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm"
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.is_enabled}
                  onChange={(e) => setFormData((p) => ({ ...p, is_enabled: e.target.checked }))}
                />
                启用
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
