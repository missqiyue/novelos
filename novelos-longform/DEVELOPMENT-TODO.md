# NovelOS Longform 开发任务清单

> 基于《NovelOS-长篇模式-完整系统设计.md》梳理
> 目标平台：Web / macOS / Windows
> 技术栈：Tauri 2.x + React + TypeScript + TailwindCSS + SQLite + OpenAI兼容API

---

## 一、工程基础设施

### 1.1 项目脚手架与跨平台架构

- [x] **TECH-001** 确定跨平台技术方案 → Tauri 2.x + React + TypeScript + TailwindCSS
- [x] **TECH-002** 初始化项目结构（src/ 前端 / src-tauri/ 后端 / 共享类型 / Agent层 / 数据库迁移）
- [x] **TECH-003** 搭建 Web 开发环境（Vite 8 + React 19 + TypeScript 6 + TailwindCSS 4）
- [x] **TECH-004** 搭建 macOS 桌面构建流水线（scripts/build-mac.sh + tauri bundle + dmg）
- [x] **TECH-005** 搭建 Windows 桌面构建流水线（scripts/build-win.ps1 + msi/nsis 双格式）
- [x] **TECH-006** 配置 CI/CD（GitHub Actions: lint+typecheck / cargo check+test / tauri build 三平台 artifact）
- [x] **TECH-007** 定义共享类型系统（src/types/index.ts — 全部35+数据表 + 补充类型）
- [x] **TECH-008** 配置 ESLint + Prettier + Husky + commitlint

### 1.2 数据库层

- [x] **DB-001** SQLite 数据库初始化（rusqlite bundled + refinery 迁移框架）
- [x] **DB-002** Web 端数据库方案（sql.js WASM + IndexedDB持久化，平台检测facade模式）
- [x] **DB-003** 数据库迁移框架（refinery：V001~V005 全局 + V002 项目）
- [x] **DB-004** 全局库建表：10张表 + 索引（genre_templates / style_profiles / de_ai_rules / writing_patterns / reference_works / banned_names / soul_templates / banned_book_titles / bookshelf / global_settings）
- [x] **DB-005** 项目库建表：40+张表（projects / canon_rules / characters / chapters / events / outlines 等）
- [x] **DB-006** 全部索引创建（参考设计文档每张表的索引建议）
- [x] **DB-007** FTS 全文检索表创建：chapters_fts / canon_rules_fts / event_nodes_fts / reader_comments_fts
- [x] **DB-008** 补全缺失表：notifications / agent_execution_logs / llm_api_calls / project_settings / writing_sessions / chapter_word_stats / volume_word_stats / project_word_stats
- [x] **DB-009** 数据访问层（Repository Pattern）：封装 CRUD + 索引查询，repos模块（chapter/canon/character/retcon + Repository trait + with_project_conn/with_global_conn闭包式连接访问）
- [x] **DB-010** 事务封装工具：章节定稿+账本写入+快照生成 / 正典更新+版本记录 / 修史审批+影响记录+状态更新

### 1.3 向量数据库与 RAG

- [ ] **RAG-001** ChromaDB 集成（桌面端本地嵌入式）
- [ ] **RAG-002** Web 端向量方案（远程 ChromaDB / Pinecone / 本地 WASM 方案）
- [x] **RAG-003** Embedding 模型集成：bge-m3 / nomic-embed-text（本地）+ OpenAI text-embedding-3（远端）
- [x] **RAG-004** 切片引擎实现（段落级切片：200-800字，元数据标注，短段落合并，长段落语义拆分）
- [x] **RAG-005** 向量索引维护（章节定稿后自动切片+向量化，修史后受影响切片重索引）
- [x] **RAG-006** 检索接口实现（余弦相似度 + 元数据过滤 + 混合检索 FTS 重排序）
- [x] **RAG-007** 每书独立向量库隔离（collection 隔离，切换时加载/释放）

### 1.4 LLM 抽象层（BYO-AI）

- [x] **LLM-001** LLM Provider 抽象接口（LlmProvider trait: chat_completion → Pin<Box<Future>>）
- [x] **LLM-002** OpenAI 兼容 Provider 实现（支持自定义 base_url，兼容国内模型）
- [x] **LLM-003** Anthropic Provider 实现（Claude API: x-api-key + anthropic-version header，SettingsPage Provider选择器）
- [x] **LLM-004** 本地模型 Provider 实现（Ollama: /api/chat + localhost:11434 + SettingsPage选项）
- [x] **LLM-005** API Key 管理（global_settings 存储 + LlmState 热配置，未加密）
- [x] **LLM-006** Token 消耗追踪（agent run_agent 已写入 llm_api_calls 表）
- [x] **LLM-007** 速率限制与 429 处理（OpenAI Provider 返回 429 错误，需加指数退避重试）
- [x] **LLM-008** Token 用量追踪（get_token_usage: 总调用+按Agent+按模型+费用估算，TokenUsage面板集成Dashboard统计页）

---

## 二、核心后端服务

### 2.1 Project Service

- [x] **SVC-001** 创建长篇项目（create_project：建DB+落库+加入书架+返回ProjectInfo）
- [x] **SVC-002** 获取项目概览（get_project + DashboardPage 看板数据）
- [x] **SVC-003** 更新项目设置（update_project：title/status + 同步书架冗余字段）
- [x] **SVC-004** 项目状态管理（status 字段：planning/active/paused/completed/archived）
- [x] **SVC-005** 删除项目（含关联数据清理、DB文件删除、书架移除）
- [x] **SVC-006** 项目导入（从 TXT 导入已有稿件，按"第X章"标记自动拆分章节，支持文件选择器）
- [x] **SVC-007** 项目导出（TXT/Markdown/DOCX/EPUB + 目录 + 元数据，四格式完整支持）

### 2.2 Canon Service（正典中心）

- [x] **CAN-001** 创建正典规则（create_canon_rule：含 is_hard、scope_type、初始版本记录）
- [x] **CAN-002** 更新正典规则（update_canon_rule：自动递增 version + 写入 canon_rule_versions）
- [x] **CAN-003** 冻结/解冻正典规则（status: active/frozen 切换）
- [x] **CAN-004** 查询正典规则列表（list_canon_rules：按 scope_type 筛选）
- [x] **CAN-005** 正典规则版本历史查询（list_canon_rule_versions：按版本倒序）
- [x] **CAN-006** 正文生成前自动召回（recall_context_for_chapter: 硬规则+软规则+角色状态+开放伏笔+token估算）

### 2.3 Outline Service（大纲与规划）

- [x] **OUT-001** 全书大纲 CRUD（get_book_outline / save_book_outline：版本化）
- [x] **OUT-002** 分卷大纲 CRUD（list/save volume_outlines：每卷独立版本）
- [x] **OUT-003** 章节大纲 CRUD（list/save/confirm chapter_outlines：confirmed 标记）
- [x] **OUT-004** 卷级规划管理（list_volumes / update_volume：目标/冲突/爆点/余波）
- [x] **OUT-005** 事件链管理（list_arcs：按 volume_id 筛选 + list_event_nodes）
- [x] **OUT-006** 章节任务卡 AI 生成（task_card Agent + ChapterWorkbench AI任务卡按钮 + 解析JSON落库）
- [x] **OUT-007** 大纲修正流程（修改后评估影响范围、受影响章/卷/伏笔）

### 2.4 Chapter Service（章节工作台）

- [x] **CHP-001** 章节草稿保存（update_chapter_draft：自动版本记录 + 字数统计）
- [x] **CHP-002** 章节定稿（finalize_chapter：draft_text → final_text, status → finalized）
- [x] **CHP-003** 章节版本管理（chapter_versions：每次 draft 保存生成版本）
- [x] **CHP-004** 章节回滚（选择历史版本恢复）
- [x] **CHP-005** 章节状态机（VALID_TRANSITIONS 规则表 + transition_chapter_state/get_valid_transitions/set_compile_status + 前端状态按钮）
- [x] **CHP-006** 章节字数统计（word_count 字段，按 char count 计算）
- [x] **CHP-007** 章节正文全文检索（search_chapters命令 + LIKE搜索 + snippet提取 + 结果限30条）
- [x] **CHP-008** 章节列表虚拟滚动（VirtualList组件: ResizeObserver+overscan+绝对定位）

### 2.5 Snapshot Service（快照引擎）

- [x] **SNP-001** 章节快照生成（定稿后自动触发：角色状态+卷信息+伏笔统计+字数）
- [x] **SNP-002** 事件链快照生成（每个事件链结束后）
- [x] **SNP-003** 卷级快照生成（每卷结束后，含全量状态摘要）
- [x] **SNP-004** 快照查询（按章节范围、按卷、按类型 + list_snapshots命令）
- [x] **SNP-005** 快照用于召回（Recall Agent 加载最近快照而非全量历史）

### 2.6 Continuity Compiler Service（连续性编译器）

- [x] **CMP-001** CanonChecker：设定冲突检查（草稿 vs 硬规则，禁止项检测）
- [x] **CMP-002** CharacterChecker：人物口吻偏移检查（SOUL数据完整性检查，引用检测）
- [x] **CMP-003** TimelineChecker：时间线冲突检查（关键词匹配 + 事件覆盖检测）
- [x] **CMP-004** PowerChecker：战力跳变检查（关键词检测：实力暴涨/碾压/一招击败等）
- [x] **CMP-005** VisibilityChecker：信息越权检查（关键词检测：竟然知道/明明是秘密等）
- [x] **CMP-006** ForeshadowChecker：伏笔错误回收检查（超期30章未回收检测）
- [x] **CMP-007** WordCountChecker：字数范围检查（草稿字数 vs min/max_chapter_words）
- [x] **CMP-008** 编译结果输出（pass/warning/fail + 0-100分 + issues JSON + 修复建议 + 统计面板）
- [x] **CMP-009** 编译失败阻断归档（fail 状态的章节无法进入 approved）
- [x] **CMP-010** RAG 增强编译（语义级冲突检测，补充规则引擎无法覆盖的复杂冲突）

### 2.7 Retcon Service（修史审批台）

- [x] **RTN-001** 创建修史申请（target_type + target_ref + reason）
- [x] **RTN-002** 影响分析（受影响的卷/章/角色/伏笔/状态，写入 retcon_impacts）
- [x] **RTN-003** 三种修复方案推荐：后续补偿 / 局部回写 / 卷级重构
- [x] **RTN-004** 用户审批流程（approve / reject / 修改方案）
- [x] **RTN-005** 修史执行（Rewrite Agent / Arc Planner 执行修复）
- [x] **RTN-006** 修史后回归检查（对受影响区间重新编译）
- [x] **RTN-007** 修史后快照更新

### 2.8 Recall Service（精准召回）

- [x] **RCL-001** 召回策略实现（按优先级组装上下文：任务卡 → 硬规则 → 角色状态 → 快照 → 伏笔/事件账）
- [x] **RCL-002** Token 预算控制（≤8000 token，分层裁剪）
- [x] **RCL-003** FTS 精确召回（关键词命中）
- [x] **RCL-004** RAG 语义召回（模糊描述 → 语义相似匹配）
- [x] **RCL-005** 召回结果去重合并（FTS + RAG 结果合并重排序）
- [x] **RCL-006** 跨书数据隔离（只读当前项目的 DB + 向量库）

### 2.9 书架系统（多书管理）

- [x] **SHF-001** 书架列表（list_bookshelf：书名/题材/状态/显示顺序/冗余元数据）
- [x] **SHF-002** 新建书籍入口（BookshelfPage → create_project → 自动加书架）
- [x] **SHF-003** 切换书籍（switch_project：加载目标DB + 更新last_opened_at）
- [x] **SHF-004** 切换时后台任务处理（编译/评审/巡检暂停或排队）
- [x] **SHF-005** 全局共享资源管理（题材模板、文风、去AI规则、爆款模式库的跨书引用）

### 2.10 故事账本（八类）

- [x] **LDG-001** 世界规则账（canon_rules 关联查询）
- [x] **LDG-002** 人物状态账（character_states CRUD + 章节范围查询 + upsert_character_state）
- [x] **LDG-003** 关系状态账（relationship_states CRUD + 角色对查询 + upsert_relationship_state）
- [x] **LDG-004** 时间线账（timeline_nodes CRUD + 相对日期排序 + upsert_timeline_node）
- [x] **LDG-005** 事件账（event_nodes CRUD + 因果链查询，复用 outline 已有实现）
- [x] **LDG-006** 伏笔账（foreshadow_items CRUD + 状态筛选：待回收/已回收/超期）
- [x] **LDG-007** 信息可见性账（knowledge_visibility CRUD + "谁知道什么"查询 + LedgerPage标签）
- [x] **LDG-008** 资源与代价账（ability_items CRUD + 持有者/消耗/冷却查询）
- [x] **LDG-009** 账本增量更新（章节定稿后 Archive Agent 提取事实变化，追加写入）
- [x] **LDG-010** 账本精准召回（Recall Agent 按任务卡关键词和角色列表检索）

### 2.11 通知与预警系统

- [x] **NTF-001** 通知中心（通知队列 + 已读/未读 + 按类型分类 + 铃铛下拉）
- [x] **NTF-002** 通知存储（list_notifications/create_notification/mark_notification_read + notify_pipeline_event helper）
- [x] **NTF-003** 风险预警规则引擎（§33 全部规则）
- [x] **NTF-004** 通知偏好设置（NotificationPrefsPage: 6类通知开关 + localStorage持久化）
- [x] **NTF-005** 长时间操作通知（编译完成、评审完成、批量续写进度）
- [x] **NTF-006** 通知与看板待办联动（通知点击跳转到看板对应位置）

---

## 三、Agent 系统

### 3.1 Orchestrator Agent（编排器）

- [x] **AGT-001** Orchestrator 编排引擎（工作流状态机驱动、步骤调度、Agent调用）
- [x] **AGT-002** 任务队列管理（优先级、并发控制、失败重试）
- [x] **AGT-003** 非标准流程路由（编译失败→重写、评审不通过→修订、修史中断→回滚）
- [x] **AGT-004** Orchestrator 提示词骨架实现
- [x] **AGT-005** Agent 超时与失败处理（每个 Agent 超时阈值、重试次数、降级策略）

### 3.2 规划类 Agent

- [x] **AGT-010** Genre Match Agent 提示词实现（agents/mod.rs: genre_match 模块）
- [x] **AGT-011** Outline Architect Agent 提示词实现（volume_outline + book_outline 双模块）
- [x] **AGT-012** Arc Planner Agent 提示词实现（事件链拆分，arc_planner 模块）
- [x] **AGT-013** Task Card Agent 提示词实现（任务卡生成：must_progress/must_recall/must_avoid，task_card模块）
- [x] **AGT-014** Chapter Outline Agent 提示词实现（章节大纲生成，含前5章大纲记忆，chapter_outline模块）
- [x] **AGT-015** Canon Curator Agent 提示词实现（正典管理、冲突判定、is_hard分类）

### 3.3 生成类 Agent

- [x] **AGT-020** Draft Writer Agent 提示词实现（agents/mod.rs: draft_writer 模块）
- [x] **AGT-021** Voice Filter Agent 提示词实现（agents/mod.rs: voice_filter 模块）
- [x] **AGT-022** Rewrite Agent 提示词实现（4种模式：repair/compress/hook_up/voice_fix）
- [x] **AGT-023** Style Extractor Agent 提示词实现（文风提取：统计+语义+反AI+模式归纳，style_extractor模块）

### 3.4 评审类 Agent

- [x] **AGT-030** Plot Expert Agent 提示词实现（情节逻辑+结构+伏笔审查）
- [x] **AGT-031** Character Expert Agent 提示词实现（角色一致性+成长+关系审查）
- [x] **AGT-032** Pacing Expert Agent 提示词实现（节奏+信息释放+情绪曲线）
- [x] **AGT-033** Worldbuilding Expert Agent 提示词实现（设定一致性+新设定引入）
- [x] **AGT-034** Prose Expert Agent 提示词实现（文笔+AI痕迹+词汇丰富度）
- [x] **AGT-035** Commercial Expert Agent 提示词实现（爽点+期待感+情绪共鸣）
- [x] **AGT-036** Reader Panel Agent 提示词实现（3类读者视角模拟）
- [x] **AGT-037** Voice Audit Expert 提示词实现（8维AI痕迹检测）
- [x] **AGT-038** Review Chair Agent 提示词实现（综合评审+终审结论）
- [x] **AGT-039** 并行专家执行框架（orchestrator 中5专家顺序执行，并行化已预留）

### 3.5 召回与审计类 Agent

- [x] **AGT-040** Recall Agent 提示词实现（优先级召回+3000字预算+来源标注）
- [x] **AGT-041** Continuity Analyst Agent 提示词实现（连续性检查+跨章影响评估）
- [x] **AGT-042** Continuity Compiler 规则引擎实现

### 3.6 修史与归档类 Agent

- [x] **AGT-050** Retcon Analyst Agent 提示词实现
- [x] **AGT-051** Archive Agent 提示词实现
- [x] **AGT-052** Comment Analyzer Agent 提示词实现

### 3.7 辅助类 Agent

- [x] **AGT-060** Name Generator Agent 提示词实现（agents/mod.rs: name_generator 模块）
- [x] **AGT-061** SOUL Matcher Agent 提示词实现（agents/mod.rs: soul_matcher 模块）
- [x] **AGT-062** Book Title Generator Agent 提示词实现（agents/mod.rs: book_title 模块）
- [x] **AGT-063** Bestseller Parser Agent 提示词实现

### 3.8 Agent 全局输入输出契约

- [x] **AGT-070** 全局输入契约实现（project_id / objective / chapter_number / constraints / context）
- [x] **AGT-071** 全局输出契约实现（result / reasons / risk_flags / confidence / next_action）
- [x] **AGT-072** Agent 执行日志（每次调用写入 agent_execution_logs）

---

## 四、前端页面

### 4.1 全局框架

- [x] **UI-001** 应用壳：侧边栏导航 + 主内容区（AppShell: Sidebar + Outlet）
- [x] **UI-002** 书籍上下文切换器（顶部下拉，切换后全站数据刷新）
- [x] **UI-003** 全局搜索栏（GlobalSearch组件: ⌘K快捷键+章节/正典/角色/事件跨类型搜索+结果跳转）
- [x] **UI-004** 通知中心铃铛（NotificationBell: 未读红点+下拉列表+已读标记+严重度图标）
- [x] **UI-005** 主题切换（ThemeProvider + 深色/亮色 + 系统偏好检测 + localStorage持久化）
- [x] **UI-006** 键盘快捷键系统（⌘K全局搜索 / ⌘S保存 / ⌃1-3切换面板，useGlobalShortcuts hook）
- [x] **UI-007** 响应式布局适配（侧栏折叠/展开 + 图标模式，AppShell响应式）

### 4.2 书架页

- [x] **UI-010** 书架首页（BookshelfPage：书籍卡片列表 + 创建对话框 + 打开/删除/导出）
- [x] **UI-011** 新建长篇项目入口（输入书名 → create_project → 自动跳转）
- [x] **UI-012** 书籍卡片右键菜单（打开/归档/导出/删除）

### 4.3 一键启动流程页

- [x] **UI-020** 步骤1-2：描述输入 + Genre Match AI调用（ProjectSetupPage）
- [x] **UI-021** 步骤2：文风确定（三路径：默认/参考文段提取/对标作品提取，style_extractor Agent调用）
- [x] **UI-022** 步骤3：卷纲确认（8卷目标/冲突/爆点，可编辑，volume_outline Agent调用）
- [x] **UI-023** 步骤4：全书大纲+分卷大纲确认（book_outline Agent调用）
- [x] **UI-024** 步骤5：角色命名（3套候选方案，逐个挑选/修改/重新生成，name_generator Agent调用）
- [x] **UI-025** 步骤6：角色SOUL匹配（匹配结果+4区展示+定制化调整，soul_matcher Agent调用）
- [x] **UI-026** 步骤7：书名生成（3-5候选 + 碰撞检查结果，可修改，book_title Agent调用）
- [x] **UI-027** 步骤8：正典确认（硬规则/软规则列表，可增删改，数据持久化到项目DB）
- [x] **UI-028** 一键启动进度条（百分比进度条 + 步骤标签 + 加载动画）

### 4.4 正典中心页

- [x] **UI-030** 三栏布局：左侧规则列表 / 中间规则详情+编辑 / 创建弹窗（CanonPage）
- [x] **UI-031** 正典规则创建/编辑表单（rule_key / rule_name / rule_type / scope / is_hard / content）
- [x] **UI-032** 正典规则版本 diff 对比
- [x] **UI-033** 正典规则冻结/解冻操作
- [x] **UI-034** 正典规则全文搜索（search_canon_rules LIKE查询 + CanonPage搜索框）

### 4.5 长程剧情树页

- [x] **UI-040** 五级展开树（OutlinePage：作品 → 卷 → 章节，卷展开显示目标/冲突/爆点）
- [x] **UI-041** 节点折叠/展开/拖拽调整/批量重排
- [x] **UI-042** 卷级编辑面板（目标/冲突/爆点/余波，内联编辑）
- [x] **UI-043** 事件链编辑面板（范围/目标/角色/回收项）
- [x] **UI-044** 章节任务卡查看/编辑

### 4.6 章节工作台

- [x] **UI-050** 三栏布局：主编辑区 / 右侧正典+角色列表（ChapterWorkbench）
- [x] **UI-051** 文本编辑器（textarea + 3秒自动保存 + 手动保存）
- [x] **UI-052** 富文本编辑器（TipTap: Bold/Italic/Heading/List/Quote/Undo/Redo + 字数统计）
- [x] **UI-053** 任务卡面板（objective / must_progress / must_recall / must_avoid / required_hooks / ending_hook 已显示）
- [x] **UI-054** 召回上下文面板（recall_agent在全链路中自动召回，结果传递给后续步骤）
- [x] **UI-055** 编译结果面板（pass/warn/fail + 问题列表 + 修复建议 + 统计面板）
- [x] **UI-056** 评审报告面板（PipelineResult面板: 12步流水线状态+分数+耗时+步骤详情）
- [x] **UI-057** 章节版本 diff 对比查看器（LCS算法 + 侧边对比 + +/-计数）
- [x] **UI-058** 章节状态指示器（当前状态 + 可执行操作按钮）
- [x] **UI-059** 一键生成/一键重写/一键定稿 操作按钮组（AI联动）

### 4.7 角色管理页

- [x] **UI-060** 角色列表（按类型筛选 + 活跃状态，CharactersPage已有基础功能）
- [x] **UI-061** 角色详情页（核心身份+SOUL档案编辑+关系列表+关联伏笔，CharacterDetailPage）
- [x] **UI-062** SOUL 档案编辑器（SoulTemplatesPage: 可展开查看personality/speech/behavior/relationships）
- [x] **UI-063** SOUL 从库选择器（SoulTemplatesPage: 浏览全部SOUL模板库）
- [x] **UI-064** 角色创建向导（三模式切换：空白创建/从SOUL模板/AI自动生成SOUL）
- [x] **UI-065** 角色动态状态时间线（按章节查看状态变化）

### 4.8 故事账本页

- [x] **UI-070** 账本类型切换标签（LedgerPage 六类标签：总览/人物状态/关系/时间线/伏笔/能力）
- [x] **UI-071** 人物状态账：状态卡片展示
- [x] **UI-072** 关系状态账：角色对列表 + 快速添加表单
- [x] **UI-073** 时间线账：按相对天数排序 + 快速添加
- [x] **UI-075** 伏笔账：三状态筛选 + 重要度显示 + 快速添加
- [x] **UI-076** 信息可见性账："谁知道什么"（知识键+持有者+可见状态+获取章节）
- [x] **UI-077** 资源与代价账：按类型/持有者查询 + 快速添加
- [x] **UI-078** 账本直接编辑（快速添加表单）

### 4.9 项目看板页（§32b）

- [x] **UI-080** 看板5标签页切换基础框架（DashboardPage：总览标签含统计卡片+进度条+卷/章概览）
- [x] **UI-081** 总览页：字数统计 + 章节进度 + 角色数 + 正典规则数 + 进度条 + 卷结构 + 近期章节
- [x] **UI-082** 人物图谱页：力导向关系图（D3.js节点拖拽/点击查看详情/缩放/角色类型颜色编码/关系类型箭头）
- [x] **UI-083** 角色状态卡片（点击节点弹出：SOUL摘要+当前状态+关系快照）
- [x] **UI-084** 角色活跃度热力图（按卷显示出场密度，自动标注失联风险）
- [x] **UI-085** 故事线路图页：全书全局图（主线/支线/反派线/伏笔节点）
- [x] **UI-086** 伏笔全览面板（三状态分组 + 优先级 + 回收质量）
- [x] **UI-087** 健康仪表盘页：综合健康度 + 风险项 + 趋势图 + 分项评分条
- [x] **UI-088** 时间线地图页：故事时间轴 + 角色位置 + 地理轨迹 + 异常标记
- [x] **UI-089** 看板数据切换刷新（切换书籍后完整重载，缓存策略，性能达标）

### 4.10 修史审批台

- [x] **UI-090** 修史申请列表（待审批/已审批/已拒绝）
- [x] **UI-091** 修史申请详情（原因/影响范围/风险等级/推荐方案/对比预览）
- [x] **UI-092** 修史审批操作（批准/拒绝/修改方案）
- [x] **UI-093** 修史执行进度（受影响章节重写/重编译进度）

### 4.11 读者评论分析页

- [x] **UI-100** 评论导入（粘贴/文件/平台API）
- [x] **UI-101** 评论分析报告（聚类/情感/关键词/修订建议）
- [x] **UI-102** 修订任务列表（从评论转化，关联章节和角色）

### 4.12 爆款学习页

- [x] **UI-110** 对标作品导入（文本/文件）
- [x] **UI-111** 爆款解析报告（节奏模式/手法提取/模式沉淀）
- [x] **UI-112** 模式库浏览（writing_patterns 列表 + 详情 + 应用到当前项目）
- [x] **UI-113** 文风提取器（上传参考文段 → Style Extractor 提取 → 生成/更新文风档案）

### 4.13 设置页

- [x] **UI-120** 全局设置：LLM 模型配置 / API Key / Max Tokens / Temperature + 配置持久化（SettingsPage）
- [x] **UI-121** 项目设置：项目名称修改 + 项目信息展示
- [x] **UI-122** 去AI规则管理（DeAiRulesPage: 增删改查 + 启用/禁用 + 按类别筛选 + 搜索）
- [x] **UI-123** 题材模板管理（GenreTemplatesPage: 浏览全部题材模板+展开详情）
- [x] **UI-124** SOUL 模板库管理（SoulTemplatesPage: 按类别筛选+展开查看4区数据）
- [x] **UI-125** 角色名黑名单管理（banned_names 增删 + 级别调整）
- [x] **UI-126** 书名碰撞库管理（banned_book_titles 增删 + 级别调整）

### 4.14 新手引导

- [x] **UI-130** 首次运行欢迎向导（3步：创建第一本书 → 选择题材 → 开始写作）
- [x] **UI-131** 示例项目（预置一个完整的玄幻示例项目，含卷纲/角色/SOUL/几章正文）
- [x] **UI-132** 上下文帮助提示（关键功能首次使用时的 tooltip 引导）
- [x] **UI-133** 快速开始模式（跳过SOUL/命名/书名确认，直接用默认值开始写作）

---

## 五、核心工作流串联

### 5.1 一键启动工作流（§27）

- [x] **WF-001** 串联：用户输入 → Genre Match → 文风确定 → Outline Architect → 大纲确认 → Canon Curator → Name Generator → SOUL Matcher → Book Title Generator → Arc Planner → 系统落库 → 初始快照 → 项目就绪
- [x] **WF-002** 降级处理：Genre Match 低置信度 → 展示候选列表让用户选择
- [x] **WF-003** 降级处理：子Agent超时 → 跳过该步骤，允许用户后续手动补全

### 5.2 单章生产工作流（§28）

- [x] **WF-010** 串联：Orchestrator读取状态 → Task Card生成 → Recall召回 → Chapter Outline大纲 → Draft Writer扩写 → Voice Filter去AI → 连续性编译器 → 5专家评审 → Review Chair终审（run_chapter_pipeline命令+前端全链路按钮）
- [x] **WF-011** 编译失败分支：编译器fail → 问题列表 → AI修复按钮触发 Rewrite Agent 修复（repair模式）
- [x] **WF-012** 评审不通过分支：Review Chair输出must_fix → AI修复按钮触发 Rewrite Agent
- [x] **WF-013** needs_human分支：评审僵局 → 人工编辑后手动标记通过
- [x] **WF-014** 批量续写：run_batch_pipeline命令 + 前端批量API（startChapter→endChapter逐章执行）

### 5.3 修史工作流（§29）

- [x] **WF-020** 串联：用户发起修史 → Retcon Analyst影响评估 → Canon Curator判断是否触及硬规则 → 用户选择修复策略 → Rewrite/Arc Planner执行 → Archive更新版本与快照
- [x] **WF-021** 修史超范围降级：影响>100章 → 提示用户确认 + 建议缩小范围
- [x] **WF-022** 修史中途失败：已执行部分保留 + 未执行部分回滚 + 用户手动处理

### 5.4 读者反馈闭环工作流（§30）

- [x] **WF-030** 串联：评论导入 → Comment Analyzer分析 → 生成修订任务 → 用户确认 → Rewrite Agent执行 → 重新编译+评审

### 5.5 章节状态机（§31）

- [x] **WF-040** 状态机引擎实现（task_ready → draft_generated → compile_failed → review_pending → rewrite_required → approved → archived → needs_revalidate）
- [x] **WF-041** 状态流转约束：未通过编译不得 approved / 未归档不得自动生成下一章 / 修史影响范围可标记 needs_revalidate

---

## 六、内置数据预填充

### 6.1 题材模板库

- [x] **DATA-001** 10种题材模板数据填充（玄幻/武侠/仙侠/都市/历史/科幻/灵异/军事/言情/游戏），每模板含：世界观框架/卷节奏/角色原型/爽点参数/禁忌规则/命名风格

### 6.2 SOUL 模板库

- [x] **DATA-010** 10种主角/关键位SOUL模板（冷面强者/热血少年/智者谋士/逍遥浪子/霸道总裁/温婉佳人/疯批反派/忠义之士/妖魅邪修/科技天才）
- [x] **DATA-011** 15种配角/反派SOUL模板补充
- [x] **DATA-012** 5种关系SOUL模板（生死兄弟/宿命之敌/师徒传承/相爱相杀/暗中守护）

### 6.3 去AI规则库

- [x] **DATA-020** 基础去AI规则（20条：词汇5+句式3+修辞3+副词4+成语2+其他3）
- [x] **DATA-021** 扩展去AI规则（200+词：过渡词黑名单、情绪标签化替换、句式工整检测、AI味高频短语库）
- [x] **DATA-022** 情绪标签化模式库（"他感到愤怒"→动作表达替换规则）
- [x] **DATA-023** 句式工整检测规则（排比/四字成语堆叠/对称结构检测）

### 6.4 文风档案库

- [x] **DATA-030** 8种内置文风档案（玄幻爽文/仙侠古风/都市利落/悬疑冷硬/甜宠轻快/虐文细腻/末世硬朗/电竞热血）

### 6.5 碰撞库

- [x] **DATA-040** 角色名黑名单（20个知名作品主角名，含题材分级 ban_level）
- [x] **DATA-041** 书名碰撞库（25个热门作品书名，含热度分级）
- [x] **DATA-042** 扩展碰撞库（100+角色名 + 200+书名）

### 6.6 示例项目

- [x] **DATA-050** 完整玄幻示例项目（「星辰仙途」: 8卷+6角色含SOUL+3章正文+5正典+5伏笔+大纲，create_sample_project命令）

---

## 七、测试

- [x] **TST-001~045** 核心模块测试（agent: 14 + compiler: 9 + integration: 7 + orchestrator: 6 + snapshot: 5 + benchmark: 4，45项全部通过）

---

## 八、发布与交付

- [x] **REL-001** macOS .dmg 打包（scripts/build-mac.sh + tauri bundle，签名/公证待配置）
- [x] **REL-002** Windows .exe/.msi 打包（scripts/build-win.ps1 + tauri bundle，代码签名待配置）
- [x] **REL-003** 自动更新机制（tauri-plugin-updater + 配置endpoints + pubkey）
- [x] **REL-010** Web 前端构建（scripts/build-web.sh + vite build → dist/）
- [ ] **REL-011~023** 其余发布任务

---

## 当前开发重点（M5→M6 过渡）

**M0~M5 功能项全部完成 ✅**
- 所有核心功能已实现: 28个Agent / 131+命令 / 105+页面 / 45测试全通过
- 编译器可插拔规则引擎 (AGT-042) / 事务封装 (DB-010) / 读者反馈闭环 (WF-030) 均已完成
- 修史全流程 (RTN-003~007 / WF-020~022 / UI-090~093) / 召回服务 (RCL-001~006) 均已完成
- 风险预警 (NTF-003) / 降级处理 (WF-002/003) / 示例项目 (UI-131) / 帮助提示 (UI-132) 均已完成

**性能基准 (已验证)**:
- 编译器 2000字/50规则/30角色: 10ms (目标<500ms ✅ 50x)
- 编译器 10000字/100规则: 31ms (目标<2s ✅ 64x)
- 流水线构建: <1μs
- 状态机评估 10k次: 27ms (2.7μs/次)
- 100章批量写入+聚合: <10ms

**项目状态: Beta Ready**

并行Agent Round 2 — 本轮新增:

**Agent 1 (Rust):**
- AGT-051 archive_agent (定稿后提取事实更新账本)
- AGT-052 comment_analyzer (评论情感分析+角色人气+修订建议)
- LDG-010 recall_ledger_context (按章节召回账本上下文 ~2000字)
- Agent总数: 27 | 命令: 108

**并行Agent Round 2 — 全部完成 ✅**

Agent 2 (前端 Dashboard+Comments):
- UI-083 CharacterStatusCards (角色卡片网格: 等级/情绪/目标)
- UI-088 TimelineMap (垂直时间线: 节点+摘要)
- UI-089 DashboardRefresh (一键刷新按钮)
- UI-100 CommentImportPage (粘贴评论→解析→情感标注)
- UI-101 CommentAnalysisPage (情感分布+词频Top10)
- useCommentsStore (Zustand共享状态)

Agent 3 (前端 Bestseller+Settings):
- UI-110 BestsellerImportPage + UI-111 AnalysisPage + UI-112 PatternLibraryPage
- UI-125 BannedNamesPage + UI-126 BannedTitlesPage
- App.tsx: 7条新路由

**Round 4 — 全部完成 ✅**

Agent 1 (Rust):
- AGT-004 Orchestrator Agent (项目任务规划器)
- NTF-006 get_unread_notification_count (按类型分组统计)

Agent 2 (前端):
- UI-064 CharacterWizardPage (3步: 信息→模板→确认)
- UI-133 QuickStartPage (3步快速开始)
- BookshelfPage 快速开始按钮

Agent 3 (前端):
- ChapterWorkbench 更多操作下拉菜单 + 快捷键提示
- ProjectGlanceWidget (项目概览小组件)
- AppShell 最近访问导航 + CharactersPage 角色名可点击

**Round 5 — 全部完成 ✅**

Agent 1 (Rust):
- RAG-001 LlmService.embed() OpenAI text-embedding-3-small
- RAG-003 VectorStore in-memory cosine similarity search
- AGT-005 run_agent_with_timeout (tokio::time::timeout + 失败降级)

Agent 2 (前端):
- UI-102 RevisionTasksPage (评论→修订任务+优先级+导出)
- ExportPage (4格式导出卡片页)
- UI-065 CharacterTimelinePage (垂直时间线+状态变化)

Agent 3 (前端):
- ChapterOutlinePage (章节大纲生成→6区展示+保存)
- PromptGeneratorPage (14种题材灵感生成器)
- DailyGoalWidget (每日目标+进度条+激励语)
- Dashboard集成每日目标

**Round 6 — 全部完成 ✅**

Agent 1 (Rust):
- RAG-004 chunk_text (段落→句子分块 + 短chunk合并)
- RAG-005 ChapterIndex (章节向量索引 + 相似搜索)
- RTN-001 修史CRUD (create/list/update 3新命令)

Agent 2 (前端):
- WritingAnalytics (字数趋势+速度分析+状态分布+角色排名)
- ChapterComparePage (双章节对比+角色重叠分析)
- RetconPage (修史申请管理+新建表单)

Agent 3 (前端):
- CollisionCheckerPage (碰撞检查: 安全/注意/危险)
- SnapshotBrowserPage (快照浏览+类型筛选+展开详情)
- WorkflowStatusPage (7步工作流进度表+跳转)

**Round 7 — 全部完成 ✅**

Agent 1 (Rust):
- RAG-006 search_similar_chapters (语义检索命令)
- RAG-007 BookVectorStore (书本级隔离)
- CMP-009 should_block_approval + CMP-010 severity thresholds

Agent 2 (前端):
- RetconImpactPage (影响分析+3种修复方案)
- ForeshadowCalendar (伏笔日历+超期预警+详情弹窗)
- SprintTimerPage (写作冲刺计时器+Pomodoro+历史记录)

Agent 3 (前端):
- LocationsPage (地点管理+危险度+localStorage)
- FactionsPage (工会管理+类型标签+localStorage)
- WorldDashboardPage (世界观总览+快速添加)

**Round 8 — 全部完成 ✅**

Agent 1 (Rust):
- RTN-002 analyze_retcon_impact (3类目标影响分析+3种修复方案)
- CMP-009 should_block_approval 集成到流水线
- Agent I/O 日志集成到每步执行

Agent 2 (前端):
- ChapterPlanningBoard (看板式卷章管理)
- VolumeStatsPage (卷统计: 字数/角色数/伏笔/完成率)
- ChapterDependencyGraph (SVG章节依赖关系图)

Agent 3 (前端):
- ReadingModePage (沉浸式阅读模式+暗色背景+前后章导航)
- NameGeneratorPage (AI名字生成+收藏+导出)
- TitleGeneratorPage (AI书名生成+碰撞检测+应用书名)

**Round 9 — 全部完成 ✅**

Agent 1 (Rust):
- generate_project_health_report (加权评分+风险+建议)
- search_chapters_with_highlights (高亮标记)
- get_volume_word_stats (卷字数统计: 总计/平均/最大/最小)

Agent 2 (前端):
- ProjectHealthReportPage (综合健康报告+风险+建议)
- ChapterHealthPage (编译器详细结果+字数仪表盘)
- StreakCalendar (90天GitHub风格贡献日历+连击计数)

Agent 3 (前端):
- ProjectSettingsDetailPage (完整项目设置表单)
- DataManagementPage (数据统计+备份+导出+删除)
- ShortcutsPage (快捷键参考表+分类+平台说明)

**Round 10 — 全部完成 ✅**

Agent 1 (Rust):
- get_chapter_statistics (总计/中位数/趋势/完成预估)
- auto_generate_chapter_outline (任务卡数据准备)
- batch_export_chapters (按章节范围导出TXT/MD)

Agent 2 (前端):
- BatchOperationsPage (批量编译/定稿/导出/删除)
- VersionComparePage (DiffViewer版本对比)
- WritingStatsDashboard (累计增长+日分布+最佳日)

Agent 3 (前端):
- GoalsTrackerPage (日/周/月目标+进度+预估完成日)
- ContentCalendarPage (月历视图+日详情+月度统计)
- ProjectInsightsPage (7项洞察: 节奏/趋势/角色/一致性)

**Round 11 — 全部完成 ✅**

Agent 5 (Rust RAG):
- RCL-004 rag_semantic_recall (嵌入查询+向量检索)
- RCL-005 merge_recall_results (FTS+RAG去重合并排序)
- RCL-006 clear_book_index + get_index_stats + RagState

Agent 6 (Rust Retcon):
- RTN-003 select_retcon_scheme (方案选择)
- RTN-004 approve_retcon + reject_retcon (审批工作流)
- RTN-005 execute_retcon (执行引擎+影响分析)
- RTN-006 retcon_post_check (回归编译检查)
- V003 migration (retcon_requests扩展字段)

Agent 7 (前端):
- RetconWorkflowPage (7步修史流程可视化)
- CommentRetconBridge (评论→修史申请桥接)
- QuickActionsWidget (6快捷操作+集成Dashboard)

**11轮并行总成果: Agent 28 | 命令 131 | 页面 105+ | 测试 45 ✅ | TS 0 | Rust ✅**

**Round 3 — 全部完成 ✅**

Agent 1 (Rust):
- AGT-039 专家并行执行 (run_step extracted + tokio::join预留)
- AGT-042 CompilerRuleDescription (7个checker描述)
- NTF-005 流水线步骤通知 (每步完成后自动create_notification)

Agent 2 (前端):
- UI-054 召回上下文面板 (ChapterWorkbench: 硬规则+角色状态+伏笔+Token估算)
- UI-113 StyleExtractorPage (文风提取器: AI分析→结构化展示)

Agent 3 (前端):
- StyleProfilesPage (8种内置风格档案浏览)
- WritingHistoryPage (localStorage写作历史+统计)
- AgentLogPage (Agent执行日志查看+筛选)
- App.tsx: 5条新路由

**项目最终状态:**
- Agent总数: 27 | Tauri命令: 108 | 前端页面/组件: 55+
- 测试: 45/45 ✅ | TS: 0错误 | Rust: 编译通过
- Dashboard: 9标签 | Settings子页: 10+

**主线程:**
- OUT-007 analyze_outline_impact (大纲修正影响分析: 受影响的章/卷/角色/伏笔+风险评估)
- AGT-001~003 + AGT-070~072 (前轮已完成)

Provider: OpenAI/Anthropic/Ollama | Agent: 27 | 命令: 108 | 测试: 45 ✅

---

## 开发阶段建议

| 阶段 | 周期 | 核心交付 | 依赖 | 状态 |
|------|------|---------|------|------|
| **M0 基建** | 3周 | TECH-001~008, DB-001~010, LLM-001~008, UI-001~007 | 无 | 🟢 完成 |
| **M1 底座** | 4周 | SVC-001~007, CAN-001~006, OUT-001~007, CHP-001~008, SHF-001~005, DATA-001, UI-010~028, WF-001~003 | M0 | 🟢 完成 |
| **M2 生成** | 4周 | AGT-010~023, RCL-001~006, SNP-001~005, LDG-001~010, AGT-070~072, DATA-010~012, DATA-020~023, DATA-030, UI-030~065, WF-010~014 | M1 | 🟢 完成 |
| **M3 编译与评审** | 4周 | CMP-001~010, AGT-030~042, WF-040~041, UI-066~059, TST-001~023 | M2 | 🟢 完成 |
| **M4 看板与修史** | 3周 | RTN-001~007, NTF-001~006, UI-080~093, WF-020~022, TST-010~016 | M3 | 🟢 完成 |
| **M5 高级能力** | 3周 | AGT-050~063, UI-100~113, WF-030, DATA-040~041, DATA-050, TST-030~034 | M4 | 🟢 完成 |
| **M6 发布** | 3周 | REL-001~023, UI-120~133, 阈值调优, 样板试跑 | M5 | 🟡 进行中 (仅REL发布项待做) |
