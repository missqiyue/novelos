---
title: PlanningContext(N) 闭环设计（MVP→完整）
scope: inkos-desktop
status: draft
---

# 1. 目标与边界

本文定义 `PlanningContext(N)`：在写第 N 章时，系统用于“规划锚定 + 事实基准 + 线程推进 + 写后反哺”的最小上下文集合，并给出：

- 最小可用字段集合（MVP）
- 对应 SQL / commands 清单（基于现有表结构与命令）
- 写章 prompt 的组织方式（强约束 / 软约束）
- 渐进增强路线（从“能闭环”到“闭环强”）

不涉及代码改动，仅为后续衔接实现提供可执行的接口与数据流定义。

# 2. PlanningContext(N)（字段集合）

## 2.1 最小可用字段（MVP）

MVP 的目标是：蓝图（one-liner / checkpoint）在写章时形成硬约束，写后能自动生成对齐提案（outline_patch），并确保伏笔闭环。

### A. 书籍基础信息（BookIdentity）

- `book.title`
- `book.genre`
- `book.logline`

用途：稳定题材与卖点、用于风格提示与审查对齐。

### B. 本章规划锚点（ChapterPlan）

- `chapter_number`（N）
- `plan.one_liner`
- `plan.tags[]`
- `plan.cast_refs[]`
- `plan.thread_refs[]`
- `plan.locked`（boolean）

用途：本章事件推进的硬锚点。locked=true 时不允许偏离主事件。

### C. 最近事实基准（CheckpointBaseline）

- `checkpoint.start_chapter`
- `checkpoint.end_chapter`（必须覆盖到 N-1）
- `checkpoint.checkpoint_json`（结构由系统定义，可先不严格校验）

用途：事实基准与“禁止推翻”的约束来源；同时作为长上下文压缩器。

### D. 近期剧情回顾（RecentContext）

- `recent_context`（建议用“最近3章摘要/大纲”，可拼成纯文本）

用途：动作链衔接，减少断裂与重复推进。

### E. 未回收伏笔（OpenHooks）

- `open_hooks[]`（Top 10）
  - `id`
  - `hook_desc`
  - `created_at_chapter`
  - `staleness`

用途：强制要求本章至少推进/回收 1 条伏笔，形成结构闭环压力。

## 2.2 增强字段（阶段、线程、人设、状态）

当 MVP 稳定后，逐步补齐以下字段，可显著提升“长篇一致性”与“规划可控性”：

### F. 阶段规划（StagePlanForN）

- `stage.stage_id`
- `stage.range.start_chapter`
- `stage.range.end_chapter`
- `stage.stage_goal / main_conflict / turning_point / climax / settlement`
- `stage.threads[]`（若 stage_plan 内保存）
- `stage.cast_focus[]`
- `stage.system_usage`

用途：把 one-liner 的“点”升级为“阶段段落目标”，避免 5000 章长篇的漂移。

### G. 线程执行面（ThreadFocus）

- `threads.referenced[]`：本章 thread_refs 对应的线程详情（title/goal/stakes/status/milestones）
- `threads.active[]`：todo/doing 的 Top N（用于引导“推进哪条线”）

用途：让“本章推进什么任务”有结构化抓手，且可写后反哺。

### H. 人物不变内核（CastCore）

- `cast.cores[]`：name/role_type/soul_core_json（由 cast_refs 过滤）

用途：稳定人设、减少同名不同字、减少 OOC。

### I. 人物/世界状态（Temporal/SOUL）

- `cast.soul_timeline[]`（按 N 查有效区间；或取最近一条）
- `temporal_states[]`（按 N 查有效区间；或取关键 state_key）

用途：把“事实基准”细化到人物弧光与道具归属等可检查项。

# 3. SQL 清单（基于现有表）

说明：以下 SQL 运行在“当前活动书库”的 sqlite（book_conn）上。

## 3.1 BookIdentity

```sql
SELECT title, genre, logline
FROM book_meta
WHERE id = 1;
```

## 3.2 ChapterPlan（one-liner）

```sql
SELECT one_liner, tags_json, cast_refs_json, thread_refs_json, locked
FROM chapter_outline_one_liners_current
WHERE chapter_number = ?1;
```

## 3.3 CheckpointBaseline

推荐优先按 version_id 过滤；如果系统尚未定义 active version，则先允许 version_id 为 NULL 或不传。

```sql
SELECT checkpoint_json, start_chapter, end_chapter, created_at
FROM outline_checkpoints
WHERE end_chapter <= (?1 - 1)
  AND (version_id = ?2 OR ?2 IS NULL)
ORDER BY end_chapter DESC, created_at DESC, id DESC
LIMIT 1;
```

## 3.4 RecentContext（最近3章）

```sql
SELECT chapter_number, title, outline
FROM chapters
WHERE chapter_number < ?1
ORDER BY chapter_number DESC
LIMIT 3;
```

## 3.5 OpenHooks（Top 10）

```sql
SELECT id, hook_desc, created_at_chapter, staleness
FROM pending_hooks
WHERE is_resolved = 0
ORDER BY staleness DESC, created_at_chapter ASC, id ASC
LIMIT 10;
```

## 3.6 ThreadFocus（按 thread_refs）

thread_refs_json 需要先在业务层 parse 为数组，再拼接 IN。

```sql
SELECT thread_key, type, title, goal, stakes, status, owner_characters_json, start_chapter, end_chapter, milestones_json, notes, updated_at
FROM story_threads
WHERE thread_key IN (..thread_keys..);
```

## 3.7 ThreadFocus（活跃线程）

```sql
SELECT thread_key, type, title, goal, stakes, status, updated_at
FROM story_threads
WHERE status IN ('todo', 'doing')
ORDER BY updated_at DESC, id DESC
LIMIT 12;
```

## 3.8 CastCore（按 cast_refs）

cast_refs_json 同样需要先 parse 为数组，再拼接 IN。

```sql
SELECT name, role_type, soul_core_json, notes, updated_at
FROM characters_core
WHERE name IN (..cast_names..);
```

## 3.9 SOUL timeline（按 N 查有效）

```sql
SELECT character_name, valid_from_chapter, valid_to_chapter, soul_state_json, reason_span, source, confidence, created_at
FROM character_soul_timeline
WHERE character_name IN (..cast_names..)
  AND valid_from_chapter <= ?1
  AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?1)
ORDER BY character_name ASC, valid_from_chapter DESC, id DESC;
```

## 3.10 Temporal states（按 N 查有效）

（当前表为 temporal_states，字段为有效区间；取 Top N 或关键 state_key。）

```sql
SELECT entity_id, entity_type, state_key, state_value, valid_from_chapter, valid_to_chapter
FROM temporal_states
WHERE valid_from_chapter <= ?1
  AND (valid_to_chapter IS NULL OR valid_to_chapter >= ?1)
ORDER BY entity_type ASC, entity_id ASC, state_key ASC, valid_from_chapter DESC;
```

# 4. Commands 清单（建议接口形态）

## 4.1 建议新增（聚合读取）

### get_planning_context

- 入参：
  - `chapterNumber: i32`
  - `versionId?: i32`（可选）
- 出参（建议 JSON）：
  - `book`
  - `plan`
  - `checkpoint?`
  - `recent_context`
  - `open_hooks`
  - `threads`（referenced + active，可选）
  - `cast`（cores + soul_timeline，可选）
  - `temporal_states`（可选）

> 价值：写章、评审、提案都用同一份上下文，减少不一致与重复拼接。

## 4.2 可复用的既有命令（闭环链路）

- 写章正文生成：`generate_chapter_pipeline(chapter_number, chapter_title, outline)`
- 伏笔处理：`process_chapter_hooks(chapter_number, outline, content)`
- 结构化评审：`run_structured_review(chapter_number, outline, chapter_text, force_refresh?)`
- 写后反哺提案：
  - `ai_propose_outline_patch_from_chapter(chapter_number)`
  - `ai_propose_threads_from_chapter(chapter_number)`
  - `ai_propose_soul_timeline_from_chapter(chapter_number)`
- 大纲与锁定（人工编辑）：
  - `get_outline_rows(start_chapter, end_chapter)`
  - `save_outline_patches(patches[])`
  - `set_outline_locked_range(start_chapter, end_chapter, locked)`
- 提案收件箱（通用 proposals + world_facts_proposals）：
  - `get_proposals(status?, limit?)`
  - `accept_proposal(id)` / `reject_proposal(id)`
  - `get_world_fact_proposals(status?, limit?)`
  - `accept_world_fact_proposal(id, accept_as?)` / `reject_world_fact_proposal(id)`
- 线程/人物状态的人工维护（与提案 apply 目标一致）：
  - `get_story_threads(status?, limit?)` / `upsert_story_thread(thread)` / `delete_story_thread(id)`
  - `get_soul_timeline(name?, chapter?, limit?)` / `upsert_character_soul_timeline(item)` / `delete_character_soul_timeline(id)`
  - `get_character_relations(chapter?, limit?)` / `upsert_character_relation(rel)` / `delete_character_relation(id)`
  - `get_temporal_states(chapter?, limit?)` / `update_temporal_state(...)` / `delete_temporal_state(id)`

## 4.3 建议新增（接受提案并落库）

当前已有 `proposals` 表，但“接受/拒绝”后如何落库需要命令补齐（否则闭环停在 Inbox）：

- `apply_outline_patch(patches[], source_chapter?)` → 更新 `chapter_outline_one_liners_current`（受 locked 保护）
- `apply_thread_upsert(payload)` → 写入/更新 `story_threads`
- `apply_soul_timeline_upsert(payload)` → 写入 `character_soul_timeline`
- `recompute_checkpoint(range, versionId)` → 写入/更新 `outline_checkpoints`

# 5. 写章 prompt 组织方式（强约束 / 软约束）

## 5.1 组织原则

- 约束必须“可验证”：最好能由后续审查/提案工具直接判断是否满足
- 强约束要短、明确、优先级高；软约束提供“优化方向”
- 数据尽量结构化（JSON/YAML），减少模型误读；大段文字只放摘要

## 5.2 强约束（Hard Constraints）

建议放在 system prompt 最前，条目化：

1) 规划锚定（one_liner）
   - `locked=true`：不得改变主事件与结果；允许扩充执行细节与场景
   - `locked=false`：允许微调，但必须保留“事件推进句”的本质（事件+变化/结果）
2) Checkpoint 事实基准
   - checkpoint 中的事实不能被推翻；如要产生变化，必须通过“本章行动/信息导致变化”体现因果
3) 线程推进
   - 若 `thread_refs` 非空：必须推进其中至少 1 条（行动/信息兑现），且在正文能定位
4) 伏笔闭环
   - 必须从 open_hooks 中推进或回收至少 1 条（行动/信息兑现），禁止一句话带过
5) 命名与一致性
   - 人名/专名必须与 cast_core 一致；禁止同音不同字/外号漂移

## 5.3 软约束（Soft Constraints）

建议放在 hard constraints 后：

- cast_refs 角色优先出场、对话口吻与动机优先贴合 soul_core
- tags 作为风格/节奏提示（爽点/悬念/反转/升级等）
- recent_context 用于动作链衔接，避免重复冲突或突然转场
- anti_ai_rules 作为语言与叙述限制

## 5.4 推荐的 prompt 骨架（可直接用于拼接）

```text
[HARD_CONSTRAINTS]
- one_liner_lock: {locked}
- must_follow_one_liner: ...
- checkpoint_facts_must_hold: ...
- must_advance_thread_refs: ...
- must_close_open_hooks: ...
- naming_consistency: ...

[PLAN_FOR_CHAPTER_N] (JSON)
{ "chapter_number": N, "one_liner": "...", "tags": [...], "cast_refs": [...], "thread_refs": [...], "locked": true/false }

[CHECKPOINT_BASELINE] (JSON)
{ "range": {"start":..,"end":..}, "checkpoint": {...} }

[OPEN_HOOKS_TOP10]
- id:.. stale:.. desc:..

[THREADS]
referenced: [...]
active: [...]

[CAST_CORES] (JSON array)
[{ "name":"", "role_type":"", "soul_core": {...}}]

[RECENT_CONTEXT]
最近3章摘要...

[STYLE_RULES]
anti_ai_rules_md...
```

# 6. 渐进增强路线（从能闭环到闭环强）

## 6.1 MVP（最快闭环）

写章输入只强制接入：

- `plan.one_liner + locked`
- `checkpoint_json`（如果有）
- `open_hooks`
- `recent_context`

写后自动跑：

- `process_chapter_hooks`
- `ai_propose_outline_patch_from_chapter`

## 6.2 增强 1（线程与人物接入）

写章输入再加入：

- `threads.referenced + active`
- `cast.cores`

写后自动跑：

- `ai_propose_threads_from_chapter`
- `ai_propose_soul_timeline_from_chapter`

## 6.3 增强 2（阶段规划与 checkpoint 自动维护）

- 写章前自动推导 stage_plan_for_n（若存在）
- 每 X 章或每批生成后自动 recompute checkpoint（但仍建议走提案/确认）

# 7. checkpoint_json 最小 Schema（建议）

目标：让 checkpoint 成为“事实基准 + 长上下文压缩”的稳定接口，写章、评审、提案都能复用同一份结构，而不是依赖自由文本。

## 7.1 设计原则

- 只收“事实”，不收“文风建议”
- 颗粒度偏粗：只保留后续章节必须依赖的关键信息，避免膨胀
- 可回溯：每条事实尽量带 `source`（章号范围或简短证据描述）
- 可增量：允许先空字段，后续逐步填满；字段缺失不得导致系统崩溃

## 7.2 Schema v0（MVP 够用）

```json
{
  "schema_version": "checkpoint_v0",
  "range": { "start": 1, "end": 100 },
  "mainline_progress": [
    {
      "beat": "主线推进摘要（<=80字）",
      "source": "章号或章号范围，如 87-100"
    }
  ],
  "facts": {
    "revealed_info": [
      { "fact": "已确认的新信息（<=80字）", "source": "..." }
    ],
    "open_questions": [
      { "question": "未解悬念/待解释问题（<=80字）", "source": "..." }
    ],
    "world_rules": [
      { "rule": "已确认规则/限制（<=80字）", "source": "..." }
    ]
  },
  "threads": [
    {
      "thread_key": "MAIN_01",
      "status": "todo|doing|done|parked",
      "summary": "线程当前状态（<=80字）",
      "next_expected": "下一步预期推进（<=80字）",
      "source": "..."
    }
  ],
  "cast_state": [
    {
      "name": "角色名",
      "role_type": "protagonist|antagonist|ally|mentor|supporting|other",
      "state": "角色当前关键状态（<=80字）",
      "relationships": [
        { "with": "角色名", "type": "关系类型", "strength": 1, "note": "可选" }
      ],
      "source": "..."
    }
  ],
  "inventory_state": [
    { "entity": "道具/地点/势力", "key": "owner|location|status|realm|timer", "value": "值", "source": "..." }
  ],
  "constraints_for_next": [
    "对接下来 5-10 章的硬约束（<=80字/条），例如：某伏笔必须在 3 章内兑现"
  ]
}
```

## 7.3 写章时的使用规则（硬/软）

- 强约束（写章必须遵守）
  - `facts.revealed_info/world_rules` 不得被推翻，只能“新增更细事实”或“用剧情行动导致变化”
  - `threads[].status` 作为事实：若线程标记 done，不得在后续当作未发生；若 doing，至少保证推进方向一致
  - `cast_state[].state` 不能突然跳变，除非本章明确写出“变化原因”
- 软约束（用于优化）
  - `constraints_for_next` 用于提醒，允许被“更高优先级的剧情行动”覆盖，但覆盖时应产生新的记录（写后反哺）

# 8. get_planning_context 返回 JSON Schema（建议）

目标：把 `PlanningContext(N)` 固化为一个可复用接口。写章、评审、提案生成应全部基于这份结构，避免各处拼上下文导致不一致。

## 8.1 输入

```json
{
  "chapter_number": 101,
  "version_id": 12,
  "recent_chapter_count": 3,
  "open_hooks_limit": 10,
  "active_threads_limit": 12
}
```

## 8.2 输出（MVP → 增强字段可选）

```json
{
  "chapter_number": 101,
  "version_id": 12,
  "book": {
    "title": "书名",
    "genre": "题材",
    "logline": "一句话卖点"
  },
  "plan": {
    "one_liner": "本章一句话",
    "tags": ["..."],
    "cast_refs": ["..."],
    "thread_refs": ["..."],
    "locked": false,
    "source": {
      "table": "chapter_outline_one_liners_current",
      "updated_at": "2026-01-01T00:00:00Z"
    }
  },
  "checkpoint": {
    "start_chapter": 1,
    "end_chapter": 100,
    "checkpoint": {
      "schema_version": "checkpoint_v0",
      "range": { "start": 1, "end": 100 }
    },
    "created_at": "2026-01-01T00:00:00Z"
  },
  "recent_context": {
    "mode": "outline_only",
    "chapters": [
      { "chapter_number": 98, "title": "标题", "outline": "..." },
      { "chapter_number": 99, "title": "标题", "outline": "..." },
      { "chapter_number": 100, "title": "标题", "outline": "..." }
    ]
  },
  "open_hooks": [
    { "id": 1, "hook_desc": "伏笔", "created_at_chapter": 30, "staleness": 10 }
  ],
  "threads": {
    "referenced": [
      {
        "thread_key": "MAIN_01",
        "type": "main",
        "title": "主线",
        "goal": "目标",
        "stakes": "代价",
        "status": "doing",
        "owner_characters": ["主角"],
        "start_chapter": 1,
        "end_chapter": null,
        "milestones": ["..."],
        "notes": ""
      }
    ],
    "active": [
      { "thread_key": "SUB_02", "type": "sub", "title": "支线", "status": "todo", "updated_at": "..." }
    ]
  },
  "cast": {
    "cores": [
      { "name": "主角", "role_type": "protagonist", "soul_core": {} }
    ],
    "soul_timeline": [
      { "character_name": "主角", "valid_from_chapter": 80, "valid_to_chapter": null, "soul_state": {}, "reason_span": "", "source": "ai", "confidence": 0.7 }
    ]
  },
  "temporal_states": [
    { "entity_id": "主角", "entity_type": "character", "state_key": "realm", "state_value": "筑基", "valid_from_chapter": 50, "valid_to_chapter": null }
  ],
  "warnings": [
    "缺少 checkpoint，长篇一致性风险上升",
    "plan.one_liner 为空：无法执行规划锚定"
  ]
}
```

## 8.3 写章/评审/提案的强制依赖关系（建议规则）

- 写章（outline/正文）必须依赖：
  - `plan.one_liner/locked`
  - `open_hooks`
  - `recent_context`
  - `checkpoint`（若存在则强制遵守；不存在则写入 warning）
- 评审必须依赖：
  - `plan.one_liner/locked`（用于判定偏离）
  - `checkpoint`（用于判定事实矛盾）
- 提案生成必须依赖：
  - `plan`（用于产出 outline_patch）
  - `threads/cast/temporal`（用于产出 thread_upsert/soul_timeline_upsert/temporal 提案）

# 9. PRE_WRITE_CHECK 契约（可验证闭环）

目标：让“强约束”不仅是 prompt 里的文字要求，还能在写后通过机器检查快速判定是否满足，并将失败原因映射到后续动作（重写/提案/校验）。

## 9.1 输出格式约定（建议）

写章生成的原始草稿（draft）建议固定包含三个区块（你们现有实现已使用该结构）：

- `=== PRE_WRITE_CHECK ===`
- `=== CHAPTER_TITLE ===`
- `=== CHAPTER_CONTENT ===`

其中 `PRE_WRITE_CHECK` 要求输出 Markdown 表格（人类可读 + 机器可抽取），并且每次写章都输出，哪怕某项为“无/不适用”。

对齐说明（当前实现差异）：

- 当前 `generate_chapter_pipeline` 的表格列为 `| 检查项 | 本章记录 | 备注 |`，且只要求 3 行（大纲锚定/风险扫描/伏笔闭环）。若要落地本节的“可验证闭环”，需要把表格升级为本节列名与必需行集合。
- 当前 `generate_chapter_pipeline` 最终返回值会优先抽取并仅返回 `CHAPTER_CONTENT`，这会导致 `PRE_WRITE_CHECK` 与 `CHAPTER_TITLE` 丢失，进而无法生成 `ComplianceReport`。若不改代码，至少需要在保存/展示层保留 raw draft（或额外返回 pre_write_check/title）。

## 9.2 表格列与必填项

表格必须包含以下列名（顺序可变，但列名必须一致，便于抽取）：

- `检查项`
- `本章记录`
- `证据/定位`
- `结果`

行（检查项）必须至少包含以下 6 项（名称必须一致）：

1) `规划锚定`：本章 one_liner 是否被执行
2) `Checkpoint 一致性`：是否违反 checkpoint 事实基准
3) `线程推进`：thread_refs 中推进了哪条（若无 thread_refs 则写“无”）
4) `伏笔闭环`：open_hooks 中推进/回收了哪条（至少 1 条）
5) `命名一致性`：人名/专名是否漂移
6) `风险扫描`：OOC/逻辑崩坏/设定冲突等

`结果` 列取值建议规范为：`PASS | WARN | FAIL`（大写）。

## 9.3 证据/定位的最低要求（让机器能核查）

为了可验证，`证据/定位` 建议使用以下规则：

- `伏笔闭环`：必须出现至少一个 `hook_id:<number>`，且该 id 必须来自 open_hooks 列表；若是“新增伏笔”，用 `new_hook:<text>` 标记
- `线程推进`：必须出现至少一个 `thread:<THREAD_KEY>`，且该 key 必须来自本章 thread_refs 或 active threads
- `Checkpoint 一致性`：若 FAIL，必须写 `violated:<fact>`（<=80字），并在风险扫描补充原因
- `规划锚定`：必须写 `one_liner:` 开头的复述（<=80字），用于对齐检查

## 9.4 PRE_WRITE_CHECK 示例

```md
=== PRE_WRITE_CHECK ===
| 检查项 | 本章记录 | 证据/定位 | 结果 |
|---|---|---|---|
| 规划锚定 | one_liner: 主角为救人闯入禁地并触发追杀 | one_liner:... | PASS |
| Checkpoint 一致性 | 未推翻既定事实 | - | PASS |
| 线程推进 | 推进 MAIN_01：拿到进入禁地的资格但暴露行踪 | thread:MAIN_01 | PASS |
| 伏笔闭环 | 回收“禁地入口在古碑背面”的伏笔，并引出守门人身份 | hook_id:12 | PASS |
| 命名一致性 | 人名/地名未漂移 | - | PASS |
| 风险扫描 | 章末追杀有合理因果，但需注意守门人动机别降智 | - | WARN |
```

## 9.5 自动校验（建议实现口径，仅定义规则）

### 9.5.1 最小校验规则（MVP）

- 若 `plan.one_liner` 为空：直接判定 `规划锚定=FAIL`，并在 warnings 写明“无法执行规划锚定”
- 若 open_hooks 非空，但 `PRE_WRITE_CHECK` 中未出现 `hook_id:`：判定 `伏笔闭环=FAIL`
- 若 thread_refs 非空，但 `PRE_WRITE_CHECK` 中未出现 `thread:`：判定 `线程推进=WARN`（后续可以升级为 FAIL）
- 若出现 `hook_id:X` 但 X 不在 open_hooks：判定 `伏笔闭环=FAIL`（证明引用不可信）

### 9.5.2 与后续动作的映射（建议）

- `规划锚定=FAIL`：优先触发 `ai_propose_outline_patch_from_chapter`（让规划向现实靠拢）或直接要求重写（取决于 locked）
- `Checkpoint 一致性=FAIL`：优先触发结构化评审 `run_structured_review(force_refresh=true)`，并生成 “事实冲突” 提案（未来扩展）
- `伏笔闭环=FAIL`：优先触发 `process_chapter_hooks` 与重写指令（要求本章必须兑现某 hook）
- `线程推进=FAIL`：触发 `ai_propose_threads_from_chapter`（若实际产生了新线程）或重写补推进

## 9.6 与现有模块的对齐点

- 写章入口 `generate_chapter_pipeline` 已要求输出 PRE_WRITE_CHECK/CHAPTER_TITLE/CHAPTER_CONTENT（见 system prompt 约束），本节只把“表格内容”标准化，方便后续抽取与自动判定。

# 10. 自动校验器（ComplianceReport）Schema（建议）

目标：定义一个可复用的“写章合规校验”输出，供：

- UI 显示（为什么这章不合格）
- 自动化决策（是否需要重写/是否进入评审/是否生成提案/是否阻塞定稿）
- 记录与回放（作为后续调参/回归的证据）

该校验器的输入是 `PlanningContext(N)` + 写章草稿中的 `PRE_WRITE_CHECK` + 章节正文/大纲的必要摘录。

## 10.1 输入 Schema（CheckerInput）

```json
{
  "chapter_number": 101,
  "planning_context": { "chapter_number": 101 },
  "draft_raw": "=== PRE_WRITE_CHECK === ... === CHAPTER_CONTENT === ...",
  "outline": "本章大纲文本（可选）",
  "content": "本章正文文本（可选，或只给摘要）",
  "options": {
    "strict": false,
    "require_hook_close": true,
    "require_thread_advance_when_thread_refs_nonempty": true,
    "max_excerpt_chars": 6000
  }
}
```

说明：

- `planning_context` 推荐直接使用 `get_planning_context` 的输出（第 8 节）
- 若正文较长，可以只传 `content_excerpt`，校验器只做“格式/证据/引用合法性/存在性”检查，不做语义判断

## 10.2 输出 Schema（ComplianceReport）

```json
{
  "chapter_number": 101,
  "version_id": 12,
  "overall": "PASS",
  "summary": "一句话总结本章合规性与主要风险点",
  "checks": [
    {
      "key": "plan_alignment",
      "name": "规划锚定",
      "status": "PASS",
      "severity": "error",
      "evidence": {
        "one_liner_echo": "one_liner: ...",
        "locked": false
      },
      "notes": []
    },
    {
      "key": "checkpoint_consistency",
      "name": "Checkpoint 一致性",
      "status": "PASS",
      "severity": "error",
      "evidence": {
        "violations": []
      },
      "notes": []
    },
    {
      "key": "thread_advance",
      "name": "线程推进",
      "status": "WARN",
      "severity": "warn",
      "evidence": {
        "thread_refs": ["MAIN_01"],
        "thread_tags": ["thread:MAIN_01"]
      },
      "notes": ["thread_refs 非空但未提供 thread:... 证据标记"]
    },
    {
      "key": "hook_close",
      "name": "伏笔闭环",
      "status": "PASS",
      "severity": "error",
      "evidence": {
        "open_hook_ids": [12, 18],
        "hook_ids_used": [12],
        "new_hooks": []
      },
      "notes": []
    },
    {
      "key": "naming_consistency",
      "name": "命名一致性",
      "status": "PASS",
      "severity": "warn",
      "evidence": {
        "cast_refs": ["主角"],
        "unknown_names": []
      },
      "notes": []
    },
    {
      "key": "format_contract",
      "name": "输出格式契约",
      "status": "PASS",
      "severity": "error",
      "evidence": {
        "has_pre_write_check": true,
        "has_chapter_title": true,
        "has_chapter_content": true,
        "table_columns_ok": true,
        "required_rows_ok": true
      },
      "notes": []
    }
  ],
  "actions": [
    {
      "type": "call_command",
      "command": "ai_propose_outline_patch_from_chapter",
      "args": { "chapter_number": 101 },
      "reason": "规划锚定失败且 locked=false，优先让规划向现实靠拢",
      "blocking": false
    }
  ],
  "artifacts": {
    "pre_write_check": {
      "rows": [
        {
          "item": "伏笔闭环",
          "record": "回收...",
          "loc": "hook_id:12",
          "result": "PASS"
        }
      ]
    },
    "excerpts": {
      "content_excerpt": "..."
    }
  },
  "generated_at": "2026-04-30T00:00:00Z"
}
```

字段解释：

- `overall`：当任一 `severity=error` 的检查项为 FAIL，则 overall=FAIL；若无 FAIL 但有 WARN，则 overall=WARN；否则 PASS
- `severity`：表示“失败时是否阻塞定稿/是否必须重写”
- `actions`：校验器的核心价值之一是把失败映射成可执行动作，减少人工判断成本

## 10.3 checks.key 建议枚举与判定口径（MVP）

- `format_contract`（error）
  - 缺少任一区块：FAIL
  - 表格缺列/缺必需行：FAIL
- `plan_alignment`（error）
  - `plan.one_liner` 为空：FAIL
  - PRE_WRITE_CHECK 未包含 `one_liner:` 复述：FAIL
  - locked=true 时建议升级为：未复述=FAIL，复述但明显不一致=FAIL（语义判断可后置）
- `hook_close`（error）
  - open_hooks 非空但未出现任何 `hook_id:`：FAIL
  - 出现 `hook_id:X` 但 X 不在 open_hooks：FAIL
- `thread_advance`（warn→可升级为 error）
  - thread_refs 非空但未出现任何 `thread:`：WARN
  - 若产品策略要求强推进，可升级为 FAIL
- `checkpoint_consistency`（error）
  - checkpoint 缺失：WARN（MVP 可不阻塞，但写入 warnings）
  - PRE_WRITE_CHECK 标记 violated:...：FAIL
- `naming_consistency`（warn）
  - cast_refs 非空但正文疑似出现大量不在 cast_refs 的新专名：WARN（基础版可只做简单启发式）

## 10.4 actions.type 建议枚举

- `call_command`：调用后端命令（如提案/评审/抽取）
- `rewrite_request`：向写章模块发起“带约束的重写请求”
- `block_finalize`：阻塞将章节状态改为 finalized
- `warn_only`：仅提示不阻塞

## 10.5 与现有命令的对接映射（建议）

- `hook_close=FAIL`：
  - `call_command: process_chapter_hooks`（确保伏笔池状态更新）
  - `rewrite_request: require_hook_close`（要求正文必须兑现某 hook）
- `plan_alignment=FAIL`：
  - locked=false：`call_command: ai_propose_outline_patch_from_chapter`
  - locked=true：`rewrite_request: must_follow_one_liner`
- `thread_advance=WARN/FAIL`：
  - `call_command: ai_propose_threads_from_chapter`（若实际出现新线程）
  - 或 `rewrite_request: must_advance_thread_refs`
- `checkpoint_consistency=FAIL`：
  - `call_command: run_structured_review(force_refresh=true)`（让评审显式指出矛盾点）

# 11. 重写请求（RewriteRequest）契约（建议）

目标：当 `ComplianceReport` 判定 FAIL/WARN 时，把“需要修什么”结构化成一次可重复执行、可追踪的重写请求；重写完成后可再次跑校验器形成闭环。

重写不是“再写一遍”，而是：

- 明确修复目标（必须闭环的 hook / 必须推进的 thread / 必须遵守的 one_liner / 必须避免的 checkpoint 冲突）
- 明确允许改动范围（只改正文？允许改大纲？允许改标题？）
- 明确输出格式契约（仍需输出 PRE_WRITE_CHECK/CHAPTER_TITLE/CHAPTER_CONTENT）

## 11.1 输入 Schema（RewriteRequest）

```json
{
  "chapter_number": 101,
  "mode": "patch",
  "allow_update": {
    "title": false,
    "outline": false,
    "content": true,
    "pre_write_check": true
  },
  "targets": {
    "must_close_hooks": [12],
    "must_advance_threads": ["MAIN_01"],
    "must_follow_one_liner": true,
    "must_keep_checkpoint_consistency": true
  },
  "constraints": {
    "max_delta_ratio": 0.35,
    "must_preserve_key_scenes": [
      "保留：主角在禁地入口被拦截并暴露行踪（如已写）"
    ],
    "forbidden_changes": [
      "禁止：推翻 checkpoint 中已确认的世界规则",
      "禁止：把已 done 的线程改回 todo"
    ]
  },
  "planning_context": { "chapter_number": 101 },
  "compliance_report": { "overall": "FAIL" },
  "source": {
    "draft_raw": "=== PRE_WRITE_CHECK === ... === CHAPTER_CONTENT === ...",
    "outline": "本章大纲（可选）",
    "content": "本章正文（可选，或只给摘要）"
  },
  "options": {
    "strict": true,
    "max_excerpt_chars": 6000
  }
}
```

字段解释：

- `mode`
  - `patch`：尽量少改，仅修复失败项（默认）
  - `rewrite`：允许大改，但仍必须满足 PlanningContext 的硬约束
- `allow_update`：控制哪些产物允许被修改；若 `outline=false`，则重写只能在既有 outline 下修正文达标
- `targets`：把“强约束失败点”显式化，避免重写后仍然遗漏
- `constraints.max_delta_ratio`：用于限制改动幅度（可选；不做代码实现也可作为提示）

## 11.2 输出 Schema（RewriteResult）

```json
{
  "chapter_number": 101,
  "status": "ok",
  "draft_raw": "=== PRE_WRITE_CHECK === ... === CHAPTER_CONTENT === ...",
  "extracted": {
    "chapter_title": "不含第X章前缀的标题",
    "chapter_content": "正文",
    "pre_write_check_md": "|...|"
  },
  "diff_hint": {
    "changed_sections": ["chapter_content"],
    "notes": ["已补充 hook_id:12 的兑现动作", "已推进 thread:MAIN_01 的关键节点"]
  }
}
```

## 11.3 重写 prompt 组织（建议）

建议把重写 prompt 分成三层：

1) 不可违反的硬约束（从 PlanningContext + RewriteRequest.targets 汇总）
2) 失败项清单（从 ComplianceReport.checks 中 status=FAIL/WARN 抽取）
3) 源内容（原标题/原大纲/原正文摘录）

推荐骨架：

```text
[HARD_CONSTRAINTS]
- must_follow_one_liner={...}
- must_close_hooks=[...]
- must_advance_threads=[...]
- checkpoint_must_hold=true

[FAILED_CHECKS]
- hook_close: FAIL (missing hook_id:12)
- thread_advance: WARN (missing thread:MAIN_01)

[SOURCE_CONTENT]
outline: ...
content_excerpt: ...

[OUTPUT_CONTRACT]
Must output PRE_WRITE_CHECK/CHAPTER_TITLE/CHAPTER_CONTENT with the table contract from section 9.
```

## 11.4 与现有命令的最小对接路径（建议）

当前工程里还没有独立的“重写 command”，但你们已有：

- `apply_audit_suggestions(original_text, suggestions)`（偏局部修复）
- `rewrite_based_on_readers(original_text, comments)`（偏读者反馈）
- `apply_full_review_fix(chapter_number, original_text, expert_issues, reader_comments)`（偏综合修复）

建议新增一个更贴合闭环的命令：

- `rewrite_chapter_with_constraints(rewrite_request)` → 返回 `RewriteResult`

如果暂不新增命令，也可用 `apply_full_review_fix` 作为临时承载，但需要把 `RewriteRequest.targets` 变成可读的 `expert_issues` 文本注入，且仍需输出 PRE_WRITE_CHECK 以便再校验。

# 12. 提案（Proposal）生命周期与 Apply 契约（建议）

目标：把“写后反哺”的结果从“生成一条 pending 提案”推进到“用户确认后稳定落库”，并保证幂等、可回滚、可追踪。

## 12.1 提案类型与来源（现有/建议）

你们现有会写入 `proposals` 表（workspace db 与 book db 都存在该表的创建逻辑，书库 db 为主）：`proposal_type/payload_json/source_chapter/status/confidence`。

建议将 `proposal_type` 规范为枚举（MVP 先覆盖现有已产出的三类）：

- `outline_patch`：更新 `chapter_outline_one_liners_current` 某些字段（one_liner/tags/cast_refs/thread_refs/locked）
- `thread_upsert`：新增或更新 `story_threads`
- `soul_timeline_upsert`：新增或更新 `character_soul_timeline`

增强阶段可扩展：

- `temporal_state_upsert`：更新 `temporal_states`（人物/道具状态）
- `world_fact_accept`：把 world_facts_proposals 的某条状态变更打包成提案（与 inbox 统一）
- `checkpoint_recompute`：对某范围 checkpoint 的重算建议（通常由批次生成或规划变更触发）

## 12.2 提案状态机（建议）

`status` 建议值域：

- `pending`：等待用户确认（默认）
- `accepted`：用户接受，已应用或待应用
- `rejected`：用户拒绝
- `applied`：已成功落库（可选；若 accepted 即代表已落库，可不区分）
- `failed`：应用失败（保留错误信息，允许重试）

最小落地：`pending/accepted/rejected` 三态即可，但建议增加 `failed` 以便 UI 提示与重试。

## 12.3 幂等键与去重规则（建议）

### 12.3.1 proposal 去重

提案去重建议基于：

- `(proposal_type, source_chapter, payload_hash)` 的组合唯一性
- payload_hash = `sha256(payload_json_normalized)`

> 你们目前在插入提案前已经做了“是否存在相同 payload_json”的检查（见 `proposal_exists`/`insert_proposal`），建议将其显式化为规范。

### 12.3.2 apply 幂等

Apply 命令必须幂等：同一个 proposal 应用两次不应产生重复写入或不可逆副作用。

建议 apply 输入中显式带：

- `proposal_id`
- `expected_status`（例如只能从 pending 进入 applied）
- `idempotency_key`（默认为 `proposal_id`）

## 12.4 Apply 命令契约（建议）

### 12.4.1 apply_proposal（统一入口）

```json
{
  "proposal_id": 123,
  "decision": "accept|reject",
  "apply": true,
  "actor": "user",
  "options": {
    "strict": true,
    "dry_run": false
  }
}
```

处理逻辑建议：

- decision=reject：仅更新 status=rejected
- decision=accept 且 apply=true：根据 proposal_type 分发到对应 apply_*，成功后置 status=applied（或 accepted）
- decision=accept 且 apply=false：只置 accepted，允许后续批量 apply

对齐说明（当前实现）：

- 当前工程已有 `accept_proposal(id)` / `reject_proposal(id)`，其中 `accept_proposal` 会在事务中直接应用 `outline_patch/thread_upsert/soul_timeline_upsert/relationship_upsert` 并把 status 置为 `accepted`（不区分 applied）。
- 当前 world facts 使用独立表 `world_facts_proposals` 与命令 `accept_world_fact_proposal/reject_world_fact_proposal`，其中 accept 支持写入 `character_bibles/world_locations/world_items/temporal_states`，并对同章冲突写入 `conflict` 提案。

冲突点（需要在实现侧补齐或在产品策略中规避）：

- `accept_proposal` 与 `save_outline_patches` 当前不会尊重 `locked` 的“防 AI 覆盖”语义：提案 payload 中若带 `locked` 或 `one_liner`，会直接覆盖当前行，即使当前行已 locked。
- 提案状态目前没有 `failed`，应用失败会直接返回错误但不保留失败记录与原因，UI 难以重试与追踪。

### 12.4.2 apply_outline_patch（按 patch 列表）

输入（payload 推荐形式）：

```json
{
  "patches": [
    {
      "chapter_number": 101,
      "one_liner": "string|null",
      "tags": ["..."] ,
      "cast_refs": ["..."],
      "thread_refs": ["..."],
      "locked": true
    }
  ],
  "options": {
    "respect_locked": true,
    "require_same_version": true
  }
}
```

冲突策略（建议）：

- 若目标行 locked=true 且 respect_locked=true：禁止覆盖 one_liner（可允许 tags/cast_refs/thread_refs 的补充，取决于策略）
- 若 require_same_version=true：当 active version 与 proposal.version_id 不一致，提示用户先切版本或重新生成提案

### 12.4.3 apply_thread_upsert（增量更新 story_threads）

输入（payload 推荐形式）：

```json
{
  "thread": {
    "id": null,
    "thread_key": "MAIN_01",
    "type": "main|sub|growth|mystery|character",
    "title": "string",
    "goal": "string",
    "stakes": "string",
    "status": "todo|doing|done|parked",
    "owner_characters": ["..."],
    "start_chapter": 1,
    "end_chapter": null,
    "milestones": ["..."],
    "notes": "string"
  },
  "options": {
    "allow_status_regress": false
  }
}
```

冲突策略（建议）：

- 默认禁止状态回退（done→doing/todo），除非 allow_status_regress=true
- 若 thread_key 已存在且 title/goal 冲突，优先保留用户手工编辑（需要区分 source=ai/manual；后续可在表里加字段）

### 12.4.4 apply_soul_timeline_upsert（写入人物弧光）

输入（payload 推荐形式）：

```json
{
  "item": {
    "id": null,
    "character_name": "主角",
    "valid_from_chapter": 80,
    "valid_to_chapter": null,
    "soul_state": {},
    "reason_span": "string",
    "source": "ai|manual",
    "confidence": 0.7
  },
  "options": {
    "merge_overlapping": true
  }
}
```

冲突策略（建议）：

- 同角色同区间重叠时：
  - merge_overlapping=true：合并区间或替换最近一条（取决于实现）
  - 否则拒绝并要求用户确认区间

## 12.5 Apply 后的派生动作（建议）

为了闭环，Apply 成功后应触发派生更新（可异步）：

- outline_patch 应用后：
  - 若修改了 one_liner/thread_refs/cast_refs：建议触发 `checkpoint_recompute`（至少对包含该章的 checkpoint range）
- thread_upsert 应用后：
  - 若 thread 状态变更：建议影响后续章节的 `must_advance_threads` 选择（PlanningContext 读取时体现）
- soul_timeline_upsert 应用后：
  - 更新 cast_state 供 checkpoint 汇总（下一次 checkpoint_recompute 体现）

# 13. 版本化与锁定策略（建议）

目标：解决“蓝图版本多次迭代 + current 表可编辑 + 写章引用”之间的事实来源一致性问题。

## 13.1 概念定义

- `book_plan_versions`：蓝图版本（输入/人物/系统/meta）
- `chapter_outline_one_liners_current`：当前生效的每章规划（面向写章引用）
- `chapter_outline_one_liners_versions`：按 version_id 的历史快照（面向回滚/对比）
- `outline_checkpoints`：按 version_id 与 range 的事实快照

## 13.2 active version（建议新增的单一事实来源）

建议引入 `active_plan_version_id`（存放位置二选一）：

- 存在 `book_meta`（新增字段），或
- 新表 `book_settings(key,value)`（更通用）

约束：

- 写章与评审默认引用 active version 的 checkpoint
- Planning 页的“最新版本”不等于 active version（最新可能是草稿）

## 13.3 locked 语义（建议）

`chapter_outline_one_liners_current.locked` 的语义建议明确为：

- locked=true：本章 one_liner 作为“已确认事实计划”，不得被 AI 自动提案覆盖
- 用户手工仍可解锁/编辑（锁定是“防 AI 覆盖”，不是“不可编辑”）

配套规则：

- `ai_propose_outline_patch_from_chapter` 生成 patch 时若检测 locked=true，仍可生成提案但应降级为 WARN 并默认不允许 apply（由 UI 控制）

# 14. 端到端闭环流程（建议的单章状态机）

目标：把“写章→校验→修复→评审→定稿→反哺”的顺序固化为可执行流程，减少用户需要记住的操作顺序。

## 14.1 状态定义（建议）

章节状态可沿用当前 `chapters.status` 的字符串，但建议规范枚举：

- `draft`：草稿（允许反复生成/重写）
- `needs_fix`：校验失败，需要修复
- `reviewing`：结构化评审中
- `ready`：校验通过且评审通过，可定稿
- `finalized`：定稿（触发写后反哺与记忆抽取）

## 14.2 单章闭环（Happy Path）

1) 读取 `PlanningContext(N)`（get_planning_context）
2) 生成大纲（可选）：以 plan.one_liner + open_hooks + checkpoint 为约束
3) 生成正文（generate_chapter_pipeline 或未来统一入口）
4) 保存正文（save_chapter_content）与保存大纲（save_chapter_outline）
5) 伏笔抽取与 staleness 更新（process_chapter_hooks 或 save_chapter_content 内置）
6) 生成 `ComplianceReport`（第10节）
7) 若 overall=PASS：run_structured_review（可选按策略：仅 finalized 前跑一次）
8) 若评审通过：update_chapter_status -> finalized
9) 写后反哺（异步）：
   - ai_propose_outline_patch_from_chapter
   - ai_propose_threads_from_chapter
   - ai_propose_soul_timeline_from_chapter
   - world_facts_proposals / temporal_states 的抽取（已有部分在 save_chapter_content 内）

## 14.3 失败分支（Fail Path）

- ComplianceReport FAIL：
  - update_chapter_status -> needs_fix
  - 生成 RewriteRequest（第11节）
  - 执行重写（rewrite_chapter_with_constraints 或临时用 apply_full_review_fix）
  - 重写后回到步骤 4

- Checkpoint 一致性 FAIL：
  - 先跑 run_structured_review(force_refresh=true) 产出“矛盾点”
  - 再发起 rewrite_request（明确禁止推翻某事实）

# 15. 当前实现到理想闭环的缺口清单（一次性汇总）

本节把缺口按“能否形成闭环”分层，便于一次性规划。

## 15.1 关键缺口（阻塞闭环）

- 缺少 `get_planning_context` 聚合接口：写章/评审/提案目前各自拼上下文，难以一致
- 缺少 `ComplianceReport` 校验器：无法自动判定强约束是否满足
- 缺少 `RewriteRequest` 专用重写入口：修复只能靠人工或非约束式重写
- 缺少 active version 概念：checkpoint/one-liner 的引用来源可能漂移

对齐说明（当前已具备但闭环仍弱）：

- 当前已有 proposal apply 入口（`accept_proposal` / `accept_world_fact_proposal`），以及写后自动生成提案的触发点（章节切换为 finalized 时自动调用 `ai_propose_*`）。缺口集中在“写章引用规划”与“可验证校验/纠偏”上，而不是“没有提案系统”。

## 15.2 质量缺口（闭环弱/易漂）

- locked 语义未贯穿提案生成与 apply
- checkpoint_json schema 未强制，导致事实基准不可依赖
- thread/cast 的引用未在写章 prompt 中形成强约束（目前更多依赖 open_hooks 与 recent_context）

## 15.3 工程缺口（可运维性）

- 缺少对每次写章的上下文快照/校验报告留存（回归困难）
- 缺少对提案应用失败的 error 记录与重试机制

# 16. 验收清单（MVP → 增强）

## 16.1 MVP 验收（闭环可用）

- 能生成并读取 `plan.one_liner/locked`
- 写章 prompt 强制包含：one_liner + open_hooks + recent_context + checkpoint（若有）
- 写后能生成 ComplianceReport，且能判定 FAIL 的原因（至少：缺 hook_id/thread 标记/缺区块）
- FAIL 时能生成 RewriteRequest，并能完成至少一次自动重写→再校验
- PASS 时能定稿并写入至少一类提案（outline_patch）

## 16.2 增强验收（闭环更强）

- thread_refs/cast_refs 进入写章硬约束（线程推进可升级为 error）
- 支持 apply thread_upsert/soul_timeline_upsert，并影响后续 PlanningContext(N)
- checkpoint_recompute 能在规划变更后更新事实基准

# 17. 安全与可追踪（建议）

- API Key 存储：建议明确 UI 提示“当前为本机 sqlite 明文存储”，并支持后续迁移到系统安全存储
- 数据可追踪：建议每次写章保存一份 `planning_context_snapshot + compliance_report + rewrite_request`（可单独表或日志文件）
- 幂等与回放：所有 apply 与 rewrite 建议可用 idempotency_key 重放，避免重复执行造成脏数据

# 18. 与现有实现的冲突/未闭环点（基于当前 inkos-desktop 代码）

本节用于核对：现有 UI/命令链路与本文设计是否冲突，以及哪些地方“看似有模块但流程未闭环”。该核对不改代码，只标出需要补齐的衔接点。

## 18.1 已存在的闭环链路（可直接复用）

- 定稿触发写后反哺：章节状态切换为 `finalized` 时，会自动触发 world facts 抽取与三类提案生成（outline_patch/threads/soul_timeline），并进入收件箱供人工确认（见 [App.tsx](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src/App.tsx#L587-L613)）。
- 内容保存触发“伏笔/世界实体”增量更新：`save_chapter_content` 会刷新伏笔 staleness、尝试自动回收、并从正文提取 world entities proposals（见 [save_chapter_content](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src-tauri/src/db.rs#L1849-L1858)）。
- 大纲保存触发“伏笔”更新：`save_chapter_outline` 会从大纲抽取 hooks 并刷新 staleness（见 [save_chapter_outline](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src-tauri/src/db.rs#L1861-L1869)）。
- 收件箱具备应用能力：`accept_proposal` 会直接把提案落库（outline/thread/soul/relationship），`accept_world_fact_proposal` 会把实体/时态状态落库并处理冲突（见 [accept_proposal](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src-tauri/src/db.rs#L2508-L2683)、[accept_world_fact_proposal](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src-tauri/src/db.rs#L2705-L2796)）。

## 18.2 与本文设计存在冲突的点（需要修订实现或修订策略）

- 写章生成返回值会丢失 PRE_WRITE_CHECK/标题：`generate_chapter_pipeline` 生成了 3 段输出，但返回时优先抽取并只返回正文（见 [pipeline.rs](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src-tauri/src/pipeline.rs#L522-L571)）。这与本文第 9~11 节对“可校验/可重写”的要求冲突，因为校验器与重写器需要 raw draft 或至少需要 PRE_WRITE_CHECK。
- PRE_WRITE_CHECK 表格契约不一致：当前写章 prompt 只要求 3 行与 3 列，不包含 hook_id/thread_key 等可验证标记（同上）。本文第 9~10 节需要更强的“证据标记”。
- locked 语义未被 apply 尊重：大纲人工编辑（`save_outline_patches`）与提案应用（`accept_proposal`）都会覆盖 locked 行（见 [save_outline_patches](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src-tauri/src/db.rs#L2313-L2354)、[accept_proposal outline_patch](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src-tauri/src/db.rs#L2522-L2562)）。这与第 13 节“锁用于防 AI 覆盖”的语义冲突。

## 18.3 现有功能存在但流程未闭环的点（需要补衔接）

- 蓝图（one-liner/checkpoint/stage_plan）未进入写章主流程：表与读取命令都存在（`get_outline_rows/get_outline_checkpoints/get_stage_plan`），但 `generate_chapter_outline/generate_chapter_pipeline` 的输入仅为章节标题/本章大纲，实际不引用 one-liner/checkpoint（见 [generate_chapter_pipeline user_prompt](file:///Volumes/MOVE/AI/work/writing/%E8%87%AA%E5%8A%A8%E5%8C%96/inkos-desktop/src-tauri/src/pipeline.rs#L543-L548)）。导致“规划生成”和“写章生成”两条链路并行，闭环弱。
- 提案应用后缺少派生更新：当前 accept_proposal 只写入目标表，不会触发 checkpoint 重算、线程状态联动或 UI 侧的强制再校验（对应第 12.5 的派生动作未落地）。
- 收件箱与写章/定稿的 gate 未绑定：现有 UI 能接受提案，但没有把“必须先处理某些提案/必须先通过合规校验”作为 finalized 的门槛；因此依然可能出现长期积压导致设定漂移。

## 18.4 本文建议的最小改动优先级（不改变设计目标）

- 先保证“可校验”：写章生成必须保留 raw draft（或至少保留 PRE_WRITE_CHECK 与 CHAPTER_TITLE），否则第 9~11 节无法落地。
- 再保证“规划入写章”：在写章 prompt 中加入 `plan.one_liner/locked + checkpoint + open_hooks + recent_context` 的硬约束（MVP），把闭环从“写后反哺”提升为“写中约束”。
- 最后强化“可纠偏”：引入 `ComplianceReport` 与 `RewriteRequest` 的命令层接口，形成自动化的 FAIL→重写→再校验循环。
