// V005: Seed de-AI rules + banned names + banned book titles (mirrors Rust V005)
export const sql = `
-- De-AI rules
INSERT OR IGNORE INTO de_ai_rules (id, category, pattern, replacement, severity, is_enabled, description, created_at) VALUES
('dar-001', 'vocabulary', '宛如', '像/如/似', 'high', 1, 'AI高频比喻词', '2024-01-01T00:00:00Z'),
('dar-002', 'vocabulary', '不禁', '忍不住/不由得', 'high', 1, 'AI高频副词', '2024-01-01T00:00:00Z'),
('dar-003', 'vocabulary', '竟然', '居然/没想/谁知', 'medium', 1, 'AI过度使用转折词', '2024-01-01T00:00:00Z'),
('dar-004', 'vocabulary', '仿佛', '好像/似乎', 'medium', 1, 'AI高频比喻词', '2024-01-01T00:00:00Z'),
('dar-005', 'vocabulary', '刹那间', '瞬间/一瞬/霎时', 'medium', 1, 'AI高频时间词', '2024-01-01T00:00:00Z'),
('dar-006', 'vocabulary', '深邃', '深/幽深/深远', 'high', 1, 'AI高频形容词', '2024-01-01T00:00:00Z'),
('dar-007', 'vocabulary', '勾勒', '描/画/勾', 'medium', 1, 'AI高频动词', '2024-01-01T00:00:00Z'),
('dar-008', 'sentence', '然而.*却', '调整句式避免双转折', 'high', 1, 'AI典型句式:然而+却', '2024-01-01T00:00:00Z'),
('dar-009', 'sentence', '不仅.*而且', '拆分或改写', 'medium', 1, 'AI典型递进句式', '2024-01-01T00:00:00Z'),
('dar-010', 'sentence', '与此同时', '这时/那边/另一边', 'medium', 1, 'AI典型过渡词', '2024-01-01T00:00:00Z'),
('dar-011', 'rhetoric', '如.*般', '改用更自然的比喻', 'high', 1, 'AI典型比喻句式', '2024-01-01T00:00:00Z'),
('dar-012', 'rhetoric', '仿佛整个世界都', '删除或改写', 'high', 1, 'AI典型夸张句式', '2024-01-01T00:00:00Z'),
('dar-013', 'rhetoric', '一股.*涌上心头', '更具体的情感描写', 'high', 1, 'AI典型情感描写', '2024-01-01T00:00:00Z'),
('dar-014', 'vocabulary', '缓缓', '慢慢/渐渐/一点点', 'medium', 1, 'AI高频副词', '2024-01-01T00:00:00Z'),
('dar-015', 'vocabulary', '微微', '略/稍/轻轻', 'medium', 1, 'AI高频副词', '2024-01-01T00:00:00Z'),
('dar-016', 'sentence', '心中暗道', '心想/暗想/心里琢磨', 'low', 1, 'AI典型心理描写', '2024-01-01T00:00:00Z'),
('dar-017', 'vocabulary', '熠熠生辉', '闪/亮/发光', 'high', 1, 'AI高频成语', '2024-01-01T00:00:00Z'),
('dar-018', 'vocabulary', '令人窒息', '压得喘不过气/让人透不过气', 'high', 1, 'AI夸张表达', '2024-01-01T00:00:00Z'),
('dar-019', 'rhetoric', '如同.*一般', '改用更自然的表达', 'medium', 1, 'AI典型比喻', '2024-01-01T00:00:00Z'),
('dar-020', 'vocabulary', '颇具', '很有/颇有', 'low', 1, 'AI书面语偏好', '2024-01-01T00:00:00Z');

-- Banned character names
INSERT OR IGNORE INTO banned_names (id, name, source_work, source_genre, ban_level, affected_genres, is_user_added, created_at) VALUES
('bn-001', '萧炎', '斗破苍穹', 'xuanhuan', 'hard_ban', '["xuanhuan"]', 0, '2024-01-01T00:00:00Z'),
('bn-002', '林动', '武动乾坤', 'xuanhuan', 'hard_ban', '["xuanhuan"]', 0, '2024-01-01T00:00:00Z'),
('bn-003', '叶辰', '多个作品', 'xuanhuan', 'hard_ban', '["xuanhuan","dushi"]', 0, '2024-01-01T00:00:00Z'),
('bn-004', '韩立', '凡人修仙传', 'xianxia', 'hard_ban', '["xianxia"]', 0, '2024-01-01T00:00:00Z'),
('bn-005', '张小凡', '诛仙', 'xianxia', 'hard_ban', '["xianxia"]', 0, '2024-01-01T00:00:00Z'),
('bn-006', '令狐冲', '笑傲江湖', 'wuxia', 'hard_ban', '["wuxia"]', 0, '2024-01-01T00:00:00Z'),
('bn-007', '乔峰', '天龙八部', 'wuxia', 'hard_ban', '["wuxia"]', 0, '2024-01-01T00:00:00Z'),
('bn-008', '罗辑', '三体', 'kehuan', 'hard_ban', '["kehuan"]', 0, '2024-01-01T00:00:00Z'),
('bn-009', '叶修', '全职高手', 'youxi', 'hard_ban', '["youxi"]', 0, '2024-01-01T00:00:00Z'),
('bn-010', '何以琛', '何以笙箫默', 'yanqing', 'hard_ban', '["yanqing"]', 0, '2024-01-01T00:00:00Z'),
('bn-011', '顾漫', '多个作品', 'yanqing', 'soft_warn', '["yanqing"]', 0, '2024-01-01T00:00:00Z'),
('bn-012', '陈默', '多个作品', 'dushi', 'soft_warn', '["dushi"]', 0, '2024-01-01T00:00:00Z'),
('bn-013', '秦升', '多个作品', 'dushi', 'soft_warn', '["dushi"]', 0, '2024-01-01T00:00:00Z'),
('bn-014', '王安石', '历史人物', 'lishi', 'hard_ban', '["lishi"]', 0, '2024-01-01T00:00:00Z'),
('bn-015', '岳飞', '历史人物', 'lishi', 'hard_ban', '["lishi","junshi"]', 0, '2024-01-01T00:00:00Z'),
('bn-016', '苏沐橙', '全职高手', 'youxi', 'hard_ban', '["youxi"]', 0, '2024-01-01T00:00:00Z'),
('bn-017', '白浅', '三生三世', 'xianxia', 'hard_ban', '["xianxia"]', 0, '2024-01-01T00:00:00Z'),
('bn-018', '夜华', '三生三世', 'xianxia', 'hard_ban', '["xianxia"]', 0, '2024-01-01T00:00:00Z'),
('bn-019', '花小骨', '花小骨', 'xianxia', 'hard_ban', '["xianxia"]', 0, '2024-01-01T00:00:00Z'),
('bn-020', '张无忌', '倚天屠龙记', 'wuxia', 'hard_ban', '["wuxia"]', 0, '2024-01-01T00:00:00Z');

-- Banned book titles
INSERT OR IGNORE INTO banned_book_titles (id, title, source_platform, source_genre, popularity, ban_level, is_user_added, created_at) VALUES
('bbt-001', '斗破苍穹', 'qidian', 'xuanhuan', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-002', '凡人修仙传', 'qidian', 'xianxia', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-003', '诛仙', 'qidian', 'xianxia', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-004', '全职高手', 'qidian', 'youxi', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-005', '三体', 'publish', 'kehuan', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-006', '遮天', 'qidian', 'xuanhuan', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-007', '完美世界', 'qidian', 'xuanhuan', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-008', '武动乾坤', 'qidian', 'xuanhuan', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-009', '大主宰', 'qidian', 'xuanhuan', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-010', '笑傲江湖', 'publish', 'wuxia', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-011', '天龙八部', 'publish', 'wuxia', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-012', '倚天屠龙记', 'publish', 'wuxia', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-013', '何以笙箫默', 'publish', 'yanqing', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-014', '三生三世十里桃花', 'publish', 'xianxia', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-015', '花小骨', 'publish', 'xianxia', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-016', '盗墓笔记', 'publish', 'lingyi', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-017', '鬼吹灯', 'publish', 'lingyi', 'mega', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-018', '庆余年', 'qidian', 'lishi', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-019', '赘婿', 'qidian', 'lishi', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-020', '雪中悍刀行', 'qidian', 'wuxia', 'high', 'hard_ban', 0, '2024-01-01T00:00:00Z'),
('bbt-021', '一念永恒', 'qidian', 'xianxia', 'high', 'soft_warn', 0, '2024-01-01T00:00:00Z'),
('bbt-022', '仙逆', 'qidian', 'xianxia', 'high', 'soft_warn', 0, '2024-01-01T00:00:00Z'),
('bbt-023', '求魔', 'qidian', 'xuanhuan', 'normal', 'soft_warn', 0, '2024-01-01T00:00:00Z'),
('bbt-024', '我欲封天', 'qidian', 'xianxia', 'high', 'soft_warn', 0, '2024-01-01T00:00:00Z'),
('bbt-025', '择天记', 'qidian', 'xianxia', 'high', 'soft_warn', 0, '2024-01-01T00:00:00Z');

INSERT INTO _migrations (version, name, applied_at) VALUES (5, 'seed_deai_and_banned', datetime('now'));
`;
