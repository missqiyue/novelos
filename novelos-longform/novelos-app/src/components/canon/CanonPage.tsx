import { useEffect, useState } from "react";
import { useCanonStore } from "../../stores";
import { canonApi } from "../../lib/api";
import type { CanonRuleVersionInfo } from "../../lib/api";
import { Plus, Shield, Lock, Unlock, ChevronRight, X, History, Eye, Search } from "lucide-react";
import { ContextHelp } from "../common/ContextHelp";

const scopeLabels: Record<string, string> = {
  global: "全局",
  character: "角色",
  location: "地点",
  faction: "势力",
  volume: "卷",
  arc: "篇章",
  chapter: "章节",
};

const typeLabels: Record<string, string> = {
  soft_rule: "软规则",
  hard_rule: "硬规则",
  constraint: "约束",
  setting: "设定",
};

export function CanonPage() {
  const { rules, selectedRule, loading, fetch, selectRule, createRule, updateRule, deleteRule } =
    useCanonStore();
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newScope, setNewScope] = useState("global");
  const [newHard, setNewHard] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<CanonRuleVersionInfo[]>([]);
  const [viewingVersion, setViewingVersion] = useState<CanonRuleVersionInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<typeof rules>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (selectedRule) {
      setEditContent(selectedRule.content);
    }
  }, [selectedRule]);

  const handleCreate = async () => {
    if (!newKey.trim() || !newName.trim() || !newContent.trim()) return;
    await createRule({
      rule_key: newKey.trim(),
      rule_name: newName.trim(),
      content: newContent.trim(),
      scope_type: newScope,
      is_hard: newHard,
    });
    setNewKey("");
    setNewName("");
    setNewContent("");
    setShowCreate(false);
  };

  const handleSave = async () => {
    if (!selectedRule || editContent === selectedRule.content) return;
    await updateRule(selectedRule.id, editContent, undefined, undefined, undefined, "手动编辑");
  };

  const handleToggleFreeze = async () => {
    if (!selectedRule) return;
    const newStatus = selectedRule.status === "frozen" ? "active" : "frozen";
    await updateRule(selectedRule.id, undefined, undefined, newStatus);
  };

  const handleFetchVersions = async () => {
    if (!selectedRule) return;
    try {
      const v = await canonApi.listVersions(selectedRule.id);
      setVersions(v);
    } catch {
      /* no versions */
    }
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const results = await canonApi.search(q.trim());
      setSearchResults(results);
    } catch {
      /* search failed */
    }
    setIsSearching(false);
  };

  useEffect(() => {
    if (showVersions && selectedRule) handleFetchVersions();
  }, [showVersions, selectedRule?.id]);

  const displayRules = searchQuery.trim() ? searchResults : rules;

  return (
    <div className="flex h-full">
      {/* Left: Rule list */}
      <div className="w-72 border-r border-gray-200 bg-white overflow-auto flex flex-col">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 w-full px-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100"
          >
            <Plus size={16} />
            新建规则
          </button>
          <ContextHelp
            id="canon_create_rule"
            text={
              "正典规则是小说世界的“宪法”。硬规则不可违反（编译会报错），软规则是建议。规则支持版本管理，修改后会自动记录历史。"
            }
            position="bottom"
          />
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="搜索规则..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {loading || isSearching ? (
          <div className="p-4 text-sm text-gray-500">加载中...</div>
        ) : (
          <div className="divide-y divide-gray-50 overflow-auto flex-1">
            {searchQuery.trim() && (
              <div className="px-4 py-2 text-xs text-gray-400">
                搜索 "{searchQuery}" — {displayRules.length} 条结果
              </div>
            )}
            {displayRules.map((rule) => (
              <button
                key={rule.id}
                onClick={() => selectRule(rule)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  selectedRule?.id === rule.id ? "bg-indigo-50" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  {rule.is_hard ? (
                    <Lock size={14} className="text-red-500" />
                  ) : (
                    <Shield size={14} className="text-gray-400" />
                  )}
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {rule.rule_name}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400">
                    {scopeLabels[rule.scope_type] || rule.scope_type}
                  </span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-400">
                    {typeLabels[rule.rule_type] || rule.rule_type}
                  </span>
                  {rule.status === "frozen" && (
                    <span className="text-xs text-blue-500">已冻结</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Center: Rule detail */}
      <div className="flex-1 overflow-auto p-6">
        {selectedRule ? (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selectedRule.rule_name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                    {selectedRule.rule_key}
                  </code>
                  <span className="text-xs text-gray-400">v{selectedRule.version}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleFreeze}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm ${
                    selectedRule.status === "frozen"
                      ? "bg-green-50 text-green-700 hover:bg-green-100"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  {selectedRule.status === "frozen" ? <Unlock size={14} /> : <Lock size={14} />}
                  {selectedRule.status === "frozen" ? "解冻" : "冻结"}
                </button>
                <button
                  onClick={() => {
                    deleteRule(selectedRule.id);
                  }}
                  className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                >
                  删除
                </button>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">规则内容</label>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                disabled={selectedRule.status === "frozen"}
                className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>

            {editContent !== selectedRule.content && selectedRule.status !== "frozen" && (
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
              >
                保存修改
              </button>
            )}

            {/* Version history */}
            <div className="mt-6 border-t border-gray-200 pt-4">
              <button
                onClick={() => setShowVersions(!showVersions)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <History size={14} />
                版本历史 (v{selectedRule.version})
                <ChevronRight
                  size={14}
                  className={`transform transition-transform ${showVersions ? "rotate-90" : ""}`}
                />
              </button>
              {showVersions && (
                <div className="mt-3 space-y-2">
                  {versions.length === 0 ? (
                    <p className="text-sm text-gray-400">暂无历史版本</p>
                  ) : (
                    versions.map((v) => (
                      <div key={v.id} className="border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700">v{v.version}</span>
                            <span className="text-xs text-gray-400">
                              {new Date(v.created_at).toLocaleString()}
                            </span>
                            {v.change_reason && (
                              <span className="text-xs text-gray-500">— {v.change_reason}</span>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              setViewingVersion(viewingVersion?.id === v.id ? null : v)
                            }
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                          >
                            <Eye size={12} />
                            查看
                          </button>
                        </div>
                        {viewingVersion?.id === v.id && (
                          <div className="mt-2">
                            <pre className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-48 overflow-auto">
                              {v.content}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400">
            <Shield size={48} className="mx-auto mb-4" />
            <p>选择一条规则查看详情</p>
          </div>
        )}

        {showCreate && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">新建正典规则</h3>
                <button onClick={() => setShowCreate(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="规则键 (如: power_system)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="规则名称"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <select
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {Object.entries(scopeLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="规则内容..."
                  className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newHard}
                    onChange={(e) => setNewHard(e.target.checked)}
                  />
                  硬规则 (不可违反)
                </label>
                <button
                  onClick={handleCreate}
                  className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
                >
                  创建
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
