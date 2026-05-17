import { webDb } from "../web-db";

/** Trigger a browser file download. */
function downloadBlob(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  ProjectInfo,
  CreateProjectInput,
  ImportResult,
  SeedResult,
} from "../tauri";

export const projectApi = {
  async create(input: CreateProjectInput): Promise<ProjectInfo> {
    await webDb.initGlobal();
    const id = uuid();
    const ts = now();

    webDb.run(
      `INSERT INTO projects (id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'planning', ?, ?)`,
      [id, input.title, nullIfUndefined(input.genre_id), nullIfUndefined(input.logline),
       nullIfUndefined(input.target_words), nullIfUndefined(input.target_volumes),
       input.min_chapter_words ?? 2000, Math.max(input.max_chapter_words ?? 5000, input.min_chapter_words ?? 2000), ts, ts],
    );

    const maxOrder = webDb.get<{ c: number }>("SELECT COALESCE(MAX(display_order), 0) as c FROM bookshelf", [], "global");
    webDb.run(
      `INSERT INTO bookshelf (id, project_id, title, status, display_order, created_at) VALUES (?, ?, ?, 'planning', ?, ?)`,
      [uuid(), id, input.title, (maxOrder?.c ?? 0) + 1, ts],
      "global",
    );

    await webDb.openProject(id);
    return webDb.get<ProjectInfo>(
      "SELECT id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at FROM projects WHERE id = ?",
      [id],
    )!;
  },

  async get(): Promise<ProjectInfo> {
    return webDb.get<ProjectInfo>(
      "SELECT id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at FROM projects LIMIT 1",
    )!;
  },

  async switch(projectId: string): Promise<ProjectInfo> {
    await webDb.initGlobal();
    webDb.run("UPDATE bookshelf SET last_opened_at = ? WHERE project_id = ?", [now(), projectId], "global");
    await webDb.openProject(projectId);
    return webDb.get<ProjectInfo>(
      "SELECT id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at FROM projects LIMIT 1",
    )!;
  },

  async close(): Promise<void> {
    await webDb.closeProject();
  },

  async update(title?: string, status?: string): Promise<void> {
    const ts = now();
    const projectId = requireProjectId();
    if (title !== undefined) {
      webDb.run("UPDATE projects SET title = ?, updated_at = ?", [title, ts]);
      webDb.run("UPDATE bookshelf SET title = ? WHERE project_id = ?", [title, projectId], "global");
    }
    if (status !== undefined) {
      webDb.run("UPDATE projects SET status = ?, updated_at = ?", [status, ts]);
      webDb.run("UPDATE bookshelf SET status = ? WHERE project_id = ?", [status, projectId], "global");
    }
  },

  async delete(projectId: string): Promise<void> {
    webDb.run("DELETE FROM bookshelf WHERE project_id = ?", [projectId], "global");
    await webDb.deleteProject(projectId);
  },

  async exportTxt(_projectId: string): Promise<string> {
    // Web implementation: read all chapters from DB, concatenate as plain text
    const project = await webDb.get<ProjectInfo>(
      "SELECT title FROM projects LIMIT 1"
    );
    const title = project?.title ?? "Untitled";

    const chapters = webDb.all<{ chapter_number: number; title: string; final_text: string | null; draft_text: string | null }>(
      "SELECT chapter_number, title, final_text, draft_text FROM chapters WHERE status != 'archived' ORDER BY chapter_number"
    );

    let output = title + "\n\n";
    for (const ch of chapters) {
      const text = ch.final_text ?? ch.draft_text ?? "";
      output += `第${ch.chapter_number}章 ${ch.title}\n\n${text}\n\n`;
    }

    // Trigger browser download
    downloadBlob(output, `${title}.txt`, "text/plain;charset=utf-8");
    return output;
  },
  async exportMd(_projectId: string): Promise<string> {
    // Web implementation: read all chapters, format as Markdown
    const project = await webDb.get<ProjectInfo>(
      "SELECT title FROM projects LIMIT 1"
    );
    const title = project?.title ?? "Untitled";

    const chapters = webDb.all<{ chapter_number: number; title: string; final_text: string | null; draft_text: string | null }>(
      "SELECT chapter_number, title, final_text, draft_text FROM chapters WHERE status != 'archived' ORDER BY chapter_number"
    );

    let output = `# ${title}\n\n`;
    for (const ch of chapters) {
      const text = ch.final_text ?? ch.draft_text ?? "";
      output += `## 第${ch.chapter_number}章 ${ch.title}\n\n${text}\n\n`;
    }

    downloadBlob(output, `${title}.md`, "text/markdown;charset=utf-8");
    return output;
  },
  async exportDocx(_projectId: string): Promise<string> {
    throw new WebNotSupportedError("exportDocx");
  },
  async exportEpub(_projectId: string): Promise<string> {
    throw new WebNotSupportedError("exportEpub");
  },
  async exportPdf(_projectId: string): Promise<string> {
    throw new WebNotSupportedError("exportPdf");
  },
  async importTxt(_filePath: string): Promise<ImportResult> {
    throw new WebNotSupportedError("importTxt");
  },
  async createSample(): Promise<SeedResult> {
    await webDb.initGlobal();
    const projectId = uuid();
    const ts = now();

    // Add to bookshelf (global DB) first
    const maxOrder = webDb.get<{ c: number }>("SELECT COALESCE(MAX(display_order), 0) as c FROM bookshelf", [], "global");
    webDb.run(
      `INSERT INTO bookshelf (id, project_id, title, genre_name, status, display_order, created_at) VALUES (?, ?, ?, '仙侠', 'active', ?, ?)`,
      [uuid(), projectId, '星辰仙途', (maxOrder?.c ?? 0) + 1, ts],
      "global",
    );

    // Open project DB (creates new DB + runs migrations)
    await webDb.openProject(projectId);

    // Now project DB is open, insert project record
    webDb.run(
      `INSERT INTO projects (id, title, genre_id, logline, target_words, target_volumes, min_chapter_words, max_chapter_words, status, created_at, updated_at)
       VALUES (?, ?, 'xianxia', ?, 2000000, 8, 2000, 5000, 'active', ?, ?)`,
      [projectId, '星辰仙途', '少年林凡偶得上古星辰传承，从此踏上逆天修仙之路。在宗门斗争、秘境探险、上古秘辛中一步步成长，最终揭开星辰之力的终极奥秘。', ts, ts],
    );

    // Volumes
    const volumes: [number, string, number, number, string, string, string, string][] = [
      [1, "星火初燃", 1, 12, "凡人林凡觉醒星辰之力，踏上修仙之路", "宗门试炼中遭遇暗算，被迫越级挑战", "生死之间星辰之力彻底觉醒，跨境界击败强敌", "声名鹊起，但也引来了更大的觊觎"],
      [2, "宗门风云", 13, 28, "在青云宗站稳脚跟，建立自己的势力班底", "宗门内部派系斗争，外门长老图谋星辰传承", "宗门大比中力压群雄，揭露长老阴谋", "获得进入秘境资格，成为宗门核心弟子"],
      [3, "秘境惊变", 29, 44, "探索上古秘境，揭开星辰之力来源", "秘境中的上古禁制、同门背叛、异族遭遇", "找到星辰传承完整功法，击败秘境守护者", "得知上古大劫预言，肩负起应劫使命"],
      [4, "乱世崛起", 45, 60, "大劫征兆显现，林凡整合各方势力", "各方势力明争暗斗、上古魔修复苏", "联合各方势力建立抗魔联盟", "修为突破至大乘期，为最终之战做准备"],
      [5, "星辰之战", 61, 72, "与上古魔修的终极对决", "魔修大军压境、联盟内部出现叛徒", "星辰之力完全觉醒，以自身为阵眼封印魔祖", "封印成功但林凡陷入沉睡"],
      [6, "破而后立", 73, 82, "沉睡百年后的世界——林凡苏醒在一个陌生的世界", "旧日同伴离散、新的威胁浮现、星辰之力变化", "重新掌握变异的星辰之力，找到昔日的同伴", "揭示星辰之力在沉睡期间发生的根本变化"],
      [7, "因果溯源", 83, 94, "追溯星辰之力的真正源头——来自另一个宇宙的馈赠", "跨宇宙势力的介入、星辰本源意志的考验", "通过本源考验，获得宇宙意志的认可", "明白真正的敌人来自宇宙之外的虚空"],
      [8, "永恒星辰", 95, 105, "最终之战：保卫这片宇宙免受虚空侵蚀", "虚空大军入侵、宇宙壁垒破碎、众神陨落", "以星辰本源为核心重塑宇宙壁垒", "成为新一代星辰掌控者，守护宇宙安宁"],
    ];
    for (const [num, title, startCh, endCh, goal, conflict, climax, settlement] of volumes) {
      webDb.run(
        `INSERT INTO volumes (id, project_id, volume_number, title, chapter_start, chapter_end, goal, main_conflict, climax, settlement, status) VALUES (?,?,?,?,?,?,?,?,?,?,'active')`,
        [uuid(), projectId, num, title, startCh, endCh, goal, conflict, climax, settlement],
      );
    }

    // Characters
    const characters: [string, string, string, string, string, string][] = [
      ["林凡", "protagonist", "星辰传承者、青云宗核心弟子", "正直坚韧、重情重义、杀伐果断", "守护所爱之人、揭开星辰之力的全部奥秘", "热血少年"],
      ["苏婉清", "supporting", "天璇圣女转世、青云宗长老弟子", "清冷睿智、外冷内热、隐忍深情", "找回前世记忆、守护林凡周全", "冷面军师"],
      ["铁无双", "supporting", "铸器世家传人、林凡挚友", "豪爽直率、义薄云天、粗中有细", "重振铸器世家、打造传世神兵", "忠义兄弟"],
      ["莫问天", "antagonist", "上古魔修、万年前被封印的绝世强者", "阴狠狡诈、志在复仇、不择手段", "解除封印、颠覆修仙界、复仇星辰传承者", "暗影操控"],
      ["灵曦", "supporting", "星辰精灵、星辰之力的守护灵", "灵动可爱、忠诚守护、偶尔毒舌", "帮助林凡完全觉醒星辰之力", "精灵伙伴"],
      ["虚空使徒", "antagonist", "虚空势力渗透者、终极反派", "冷酷无情、视万物为蝼蚁、高维存在", "吞噬这片宇宙、将一切归于虚空", "终极敌人"],
    ];
    for (const [name, roleType, identityCore, personaCore, coreMotivation, templateName] of characters) {
      const soulJson = JSON.stringify({
        matched_template: templateName,
        customization: {
          personality: { core: personaCore.split("、")[0], growth: "", flaw: "" },
          speech: { tone: "", pattern: "", catchphrase: "" },
          behavior: { decision: "", fight_style: "", stress_response: "" },
        },
      });
      webDb.run(
        `INSERT INTO characters (id, project_id, name, role_type, identity_core, persona_core, soul_json, core_motivation, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?, 'active', ?, ?)`,
        [uuid(), projectId, name, roleType, identityCore, personaCore, soulJson, coreMotivation, ts, ts],
      );
    }

    // Sample chapters (first 3)
    const sampleChapters: [number, string, string][] = [
      [1, "星辰陨落", "夜色如墨，星辰漫天。\n\n青石镇外的荒山上，一个瘦弱的少年正仰望着夜空。他叫林凡，是镇上猎户林老三的儿子。与同龄人不同，他从不畏惧黑暗——因为每次仰望星空，他都觉得那些星辰在向他低语。\n\n今夜，星辰格外明亮。\n\n一颗流星划破天际，拖曳着璀璨的尾焰，直直地朝他坠落。林凡来不及躲避，那道星光便已没入他的掌心。\n\n灼热。\n\n剧痛之中，他感到有什么东西在体内苏醒，仿佛沉睡了千万年的力量正在缓缓睁开眼睛。掌心处，一枚星形纹路若隐若现，散发着幽蓝色的微光。\n\n这一夜，少年的命运被彻底改写。"],
      [2, "宗门试炼", "青云宗，九州大陆四大宗门之一。\n\n林凡站在山门前，仰望着那入云的青石阶梯，心中既紧张又期待。掌心的星纹在他情绪波动时会微微发热，像是在回应他的心绪。\n\n试炼很简单——攀登天梯，抵达山门。\n\n可这看似简单的要求，每年却淘汰了九成以上的试炼者。天梯共九千九百九十九级，每一级都设有灵压禁制，越往上，压力越大。\n\n林凡深吸一口气，迈出了第一步。"],
      [3, "暗流涌动", "入宗三日后，林凡才真正体会到什么叫'树大招风'。\n\n星辰传承的消息不知如何泄露，外门已有数位长老对他'格外关注'。负责新弟子的周长老看似和蔼，但每次目光扫过林凡的掌心，那贪婪便几乎掩饰不住。\n\n\"小子，你的星纹……可否让老夫一观？\"\n\n林凡下意识地握紧了拳头。"],
    ];
    for (const [chNum, title, draft] of sampleChapters) {
      const chId = uuid();
      webDb.run(
        `INSERT INTO chapters (id, project_id, chapter_number, title, status, draft_text, word_count, created_at, updated_at) VALUES (?,?,?,?, 'draft', ?, ?, ?, ?)`,
        [chId, projectId, chNum, title, draft, draft.length, ts, ts],
      );
      webDb.run(
        `INSERT INTO chapter_versions (id, chapter_id, version_no, content_type, content, created_by, created_at) VALUES (?, ?, 1, 'draft', ?, 'seed', ?)`,
        [uuid(), chId, draft, ts],
      );
    }

    // Canon rules
    const rules: [string, string, string, string, boolean][] = [
      ["power_system", "力量体系", "硬规则", "星辰之力共九层：星辉引、星芒出、星核成、星河现、星域开、星界临、星辰变、星辰灭、星辰永恒。每层对应修仙境界的一个大阶段。星辰之力不可被其他力量体系兼容。", true],
      ["character_power", "角色战力", "硬规则", "主角林凡不得在同一卷内连续跨两个大境界突破。每次大境界突破必须有合理的契机和代价。", true],
      ["world_rule", "世界观基准", "硬规则", "故事发生在九州大陆，星辰界是九州大陆的上界。凡人界→修仙界→星辰界→虚空之外，四层宇宙架构。不得随意添加新的层级。", true],
      ["dialogue_style", "对话风格", "软规则", "古代背景角色不使用现代网络用语。各角色保持其SOUL档案设定的说话风格。林凡坚定有力、苏婉清清冷睿智、铁无双豪爽直率。", false],
      ["chapter_structure", "章节结构", "软规则", "每章结尾必须有钩子（悬念/期待/反转），章字数控制在2000-5000字之间。第一章为引入章可以稍短。", false],
    ];
    for (const [key, name, rtype, content, isHard] of rules) {
      webDb.run(
        `INSERT INTO canon_rules (id, project_id, rule_key, rule_name, rule_type, scope_type, content, is_hard, status, version, created_at, updated_at) VALUES (?,?,?,?,?,'global',?,?, 'active', 1, ?, ?)`,
        [uuid(), projectId, key, name, rtype, content, boolToInt(isHard), ts, ts],
      );
    }

    // Foreshadow items
    const foreshadows: [number, string, string, string, number][] = [
      [1, "掌心的星芒", "林凡是星辰传承第三万六千代传人", "planted", 8],
      [3, "莫问天的苏醒", "三万年前被封印的魔修正将苏醒", "planted", 5],
      [2, "苏婉清的身份", "天璇圣女转世，前世的记忆碎片散落在各大秘境中", "planted", 6],
      [1, "虚空之外的注视", "虚空势力在暗中观察星辰传承者", "planted", 7],
      [2, "铁无双的锻造天赋", "铁无双实际上拥有上古炼器师的隐性传承", "planted", 4],
    ];
    for (const [seedCh, title, condition, status, importance] of foreshadows) {
      webDb.run(
        `INSERT INTO foreshadow_items (id, project_id, seed_chapter, title, maturity_condition, status, importance, notes) VALUES (?,?,?,?,?,?,?,'')`,
        [uuid(), projectId, seedCh, title, condition, status, importance],
      );
    }

    // Book outline
    const outlineJson = JSON.stringify({
      title: "星辰仙途",
      genre: "仙侠",
      main_theme: "守护与牺牲——真正的强者不是征服一切，而是守护所爱",
      world_framework: "四层宇宙架构：凡人界→修仙界→星辰界→虚空之外",
      power_system: "星辰之力九层体系，每层对应修仙大境界",
      main_characters: ["林凡(主角)", "苏婉清(引路人)", "铁无双(兄弟)", "莫问天(反派)", "灵曦(伙伴)", "虚空使徒(终极敌人)"],
    });
    webDb.run(
      `INSERT INTO book_outlines (id, project_id, version, content_json, status, created_at, updated_at) VALUES (?,?,1,?,'active',?,?)`,
      [uuid(), projectId, outlineJson, ts, ts],
    );

    await webDb.flush();

    return {
      project_id: projectId,
      title: '星辰仙途',
      volumes_created: 8,
      characters_created: 6,
      chapters_created: 3,
      canon_rules_created: 5,
      foreshadows_created: 5,
    };
  },
};
