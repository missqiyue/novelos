import { useEffect, useState } from "react";
import { templateApi, type SoulTemplateInfo, type GenreTemplateInfo } from "../../lib/api";
import { BookOpen, Users, ChevronDown, ChevronRight } from "lucide-react";

export function SoulTemplatesPage() {
  const [templates, setTemplates] = useState<SoulTemplateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      setTemplates(await templateApi.listSoulTemplates(filterCategory || undefined));
    } catch {
      /* empty */
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filterCategory]);

  const parseJson = (json: string) => {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  };

  const categories = [...new Set(templates.map((t) => t.category))];

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">SOUL模板库</h2>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-2 py-1 border border-gray-200 rounded text-sm"
        >
          <option value="">全部类别</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((tmpl) => {
            const personality = parseJson(tmpl.personality_json);
            const speech = parseJson(tmpl.speech_json);
            const behavior = parseJson(tmpl.behavior_json);
            const isOpen = expanded === tmpl.id;

            return (
              <div
                key={tmpl.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : tmpl.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                >
                  <div>
                    <span className="font-medium text-gray-900 text-sm">{tmpl.soul_name}</span>
                    <span className="text-xs text-gray-400 ml-2">{tmpl.category}</span>
                    {tmpl.genre_compat && (
                      <span className="text-xs text-indigo-400 ml-1">({tmpl.genre_compat})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {tmpl.is_builtin && (
                      <span className="text-xs px-1 py-0.5 bg-gray-100 rounded">内置</span>
                    )}
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 border-t border-gray-100 space-y-2 text-sm">
                    <Section title="性格" data={personality} />
                    <Section title="说话风格" data={speech} />
                    <Section title="行为模式" data={behavior} />
                    {tmpl.relationships_json && (
                      <Section title="关系模式" data={parseJson(tmpl.relationships_json)} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Section({ title, data }: { title: string; data: Record<string, any> }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-gray-500 mb-1">{title}</h4>
      <div className="space-y-0.5 text-xs text-gray-700">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-gray-400 shrink-0">{k}:</span>
            <span>{typeof v === "string" ? v : JSON.stringify(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Genre Templates ───

export function GenreTemplatesPage() {
  const [templates, setTemplates] = useState<GenreTemplateInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setTemplates(await templateApi.listGenreTemplates());
      } catch {}
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-lg font-semibold mb-4">题材模板库</h2>
      {loading ? (
        <div className="text-sm text-gray-400">加载中...</div>
      ) : (
        <div className="space-y-3">
          {templates.map((tmpl) => {
            const isOpen = expanded === tmpl.id;
            return (
              <div
                key={tmpl.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : tmpl.id)}
                  className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
                >
                  <span className="font-medium text-gray-900 text-sm">{tmpl.genre_name}</span>
                  <span className="text-xs text-gray-400">{tmpl.genre_id}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 border-t border-gray-100 space-y-2 text-sm">
                    {tmpl.world_framework && <KV label="世界观框架" value={tmpl.world_framework} />}
                    {tmpl.volume_rhythm && <KV label="卷节奏" value={tmpl.volume_rhythm} />}
                    {tmpl.character_archetypes && (
                      <KV label="角色原型" value={tmpl.character_archetypes} />
                    )}
                    {tmpl.thrill_params && <KV label="爽点参数" value={tmpl.thrill_params} />}
                    {tmpl.taboo_rules && <KV label="禁忌规则" value={tmpl.taboo_rules} />}
                    {tmpl.naming_style && <KV label="命名风格" value={tmpl.naming_style} />}
                    {tmpl.naming_examples && <KV label="命名示例" value={tmpl.naming_examples} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-500">{label}:</span>
      <p className="text-xs text-gray-700 mt-0.5 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
