import { useEffect, useMemo, useState } from "react";
import { useProjectStore } from "../../stores";
import { outlineApi } from "../../lib/api";
import {
  emptyBookOutlineDraft,
  parseBookOutlineContent,
  serializeBookOutlineDraft,
  type BookOutlineDraft,
  type BookOutlineVolumeDraft,
} from "../../lib/bookOutline";
import { Check, Edit3, Loader2, Save, Sparkles, BookOpen } from "lucide-react";

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={label === "全书大纲" || label === "卷结构" ? 6 : 3}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
      />
    </label>
  );
}

function VolumeEditor({
  volume,
  index,
  onChange,
  onRemove,
}: {
  volume: BookOutlineVolumeDraft;
  index: number;
  onChange: (next: BookOutlineVolumeDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 text-sm font-semibold">
            {index + 1}
          </span>
          <h3 className="font-medium text-gray-900">第 {volume.volume_number || index + 1} 卷</h3>
        </div>
        <button onClick={onRemove} className="text-sm text-red-500 hover:text-red-600">
          删除
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block md:col-span-2">
          <span className="block text-sm font-medium text-gray-700 mb-1">卷标题</span>
          <input
            value={volume.title}
            onChange={(e) => onChange({ ...volume, title: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">卷序号</span>
          <input
            type="number"
            value={volume.volume_number}
            onChange={(e) =>
              onChange({ ...volume, volume_number: Number(e.target.value) || index + 1 })
            }
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">状态</span>
          <input
            value={volume.status}
            onChange={(e) => onChange({ ...volume, status: e.target.value })}
            placeholder="active / planned"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">起始章节</span>
          <input
            value={volume.chapter_start}
            onChange={(e) => onChange({ ...volume, chapter_start: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-gray-700 mb-1">结束章节</span>
          <input
            value={volume.chapter_end}
            onChange={(e) => onChange({ ...volume, chapter_end: e.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>
      <TextField label="卷目标" value={volume.goal} onChange={(v) => onChange({ ...volume, goal: v })} />
      <TextField
        label="主要冲突"
        value={volume.main_conflict}
        onChange={(v) => onChange({ ...volume, main_conflict: v })}
      />
      <TextField label="爆点" value={volume.climax} onChange={(v) => onChange({ ...volume, climax: v })} />
      <TextField
        label="余波"
        value={volume.settlement}
        onChange={(v) => onChange({ ...volume, settlement: v })}
      />
    </div>
  );
}

export function BookOutlinePage() {
  const { project } = useProjectStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawContent, setRawContent] = useState("");
  const [draft, setDraft] = useState<BookOutlineDraft>(emptyBookOutlineDraft());

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const outline = await outlineApi.getBookOutline();
        if (!alive) return;
        const parsed = outline
          ? parseBookOutlineContent(outline.content_json, project?.title || "")
          : emptyBookOutlineDraft(project?.title || "");
        setDraft(parsed);
        setRawContent(outline?.content_json || serializeBookOutlineDraft(parsed));
      } catch (e: any) {
        if (!alive) return;
        setError(e?.toString() || "读取全书大纲失败");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [project?.title]);

  const previewJson = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(serializeBookOutlineDraft(draft)), null, 2);
    } catch {
      return "";
    }
  }, [draft]);

  const updateVolume = (index: number, next: BookOutlineVolumeDraft) => {
    setDraft((prev) => {
      const volumes = [...prev.volumes];
      volumes[index] = next;
      return { ...prev, volumes };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const contentJson = serializeBookOutlineDraft(draft);
      const result = await outlineApi.saveBookOutline(contentJson, "书籍详情页编辑保存");
      setRawContent(result.content_json);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setError(e?.toString() || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen size={22} className="text-indigo-600" />
            全书大纲
          </h1>
          <p className="text-sm text-gray-500 mt-1">查看并编辑当前项目的全书大纲。</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? "保存中..." : "保存大纲"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          保存成功
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TextField label="书名" value={draft.title} onChange={(v) => setDraft((p) => ({ ...p, title: v }))} />
        <TextField label="题材" value={draft.genre} onChange={(v) => setDraft((p) => ({ ...p, genre: v }))} />
        <TextField label="主旨" value={draft.main_theme} onChange={(v) => setDraft((p) => ({ ...p, main_theme: v }))} />
        <TextField
          label="世界观"
          value={draft.world_framework}
          onChange={(v) => setDraft((p) => ({ ...p, world_framework: v }))}
        />
        <TextField
          label="力量体系"
          value={draft.power_system}
          onChange={(v) => setDraft((p) => ({ ...p, power_system: v }))}
        />
        <TextField
          label="卷结构"
          value={draft.volume_structure}
          onChange={(v) => setDraft((p) => ({ ...p, volume_structure: v }))}
        />
      </div>

      <TextField
        label="全书大纲"
        value={draft.outline}
        onChange={(v) => setDraft((p) => ({ ...p, outline: v }))}
      />
      <TextField
        label="主要角色"
        value={draft.main_characters_text}
        onChange={(v) => setDraft((p) => ({ ...p, main_characters_text: v }))}
        placeholder="一行一个角色，支持直接粘贴列表"
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">分卷</h2>
          <button
            onClick={() =>
              setDraft((p) => ({
                ...p,
                volumes: [
                  ...p.volumes,
                  {
                    volume_number: p.volumes.length + 1,
                    title: "",
                    goal: "",
                    main_conflict: "",
                    climax: "",
                    settlement: "",
                    chapter_start: "",
                    chapter_end: "",
                    status: "",
                    extras: {},
                  },
                ],
              }))
            }
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Edit3 size={14} />
            添加分卷
          </button>
        </div>
        {draft.volumes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-400">
            暂无分卷
          </div>
        ) : (
          <div className="space-y-4">
            {draft.volumes.map((volume, index) => (
              <VolumeEditor
                key={`${volume.volume_number}-${index}`}
                volume={volume}
                index={index}
                onChange={(next) => updateVolume(index, next)}
                onRemove={() =>
                  setDraft((prev) => ({
                    ...prev,
                    volumes: prev.volumes.filter((_, i) => i !== index),
                  }))
                }
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-medium text-gray-700">
          <Sparkles size={14} className="text-indigo-500" />
          当前保存内容预览
        </div>
        <pre className="overflow-auto rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-700">
          {previewJson || rawContent}
        </pre>
      </div>
    </div>
  );
}
