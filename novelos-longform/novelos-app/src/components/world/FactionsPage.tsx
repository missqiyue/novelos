import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Swords,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  Shield,
  Skull,
  Scale,
  Search,
  Target,
  Gem,
} from "lucide-react";
import { worldApi, type FactionInfo } from "../../lib/api";

// ─── Types ───
type FactionType = "正道" | "魔道" | "中立" | "虚空";
type FactionStatus = "active" | "dissolved" | "hidden" | "destroyed";

// ─── Styling helpers ───
const typeConfig: Record<string, { label: string; color: string; icon: typeof Swords }> = {
  正道: { label: "正道", color: "bg-amber-100 text-amber-700", icon: Shield },
  魔道: { label: "魔道", color: "bg-red-100 text-red-700", icon: Skull },
  中立: { label: "中立", color: "bg-blue-100 text-blue-700", icon: Scale },
  虚空: { label: "虚空", color: "bg-violet-900 text-violet-100", icon: Gem },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "活跃", color: "bg-green-100 text-green-700" },
  dissolved: { label: "解散", color: "bg-gray-100 text-gray-500" },
  hidden: { label: "隐世", color: "bg-yellow-100 text-yellow-700" },
  destroyed: { label: "覆灭", color: "bg-red-100 text-red-600" },
};

// ─── Component ───
export function FactionsPage() {
  const [factions, setFactions] = useState<FactionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [form, setForm] = useState<{
    name: string;
    type: FactionType;
    goal: string;
    resource_summary: string;
    status: FactionStatus;
  }>({ name: "", type: "正道", goal: "", resource_summary: "", status: "active" });

  const fetchFactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await worldApi.listFactions();
      setFactions(data);
    } catch {
      setFactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFactions();
  }, [fetchFactions]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return factions;
    const q = searchQuery.toLowerCase();
    return factions.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.goal ?? "").toLowerCase().includes(q) ||
        (f.resource_summary ?? "").toLowerCase().includes(q) ||
        (f.faction_type ?? "").toLowerCase().includes(q),
    );
  }, [factions, searchQuery]);

  const resetForm = () => {
    setForm({ name: "", type: "正道", goal: "", resource_summary: "", status: "active" });
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    try {
      await worldApi.createFaction({
        name: form.name.trim(),
        faction_type: form.type,
        goal: form.goal.trim(),
        resource_summary: form.resource_summary.trim(),
        status: form.status,
      });
      await fetchFactions();
      resetForm();
      setShowAddForm(false);
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await worldApi.deleteFaction(id);
      await fetchFactions();
      if (editingId === id) setEditingId(null);
    } catch {}
  };

  const handleStartEdit = (fac: FactionInfo) => {
    setEditingId(fac.id);
    setForm({
      name: fac.name,
      type: (fac.faction_type as FactionType) ?? "正道",
      goal: fac.goal ?? "",
      resource_summary: fac.resource_summary ?? "",
      status: (fac.status as FactionStatus) ?? "active",
    });
    setShowAddForm(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !form.name.trim()) return;
    try {
      await worldApi.updateFaction({
        id: editingId,
        name: form.name.trim(),
        faction_type: form.type,
        goal: form.goal.trim(),
        resource_summary: form.resource_summary.trim(),
        status: form.status,
      });
      await fetchFactions();
      setEditingId(null);
      resetForm();
    } catch {}
  };

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filtered.forEach((f) => {
      const t = f.faction_type ?? "中立";
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [filtered]);

  const renderForm = () => (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="工会/势力名称"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
        />
      </div>
      <div className="flex items-center gap-3">
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FactionType }))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="正道">正道</option>
          <option value="魔道">魔道</option>
          <option value="中立">中立</option>
          <option value="虚空">虚空</option>
        </select>
        <select
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as FactionStatus }))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="active">活跃</option>
          <option value="dissolved">解散</option>
          <option value="hidden">隐世</option>
          <option value="destroyed">覆灭</option>
        </select>
      </div>
      <div>
        <input
          type="text"
          value={form.goal}
          onChange={(e) => setForm((f) => ({ ...f, goal: e.target.value }))}
          placeholder="势力目标..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        />
      </div>
      <div>
        <textarea
          value={form.resource_summary}
          onChange={(e) => setForm((f) => ({ ...f, resource_summary: e.target.value }))}
          placeholder="资源概况..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => {
            setShowAddForm(false);
            setEditingId(null);
            resetForm();
          }}
          className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg transition-colors"
        >
          取消
        </button>
        <button
          onClick={editingId ? handleSaveEdit : handleAdd}
          disabled={!form.name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <Check size={14} />
          {editingId ? "保存" : "添加"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full overflow-auto">
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">势力/工会管理</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              共 {filtered.length} 个势力
              {Object.entries(typeCounts)
                .filter(([, c]) => c > 0)
                .map(([type, count]) => ` · ${type} ${count}`)
                .join("")}
            </p>
          </div>
          <button
            onClick={() => {
              setShowAddForm(true);
              setEditingId(null);
              resetForm();
            }}
            className="flex items-center gap-1 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={16} />
            添加工会
          </button>
        </div>

        <div className="mt-3 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索势力..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          />
        </div>
      </div>

      <div className="px-6 py-4">
        {(showAddForm || editingId) && <div className="mb-4">{renderForm()}</div>}

        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">加载中...</p>
          </div>
        ) : filtered.length === 0 && !showAddForm ? (
          <div className="text-center py-16 text-gray-400">
            <Swords size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{searchQuery ? "没有匹配的势力" : "暂无势力数据"}</p>
            {!searchQuery && (
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-2 text-indigo-600 text-sm hover:underline"
              >
                添加第一个势力
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((fac) => {
              const facType = fac.faction_type ?? "中立";
              const tConf = typeConfig[facType] || {
                label: facType,
                color: "bg-gray-100 text-gray-600",
                icon: Swords,
              };
              const facStatus = fac.status ?? "active";
              const sConf = statusConfig[facStatus] || {
                label: facStatus,
                color: "bg-gray-100 text-gray-500",
              };
              const TypeIcon = tConf.icon;

              return (
                <div
                  key={fac.id}
                  className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-sm transition-shadow group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TypeIcon size={16} className="text-gray-400" />
                      <h3 className="font-medium text-gray-900 text-sm">{fac.name}</h3>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(fac)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-gray-600"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(fac.id)}
                        className="p-1 hover:bg-red-50 rounded transition-colors text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${tConf.color}`}>
                      {tConf.label}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${sConf.color}`}>
                      {sConf.label}
                    </span>
                  </div>

                  <div className="mb-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Target size={12} className="text-gray-400" />
                      <span className="text-[11px] text-gray-500 font-medium">目标</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                      {fac.goal}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Gem size={12} className="text-gray-400" />
                      <span className="text-[11px] text-gray-500 font-medium">资源</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                      {fac.resource_summary}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
