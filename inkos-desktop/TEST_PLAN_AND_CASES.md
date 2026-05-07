# Inkos Studio (Tauri+Rust) 已实现功能验证清单与测试用例

本文档记录了基于《Inkos系统深度优化与详细设计文档》在 `inkos-desktop` 项目中**已真实落地**的核心架构与交互功能的测试计划。由于这是一款涉及复杂 GUI 和本地 SQLite/大模型的桌面端软件，测试用例主要分为“后端核心逻辑自动化测试”和“前端 GUI 交互测试”。

## 一、 已实现功能清单 (Feature Checklist)

### 1. 核心架构与状态机 (Core Architecture & State Machine)
- [x] **Tauri + Rust + React 极轻量底座**：彻底抛弃 Electron 和 Node.js，前端体积 < 5MB，启动毫秒级。
- [x] **SQLite 本地状态机初始化**：自动创建 `temporal_states` (时序状态), `character_bibles` (人设圣经), `pending_hooks` (待回收伏笔债务) 和 `app_config` (系统配置) 表。
- [x] **时序掩码查询 (Temporal Masking)**：通过 SQL `valid_from_chapter` 和 `valid_to_chapter` 过滤，确保当前章节只能查询到有效存活的角色和物品。
- [x] **主动债务追踪 (Active Debt Tracker)**：自动查询 `staleness >= 3` 且未回收的伏笔债务。

### 2. AI 智能管线与大模型通信 (AI Pipeline & LLM)
- [x] **真实的 LLM HTTP 客户端**：使用 Rust `reqwest` 封装了支持自定义 Base URL、模型名称和 API Key 的异步请求引擎。
- [x] **意图驱动 RAG 上下文组装 (Intent-Driven RAG)**：能够自动提取出场角色，拼接角色的核心底线、口头禅，并强行注入视角盲区（Forbidden Knowledge）。
- [x] **多专家并发会诊 (Multi-Expert Auditing)**：利用 Rust `tokio::spawn` 实现了逻辑专家、人设专家和文笔专家的**真·多线程异步并发**请求。
- [x] **高阶文笔约束 (Show, Don't Tell)**：在文笔审查前，通过 Rust 代码硬性拦截“似乎”、“感到”等平铺直叙词汇。

### 3. 沉浸式创作 GUI (Immersive Studio UI)
- [x] **三栏式响应布局**：左侧导航与资产、中栏沉浸编辑器、右侧智能伴写面板。
- [x] **Zen Mode (禅模式)**：一键隐藏左右侧栏，全屏专注文本。
- [x] **全局指令面板 (Command Palette)**：支持 `Cmd+K` 唤出，全键盘操作新建与跳转。
- [x] **伴随式隐形 AI (Invisible Co-pilot)**：划选文本后自动在下方弹出“AI 伴写悬浮菜单”（强化感官、修复病句等），摒弃死板 Chat 框。
- [x] **故事看板 (Plot Board)**：多维时间线可视化，清晰展示章节卡片与“红线伏笔预警”。
- [x] **世界观百科 (World Bible)**：分类展示角色卡片，直观显示时序状态机对已死亡角色的“RAG 索引冻结”拦截提示。
- [x] **大模型配置中心 (Settings Modal)**：支持在 GUI 填写 API Key，并通过 Tauri IPC 持久化到本地 SQLite。

---

## 二、 后端核心逻辑自动化测试用例 (Rust Unit Tests)

我们将在 Rust 的 `db.rs` 和 `rag.rs` 中编写单元测试（`#[test]`），自动化验证以下核心防幻觉和并发逻辑：

### TestCase 1: 测试时序状态机拦截 (Test Temporal Masking)
- **前提**：在内存 SQLite 数据库中插入一个在第 1 章获得，在第 2 章丢失（`valid_to_chapter = 2`）的物品。
- **动作**：传入 `current_chapter = 3`，调用 RAG 上下文构建。
- **期望结果**：上下文中**绝对不包含**该物品的状态，证明时序掩码拦截成功。

### TestCase 2: 测试意图驱动的人设提取与视角盲区 (Test POV Filter)
- **前提**：在数据库中插入角色“楚风”，并配置 `forbidden_knowledge = "他不知道黑衣人的身份"`。
- **动作**：传入包含“楚风”的大纲，生成 RAG 上下文。
- **期望结果**：上下文中必须包含字符串 `"⚠️ 视角拦截"` 和 `"他不知道黑衣人的身份"`。

### TestCase 3: 测试主动债务预警查询 (Test Active Debt Query)
- **前提**：插入一条 `staleness = 4`, `is_resolved = false` 的伏笔，和一条 `staleness = 1` 的伏笔。
- **动作**：调用 `get_active_hooks`。
- **期望结果**：返回的列表中仅包含滞后 4 章的伏笔，并且带有“滞后 4 章”的警告字样。

### TestCase 4: 测试高阶文笔拦截规则 (Test Prose Constraints)
- **前提**：传入包含词汇“似乎”、“感到”的句子。
- **动作**：调用 `check_show_dont_tell` 纯函数。
- **期望结果**：返回的拦截警告数组长度 > 0，且包含对“似乎”的指正。

---

## 三、 自动化测试执行脚本

以下脚本将自动在 `src-tauri` 目录下运行 `cargo test` 以执行上述测试用例。
