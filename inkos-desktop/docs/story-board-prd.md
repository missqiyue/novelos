# 故事看板（Story Board）需求文档

## 1. 背景与问题

当前“故事看板”页面为静态演示组件，未与书籍、章节、伏笔、评审与因果记忆联动。用户在写作过程中会遇到：

- 章节内容在编辑器里是线性流，但全局结构（节奏、冲突升级、伏笔回收、因果兑现）无法一眼总览
- 伏笔与因果（pending_hooks / consequence_ledger）分散在侧栏与评审里，缺少“结构化全局地图”
- 章节生成/修复后需要反复跳转定位“这一章推进了什么”“下一章该收哪些坑”“哪些风险在变大”

故事看板的目标是把“书籍级结构”与“章节级执行”连接起来：让写作过程从“单章写作”升级为“结构化推进”。

## 2. 产品目标

### 2.1 核心目标（必须达成）

- 以“书籍”为维度展示可操作的结构视图
- 以“章节”为基本单元呈现：章节状态、章节大纲/摘要、关键标签
- 让用户用更低成本完成：结构规划、章节跳转、伏笔与因果的闭环推进

### 2.2 关键效果（用户能感知到）

- 打开看板即可回答：
  - 现在写到哪一章？整体节奏是否连续？
  - 当前最滞后的伏笔有哪些？分别在哪章埋下、拖了多久？
  - 未结清因果账本有哪些？哪些需要在接下来几章兑现？
  - 下一章大纲是否覆盖了至少一条“需要推进/回收”的事项？
- 在看板中点击任意章卡片可一键跳转到编辑器该章（并同步右侧 Inspector）

## 3. 目标用户与使用场景

### 3.1 目标用户

- 以章节连载为主的网文作者
- 需要用 AI 辅助生成，但又希望保持“结构可控”的作者
- 有强依赖伏笔/因果/爽点节奏的商业向作者

### 3.2 核心场景

- 场景 A：写第 N 章前打开看板，快速确认“本章应推进/回收的主线项”
- 场景 B：生成正文后发现评审不通过，通过看板定位“是结构问题还是单章问题”
- 场景 C：发现伏笔堆积，在看板上按滞后排序，决定未来 2–3 章的回收计划

## 4. 范围定义（Scope）

### 4.1 MVP（第一期）

MVP 的设计必须满足“千章规模可用”。因此第一期不做“全量章节卡片时间线”，而做“聚合控制台 + 下钻”。

1) 聚合控制台（默认视图）
- 顶部全书指标：总字数、已写章节数、未回收伏笔数、未结清因果数、最近评审未通过数
- 三个 Top 列表（每个默认 Top 10，可配置）：
  - 最滞后伏笔 Top：按 staleness 降序
  - 未结清因果 Top：按最早 chapter_number 升序
  - 最近评审失败章 Top：按 created_at 降序
- 每行提供“一键跳转到章节”

2) 章节区间热度（下钻入口）
- 将章节按区间分桶（默认每 50 章一个桶，可配置）
- 每个桶显示：章节范围、字数、未回收伏笔增量、未结清因果增量、评审失败次数
- 点击桶进入“桶内章节列表”（分页/虚拟滚动，避免一次性渲染上千项）

3) 章节列表（桶内/搜索结果）
- 只在用户下钻后展示章节列表
- 支持排序：章节号/状态/最新评审红灯数/滞后压力
- 点击章节行 → 跳转编辑器并选中对应章节

4) 快捷动作（最小闭环）
- 在 Top 列表与章节行中提供快捷动作（如：强制重新评审、综合修复、清理噪声伏笔）
- 动作需可回显执行结果（成功/失败提示、对应数据刷新）

### 4.2 二期（增强）

- 拖拽排序与分卷/分幕分组（Board Layout）
- 章节区间支持自定义“卷/幕/阶段”标注与折叠
- 看板支持“线程（Thread）”：把伏笔/因果绑定到线程并提供线程视图
- 章节对比：显示“本章是否推进/回收至少 1 条高滞后项”
- 节奏/爽点可视化：基于 valence 或评审输出绘制趋势

### 4.3 非目标（暂不做）

- 在线多人协作、评论系统
- 复杂的图数据库式关系可视化（节点/边可编辑）
- 自动生成完整全书分幕结构（可以作为未来 AI 功能）

## 5. 与书籍/章节的关联设计

### 5.1 书籍维度

“看板”是书籍级视图，默认展示当前书籍：

- BookMeta：title/genre/logline/full_outline
- 全书指标：总字数、未回收伏笔数、未结清因果数、评审未通过章数

### 5.2 章节维度（核心关联）

章节为主键：chapter_number（已有）

看板卡片展示字段（第一期）：

- chapter_number / title / status
- outline（可折叠显示，或显示前 80 字）
- content_length（正文长度）
- review_status（最新结构化评审：通过/不通过，及红灯数量）
- hook_metrics（本章相关伏笔指标）
- consequence_metrics（本章相关因果指标）

跳转行为：

- click 卡片 → setActiveChapter(chapter_number) 并 setCurrentView('editor')

## 6. 数据模型（建议）

### 6.1 直接复用现有表（一期即可）

- chapters：章节基础信息
- pending_hooks：伏笔池（滞后 staleness）
- consequence_ledger：因果账本（is_resolved）
- chapter_review_history：评审快照（取最新一条作为状态摘要）

### 6.2 新增表（用于二期布局/分组）

board_layout（建议）：

- id INTEGER PK
- book_id TEXT（若未来支持多书）
- item_type TEXT（chapter | note | thread）
- ref_id TEXT（chapter_number 或 note_id）
- lane TEXT（例如：第一卷/第二卷/主线/支线）
- position REAL（排序用）
- meta_json TEXT（颜色、标签等）

## 7. 接口需求（Tauri Commands）

### 7.1 MVP 必需接口

- get_chapters（已有）
- get_pending_hooks（已有）
- get_latest_structured_review(chapter_number)（已有）
- cleanup_pending_hooks（已有）
- apply_full_review_fix（已有）
- run_structured_review（已有，支持 force_refresh）

新增建议：

- get_board_overview()
  - 返回全书聚合指标 + Top 列表（一次请求满足默认控制台）
  - 建议返回字段：
    - book: { title, genre, logline }
    - totals: { total_chars, chapter_count, open_hooks_count, open_consequences_count, failed_reviews_recent }
    - top: { stale_hooks: [...], open_consequences: [...], failed_reviews: [...] }
- get_board_chapter_bucket_overview(bucket_size, offset, limit)
  - 返回章节区间桶（按 bucket_size 分桶），用于热度视图
- get_board_chapter_list(range_start, range_end, sort, offset, limit)
  - 返回某区间内章节列表（支持分页/排序）

### 7.2 二期接口

- save_board_layout(layout_json)
- get_board_layout()

## 8. 页面与交互（MVP）

### 8.1 入口

- 左侧“视图”下：故事看板
- Command Palette：切换到故事看板

### 8.2 主界面结构

- 顶部：书名 + 全书指标
- 主体默认展示“聚合控制台”：
  - Top 列表：最滞后伏笔 / 未结清因果 / 最近评审失败章
  - 章节区间热度：按区间分桶的热度条/列表
- 视图切换（一期可选但建议）：
  - 控制台（默认）
  - 区间章节列表（下钻后进入）

### 8.3 列表项内容（建议）

Top 列表项（伏笔/因果/评审）：
- 标题：摘要文本（hook_desc / consequence_hook / 失败原因摘要）
- 辅助信息：来源章、滞后章数、创建时间/评审时间
- 操作：跳转到章节（必须），可选动作（评审/修复/清理）

章节列表项（桶内）：
- chapter_number / title / status
- 字数（content_length）
- 最新评审：红灯数/建议条数（无评审则为空）
- 伏笔压力：本章创建/回收数量（一期可简化为“本章创建数”）
- 操作：跳转编辑器

## 9. 规则与计算（MVP）

### 9.1 总字数

sum(chapters.content.length)，忽略占位文本或空内容。

### 9.2 伏笔指标

- open_hooks_count = pending_hooks where is_resolved=false
- stale_hooks = staleness>=2 或 >=3（阈值可配置）
- Top stale hooks：ORDER BY staleness DESC LIMIT N
- 区间桶指标：
  - hooks_created_in_range = created_at_chapter in [start, end]
  - hooks_resolved_in_range = resolved_at_chapter in [start, end]

### 9.3 因果指标

- open_consequences_count = consequence_ledger where is_resolved=0
- earliest_open = min(chapter_number) where is_resolved=0
- Top open consequences：按 chapter_number ASC LIMIT N

### 9.4 评审状态

- latest_review = chapter_review_history latest by created_at
- failed_count = count(audit_reports where passed=false)
- suggestions_count = sum(len(suggestions))
- 最近失败章 Top：按 created_at DESC 聚合

## 10. 风险与边界情况

- 章节内容为空：卡片正常显示“未生成正文”
- 未配置 API Key：评审与记忆抽取可能为 mock，需在 UI 里标识（已在 review meta 中支持）
- 千章规模：默认只展示聚合与区间，不展示全量章节卡片
- 伏笔与因果过多：只显示 Top N，并提供筛选/搜索/下钻
- 多书切换：当前代码为单书 DB，若未来多书需引入 book_id 分区

## 11. 迭代验收标准（MVP）

- 默认进入“控制台”视图：加载时间稳定，不随章节数线性爆炸
- Top 列表可以一键跳转到目标章节
- 区间分桶展示正确：可下钻查看桶内章节列表（分页）
- 顶部指标正确：总字数、未回收伏笔数、未结清因果数、评审失败数
- 快捷动作生效且可回显：强制评审/综合修复/清理伏笔后数据刷新
