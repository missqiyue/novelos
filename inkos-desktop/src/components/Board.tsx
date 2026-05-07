import { useState, useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { GitBranch, BookOpen, AlertTriangle, Zap, XCircle, ArrowRight, Book, ArrowLeft, Layers, CheckCircle2 } from 'lucide-react';

export interface PendingHook {
  id: number;
  hook_desc: string;
  created_at_chapter: number;
  staleness: number;
  is_resolved: boolean;
  resolved_at_chapter: number | null;
}

export interface BoardTotals {
  total_chars: number;
  chapter_count: number;
  open_hooks_count: number;
  open_consequences_count: number;
  failed_reviews_recent: number;
}

export interface BoardBook {
  title: string;
  genre: string;
  logline: string;
}

export interface Consequence {
  id: number;
  chapter_number: number;
  upgrade_desc: string;
  consequence_hook: string;
  is_resolved: boolean;
}

export interface FailedReview {
  chapter_number: number;
  created_at: string;
  review_summary: string;
}

export interface BoardOverview {
  book: BoardBook;
  totals: BoardTotals;
  stale_hooks: PendingHook[];
  open_consequences: Consequence[];
  failed_reviews: FailedReview[];
}

export interface ChapterBucket {
  start_chapter: number;
  end_chapter: number;
  chapter_count: number;
  content_length: number;
  hooks_created: number;
  hooks_resolved: number;
  failed_reviews: number;
}

export interface BoardChapterListItem {
  chapter_number: number;
  title: string;
  status: string;
  content_length: number;
  hooks_created: number;
  hooks_resolved: number;
  review_passed: boolean | null;
  review_red_lights: number;
}

interface BoardProps {
  onNavigateToChapter: (chapterNumber: number) => void;
}

export function Board({ onNavigateToChapter }: BoardProps) {
  const [data, setData] = useState<BoardOverview | null>(null);
  const [buckets, setBuckets] = useState<ChapterBucket[]>([]);
  const [bucketSize] = useState(50);
  
  // view state: 'overview' | 'drilldown'
  const [view, setView] = useState<'overview' | 'drilldown'>('overview');
  const [activeBucket, setActiveBucket] = useState<ChapterBucket | null>(null);
  const [drilldownChapters, setDrilldownChapters] = useState<BoardChapterListItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);

  const fetchOverview = async () => {
    setLoading(true);
    if (isTauri()) {
      try {
        const res = await invoke<BoardOverview>('get_board_overview');
        setData(res);
        const b = await invoke<ChapterBucket[]>('get_board_chapter_bucket_overview', { bucketSize });
        setBuckets(b);
      } catch (e) {
        console.error(e);
      }
    } else {
      // Mock data for web
      setData({
        book: { title: "测试小说", genre: "玄幻", logline: "一个测试小说" },
        totals: { total_chars: 12000, chapter_count: 5, open_hooks_count: 3, open_consequences_count: 1, failed_reviews_recent: 1 },
        stale_hooks: [
          { id: 1, hook_desc: "神秘老者的遗言", created_at_chapter: 1, staleness: 4, is_resolved: false, resolved_at_chapter: null }
        ],
        open_consequences: [
          { id: 1, chapter_number: 2, upgrade_desc: "获得断剑", consequence_hook: "断剑的反噬", is_resolved: false }
        ],
        failed_reviews: [
          { chapter_number: 5, created_at: "2024-01-01 10:00:00", review_summary: "剧情节奏拖沓" }
        ]
      });
      setBuckets([
        { start_chapter: 1, end_chapter: 50, chapter_count: 50, content_length: 100000, hooks_created: 20, hooks_resolved: 15, failed_reviews: 2 },
        { start_chapter: 51, end_chapter: 100, chapter_count: 12, content_length: 24000, hooks_created: 5, hooks_resolved: 2, failed_reviews: 1 }
      ]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleCleanupConsequenceLedger = async () => {
    if (!isTauri()) return;
    try {
      await invoke<number>('cleanup_consequence_ledger');
      await fetchOverview();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDrilldown = async (bucket: ChapterBucket) => {
    setActiveBucket(bucket);
    setView('drilldown');
    setLoadingDrilldown(true);
    if (isTauri()) {
      try {
        const res = await invoke<BoardChapterListItem[]>('get_board_chapter_list', { 
          rangeStart: bucket.start_chapter, 
          rangeEnd: bucket.end_chapter 
        });
        setDrilldownChapters(res);
      } catch (e) {
        console.error(e);
      }
    } else {
      setDrilldownChapters([
        { chapter_number: 1, title: "第一章 落魄少爷", status: "finalized", content_length: 2100, hooks_created: 2, hooks_resolved: 0, review_passed: true, review_red_lights: 0 },
        { chapter_number: 2, title: "第二章 戒指异变", status: "draft", content_length: 2050, hooks_created: 1, hooks_resolved: 0, review_passed: false, review_red_lights: 2 }
      ]);
    }
    setLoadingDrilldown(false);
  };

  const handleBackToOverview = () => {
    setView('overview');
    setActiveBucket(null);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-50 h-full w-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex-1 bg-zinc-50 p-8 overflow-y-auto w-full h-full relative">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-6 rounded-xl shadow-sm border border-zinc-200">
          <div>
            <div className="flex items-center mb-2">
              {view === 'drilldown' && (
                <button onClick={handleBackToOverview} className="mr-4 p-1.5 hover:bg-zinc-100 rounded-md text-zinc-500 transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <h2 className="text-2xl font-bold text-zinc-800 flex items-center">
                <GitBranch className="w-6 h-6 mr-3 text-blue-500" />
                {view === 'overview' ? (data.book.title || "未命名书籍") : `${data.book.title} - 区间下钻`}
              </h2>
            </div>
            <p className="text-sm text-zinc-500 pl-9">
              {view === 'overview' ? (data.book.logline || "暂无一句话简介") : `当前展示：第 ${activeBucket?.start_chapter} 章 - 第 ${activeBucket?.end_chapter} 章`}
            </p>
          </div>
          {view === 'overview' && (
            <div className="flex gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-800">{data.totals.chapter_count}</div>
                <div className="text-xs text-zinc-500 mt-1 flex items-center justify-center"><BookOpen className="w-3 h-3 mr-1"/>章节</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-zinc-800">{(data.totals.total_chars / 10000).toFixed(2)}w</div>
                <div className="text-xs text-zinc-500 mt-1 flex items-center justify-center"><Book className="w-3 h-3 mr-1"/>字数</div>
              </div>
            </div>
          )}
        </div>

        {view === 'overview' ? (
          <>
            {/* Global Metrics Cards */}
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-red-100 flex items-center justify-between hover:bg-red-50 transition-colors">
                <div>
                  <div className="text-xs font-semibold text-red-500 mb-1 flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    未回收伏笔
                  </div>
                  <div className="text-2xl font-bold text-zinc-800">{data.totals.open_hooks_count}</div>
                </div>
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-amber-100 flex items-center justify-between hover:bg-amber-50 transition-colors">
                <div>
                  <div className="text-xs font-semibold text-amber-600 mb-1 flex items-center">
                    <Zap className="w-4 h-4 mr-1" />
                    未结清因果
                  </div>
                  <div className="text-2xl font-bold text-zinc-800">{data.totals.open_consequences_count}</div>
                </div>
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-amber-500" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl shadow-sm border border-purple-100 flex items-center justify-between hover:bg-purple-50 transition-colors">
                <div>
                  <div className="text-xs font-semibold text-purple-600 mb-1 flex items-center">
                    <XCircle className="w-4 h-4 mr-1" />
                    近期评审未通过
                  </div>
                  <div className="text-2xl font-bold text-zinc-800">{data.totals.failed_reviews_recent}</div>
                </div>
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>

            {/* Buckets Section */}
            {buckets.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
                <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex justify-between items-center">
                  <h3 className="font-bold text-zinc-700 flex items-center text-sm">
                    <Layers className="w-4 h-4 mr-2 text-blue-500" />
                    章节区间热度 (每 {bucketSize} 章)
                  </h3>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {buckets.map((b, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => handleDrilldown(b)}
                      className="border border-zinc-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer bg-white group relative overflow-hidden"
                    >
                      <div className="flex justify-between items-center mb-3 relative z-10">
                        <span className="font-bold text-zinc-800 text-sm">第 {b.start_chapter} - {b.end_chapter} 章</span>
                        <ArrowRight className="w-4 h-4 text-zinc-300 group-hover:text-blue-500 transition-colors" />
                      </div>
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs text-zinc-500 relative z-10">
                        <div>收录: <span className="text-zinc-800 font-medium">{b.chapter_count}章</span></div>
                        <div>字数: <span className="text-zinc-800 font-medium">{(b.content_length/10000).toFixed(1)}w</span></div>
                        <div>伏笔: <span className="text-red-500 font-medium">+{b.hooks_created}</span> / <span className="text-green-600">-{b.hooks_resolved}</span></div>
                        <div>红灯: <span className={b.failed_reviews > 0 ? "text-purple-600 font-medium" : "text-zinc-400"}>{b.failed_reviews}次</span></div>
                      </div>
                      {/* Optional: subtle background gradient based on failed reviews or hooks */}
                      {b.failed_reviews > 0 && (
                        <div className="absolute top-0 right-0 w-16 h-16 bg-purple-50 rounded-bl-full -mr-8 -mt-8 z-0"></div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dashboard Lists */}
            <div className="grid grid-cols-2 gap-6">
              
              {/* Stale Hooks List */}
              <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex flex-col">
                <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex justify-between items-center">
                  <h3 className="font-bold text-zinc-700 flex items-center text-sm">
                    <AlertTriangle className="w-4 h-4 mr-2 text-red-500" />
                    最高危滞后伏笔 Top 10
                  </h3>
                </div>
                <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto max-h-80">
                  {data.stale_hooks.length === 0 ? (
                    <div className="p-8 text-center text-sm text-zinc-400">暂无滞后伏笔</div>
                  ) : (
                    data.stale_hooks.map(hook => (
                      <div key={hook.id} className="p-4 hover:bg-zinc-50 transition-colors group">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-sm font-medium text-zinc-800 flex-1 pr-4">{hook.hook_desc}</p>
                          <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded-md font-bold whitespace-nowrap">
                            滞后 {hook.staleness} 章
                          </span>
                        </div>
                        <div className="flex justify-between items-center mt-3">
                          <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-1 rounded">
                            埋于 第 {hook.created_at_chapter} 章
                          </span>
                          <button 
                            onClick={() => onNavigateToChapter(hook.created_at_chapter)}
                            className="text-xs text-blue-600 flex items-center opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                          >
                            跳转定位 <ArrowRight className="w-3 h-3 ml-1" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-6">
                {/* Open Consequences List */}
                <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex-1 flex flex-col">
                  <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex justify-between items-center">
                    <h3 className="font-bold text-zinc-700 flex items-center text-sm">
                      <Zap className="w-4 h-4 mr-2 text-amber-500" />
                      最久未结清因果 Top 10
                    </h3>
                  {isTauri() && (
                    <button
                      type="button"
                      onClick={handleCleanupConsequenceLedger}
                      className="text-[10px] text-zinc-600 hover:text-zinc-900"
                    >
                      清理重复
                    </button>
                  )}
                  </div>
                  <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto max-h-40">
                    {data.open_consequences.length === 0 ? (
                      <div className="p-8 text-center text-sm text-zinc-400">暂无未结清因果</div>
                    ) : (
                      data.open_consequences.map(cons => (
                        <div key={cons.id} className="p-3 hover:bg-zinc-50 transition-colors flex items-center justify-between group">
                          <div className="flex-1 pr-4">
                            <div className="text-xs text-zinc-500 mb-1">因：{cons.upgrade_desc}</div>
                            <div className="text-sm font-medium text-zinc-800">果：{cons.consequence_hook}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded whitespace-nowrap">
                              源自第 {cons.chapter_number} 章
                            </span>
                            <button 
                              onClick={() => onNavigateToChapter(cons.chapter_number)}
                              className="text-[10px] text-blue-600 flex items-center opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                            >
                              跳转 <ArrowRight className="w-3 h-3 ml-0.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Failed Reviews List */}
                <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden flex-1 flex flex-col">
                  <div className="bg-zinc-50 px-5 py-3 border-b border-zinc-200 flex justify-between items-center">
                    <h3 className="font-bold text-zinc-700 flex items-center text-sm">
                      <XCircle className="w-4 h-4 mr-2 text-purple-500" />
                      最近评审红灯章
                    </h3>
                  </div>
                  <div className="divide-y divide-zinc-100 flex-1 overflow-y-auto max-h-40">
                    {data.failed_reviews.length === 0 ? (
                      <div className="p-8 text-center text-sm text-zinc-400">所有章节均评审通过</div>
                    ) : (
                      data.failed_reviews.map((rev, idx) => (
                        <div key={idx} className="p-3 hover:bg-zinc-50 transition-colors flex items-center justify-between group">
                          <div className="flex-1 pr-4">
                            <div className="text-sm font-medium text-zinc-800 mb-1">第 {rev.chapter_number} 章</div>
                            <div className="text-xs text-red-600 line-clamp-1">{rev.review_summary}</div>
                          </div>
                          <button 
                            onClick={() => onNavigateToChapter(rev.chapter_number)}
                            className="text-[10px] text-blue-600 flex items-center opacity-0 group-hover:opacity-100 transition-opacity hover:underline whitespace-nowrap"
                          >
                            去修复 <ArrowRight className="w-3 h-3 ml-0.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

            </div>
          </>
        ) : (
          /* Drilldown View */
          <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-200 flex justify-between items-center">
              <h3 className="font-bold text-zinc-700 text-base">章节明细</h3>
              <div className="text-xs text-zinc-500">共收录 {drilldownChapters.length} 章</div>
            </div>
            <div className="p-0">
              {loadingDrilldown ? (
                <div className="p-12 flex justify-center"><div className="animate-spin w-6 h-6 border-b-2 border-blue-500 rounded-full"></div></div>
              ) : drilldownChapters.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 text-sm">该区间暂无章节</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-xs text-zinc-500 font-medium">
                      <th className="px-6 py-3">章节</th>
                      <th className="px-6 py-3">字数</th>
                      <th className="px-6 py-3">状态</th>
                      <th className="px-6 py-3">评审状态</th>
                      <th className="px-6 py-3">伏笔变动</th>
                      <th className="px-6 py-3">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {drilldownChapters.map((ch) => (
                      <tr key={ch.chapter_number} className="hover:bg-zinc-50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-zinc-800">{ch.title || `第 ${ch.chapter_number} 章`}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">{ch.content_length} 字</td>
                        <td className="px-6 py-4">
                          {ch.status === 'finalized' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">已定稿</span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">草稿</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {ch.review_passed === true ? (
                            <span className="text-xs text-green-600 flex items-center"><CheckCircle2 className="w-3 h-3 mr-1" />通过</span>
                          ) : ch.review_passed === false ? (
                            <span className="text-xs text-purple-600 flex items-center font-medium"><AlertTriangle className="w-3 h-3 mr-1" />{ch.review_red_lights}处红灯</span>
                          ) : (
                            <span className="text-xs text-zinc-400">无评审</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2 text-xs">
                            {ch.hooks_created > 0 && <span className="text-red-500">+{ch.hooks_created}挖坑</span>}
                            {ch.hooks_resolved > 0 && <span className="text-green-600">-{ch.hooks_resolved}填坑</span>}
                            {ch.hooks_created === 0 && ch.hooks_resolved === 0 && <span className="text-zinc-300">-</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <button 
                            onClick={() => onNavigateToChapter(ch.chapter_number)}
                            className="text-sm text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity hover:underline"
                          >
                            编辑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
