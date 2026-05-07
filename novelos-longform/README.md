# NovelOS Longform

AI 驱动的长篇小说创作系统。多 Agent 协作流水线 + 连贯性编译器 + 故事账本 + RAG 检索，覆盖从选题到定稿的全流程。基于 Tauri 2.x + React + Rust + SQLite，支持 macOS / Windows 桌面端与浏览器端部署。

## 核心特性

- **书架管理** — 多项目并行，每个小说独立数据库，TXT / MD / DOCX / EPUB 全格式导出
- **一键启动** — 8 步向导：描述 → 题材匹配 → 文风 → 卷纲 → 大纲 → 命名 → SOUL → 书名，每步可 AI 生成或手动编辑
- **12 步章节流水线** — 任务卡 → 召回 → 大纲 → 起草 → 去AI审校 → 连贯性编译 → 5 专家并行评审 → 评审主席裁决，失败自动路由（重写 / 人工介入）
- **连贯性编译器** — 8 个可插拔检查器（正典 / 角色 / 时间线 / 战力 / 视角泄漏 / 伏笔 / 字数 / 文笔），0–100 评分，编译不通过禁止定稿
- **故事账本** — 8 类账目（角色状态、关系、时间线、事件、伏笔、知识可见性、能力、摘要），章节定稿后增量更新
- **Retcon 工作流** — 逆行修正：影响分析 → 3 种修复策略 → 审批 → 执行 → 重编译 → 快照更新
- **28 个 AI Agent** — 覆盖规划、生成、审校、召回、修正全链路
- **RAG 引擎** — 段落级分块 + 内存向量库（余弦相似度）+ FTS5 全文检索，混合召回去重合并
- **SOUL 角色系统** — 四维人格画像（性格 / 语言 / 行为 / 人际），25+ 内置模板库
- **去AI化审校** — 200+ 反AI规则覆盖词汇、句式、修辞、副词、成语、情感标注
- **跨平台** — 同一套 React 前端同时支持 Tauri 桌面端和浏览器端（sql.js WASM SQLite + IndexedDB）

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│  React 19 + TypeScript 6 + TailwindCSS 4                       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │ 书架  │ │ 正典  │ │ 剧情树│ │ 章节台│ │ 账本  │ │ 看板  │       │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘       │
│  Zustand stores │ Platform facade (Tauri / Web) │ TipTap 编辑器 │
├─────────────────────── Tauri IPC / Web API ─────────────────────┤
│  Rust Backend                                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ Orchestrator│ │  28 Agents │ │  Compiler  │ │    RAG     │  │
│  │ 12步流水线  │ │ Prompt模板 │ │ 8检查器    │ │ 向量+全文  │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐                 │
│  │  LLM 层    │ │ SQLite DB  │ │  Export    │                 │
│  │ OpenAI/    │ │ 双库隔离   │ │ TXT MD     │                 │
│  │ Anthropic/ │ │ global.db  │ │ DOCX EPUB  │                 │
│  │ Ollama     │ │ book.db    │ │            │                 │
│  └────────────┘ └────────────┘ └────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

## 章节生产流水线

```
任务卡 ──→ 召回(RAG+FTS) ──→ 章节大纲 ──→ 起草(2000-4000字)
                                              │
                                         去AI审校(Voice Filter)
                                              │
                                    ┌── 连贯性编译(8检查器) ──→ 通过 ──┐
                                    │         │                        │
                                    │     编译失败                   编译通过
                                    │         │                        │
                                    │    重写Agent(修复)          5专家并行评审
                                    │         │                   (剧情/角色/节奏/
                                    │    重新编译                  世界观/文笔)
                                    │                                   │
                                    │                           ┌── 通过 → 评审主席 → 定稿
                                    │                           ├── must_fix → 重写Agent
                                    │                           └── 死锁 → needs_human
```

## 项目结构

```
novelos-longform/
├── novelos-app/
│   ├── src/                        # React 前端
│   │   ├── App.tsx                 # 路由 (70+ 路由)
│   │   ├── components/             # UI 组件
│   │   │   ├── bookshelf/          # 书架页
│   │   │   ├── canon/              # 正典中心
│   │   │   ├── chapter/            # 章节工作台 (TipTap + AI + 编译器 + 版本)
│   │   │   ├── character/          # 角色管理 + SOUL
│   │   │   ├── common/             # 通用组件
│   │   │   ├── dashboard/          # 看板 + D3关系图
│   │   │   ├── layout/             # AppShell / 侧边栏
│   │   │   ├── ledger/             # 故事账本
│   │   │   ├── outline/            # 剧情树 (5级展开)
│   │   │   ├── project/            # 一键启动向导
│   │   │   ├── retcon/             # 逆行修正
│   │   │   └── settings/           # 设置页 (LLM / 主题 / 快捷键)
│   │   ├── hooks/                  # 自定义 Hooks (快捷键 / 写作统计)
│   │   ├── lib/                    # API 层
│   │   │   ├── api.ts              # 平台门面 (Tauri / Web 自动切换)
│   │   │   ├── tauri.ts            # Tauri invoke 封装 (131+ 命令)
│   │   │   ├── web-api.ts          # 浏览器端全量 API (sql.js + IndexedDB)
│   │   │   ├── web-db.ts           # Web 端数据库层
│   │   │   └── platform.ts         # 平台检测
│   │   ├── stores/                 # Zustand 状态 (9 个 Store)
│   │   ├── types/                  # TypeScript 类型
│   │   └── styles/                 # TailwindCSS
│   └── src-tauri/                  # Rust 后端
│       ├── src/
│       │   ├── lib.rs              # 131+ Tauri 命令注册 + 状态初始化
│       │   ├── orchestrator.rs     # 流水线构建 + 任务队列 + 失败路由
│       │   ├── agent_io.rs         # Agent 输入/输出契约
│       │   ├── rag.rs              # RAG引擎 (分块/向量库/章节索引)
│       │   ├── agents/mod.rs       # 28 个 Agent 提示词模板 (1187行)
│       │   ├── commands/           # 25 个 IPC 命令模块
│       │   ├── compiler/           # 连贯性编译器 (8 检查器 + CompilePass trait)
│       │   ├── db/                 # SQLite + refinery 迁移 + 仓库 + 事务
│       │   │   ├── migrations_global/   # 全局库迁移 (V001-V006)
│       │   │   └── migrations_project/  # 项目库迁移 (V001-V003)
│       │   ├── llm/                # LLM 抽象层 (OpenAI / Anthropic / Ollama)
│       │   └── services/           # 服务层
│       └── tests/                  # 6 个测试文件 (45 用例)
├── scripts/                        # 构建脚本
│   ├── build-web.sh                # Web 静态构建
│   ├── build-mac.sh                # macOS .dmg
│   └── build-win.ps1               # Windows .msi / .nsis
└── .github/workflows/ci.yml        # CI: lint + typecheck + 3平台构建
```

## 技术栈

| 层 | 技术 | 版本 |
|----|------|------|
| 桌面壳 | Tauri | 2.11 |
| 前端 | React + TypeScript | 19 / 6 |
| 样式 | TailwindCSS | 4 |
| 富文本 | TipTap (ProseMirror) | 3 |
| 关系图 | D3.js | — |
| 状态管理 | Zustand | 5 |
| 路由 | React Router | 7 |
| 后端 | Rust | — |
| 数据库 | SQLite (rusqlite + refinery) | 0.31 / 0.8 |
| LLM | OpenAI / Anthropic / Ollama 兼容 | — |
| 向量检索 | 内存余弦相似度 + OpenAI Embedding | — |
| 导出 | TXT / MD / DOCX (docx-rs) / EPUB (zip) | — |
| Web 端 | sql.js (WASM SQLite) + IndexedDB | 1.14 |

## 快速开始

### 环境要求

| 依赖 | 最低版本 |
|------|---------|
| Node.js | 22+ |
| Rust | 1.77.2+ |
| Tauri CLI | 2.x |

### 安装与开发

```bash
# 克隆项目
git clone <repo-url> novelos-longform && cd novelos-longform/novelos-app

# 安装前端依赖
npm install

# 开发模式 (热更新)
npm run tauri:dev
```

### 构建

```bash
# 当前平台
npm run tauri:build

# macOS .dmg
./scripts/build-mac.sh

# Windows .msi / .nsis
.\scripts\build-win.ps1

# Web 静态文件
./scripts/build-web.sh
```

### 创建示例项目

启动后在书架页点击「示例项目」，自动生成一部完整的玄幻小说演示数据（8 卷、6 角色 + SOUL、3 章节、5 正典规则、5 伏笔）。

## LLM 配置

在 **设置 → LLM 配置** 中设置：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Provider | OpenAI | 支持 OpenAI / Anthropic / Ollama |
| Base URL | `https://api.openai.com/v1` | 可改为兼容 API（如 DeepSeek、通义千问） |
| API Key | — | 对应服务的密钥 |
| Model | `gpt-4o` | 可改为任意兼容模型 |
| Max Tokens / Temperature | 默认值 | 按需调整 |

配置持久化到全局数据库，重启自动加载。

## 28 个 AI Agent

| 阶段 | Agent | 功能 |
|------|-------|------|
| **规划** | Genre Match | 根据描述匹配题材 |
| | Name Generator | 生成角色名（含碰撞检查） |
| | SOUL Matcher | 匹配+定制角色四维人格 |
| | Book Title | 生成书名（含碰撞检查） |
| | Style Extractor | 提取参考作品文风特征 |
| | Task Card | 生成章节任务卡（目标/必须推进/必须召回/必须避免） |
| | Chapter Outline | 生成章节详细大纲 |
| | Arc Planner | 篇章级弧线规划 |
| **生成** | Draft Writer | 根据任务卡撰写章节 (2000-4000 字) |
| | Voice Filter | 去AI化审校 (200+ 反AI规则) |
| | Rewrite Agent | 修复模式 / 重写模式 |
| | Book Outline | 生成全书 + 卷级大纲 |
| **审校** | Expert: Plot | 剧情评审 |
| | Expert: Character | 角色评审 |
| | Expert: Pacing | 节奏评审 |
| | Expert: Worldbuilding | 世界观评审 |
| | Expert: Prose | 文笔评审 |
| | Review Chair | 综合五专家报告，给出最终裁决 |
| | Canon Curator | 正典规则维护 |
| **召回** | Recall Agent | 优先级排序上下文组装 (任务卡→硬规则→角色状态→快照→伏笔/事件，8000 token 预算) |
| | Continuity Analyst | 连贯性分析 |
| **修正** | Retcon Analyst | 逆行修正影响分析 |
| | Comment Analyzer | 读者评论分析 |
| **辅助** | Archive Agent | 章节定稿后更新故事账本 |
| | Orchestrator Agent | 流水线调度决策 |
| | Snapshot Agent | 快照管理 |
| | Timeline Agent | 时间线维护 |

## 连贯性编译器

8 个可插拔检查器，实现 `CompilePass` trait，返回 `Vec<CompileIssue>` (severity: error / warning)：

| 检查器 | 检查内容 |
|--------|---------|
| CanonChecker | 草稿 vs 硬/软规则，禁用内容检测 |
| CharacterChecker | SOUL 数据完整性，引用校验 |
| TimelineChecker | 关键词匹配 + 事件覆盖 |
| PowerChecker | 战力突变检测 (关键词) |
| VisibilityChecker | 信息泄漏（角色知晓不应知晓的秘密） |
| ForeshadowChecker | 伏笔超期 (>30 章未回收) |
| WordCountChecker | 草稿字数 vs 目标范围 |
| ProseChecker | 文笔质量指标 |

评分: `100 - (errors × 20) - (warnings × 5)`，编译不通过禁止定稿。

## 数据库架构

双库隔离设计，每个项目独立数据库文件：

```
~/.novelos/
├── global/
│   └── global.db          # 全局库: 书架、题材模板、SOUL模板、去AI规则、禁用名/书名
└── books/
    └── {project_id}/
        └── book.db        # 项目库: 40+ 表 (正典、角色、卷、章节、事件、伏笔、编译报告、retcon...)
```

- 全局库 10 表 + 种子数据 (10 题材模板、25 SOUL 模板、200+ 去AI规则、100+ 禁用名、200+ 禁用书名)
- 项目库 40+ 表 + 4 个 FTS5 全文索引 + 20+ 索引
- refinery 自动迁移，启动时检测并执行

## 章节状态机

```
task_ready → draft_generated → compile_failed → review_pending
                                                      │
                                    ┌─────────────────┤
                                    │                 │
                              rewrite_required    approved → archived
                                    │                 │
                                    └──→ needs_human  needs_revalidate
```

- 编译不通过 → 禁止定稿
- 上一章未归档 → 禁止自动生成下一章
- Retcon 影响章节 → needs_revalidate → 重编译

## 测试

```bash
cd novelos-app/src-tauri
cargo test
# 45 tests: agent + compiler + integration + orchestrator + snapshot + benchmark
```

## 开发指南

### 添加 Tauri 命令

1. `src-tauri/src/commands/` 对应模块添加 `#[tauri::command]` 函数
2. `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册
3. `src/lib/tauri.ts` 添加 TypeScript 封装
4. `src/stores/` 添加 Zustand store 方法

### 添加数据库迁移

1. 在 `migrations_global/` 或 `migrations_project/` 中添加 SQL 文件
2. 文件名格式: `V{NNN}__描述.sql`，编号递增
3. refinery 下次启动自动执行

### 添加编译器检查器

1. 实现 `CompilePass` trait
2. 在 `compiler/mod.rs` 中注册到检查器列表

## 内置数据

| 数据 | 数量 | 说明 |
|------|------|------|
| 题材模板 | 10 种 | 玄幻 / 武侠 / 仙侠 / 都市 / 历史 / 科幻 / 灵异 / 军事 / 言情 / 游戏 |
| SOUL 模板 | 25+ 种 | 冷面强者 / 热血少年 / 智者谋士 / 逍遥浪子 / 霸道总裁 等 |
| 去AI规则 | 200+ 条 | 词汇 / 句式 / 修辞 / 副词 / 成语 / 情感标注 |
| 禁用角色名 | 100+ 个 | 知名作品主角名（硬禁 / 软警告） |
| 禁用书名 | 200+ 个 | 热门作品名（碰撞检查库） |

## 性能

- 编译器: 10ms / 2000 字 + 50 规则 (目标 500ms 的 50 倍余量)
- 100 章批量写入+聚合: <10ms
- RAG 向量检索: 内存余弦相似度，毫秒级响应

## License

MIT
