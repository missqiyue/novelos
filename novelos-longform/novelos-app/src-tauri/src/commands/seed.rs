use crate::db::DbState;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize)]
pub struct SeedResult {
    pub project_id: String,
    pub title: String,
    pub volumes_created: i64,
    pub characters_created: i64,
    pub chapters_created: i64,
    pub canon_rules_created: i64,
    pub foreshadows_created: i64,
}

#[tauri::command]
pub fn create_sample_project(app: AppHandle, db: State<'_, DbState>) -> Result<SeedResult, String> {
    let project_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    db.open_project_db(&app, &project_id)
        .map_err(|e| format!("Failed to create project DB: {}", e))?;

    {
        let project_conn = db.project.lock().map_err(|e| e.to_string())?;
        let conn = project_conn.as_ref().ok_or("No project DB open")?;

        // 1. Project
        conn.execute(
            "INSERT INTO projects (id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at) VALUES (?1, '星辰仙途', 'xianxia', '少年林凡偶得上古星辰传承，从此踏上逆天修仙之路。在宗门斗争、秘境探险、上古秘辛中一步步成长，最终揭开星辰之力的终极奥秘。', 2000000, 8, 2000, 5000, 'active', ?2, ?3)",
            rusqlite::params![project_id, now, now],
        ).map_err(|e| e.to_string())?;

        // 2. Volumes
        let volumes = [
            (
                1,
                "星火初燃",
                1,
                12,
                "凡人林凡觉醒星辰之力，踏上修仙之路",
                "宗门试炼中遭遇暗算，被迫越级挑战",
                "生死之间星辰之力彻底觉醒，跨境界击败强敌",
                "声名鹊起，但也引来了更大的觊觎",
            ),
            (
                2,
                "宗门风云",
                13,
                28,
                "在青云宗站稳脚跟，建立自己的势力班底",
                "宗门内部派系斗争，外门长老图谋星辰传承",
                "宗门大比中力压群雄，揭露长老阴谋",
                "获得进入秘境资格，成为宗门核心弟子",
            ),
            (
                3,
                "秘境惊变",
                29,
                44,
                "探索上古秘境，揭开星辰之力来源",
                "秘境中的上古禁制、同门背叛、异族遭遇",
                "找到星辰传承完整功法，击败秘境守护者",
                "得知上古大劫预言，肩负起应劫使命",
            ),
            (
                4,
                "乱世崛起",
                45,
                60,
                "大劫征兆显现，林凡整合各方势力",
                "各方势力明争暗斗、上古魔修复苏",
                "联合各方势力建立抗魔联盟",
                "修为突破至大乘期，为最终之战做准备",
            ),
            (
                5,
                "星辰之战",
                61,
                72,
                "与上古魔修的终极对决",
                "魔修大军压境、联盟内部出现叛徒",
                "星辰之力完全觉醒，以自身为阵眼封印魔祖",
                "封印成功但林凡陷入沉睡",
            ),
            (
                6,
                "破而后立",
                73,
                82,
                "沉睡百年后的世界——林凡苏醒在一个陌生的世界",
                "旧日同伴离散、新的威胁浮现、星辰之力变化",
                "重新掌握变异的星辰之力，找到昔日的同伴",
                "揭示星辰之力在沉睡期间发生的根本变化",
            ),
            (
                7,
                "因果溯源",
                83,
                94,
                "追溯星辰之力的真正源头——来自另一个宇宙的馈赠",
                "跨宇宙势力的介入、星辰本源意志的考验",
                "通过本源考验，获得宇宙意志的认可",
                "明白真正的敌人来自宇宙之外的虚空",
            ),
            (
                8,
                "永恒星辰",
                95,
                105,
                "最终之战：保卫这片宇宙免受虚空侵蚀",
                "虚空大军入侵、宇宙壁垒破碎、众神陨落",
                "以星辰本源为核心重塑宇宙壁垒",
                "成为新一代星辰掌控者，守护宇宙安宁",
            ),
        ];

        for (num, title, start_ch, end_ch, goal, conflict, climax, settlement) in &volumes {
            let vid = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO volumes (id, project_id, volume_number, title, chapter_start, chapter_end, goal, main_conflict, climax, settlement, status) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'active')",
                rusqlite::params![vid, project_id, num, title, start_ch, end_ch, goal, conflict, climax, settlement],
            ).map_err(|e| e.to_string())?;
        }

        // 3. Characters
        let characters = [
            (
                "林凡",
                "protagonist",
                "星辰传承者、青云宗核心弟子",
                "正直坚韧、重情重义、杀伐果断",
                "守护所爱之人、揭开星辰之力的全部奥秘",
                r#"{"matched_template":"热血少年","customization":{"personality":{"core":"正直坚韧","growth":"从懵懂少年到宇宙守护者","flaw":"过度重情有时影响判断"},"speech":{"tone":"坚定有力，偶尔幽默","pattern":"短句为主，关键时刻庄重","catchphrase":"星辰不灭，我便不灭"},"behavior":{"decision":"直觉+理性结合","fight_style":"以星辰之力为主，灵活多变","stress_response":"越挫越勇"}},"speech_examples":["星辰不灭，我便不灭。","修仙之路，本就是用命去搏那一线生机。","你说的都对，但我不听。"]}"#,
            ),
            (
                "苏婉清",
                "supporting",
                "天璇圣女转世、林凡的修仙引路人",
                "外表清冷内心温热、博学睿智",
                "以知识辅助林凡成长、解开上古秘辛",
                r#"{"matched_template":"温婉佳人","customization":{"personality":{"core":"外表清冷内心温热","growth":"从旁观者到主动参与者","flaw":"过于理性有时显得冷漠"},"speech":{"tone":"轻柔但一针见血","pattern":"长句为主，引经据典","catchphrase":"命运在你自己手中"},"behavior":{"decision":"理性分析为主","fight_style":"以阵法符箓为主","stress_response":"冷静分析局势"}},"speech_examples":["命运在你自己手中，我只是指路人。","你总是这样莽撞，不过……效果还不错。","这件事，恐怕没那么简单。"]}"#,
            ),
            (
                "莫问天",
                "antagonist",
                "前星辰守护者、堕入魔道的上古强者",
                "野心勃勃、智谋深沉、有着扭曲的正义观",
                "以极端方式重塑宇宙秩序",
                r#"{"matched_template":"疯批反派","customization":{"personality":{"core":"野心勃勃但初衷良善","growth":"从守护者到毁灭者","flaw":"手段过于极端"},"speech":{"tone":"低沉威严、充满蛊惑力","pattern":"反问句+哲理性宣言","catchphrase":"你什么都不懂"},"behavior":{"decision":"目的正当化手段","fight_style":"魔道功法+残留星辰之力","stress_response":"更加激进"}},"speech_examples":["你什么都不懂，守护需要代价。","这宇宙本就在走向灭亡，我只是加速了它。","你和我，本质上是同一类人。"]}"#,
            ),
            (
                "铁无双",
                "supporting",
                "炼器宗师、林凡的兄弟",
                "豪爽直率、重义气、大智若愚",
                "以炼器之道支持林凡、找到上古神器炼制之法",
                r#"{"matched_template":"忠义之士","customization":{"personality":{"core":"豪爽直率","growth":"从打铁匠到炼器宗师","flaw":"过于直率容易中计"},"speech":{"tone":"粗犷豪迈、直来直去","pattern":"简单直接、带方言色彩","catchphrase":"瞧好吧您！"},"behavior":{"decision":"直觉+义气优先","fight_style":"以力破巧、重型兵器","stress_response":"更猛烈的进攻"}},"speech_examples":["瞧好吧您！这把剑，保管让林凡那小子满意。","俺不懂那些弯弯绕绕的，但俺知道对错。"]}"#,
            ),
            (
                "灵曦",
                "supporting",
                "秘境中苏醒的上古仙灵",
                "天真好奇、有着古老的智慧碎片",
                "找回完整记忆、探索自己的身份",
                r#"{"matched_template":"妖魅邪修","customization":{"personality":{"core":"天真与古老智慧的矛盾体","growth":"从迷茫到找到自我","flaw":"记忆碎片导致判断不稳定"},"speech":{"tone":"时而天真时而深沉","pattern":"跳跃式、偶尔冒出古老箴言","catchphrase":"我记得……不对，我好像忘了"},"behavior":{"decision":"直觉主导","fight_style":"仙灵之力、辅助治疗","stress_response":"会爆发出古老力量"}},"speech_examples":["我记得……不对，我好像忘了。","千万年前，我也曾站在和你一样的位置。","小花说今天不宜战斗，我们换个方式吧。"]}"#,
            ),
            (
                "虚空使徒",
                "villain",
                "来自宇宙之外的虚空入侵者",
                "无情感、集体意识、只为吞噬",
                "将这片宇宙化为虚空的一部分",
                r#"{"matched_template":"冷面强者","customization":{"personality":{"core":"绝对理性无情感","growth":"从单纯入侵到开始理解这片宇宙","flaw":"不理解个体情感的价值"},"speech":{"tone":"机械冷漠、整齐划一","pattern":"简短陈述句","catchphrase":"抵抗毫无意义"},"behavior":{"decision":"最优策略计算","fight_style":"虚空之力、吞噬同化","stress_response":"召唤更多虚空生物"}},"speech_examples":["抵抗毫无意义。","你们的个体性就是一种缺陷。","我们在拯救你们，将你们从存在中解脱。"]}"#,
            ),
        ];

        for (name, role, identity, persona, motivation, soul) in &characters {
            let cid = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO characters (id, project_id, name, role_type, identity_core, persona_core, core_motivation, soul_json, status, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'active',?9,?10)",
                rusqlite::params![cid, project_id, name, role, identity, persona, motivation, soul, now, now],
            ).map_err(|e| e.to_string())?;
        }

        // 4. Chapters (first 3 with draft content)
        let chapters = [
            (
                1,
                "星辰觉醒",
                r#"夕阳如血，将青云宗外门弟子的居所染成了一片昏黄。

林凡盘坐在自己那间简陋的石屋中，闭目凝神，双手掐诀。灵气在体内缓缓流转，却在抵达丹田时诡异地消散无踪。

"还是不行。"他睁开眼，苦笑着摇了摇头。

进入青云宗三年了，其他同期入门的师兄弟早已突破练气期，甚至有人已经摸到了筑基的门槛。而他的修为，依然停留在练气一层——入门第一天就是这个水平，三年后还是这个水平。

门外传来脚步声，紧接着是熟悉的拍门声。

"林凡！出来！"

是张铁。这个从入门起就认定了他好欺负的家夥，隔三差五就要来找茬。

林凡站起身，推门而出。夕阳刺得他眯了眯眼。

"张铁，什么事？"他的语气平静。

"什么事？"张铁咧嘴一笑，"王执事说了，青云峰的灵草田需要人打理，点名要你去。这可是好事，你可别不识抬举。"

青云峰的灵草田——那是整个宗门灵气最稀薄的地方，去那里打理灵草，就等于被发配了。

林凡皱了皱眉："我记得上个月是轮值的李家打理。"

"李家给王执事送了一瓶聚气丹，你送了什么？"张铁嘲弄地看着他，"赶紧收拾东西，明天一早就去青云峰报到。"

林凡没有动。

夕阳的余晖落在他身上，他忽然感到丹田深处传来一阵轻微的震颤——那是从未有过的感觉。就像有什么东西正在苏醒。

他低下头，摊开手掌。

在他的手心，一点极其微弱的星芒正在闪烁。它在吸收着夕阳的光芒，变得越来越亮。

张铁注意到了这个变化，脸色微变："这是什么？"

林凡没有回答。他的全部心神都被掌心的星芒吸引了。

那光芒越来越强，渐渐凝聚成一个古老的符文图案。林凡是第一次见到这个图案，却莫名地感到熟悉——仿佛它早就在自己的血脉中沉睡，只等这一刻被唤醒。

当符文完全成型的瞬间，一股磅礴的信息洪流涌入他的脑海。

上古星辰诀第一层——星辉引。

林凡闭上了眼睛，感受着体内翻天覆地的变化。三年来始终无法突破的壁垒，在这一刻轰然碎裂。

练气二层、三层、四层……

直到练气九层巅峰，那股力量才缓缓平息。

他睁开眼睛。张铁已经退到了三丈之外，满脸惊惧。

"你……你刚才……"

"张铁，"林凡平静地说，"告诉王执事，我不去青云峰了。"

夕阳沉入山峦，夜幕降临。

在这个普通的黄昏，三万年的因果找到了这一世的传承者。

星辰的故事，就此开始。"#,
            ),
            (
                2,
                "试炼之路",
                r#"三天后，林凡站在宗门试炼台的入口处。

练气九层巅峰——这个消息以惊人的速度传遍了整个外门。王执事亲自登门，态度发生了翻天覆地的变化。三年来无人问津的少年，一夜之间成了众人瞩目的焦点。

"林凡，你确定要参加这次试炼？"负责登记的内门弟子抬头看了他一眼，"以你……呃，以你现在的修为，应该没问题。不过内门的李长老说了，你若愿意加入他的门下，可以免去试炼。"

林凡摇了摇头："我要凭自己通过试炼。"

这是他昨天和铁无双商量后做出的决定。铁无双是他在宗门中唯一的朋友，一个天赋不高但打铁技术一流的傻大个。

"林凡，你真的要去试炼啊？"铁无双跟在他身后，手里还拎着一把刚打好的铁剑，"俺给你打了把剑，虽然比不上那些灵器，但凑合着用。"

林凡接过铁剑，剑身粗糙但分量十足。他拍了拍铁无双的肩膀："谢了，兄弟。"

试炼台内是一片独立的空间——由宗门大能开辟的秘境。里面有凶兽、有禁制、有各种危险，但也是检视弟子实力最公正的舞台。

光芒闪过，林凡已站在一片密林之中。

四周寂静得有些诡异。

他紧了紧手中的铁剑，运转体内星辰之力。灵觉瞬间扩散开来，方圆百丈内的一切都在他的感知之中。

前方三十丈，三只赤炎狼正在靠近。它们的气息——约莫相当于人类练气七层的实力。

林凡深吸一口气，不仅没有后退，反而迎了上去。

三年来被嘲笑的憋屈、丹田无法突破的绝望、对那个莫名其妙涌入脑海的星辰传承的感激——所有这些情绪在这一刻汇成了一股洪流。

他要证明自己。

赤炎狼发现了他的气息，三道火红的身影从树林中窜出，炽热的气息扑面而来。

林凡右手握剑，左手掐诀。星辰之力在他脚下凝聚，整个人化作一道残影。

"星步——"

第一只赤炎狼只觉得眼前一花，铁剑已没入它的咽喉。

"星击——"

星辰之力注入剑身，朴实无华的铁剑猛然爆发出璀璨星光。第二只赤炎狼被一剑斩飞，撞在树干上滑落下来。

第三只赤炎狼发出愤怒的咆哮，张口喷出一道火焰。

林凡不闪不避，左手凝聚起一面星辰光盾。火焰撞在光盾上，四散飞溅。

"星辰盾——"

他顶着火焰一步步上前，铁剑高高举起。

火焰散去，赤炎狼惊恐地看到一个身影已经近在咫尺。

一剑落下。

收剑回鞘的瞬间，林凡忽然明白了那个上古传承的第一课。

力量不是用来证明自己的。力量是当你有了想要守护的东西时，自然而然会需要的东西。

他转过身，继续向试炼台深处走去。

密林之后，是一座石碑。上面刻着古老而模糊的文字，但林凡却能奇妙地读懂：

"星辰传承第三万六千代试炼者——请证明你拥有承载群星之力的资格。"

一股强大的威压从石碑中释放而出。

林凡握紧了剑柄。他的战斗，才刚刚开始。"#,
            ),
            (
                3,
                "力挽狂澜",
                r#"试炼第七天。

林凡站在最后一道关卡前。

七天里，他经历了太多——凶兽、禁制、幻境，还有那些同样参加试炼、想要抢夺他战利品的同门。他手中的铁剑已经卷刃，身上的衣袍破烂不堪，但他的眼睛却比七天前更加明亮。

星辰传承的力量在他体内越来越强。每一次战斗，每一次濒死，都会让这股力量和他更加契合。

最后一道关卡是一尊石像。高三丈的石像雕刻着一个持剑的人形，面容模糊，但站姿从容。

"最后的试炼——战胜你自己。"

一个声音在林凡脑海中响起。

石像的眼睛亮了起来。与此同时，一个和林凡一模一样的虚影从石像中走出，手持同样的剑，头上有同样的星辰光辉。

镜像我。

虚影没有说话，直接发动了攻击。星步、星击、星辰盾——每一招每一式都和林凡一模一样，甚至更快、更准。

林凡被逼得连连后退。无论他出什么招数，虚影都能完美复制。

"这是我的极限吗？"

虚影一剑刺来，林凡险险避开。但这一次，他没有反击。

他闭上了眼睛。

虚影能复制他的招式，但不能复制他的经历。三年的冷眼、丹田的桎梏、掌心的第一缕星光——这些是虚影永远无法理解的。

星辰之力不是一套功法，而是一种传承血脉的觉醒。

林凡睁开眼睛。他的眼眸中，浮现出了星辰的图案。

"你不是我。"

他上前一步，铁剑平举。没有任何花哨的招式，只是将全部星辰之力凝聚在剑尖。

虚影以同样的姿势出剑。

两剑相交。

虚影的铁剑寸寸碎裂。

因为虚影没有经历过三年的绝望，无法理解林凡凝聚在剑尖的那份渴望——渴望证明自己、渴望守护、渴望不再被任何人看轻。

轰——

石像碎裂。

林凡单膝跪地，大口喘息。但他的嘴角，在笑。

试炼已经通过。

当试炼台的出口打开时，林凡看到了无数张惊讶的脸。外门弟子、内门弟子、甚至几位长老都来了。他们看着这个穿着破烂衣袍、提着一把卷刃铁剑的少年，表情各异。

"他的修为……"一位内门弟子的声音在颤抖。

林凡的气息已经完全稳定——筑基三层。七天内从练气一层到筑基三层，这种速度在外门历史上前所未有。

铁无双挤过人群冲了进来，一把抱住林凡。

"哈哈！俺就知道你小子能行！"

林凡拍了拍他的背，目光越过人群，看向宗门深处的九座主峰。那里，才是真正的舞台。

王执事站在人群中，脸色发白。他想起了三天前让林凡去青云峰的决定。

"王执事，"林凡走到他面前，语气平静，"谢谢你这三年来的照顾。"

说完，他转身离去，留下王执事瘫坐在地上。

星辰的光芒在这个少年身上已经初现端倪。但所有人都不知道，这只是波澜壮阔故事的开始。

在那遥远的虚空中，一个古老的存在感应到了星辰之力的波动。

"第三万六千代……终于等到了。"它低语道，"希望这一代的传承者，能够承担起那个责任。"

因为三万年前那个被封印的上古魔修——莫问天，即将苏醒。

而林凡，还对此一无所知。"#,
            ),
        ];

        for (num, title, draft) in &chapters {
            let ch_id = uuid::Uuid::new_v4().to_string();
            let wc = draft.chars().count() as i64;
            conn.execute(
                "INSERT INTO chapters (id, project_id, chapter_number, title, draft_text, status, word_count, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,'drafting',?6,?7,?8)",
                rusqlite::params![ch_id, project_id, num, title, draft, wc, now, now],
            ).map_err(|e| e.to_string())?;
            // Add initial version
            let ver_id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO chapter_versions (id, chapter_id, version_no, content_type, content, created_by, created_at) VALUES (?1,?2,1,'draft',?3,'seed',?4)",
                rusqlite::params![ver_id, ch_id, draft, now],
            ).map_err(|e| e.to_string())?;
        }

        // 5. Canon rules
        let rules = [
            ("power_system", "力量体系", "硬规则", "星辰之力共九层：星辉引、星芒出、星核成、星河现、星域开、星界临、星辰变、星辰灭、星辰永恒。每层对应修仙境界的一个大阶段。星辰之力不可被其他力量体系兼容。", true),
            ("character_power", "角色战力", "硬规则", "主角林凡不得在同一卷内连续跨两个大境界突破。每次大境界突破必须有合理的契机和代价。", true),
            ("world_rule", "世界观基准", "硬规则", "故事发生在九州大陆，星辰界是九州大陆的上界。凡人界→修仙界→星辰界→虚空之外，四层宇宙架构。不得随意添加新的层级。", true),
            ("dialogue_style", "对话风格", "软规则", "古代背景角色不使用现代网络用语。各角色保持其SOUL档案设定的说话风格。林凡坚定有力、苏婉清清冷睿智、铁无双豪爽直率。", false),
            ("chapter_structure", "章节结构", "软规则", "每章结尾必须有钩子（悬念/期待/反转），章字数控制在2000-5000字之间。第一章为引入章可以稍短。", false),
        ];

        for (key, name, rtype, content, is_hard) in &rules {
            let rid = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO canon_rules (id, project_id, rule_key, rule_name, rule_type, scope_type, content, is_hard, status, version, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,'global',?6,?7,'active',1,?8,?9)",
                rusqlite::params![rid, project_id, key, name, rtype, content, *is_hard as i64, now, now],
            ).map_err(|e| e.to_string())?;
        }

        // 6. Foreshadow items
        let foreshadows = [
            (
                1,
                "掌心的星芒",
                "林凡是星辰传承第三万六千代传人",
                "planted",
                8,
            ),
            (
                3,
                "莫问天的苏醒",
                "三万年前被封印的魔修正将苏醒",
                "planted",
                5,
            ),
            (
                2,
                "苏婉清的身份",
                "天璇圣女转世，前世的记忆碎片散落在各大秘境中",
                "planted",
                6,
            ),
            (
                1,
                "虚空之外的注视",
                "虚空势力在暗中观察星辰传承者",
                "planted",
                7,
            ),
            (
                2,
                "铁无双的锻造天赋",
                "铁无双实际上拥有上古炼器师的隐性传承",
                "planted",
                4,
            ),
        ];

        for (seed_ch, title, condition, status, importance) in &foreshadows {
            let fid = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO foreshadow_items (id, project_id, seed_chapter, title, maturity_condition, status, importance, notes) VALUES (?1,?2,?3,?4,?5,?6,?7,'')",
                rusqlite::params![fid, project_id, seed_ch, title, condition, status, importance],
            ).map_err(|e| e.to_string())?;
        }

        // 7. Book outline
        let outline = serde_json::json!({
            "title": "星辰仙途",
            "genre": "仙侠",
            "main_theme": "守护与牺牲——真正的强者不是征服一切，而是守护所爱",
            "world_framework": "四层宇宙架构：凡人界→修仙界→星辰界→虚空之外",
            "power_system": "星辰之力九层体系，每层对应修仙大境界",
            "main_characters": ["林凡(主角)", "苏婉清(引路人)", "铁无双(兄弟)", "莫问天(反派)", "灵曦(伙伴)", "虚空使徒(终极敌人)"],
        });

        let outline_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO book_outlines (id, project_id, version, content_json, status, created_at, updated_at) VALUES (?1,?2,1,?3,'active',?4,?5)",
            rusqlite::params![outline_id, project_id, outline.to_string(), now, now],
        ).map_err(|e| e.to_string())?;

        // 8. Add to bookshelf
        drop(project_conn);
        {
            let global_conn = db.global.lock().map_err(|e| e.to_string())?;
            let max_order: i64 = global_conn
                .query_row(
                    "SELECT COALESCE(MAX(display_order), 0) FROM bookshelf",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            global_conn.execute(
                "INSERT INTO bookshelf (id, project_id, title, genre_name, status, display_order, created_at) VALUES (?1,?2,?3,?4,'active',?5,?6)",
                rusqlite::params![uuid::Uuid::new_v4().to_string(), project_id, "星辰仙途", "仙侠", max_order + 1, now],
            ).map_err(|e| e.to_string())?;
        }
    }

    Ok(SeedResult {
        project_id,
        title: "星辰仙途".to_string(),
        volumes_created: 8,
        characters_created: 6,
        chapters_created: 3,
        canon_rules_created: 5,
        foreshadows_created: 5,
    })
}
