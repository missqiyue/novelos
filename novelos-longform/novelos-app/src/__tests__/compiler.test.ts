import { describe, it, expect } from "vitest";
import type { CompileIssue } from "../lib/tauri";

function runWebCompiler(
  draftText: string,
  canonRules: { rule_name: string; content: string; is_hard: number }[],
  characters: { name: string; soul_json: string }[],
  foreshadows: { title: string; status: string; seed_chapter: number | null }[],
  chapterNumber: number,
  minWords: number,
  maxWords: number,
): { issues: CompileIssue[]; score: number; status: string } {
  const issues: CompileIssue[] = [];

  for (const rule of canonRules) {
    if (!rule.content) continue;
    const prohibitions = rule.content.split(/[；;\n]/).filter(
      (s: string) => /不得|禁止|不允许|不能|不可|严禁/.test(s),
    );
    for (const proh of prohibitions) {
      const term = proh.split(/不得|禁止|不允许|不能|不可|严禁/).pop()?.trim() ?? "";
      if (term && term.length >= 2) {
        // Extract 2-char CJK substrings for flexible matching
        const cjkChars = [...term].filter(ch => /[\u4e00-\u9fff]/.test(ch)).join('');
        const matched = cjkChars.length >= 2 && [...cjkChars].slice(0, -1).some((_, i) => draftText.includes(cjkChars.slice(i, i + 2)));
        if (matched) {
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
  }

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

  for (const fs of foreshadows) {
    if ((fs.status === "planted" || fs.status === "pending") && fs.seed_chapter != null) {
      if (chapterNumber - fs.seed_chapter > 30) {
        issues.push({
          checker: "ForeshadowChecker",
          severity: "warning",
          message: `伏笔超期未回收: ${fs.title}`,
          detail: "建议在近期章节中回收此伏笔",
          location: null,
          paragraph_index: null,
        });
      }
    }
  }

  const wordCount = [...draftText].length;
  if (wordCount < minWords) {
    issues.push({
      checker: "WordCountChecker",
      severity: "warning",
      message: `字数偏少: ${wordCount}字`,
      detail: `建议 ${minWords}-${maxWords}字`,
      location: null,
      paragraph_index: null,
    });
  }

  const dialogueCount = (draftText.match(/["\u201c\u300c]/g) ?? []).length / 2;
  if (dialogueCount < 2 && wordCount > 1000) {
    issues.push({
      checker: "ProseChecker",
      severity: "info",
      message: "章节缺少对话",
      detail: "纯叙述章节可能读感沉闷",
      location: null,
      paragraph_index: null,
    });
  }

  const errorCount = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const score = Math.max(0, 100 - errorCount * 20 - warningCount * 5);
  const status = errorCount > 0 ? "fail" : warningCount > 2 ? "warning" : "pass";

  return { issues, score, status };
}

function longText(base: string, minChars = 2500): string {
  const padding = "这是一段填充文本用于避免字数不足警告。".repeat(Math.ceil(minChars / 20));
  return base + padding;
}

describe("Web Compiler", () => {
  it("passes clean text with no rules and sufficient length", () => {
    const result = runWebCompiler(
      longText("角色张三走在路上，一切正常。"),
      [],
      [{ name: "张三", soul_json: '{"tone":"沉稳"}' }],
      [],
      1, 2000, 5000,
    );
    expect(result.status).toBe("pass");
    expect(result.score).toBe(100);
  });

  it("detects hard canon rule violation as error", () => {
    const result = runWebCompiler(
      longText("他使用了禁术来击败对手。"),
      [{ rule_name: "禁止禁术", content: "角色不得使用禁术", is_hard: 1 }],
      [], [], 1, 2000, 5000,
    );
    expect(result.issues.some(i => i.checker === "CanonChecker")).toBe(true);
    expect(result.status).toBe("fail");
  });

  it("detects soft canon rule as warning not error", () => {
    const result = runWebCompiler(
      longText("他使用了禁术获胜。"),
      [{ rule_name: "避免禁术", content: "角色不得使用禁术", is_hard: 0 }],
      [], [], 1, 2000, 5000,
    );
    const canonIssues = result.issues.filter(i => i.checker === "CanonChecker");
    expect(canonIssues.length).toBeGreaterThan(0);
    expect(canonIssues.every(i => i.severity === "warning")).toBe(true);
  });

  it("detects missing SOUL data for referenced character", () => {
    const result = runWebCompiler(
      longText("李四走向远方。"),
      [],
      [{ name: "李四", soul_json: "{}" }],
      [], 1, 2000, 5000,
    );
    expect(result.issues.some(i => i.checker === "CharacterChecker")).toBe(true);
  });

  it("does not flag character with SOUL data", () => {
    const result = runWebCompiler(
      longText("王五走向远方。"),
      [],
      [{ name: "王五", soul_json: '{"tone":"冷酷"}' }],
      [], 1, 2000, 5000,
    );
    expect(result.issues.some(i => i.checker === "CharacterChecker")).toBe(false);
  });

  it("detects overdue foreshadow", () => {
    const result = runWebCompiler(
      longText("故事继续发展。"),
      [], [],
      [{ title: "神秘信件", status: "planted", seed_chapter: 1 }],
      50, 2000, 5000,
    );
    expect(result.issues.some(i => i.checker === "ForeshadowChecker")).toBe(true);
  });

  it("does not flag recent foreshadow", () => {
    const result = runWebCompiler(
      longText("故事继续发展。"),
      [], [],
      [{ title: "新伏笔", status: "planted", seed_chapter: 45 }],
      50, 2000, 5000,
    );
    expect(result.issues.some(i => i.checker === "ForeshadowChecker")).toBe(false);
  });

  it("detects underword count", () => {
    const result = runWebCompiler("短文本", [], [], [], 1, 2000, 5000);
    expect(result.issues.some(i => i.checker === "WordCountChecker")).toBe(true);
  });

  it("score: 1 hard error = 100 - 20 = 80", () => {
    const result = runWebCompiler(
      longText("他使用了禁术。"),
      [{ rule_name: "禁术", content: "角色不得使用禁术", is_hard: 1 }],
      [], [], 1, 2000, 5000,
    );
    expect(result.score).toBe(80);
  });

  it("score: 2 warnings = 100 - 10 = 90", () => {
    const result = runWebCompiler(
      longText("李四和张三一起走着。"),
      [], [
        { name: "李四", soul_json: "{}" },
        { name: "张三", soul_json: "{}" },
      ], [], 1, 2000, 5000,
    );
    expect(result.score).toBe(90);
  });
});
