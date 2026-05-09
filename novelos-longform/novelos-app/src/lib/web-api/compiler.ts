import { webDb } from "../web-db";
import { uuid, now, boolToInt, intToBool, nullIfUndefined, requireProjectId, WebNotSupportedError } from "./index";

import type {
  CompileResult,
  CompileIssue,
  CompileStats,
  ParagraphRewriteResult,
} from "../tauri";

/** Flexible CJK substring matching for canon rule checking. */
function cjkMatch(term: string, text: string): boolean {
  if (term.length < 2) return false;
  const cjkChars = [...term].filter(ch => /[\u4e00-\u9fff]/.test(ch)).join("");
  if (cjkChars.length < 2) return false;
  // Check all 2-char substrings of the CJK portion
  for (let i = 0; i < cjkChars.length - 1; i++) {
    if (text.includes(cjkChars.slice(i, i + 2))) return true;
  }
  return false;
}

export const compilerApi = {
  async compile(chapterNumber: number, draftText: string): Promise<CompileResult> {
    const issues: CompileIssue[] = [];

    const canonRules = webDb.all<{ rule_name: string; content: string; is_hard: number; scope_type: string }>(
      "SELECT rule_name, content, is_hard, scope_type FROM canon_rules WHERE status = 'active'"
    );
    const characters = webDb.all<{ name: string; role_type: string; soul_json: string }>(
      "SELECT name, role_type, soul_json FROM characters"
    );
    const foreshadows = webDb.all<{ id: string; title: string; status: string; seed_chapter: number | null }>(
      "SELECT id, title, status, seed_chapter FROM foreshadow_items"
    );
    const project = webDb.get<{ min_chapter_words: number; max_chapter_words: number }>(
      "SELECT min_chapter_words, max_chapter_words FROM projects LIMIT 1"
    );
    const minWords = project?.min_chapter_words ?? 2000;
    const maxWords = project?.max_chapter_words ?? 5000;

    // 1. CanonChecker
    for (const rule of canonRules) {
      if (!rule.content) continue;
      const prohibitions = rule.content.split(/[；;\n]/).filter(
        (s: string) => /不得|禁止|不允许|不能|不可|严禁/.test(s),
      );
      for (const proh of prohibitions) {
        const term = proh.split(/不得|禁止|不允许|不能|不可|严禁/).pop()?.trim() ?? "";
        if (term && cjkMatch(term, draftText)) {
          issues.push({
            checker: "CanonChecker",
            severity: rule.is_hard ? "error" : "warning",
            message: `违反正典规则: ${rule.rule_name}`,
            detail: `发现禁止内容: "${term}"`,
            location: null,
            paragraph_index: null,
          });
        }
      }
    }

    // 2. CharacterChecker
    for (const ch of characters) {
      if (draftText.includes(ch.name) && (!ch.soul_json || ch.soul_json === "{}")) {
        issues.push({
          checker: "CharacterChecker",
          severity: "warning",
          message: `角色"${ch.name}"缺少SOUL数据`,
          detail: "建议设置SOUL数据以启用口吻检查",
          location: ch.name,
          paragraph_index: null,
        });
      }
    }

    // 3. ForeshadowChecker
    for (const fs of foreshadows) {
      if ((fs.status === "planted" || fs.status === "pending") && fs.seed_chapter != null) {
        if (chapterNumber - fs.seed_chapter > 30) {
          issues.push({
            checker: "ForeshadowChecker",
            severity: "warning",
            message: `伏笔超期未回收: ${fs.title ?? "未命名"} (已埋设${chapterNumber - fs.seed_chapter}章)`,
            detail: "建议在近期章节中回收此伏笔，或评估是否可以废弃",
            location: null,
            paragraph_index: null,
          });
        }
      }
    }

    // 4. WordCountChecker
    const wordCount = [...draftText].length;
    if (wordCount < minWords) {
      issues.push({
        checker: "WordCountChecker",
        severity: "warning",
        message: `字数偏少: ${wordCount}字 (建议 ${minWords}-${maxWords}字)`,
        detail: "考虑增加环境描写、角色心理活动或对话来扩充内容",
        location: null,
        paragraph_index: null,
      });
    }
    if (wordCount > maxWords) {
      issues.push({
        checker: "WordCountChecker",
        severity: "info",
        message: `字数偏多: ${wordCount}字 (建议 ${minWords}-${maxWords}字)`,
        detail: "考虑拆分长章节或在修订时精简冗余描写",
        location: null,
        paragraph_index: null,
      });
    }

    // 5. ProseChecker
    const dialogueCount = (draftText.match(/["\u201c\u300c]/g) ?? []).length / 2;
    if (dialogueCount < 2 && wordCount > 1000) {
      issues.push({
        checker: "ProseChecker",
        severity: "info",
        message: "章节缺少对话",
        detail: "纯叙述章节可能读感沉闷，建议增加角色互动对话",
        location: null,
        paragraph_index: null,
      });
    }

    // 6. PowerChecker
    const powerKeywords = ["实力暴涨", "瞬间突破"];
    for (const kw of powerKeywords) {
      if (draftText.includes(kw)) {
        issues.push({
          checker: "PowerChecker",
          severity: "info",
          message: `潜在战力跳变: ${kw}`,
          detail: `发现关键词 "${kw}", 请确认战力逻辑是否合理`,
          location: null,
          paragraph_index: null,
        });
      }
    }

    // 7. VisibilityChecker
    const visKeywords = ["竟然知道", "明明是秘密"];
    for (const kw of visKeywords) {
      if (draftText.includes(kw)) {
        issues.push({
          checker: "VisibilityChecker",
          severity: "info",
          message: `潜在信息越权: ${kw}`,
          detail: `发现关键词 "${kw}", 请确认角色获取此信息的途径是否合理`,
          location: null,
          paragraph_index: null,
        });
      }
    }

    // Calculate result
    const errorCount = issues.filter(i => i.severity === "error").length;
    const warningCount = issues.filter(i => i.severity === "warning").length;
    const score = Math.max(0, 100 - errorCount * 20 - warningCount * 5);
    const status = errorCount > 0 ? "fail" : warningCount > 2 ? "warning" : "pass";

    const charactersReferenced = characters.filter(ch => draftText.includes(ch.name)).map(ch => ch.name);
    const hardRulesChecked = canonRules.filter(r => r.is_hard).length;
    const softRulesChecked = canonRules.filter(r => !r.is_hard).length;
    const hardRulesViolated = issues.filter(i => i.checker === "CanonChecker" && i.severity === "error").length;
    const softRulesViolated = issues.filter(i => i.checker === "CanonChecker" && i.severity === "warning").length;
    const paragraphs = draftText.split("\n\n").filter(p => p.trim());
    const dialogueMarkers = Math.floor((draftText.match(/["\u201c\u300c\u201d\u300d]/g) ?? []).length / 2);

    const stats: CompileStats = {
      word_count: wordCount,
      paragraph_count: paragraphs.length,
      dialogue_markers: dialogueMarkers,
      hard_rules_checked: hardRulesChecked,
      hard_rules_violated: hardRulesViolated,
      soft_rules_checked: softRulesChecked,
      soft_rules_violated: softRulesViolated,
      characters_referenced: charactersReferenced,
      characters_missing_soul: charactersReferenced.filter(name =>
        characters.find(ch => ch.name === name && (!ch.soul_json || ch.soul_json === "{}")),
      ),
      foreshadow_items_checked: foreshadows.length,
      foreshadow_items_overdue: issues.filter(i => i.checker === "ForeshadowChecker").length,
    };

    const suggestions: string[] = [];
    if (hardRulesViolated > 0) suggestions.push(`修复 ${hardRulesViolated} 条硬规则违规后重新提交`);
    if (wordCount < minWords) suggestions.push("增加内容使字数达到建议范围");
    if (suggestions.length === 0 && score >= 80) suggestions.push("章节质量良好，可以进入审阅流程");

    return { status, score, issues, stats, suggestions };
  },

  async rewriteParagraph(_chapterNumber: number, _paragraphIndex: number, _requirements: string): Promise<ParagraphRewriteResult> {
    throw new WebNotSupportedError("rewriteParagraph (requires AI agent)");
  },
};
