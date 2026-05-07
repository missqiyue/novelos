-- Extended SOUL templates (DATA-011,012): 15配角/反派 + 5关系模板
INSERT OR IGNORE INTO soul_templates (id, soul_name, category, genre_compat, personality_json, speech_json, behavior_json, relationships_json, is_builtin, created_at, updated_at) VALUES
('soul_011', '阴谋家', 'antagonist', '都市,历史,玄幻', '{"core":"深沉多疑","surface":"温文尔雅","drive":"权力渴望","flaw":"过度自信"}', '{"tone":"彬彬有礼中暗藏威胁","pattern":"话中有话、多用反问","catchphrase":"你不会真的以为……"}', '{"decision":"长期布局","social":"收买人心","conflict":"借刀杀人","stress":"更加冷静"}', '{"default":"利用为主","trust":"从不真正信任","allies":"视为棋子","enemies":"表面尊重"}', 1, datetime('now'), datetime('now')),
('soul_012', '复仇者', 'antagonist', '武侠,玄幻,都市', '{"core":"被仇恨驱动","surface":"冷漠疏离","drive":"复仇","flaw":"不择手段"}', '{"tone":"冷峻简短","pattern":"很少主动说话","catchphrase":"你欠我的"}', '{"decision":"效率优先","social":"独来独往","conflict":"不死不休","stress":"仇恨加深"}', '{"default":"保持距离","trust":"极难信任","allies":"短暂合作","enemies":"仇人名单"}', 1, datetime('now'), datetime('now')),
('soul_013', '导师长者', 'supporting', '通用', '{"core":"睿智豁达","surface":"和蔼可亲","drive":"传承","flaw":"有时隐瞒真相"}', '{"tone":"语重心长","pattern":"引经据典","catchphrase":"时机未到"}', '{"decision":"考虑长远","social":"栽培后辈","conflict":"以退为进","stress":"深藏不露"}', '{"default":"保护后辈","trust":"先观察后信任","allies":"同道中人","enemies":"不主动树敌"}', 1, datetime('now'), datetime('now')),
('soul_014', '江湖浪子', 'supporting', '武侠,仙侠', '{"core":"洒脱不羁","surface":"玩世不恭","drive":"自由","flaw":"逃避责任"}', '{"tone":"轻松调侃","pattern":"不拘小节","catchphrase":"天塌了有个高的顶着"}', '{"decision":"率性而为","social":"四海之内皆兄弟","conflict":"打得过就打","stress":"容易放弃"}', '{"default":"见义勇为","trust":"凭感觉","allies":"意气相投","enemies":"转头就忘"}', 1, datetime('now'), datetime('now')),
('soul_015', '腹黑谋士', 'supporting', '历史,玄幻', '{"core":"算计天下","surface":"温顺无害","drive":"证明自己的价值","flaw":"不信任他人的善意"}', '{"tone":"谦虚谨慎","pattern":"滴水不漏","catchphrase":"在下以为……"}', '{"decision":"计算最优解","social":"隐藏真实能力","conflict":"未雨绸缪","stress":"更深地隐藏"}', '{"default":"利益交换","trust":"通过考验","allies":"互相需要","enemies":"不动声色"}', 1, datetime('now'), datetime('now')),
('soul_016', '枭雄霸主', 'villain', '玄幻,武侠,历史', '{"core":"天下为棋","surface":"雄才大略","drive":"统一征服","flaw":"刚愎自用"}', '{"tone":"不容置疑","pattern":"命令式","catchphrase":"顺我者昌"}', '{"decision":"闪电出手","social":"恩威并施","conflict":"碾压式进攻","stress":"孤注一掷"}', '{"default":"君臣关系","trust":"用人之际","allies":"暂时的","enemies":"必须铲除"}', 1, datetime('now'), datetime('now')),
('soul_017', '悲情仙子', 'supporting', '仙侠,玄幻,言情', '{"core":"凄美执着","surface":"清冷出尘","drive":"守护约定","flaw":"过于执着过去"}', '{"tone":"轻柔带悲音","pattern":"欲言又止","catchphrase":"这句话，我等了很久"}', '{"decision":"以守护为优先","social":"若即若离","conflict":"不动声色的强大","stress":"更加沉默"}', '{"default":"保持距离","trust":"需要时间","allies":"考验后才接纳","enemies":"不轻易树敌"}', 1, datetime('now'), datetime('now')),
('soul_018', '市井小民', 'minor', '都市,历史', '{"core":"趋利避害","surface":"热情周到","drive":"生存","flaw":"见风使舵"}', '{"tone":"热情谄媚","pattern":"总在察言观色","catchphrase":"您说了算"}', '{"decision":"跟随强者","social":"广结善缘","conflict":"能躲就躲","stress":"更加谄媚"}', '{"default":"不得罪人","trust":"谁厉害信谁","allies":"利益关系","enemies":"不存在的"}', 1, datetime('now'), datetime('now')),
('soul_019', '武道狂人', 'supporting', '武侠,玄幻', '{"core":"武道至上","surface":"粗犷豪放","drive":"攀登武道巅峰","flaw":"除武道外什么都不关心"}', '{"tone":"粗鲁直接","pattern":"三句不离战斗","catchphrase":"来打一场"}', '{"decision":"武力解决","social":"挑战强者","conflict":"正面硬撼","stress":"战意更盛"}', '{"default":"切磋为主","trust":"拳头说话","allies":"能打的就是","enemies":"打不过的就是"}', 1, datetime('now'), datetime('now')),
('soul_020', '隐世高人', 'supporting', '通用', '{"core":"淡泊名利","surface":"平凡低调","drive":"守护平衡","flaw":"不愿干涉尘世"}', '{"tone":"平淡如水","pattern":"说一半留一半","catchphrase":"天机不可泄露"}', '{"decision":"观察为主","social":"避世隐居","conflict":"最小干预","stress":"默默关注"}', '{"default":"旁观者","trust":"缘分决定","allies":"偶然相遇","enemies":"没有敌人"}', 1, datetime('now'), datetime('now')),

-- Relationship SOUL templates (DATA-012)
('soul_r01', '生死兄弟', 'relationship', '通用', '{"core":"肝胆相照","dynamic":"互补互助","conflict_mode":"争吵后更团结"}', '{"tone":"直来直去","banter":"互相损但不容外人说","serious":"有事真上"}', '{"cooperation":"天衣无缝","sacrifice":"愿意牺牲","growth":"互相成就"}', '{"patterns":["不打不相识","患难见真情","性格互补"]}', 1, datetime('now'), datetime('now')),
('soul_r02', '宿命之敌', 'relationship', '通用', '{"core":"相互认可却立场对立","dynamic":"亦敌亦友","conflict_mode":"惺惺相惜却必须战斗"}', '{"tone":"尊重中带着挑衅","banter":"互揭伤疤","serious":"临终可能和解"}', '{"cooperation":"被迫联手","sacrifice":"可能为对方挡箭","growth":"因对方而变强"}', '{"patterns":["理念不合","相爱相杀","最终和解"]}', 1, datetime('now'), datetime('now')),
('soul_r03', '师徒传承', 'relationship', '通用', '{"core":"传道授业","dynamic":"教与学的动态平衡","conflict_mode":"理念碰撞后融合"}', '{"tone":"威严与关怀并存","banter":"偶尔训诫","serious":"倾囊相授"}', '{"cooperation":"师父引路徒弟开拓","sacrifice":"为徒弟铺路","growth":"青出于蓝而胜于蓝"}', '{"patterns":["严厉但用心","徒弟背叛考验","最终传承"]}', 1, datetime('now'), datetime('now')),
('soul_r04', '相爱相杀', 'relationship', '言情,玄幻', '{"core":"深爱却因各种原因对立","dynamic":"甜蜜与痛苦交替","conflict_mode":"爱越深伤越深"}', '{"tone":"时而温柔时而冷厉","banter":"互相刺痛对方","serious":"生死关头袒露真心"}', '{"cooperation":"偶尔联手","sacrifice":"愿为对方死却不能为对方活","growth":"在痛苦中理解爱的意义"}', '{"patterns":["误会重重","立场对立","虐恋后he"]}', 1, datetime('now'), datetime('now')),
('soul_r05', '暗中守护', 'relationship', '通用', '{"core":"不求回报的默默守护","dynamic":"被守护者可能永远不知道","conflict_mode":"守护者独自承担"}', '{"tone":"默默无言","banter":"从不表露","serious":"关键时刻出现"}', '{"cooperation":"暗中帮助","sacrifice":"不求回报的付出","growth":"被守护者的成长就是回报"}', '{"patterns":["默默注视","关键时刻救场","可能是亲人/暗恋者"]}', 1, datetime('now'), datetime('now'));

-- Extended de-AI rules (DATA-021): high-frequency AI patterns
INSERT OR IGNORE INTO de_ai_rules (id, category, pattern, replacement, severity, is_enabled, description, created_at) VALUES
('deai_021', 'vocabulary', '宛若', '像、如同、仿佛', 'medium', 1, 'AI高频词汇', datetime('now')),
('deai_022', 'vocabulary', '不禁', '忍不住、不由得', 'medium', 1, 'AI高频词汇', datetime('now')),
('deai_023', 'vocabulary', '竟然', '居然、竟', 'low', 1, '过度使用', datetime('now')),
('deai_024', 'vocabulary', '瞬间', '刹那间、一瞬、转眼', 'low', 1, '多样化替换', datetime('now')),
('deai_025', 'vocabulary', '缓缓', '慢慢、渐渐、徐徐', 'low', 1, '多样化替换', datetime('now')),
('deai_026', 'sentence', '他感到一阵……', '改为动作/神态描写', 'high', 1, '情绪直给 vs 暗示', datetime('now')),
('deai_027', 'sentence', '心中涌起一股……', '改为具体身体反应', 'high', 1, '情绪直给 vs 暗示', datetime('now')),
('deai_028', 'sentence', '语气中带着一丝……', '删除或改为动作', 'medium', 1, 'AI句式模板', datetime('now')),
('deai_029', 'rhetoric', '连续三个以上的比喻句', '精简为1-2个比喻', 'medium', 1, '过度修辞', datetime('now')),
('deai_030', 'rhetoric', '每段都以"……，"结尾的排比', '打破排比结构', 'medium', 1, '句式工整检测', datetime('now')),
('deai_031', 'adverb', '缓缓地、慢慢地、轻轻地', '用更具体的动作描写替代', 'low', 1, '过度使用副词', datetime('now')),
('deai_032', 'adverb', '深深地、紧紧地、狠狠地', '用更具体的动作描写替代', 'low', 1, '过度使用副词', datetime('now')),
('deai_033', 'idiom', '连续使用两个以上四字成语', '保留一个，其余展开描写', 'medium', 1, '成语堆砌', datetime('now')),
('deai_034', 'other', '最后，……/总之，……/就这样，……', '不同结尾方式', 'high', 1, '模板化结束语', datetime('now')),
('deai_035', 'other', '章节结尾：明天将会……', '不要预告式结尾', 'high', 1, 'AI预告式结尾', datetime('now'));

-- Style profiles (DATA-030): built-in writing style profiles
INSERT OR IGNORE INTO style_profiles (id, name, category, description, narrative_perspective, language_style, dialogue_ratio, description_density, pace_profile, sample_text) VALUES
('style_01', '玄幻爽文', 'xuanhuan', '节奏明快、爽点密集的玄幻风格', '第三人称全知', '白话为主、夹带文言修饰', 35, '中等', '快节奏、3-5章一个小高潮', '林凡二话不说，一剑劈了过去。'),
('style_02', '仙侠古风', 'xianxia', '典雅含蓄、意境深远的仙侠风格', '第三人称限知', '半文半白、注重意境渲染', 25, '较高', '舒缓中有张力、铺垫充分', '剑光如水，月华如练，他负手立于云海之巅。'),
('style_03', '都市利落', 'dushi', '简洁明快、节奏紧凑的都市风格', '第三人称或第一人称', '口语化、短句为主', 45, '较低', '极快节奏、每章都有推进', '"行。"我说完就挂了电话。'),
('style_04', '悬疑冷硬', 'xuanyi', '冷静克制、信息密度高的悬疑风格', '第一人称或第三人称限知', '简洁冷峻、留白多', 30, '高', '层层递进、逐步揭示', '他数到三，门后没有任何声音。'),
('style_05', '甜宠轻快', 'yanqing', '轻松甜美、互动感强的言情风格', '第三人称或第一人称', '活泼口语、内心戏丰富', 50, '较低', '互动为主、每章有甜蜜点', '"你怎么又来了！"嘴上这么说，嘴角却忍不住上扬。'),
('style_06', '虐文细腻', 'yanqing', '情感浓烈、心理刻画深入的风格', '第三人称全知', '细腻绵密、情感渲染强', 30, '较高', '情感积累→爆发→余韵', '她等了一夜，雪落满了肩头。'),
('style_07', '末世硬朗', 'moshimo', '冷硬写实、生存感强烈的风格', '第三人称限知', '硬朗简洁、不渲染', 35, '中等', '紧张持续、危机感不断', '弹匣还有三发。外面至少有二十个。'),
('style_08', '电竞热血', 'youxi', '热血青春、竞技对抗强烈的风格', '第三人称或第一人称', '青春活力、术语专业感', 40, '较低', '训练→比赛→高潮循环', '"三杀！"解说员的声音响起，全场沸腾。');

-- Extended collision library (DATA-042): 100+ banned names + famous titles
INSERT OR IGNORE INTO banned_names (id, name, reason, ban_level, created_at) VALUES
('bn_021', '萧炎', '《斗破苍穹》主角', 'high', datetime('now')),
('bn_022', '唐三', '《斗罗大陆》主角', 'high', datetime('now')),
('bn_023', '韩立', '《凡人修仙传》主角', 'high', datetime('now')),
('bn_024', '方平', '《全球高武》主角', 'medium', datetime('now')),
('bn_025', '罗峰', '《吞噬星空》主角', 'high', datetime('now')),
('bn_026', '纪宁', '《莽荒纪》主角', 'medium', datetime('now')),
('bn_027', '秦羽', '《星辰变》主角', 'medium', datetime('now')),
('bn_028', '林雷', '《盘龙》主角', 'medium', datetime('now')),
('bn_029', '叶凡', '《遮天》主角', 'high', datetime('now')),
('bn_030', '石昊', '《完美世界》主角', 'high', datetime('now')),
('bn_031', '张小凡', '《诛仙》主角', 'high', datetime('now')),
('bn_032', '白小纯', '《一念永恒》主角', 'medium', datetime('now')),
('bn_033', '孟浩', '《我欲封天》主角', 'medium', datetime('now')),
('bn_034', '苏铭', '《求魔》主角', 'medium', datetime('now')),
('bn_035', '王林', '《仙逆》主角', 'high', datetime('now'));

INSERT OR IGNORE INTO banned_book_titles (id, title, reason, heat_level, created_at) VALUES
('bt_026', '斗破苍穹', '天蚕土豆作品', 'extreme', datetime('now')),
('bt_027', '武动乾坤', '天蚕土豆作品', 'extreme', datetime('now')),
('bt_028', '大主宰', '天蚕土豆作品', 'extreme', datetime('now')),
('bt_029', '斗罗大陆', '唐家三少作品', 'extreme', datetime('now')),
('bt_030', '绝世唐门', '唐家三少作品', 'extreme', datetime('now')),
('bt_031', '凡人修仙传', '忘语作品', 'extreme', datetime('now')),
('bt_032', '仙逆', '耳根作品', 'extreme', datetime('now')),
('bt_033', '求魔', '耳根作品', 'high', datetime('now')),
('bt_034', '我欲封天', '耳根作品', 'high', datetime('now')),
('bt_035', '一念永恒', '耳根作品', 'high', datetime('now')),
('bt_036', '完美世界', '辰东作品', 'extreme', datetime('now')),
('bt_037', '遮天', '辰东作品', 'extreme', datetime('now')),
('bt_038', '圣墟', '辰东作品', 'high', datetime('now')),
('bt_039', '星辰变', '我吃西红柿作品', 'extreme', datetime('now')),
('bt_040', '盘龙', '我吃西红柿作品', 'extreme', datetime('now')),
('bt_041', '吞噬星空', '我吃西红柿作品', 'extreme', datetime('now')),
('bt_042', '莽荒纪', '我吃西红柿作品', 'high', datetime('now')),
('bt_043', '雪中悍刀行', '烽火戏诸侯作品', 'extreme', datetime('now')),
('bt_044', '剑来', '烽火戏诸侯作品', 'extreme', datetime('now')),
('bt_045', '全球高武', '老鹰吃小鸡作品', 'high', datetime('now'));
