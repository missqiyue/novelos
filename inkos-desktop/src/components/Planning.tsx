import { useEffect, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { Sparkles, ListTodo, Network, Play, RefreshCw } from 'lucide-react';

type PlanningTab = 'blueprint' | 'outline' | 'threads';

interface BlueprintVersion {
  id: number;
  status: string;
  stage_size: number;
  first_generate_chapters: number;
  book_input_json: string;
  cast_json: string;
  system_json: string;
  meta_json: string;
  created_at: string;
}

interface StagePlanItem {
  stage_id: number;
  start_chapter: number;
  end_chapter: number;
  stage_goal: string;
  main_conflict: string;
  turning_point: string;
  climax: string;
  settlement: string;
  threads: any;
  cast_focus: any;
  system_usage: string;
}

interface OutlineCheckpointItem {
  id: number;
  version_id: number | null;
  start_chapter: number;
  end_chapter: number;
  checkpoint: any;
  created_at: string;
}

interface OutlineRow {
  chapter_number: number;
  one_liner: string;
  tags: string[];
  cast_refs: string[];
  thread_refs: string[];
  locked: boolean;
  updated_at: string;
}

interface StoryThread {
  id: number;
  thread_key: string;
  type: string;
  title: string;
  goal: string;
  stakes: string;
  status: string;
  owner_characters: string[];
  start_chapter: number | null;
  end_chapter: number | null;
  milestones: string[];
  notes: string;
  created_at: string;
  updated_at: string;
}

export function Planning() {
  const [tab, setTab] = useState<PlanningTab>('blueprint');
  const [latest, setLatest] = useState<BlueprintVersion | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(100);
  const [regen, setRegen] = useState(false);
  const [stageCount, setStageCount] = useState(0);
  const [checkpoints, setCheckpoints] = useState<OutlineCheckpointItem[]>([]);
  const [outlineStart, setOutlineStart] = useState(1);
  const [outlineEnd, setOutlineEnd] = useState(200);
  const [outlineRows, setOutlineRows] = useState<OutlineRow[]>([]);
  const [outlineDirty, setOutlineDirty] = useState<Record<number, boolean>>({});
  const [outlineStatus, setOutlineStatus] = useState('');
  const [threads, setThreads] = useState<StoryThread[]>([]);
  const [threadsStatus, setThreadsStatus] = useState('');
  const [threadCount, setThreadCount] = useState(0);
  const [activePlanVersionId, setActivePlanVersionId] = useState<number | null>(null);
  const [setupStep, setSetupStep] = useState<Record<string, { status: 'idle' | 'running' | 'success' | 'error'; message: string }>>({
    cast: { status: 'idle', message: '' },
    system: { status: 'idle', message: '' },
    stage: { status: 'idle', message: '' },
    threads: { status: 'idle', message: '' },
    oneliner: { status: 'idle', message: '' }
  });
  const [isEditingThread, setIsEditingThread] = useState(false);
  const [threadForm, setThreadForm] = useState({
    id: null as number | null,
    thread_key: '',
    type: 'sub',
    title: '',
    goal: '',
    stakes: '',
    status: 'todo',
    owner_characters: [] as string[],
    start_chapter: '' as string,
    end_chapter: '' as string,
    milestones: '' as string,
    notes: ''
  });

  const fetchLatest = async () => {
    if (!isTauri()) return;
    try {
      const v = await invoke<BlueprintVersion | null>('blueprint_get_latest_version');
      setLatest(v);
      try {
        const active = await invoke<number | null>('get_active_plan_version_id');
        setActivePlanVersionId(active);
      } catch {
        setActivePlanVersionId(null);
      }
      if (v) {
        const sp = await invoke<StagePlanItem[]>('get_stage_plan', { versionId: v.id });
        setStageCount(sp.length);
        const cps = await invoke<OutlineCheckpointItem[]>('get_outline_checkpoints', { versionId: v.id, limit: 8 });
        setCheckpoints(cps);
        try {
          const ts = await invoke<StoryThread[]>('get_story_threads', { limit: 1 });
          setThreadCount((ts || []).length);
        } catch {
          setThreadCount(0);
        }
      } else {
        setStageCount(0);
        setCheckpoints([]);
        setThreadCount(0);
      }
    } catch (e) {
      console.error(e);
      setLatest(null);
      setActivePlanVersionId(null);
      setStageCount(0);
      setCheckpoints([]);
      setThreadCount(0);
    }
  };

  useEffect(() => {
    fetchLatest();
  }, []);

  const run = async (fn: () => Promise<any>) => {
    if (isRunning) return;
    setIsRunning(true);
    try {
      await fn();
      await fetchLatest();
    } finally {
      setIsRunning(false);
    }
  };

  const versionId = latest?.id ?? null;
  const firstGenerate = latest?.first_generate_chapters ?? 0;
  const castReady = (() => {
    if (!latest) return false;
    const s = (latest.cast_json || '').trim();
    if (!s || s === '[]') return false;
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) && v.length > 0;
    } catch {
      return true;
    }
  })();
  const systemReady = (() => {
    if (!latest) return false;
    const s = (latest.system_json || '').trim();
    if (!s || s === '{}' || s === 'null') return false;
    try {
      const v = JSON.parse(s);
      return !!(v && typeof v === 'object' && (v.has_system || v.hasSystem));
    } catch {
      return true;
    }
  })();
  const stageReady = stageCount > 0;
  const threadsReady = threadCount > 0;
  const oneLinerReady = (() => {
    if (!latest || firstGenerate <= 0) return false;
    return checkpoints.some((c) => c.start_chapter <= 1 && c.end_chapter >= firstGenerate);
  })();

  const setStep = (k: string, patch: Partial<{ status: 'idle' | 'running' | 'success' | 'error'; message: string }>) => {
    setSetupStep((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  };

  const runSetupStep = async (k: 'cast' | 'system' | 'stage' | 'threads' | 'oneliner') => {
    if (!versionId || isRunning) return;
    setStep(k, { status: 'running', message: '' });
    try {
      if (k === 'cast') {
        const c = await invoke<number>('blueprint_generate_cast', { versionId });
        setStep(k, { status: 'success', message: `新增 ${c}` });
      } else if (k === 'system') {
        const s = await invoke<string>('blueprint_generate_system_spec', { versionId });
        setStep(k, { status: 'success', message: String(s) });
      } else if (k === 'stage') {
        const n = await invoke<number>('blueprint_generate_stage_plan', { versionId });
        setStep(k, { status: 'success', message: `写入 ${n}` });
      } else if (k === 'threads') {
        const n = await invoke<number>('blueprint_seed_threads_from_stage_plan', { versionId });
        setStep(k, { status: 'success', message: `新增 ${n}` });
      } else if (k === 'oneliner') {
        const n = await invoke<number>('blueprint_generate_one_liner_batch', { versionId, startChapter: 1, endChapter: firstGenerate, regen: false });
        setStep(k, { status: 'success', message: `写入 ${n}` });
      }
      await fetchLatest();
    } catch (e) {
      console.error(e);
      setStep(k, { status: 'error', message: String(e) });
    }
  };

  const runSetupAll = async () => {
    if (!versionId || isRunning) return;
    await run(async () => {
      const order: Array<'cast' | 'system' | 'stage' | 'threads' | 'oneliner'> = ['cast', 'system', 'stage', 'threads', 'oneliner'];
      for (const k of order) {
        setStep(k, { status: 'running', message: '' });
        try {
          if (k === 'cast') {
            const c = await invoke<number>('blueprint_generate_cast', { versionId });
            setStep(k, { status: 'success', message: `新增 ${c}` });
          } else if (k === 'system') {
            const s = await invoke<string>('blueprint_generate_system_spec', { versionId });
            setStep(k, { status: 'success', message: String(s) });
          } else if (k === 'stage') {
            const n = await invoke<number>('blueprint_generate_stage_plan', { versionId });
            setStep(k, { status: 'success', message: `写入 ${n}` });
          } else if (k === 'threads') {
            const n = await invoke<number>('blueprint_seed_threads_from_stage_plan', { versionId });
            setStep(k, { status: 'success', message: `新增 ${n}` });
          } else if (k === 'oneliner') {
            const n = await invoke<number>('blueprint_generate_one_liner_batch', { versionId, startChapter: 1, endChapter: firstGenerate, regen: false });
            setStep(k, { status: 'success', message: `写入 ${n}` });
          }
        } catch (e) {
          console.error(e);
          setStep(k, { status: 'error', message: String(e) });
          break;
        }
      }
    });
  };
  const parsedBookInput = (() => {
    if (!latest) return null;
    try {
      return JSON.parse(latest.book_input_json || '{}');
    } catch {
      return null;
    }
  })();

  const fetchOutlineRows = async (start: number, end: number) => {
    if (!isTauri()) return;
    try {
      const rows = await invoke<OutlineRow[]>('get_outline_rows', { startChapter: start, endChapter: end });
      const map = new Map(rows.map((r) => [r.chapter_number, r]));
      const filled: OutlineRow[] = [];
      for (let i = start; i <= end; i++) {
        const r = map.get(i);
        filled.push(
          r ?? {
            chapter_number: i,
            one_liner: '',
            tags: [],
            cast_refs: [],
            thread_refs: [],
            locked: false,
            updated_at: ''
          }
        );
      }
      setOutlineRows(filled);
      setOutlineDirty({});
    } catch (e) {
      console.error(e);
      setOutlineRows([]);
    }
  };

  const fetchThreads = async () => {
    if (!isTauri()) return;
    try {
      const list = await invoke<StoryThread[]>('get_story_threads', { limit: 500 });
      setThreads(list);
    } catch (e) {
      console.error(e);
      setThreads([]);
    }
  };

  return (
    <main className="flex-1 flex flex-col bg-white relative transition-all duration-300">
      <header className="h-14 border-b border-zinc-200 flex items-center justify-between px-6 bg-white z-10">
        <div className="flex items-center space-x-2 text-sm text-zinc-500">
          <span className="text-zinc-800 font-medium">策划</span>
          <span className="text-zinc-400">/</span>
          <span className="text-zinc-500">{tab === 'blueprint' ? '蓝图' : tab === 'outline' ? '全书大纲' : '任务看板'}</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={fetchLatest}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          >
            刷新
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <div className="border-b border-zinc-200 px-6 py-3 flex items-center gap-2">
          <button
            onClick={() => setTab('blueprint')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center ${
              tab === 'blueprint' ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            蓝图
          </button>
          <button
            onClick={() => setTab('outline')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center ${
              tab === 'outline' ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5 mr-1" />
            全书大纲
          </button>
          <button
            onClick={() => setTab('threads')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center ${
              tab === 'threads' ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            <Network className="w-3.5 h-3.5 mr-1" />
            任务看板
          </button>
          <div className="ml-auto text-xs text-zinc-500 truncate max-w-[520px]">
            {latest
              ? `蓝图版本 #${latest.id} · active=${activePlanVersionId ?? '-'} · stage_size=${latest.stage_size} · first=${latest.first_generate_chapters}`
              : `暂无蓝图版本 · active=${activePlanVersionId ?? '-'}`}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-10 py-8 bg-zinc-50/10 min-h-0 pb-20">
          <div className="max-w-5xl mx-auto">
            {!isTauri() ? (
              <div className="text-sm text-zinc-500">
                浏览器预览模式不支持策划生成与本地数据库写入，请使用桌面端窗口。
              </div>
            ) : tab === 'blueprint' ? (
              <div className="space-y-4">
                <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-bold text-zinc-800 truncate">蓝图版本 {versionId ? `#${versionId}` : '未创建'}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {parsedBookInput?.book_title ? `${parsedBookInput.book_title} · ${parsedBookInput.genre || ''}` : '未读取到 book_input_json'}
                      </div>
                      <div className="text-xs text-zinc-500 mt-1">
                        stage_size={latest?.stage_size ?? '-'} · first_generate={latest?.first_generate_chapters ?? '-'} · stages={stageCount}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {versionId && (
                        <button
                          disabled={isRunning}
                          onClick={() =>
                            run(async () => {
                              await invoke('set_active_plan_version_id', { versionId });
                              await fetchLatest();
                            })
                          }
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          设为生效版本
                        </button>
                      )}
                      <button
                        onClick={() => fetchLatest()}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 flex items-center"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1" />
                        刷新
                      </button>
                    </div>
                  </div>
                  {status && <div className="text-xs text-zinc-500 mt-3">{status}</div>}
                </div>

                <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-bold text-zinc-800">初始化向导（可分步/可重试）</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        失败不会回滚已完成步骤。建议按顺序执行：人物 → 系统 → 阶段 → 任务 → 首批 one-liner。
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={!versionId || isRunning}
                        onClick={() => runSetupAll()}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        一键执行全部
                      </button>
                      <button
                        disabled={isRunning}
                        onClick={() => fetchLatest()}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                      >
                        刷新状态
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {[
                      { k: 'cast' as const, label: '1) 生成人物（含 SOUL core）', done: castReady },
                      { k: 'system' as const, label: '2) 判断系统/金手指', done: systemReady },
                      { k: 'stage' as const, label: '3) 生成阶段规划', done: stageReady },
                      { k: 'threads' as const, label: '4) 初始化任务看板', done: threadsReady },
                      { k: 'oneliner' as const, label: `5) 生成首批 one-liner（1-${firstGenerate || '-'}）`, done: oneLinerReady }
                    ].map((it) => {
                      const st = setupStep[it.k];
                      const badge =
                        st.status === 'running'
                          ? 'bg-blue-50 text-blue-700'
                          : st.status === 'success'
                          ? 'bg-green-50 text-green-700'
                          : st.status === 'error'
                          ? 'bg-red-50 text-red-700'
                          : it.done
                          ? 'bg-green-50 text-green-700'
                          : 'bg-zinc-100 text-zinc-600';
                      const badgeText =
                        st.status === 'running'
                          ? '进行中'
                          : st.status === 'success'
                          ? '完成'
                          : st.status === 'error'
                          ? '失败'
                          : it.done
                          ? '已完成'
                          : '未执行';
                      return (
                        <div key={it.k} className="flex items-start justify-between gap-3 border border-zinc-100 rounded-lg px-4 py-3 bg-zinc-50/40">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-medium text-zinc-800">{it.label}</div>
                              <span className={`text-[11px] px-2 py-0.5 rounded ${badge}`}>{badgeText}</span>
                            </div>
                            {(st.message || (st.status === 'idle' && it.done)) && (
                              <div className="text-xs text-zinc-500 mt-1 whitespace-pre-wrap break-words">
                                {st.message || '已存在数据，可重试覆盖生成。'}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              disabled={!versionId || isRunning || (it.k === 'oneliner' && (!firstGenerate || firstGenerate <= 0))}
                              onClick={() => runSetupStep(it.k)}
                              className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-white hover:bg-zinc-900 disabled:opacity-50"
                            >
                              {st.status === 'error' || it.done ? '重试' : '执行'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-zinc-800">生成与落库</div>
                    <div className="text-xs text-zinc-500">所有按钮都会写入当前打开的书籍数据库</div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 lg:grid-cols-4 gap-3 items-end">
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 mb-1">范围 start</div>
                      <input
                        type="number"
                        value={rangeStart}
                        onChange={(e) => setRangeStart(Number(e.target.value))}
                        className="w-full p-2 text-sm border border-zinc-200 rounded"
                        min={1}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 mb-1">范围 end</div>
                      <input
                        type="number"
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(Number(e.target.value))}
                        className="w-full p-2 text-sm border border-zinc-200 rounded"
                        min={1}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id="regen"
                        type="checkbox"
                        checked={regen}
                        onChange={(e) => setRegen(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <label htmlFor="regen" className="text-xs text-zinc-600">
                        重生成（跳过 locked）
                      </label>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        disabled={!versionId || isRunning}
                        onClick={() =>
                          run(async () => {
                            setStatus(`生成 one-liner：${rangeStart}-${rangeEnd}…`);
                            const n = await invoke<number>('blueprint_generate_one_liner_batch', {
                              versionId,
                              startChapter: rangeStart,
                              endChapter: rangeEnd,
                              regen
                            });
                            setStatus(`one-liner 写入完成：${n} 条`);
                          })
                        }
                        className="px-3 py-2 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center"
                      >
                        <Play className="w-3.5 h-3.5 mr-1" />
                        生成范围
                      </button>
                      <button
                        disabled={!versionId || isRunning}
                        onClick={() =>
                          run(async () => {
                            setStatus('继续生成下一批 +100…');
                            const n = await invoke<number>('blueprint_continue_next_batch', { versionId, batchSize: 100 });
                            setStatus(n === 0 ? '已到达目标章节数' : `继续生成完成：写入 ${n} 条`);
                          })
                        }
                        className="px-3 py-2 rounded-md text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        继续 +100
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      disabled={!versionId || isRunning}
                      onClick={() =>
                        run(async () => {
                          setStatus(`生成 SOUL timeline：${rangeStart}-${rangeEnd}…`);
                          const n = await invoke<number>('blueprint_generate_soul_timeline_for_range', {
                            versionId,
                            startChapter: rangeStart,
                            endChapter: rangeEnd
                          });
                          setStatus(`SOUL timeline 写入完成：${n} 条`);
                        })
                      }
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      生成 SOUL timeline（范围）
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                  <div className="text-sm font-bold text-zinc-800">最近 Checkpoints</div>
                  {checkpoints.length === 0 ? (
                    <div className="text-xs text-zinc-500 mt-2">暂无 checkpoint。</div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {checkpoints.map((c) => (
                        <div key={c.id} className="text-xs bg-zinc-50 border border-zinc-100 rounded px-3 py-2 flex items-center justify-between gap-3">
                          <span className="text-zinc-700">
                            {c.start_chapter}-{c.end_chapter}
                          </span>
                          <span className="text-zinc-400 truncate flex-1">{c.checkpoint?.mainline_progress || ''}</span>
                          <span className="text-zinc-400">{c.created_at}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : tab === 'outline' ? (
              <div className="space-y-4">
                <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-bold text-zinc-800">全书大纲（范围编辑）</div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={isRunning}
                        onClick={() =>
                          run(async () => {
                            setOutlineStatus('加载中…');
                            await fetchOutlineRows(outlineStart, outlineEnd);
                            setOutlineStatus('');
                          })
                        }
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                      >
                        加载范围
                      </button>
                      <button
                        disabled={isRunning || Object.keys(outlineDirty).length === 0}
                        onClick={() =>
                          run(async () => {
                            setOutlineStatus('保存中…');
                            const patches = outlineRows
                              .filter((r) => outlineDirty[r.chapter_number])
                              .map((r) => ({ chapter_number: r.chapter_number, one_liner: r.one_liner }));
                            await invoke<number>('save_outline_patches', { patches });
                            await invoke('recompute_outline_checkpoint', { versionId: versionId ?? 0, startChapter: outlineStart, endChapter: outlineEnd });
                            setOutlineStatus('已保存');
                            await fetchOutlineRows(outlineStart, outlineEnd);
                            setTimeout(() => setOutlineStatus(''), 1500);
                          })
                        }
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        保存修改
                      </button>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-3 items-end">
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 mb-1">start</div>
                      <input
                        type="number"
                        value={outlineStart}
                        onChange={(e) => setOutlineStart(Number(e.target.value))}
                        className="w-full p-2 text-sm border border-zinc-200 rounded"
                        min={1}
                      />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 mb-1">end</div>
                      <input
                        type="number"
                        value={outlineEnd}
                        onChange={(e) => setOutlineEnd(Number(e.target.value))}
                        className="w-full p-2 text-sm border border-zinc-200 rounded"
                        min={1}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        disabled={isRunning}
                        onClick={() =>
                          run(async () => {
                            setOutlineStatus('锁定范围…');
                            await invoke<number>('set_outline_locked_range', { startChapter: outlineStart, endChapter: outlineEnd, locked: true });
                            await fetchOutlineRows(outlineStart, outlineEnd);
                            setOutlineStatus('已锁定');
                            setTimeout(() => setOutlineStatus(''), 1500);
                          })
                        }
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 text-white hover:bg-zinc-900 disabled:opacity-50"
                      >
                        锁定范围
                      </button>
                      <button
                        disabled={isRunning}
                        onClick={() =>
                          run(async () => {
                            setOutlineStatus('解锁范围…');
                            await invoke<number>('set_outline_locked_range', { startChapter: outlineStart, endChapter: outlineEnd, locked: false });
                            await fetchOutlineRows(outlineStart, outlineEnd);
                            setOutlineStatus('已解锁');
                            setTimeout(() => setOutlineStatus(''), 1500);
                          })
                        }
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                      >
                        解锁范围
                      </button>
                    </div>
                    <div className="text-xs text-zinc-500">{outlineStatus}</div>
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                    <div className="col-span-1">章</div>
                    <div className="col-span-9">one-liner</div>
                    <div className="col-span-2 text-right">locked</div>
                  </div>
                  <div className="max-h-[70vh] overflow-y-auto">
                    {outlineRows.length === 0 ? (
                      <div className="p-6 text-sm text-zinc-500">暂无数据，先加载范围。</div>
                    ) : (
                      outlineRows.map((r) => (
                        <div key={r.chapter_number} className="grid grid-cols-12 gap-2 px-5 py-3 border-b border-zinc-100 items-start">
                          <div className="col-span-1 text-xs text-zinc-500 pt-2">{r.chapter_number}</div>
                          <div className="col-span-9">
                            <textarea
                              value={r.one_liner}
                              onChange={(e) => {
                                const v = e.target.value;
                                setOutlineRows((prev) => prev.map((x) => (x.chapter_number === r.chapter_number ? { ...x, one_liner: v } : x)));
                                setOutlineDirty((prev) => ({ ...prev, [r.chapter_number]: true }));
                              }}
                              disabled={r.locked}
                              rows={2}
                              className="w-full p-2 text-sm border border-zinc-200 rounded bg-white disabled:bg-zinc-50 disabled:text-zinc-500"
                              placeholder="每章一句话推进"
                            />
                            <div className="text-[10px] text-zinc-400 mt-1 truncate">{r.updated_at}</div>
                          </div>
                          <div className="col-span-2 flex justify-end pt-2">
                            <span className={`text-xs px-2 py-1 rounded ${r.locked ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                              {r.locked ? 'locked' : 'open'}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-bold text-zinc-800">任务看板</div>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={isRunning}
                        onClick={() =>
                          run(async () => {
                            setThreadsStatus('加载中…');
                            await fetchThreads();
                            setThreadsStatus('');
                          })
                        }
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                      >
                        刷新
                      </button>
                      <button
                        disabled={isRunning}
                        onClick={() => {
                          setThreadForm({
                            id: null,
                            thread_key: '',
                            type: 'sub',
                            title: '',
                            goal: '',
                            stakes: '',
                            status: 'todo',
                            owner_characters: [],
                            start_chapter: '',
                            end_chapter: '',
                            milestones: '',
                            notes: ''
                          });
                          setIsEditingThread(true);
                        }}
                        className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        新建任务
                      </button>
                      <div className="text-xs text-zinc-500">{threadsStatus}</div>
                    </div>
                  </div>
                </div>

                {isEditingThread && (
                  <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-zinc-800">{threadForm.id ? '编辑任务' : '新建任务'}</div>
                      <button
                        onClick={() => setIsEditingThread(false)}
                        className="text-xs px-3 py-1.5 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                      >
                        关闭
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs font-semibold text-zinc-500 mb-1">标题</div>
                        <input
                          value={threadForm.title}
                          onChange={(e) => setThreadForm({ ...threadForm, title: e.target.value })}
                          className="w-full p-2 text-sm border border-zinc-200 rounded"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-500 mb-1">类型</div>
                        <select
                          value={threadForm.type}
                          onChange={(e) => setThreadForm({ ...threadForm, type: e.target.value })}
                          className="w-full p-2 text-sm border border-zinc-200 rounded bg-white"
                        >
                          <option value="main">main</option>
                          <option value="sub">sub</option>
                          <option value="character">character</option>
                          <option value="mystery">mystery</option>
                          <option value="growth">growth</option>
                        </select>
                      </div>
                      <div className="lg:col-span-2">
                        <div className="text-xs font-semibold text-zinc-500 mb-1">目标（goal）</div>
                        <input
                          value={threadForm.goal}
                          onChange={(e) => setThreadForm({ ...threadForm, goal: e.target.value })}
                          className="w-full p-2 text-sm border border-zinc-200 rounded"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <div className="text-xs font-semibold text-zinc-500 mb-1">代价（stakes）</div>
                        <input
                          value={threadForm.stakes}
                          onChange={(e) => setThreadForm({ ...threadForm, stakes: e.target.value })}
                          className="w-full p-2 text-sm border border-zinc-200 rounded"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-500 mb-1">start_chapter</div>
                        <input
                          value={threadForm.start_chapter}
                          onChange={(e) => setThreadForm({ ...threadForm, start_chapter: e.target.value })}
                          className="w-full p-2 text-sm border border-zinc-200 rounded"
                          placeholder="可空"
                        />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-zinc-500 mb-1">end_chapter</div>
                        <input
                          value={threadForm.end_chapter}
                          onChange={(e) => setThreadForm({ ...threadForm, end_chapter: e.target.value })}
                          className="w-full p-2 text-sm border border-zinc-200 rounded"
                          placeholder="可空"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <div className="text-xs font-semibold text-zinc-500 mb-1">milestones（一行一个）</div>
                        <textarea
                          value={threadForm.milestones}
                          onChange={(e) => setThreadForm({ ...threadForm, milestones: e.target.value })}
                          className="w-full p-2 text-sm border border-zinc-200 rounded h-20 resize-none"
                        />
                      </div>
                      <div className="lg:col-span-2">
                        <div className="text-xs font-semibold text-zinc-500 mb-1">notes</div>
                        <textarea
                          value={threadForm.notes}
                          onChange={(e) => setThreadForm({ ...threadForm, notes: e.target.value })}
                          className="w-full p-2 text-sm border border-zinc-200 rounded h-20 resize-none"
                        />
                      </div>
                      <div className="flex gap-2 justify-end lg:col-span-2">
                        <button
                          disabled={isRunning || !threadForm.title.trim()}
                          onClick={() =>
                            run(async () => {
                              setThreadsStatus('保存中…');
                              await invoke<number>('upsert_story_thread', {
                                thread: {
                                  id: threadForm.id,
                                  thread_key: threadForm.thread_key ? threadForm.thread_key : null,
                                  type: threadForm.type,
                                  title: threadForm.title,
                                  goal: threadForm.goal,
                                  stakes: threadForm.stakes,
                                  status: threadForm.status,
                                  owner_characters: threadForm.owner_characters,
                                  start_chapter: threadForm.start_chapter.trim() === '' ? null : Number(threadForm.start_chapter),
                                  end_chapter: threadForm.end_chapter.trim() === '' ? null : Number(threadForm.end_chapter),
                                  milestones: threadForm.milestones
                                    .split('\n')
                                    .map((x) => x.trim())
                                    .filter(Boolean),
                                  notes: threadForm.notes
                                }
                              });
                              await fetchThreads();
                              setThreadsStatus('已保存');
                              setTimeout(() => setThreadsStatus(''), 1200);
                              setIsEditingThread(false);
                            })
                          }
                          className="px-3 py-2 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  {(['todo', 'doing', 'done', 'parked'] as const).map((st) => (
                    <div key={st} className="bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden">
                      <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50 text-sm font-bold text-zinc-800">
                        {st.toUpperCase()}
                      </div>
                      <div className="p-3 space-y-3 min-h-[240px]">
                        {threads
                          .filter((t) => t.status === st)
                          .map((t) => (
                            <div key={t.id} className="border border-zinc-200 rounded-lg p-3 bg-white">
                              <div className="text-sm font-semibold text-zinc-800">{t.title}</div>
                              <div className="text-xs text-zinc-500 mt-1 truncate">{t.thread_key} · {t.type}</div>
                              {t.goal && <div className="text-xs text-zinc-700 mt-2">{t.goal}</div>}
                              <div className="flex flex-wrap gap-2 mt-3">
                                {(['todo', 'doing', 'done', 'parked'] as const)
                                  .filter((x) => x !== st)
                                  .map((x) => (
                                    <button
                                      key={x}
                                      disabled={isRunning}
                                      onClick={() =>
                                        run(async () => {
                                          await invoke<number>('upsert_story_thread', {
                                            thread: {
                                              id: t.id,
                                              thread_key: t.thread_key,
                                              type: t.type,
                                              title: t.title,
                                              goal: t.goal,
                                              stakes: t.stakes,
                                              status: x,
                                              owner_characters: t.owner_characters,
                                              start_chapter: t.start_chapter,
                                              end_chapter: t.end_chapter,
                                              milestones: t.milestones,
                                              notes: t.notes
                                            }
                                          });
                                          await fetchThreads();
                                        })
                                      }
                                      className="text-[11px] px-2 py-1 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                                    >
                                      → {x}
                                    </button>
                                  ))}
                              </div>
                              <div className="flex gap-2 mt-3 justify-end">
                                <button
                                  disabled={isRunning}
                                  onClick={() => {
                                    setThreadForm({
                                      id: t.id,
                                      thread_key: t.thread_key,
                                      type: t.type,
                                      title: t.title,
                                      goal: t.goal,
                                      stakes: t.stakes,
                                      status: t.status,
                                      owner_characters: t.owner_characters,
                                      start_chapter: t.start_chapter === null ? '' : String(t.start_chapter),
                                      end_chapter: t.end_chapter === null ? '' : String(t.end_chapter),
                                      milestones: (t.milestones || []).join('\n'),
                                      notes: t.notes
                                    });
                                    setIsEditingThread(true);
                                  }}
                                  className="text-xs px-3 py-1 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                                >
                                  编辑
                                </button>
                                <button
                                  disabled={isRunning}
                                  onClick={() =>
                                    run(async () => {
                                      await invoke('delete_story_thread', { id: t.id });
                                      await fetchThreads();
                                    })
                                  }
                                  className="text-xs px-3 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                                >
                                  删除
                                </button>
                              </div>
                            </div>
                          ))}
                        {threads.filter((t) => t.status === st).length === 0 && (
                          <div className="text-xs text-zinc-400 px-2 py-6 text-center">空</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
