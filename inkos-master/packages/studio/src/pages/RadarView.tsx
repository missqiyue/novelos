import { useState } from "react";
import type { Theme } from "../hooks/use-theme";
import type { TFunction } from "../hooks/use-i18n";
import { useColors } from "../hooks/use-colors";
import { fetchJson } from "../hooks/use-api";
import { TrendingUp, Loader2, Target, X } from "lucide-react";

interface Recommendation {
  readonly confidence: number;
  readonly platform: string;
  readonly genre: string;
  readonly concept: string;
  readonly reasoning: string;
  readonly benchmarkTitles: ReadonlyArray<string>;
}

interface RadarResult {
  readonly marketSummary: string;
  readonly recommendations: ReadonlyArray<Recommendation>;
}

interface Nav { toDashboard: () => void }

export function RadarView({ nav, theme, t }: { nav: Nav; theme: Theme; t: TFunction }) {
  const c = useColors(theme);
  const [result, setResult] = useState<RadarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // 爆款克隆状态
  const [selectedHitClone, setSelectedHitClone] = useState<string | null>(null);
  const [isHitCloneLoading, setIsHitCloneLoading] = useState(false);
  const [extractedStyle, setExtractedStyle] = useState<any | null>(null);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [isCrawling, setIsCrawling] = useState(false);
  const [currentAction, setCurrentAction] = useState<"extract" | "reverse" | null>(null);

  const handleScan = async () => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await fetchJson<RadarResult>("/radar/scan", { method: "POST" });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  };

  const handleActionClick = (action: "extract" | "reverse") => {
    if (!selectedHitClone) {
      alert("请先从雷达结果中选中一本书籍！");
      return;
    }
    setCurrentAction(action);
    setIsInputOpen(true);
  };

  const handleCrawl = async () => {
    if (!inputUrl.trim()) {
      alert("请输入要爬取的小说网页 URL");
      return;
    }
    setIsCrawling(true);
    try {
      const res = await fetch("/api/v1/clone/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "未知错误");
      setInputText(data.text);
      alert("网页正文自动爬取成功！请检查或修改内容后再开始分析。");
    } catch (e) {
      alert("爬取失败: " + String(e));
    } finally {
      setIsCrawling(false);
    }
  };

  const extractHitCloneStyle = async (text: string) => {
    setIsHitCloneLoading(true);
    try {
      const res = await fetch("/api/v1/clone/extract-style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, sourceName: selectedHitClone })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "未知错误");
      
      setExtractedStyle({
        title: selectedHitClone,
        fingerprint: {
          avgSentenceLength: data.profile.avgSentenceLength.toFixed(1),
          ttr: data.profile.ttr.toFixed(2),
          frequentPatterns: data.profile.topPatterns.slice(0, 4).map((p: any) => p.pattern)
        },
        guide: data.guide
      });
      alert(`成功提取【${selectedHitClone}】的真实文风指纹，并且已将 style_guide.md 写入该书项目目录！`);
    } catch (e) {
      alert("真实特征提取失败：" + String(e));
    }
    setIsHitCloneLoading(false);
  };

  const generateReverseSettings = async (text: string) => {
    setIsHitCloneLoading(true);
    try {
      const res = await fetch("/api/v1/clone/reverse-engineer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "未知错误");
      alert(`【${selectedHitClone}】设定逆向分析完成，真相文件(Story Bible, 角色矩阵等)已真实落盘到项目目录！`);
    } catch (e) {
      alert("真实逆向分析失败：" + String(e));
    }
    setIsHitCloneLoading(false);
  };

  const handleConfirmAction = () => {
    if (!inputText.trim()) {
      alert("文本不能为空！");
      return;
    }
    setIsInputOpen(false);
    if (currentAction === "extract") {
      extractHitCloneStyle(inputText);
    } else {
      generateReverseSettings(inputText);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <button onClick={nav.toDashboard} className={c.link}>{t("bread.home")}</button>
        <span className="text-border">/</span>
        <span>{t("nav.radar")}</span>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl flex items-center gap-3">
          <TrendingUp size={28} className="text-primary" />
          {t("radar.title")}
        </h1>
        <button
          onClick={handleScan}
          disabled={loading}
          className={`px-5 py-2.5 text-sm rounded-lg ${c.btnPrimary} disabled:opacity-30 flex items-center gap-2`}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Target size={14} />}
          {loading ? t("radar.scanning") : t("radar.scan")}
        </button>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {result && (
        <div className="space-y-6">
          <div className={`border ${c.cardStatic} rounded-lg p-5`}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t("radar.summary")}</h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.marketSummary}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.recommendations.map((rec, i) => (
              <div 
                key={i} 
                className={`border ${c.cardStatic} rounded-lg p-5 space-y-3 cursor-pointer transition-colors ${
                  selectedHitClone === (rec.benchmarkTitles[0] || rec.concept.substring(0, 10)) 
                    ? 'border-primary ring-1 ring-primary/30 bg-primary/5' 
                    : 'hover:border-primary/50'
                }`}
                onClick={() => setSelectedHitClone(rec.benchmarkTitles[0] || rec.concept.substring(0, 10))}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {rec.platform} · {rec.genre}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    rec.confidence >= 0.7 ? "bg-emerald-500/10 text-emerald-600" :
                    rec.confidence >= 0.4 ? "bg-amber-500/10 text-amber-600" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {(rec.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm font-semibold">{rec.concept}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{rec.reasoning}</p>
                {rec.benchmarkTitles.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {rec.benchmarkTitles.map((bt) => (
                      <span key={bt} className="px-2 py-0.5 text-[10px] bg-secondary rounded">{bt}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 爆款克隆操作区 */}
          {selectedHitClone && (
            <div className={`border ${c.cardStatic} border-primary/30 rounded-lg p-5 mt-6`}>
              <h3 className="text-sm font-bold flex items-center gap-2 mb-4 text-primary">
                <Target size={16} />
                爆款克隆逆向工程 - 目标: {selectedHitClone}
              </h3>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => handleActionClick("extract")}
                  disabled={isHitCloneLoading}
                  className="px-4 py-2 bg-primary/20 text-primary text-sm rounded hover:bg-primary/30 disabled:opacity-50 transition-colors"
                >
                  1. 提取目标小说文风
                </button>
                <button 
                  onClick={() => handleActionClick("reverse")}
                  disabled={isHitCloneLoading}
                  className="px-4 py-2 bg-primary/20 text-primary text-sm rounded hover:bg-primary/30 disabled:opacity-50 transition-colors"
                >
                  2. 生成逆向设定集
                </button>
              </div>

              {extractedStyle && (
                <div className="text-xs bg-background p-4 rounded border border-border mt-4">
                  <div className="font-bold text-primary mb-1 text-sm">【定量指纹 (Fingerprint)】</div>
                  <div className="text-muted-foreground mb-3">
                    平均句长: <span className="text-foreground font-medium">{extractedStyle.fingerprint.avgSentenceLength}</span> | 
                    词汇多样性: <span className="text-foreground font-medium">{extractedStyle.fingerprint.ttr}</span> | 
                    高频词: <span className="text-foreground font-medium">{extractedStyle.fingerprint.frequentPatterns.join(", ")}</span>
                  </div>
                  <div className="font-bold text-primary mb-1 text-sm">【定性指南 (Guide)】</div>
                  <div className="text-muted-foreground whitespace-pre-wrap">{extractedStyle.guide}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 爬取/输入弹窗 */}
      {isInputOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`bg-card border ${c.cardStatic} rounded-xl p-6 flex flex-col shadow-2xl w-full max-w-3xl h-[80vh]`}>
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-lg font-bold text-primary flex items-center gap-2">
                <Target size={20} />
                {currentAction === "extract" ? "获取正文片段 (用于文风提取)" : "获取正文片段 (用于逆向工程)"}
              </h4>
              <button onClick={() => setIsInputOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            
            {/* 爬取输入区 */}
            <div className="flex gap-3 mb-4">
              <input 
                type="text" 
                placeholder="输入小说网页/章节 URL 自动爬取正文..."
                className="flex-1 bg-secondary/30 border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary/50 transition-colors"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
              />
              <button 
                onClick={handleCrawl}
                disabled={isCrawling}
                className="px-6 py-2.5 bg-secondary text-foreground text-sm font-medium rounded-lg hover:bg-secondary/80 disabled:opacity-50 whitespace-nowrap transition-colors"
              >
                {isCrawling ? "爬取中..." : "自动爬取"}
              </button>
            </div>

            <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
              <span>* 自动爬取可能不够精准，您也可以手动粘贴 {selectedHitClone} 的章节文本。建议输入 1000-3000 字以上的高潮片段。</span>
            </div>
            
            <textarea 
              className="flex-1 w-full bg-secondary/10 border border-border rounded-lg p-4 text-sm focus:outline-none focus:border-primary/50 resize-none overflow-y-auto leading-relaxed"
              placeholder="网页正文将自动提取到此处，您也可以手动粘贴或修改..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            
            <div className="mt-6 flex justify-end gap-3">
              <button 
                onClick={() => setIsInputOpen(false)}
                className="px-5 py-2.5 bg-secondary text-secondary-foreground text-sm rounded-lg hover:bg-secondary/80 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleConfirmAction}
                disabled={isHitCloneLoading || isCrawling}
                className="px-5 py-2.5 bg-primary text-primary-foreground text-sm rounded-lg hover:bg-primary/90 font-medium disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isHitCloneLoading && <Loader2 size={16} className="animate-spin" />}
                开始真实分析
              </button>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <div className={`border border-dashed ${c.cardStatic} rounded-lg p-12 text-center text-muted-foreground text-sm italic`}>
          {t("radar.emptyHint")}
        </div>
      )}
    </div>
  );
}
