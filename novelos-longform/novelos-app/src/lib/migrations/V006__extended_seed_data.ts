// V006: Extended seed data (mirrors Rust V006 with schema fixes)
// Rust V006 has schema mismatches for style_profiles/banned_names/banned_book_titles.
// This version uses the correct column names from the V001 table definitions.
export const sql = `
-- Extended SOUL templates (15 supporting/antagonist + 5 relationship templates)
INSERT OR IGNORE INTO soul_templates (id, soul_name, category, genre_compat, personality_json, speech_json, behavior_json, relationships_json, is_builtin, created_at, updated_at) VALUES
('st-011', '阴谋家', 'antagonist', '["dushi","lishi","xuanhuan"]', '{"core":"深沉多疑","surface":"温文尔雅","drive":"权力渴望","flaw":"过度自信"}', '{"tone":"彬彬有礼中暗藏威胁","pattern":"话中有话、多用反问","catchphrase":"你不会真的以为……"}', '{"decision":"长期布局","social":"收买人心","conflict":"借刀杀人","stress":"更加冷静"}', '{"default":"利用为主","trust":"从不真正信任","allies":"视为棋子","enemies":"表面尊重"}', 1, datetime('now'), datetime('now')),
('st-012', '复仇者', 'antagonist', '["wuxia","xuanhuan","dushi"]', '{"core":"被仇恨驱动","surface":"冷漠疏离","drive":"复仇","flaw":"不择手段"}', '{"tone":"冷峻简短","pattern":"很少主动说话","catchphrase":"你欠我的"}', '{"decision":"效率优先","social":"独来独往","conflict":"不死不休","stress":"仇恨加深"}', '{"default":"保持距离","trust":"极难信任","allies":"短暂合作","enemies":"仇人名单"}', 1, datetime('now'), datetime('now')),
('st-013', '导师长者', 'supporting', '["xuanhuan","wuxia","xianxia","dushi"]', '{"core":"睿智豁达","surface":"和蔼可亲","drive":"传承","flaw":"有时隐瞒真相"}', '{"tone":"语重心长","pattern":"引经据典","catchphrase":"时机未到"}', '{"decision":"考虑长远","social":"栽培后辈","conflict":"以退为进","stress":"深藏不露"}', '{"default":"保护后辈","trust":"先观察后信任","allies":"同道中人","enemies":"不主动树敌"}', 1, datetime('now'), datetime('now')),
('st-014', '江湖浪子', 'supporting', '["wuxia","xianxia"]', '{"core":"洒脱不羁","surface":"玩世不恭","drive":"自由","flaw":"逃避责任"}', '{"tone":"轻松调侃","pattern":"不拘小节","catchphrase":"天塌了有个高的顶着"}', '{"decision":"率性而为","social":"四海之内皆兄弟","conflict":"打得过就打","stress":"容易放弃"}', '{"default":"见义勇为","trust":"凭感觉","allies":"意气相投","enemies":"转头就忘"}', 1, datetime('now'), datetime('now')),
('st-015', '腹黑谋士', 'supporting', '["lishi","xuanhuan"]', '{"core":"算计天下","surface":"温顺无害","drive":"证明自己的价值","flaw":"不信任他人的善意"}', '{"tone":"谦虚谨慎","pattern":"滴水不漏","catchphrase":"在下以为……"}', '{"decision":"计算最优解","social":"隐藏真实能力","conflict":"未雨绸缪","stress":"更深地隐藏"}', '{"default":"利益交换","trust":"通过考验","allies":"互相需要","enemies":"不动声色"}', 1, datetime('now'), datetime('now')),
('st-016', '枭雄霸主', 'antagonist', '["xuanhuan","wuxia","lishi"]', '{"core":"天下为棋","surface":"雄才大略","drive":"统一征服","flaw":"刚愎自用"}', '{"tone":"不容置疑","pattern":"命令式","catchphrase":"顺我者昌"}', '{"decision":"闪电出手","social":"恩威并施","conflict":"碾压式进攻","stress":"孤注一掷"}', '{"default":"君臣关系","trust":"用人之际","allies":"暂时的","enemies":"必须铲除"}', 1, datetime('now'), datetime('now')),
('st-017', '悲情仙子', 'supporting', '["xianxia","xuanhuan","yanqing"]', '{"core":"凄美执着","surface":"清冷出尘","drive":"守护约定","flaw":"过于执着过去"}', '{"tone":"轻柔带悲音","pattern":"欲言又止","catchphrase":"这句话，我等了很久"}', '{"decision":"以守护为优先","social":"若即若离","conflict":"不动声色的强大","stress":"更加沉默"}', '{"default":"保持距离","trust":"需要时间","allies":"考验后才接纳","enemies":"不轻易树敌"}', 1, datetime('now'), datetime('now')),
('st-018', '市井小民', 'minor', '["dushi","lishi"]', '{"core":"趋利避害","surface":"热情周到","drive":"生存","flaw":"见风使舵"}', '{"tone":"热情谄媚","pattern":"总在察言观色","catchphrase":"您说了算"}', '{"decision":"跟随强者","social":"广结善缘","conflict":"能躲就躲","stress":"更加谄媚"}', '{"default":"不得罪人","trust":"谁厉害信谁","allies":"利益关系","enemies":"不存在的"}', 1, datetime('now'), datetime('now')),
('st-019', '武道狂人', 'supporting', '["wuxia","xuanhuan"]', '{"core":"武道至上","surface":"粗犷豪放","drive":"攀登武道巅峰","flaw":"除武道外什么都不关心"}', '{"tone":"粗鲁直接","pattern":"三句不离战斗","catchphrase":"来打一场"}', '{"decision":"武力解决","social":"挑战强者","conflict":"正面硬撼","stress":"战意更盛"}', '{"default":"切磋为主","trust":"拳头说话","allies":"能打的就是","enemies":"打不过的就是"}', 1, datetime('now'), datetime('now')),
('st-020', '隐世高人', 'supporting', '["xuanhuan","wuxia","xianxia"]', '{"core":"淡泊名利","surface":"平凡低调","drive":"守护平衡","flaw":"不愿干涉尘世"}', '{"tone":"平淡如水","pattern":"说一半留一半","catchphrase":"天机不可泄露"}', '{"decision":"观察为主","social":"避世隐居","conflict":"最小干预","stress":"默默关注"}', '{"default":"旁观者","trust":"缘分决定","allies":"偶然相遇","enemies":"没有敌人"}', 1, datetime('now'), datetime('now')),

-- Relationship SOUL templates
('st-r01', '生死兄弟', 'relationship', '["xuanhuan","wuxia","xianxia"]', '{"core":"肝胆相照","dynamic":"互补互助","conflict_mode":"争吵后更团结"}', '{"tone":"直来直去","banter":"互相损但不容外人说","serious":"有事真上"}', '{"cooperation":"天衣无缝","sacrifice":"愿意牺牲","growth":"互相成就"}', '{"patterns":["不打不相识","患难见真情","性格互补"]}', 1, datetime('now'), datetime('now')),
('st-r02', '宿命之敌', 'relationship', '["xuanhuan","wuxia","xianxia"]', '{"core":"相互认可却立场对立","dynamic":"亦敌亦友","conflict_mode":"惺惺相惜却必须战斗"}', '{"tone":"尊重中带着挑衅","banter":"互揭伤疤","serious":"临终可能和解"}', '{"cooperation":"被迫联手","sacrifice":"可能为对方挡箭","growth":"因对方而变强"}', '{"patterns":["理念不合","相爱相杀","最终和解"]}', 1, datetime('now'), datetime('now')),
('st-r03', '师徒传承', 'relationship', '["xuanhuan","wuxia","xianxia"]', '{"core":"传道授业","dynamic":"教与学的动态平衡","conflict_mode":"理念碰撞后融合"}', '{"tone":"威严与关怀并存","banter":"偶尔训诫","serious":"倾囊相授"}', '{"cooperation":"师父引路徒弟开拓","sacrifice":"为徒弟铺路","growth":"青出于蓝而胜于蓝"}', '{"patterns":["严厉但用心","徒弟背叛考验","最终传承"]}', 1, datetime('now'), datetime('now')),
('st-r04', '相爱相杀', 'relationship', '["yanqing","xuanhuan"]', '{"core":"深爱却因各种原因对立","dynamic":"甜蜜与痛苦交替","conflict_mode":"爱越深伤越深"}', '{"tone":"时而温柔时而冷厉","banter":"互相刺痛对方","serious":"生死关头袒露真心"}', '{"cooperation":"偶尔联手","sacrifice":"愿为对方死却不能为对方活","growth":"在痛苦中理解爱的意义"}', '{"patterns":["误会重重","立场对立","虐恋后he"]}', 1, datetime('now'), datetime('now')),
('st-r05', '暗中守护', 'relationship', '["xuanhuan","wuxia","xianxia"]', '{"core":"不求回报的默默守护","dynamic":"被守护者可能永远不知道","conflict_mode":"守护者独自承担"}', '{"tone":"默默无言","banter":"从不表露","serious":"关键时刻出现"}', '{"cooperation":"暗中帮助","sacrifice":"不求回报的付出","growth":"被守护者的成长就是回报"}', '{"patterns":["默默注视","关键时刻救场","可能是亲人/暗恋者"]}', 1, datetime('now'), datetime('now'));

-- Extended de-AI rules
INSERT OR IGNORE INTO de_ai_rules (id, category, pattern, replacement, severity, is_enabled, description, created_at) VALUES
('dar-021', 'vocabulary', '宛若', '像、如同、仿佛', 'medium', 1, 'AI高频词汇', datetime('now')),
('dar-022', 'vocabulary', '不禁', '忍不住、不由得', 'medium', 1, 'AI高频词汇', datetime('now')),
('dar-023', 'vocabulary', '竟然', '居然、竟', 'low', 1, '过度使用', datetime('now')),
('dar-024', 'vocabulary', '瞬间', '刹那间、一瞬、转眼', 'low', 1, '多样化替换', datetime('now')),
('dar-025', 'vocabulary', '缓缓', '慢慢、渐渐、徐徐', 'low', 1, '多样化替换', datetime('now')),
('dar-026', 'sentence', '他感到一阵……', '改为动作/神态描写', 'high', 1, '情绪直给 vs 暗示', datetime('now')),
('dar-027', 'sentence', '心中涌起一股……', '改为具体身体反应', 'high', 1, '情绪直给 vs 暗示', datetime('now')),
('dar-028', 'sentence', '语气中带着一丝……', '删除或改为动作', 'medium', 1, 'AI句式模板', datetime('now')),
('dar-029', 'rhetoric', '连续三个以上的比喻句', '精简为1-2个比喻', 'medium', 1, '过度修辞', datetime('now')),
('dar-030', 'rhetoric', '每段都以"……，"结尾的排比', '打破排比结构', 'medium', 1, '句式工整检测', datetime('now')),
('dar-031', 'adverb', '缓缓地、慢慢地、轻轻地', '用更具体的动作描写替代', 'low', 1, '过度使用副词', datetime('now')),
('dar-032', 'adverb', '深深地、紧紧地、狠狠地', '用更具体的动作描写替代', 'low', 1, '过度使用副词', datetime('now')),
('dar-033', 'idiom', '连续使用两个以上四字成语', '保留一个，其余展开描写', 'medium', 1, '成语堆砌', datetime('now')),
('dar-034', 'other', '最后，……/总之，……/就这样，……', '不同结尾方式', 'high', 1, '模板化结束语', datetime('now')),
('dar-035', 'other', '章节结尾：明天将会……', '不要预告式结尾', 'high', 1, 'AI预告式结尾', datetime('now'));

-- Style profiles (FIXED: columns match V001 style_profiles schema)
INSERT OR IGNORE INTO style_profiles (id, name, metrics, preferred_patterns, anti_ai_features, sample_paragraphs, banned_patterns, is_builtin, created_at, updated_at) VALUES
('style-01', '玄幻爽文', '{"dialogue_ratio":35,"description_density":"medium","pace":"fast","chapter_highlights":"3-5章一个小高潮"}', '{"sentence_length":"short-medium","paragraph_length":"medium","transitions":"直接推进"}', '{"avoid":["过度心理描写","冗长环境描写","慢节奏铺垫"]}', '["林凡二话不说，一剑劈了过去。","他眼中精光一闪，脚下真气涌动，整个人如离弦之箭般冲了出去。"]', '{"banned":["然而却","不仅而且","与此同时"]}', 1, datetime('now'), datetime('now')),
('style-02', '仙侠古风', '{"dialogue_ratio":25,"description_density":"high","pace":"moderate","chapter_highlights":"铺垫充分，意境为上"}', '{"sentence_length":"medium-long","paragraph_length":"long","transitions":"意境衔接"}', '{"avoid":["口语化表达","过于直白的情感","快节奏推进"]}', '["剑光如水，月华如练，他负手立于云海之巅。","山风拂过，带起几片落花，那道身影便这般消失在了云雾深处。"]', '{"banned":["简直","太牛了","卧槽"]}', 1, datetime('now'), datetime('now')),
('style-03', '都市利落', '{"dialogue_ratio":45,"description_density":"low","pace":"very_fast","chapter_highlights":"每章都有推进"}', '{"sentence_length":"short","paragraph_length":"short","transitions":"动作推进"}', '{"avoid":["冗长描写","内心独白过长","节奏拖沓"]}', '["行。我说完就挂了电话。","他站起身，推门出去，走廊里的灯光把他的影子拉得很长。"]', '{"banned":["不禁""宛如""深邃"]}', 1, datetime('now'), datetime('now')),
('style-04', '悬疑冷硬', '{"dialogue_ratio":30,"description_density":"high","pace":"gradual","chapter_highlights":"层层递进、逐步揭示"}', '{"sentence_length":"short","paragraph_length":"short-medium","transitions":"线索串联"}', '{"avoid":["情感外露","全知视角泄露","过早揭示真相"]}', '["他数到三，门后没有任何声音。","雨还在下，路灯下的影子比人多了一个。"]', '{"banned":["不禁""竟然""仿佛整个世界"]}', 1, datetime('now'), datetime('now')),
('style-05', '甜宠轻快', '{"dialogue_ratio":50,"description_density":"low","pace":"fast","chapter_highlights":"每章有甜蜜点"}', '{"sentence_length":"short-medium","paragraph_length":"short","transitions":"互动推进"}', '{"avoid":["过度虐心","长时间分离","沉重话题"]}', '["你怎么又来了！嘴上这么说，嘴角却忍不住上扬。","她低下头，耳尖红了一片。"]', '{"banned":["绝望""黑暗""深渊"]}', 1, datetime('now'), datetime('now')),
('style-06', '虐文细腻', '{"dialogue_ratio":30,"description_density":"high","pace":"slow-burn","chapter_highlights":"情感积累→爆发→余韵"}', '{"sentence_length":"medium-long","paragraph_length":"long","transitions":"情感递进"}', '{"avoid":["轻松搞笑","甜蜜过多","快节奏推进"]}', '["她等了一夜，雪落满了肩头。","他的手从她掌心滑落，像握不住的沙。"]', '{"banned":["哈哈""简直绝了""太棒了"]}', 1, datetime('now'), datetime('now')),
('style-07', '末世硬朗', '{"dialogue_ratio":35,"description_density":"medium","pace":"constant_tension","chapter_highlights":"危机感不断"}', '{"sentence_length":"short","paragraph_length":"short","transitions":"危机推进"}', '{"avoid":["抒情描写","温情感动","轻松时刻过长"]}', '["弹匣还有三发。外面至少有二十个。","天黑之前，他们必须找到下一个避难所。"]', '{"banned":["温馨""甜蜜""岁月静好"]}', 1, datetime('now'), datetime('now')),
('style-08', '电竞热血', '{"dialogue_ratio":40,"description_density":"low","pace":"fast","chapter_highlights":"训练→比赛→高潮循环"}', '{"sentence_length":"short-medium","paragraph_length":"short","transitions":"比赛节奏"}', '{"avoid":["冗长训练描写","过多日常","比赛节奏拖沓"]}', '["三杀！解说员的声音响起，全场沸腾。","他指尖在键盘上飞速跳动，屏幕上的角色完成了一套不可能的操作。"]', '{"banned":["认输""不可能""放弃"]}', 1, datetime('now'), datetime('now'));

-- Extended banned names (FIXED: columns match V001 banned_names schema)
INSERT OR IGNORE INTO banned_names (id, name, source_work, source_genre, ban_level, affected_genres, is_user_added, created_at) VALUES
('bn-021', '萧炎', '斗破苍穹', 'xuanhuan', 'hard_ban', '["xuanhuan"]', 0, datetime('now')),
('bn-022', '唐三', '斗罗大陆', 'xuanhuan', 'hard_ban', '["xuanhuan"]', 0, datetime('now')),
('bn-023', '韩立', '凡人修仙传', 'xianxia', 'hard_ban', '["xianxia"]', 0, datetime('now')),
('bn-024', '方平', '全球高武', 'xuanhuan', 'soft_warn', '["xuanhuan"]', 0, datetime('now')),
('bn-025', '罗峰', '吞噬星空', 'kehuan', 'hard_ban', '["kehuan"]', 0, datetime('now')),
('bn-026', '纪宁', '莽荒纪', 'xuanhuan', 'soft_warn', '["xuanhuan"]', 0, datetime('now')),
('bn-027', '秦羽', '星辰变', 'xuanhuan', 'soft_warn', '["xuanhuan"]', 0, datetime('now')),
('bn-028', '林雷', '盘龙', 'xuanhuan', 'soft_warn', '["xuanhuan"]', 0, datetime('now')),
('bn-029', '叶凡', '遮天', 'xuanhuan', 'hard_ban', '["xuanhuan"]', 0, datetime('now')),
('bn-030', '石昊', '完美世界', 'xuanhuan', 'hard_ban', '["xuanhuan"]', 0, datetime('now')),
('bn-031', '张小凡', '诛仙', 'xianxia', 'hard_ban', '["xianxia"]', 0, datetime('now')),
('bn-032', '白小纯', '一念永恒', 'xianxia', 'soft_warn', '["xianxia"]', 0, datetime('now')),
('bn-033', '孟浩', '我欲封天', 'xianxia', 'soft_warn', '["xianxia"]', 0, datetime('now')),
('bn-034', '苏铭', '求魔', 'xuanhuan', 'soft_warn', '["xuanhuan"]', 0, datetime('now')),
('bn-035', '王林', '仙逆', 'xianxia', 'hard_ban', '["xianxia"]', 0, datetime('now'));

-- Extended banned book titles (FIXED: columns match V001 banned_book_titles schema)
INSERT OR IGNORE INTO banned_book_titles (id, title, source_platform, source_genre, popularity, ban_level, is_user_added, created_at) VALUES
('bbt-026', '斗破苍穹', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-027', '武动乾坤', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-028', '大主宰', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-029', '斗罗大陆', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-030', '绝世唐门', 'qidian', 'xuanhuan', 'high', 'hard_ban', 0, datetime('now')),
('bbt-031', '凡人修仙传', 'qidian', 'xianxia', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-032', '仙逆', 'qidian', 'xianxia', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-033', '求魔', 'qidian', 'xuanhuan', 'high', 'soft_warn', 0, datetime('now')),
('bbt-034', '我欲封天', 'qidian', 'xianxia', 'high', 'soft_warn', 0, datetime('now')),
('bbt-035', '一念永恒', 'qidian', 'xianxia', 'high', 'soft_warn', 0, datetime('now')),
('bbt-036', '完美世界', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-037', '遮天', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-038', '圣墟', 'qidian', 'xuanhuan', 'high', 'soft_warn', 0, datetime('now')),
('bbt-039', '星辰变', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-040', '盘龙', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-041', '吞噬星空', 'qidian', 'kehuan', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-042', '莽荒纪', 'qidian', 'xuanhuan', 'high', 'soft_warn', 0, datetime('now')),
('bbt-043', '雪中悍刀行', 'qidian', 'wuxia', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-044', '剑来', 'qidian', 'wuxia', 'mega', 'hard_ban', 0, datetime('now')),
('bbt-045', '全球高武', 'qidian', 'xuanhuan', 'high', 'soft_warn', 0, datetime('now'));

INSERT INTO _migrations (version, name, applied_at) VALUES (6, 'extended_seed_data', datetime('now'));
`;
