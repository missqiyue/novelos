import { useState, useEffect } from 'react';
import { Users, Map, Shield, Sword, Search, BookOpen, Plus, Wand2, Inbox, Sparkles, Clock } from 'lucide-react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { CharacterRelationGraph, type CharacterGraph } from './CharacterRelationGraph';

interface Character {
  id: number;
  name: string;
  core_belief: string;
  catchphrase: string;
  forbidden_knowledge: string | null;
}

interface WorldLocation {
  id: number;
  name: string;
  description: string;
}

interface WorldItem {
  id: number;
  name: string;
  description: string;
}

interface WorldFactProposal {
  id: number;
  entity_type: string;
  entity_name: string;
  fact_key: string;
  fact_value: string;
  confidence: number;
  source_chapter: number;
  source_span: string;
  status: string;
  created_at: string;
}

interface ProposalItem {
  id: number;
  proposal_type: string;
  payload: any;
  source_chapter: number | null;
  status: string;
  confidence: number;
  created_at: string;
}

interface ChapterLite {
  chapter_number: number;
  title: string;
}

interface TemporalState {
  id: number;
  entity_id: string;
  entity_type: string;
  state_key: string;
  state_value: string;
  valid_from_chapter: number;
  valid_to_chapter: number | null;
}

interface CharacterCoreItem {
  name: string;
  role_type: string;
  soul_core: any;
  notes: string;
  updated_at: string;
}

interface SoulTimelineItem {
  id: number;
  character_name: string;
  valid_from_chapter: number;
  valid_to_chapter: number | null;
  soul_state: any;
  reason_span: string;
  source: string;
  confidence: number;
  created_at: string;
}

export function WorldBible() {
  const [activeTab, setActiveTab] = useState<'inbox' | 'temporal' | 'chars' | 'locations' | 'items'>('chars');
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<WorldLocation[]>([]);
  const [items, setItems] = useState<WorldItem[]>([]);
  const [proposals, setProposals] = useState<WorldFactProposal[]>([]);
  const [genericProposals, setGenericProposals] = useState<ProposalItem[]>([]);
  const [temporalStates, setTemporalStates] = useState<TemporalState[]>([]);
  const [chapterOptions, setChapterOptions] = useState<ChapterLite[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<number | 'all'>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [newChar, setNewChar] = useState({ name: '', prompt: '', core_belief: '', catchphrase: '', forbidden_knowledge: '' });
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: '', description: '' });
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', description: '' });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReextracting, setIsReextracting] = useState(false);
  const [extractStatus, setExtractStatus] = useState<string>('');
  const [editingTemporalId, setEditingTemporalId] = useState<number | null>(null);
  const [temporalEdit, setTemporalEdit] = useState<{ state_value: string; valid_from_chapter: number; valid_to_chapter: string }>({
    state_value: '',
    valid_from_chapter: 1,
    valid_to_chapter: ''
  });
  const [characterGraph, setCharacterGraph] = useState<CharacterGraph | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [characterCore, setCharacterCore] = useState<CharacterCoreItem | null>(null);
  const [soulTimeline, setSoulTimeline] = useState<SoulTimelineItem[]>([]);
  const [soulChapter, setSoulChapter] = useState<number | 'all'>('all');
  const [isSoulLoading, setIsSoulLoading] = useState(false);
  const [soulStatus, setSoulStatus] = useState('');
  const [editingSoulId, setEditingSoulId] = useState<number | null>(null);
  const [soulEdit, setSoulEdit] = useState<{ state_json: string; from: number; to: string; reason_span: string }>({
    state_json: '{}',
    from: 1,
    to: '',
    reason_span: ''
  });

  const fetchCharacters = async () => {
    if (isTauri()) {
      try {
        const list = await invoke<Character[]>('get_characters');
        setCharacters(list);
      } catch (e) {
        console.error(e);
      }
    } else {
      setCharacters([
        { id: 1, name: '楚风', core_belief: '宁折不弯，绝不向强权低头。', catchphrase: '"我的剑虽然断了，但剑意未散。"', forbidden_knowledge: null },
        { id: 2, name: '林老', core_belief: '誓死保护楚风的安全，哪怕形神俱灭。', catchphrase: '"少爷快走！"', forbidden_knowledge: null }
      ]);
    }
  };

  const fetchLocations = async () => {
    if (isTauri()) {
      try {
        const list = await invoke<WorldLocation[]>('get_world_locations');
        setLocations(list);
      } catch (e) {
        console.error(e);
      }
    } else {
      setLocations([]);
    }
  };

  const fetchItems = async () => {
    if (isTauri()) {
      try {
        const list = await invoke<WorldItem[]>('get_world_items');
        setItems(list);
      } catch (e) {
        console.error(e);
      }
    } else {
      setItems([]);
    }
  };

  const fetchProposals = async () => {
    if (isTauri()) {
      try {
        const list = await invoke<WorldFactProposal[]>('get_world_fact_proposals', { status: 'pending', limit: 200 });
        setProposals(list);
      } catch (e) {
        console.error(e);
      }
    } else {
      setProposals([]);
    }
  };

  const fetchGenericProposals = async () => {
    if (!isTauri()) {
      setGenericProposals([]);
      return;
    }
    try {
      const list = await invoke<ProposalItem[]>('get_proposals', { status: 'pending', limit: 200 });
      setGenericProposals(list);
    } catch (e) {
      console.error(e);
      setGenericProposals([]);
    }
  };

  const fetchChapterOptions = async () => {
    if (!isTauri()) return;
    try {
      const list = await invoke<any[]>('get_chapters');
      const mapped = (list || [])
        .map((c: any) => ({ chapter_number: c.chapter_number, title: c.title }))
        .filter((c: any) => typeof c.chapter_number === 'number')
        .sort((a: any, b: any) => a.chapter_number - b.chapter_number);
      setChapterOptions(mapped);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTemporalStates = async () => {
    if (!isTauri()) return;
    try {
      const chapter = selectedChapter === 'all' ? undefined : selectedChapter;
      const list = await invoke<TemporalState[]>('get_temporal_states', { chapter, limit: 500 });
      setTemporalStates(list);
    } catch (e) {
      console.error(e);
      setTemporalStates([]);
    }
  };

  const fetchCharacterGraph = async () => {
    if (!isTauri()) return;
    try {
      const g = await invoke<CharacterGraph>('get_character_graph', { maxChapters: 200, maxNodes: 12 });
      setCharacterGraph(g);
    } catch (e) {
      console.error(e);
      setCharacterGraph(null);
    }
  };

  const fetchSoulData = async (name: string) => {
    if (!isTauri()) return;
    setIsSoulLoading(true);
    try {
      const core = await invoke<CharacterCoreItem | null>('get_character_core', { name });
      setCharacterCore(core);
      const chapter = soulChapter === 'all' ? undefined : soulChapter;
      const timeline = await invoke<SoulTimelineItem[]>('get_character_soul_timeline', { character_name: name, chapter, limit: 200 });
      setSoulTimeline(timeline);
    } catch (e) {
      console.error(e);
      setCharacterCore(null);
      setSoulTimeline([]);
    } finally {
      setIsSoulLoading(false);
    }
  };

  const openSoulPanel = async (char: Character) => {
    setSelectedCharacter(char);
    setSoulChapter('all');
    setEditingSoulId(null);
    setSoulStatus('');
    await fetchSoulData(char.name);
  };

  const closeSoulPanel = () => {
    setSelectedCharacter(null);
    setCharacterCore(null);
    setSoulTimeline([]);
    setEditingSoulId(null);
    setSoulStatus('');
  };

  useEffect(() => {
    fetchCharacters();
    fetchLocations();
    fetchItems();
    fetchProposals();
    fetchGenericProposals();
    fetchChapterOptions();
    fetchTemporalStates();
    fetchCharacterGraph();
  }, []);

  useEffect(() => {
    if (activeTab === 'temporal') {
      fetchTemporalStates();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'temporal') {
      fetchTemporalStates();
    }
  }, [selectedChapter]);

  useEffect(() => {
    if (activeTab === 'chars') {
      fetchCharacterGraph();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedCharacter) {
      fetchSoulData(selectedCharacter.name);
    }
  }, [soulChapter]);

  const handleGenerateProfile = async () => {
    if (!newChar.prompt) return;
    setIsGenerating(true);
    try {
      if (isTauri()) {
        const profile = await invoke<string>('generate_character_profile', { prompt: newChar.prompt });
        // Very basic parsing for demo
        setNewChar(prev => ({
          ...prev,
          core_belief: profile.includes('核心信念') ? profile.split('核心信念')[1].split('\n')[0].replace(/[:：]/g, '').trim() : profile,
          catchphrase: profile.includes('口头禅') ? profile.split('口头禅')[1].split('\n')[0].replace(/[:：]/g, '').trim() : '',
          forbidden_knowledge: profile.includes('禁忌') ? profile.split('禁忌')[1].split('\n')[0].replace(/[:：]/g, '').trim() : ''
        }));
      } else {
        await new Promise(r => setTimeout(r, 1000));
        setNewChar(prev => ({
          ...prev,
          core_belief: '我命由我不由天',
          catchphrase: '三十年河东三十年河西',
          forbidden_knowledge: '他的金手指其实是个残次品'
        }));
      }
    } catch (e) {
      console.error(e);
    }
    setIsGenerating(false);
  };

  const handleSaveCharacter = async () => {
    if (!newChar.name || !newChar.core_belief) return;
    try {
      if (isTauri()) {
        await invoke('add_character', { 
          name: newChar.name, 
          core_belief: newChar.core_belief, 
          catchphrase: newChar.catchphrase, 
          forbidden_knowledge: newChar.forbidden_knowledge 
        });
      }
      setIsAdding(false);
      setNewChar({ name: '', prompt: '', core_belief: '', catchphrase: '', forbidden_knowledge: '' });
      fetchCharacters();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveLocation = async () => {
    if (!newLocation.name || !newLocation.description) return;
    try {
      if (isTauri()) {
        await invoke('add_world_location', { name: newLocation.name, description: newLocation.description });
      }
      setIsAddingLocation(false);
      setNewLocation({ name: '', description: '' });
      fetchLocations();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveItem = async () => {
    if (!newItem.name || !newItem.description) return;
    try {
      if (isTauri()) {
        await invoke('add_world_item', { name: newItem.name, description: newItem.description });
      }
      setIsAddingItem(false);
      setNewItem({ name: '', description: '' });
      fetchItems();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptProposal = async (id: number, acceptAs: 'character' | 'location' | 'item' | 'temporal') => {
    if (!isTauri()) return;
    try {
      await invoke('accept_world_fact_proposal', { id, acceptAs });
      fetchProposals();
      fetchCharacters();
      fetchLocations();
      fetchItems();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRejectProposal = async (id: number) => {
    if (!isTauri()) return;
    try {
      await invoke('reject_world_fact_proposal', { id });
      fetchProposals();
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcceptGenericProposal = async (p: ProposalItem) => {
    if (!isTauri()) return;
    try {
      await invoke('accept_proposal', { id: p.id });
      await fetchGenericProposals();
      if (p.proposal_type === 'outline_patch') {
        const patches = Array.isArray(p.payload?.patches) ? p.payload.patches : Array.isArray(p.payload) ? p.payload : [p.payload];
        const nums = patches
          .map((x: any) => Number(x?.chapter_number))
          .filter((x: any) => Number.isFinite(x) && x > 0) as number[];
        if (nums.length) {
          const start = Math.min(...nums);
          const end = Math.max(...nums);
          await invoke('recompute_outline_checkpoint', { versionId: 0, startChapter: start, endChapter: end });
        }
      }
      if (p.proposal_type === 'relation_upsert') {
        await fetchCharacterGraph();
      }
      if (p.proposal_type === 'soul_timeline_upsert' && selectedCharacter) {
        await fetchSoulData(selectedCharacter.name);
      }
    } catch (e) {
      console.error(e);
      alert(`采纳失败: ${String(e)}`);
    }
  };

  const handleRejectGenericProposal = async (id: number) => {
    if (!isTauri()) return;
    try {
      await invoke('reject_proposal', { id });
      await fetchGenericProposals();
    } catch (e) {
      console.error(e);
      alert(`忽略失败: ${String(e)}`);
    }
  };

  const handleReextractFromChapters = async () => {
    if (!isTauri()) return;
    try {
      setIsReextracting(true);
      setExtractStatus('规则提取中…');
      const range = selectedChapter === 'all' ? {} : { startChapter: selectedChapter, endChapter: selectedChapter };
      await invoke<number>('reextract_world_facts_from_chapters', { clearPending: true, ...range });
      await fetchProposals();
    } catch (e) {
      console.error(e);
      setExtractStatus(`规则提取失败：${String(e)}`);
    } finally {
      setIsReextracting(false);
    }
  };

  const handleAiExtractFromChapters = async () => {
    if (!isTauri()) return;
    try {
      setIsReextracting(true);
      setExtractStatus('AI 提取中…（可能需要几十秒）');
      const pendingHintTimer = window.setTimeout(() => {
        setExtractStatus('AI 提取仍在进行中…（如无响应请检查 API Key/网络）');
      }, 3000);
      const range = selectedChapter === 'all' ? {} : { startChapter: selectedChapter, endChapter: selectedChapter };
      const inserted = await invoke<number>('ai_extract_world_facts_from_chapters', { clearPending: true, ...range });
      window.clearTimeout(pendingHintTimer);
      await fetchProposals();
      setExtractStatus(`AI 提取完成：新增 ${inserted} 条`);
    } catch (e) {
      console.error(e);
      setExtractStatus(`AI 提取失败：${String(e)}`);
    } finally {
      setIsReextracting(false);
    }
  };

  const handleRefreshTemporal = async () => {
    await fetchTemporalStates();
  };

  const handleEditTemporal = (t: TemporalState) => {
    setEditingTemporalId(t.id);
    setTemporalEdit({
      state_value: t.state_value,
      valid_from_chapter: t.valid_from_chapter,
      valid_to_chapter: t.valid_to_chapter === null ? '' : String(t.valid_to_chapter)
    });
  };

  const handleCancelEditTemporal = () => {
    setEditingTemporalId(null);
  };

  const handleSaveTemporal = async (id: number) => {
    if (!isTauri()) return;
    const valid_to_chapter = temporalEdit.valid_to_chapter.trim() === '' ? null : Number(temporalEdit.valid_to_chapter);
    try {
      await invoke('update_temporal_state', {
        id,
        state_value: temporalEdit.state_value,
        valid_from_chapter: temporalEdit.valid_from_chapter,
        valid_to_chapter
      });
      setEditingTemporalId(null);
      await fetchTemporalStates();
    } catch (e) {
      console.error(e);
      alert(`保存失败: ${String(e)}`);
    }
  };

  const handleDeleteTemporal = async (id: number) => {
    if (!isTauri()) return;
    try {
      await invoke('delete_temporal_state', { id });
      if (editingTemporalId === id) setEditingTemporalId(null);
      await fetchTemporalStates();
    } catch (e) {
      console.error(e);
      alert(`删除失败: ${String(e)}`);
    }
  };

  const getProposalRecommendation = (p: WorldFactProposal): 'temporal' | 'character' | 'location' | 'item' | null => {
    if (p.entity_type === 'review' || p.entity_type === 'conflict') return null;
    if (p.fact_key === 'owner' || p.fact_key === 'status') return 'temporal';
    if (p.entity_type === 'character') return 'character';
    if (p.entity_type === 'location') return 'location';
    if (p.entity_type === 'item') return 'item';
    return null;
  };

  const getRecommendationLabel = (rec: 'temporal' | 'character' | 'location' | 'item' | null) => {
    if (!rec) return '';
    if (rec === 'temporal') return '推荐：写入时序';
    if (rec === 'character') return '推荐：归入角色';
    if (rec === 'location') return '推荐：归入势力/地点';
    return '推荐：归入神器/功法';
  };

  return (
    <div className="flex-1 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="h-16 border-b border-zinc-200 px-8 flex items-center justify-between bg-zinc-50/50">
        <h2 className="text-xl font-bold text-zinc-800 flex items-center">
          <BookOpen className="w-5 h-5 mr-2 text-amber-500" />
          世界观百科 (World Bible)
        </h2>
        <div className="flex items-center gap-3">
          {(activeTab === 'inbox' || activeTab === 'temporal') && isTauri() && (
            <div className="flex items-center gap-2">
              <select
                value={selectedChapter}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'all') {
                    setSelectedChapter('all');
                  } else {
                    setSelectedChapter(Number(v));
                  }
                }}
                disabled={isReextracting}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-zinc-200 text-zinc-700 shadow-sm disabled:opacity-50"
              >
                <option value="all">全部章节</option>
                {chapterOptions.map((c) => (
                  <option key={c.chapter_number} value={c.chapter_number}>
                    第{c.chapter_number}章 {c.title}
                  </option>
                ))}
              </select>
              {activeTab === 'inbox' && (
                <>
                  <button
                    type="button"
                    onClick={handleAiExtractFromChapters}
                    disabled={isReextracting}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center"
                  >
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    {isReextracting ? 'AI提取中...' : 'AI提取'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReextractFromChapters}
                    disabled={isReextracting}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                  >
                    规则提取
                  </button>
                  {extractStatus && (
                    <div className="text-xs text-zinc-500 max-w-[360px] truncate">{extractStatus}</div>
                  )}
                </>
              )}
              {activeTab === 'temporal' && (
                <button
                  type="button"
                  onClick={handleRefreshTemporal}
                  disabled={isReextracting}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                >
                  刷新
                </button>
              )}
            </div>
          )}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text" 
              placeholder="搜索设定..." 
              className="pl-9 pr-4 py-1.5 bg-white border border-zinc-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64 shadow-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-48 border-r border-zinc-200 bg-zinc-50/30 p-4 space-y-2 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-2">
            <button 
              onClick={() => setActiveTab('inbox')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'inbox' ? 'bg-green-50 text-green-700' : 'text-zinc-600 hover:bg-zinc-100'}`}
            >
              <span className="flex items-center"><Inbox className="w-4 h-4 mr-2" /> 待确认</span>
              <span className="bg-zinc-200/50 text-zinc-500 px-1.5 rounded text-xs">{proposals.length + genericProposals.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab('temporal')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'temporal' ? 'bg-zinc-200/60 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100'}`}
            >
              <span className="flex items-center"><Clock className="w-4 h-4 mr-2" /> 时序状态</span>
              <span className="bg-zinc-200/50 text-zinc-500 px-1.5 rounded text-xs">{temporalStates.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab('chars')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'chars' ? 'bg-blue-50 text-blue-700' : 'text-zinc-600 hover:bg-zinc-100'}`}
            >
              <span className="flex items-center"><Users className="w-4 h-4 mr-2" /> 角色人物</span>
              <span className="bg-zinc-200/50 text-zinc-500 px-1.5 rounded text-xs">{characters.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab('locations')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'locations' ? 'bg-amber-50 text-amber-700' : 'text-zinc-600 hover:bg-zinc-100'}`}
            >
              <span className="flex items-center"><Map className="w-4 h-4 mr-2" /> 势力地图</span>
              <span className="bg-zinc-200/50 text-zinc-500 px-1.5 rounded text-xs">{locations.length}</span>
            </button>
            <button 
              onClick={() => setActiveTab('items')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'items' ? 'bg-purple-50 text-purple-700' : 'text-zinc-600 hover:bg-zinc-100'}`}
            >
              <span className="flex items-center"><Sword className="w-4 h-4 mr-2" /> 神器功法</span>
              <span className="bg-zinc-200/50 text-zinc-500 px-1.5 rounded text-xs">{items.length}</span>
            </button>
          </div>
          {activeTab === 'chars' && (
            <button 
              onClick={() => setIsAdding(!isAdding)}
              className="flex items-center justify-center w-full py-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors font-medium"
            >
              <Plus className="w-4 h-4 mr-1" /> 添加角色
            </button>
          )}
          {activeTab === 'locations' && (
            <button 
              onClick={() => setIsAddingLocation(v => !v)}
              className="flex items-center justify-center w-full py-2 text-sm text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors font-medium"
            >
              <Plus className="w-4 h-4 mr-1" /> 添加势力/地点
            </button>
          )}
          {activeTab === 'items' && (
            <button 
              onClick={() => setIsAddingItem(v => !v)}
              className="flex items-center justify-center w-full py-2 text-sm text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-md transition-colors font-medium"
            >
              <Plus className="w-4 h-4 mr-1" /> 添加神器/功法
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 bg-zinc-50/10">
          {activeTab === 'inbox' && (
            <div className="max-w-4xl space-y-4">
              {proposals.length === 0 && genericProposals.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-400">
                  <Inbox className="w-12 h-12 mb-3 text-zinc-300" />
                  <p className="text-sm">暂无待确认设定。写作时保存章节内容后，会自动抽取候选实体。</p>
                </div>
              ) : (
                <>
                  {proposals.map(p => (
                    <div key={p.id} className={`bg-white border rounded-xl p-5 shadow-sm ${p.entity_type === 'conflict' ? 'border-red-200' : 'border-zinc-200'}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {(() => {
                            const rec = getProposalRecommendation(p);
                            const label = getRecommendationLabel(rec);
                            return label ? (
                              <div className="mb-2 inline-flex text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                                {label}
                              </div>
                            ) : null;
                          })()}
                          <div className="flex items-center gap-2 mb-1">
                            <div className="text-lg font-bold text-zinc-800 truncate">{p.entity_name}</div>
                            <div className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                              {p.entity_type}/{p.fact_key}
                            </div>
                            <div className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                              置信 {Math.round((p.confidence ?? 0) * 100)}%
                            </div>
                            <div className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                              源自第 {p.source_chapter} 章
                            </div>
                          </div>
                          <div className="text-sm text-zinc-600 whitespace-pre-wrap">{p.fact_value}</div>
                          {p.source_span && (
                            <div className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap">{p.source_span}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {p.entity_type !== 'review' && p.entity_type !== 'conflict' && (
                            <div className="flex flex-wrap gap-2 justify-end">
                              {(() => {
                                const rec = getProposalRecommendation(p);
                                const mkClass = (t: 'temporal' | 'character' | 'location' | 'item') => {
                                  if (t === 'temporal') return t === rec ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-green-50 text-green-700 hover:bg-green-100';
                                  if (t === 'character') return t === rec ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-blue-50 text-blue-700 hover:bg-blue-100';
                                  if (t === 'location') return t === rec ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-amber-50 text-amber-700 hover:bg-amber-100';
                                  return t === rec ? 'bg-purple-600 text-white hover:bg-purple-700' : 'bg-purple-50 text-purple-700 hover:bg-purple-100';
                                };
                                return (
                                  <>
                                    {(p.fact_key === 'owner' || p.fact_key === 'status') && (
                                      <button
                                        onClick={() => handleAcceptProposal(p.id, 'temporal')}
                                        className={`text-xs px-3 py-1 rounded ${mkClass('temporal')}`}
                                      >
                                        写入时序
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleAcceptProposal(p.id, 'character')}
                                      className={`text-xs px-3 py-1 rounded ${mkClass('character')}`}
                                    >
                                      归入角色
                                    </button>
                                    <button
                                      onClick={() => handleAcceptProposal(p.id, 'location')}
                                      className={`text-xs px-3 py-1 rounded ${mkClass('location')}`}
                                    >
                                      归入势力/地点
                                    </button>
                                    <button
                                      onClick={() => handleAcceptProposal(p.id, 'item')}
                                      className={`text-xs px-3 py-1 rounded ${mkClass('item')}`}
                                    >
                                      归入神器/功法
                                    </button>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                          <button
                            onClick={() => handleRejectProposal(p.id)}
                            className="text-xs px-3 py-1 rounded bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                          >
                            忽略
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {genericProposals.map(p => {
                    const raw = JSON.stringify(p.payload ?? {}, null, 2);
                    const preview = raw.length > 1200 ? `${raw.slice(0, 1200)}…` : raw;
                    return (
                      <div key={`g-${p.id}`} className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                                {p.proposal_type}
                              </div>
                              <div className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                                置信 {Math.round((p.confidence ?? 0) * 100)}%
                              </div>
                              {p.source_chapter !== null && (
                                <div className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                                  源自第 {p.source_chapter} 章
                                </div>
                              )}
                            </div>
                            <pre className="text-xs text-zinc-600 whitespace-pre-wrap bg-zinc-50 border border-zinc-100 rounded p-3 overflow-auto max-h-56">{preview}</pre>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <button
                              onClick={() => handleAcceptGenericProposal(p)}
                              className="text-xs px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                            >
                              采纳
                            </button>
                            <button
                              onClick={() => handleRejectGenericProposal(p.id)}
                              className="text-xs px-3 py-1 rounded bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                            >
                              忽略
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          )}

          {activeTab === 'temporal' && (
            <div className="max-w-4xl space-y-4">
              <div className="text-sm text-zinc-600">
                {selectedChapter === 'all' ? '展示当前仍有效（未结束）的时序状态。' : `展示第 ${selectedChapter} 章有效的时序状态。`}
              </div>
              {temporalStates.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-400">
                  <Clock className="w-12 h-12 mb-3 text-zinc-300" />
                  <p className="text-sm">暂无时序状态。你可以在“待确认”里将 owner/status 写入时序。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {temporalStates.map(t => (
                    <div key={t.id} className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="text-lg font-bold text-zinc-800 truncate">{t.entity_id}</div>
                            <div className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                              {t.entity_type}/{t.state_key}
                            </div>
                            <div className="text-xs px-2 py-0.5 rounded bg-zinc-100 text-zinc-600">
                              {t.valid_from_chapter} → {t.valid_to_chapter === null ? '∞' : t.valid_to_chapter}
                            </div>
                          </div>
                          {editingTemporalId === t.id ? (
                            <div className="grid grid-cols-3 gap-3 mt-3">
                              <div className="col-span-3">
                                <div className="text-xs font-semibold text-zinc-500 mb-1">值</div>
                                <input
                                  value={temporalEdit.state_value}
                                  onChange={(e) => setTemporalEdit({ ...temporalEdit, state_value: e.target.value })}
                                  className="w-full p-2 text-sm border border-zinc-200 rounded"
                                />
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-zinc-500 mb-1">起始章</div>
                                <input
                                  type="number"
                                  value={temporalEdit.valid_from_chapter}
                                  onChange={(e) => setTemporalEdit({ ...temporalEdit, valid_from_chapter: Number(e.target.value) })}
                                  className="w-full p-2 text-sm border border-zinc-200 rounded"
                                />
                              </div>
                              <div>
                                <div className="text-xs font-semibold text-zinc-500 mb-1">结束章</div>
                                <input
                                  type="number"
                                  value={temporalEdit.valid_to_chapter}
                                  onChange={(e) => setTemporalEdit({ ...temporalEdit, valid_to_chapter: e.target.value })}
                                  className="w-full p-2 text-sm border border-zinc-200 rounded"
                                  placeholder="留空=∞"
                                />
                              </div>
                              <div className="flex items-end gap-2 justify-end">
                                <button
                                  onClick={() => handleSaveTemporal(t.id)}
                                  className="text-xs px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                                >
                                  保存
                                </button>
                                <button
                                  onClick={handleCancelEditTemporal}
                                  className="text-xs px-3 py-2 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-zinc-700 whitespace-pre-wrap">{t.state_value}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {editingTemporalId !== t.id && (
                            <button
                              onClick={() => handleEditTemporal(t)}
                              className="text-xs px-3 py-1 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                            >
                              编辑
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteTemporal(t.id)}
                            className="text-xs px-3 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'chars' && (
            <div className="max-w-4xl">
              <CharacterRelationGraph graph={characterGraph} />
              {isAdding && (
                <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
                  <h3 className="font-bold text-zinc-800 text-lg mb-4 flex items-center">
                    <Wand2 className="w-5 h-5 mr-2 text-blue-500" />
                    AI 角色生成器
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">角色名称</label>
                      <input type="text" value={newChar.name} onChange={e => setNewChar({...newChar, name: e.target.value})} className="w-full p-2 text-sm border border-zinc-200 rounded" placeholder="如：萧炎" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">一句话描述（供AI生成用）</label>
                      <div className="flex space-x-2">
                        <input type="text" value={newChar.prompt} onChange={e => setNewChar({...newChar, prompt: e.target.value})} className="flex-1 p-2 text-sm border border-zinc-200 rounded" placeholder="如：一个天赋异禀但突然失去法力的家族少爷..." />
                        <button onClick={handleGenerateProfile} disabled={isGenerating || !newChar.prompt} className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
                          {isGenerating ? '生成中...' : 'AI 生成设定'}
                        </button>
                      </div>
                    </div>
                    {newChar.core_belief && (
                      <div className="space-y-3 pt-4 border-t border-zinc-100">
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1">核心底线</label>
                          <input type="text" value={newChar.core_belief} onChange={e => setNewChar({...newChar, core_belief: e.target.value})} className="w-full p-2 text-sm border border-zinc-200 rounded bg-zinc-50" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1">口头禅</label>
                          <input type="text" value={newChar.catchphrase} onChange={e => setNewChar({...newChar, catchphrase: e.target.value})} className="w-full p-2 text-sm border border-zinc-200 rounded bg-zinc-50" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-zinc-500 mb-1">禁忌/不可知信息</label>
                          <input type="text" value={newChar.forbidden_knowledge || ''} onChange={e => setNewChar({...newChar, forbidden_knowledge: e.target.value})} className="w-full p-2 text-sm border border-zinc-200 rounded bg-zinc-50" />
                        </div>
                        <div className="flex justify-end pt-2">
                          <button onClick={() => setIsAdding(false)} className="px-4 py-2 text-zinc-500 hover:text-zinc-700 text-sm mr-2">取消</button>
                          <button onClick={handleSaveCharacter} className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700">保存入库</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!isAdding && characters.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-400">
                  <Users className="w-12 h-12 mb-3 text-zinc-300" />
                  <p className="text-sm">暂无角色设定，点击左侧“添加角色”开始录入。</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {characters.map(char => (
                    <div
                      key={char.id}
                      onClick={() => openSoulPanel(char)}
                      className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-lg mr-3">
                            {char.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-zinc-800 text-lg">{char.name}</h3>
                            <p className="text-xs text-zinc-500">已收录角色</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">核心底线 (Core Belief)</div>
                          <p className="text-sm text-zinc-700">{char.core_belief}</p>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">口头禅 (Catchphrase)</div>
                          <p className="text-sm text-zinc-700 italic">{char.catchphrase}</p>
                        </div>
                        {char.forbidden_knowledge && (
                          <div>
                            <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1 flex items-center">
                              <Shield className="w-3 h-3 mr-1"/> 禁忌信息 (Forbidden)
                            </div>
                            <p className="text-sm text-red-600/80">{char.forbidden_knowledge}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'locations' && (
            <div className="max-w-4xl">
              {isAddingLocation && (
                <div className="bg-white border border-amber-200 rounded-xl p-5 shadow-sm">
                  <h3 className="font-bold text-zinc-800 text-lg mb-4">添加势力/地点</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">名称</label>
                      <input type="text" value={newLocation.name} onChange={e => setNewLocation({ ...newLocation, name: e.target.value })} className="w-full p-2 text-sm border border-zinc-200 rounded" placeholder="如：王家、青云宗、林家别院" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">描述</label>
                      <textarea value={newLocation.description} onChange={e => setNewLocation({ ...newLocation, description: e.target.value })} className="w-full p-2 text-sm border border-zinc-200 rounded bg-zinc-50 min-h-[90px]" placeholder="关键设定、势力结构、地理特点、与主角关系..." />
                    </div>
                    <div className="flex justify-end pt-2">
                      <button onClick={() => setIsAddingLocation(false)} className="px-4 py-2 text-zinc-500 hover:text-zinc-700 text-sm mr-2">取消</button>
                      <button onClick={handleSaveLocation} className="px-4 py-2 bg-amber-600 text-white text-sm rounded hover:bg-amber-700">保存入库</button>
                    </div>
                  </div>
                </div>
              )}
              {!isAddingLocation && locations.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-400">
                  <Map className="w-12 h-12 mb-3 text-zinc-300" />
                  <p className="text-sm">暂无势力/地点设定，点击左侧“添加势力/地点”开始录入。</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {locations.map(loc => (
                    <div key={loc.id} className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg mr-3">
                            {loc.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-zinc-800 text-lg">{loc.name}</h3>
                            <p className="text-xs text-zinc-500">已收录设定</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-zinc-700 whitespace-pre-wrap">{loc.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'items' && (
            <div className="max-w-4xl">
              {isAddingItem && (
                <div className="bg-white border border-purple-200 rounded-xl p-5 shadow-sm">
                  <h3 className="font-bold text-zinc-800 text-lg mb-4">添加神器/功法</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">名称</label>
                      <input type="text" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} className="w-full p-2 text-sm border border-zinc-200 rounded" placeholder="如：断剑、九转炼体诀、星辰砂" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">描述</label>
                      <textarea value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} className="w-full p-2 text-sm border border-zinc-200 rounded bg-zinc-50 min-h-[90px]" placeholder="来历、效果、代价、限制、关键用途..." />
                    </div>
                    <div className="flex justify-end pt-2">
                      <button onClick={() => setIsAddingItem(false)} className="px-4 py-2 text-zinc-500 hover:text-zinc-700 text-sm mr-2">取消</button>
                      <button onClick={handleSaveItem} className="px-4 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700">保存入库</button>
                    </div>
                  </div>
                </div>
              )}
              {!isAddingItem && items.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-zinc-400">
                  <Sword className="w-12 h-12 mb-3 text-zinc-300" />
                  <p className="text-sm">暂无神器/功法设定，点击左侧“添加神器/功法”开始录入。</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {items.map(it => (
                    <div key={it.id} className="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center">
                          <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-lg mr-3">
                            {it.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="font-bold text-zinc-800 text-lg">{it.name}</h3>
                            <p className="text-xs text-zinc-500">已收录设定</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-zinc-700 whitespace-pre-wrap">{it.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedCharacter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={closeSoulPanel}>
          <div className="bg-white rounded-xl shadow-xl border border-zinc-200 w-full max-w-4xl max-h-[85vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-zinc-900">{selectedCharacter.name}</div>
                <div className="text-xs text-zinc-500">SOUL core 与 timeline（可编辑）</div>
              </div>
              <button onClick={closeSoulPanel} className="px-3 py-1.5 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 text-xs">
                关闭
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(85vh-64px)]">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-zinc-800">SOUL core</div>
                    <div className="text-xs text-zinc-500">{characterCore?.role_type || ''}</div>
                  </div>
                  {isSoulLoading ? (
                    <div className="text-xs text-zinc-500 mt-3">加载中…</div>
                  ) : (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white border border-zinc-200 rounded p-3">
                          <div className="text-[10px] text-zinc-400 mb-1">S</div>
                          <div className="text-xs text-zinc-700 whitespace-pre-wrap">{characterCore?.soul_core?.S || ''}</div>
                        </div>
                        <div className="bg-white border border-zinc-200 rounded p-3">
                          <div className="text-[10px] text-zinc-400 mb-1">O</div>
                          <div className="text-xs text-zinc-700 whitespace-pre-wrap">{characterCore?.soul_core?.O || ''}</div>
                        </div>
                        <div className="bg-white border border-zinc-200 rounded p-3">
                          <div className="text-[10px] text-zinc-400 mb-1">U</div>
                          <div className="text-xs text-zinc-700 whitespace-pre-wrap">{characterCore?.soul_core?.U || ''}</div>
                        </div>
                        <div className="bg-white border border-zinc-200 rounded p-3">
                          <div className="text-[10px] text-zinc-400 mb-1">L</div>
                          <div className="text-xs text-zinc-700 whitespace-pre-wrap">{characterCore?.soul_core?.L || ''}</div>
                        </div>
                      </div>
                      <div className="bg-white border border-zinc-200 rounded p-3">
                        <div className="text-[10px] text-zinc-400 mb-1">tells</div>
                        <div className="text-xs text-zinc-700">
                          <div className="truncate">catchphrase：{characterCore?.soul_core?.tells?.catchphrase || ''}</div>
                          <div className="truncate">habit：{characterCore?.soul_core?.tells?.habit || ''}</div>
                          <div className="truncate">attitude：{characterCore?.soul_core?.tells?.default_attitude_to_protagonist || ''}</div>
                        </div>
                      </div>
                      {characterCore?.updated_at && <div className="text-[10px] text-zinc-400">updated_at：{characterCore.updated_at}</div>}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-zinc-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-zinc-800">SOUL timeline</div>
                    <div className="flex items-center gap-2">
                      <select
                        value={soulChapter}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === 'all') setSoulChapter('all');
                          else setSoulChapter(Number(v));
                        }}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-white border border-zinc-200 text-zinc-700 shadow-sm"
                      >
                        <option value="all">全部</option>
                        {chapterOptions.slice(0, 200).map((c) => (
                          <option key={c.chapter_number} value={c.chapter_number}>
                            第{c.chapter_number}章
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          setEditingSoulId(0);
                          setSoulEdit({ state_json: '{}', from: 1, to: '', reason_span: '' });
                        }}
                        className="px-3 py-1.5 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                      >
                        新增
                      </button>
                    </div>
                  </div>

                  {editingSoulId !== null && (
                    <div className="mt-4 bg-zinc-50 border border-zinc-200 rounded p-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <div className="text-xs font-semibold text-zinc-500 mb-1">from</div>
                          <input
                            type="number"
                            value={soulEdit.from}
                            onChange={(e) => setSoulEdit({ ...soulEdit, from: Number(e.target.value) })}
                            className="w-full p-2 text-sm border border-zinc-200 rounded"
                          />
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-zinc-500 mb-1">to（空=∞）</div>
                          <input
                            value={soulEdit.to}
                            onChange={(e) => setSoulEdit({ ...soulEdit, to: e.target.value })}
                            className="w-full p-2 text-sm border border-zinc-200 rounded"
                          />
                        </div>
                        <div className="flex items-end justify-end gap-2">
                          <button
                            onClick={async () => {
                              if (!selectedCharacter || !isTauri()) return;
                              try {
                                setSoulStatus('保存中…');
                                let v: any = {};
                                try {
                                  v = JSON.parse(soulEdit.state_json || '{}');
                                } catch {
                                  v = {};
                                }
                                await invoke<number>('upsert_character_soul_timeline', {
                                  item: {
                                    id: editingSoulId === 0 ? null : editingSoulId,
                                    character_name: selectedCharacter.name,
                                    valid_from_chapter: soulEdit.from,
                                    valid_to_chapter: soulEdit.to.trim() === '' ? null : Number(soulEdit.to),
                                    soul_state: v,
                                    reason_span: soulEdit.reason_span,
                                    source: 'manual',
                                    confidence: 0.8
                                  }
                                });
                                setEditingSoulId(null);
                                setSoulStatus('已保存');
                                await fetchSoulData(selectedCharacter.name);
                                setTimeout(() => setSoulStatus(''), 1200);
                              } catch (e) {
                                console.error(e);
                                setSoulStatus(`保存失败：${String(e)}`);
                              }
                            }}
                            className="px-3 py-2 rounded text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingSoulId(null)}
                            className="px-3 py-2 rounded text-xs font-medium bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                          >
                            取消
                          </button>
                        </div>
                        <div className="col-span-3">
                          <div className="text-xs font-semibold text-zinc-500 mb-1">soul_state JSON</div>
                          <textarea
                            value={soulEdit.state_json}
                            onChange={(e) => setSoulEdit({ ...soulEdit, state_json: e.target.value })}
                            className="w-full p-2 text-sm border border-zinc-200 rounded h-28 resize-none font-mono"
                            placeholder='{"S":"","O":"","U":"","L":""}'
                          />
                        </div>
                        <div className="col-span-3">
                          <div className="text-xs font-semibold text-zinc-500 mb-1">reason_span</div>
                          <input
                            value={soulEdit.reason_span}
                            onChange={(e) => setSoulEdit({ ...soulEdit, reason_span: e.target.value })}
                            className="w-full p-2 text-sm border border-zinc-200 rounded"
                            placeholder="引用章号与事件摘要"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {soulStatus && <div className="text-xs text-zinc-500 mt-3">{soulStatus}</div>}

                  <div className="mt-4 space-y-3">
                    {isSoulLoading ? (
                      <div className="text-xs text-zinc-500">加载中…</div>
                    ) : soulTimeline.length === 0 ? (
                      <div className="text-xs text-zinc-500">暂无 timeline 记录。</div>
                    ) : (
                      soulTimeline.map((t) => (
                        <div key={t.id} className="border border-zinc-200 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-xs text-zinc-600">
                              {t.valid_from_chapter} → {t.valid_to_chapter === null ? '∞' : t.valid_to_chapter} · {t.source} · {Math.round(t.confidence * 100)}%
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setEditingSoulId(t.id);
                                  setSoulEdit({
                                    state_json: JSON.stringify(t.soul_state ?? {}, null, 2),
                                    from: t.valid_from_chapter,
                                    to: t.valid_to_chapter === null ? '' : String(t.valid_to_chapter),
                                    reason_span: t.reason_span || ''
                                  });
                                }}
                                className="text-xs px-3 py-1 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              >
                                编辑
                              </button>
                              <button
                                onClick={async () => {
                                  if (!selectedCharacter || !isTauri()) return;
                                  try {
                                    await invoke('delete_character_soul_timeline', { id: t.id });
                                    await fetchSoulData(selectedCharacter.name);
                                  } catch (e) {
                                    console.error(e);
                                  }
                                }}
                                className="text-xs px-3 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                          <div className="text-xs text-zinc-700 mt-2 whitespace-pre-wrap">{t.reason_span}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
