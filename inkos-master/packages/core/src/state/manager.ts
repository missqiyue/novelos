import { readFile, writeFile, mkdir, readdir, rm, stat, unlink, open } from "node:fs/promises";
import { join } from "node:path";
import type { BookConfig } from "../models/book.js";
import type { ChapterMeta } from "../models/chapter.js";
import { bootstrapStructuredStateFromMarkdown, resolveDurableStoryProgress } from "./state-bootstrap.js";

export class StateManager {
  /** Books actively being written by this process — used for same-process stale lock detection. */
  private readonly activeWrites = new Set<string>();

  constructor(private readonly projectRoot: string) {}

  private static defaultAuthorIntent(language: "zh" | "en"): string {
    return language === "zh"
      ? "# 作者意图\n\n（在这里描述这本书的长期创作方向。）\n"
      : "# Author Intent\n\n(Describe the long-horizon vision for this book here.)\n";
  }

  private static defaultCurrentFocus(language: "zh" | "en"): string {
    return language === "zh"
      ? "# 当前聚焦\n\n## 当前重点\n\n（描述接下来 1-3 章最需要优先推进的内容。）\n"
      : "# Current Focus\n\n## Active Focus\n\n(Describe what the next 1-3 chapters should prioritize.)\n";
  }

  private static defaultCharacterVoiceBible(language: "zh" | "en"): string {
    return language === "zh"
      ? `# 人物口吻与行为圣经（通用模板｜保证全书不偏离）

> 用途：把“人物性格/说话风格/做事风格”写成可查询规则，避免长篇写到中后期**口吻漂移、人设崩塌、行为不合逻辑**。  
> 更新频率：建议**每3章**按“偏离审计”更新一次（只更新事实与状态，不写长篇解释）。

---

## 0) 全局规则（写死）
1) **每个主角/主反派必须有“三钉”**：核心信念 / 核心恐惧 / 绝对底线（触发就会失控或反噬）。  
2) **每个角色必须有“三件套”**：  
   - 说话风格（句长/词域/称呼/口头禅/禁用词）  
   - 做事风格（决策模型/风险偏好/冲突策略/收尾习惯）  
   - 压力反应（被逼到墙角时会怎么做、怎么说）  
3) **不允许“万能口吻”**：同一章里不能所有人都像作者在讲课；每个角色要有可识别的节奏与用词。  
4) **不允许“万能聪明/万能冲动”**：聪明/冲动必须以“具体行为”呈现（比如先对账/先侦察/先立规矩/先挡枪）。

---

## 1) 人物卡字段（复制后逐人填写）

### 1.1 身份与功能位
- 姓名：________  
- 别名/称谓：________  
- 身份/职业：________  
- 阵营/立场：________  
- 剧情功能位：主角/男主/女主/队友/反派/灰度/信息枢纽/情绪枢纽/背锅位……

### 1.2 性格“三钉”（全书不许互换）
- 核心信念（他坚信什么）：________  
- 核心恐惧（他最怕什么）：________  
- 绝对底线（踩到就翻脸/自毁/暴走）：________

### 1.3 说话风格（可识别）
- 句长：短句为主/长句为主/短长交替（说明：________）  
- 词域：官腔/江湖/军口/商口/学术/礼法/黑话……（固定3类以内）  
- 语气：冷/讥/直/软/判词/哄人/逼供……（固定2类以内）  
- 称呼体系：对不同人怎么叫（例如：职务/名字/昵称/敬称）  
- 口头禅（≤2条）：________ / ________  
- 禁用词/禁用句式（≥3条）：________ / ________ / ________  
- 常用句式库（5条，写成“模板句”）：  
  1) ________  
  2) ________  
  3) ________  
  4) ________  
  5) ________

### 1.4 做事风格（可预测）
- 决策模型：先证据后动作 / 先救人后算账 / 先立规矩后动手 / 先谈判再开战……  
- 风险偏好：保守/均衡/激进（说明：________）  
- 冲突策略：正面硬刚/迂回布局/规则压制/舆论战/买凶/釜底抽薪……（固定2类以内）  
- 收尾习惯：做完事后必做的“收口动作”（封存/备份/留后手/清场/安抚/立据）  
- 奖惩观：对自己/对同伴/对敌人分别怎么奖惩（写成短句）

### 1.5 压力反应（人设稳定器）
- 被逼到墙角时：他会更冷/更话多/更暴力/更沉默？  
- 说话会出现的“破绽”：例如语速变快/称呼变化/漏出真心一句话  
- 行为会出现的“破绽”：例如手抖/摸刀/先找退路/先推开某人

### 1.6 关系与阶段（与关系图谱同步）
- 关键关系对（最多3条）：________ / ________ / ________  
- 当前阶段@章节区间：________  
- 下一阶段“触发条件”（必须可验证）：________

### 1.7 偏离红线（写作时用来报警）
> 写到这里就说明你“写偏了”，必须当章修回去。
- 红线1：________  
- 红线2：________  
- 红线3：________

---

## 2) 每章“人设不偏离”速检（写完30秒打勾）
> 建议放进项目的 \`写作校验Skill/README.md\` 里一起执行。
- [ ] 本章出场前3位角色的**称呼体系**是否一致（职务/敬称/昵称没乱）  
- [ ] 本章至少1句对白能看出“谁在说话”（口吻可识别）  
- [ ] 本章关键选择符合人物“做事风格”（不是作者强行推动）  
- [ ] 若人物反常，是否给了“触发条件/压力原因”（且落在动作与后果）  
- [ ] 本章是否触碰任何角色“偏离红线”（如触碰，是否当章修回）
`
      : `# Character Voice & Behavior Bible

> Purpose: Formalize character traits/voice/behavior into queryable rules to prevent character drift and logic inconsistencies in long-form writing.
> Update frequency: Every 3 chapters during drift audit.

---

## 0) Global Rules
1) **Three Pillars per Character**: Core Belief / Core Fear / Absolute Bottom Line.
2) **Three Sets per Character**:
   - Voice (Sentence length/vocabulary/address/catchphrases/forbidden words)
   - Behavior (Decision model/risk preference/conflict strategy/wrap-up habits)
   - Pressure Response (What they do/say when cornered)
3) **No "Universal Voice"**: Different characters must have distinct rhythms and vocabulary.
4) **No "Universal Smart/Impulsive"**: Intelligence or impulsiveness must be shown through specific actions.

(Please fill in character templates based on the above principles.)
`;
  }

  private static defaultStoryChainLedger(language: "zh" | "en"): string {
    return language === "zh"
      ? `# 故事链管理台账（通用｜200万字+必备）

> 目的：解决“写长必散”的核心问题：用**故事链（Story Chain）**把主线、敌人、硬点、情感、伏笔全部ID化，确保每3章都能验收推进。  
> 配套：每3章填写 \`写作校验Skill/3章回溯审计表.md\`，并在本台账更新“状态/位置/下一触发”。

---

## 0) 链条总规则（写死）

### 0.1 链条优先级（核心规则）

#### 核心链（每3章必须推进至少1条）
1. **主线目标链（Goal Chain）**：方向盘，不可丢
2. **敌人链（Enemy Chain）**：外压来源，不可丢
3. **硬点链（Hard-Point Chain）**：读者验收点，不可丢

#### 辅助链（每6章推进至少1条即可）
4. **情感链（Emotion Chain）**：服务于主线，不抢主线
5. **伏笔链（Foreshadow Chain）**：长期埋线，不急于回收

#### 推进规则（防跑偏）
- **连续3批只推进情感链** = 主线漂移风险 → 必须在下批推进核心链
- **连续3批只推进伏笔链** = 节奏拖沓风险 → 必须在下批推进核心链
- **情感链推进时** = 必须绑定主线/敌人链/硬点链之一

### 0.2 节点验收规则
1) 每3章至少推进一个链条节点（五链任选其一，但不要连续三批只推进同一条）。  
2) 每个节点必须"可验收"：  
   - 互证闭环：写清**证据形态+去向+备份**  
   - 权力/版图链：写清**资格/门槛/授予方/代价**  
   - 情感链：写清**阶段变化+当章代价**  
3) 伏笔新增与回收节制：每3章新增≤1、回收≤1、未回收≤5（超了就爆）。

---

## 1) 主线目标链（Goal Chain）
> 定义：主角“要什么”以及“下一道门槛是什么”。这是全书方向盘。

| GC-ID | 目标节点（可验收） | 达成条件（可验证步骤） | 首次提出章 | 计划达成（章/卷） | 代价（不可逆） | 状态 |
|---|---|---|---:|---|---|---|
| GC-001 | ________ | ________ |  |  |  | 未达成 |

---

## 2) 敌人链（Enemy Chain）
> 定义：反派不是一个人，是**链条**（执行者→中层→保护伞→规则层→终局层）。

| EC-ID | 敌人节点 | 层级（A/B/C/D） | 主要手段（信息/规则/人情） | 首次露头章 | 计划钉死（章/卷） | 钉死方式（硬点） | 状态 |
|---|---|---|---|---:|---|---|---|
| EC-001 | ________ | A | ________ |  |  | ________ | 未钉死 |

---

## 3) 硬点链（Hard-Point Chain）
> 定义：读者能“验收”的结果（不一定是文书，战绩/资源/名望/盟约/筹码/条款都算）。

| HC-ID | 硬点（结果） | 形态（战绩/资源/名声/盟约/证据/条款） | 取得方式（动作链） | 存放/见证/备份 | 首次出现章 | 状态 |
|---|---|---|---|---|---:|---|
| HC-001 | ________ | ________ | ________ | ________ |  | 已落袋/在路上 |

---

## 4) 情感链（Emotion/Relationship Chain）
> 定义：关系阶段不是“甜不甜”，而是“选择与代价”。多主角/多CP也必须ID化。

| RC-ID | 关系对 | 当前阶段@章区间 | 下一阶段触发条件（可验证） | 下一阶段代价（当章落地） | 状态 |
|---|---|---|---|---|---|
| RC-001 | ________↔________ | ________ | ________ | ________ | 进行中 |

---

## 5) 伏笔链（Foreshadow Chain）
> 定义：所有坑都必须在台账里有去向（本书回收/续作改钩）。

| FB-ID | 类型 | 表层呈现 | 真实指向 | 触发条件 | 计划回扣（章/卷） | 证据载体 | 状态 | 去向 |
|---|---|---|---|---|---|---|---|---|
| FB-___ | 线索/暗线/钩子 | ________ | ________ | ________ | ________ | ________ | 未回收 | 本书 |
`
      : `# Story Chain Management Ledger

> Purpose: Track Goal Chains, Enemy Chains, Hard-Points, Emotion Chains, and Foreshadow Chains to ensure consistent pacing and prevent story divergence.

---

## 0) Chain Rules
1. **Core Chains**: Goal, Enemy, Hard-Point (advance at least 1 every 3 chapters).
2. **Auxiliary Chains**: Emotion, Foreshadow (advance at least 1 every 6 chapters).

(Please maintain the tracking tables below based on the above principles.)
`;
  }

  async ensureControlDocuments(bookId: string, authorIntent?: string): Promise<void> {
    const language = await this.resolveControlDocumentLanguage(bookId);
    await this.ensureControlDocumentsAt(this.bookDir(bookId), language, authorIntent);
  }

  async ensureControlDocumentsAt(
    bookDir: string,
    language: "zh" | "en",
    authorIntent?: string,
  ): Promise<void> {
    const storyDir = join(bookDir, "story");
    const runtimeDir = join(storyDir, "runtime");
    const outlineDir = join(storyDir, "outline");
    const rolesMajorDir = join(storyDir, "roles", "主要角色");
    const rolesMinorDir = join(storyDir, "roles", "次要角色");

    await mkdir(storyDir, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await mkdir(outlineDir, { recursive: true });
    await mkdir(rolesMajorDir, { recursive: true });
    await mkdir(rolesMinorDir, { recursive: true });

    await this.writeIfMissing(
      join(storyDir, "author_intent.md"),
      authorIntent?.trim()
        ? authorIntent.trimEnd() + "\n"
        : StateManager.defaultAuthorIntent(language),
    );

    await this.writeIfMissing(
      join(storyDir, "current_focus.md"),
      StateManager.defaultCurrentFocus(language),
    );

    await this.writeIfMissing(
      join(storyDir, "人物口吻与行为圣经.md"),
      StateManager.defaultCharacterVoiceBible(language),
    );

    await this.writeIfMissing(
      join(storyDir, "故事链管理台账.md"),
      StateManager.defaultStoryChainLedger(language),
    );
  }

  async loadControlDocuments(bookId: string): Promise<{
    authorIntent: string;
    currentFocus: string;
    runtimeDir: string;
  }> {
    await this.ensureControlDocuments(bookId);

    const storyDir = join(this.bookDir(bookId), "story");
    const runtimeDir = join(storyDir, "runtime");
    const [authorIntent, currentFocus] = await Promise.all([
      readFile(join(storyDir, "author_intent.md"), "utf-8"),
      readFile(join(storyDir, "current_focus.md"), "utf-8"),
    ]);

    return { authorIntent, currentFocus, runtimeDir };
  }

  private async resolveControlDocumentLanguage(bookId: string): Promise<"zh" | "en"> {
    try {
      const raw = await readFile(join(this.bookDir(bookId), "book.json"), "utf-8");
      const parsed = JSON.parse(raw) as { language?: unknown };
      return parsed.language === "zh" ? "zh" : "en";
    } catch {
      return "en";
    }
  }

  async acquireBookLock(bookId: string): Promise<() => Promise<void>> {
    await mkdir(this.bookDir(bookId), { recursive: true });
    const lockPath = join(this.bookDir(bookId), ".write.lock");
    try {
      const handle = await open(lockPath, "wx");
      try {
        await handle.writeFile(`pid:${process.pid} ts:${Date.now()}`, "utf-8");
      } catch (error) {
        await handle.close().catch(() => undefined);
        await unlink(lockPath).catch(() => undefined);
        throw error;
      }
      await handle.close();
    } catch (e) {
      const code = (e as NodeJS.ErrnoException | undefined)?.code;
      if (code === "EEXIST") {
        const lockData = await readFile(lockPath, "utf-8").catch(() => "pid:unknown ts:unknown");
        const lockPid = this.extractLockPid(lockData);
        const isStale =
          (lockPid !== undefined && !this.isProcessAlive(lockPid)) ||
          (lockPid === process.pid && !this.activeWrites.has(bookId));
        if (isStale) {
          await unlink(lockPath).catch(() => undefined);
          return this.acquireBookLock(bookId);
        }
        throw new Error(
          `Book "${bookId}" is locked by another process (${lockData}). ` +
            `If this is stale, delete ${lockPath}`,
        );
      }
      throw e;
    }
    this.activeWrites.add(bookId);
    return async () => {
      this.activeWrites.delete(bookId);
      try {
        await unlink(lockPath);
      } catch {
        // ignore
      }
    };
  }

  private extractLockPid(lockData: string): number | undefined {
    const match = lockData.match(/pid:(\d+)/);
    if (!match) return undefined;
    const pid = Number.parseInt(match[1] ?? "", 10);
    return Number.isInteger(pid) && pid > 0 ? pid : undefined;
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ESRCH") {
        return false;
      }
      return true;
    }
  }

  get booksDir(): string {
    return join(this.projectRoot, "books");
  }

  bookDir(bookId: string): string {
    return join(this.booksDir, bookId);
  }

  stateDir(bookId: string): string {
    return join(this.bookDir(bookId), "story", "state");
  }

  async loadProjectConfig(): Promise<Record<string, unknown>> {
    const configPath = join(this.projectRoot, "inkos.json");
    const raw = await readFile(configPath, "utf-8");
    return JSON.parse(raw);
  }

  async saveProjectConfig(config: Record<string, unknown>): Promise<void> {
    const configPath = join(this.projectRoot, "inkos.json");
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  async loadBookConfig(bookId: string): Promise<BookConfig> {
    const configPath = join(this.bookDir(bookId), "book.json");
    const raw = await readFile(configPath, "utf-8");
    if (!raw.trim()) {
      throw new Error(`book.json is empty for book "${bookId}"`);
    }
    return JSON.parse(raw) as BookConfig;
  }

  async saveBookConfig(bookId: string, config: BookConfig): Promise<void> {
    await this.saveBookConfigAt(this.bookDir(bookId), config);
  }

  async saveBookConfigAt(bookDir: string, config: BookConfig): Promise<void> {
    await mkdir(bookDir, { recursive: true });
    await writeFile(
      join(bookDir, "book.json"),
      JSON.stringify(config, null, 2),
      "utf-8",
    );
  }

  async ensureRuntimeState(bookId: string, fallbackChapter = 0): Promise<void> {
    await bootstrapStructuredStateFromMarkdown({
      bookDir: this.bookDir(bookId),
      fallbackChapter,
    });
  }

  async listBooks(): Promise<ReadonlyArray<string>> {
    try {
      const entries = await readdir(this.booksDir);
      const bookIds: string[] = [];
      for (const entry of entries) {
        const bookJsonPath = join(this.booksDir, entry, "book.json");
        try {
          await stat(bookJsonPath);
          bookIds.push(entry);
        } catch {
          // not a book directory
        }
      }
      return bookIds;
    } catch {
      return [];
    }
  }

  async getNextChapterNumber(bookId: string): Promise<number> {
    const durableChapter = await resolveDurableStoryProgress({
      bookDir: this.bookDir(bookId),
    });
    // Ensure structured state is bootstrapped (side-effect: creates missing
    // JSON files), but do NOT trust its chapter number for progress — only
    // the contiguous durable artifact chain is authoritative.
    await bootstrapStructuredStateFromMarkdown({
      bookDir: this.bookDir(bookId),
      fallbackChapter: durableChapter,
    });
    return durableChapter + 1;
  }

  async getPersistedChapterCount(bookId: string): Promise<number> {
    const chaptersDir = join(this.bookDir(bookId), "chapters");
    const chapterNumbers = new Set<number>();

    try {
      const files = await readdir(chaptersDir);
      for (const file of files) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (!match) continue;
        chapterNumbers.add(parseInt(match[1]!, 10));
      }
    } catch {
      return 0;
    }

    return chapterNumbers.size;
  }

  async loadChapterIndex(bookId: string): Promise<ReadonlyArray<ChapterMeta>> {
    const indexPath = join(this.bookDir(bookId), "chapters", "index.json");
    try {
      const raw = await readFile(indexPath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async saveChapterIndex(
    bookId: string,
    index: ReadonlyArray<ChapterMeta>,
  ): Promise<void> {
    await this.saveChapterIndexAt(this.bookDir(bookId), index);
  }

  async saveChapterIndexAt(
    bookDir: string,
    index: ReadonlyArray<ChapterMeta>,
  ): Promise<void> {
    const chaptersDir = join(bookDir, "chapters");
    await mkdir(chaptersDir, { recursive: true });
    await writeFile(
      join(chaptersDir, "index.json"),
      JSON.stringify(index, null, 2),
      "utf-8",
    );
  }

  async snapshotState(bookId: string, chapterNumber: number): Promise<void> {
    await this.snapshotStateAt(this.bookDir(bookId), chapterNumber);
  }

  async snapshotStateAt(bookDir: string, chapterNumber: number): Promise<void> {
    const storyDir = join(bookDir, "story");
    const snapshotDir = join(storyDir, "snapshots", String(chapterNumber));
    await mkdir(snapshotDir, { recursive: true });

    const files = [
      "current_state.md", "particle_ledger.md", "pending_hooks.md",
      "chapter_summaries.md", "subplot_board.md", "emotional_arcs.md", "character_matrix.md",
    ];
    await Promise.all(
      files.map(async (f) => {
        try {
          const content = await readFile(join(storyDir, f), "utf-8");
          await writeFile(join(snapshotDir, f), content, "utf-8");
        } catch {
          // file doesn't exist yet
        }
      }),
    );

    const stateDir = join(bookDir, "story", "state");
    const snapshotStateDir = join(snapshotDir, "state");
    try {
      const stateFiles = await readdir(stateDir);
      if (stateFiles.length > 0) {
        await mkdir(snapshotStateDir, { recursive: true });
        await Promise.all(
          stateFiles.map(async (fileName) => {
            const content = await readFile(join(stateDir, fileName), "utf-8");
            await writeFile(join(snapshotStateDir, fileName), content, "utf-8");
          }),
        );
      }
    } catch {
      // state directory missing — skip
    }
  }

  async isCompleteBookDirectory(bookDir: string): Promise<boolean> {
    const requiredPaths = [
      join(bookDir, "book.json"),
      join(bookDir, "story", "story_bible.md"),
      join(bookDir, "story", "volume_outline.md"),
      join(bookDir, "story", "book_rules.md"),
      join(bookDir, "story", "current_state.md"),
      join(bookDir, "story", "pending_hooks.md"),
      join(bookDir, "chapters", "index.json"),
    ];

    for (const requiredPath of requiredPaths) {
      try {
        await stat(requiredPath);
      } catch {
        return false;
      }
    }

    return true;
  }

  async restoreState(bookId: string, chapterNumber: number): Promise<boolean> {
    const storyDir = join(this.bookDir(bookId), "story");
    const snapshotDir = join(storyDir, "snapshots", String(chapterNumber));

    const files = [
      "current_state.md", "particle_ledger.md", "pending_hooks.md",
      "chapter_summaries.md", "subplot_board.md", "emotional_arcs.md", "character_matrix.md",
    ];
    try {
      // current_state.md and pending_hooks.md are required;
      // particle_ledger.md is optional (numericalSystem=false genres don't have it)
      // the rest are optional (may not exist in older snapshots)
      const requiredFiles = ["current_state.md", "pending_hooks.md"];
      const optionalFiles = files.filter((f) => !requiredFiles.includes(f));

      await Promise.all(
        requiredFiles.map(async (f) => {
          const content = await readFile(join(snapshotDir, f), "utf-8");
          await writeFile(join(storyDir, f), content, "utf-8");
        }),
      );

      await Promise.all(
        optionalFiles.map(async (f) => {
          const targetPath = join(storyDir, f);
          try {
            const content = await readFile(join(snapshotDir, f), "utf-8");
            await writeFile(targetPath, content, "utf-8");
          } catch {
            await rm(targetPath, { force: true });
          }
        }),
      );

      const stateDir = this.stateDir(bookId);
      let restoredStructuredState = false;
      try {
        const snapshotStateDir = join(snapshotDir, "state");
        const stateFiles = await readdir(snapshotStateDir);
        if (stateFiles.length > 0) {
          restoredStructuredState = true;
          await mkdir(stateDir, { recursive: true });
          await Promise.all(
            stateFiles.map(async (fileName) => {
              const content = await readFile(join(snapshotStateDir, fileName), "utf-8");
              await writeFile(join(stateDir, fileName), content, "utf-8");
            }),
          );
        }
      } catch {
        // snapshot structured state missing — skip
      }
      if (!restoredStructuredState) {
        await rm(stateDir, { recursive: true, force: true });
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Roll back state to the snapshot at `targetChapter`, removing all chapters
   * after it and their associated files (chapter markdown, snapshots, runtime).
   * Used by review reject to undo a bad chapter and everything that followed.
   *
   * Returns the list of chapter numbers that were discarded.
   */
  async rollbackToChapter(
    bookId: string,
    targetChapter: number,
  ): Promise<ReadonlyArray<number>> {
    const restored = await this.restoreState(bookId, targetChapter);
    if (!restored) {
      throw new Error(`Cannot restore snapshot for chapter ${targetChapter} in "${bookId}"`);
    }

    const bookDir = this.bookDir(bookId);
    const chaptersDir = join(bookDir, "chapters");
    const index = await this.loadChapterIndex(bookId);

    const kept: ChapterMeta[] = [];
    const discarded: number[] = [];

    for (const entry of index) {
      if (entry.number <= targetChapter) {
        kept.push(entry);
      } else {
        discarded.push(entry.number);
      }
    }

    // Delete chapter markdown files for discarded chapters
    try {
      const files = await readdir(chaptersDir);
      for (const file of files) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (!match) continue;
        const num = parseInt(match[1]!, 10);
        if (num > targetChapter) {
          await unlink(join(chaptersDir, file)).catch(() => {});
        }
      }
    } catch {
      // chapters directory missing
    }

    // Delete snapshots for discarded chapters
    const snapshotsDir = join(bookDir, "story", "snapshots");
    try {
      const snapshots = await readdir(snapshotsDir);
      for (const snap of snapshots) {
        const num = parseInt(snap, 10);
        if (Number.isFinite(num) && num > targetChapter) {
          await rm(join(snapshotsDir, snap), { recursive: true, force: true });
        }
      }
    } catch {
      // snapshots directory missing
    }

    // Delete runtime artifacts for discarded chapters
    const runtimeDir = join(bookDir, "story", "runtime");
    try {
      const runtimeFiles = await readdir(runtimeDir);
      for (const file of runtimeFiles) {
        const match = file.match(/^chapter-(\d+)\./);
        if (!match) continue;
        const num = parseInt(match[1]!, 10);
        if (num > targetChapter) {
          await unlink(join(runtimeDir, file)).catch(() => {});
        }
      }
    } catch {
      // runtime directory missing
    }

    // Also check story/drafts/ for discarded chapter files
    const draftsDir = join(bookDir, "story", "drafts");
    try {
      const draftFiles = await readdir(draftsDir);
      for (const file of draftFiles) {
        const match = file.match(/^(\d+)_.*\.md$/);
        if (!match) continue;
        const num = parseInt(match[1]!, 10);
        if (num > targetChapter) {
          await unlink(join(draftsDir, file)).catch(() => {});
        }
      }
    } catch {
      // drafts directory missing
    }

    // Drop any persisted sqlite acceleration index so discarded chapters
    // cannot leak back into retrieval after the markdown/state rollback.
    await Promise.all([
      rm(join(bookDir, "story", "memory.db"), { force: true }),
      rm(join(bookDir, "story", "memory.db-shm"), { force: true }),
      rm(join(bookDir, "story", "memory.db-wal"), { force: true }),
    ]);

    await this.saveChapterIndex(bookId, kept);
    return discarded;
  }

  private async writeIfMissing(path: string, content: string): Promise<void> {
    try {
      await stat(path);
    } catch {
      await writeFile(path, content, "utf-8");
    }
  }
}
