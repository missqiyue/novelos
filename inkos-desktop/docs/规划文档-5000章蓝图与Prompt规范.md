# 规划文档：5000章长篇蓝图与 Prompt 规范（仅文档，不编码）

## 0. 范围与结论（已确认）

### 0.1 核心规模与生成策略
- 预计章节数 N：最大支持 5000
- 全书大纲粒度：每章一句话（one-liner），不生成章节标题
- 先生成：阶段规划 + 前 300~500 章 one-liner（默认 400），后续按批次滚动生成（+100章/批）

### 0.2 系统/金手指模块
- 系统/金手指设定为可选模块
- 由大模型基于建书描述判断是否存在：true/false/optional
- optional 时输出两个方案差异，最终由用户确认是否启用

### 0.3 主线/支线与任务
- 主线/支线采用看板（任务式）
- 任务无依赖，可并行多条

### 0.4 人物设定（SOUL）
- 每个人物必须生成“人设 SOUL”
- SOUL 随章变化（timeline），但存在人物不变内核（core）

---

## 1. 产品目标与原则

### 1.1 目标
- 新建书籍时一次性生成可落地的“全书蓝图”（人物+关系+阶段规划），并能继续批量生成前 300~500 章 one-liner。
- 支持 5000 章长篇的可控生产：分批生成、记忆快照（checkpoint）驱动、一致性校验、局部重生成。
- 所有 AI 输出必须可编辑、可版本化、可回滚、可追踪来源。

### 1.2 原则
- 任何 AI 输出都应先落为草稿/提案，不直接覆写人工内容。
- 长篇上下文不可全量回灌：以 checkpoint 作为事实基准，阶段规划与本批上下文作为约束。
- 生成与抽取必须去重：数据库已存在则不再展示/不再插入。

---

## 2. 信息架构（页面/模块）

### 2.1 新建书籍向导（必做）
- 输入：书名、题材、logline、预计章节数 N、预计总字数、风格标签（可选）、视角（可选）
- 输出：Book Blueprint v1（草稿）并落库，用户确认后发布

### 2.2 全书大纲编辑器（必做）
- 5000 行 one-liner 列表（chapter_number + one_liner）
- 支持：虚拟滚动、范围编辑、锁定（locked）、范围重生成、版本 diff、范围回滚

### 2.3 世界观百科（扩展）
- 角色人物：人物卡 + SOUL 时间线 + 人物关系图
- 地点/势力/道具/功法：现有基础上扩展
- 时序状态：owner/status 等“随章变化的世界状态”，可视化、可编辑
- Inbox：统一承接 AI 抽取/校验/冲突提示/修复提案

### 2.4 主线/支线看板（必做）
- 任务卡（threads/quests）无依赖并行
- 支持关联章节范围与人物
- AI 给出“本章推进任务建议”，进入 Inbox 待确认

---

## 3. 核心数据模型（建议）

### 3.1 BookInput（建书输入）
- book_title
- genre
- logline
- target_chapters（<=5000）
- target_total_words
- style_tags（可选）
- pov（可选）

### 3.2 人物（两层结构：core + timeline）
1) Characters（不变内核）
- name
- role_type（主角/反派/导师/配角…）
- soul_core（S/O/U/L + 外显标签）

2) Character SOUL Timeline（随章变化）
- character_id/name
- from_chapter/to_chapter（可空表示∞）
- soul_state（S/O/U/L 状态版）
- reason_span（引用章号与事件摘要，不是正文证据）
- source（ai/manual）

### 3.3 人物关系（可随章变化）
- source/target（人物 id 或 name）
- relation_type（师徒/仇敌/盟友/利益绑定…）
- strength（1-5）
- from_chapter/to_chapter（可空）
- note

### 3.4 系统/金手指（可选）
- has_system：true/false/optional
- system_spec：规则、边界、代价、触发条件、升级路径、失败模式

### 3.5 阶段规划（Stage Plan）
- stage_id
- chapter_range（如 1-100）
- stage_goal/main_conflict/turning_point/climax/settlement
- threads（任务 key 列表）
- cast_focus

### 3.6 每章一句话（One-liner）
建议当前态与版本态分离：
- current：chapter_number（唯一）+ one_liner + tags + cast_refs + thread_refs + locked
- versions：按范围快照或差量存储（避免 5000*多版本爆炸）

### 3.7 Checkpoint（记忆快照）
- range
- mainline_progress
- active_threads（Top N）
- character_state_summary（Top N，含 soul_delta）
- temporal_state_summary（Top N）
- revealed_info / open_questions（Top N）
- tone_and_pacing

---

## 4. 生成批次策略（已确认的默认参数）

### 4.1 阶段大小与批次
- stage_size：100 章
- 初次 one-liner：400 章（可选 300/500）
- batch_size：100 章/批（400章=4批）

### 4.2 Checkpoint 策略
- 每批生成后必须生成 1 条 checkpoint
- 后续批次生成必须以 checkpoint 为事实基准，禁止推翻

### 4.3 校验规则（验收口径）
- one_liner 长度：20~60 字
- 必须为事件推进句：包含“事件 + 结果/变化”，禁止氛围句
- 主角最长连续缺席：8 章（若缺席必须在 one_liner 明确原因/去向）
- 相邻章不得同义重复推进（近似重复=error）
- thread_refs：建议 0~2 个
- tags：建议 0~3 个

---

## 5. AI Prompt 规范（系统 prompt / 输出 schema / 校验 prompt）

### 5.1 输出 Schema（契约）

#### CharacterCore（人物不变内核）
```json
{
  "name": "string",
  "role_type": "protagonist|antagonist|deuteragonist|mentor|support|side|npc",
  "soul_core": {
    "S": "string",
    "O": "string",
    "U": "string",
    "L": "string",
    "tells": {
      "catchphrase": "string",
      "habit": "string",
      "default_attitude_to_protagonist": "string"
    }
  }
}
```

#### SystemSpec（三态系统）
```json
{
  "has_system": "true|false|optional",
  "system_name": "string|null",
  "core_rule": "string|null",
  "boundaries": ["string"],
  "costs": ["string"],
  "activation_conditions": ["string"],
  "upgrade_path": ["string"],
  "failure_modes": ["string"]
}
```

#### StagePlan（阶段规划）
```json
{
  "stage_id": 1,
  "range": {"start": 1, "end": 100},
  "stage_goal": "string",
  "main_conflict": "string",
  "turning_point": "string",
  "climax": "string",
  "settlement": "string",
  "threads": [
    {"thread_key": "string", "type": "main|sub|character|mystery|growth", "goal": "string"}
  ],
  "cast_focus": ["string"],
  "system_usage": "string|null"
}
```

#### OneLinerRow（每章一句话）
```json
{
  "chapter_number": 1,
  "one_liner": "string",
  "cast_refs": ["string"],
  "thread_refs": ["string"],
  "tags": ["string"]
}
```

#### Checkpoint（记忆快照）
```json
{
  "range": {"start": 1, "end": 100},
  "mainline_progress": "string",
  "active_threads": [{"thread_key": "string", "status": "todo|doing|done|parked", "note": "string"}],
  "character_state_summary": [{"name": "string", "state": "string", "soul_delta": "string"}],
  "temporal_state_summary": ["string"],
  "revealed_info": ["string"],
  "open_questions": ["string"],
  "tone_and_pacing": "string"
}
```

#### ValidationResult（校验结果）
```json
{
  "pass": true,
  "issues": [
    {
      "severity": "error|warn",
      "code": "string",
      "chapter_number": 123,
      "message": "string",
      "suggested_fix": "string"
    }
  ]
}
```

### 5.2 全局 System Prompt（基座）
```text
你是“超长篇小说策划生成器与校验器”，服务于 5000 章规模的连载小说工程。

硬性要求：
1) 只输出严格 JSON，不要 Markdown，不要解释。
2) one_liner 必须是事件推进句，20~60 字，不要氛围句。
3) 人名/专名必须稳定一致，禁止同音不同字。
4) 信息不足输出空数组或 null，不得编造。
5) 若启用系统/金手指，关键使用必须满足条件并体现代价；做不到则不写该事件。
6) 后续生成以 checkpoint 为事实基准，禁止推翻已确认事实。
```

### 5.3 分阶段生成 Prompt（User Prompt 模板）

#### A) Cast + SOUL core
输出：`{"cast":[CharacterCore...]}`，人物 10~30，主角唯一。
```text
任务：基于输入生成人物清单（10~30人，按重要性分层），并为每人生成 SOUL core（S/O/U/L + 外显 tells）。
要求：主角必须存在且唯一；反派至少1个；SOUL 必须可用于驱动行为；输出 JSON：{"cast":[...]}。

输入 JSON：
{BOOK_INPUT}
```

#### B) SystemSpec（三态）
输出：SystemSpec
```text
任务：判断故事是否需要“系统/金手指”，输出 has_system=true/false/optional。
optional 必须给出“启用/不启用”的差异（写入 boundaries/costs/failure_modes 的条目里，简短）。
has_system=false 时其余字段为 null 或空数组。只输出 JSON。

输入 JSON：
{"book":{BOOK_INPUT},"cast_names":[{"name":"...","role_type":"..."},...]}
```

#### C) Stage Plan（全书）
输出：`{"stages":[StagePlan...]}`，默认 stage_size=100。
```text
任务：为全书生成阶段规划。默认每 100 章一段（从 1 到 target_chapters）。
threads.thread_key 必须短且唯一（如 MAIN_01 / SUB_MYSTERY_01）。
cast_focus 必须来自 cast。只输出 JSON：{"stages":[...]}。

输入 JSON：
{"book":{BOOK_INPUT},"cast":{CAST},"system":{SYSTEM_SPEC},"stage_size":100}
```

#### D) one-liner batch（100章/批）
输出：`{"rows":[OneLinerRow...]}`，数量必须等于 end-start+1。
```text
任务：为指定章节范围生成“每章一句话(one_liner)”，不生成标题。
硬规则：one_liner 20~60 字，必须事件推进句；cast_refs 必须来自 cast；thread_refs 0~2 个且来自 thread_key 集合；tags 0~3 个。
一致性：若提供 checkpoint，必须延续 checkpoint 事实，禁止推翻；主角最长连续缺席不得超过 8 章，缺席必须写明原因。
只输出 JSON：{"rows":[...]}。

输入 JSON：
{"range":{"start":1,"end":100},"book":{BOOK_INPUT},"stages_relevant":{STAGES_IN_RANGE},"cast":{CAST_SUMMARY_OR_FULL},"system":{SYSTEM_SPEC},"checkpoint":{CHECKPOINT_OR_NULL}}
```

#### E) 生成 checkpoint
输出：Checkpoint，必须短（<=1200字）。
```text
任务：为已生成章节范围生成 checkpoint（记忆快照），供下一批生成使用。
要求：必须短（<=1200字），active_threads 只保留最重要的 8 条，character_state_summary 只保留关键角色。只输出 JSON（Checkpoint）。

输入 JSON：
{"range":{"start":1,"end":100},"rows":{ONE_LINER_ROWS},"stages_relevant":{STAGES_IN_RANGE},"prior_checkpoint":{CHECKPOINT_OR_NULL}}
```

### 5.4 多轮校验与修复 Prompt

#### validate
输出：ValidationResult
```text
任务：对 one-liner rows 做校验并输出 issues。
至少检查：事件推进句/长度/相邻重复/人名合法/线程合法/主角缺席>8/系统越界（如启用）。
只输出 JSON（ValidationResult）。

输入 JSON：
{"range":{"start":1,"end":100},"rows":{ONE_LINER_ROWS},"cast_names":["..."],"thread_keys":["..."],"system":{SYSTEM_SPEC},"checkpoint":{CHECKPOINT_OR_NULL}}
```

#### fix
输出：`{"rows_fixed":[OneLinerRow...]}`，只修改被点名的章节。
```text
任务：根据校验 issues 修复 one-liner。
规则：只修改被点名的 chapter_number；不得引入新人物名；不得推翻 checkpoint；修复后必须满足长度与事件推进句。
只输出 JSON：{"rows_fixed":[...]}。

输入 JSON：
{"range":{"start":1,"end":100},"rows":{ONE_LINER_ROWS},"issues":{VALIDATION_ISSUES},"cast_names":["..."],"thread_keys":["..."],"system":{SYSTEM_SPEC},"checkpoint":{CHECKPOINT_OR_NULL}}
```

### 5.5 SOUL timeline（随章变化）
输出：`{"timeline_updates":[...]}`
```text
任务：基于 one-liner 为关键人物生成 SOUL state 的阶段性变化建议（timeline）。
规则：不修改 soul_core，只输出 soul_state；只在确有事件触发时变化；区间应连续；reason_span 必须引用章号与事件摘要。只输出 JSON。

输入 JSON：
{"range":{"start":1,"end":100},"cast":{CAST_FULL},"rows":{ONE_LINER_ROWS},"checkpoint":{CHECKPOINT}}
```

---

## 6. Prompt 变量字典（压缩格式 / token 预算 / 截断与降级）

### 6.1 总体 token 建议（工程预算）
- Cast+SOUL（完整）：<=6k
- SystemSpec：<=3k
- StagePlan（全书）：<=8k（字段必须短）
- one-liner batch（100章）：<=10k
- checkpoint：<=6k（文本<=1200字）
- validate/fix：<=8k/10k

### 6.2 {BOOK_INPUT}（压缩）
```json
{"title":"string","genre":"string","logline":"string","N":5000,"total_words":1500000,"style":["string"],"pov":"first|third|multi|null"}
```
截断：title<=20字、genre<=10字、logline<=80字、style<=6个标签（每个<=6字）。  
降级：style→pov→logline截到60字（N/total_words必须保留）。

### 6.3 {CAST}（两形态）
- CAST_FULL：仅用于人物生成与 timeline 推导；S/O/U/L 每项建议<=20字
- CAST_SUMMARY：用于 one-liner 生成/校验（默认）
```json
{
  "cast_summary":[{"n":"楚风","r":"protagonist","k":"<=18字"}, ...],
  "name_rules":{"must_use_exact":true,"aliases_forbidden":true}
}
```
截断：summary<=18人（保留主角/反派/导师），k<=18字。  
降级：18→12→8→只传 cast_names（最后手段）。

### 6.4 {STAGES_IN_RANGE}（压缩）
仅传覆盖本 range 的 1~2 个阶段：
```json
{"stages":[{"id":1,"range":[1,100],"goal":"<=30字","conflict":"<=30字","tp":"<=30字","climax":"<=30字","settle":"<=30字","threads":[{"k":"MAIN_01","t":"main","g":"<=18字"}],"cast_focus":["楚风"]}]}
```
截断：threads<=8、cast_focus<=10、字段<=30字。  
降级：删 cast_focus→删 tp/settle→只保 goal+threads。

### 6.5 {CHECKPOINT}（压缩）
目标：总字数<=1200字。建议结构：
```json
{"range":[1,100],"main":"<=40字","threads":[{"k":"MAIN_01","s":"doing","n":"<=18字"}],"chars":[{"n":"楚风","st":"<=18字","sd":"<=18字"}],"temporal":["<=30字"],"revealed":["<=24字"],"questions":["<=24字"],"tone":"<=24字"}
```
截断：threads<=8、chars<=8、temporal<=10、revealed/questions<=8。  
强制降级优先级：revealed/questions→temporal→chars→threads，最终只保 main+threads(<=4)+tone。

### 6.6 {ONE_LINER_ROWS}（轻量键名）
用于 validate/fix/checkpoint：
```json
{"rows":[{"c":1,"t":"...","p":["楚风"],"th":["MAIN_01"],"tg":["危机"]}]}
```
截断：一次只处理一个 batch（100章），不允许把 400/5000 全塞进校验器。  
降级：validate 超预算先删 tags→再删 cast_refs（不建议 fix 降级）。

### 6.7 降级模式（实现端三档）
- Mode0 标准：checkpoint完整compact、cast_summary<=18、stages<=2且threads<=8
- Mode1 紧凑：checkpoint只保 main+threads<=4+chars<=4+temporal<=3；cast_summary<=12；stages只保 goal+threads<=6
- Mode2 极限：checkpoint只保 main+threads<=4；cast_names<=12；stages只保 goal+thread_keys

---

## 7. 里程碑与验收（可直接转任务）

### M1 新建书籍蓝图
- 生成 cast+SOUL core、system三态、全书 stage_plan（100章/段）
- UI 展示并可编辑/发布版本

### M2 前 400 章 one-liner
- 100章/批生成+checkpoint
- validate→fix→validate（最多2轮）
- 大纲编辑器支持范围编辑/锁定/重生成/版本diff/回滚

### M3 看板任务
- AI 从 stage_plan 生成初版任务卡
- one-liner 可关联任务，归档后 AI 提议任务推进（Inbox）

### M4 SOUL timeline
- AI 基于 one-liner 推导阶段性 SOUL state 变化（提案化）
- UI 展示 core 与 timeline

