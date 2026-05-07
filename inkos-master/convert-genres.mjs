import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";

const SOURCE_DIR = "/Volumes/MOVE/AI/work/writing/自动化/webnovel-writer-master/webnovel-writer/templates/genres";
const TARGET_DIR = "/Volumes/MOVE/AI/work/writing/自动化/inkos-master/packages/core/genres";

const mapping = {
  "修仙": "xiuxian",
  "克苏鲁": "cthulhu",
  "历史古代": "history",
  "历史脑洞": "history-brainhole",
  "古言": "ancient-romance",
  "多子多福": "many-children",
  "女频悬疑": "female-suspense",
  "宫斗宅斗": "palace-intrigue",
  "年代": "period-drama",
  "幻想言情": "fantasy-romance",
  "悬疑灵异": "suspense-supernatural",
  "悬疑脑洞": "suspense-brainhole",
  "抗战谍战": "spy-war",
  "无限流": "infinite-flow",
  "替身文": "substitute-romance",
  "末世": "post-apocalyptic",
  "民国言情": "republican-romance",
  "游戏体育": "sports-gaming",
  "狗血言情": "melodramatic-romance",
  "现实题材": "realistic",
  "现言脑洞": "modern-romance-brainhole",
  "电竞": "esports",
  "直播文": "streaming",
  "知乎短篇": "zhihu-short",
  "种田": "farming",
  "科幻": "scifi-cn",
  "系统流": "system",
  "职场婚恋": "workplace-marriage",
  "西幻": "western-fantasy",
  "规则怪谈": "rule-horror",
  "豪门总裁": "ceo-romance",
  "都市异能": "urban-superpower",
  "都市日常": "urban-slice-of-life",
  "都市脑洞": "urban-brainhole",
  "青春甜宠": "youth-sweet",
  "高武": "high-martial-arts",
  "黑暗题材": "dark-fantasy"
};

async function main() {
  const files = await readdir(SOURCE_DIR);
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    
    const sourcePath = join(SOURCE_DIR, file);
    const content = await readFile(sourcePath, "utf-8");
    
    const originalName = basename(file, ".md");
    let name = originalName;
    const id = mapping[originalName] || "unknown";
    
    // Extract English name if available
    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      const titleLine = titleMatch[1];
      const enMatch = titleLine.match(/\(([^)]+)\)/);
      if (enMatch) {
        name = `${name} (${enMatch[1]})`;
      }
    }

    const yaml = `---
name: ${name}
id: ${id}
language: zh
chapterTypes: ["日常", "冲突", "高潮", "转折", "收尾", "铺垫"]
fatigueWords: ["不由得", "顿时", "只觉得", "惊呼", "倒吸一口凉气", "深吸一口气", "瞳孔微缩"]
numericalSystem: false
powerScaling: false
eraResearch: false
pacingRule: "每章必须有一个小冲突或情感波动，每三章一个小高潮，避免连续平铺直叙。"
satisfactionTypes: ["反转打脸", "获得关键线索", "化解危机", "情感升温", "获得新能力/道具"]
auditDimensions: [1,2,3,4,5,6,7,8,9,10,13,14,15,16,17,18,19,24,25,26]
---

`;

    const targetPath = join(TARGET_DIR, `${id}.md`);
    await writeFile(targetPath, yaml + content, "utf-8");
    console.log(`Converted: ${originalName} -> ${id}.md`);
  }
}

main().catch(console.error);
