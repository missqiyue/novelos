import { useState, useEffect, useMemo, useCallback } from "react";
import { MapPin, Swords, AlertTriangle, Plus, Building2, Users } from "lucide-react";
import { worldApi, type LocationInfo, type FactionInfo } from "../../lib/api";

// ─── Styling helpers ───
const locationTypeConfig: Record<string, { label: string; color: string }> = {
  宗门: { label: "宗门", color: "bg-blue-100 text-blue-700" },
  秘境: { label: "秘境", color: "bg-purple-100 text-purple-700" },
  城市: { label: "城市", color: "bg-emerald-100 text-emerald-700" },
  虚空: { label: "虚空", color: "bg-slate-800 text-slate-100" },
};

const factionTypeConfig: Record<string, { label: string; color: string }> = {
  正道: { label: "正道", color: "bg-amber-100 text-amber-700" },
  魔道: { label: "魔道", color: "bg-red-100 text-red-700" },
  中立: { label: "中立", color: "bg-blue-100 text-blue-700" },
  虚空: { label: "虚空", color: "bg-violet-900 text-violet-100" },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "活跃", color: "bg-green-100 text-green-700" },
  destroyed: { label: "已毁", color: "bg-red-100 text-red-600" },
  sealed: { label: "封印", color: "bg-yellow-100 text-yellow-700" },
  hidden: { label: "隐藏", color: "bg-gray-100 text-gray-500" },
  dissolved: { label: "解散", color: "bg-gray-100 text-gray-500" },
};

function dangerColor(level: number): string {
  if (level <= 3) return "bg-green-500 text-white";
  if (level <= 6) return "bg-yellow-500 text-white";
  if (level <= 8) return "bg-orange-500 text-white";
  return "bg-red-600 text-white";
}

// ─── Quick-add form components ───
type LocationType = "宗门" | "秘境" | "城市" | "虚空";
type FactionType = "正道" | "魔道" | "中立" | "虚空";

function QuickAddLocationForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: { name: string; location_type: string; danger_level: number; description: string; status: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<LocationType>("宗门");
  const [dangerLevel, setDangerLevel] = useState(1);

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      location_type: type,
      danger_level: dangerLevel,
      description: "",
      status: "active",
    });
    setName("");
  };

  return (
    <div className="p-3 border border-gray-200 rounded-lg bg-gray-50/50 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="地点名称"
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          autoFocus
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as LocationType)}
          className="px-2 py-1.5 border border-gray-200 rounded text-sm bg-white"
        >
          <option value="宗门">宗门</option>
          <option value="秘境">秘境</option>
          <option value="城市">城市</option>
          <option value="虚空">虚空</option>
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500 w-16 shrink-0">危险: {dangerLevel}</label>
        <input
          type="range"
          min={1}
          max={10}
          value={dangerLevel}
          onChange={(e) => setDangerLevel(parseInt(e.target.value))}
          className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${dangerColor(dangerLevel)}`}
        >
          {dangerLevel}
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          添加
        </button>
      </div>
    </div>
  );
}

function QuickAddFactionForm({
  onAdd,
  onCancel,
}: {
  onAdd: (data: { name: string; faction_type: string; goal: string; resource_summary: string; status: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<FactionType>("正道");
  const [goal, setGoal] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      faction_type: type,
      goal: goal.trim(),
      resource_summary: "",
      status: "active",
    });
    setName("");
    setGoal("");
  };

  return (
    <div className="p-3 border border-gray-200 rounded-lg bg-gray-50/50 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="势力名称"
          className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-indigo-200"
          autoFocus
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as FactionType)}
          className="px-2 py-1.5 border border-gray-200 rounded text-sm bg-white"
        >
          <option value="正道">正道</option>
          <option value="魔道">魔道</option>
          <option value="中立">中立</option>
          <option value="虚空">虚空</option>
        </select>
      </div>
      <div>
        <input
          type="text"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="势力目标 (可选)"
          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600">
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          添加
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───
export function WorldDashboardPage() {
  const [locations, setLocations] = useState<LocationInfo[]>([]);
  const [factions, setFactions] = useState<FactionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"locations" | "factions">("locations");
  const [showQuickAddLocation, setShowQuickAddLocation] = useState(false);
  const [showQuickAddFaction, setShowQuickAddFaction] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [locData, facData] = await Promise.all([
        worldApi.listLocations(),
        worldApi.listFactions(),
      ]);
      setLocations(locData);
      setFactions(facData);
    } catch {
      setLocations([]);
      setFactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const totalLocations = locations.length;
    const totalFactions = factions.length;
    const dangerZones = locations.filter((l) => (l.danger_level ?? 0) >= 7).length;
    const activeLocations = locations.filter((l) => l.status === "active").length;
    const activeFactions = factions.filter((f) => f.status === "active").length;
    return { totalLocations, totalFactions, dangerZones, activeLocations, activeFactions };
  }, [locations, factions]);

  const handleAddLocation = async (data: {
    name: string;
    location_type: string;
    danger_level: number;
    description: string;
    status: string;
  }) => {
    try {
      await worldApi.createLocation(data);
      await fetchData();
      setShowQuickAddLocation(false);
    } catch {}
  };

  const handleAddFaction = async (data: {
    name: string;
    faction_type: string;
    goal: string;
    resource_summary: string;
    status: string;
  }) => {
    try {
      await worldApi.createFaction(data);
      await fetchData();
      setShowQuickAddFaction(false);
    } catch {}
  };

  const handleDeleteLocation = async (id: string) => {
    try {
      await worldApi.deleteLocation(id);
      await fetchData();
    } catch {}
  };

  const handleDeleteFaction = async (id: string) => {
    try {
      await worldApi.deleteFaction(id);
      await fetchData();
    } catch {}
  };

  return (
    <div className="h-full overflow-auto">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-900">世界构建面板</h2>
        <p className="text-xs text-gray-500 mt-0.5">管理地点、势力与世界元素</p>
      </div>

      <div className="px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <SummaryCard
            icon={MapPin}
            label="总地点"
            value={stats.totalLocations}
            accent="bg-blue-50 text-blue-700"
          />
          <SummaryCard
            icon={Users}
            label="总势力"
            value={stats.totalFactions}
            accent="bg-amber-50 text-amber-700"
          />
          <SummaryCard
            icon={AlertTriangle}
            label="危险区"
            value={stats.dangerZones}
            accent="bg-red-50 text-red-700"
            subtitle="危险等级 >= 7"
          />
          <SummaryCard
            icon={Building2}
            label="活跃地点"
            value={stats.activeLocations}
            accent="bg-green-50 text-green-700"
          />
          <SummaryCard
            icon={Swords}
            label="活跃势力"
            value={stats.activeFactions}
            accent="bg-violet-50 text-violet-700"
          />
        </div>
      </div>

      <div className="px-6 pb-3 flex items-center gap-2">
        <button
          onClick={() => {
            setShowQuickAddLocation(true);
            setShowQuickAddFaction(false);
            setActiveTab("locations");
          }}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={14} />
          快速添加地点
        </button>
        <button
          onClick={() => {
            setShowQuickAddFaction(true);
            setShowQuickAddLocation(false);
            setActiveTab("factions");
          }}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors"
        >
          <Plus size={14} />
          快速添加工会
        </button>
      </div>

      {showQuickAddLocation && (
        <div className="px-6 pb-3">
          <QuickAddLocationForm
            onAdd={handleAddLocation}
            onCancel={() => setShowQuickAddLocation(false)}
          />
        </div>
      )}
      {showQuickAddFaction && (
        <div className="px-6 pb-3">
          <QuickAddFactionForm
            onAdd={handleAddFaction}
            onCancel={() => setShowQuickAddFaction(false)}
          />
        </div>
      )}

      <div className="px-6 border-b border-gray-100">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("locations")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "locations"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <MapPin size={14} />
              地点
              <span className="text-[11px] text-gray-400 font-normal">({locations.length})</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab("factions")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "factions"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Swords size={14} />
              势力
              <span className="text-[11px] text-gray-400 font-normal">({factions.length})</span>
            </span>
          </button>
        </div>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-sm">加载中...</p>
          </div>
        ) : activeTab === "locations" ? (
          <LocationsList locations={locations} onDelete={handleDeleteLocation} />
        ) : (
          <FactionsList factions={factions} onDelete={handleDeleteFaction} />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
  subtitle,
}: {
  icon: typeof MapPin;
  label: string;
  value: number;
  accent: string;
  subtitle?: string;
}) {
  return (
    <div className="p-3 rounded-xl border border-gray-200 bg-white flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${accent} flex items-center justify-center shrink-0`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {subtitle && <div className="text-[10px] text-gray-400">{subtitle}</div>}
      </div>
    </div>
  );
}

function LocationsList({
  locations,
  onDelete,
}: {
  locations: LocationInfo[];
  onDelete: (id: string) => void;
}) {
  if (locations.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <MapPin size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">暂无地点数据</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {locations.map((loc) => {
        const locType = loc.location_type ?? "城市";
        const tConf = locationTypeConfig[locType] || {
          label: locType,
          color: "bg-gray-100 text-gray-600",
        };
        const locStatus = loc.status ?? "active";
        const sConf = statusConfig[locStatus] || {
          label: locStatus,
          color: "bg-gray-100 text-gray-500",
        };
        const danger = loc.danger_level ?? 1;
        return (
          <div
            key={loc.id}
            className="border border-gray-200 rounded-lg p-3 bg-white hover:shadow-sm transition-shadow text-sm"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-gray-900">{loc.name}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${dangerColor(danger)}`}
                >
                  危险 {danger}
                </span>
                <button
                  onClick={() => onDelete(loc.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${tConf.color}`}>
                {tConf.label}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${sConf.color}`}>
                {sConf.label}
              </span>
            </div>
            {loc.description && (
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                {loc.description}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FactionsList({
  factions,
  onDelete,
}: {
  factions: FactionInfo[];
  onDelete: (id: string) => void;
}) {
  if (factions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Swords size={32} className="mx-auto mb-2 opacity-50" />
        <p className="text-sm">暂无势力数据</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {factions.map((fac) => {
        const facType = fac.faction_type ?? "中立";
        const tConf = factionTypeConfig[facType] || {
          label: facType,
          color: "bg-gray-100 text-gray-600",
        };
        const facStatus = fac.status ?? "active";
        const sConf = statusConfig[facStatus] || {
          label: facStatus,
          color: "bg-gray-100 text-gray-500",
        };
        return (
          <div
            key={fac.id}
            className="border border-gray-200 rounded-lg p-3 bg-white hover:shadow-sm transition-shadow text-sm"
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-medium text-gray-900">{fac.name}</span>
              <button
                onClick={() => onDelete(fac.id)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${tConf.color}`}>
                {tConf.label}
              </span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${sConf.color}`}>
                {sConf.label}
              </span>
            </div>
            {fac.goal && (
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{fac.goal}</p>
            )}
            {fac.resource_summary && (
              <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">
                {fac.resource_summary}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
