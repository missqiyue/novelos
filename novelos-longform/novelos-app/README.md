# NovelOS Longform

AI 驱动的长篇小说创作系统。基于 Tauri 2.x 构建，支持 Web、macOS、Windows 三端部署。

## 功能概览

| 模块 | 功能 |
|------|------|
| **书架** | 项目卡片管理、创建/切换/归档书籍 |
| **一键启动** | 8 步向导：描述 → 题材匹配 → 文风 → 卷纲 → 大纲 → 命名 → SOUL → 书名 |
| **正典中心** | 规则 CRUD、版本历史、冻结/解冻、硬规则/软规则 |
| **剧情树** | 五级展开（作品→卷→篇章→事件链→章节）、卷级编辑 |
| **章节工作台** | 富文本编辑、自动保存、版本回溯、正典侧栏、一键定稿 |
| **项目看板** | 字数统计、进度追踪、卷结构、章节状态总览 |
| **AI Agent** | Genre Match / Name Generator / SOUL Matcher / Book Title / Draft Writer / Voice Filter |
| **LLM 配置** | 支持 OpenAI 兼容 API（可接入国内模型）、配置持久化 |

## 技术栈

- **前端**: React 19 + TypeScript + TailwindCSS 4 + Vite 8
- **后端**: Rust + Tauri 2.x + rusqlite (SQLite)
- **状态**: Zustand
- **路由**: React Router v7
- **UI**: Lucide React 图标
- **LLM**: OpenAI 兼容 API（支持自定义 base_url）

## 项目结构

```
novelos-app/
├── src/                        # React 前端
│   ├── components/
│   │   ├── layout/             # AppShell (侧边栏+主内容区)
│   │   ├── bookshelf/          # 书架页
│   │   ├── project/            # 一键启动流程页
│   │   ├── canon/              # 正典中心页
│   │   ├── outline/            # 剧情树页
│   │   ├── chapter/            # 章节工作台
│   │   ├── dashboard/          # 项目看板
│   │   └── common/             # 设置页
│   ├── stores/                 # Zustand 状态管理
│   ├── lib/tauri.ts            # Tauri invoke 封装
│   ├── types/                  # TypeScript 类型定义
│   └── styles/                 # TailwindCSS
├── src-tauri/                  # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── commands/           # Tauri IPC 命令 (38个)
│   │   ├── db/                 # SQLite 数据库层
│   │   │   └── migrations_*/   # Schema 迁移 + 种子数据
│   │   ├── llm/                # LLM 抽象层 (OpenAI 兼容)
│   │   └── agents/             # Agent 提示词模板
│   ├── Cargo.toml
│   └── tauri.conf.json
├── scripts/                    # 构建/部署脚本
│   ├── build-web.sh
│   ├── build-mac.sh
│   └── build-win.ps1
└── package.json
```

## 数据库架构

采用双库隔离设计：

- **全局库** (`~/.novelos/global/global.db`): 书架、题材模板、SOUL模板、去AI规则、禁用名/书名
- **项目库** (`~/.novelos/books/{id}/book.db`): 项目、正典、角色、卷、章节、事件、伏笔等 40+ 表

每个项目独立数据库，切换书籍时加载对应 DB，数据完全隔离。

## 快速开始

### 环境要求

| 依赖 | 最低版本 |
|------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Rust | 1.77.2+ |
| Tauri CLI | 2.x |

### macOS / Linux

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 克隆项目
git clone <repo-url> novelos-longform && cd novelos-longform/novelos-app

# 安装前端依赖
npm install

# 开发模式
npm run tauri:dev

# 构建桌面应用
npm run tauri:build
```

### Windows

```powershell
# 安装 Rust (https://rustup.rs)
winget install Rustlang.Rustup

# 克隆并进入项目
git clone <repo-url> novelos-longform
cd novelos-longform\novelos-app

# 安装前端依赖
npm install

# 开发模式
npm run tauri:dev

# 构建桌面应用
npm run tauri:build
```

## 一键构建部署

### Web 版 (纯前端 + 后端 API)

```bash
# macOS / Linux
./scripts/build-web.sh

# 输出: dist/ 目录，可部署到任意静态服务器
```

> **注意**: Web 版需要额外部署 Tauri 后端为独立 API 服务，当前 Web 构建仅输出前端静态文件。完整 Web 版本需配合 Tauri 的 HTTP 服务端模式使用。

### macOS 桌面应用

```bash
./scripts/build-mac.sh

# 输出:
#   src-tauri/target/release/bundle/dmg/NovelOS Longform_0.1.0_aarch64.dmg  (Apple Silicon)
#   src-tauri/target/release/bundle/macos/NovelOS Longform.app               (App Bundle)
```

### Windows 桌面应用

```powershell
.\scripts\build-win.ps1

# 输出:
#   src-tauri\target\release\bundle\msi\NovelOS Longform_0.1.0_x64_en-US.msi
#   src-tauri\target\release\bundle\nsis\NovelOS Longform_0.1.0_x64-setup.exe
```

## 内置数据

系统预装了以下数据，首次启动自动加载：

| 数据 | 数量 | 说明 |
|------|------|------|
| 题材模板 | 10 种 | 玄幻/武侠/仙侠/都市/历史/科幻/灵异/军事/言情/游戏 |
| SOUL 模板 | 10 种 | 冷面强者/热血少年/智者谋士/逍遥浪子/霸道总裁/温婉佳人/疯批反派/忠义之士/妖魅邪修/科技天才 |
| 去AI规则 | 20 条 | 词汇/句式/修辞三个维度 |
| 禁用角色名 | 20 个 | 知名作品主角名（硬禁/软警告） |
| 禁用书名 | 25 个 | 热门作品名（碰撞检查库） |

## LLM 配置

在 **设置 → LLM 配置** 中配置：

- **Base URL**: 默认 `https://api.openai.com/v1`，可改为国内兼容 API 地址
- **API Key**: 对应服务的密钥
- **Model**: 默认 `gpt-4o`，可改为 `deepseek-chat`、`qwen-max` 等
- **Max Tokens / Temperature**: 按需调整

配置会持久化到全局数据库，重启后自动加载。

## Agent 系统

| Agent | 功能 | 触发时机 |
|-------|------|---------|
| Genre Match | 根据描述匹配题材 | 一键启动 Step 2 |
| Name Generator | 生成角色名（含碰撞检查） | 一键启动 Step 6 |
| SOUL Matcher | 匹配+定制角色 SOUL | 一键启动 Step 7 |
| Book Title Generator | 生成书名（含碰撞检查） | 一键启动 Step 8 |
| Draft Writer | 根据任务卡撰写章节 | 章节工作台"一键生成" |
| Voice Filter | 去AI化审校 | 章节工作台"审校" |

## 开发指南

### 添加新的 Tauri 命令

1. 在 `src-tauri/src/commands/` 对应模块中添加 `#[tauri::command]` 函数
2. 在 `src-tauri/src/lib.rs` 的 `invoke_handler` 中注册
3. 在 `src/lib/tauri.ts` 中添加对应的 TypeScript 封装
4. 在 `src/stores/` 中添加 Zustand store 方法

### 添加数据库迁移

1. 在 `src-tauri/src/db/migrations_global/` 或 `migrations_project/` 中添加新 SQL 文件
2. 文件名格式: `V{NNN}__描述.sql`，编号递增
3. refinery 会在下次启动时自动执行迁移

## License

MIT
