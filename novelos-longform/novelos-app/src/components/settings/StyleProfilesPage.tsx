import { useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown, ChevronRight, Check, BookOpen } from "lucide-react";

// ─── 8 built-in style profiles ───

interface StyleProfile {
  id: string;
  name: string;
  category: string;
  description: string;
  narrative_perspective: string;
  language_style: string;
  dialogue_ratio: string;
  pace_profile: string;
  sample_paragraph: string;
  best_genres: string[];
}

const BUILTIN_PROFILES: StyleProfile[] = [
  {
    id: "style-xuanhuan",
    name: "玄幻爽文",
    category: "玄幻",
    description: "节奏明快、打斗硬朗、升级感强烈，适合以战力成长为主线的玄幻作品",
    narrative_perspective: "第三人称全知",
    language_style: "干脆利落，少修饰，多用短句，战斗描写细腻",
    dialogue_ratio: "30%",
    pace_profile: "快节奏，每章至少一个爽点",
    sample_paragraph:
      "他手中长剑一震，剑芒暴涨三丈，一道凌厉的剑气撕裂虚空，直接将那妖兽轰飞出去。周围弟子看得目瞪口呆——这就是元婴期的实力吗？",
    best_genres: ["玄幻", "武侠", "异能"],
  },
  {
    id: "style-xianxia",
    name: "仙侠古风",
    category: "仙侠",
    description: "文白相间、意境悠远、修道感悟丰富，适合古典仙侠与修真题材",
    narrative_perspective: "第三人称限知",
    language_style: "半文半白，辞藻典雅，善用诗词典故，留白意境",
    dialogue_ratio: "25%",
    pace_profile: "缓急相间，重悟道与因果",
    sample_paragraph:
      "山巅之上，云海翻涌如潮。少年负剑而立，衣袂被山风卷起，眸中倒映着那道横贯天际的劫雷。他知道，这一剑斩出，便再无回头之路。",
    best_genres: ["仙侠", "修真", "古典神话"],
  },
  {
    id: "style-dushi",
    name: "都市利落",
    category: "都市",
    description: "语言贴近现代、节奏紧凑、人物对话自然，适合都市职场或现实题材",
    narrative_perspective: "第一/第三人称",
    language_style: "口语化，节奏明快，善用短句和分段制造张力",
    dialogue_ratio: "45%",
    pace_profile: "快节奏，场景切换频繁",
    sample_paragraph:
      "会议室里安静了三秒。所有人的目光都落在投影屏幕上那个数字上——环比增长百分之三百。没人说话，但每个人眼里都在疯狂计算这意味着什么。",
    best_genres: ["都市", "职场", "悬疑都市"],
  },
  {
    id: "style-xuanyi",
    name: "悬疑冷硬",
    category: "悬疑",
    description: "笔法冷峻克制、信息密度高、留白精妙，适合悬疑推理与硬汉风格",
    narrative_perspective: "第三人称限知/第一人称",
    language_style: "冷峻克制，少情绪渲染，细节描写精准，信息量大",
    dialogue_ratio: "35%",
    pace_profile: "中慢节奏，层层递进，伏笔密集",
    sample_paragraph:
      "抽屉里只有三样东西：一把生锈的钥匙、一张泛黄的船票、还有一个没有标签的透明药瓶。他把药瓶举到灯下，瓶底沉着几粒白色粉末。不，那不是粉末。",
    best_genres: ["悬疑", "推理", "硬汉", "惊悚"],
  },
  {
    id: "style-tianchong",
    name: "甜宠轻快",
    category: "言情",
    description: "甜蜜治愈、节奏轻快、对话生动有趣，适合甜宠恋爱和轻松日常向",
    narrative_perspective: "第三人称/第一人称",
    language_style: "轻松明快，甜而不腻，善用内心吐槽和反差萌",
    dialogue_ratio: "50%",
    pace_profile: "中等节奏，注重情感互动",
    sample_paragraph:
      "她低头看着碗里突然多出来的糖醋排骨，又抬头看看对面正在若无其事扒饭的人。「你不是说食堂今天没有排骨了吗？」「嗯。」「那这是哪来的？」「……从天而降的。」",
    best_genres: ["甜宠", "校园", "轻喜剧", "日常慢热"],
  },
  {
    id: "style-nuewen",
    name: "虐文细腻",
    category: "言情",
    description: "情感浓烈、心理描写丰富、痛感层次分明，适合虐恋与情感向深度作品",
    narrative_perspective: "第三人称全知/第一人称",
    language_style: "细腻绵密，善用比兴和感官描写，情绪渲染力强",
    dialogue_ratio: "30%",
    pace_profile: "慢节奏，注重情绪堆积与转折",
    sample_paragraph:
      "她站在雨里，看着那把熟悉的黑伞渐行渐远。雨水沿着发梢滑进领口，冰凉的感觉一路蔓延到心脏的位置。原来这就是放手的滋味——不疼，只是空。空得像整颗心都被掏走了。",
    best_genres: ["虐恋", "古代言情", "民国", "BE美学"],
  },
  {
    id: "style-moshi",
    name: "末世硬朗",
    category: "科幻",
    description: "生存至上、描写硬核真实、压迫感与希望并存，适合末世废土和生存类题材",
    narrative_perspective: "第三人称限知",
    language_style: "硬朗写实，注重生存细节和环境描写，节奏紧张",
    dialogue_ratio: "25%",
    pace_profile: "高张力，持续危机感，喘息桥段精短",
    sample_paragraph:
      "辐射计疯狂地尖叫起来。所有人都停下了动作，空气像被抽走了一样安静。然后地面开始震动——那种规律的、越来越近的震动。不是地震。是它们来了。",
    best_genres: ["末世", "废土", "科幻生存", "灾变"],
  },
  {
    id: "style-dianjing",
    name: "电竞热血",
    category: "竞技",
    description: "电竞对战场面精彩、团队情感真挚、追逐梦想的热血青春，适合电竞和竞技类题材",
    narrative_perspective: "第三人称/第一人称",
    language_style: "热血澎湃，电竞术语精准，团队互动自然，对战描写画面感强",
    dialogue_ratio: "40%",
    pace_profile: "快节奏，对战高潮密集，日常过渡精简",
    sample_paragraph:
      "屏幕上，倒计时跳到了最后一秒。他的手指在键盘上几乎化作残影，每一个操作都精确得像是刻在肌肉里的本能。『Nice！』耳机里炸开队友的吼声，冠军奖杯的图标在屏幕正中缓缓浮现。",
    best_genres: ["电竞", "竞技", "热血青春", "团队成长"],
  },
];

// ─── Component ───

export function StyleProfilesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const handleApply = (id: string) => {
    setApplied(id);
    alert(
      `应用风格 "${BUILTIN_PROFILES.find((p) => p.id === id)?.name}" 到项目 ${projectId}（功能待接入后端）`,
    );
    setTimeout(() => setApplied(null), 2000);
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">风格画像</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          浏览预设文风模板，选择合适的风格画像应用到你的项目中
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {BUILTIN_PROFILES.map((profile) => {
          const isOpen = expanded === profile.id;
          const isApplied = applied === profile.id;

          return (
            <div
              key={profile.id}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Header */}
              <button
                onClick={() => setExpanded(isOpen ? null : profile.id)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen size={16} className="text-indigo-500 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900 text-sm">{profile.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{profile.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isApplied && (
                    <span className="text-xs text-green-600 flex items-center gap-0.5">
                      <Check size={12} /> 已应用
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronDown size={14} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={14} className="text-gray-400" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-3 border-t border-gray-100 space-y-3">
                  {/* Description */}
                  <div className="pt-3">
                    <p className="text-xs text-gray-600">{profile.description}</p>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <DetailItem label="叙事视角" value={profile.narrative_perspective} />
                    <DetailItem label="语言风格" value={profile.language_style} />
                    <DetailItem label="对白占比" value={profile.dialogue_ratio} />
                    <DetailItem label="节奏特征" value={profile.pace_profile} />
                  </div>

                  {/* Sample paragraph */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">示例段落</h4>
                    <p className="text-xs text-gray-600 bg-gray-50 rounded p-2 italic leading-relaxed">
                      {profile.sample_paragraph}
                    </p>
                  </div>

                  {/* Best genres */}
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">适用题材</h4>
                    <div className="flex flex-wrap gap-1">
                      {profile.best_genres.map((g) => (
                        <span
                          key={g}
                          className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Apply button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApply(profile.id);
                    }}
                    className={`w-full py-1.5 rounded text-sm font-medium transition-colors ${
                      isApplied
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-indigo-600 text-white hover:bg-indigo-700"
                    }`}
                  >
                    {isApplied ? "已应用" : "应用此风格"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-medium text-gray-400 uppercase">{label}</span>
      <p className="text-xs text-gray-700 mt-0.5">{value}</p>
    </div>
  );
}
