import { useState, useEffect, useMemo, useCallback } from "react";
import {
  MapPin,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  AlertTriangle,
  Shield,
  Building2,
  Globe,
  Search,
} from "lucide-react";
import { worldApi, type LocationInfo } from "../../lib/api";

// ─── Types ───
type LocationType = "宗门" | "秘境" | "城市" | "虚空";
type LocationStatus = "active" | "destroyed" | "sealed" | "hidden";

// ─── Styling helpers ───
const typeConfig: Record<string, { label: string; color: string; icon: typeof MapPin }> = {
  宗门: { label: "宗门", color: "bg-blue-100 text-blue-700", icon: Building2 },
  秘境: { label: "秘境", color: "bg-purple-100 text-purple-700", icon: Globe },
  城市: { label: "城市", color: "bg-emerald-100 text-emerald-700", icon: Building2 },
  虚空: { label: "虚空", color: "bg-slate-800 text-slate-100", icon: AlertTriangle },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "活跃", color: "bg-green-100 text-green-700" },
  destroyed: { label: "已毁", color: "bg-red-100 text-red-600" },
  sealed: { label: "封印", color: "bg-yellow-100 text-yellow-700" },
  hidden: { label: "隐藏", color: "bg-gray-100 text-gray-500" },
};

function dangerColor(level: number): string {
  if (level <= 3) return "bg-green-500 text-white";
  if (level <= 6) return "bg-yellow-500 text-white";
  if (level <= 8) return "bg-orange-500 text-white";
  return "bg-red-600 text-white";
}

function dangerLabel(level: number): string {
  if (level <= 3) return "低危";
  if (level <= 6) return "中危";
  if (level <= 8) return "高危";
  return "绝险";
}

// ─── Component ───
export function LocationsPage() {
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [form, setForm] = useState<{
    name: string;
    type: LocationType;
    danger_level: number;
    description: string;
    status: LocationStatus;
  }>({ name: "", type: "宗门", danger_level: 1, description: "", status: "active" });

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await worldApi.listLocations();
      setLocations(data);
    } catch {
      setLocations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return locations;
    const q = searchQuery.toLowerCase();
    return locations.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q) ||
        (l.location_type ?? "").toLowerCase().includes(q),
    );
  }, [locations, searchQuery]);

  const resetForm = () => {
    setForm({ name: "", type: "宗门", danger_level: 1, description: "", status: "active" });
  };

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    try {
      await worldApi.createLocation({
        name: form.name.trim(),
        location_type: form.type,
        danger_level: form.danger_level,
        description: form.description.trim(),
        status: form.status,
      });
      await fetchLocations();
      resetForm();
      setShowAddForm(false);
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await worldApi.deleteLocation(id);
      await fetchLocations();
      if (editingId === id) setEditingId(null);
    } catch {}
  };

  const handleStartEdit = (loc: LocationInfo) => {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      type: (loc.location_type as LocationType) ?? "宗门",
      danger_level: loc.danger_level ?? 1,
      description: loc.description ?? "",
      status: (loc.status as LocationStatus) ?? "active",
    });
    setShowAddForm(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !form.name.trim()) return;
    try {
      await worldApi.updateLocation({
        id: editingId,
        name: form.name.trim(),
        location_type: form.type,
        danger_level: form.danger_level,
        description: form.description.trim(),
        status: form.status,
      });
      await fetchLocations();
      setEditingId(null);
      resetForm();
    } catch {}
  };

  const filteredCounts = useMemo(() => {
    const total = filtered.length;
    const dangerZones = filtered.filter((l) => (l.danger_level ?? 0) >= 7).length;
    return { total, dangerZones };
  }, [filtered]);

  const renderForm = () => (
    <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="地点名称"
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
        />
      </div>
      <div className="flex items-center gap-3">
        <select
          value={form.type}
          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as LocationType }))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="宗门">宗门</option>
          <option value="秘境">秘境</option>
          <option value="城市">城市</option>
          <option value="虚空">虚空</option>
        </select>
        <select
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as LocationStatus }))}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="active">活跃</option>
          <option value="destroyed">已毁</option>
          <option value="sealed">封印</option>
          <option value="hidden">隐藏</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">危险等级: {form.danger_level}</label>
        <input
          type="range"
          min={1}
          max={10}
          value={form.danger_level}
          onChange={(e) => setForm((f) => ({ ...f, danger_level: parseInt(e.target.value) }))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>1</span>
          <span>10</span>
        </div>
      </div>
      <div>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="地点描述..."
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
            <h2 className="text-lg font-semibold text-gray-900">地点管理</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              共 {filteredCounts.total} 个地点，{filteredCounts.dangerZones} 个高危险区
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
            添加地点
          </button>
        </div>

        <div className="mt-3 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索地点..."
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
            <MapPin size={40} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">{searchQuery ? "没有匹配的地点" : "暂无地点数据"}</p>
            {!searchQuery && (
              <button
                onClick={() => setShowAddForm(true)}
                className="mt-2 text-indigo-600 text-sm hover:underline"
              >
                添加第一个地点
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((loc) => {
              const locType = loc.location_type ?? "城市";
              const tConf = typeConfig[locType] || {
                label: locType,
                color: "bg-gray-100 text-gray-600",
                icon: MapPin,
              };
              const locStatus = loc.status ?? "active";
              const sConf = statusConfig[locStatus] || {
                label: locStatus,
                color: "bg-gray-100 text-gray-500",
              };
              const TypeIcon = tConf.icon;
              const danger = loc.danger_level ?? 1;

              return (
                <div
                  key={loc.id}
                  className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-sm transition-shadow group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <TypeIcon size={16} className="text-gray-400" />
                      <h3 className="font-medium text-gray-900 text-sm">{loc.name}</h3>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleStartEdit(loc)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors text-gray-400 hover:text-gray-600"
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(loc.id)}
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
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${dangerColor(danger)}`}>
                      危险等级 {danger} · {dangerLabel(danger)}
                    </span>
                  </div>

                  <div className="mb-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${sConf.color}`}>
                      {sConf.label}
                    </span>
                  </div>

                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
                    {loc.description}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
