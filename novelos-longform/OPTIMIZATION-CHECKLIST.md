# NovelOS Longform 优化清单

> 基于 2026-05-07 全量代码审查，按优先级 P0→P3 排列。
> P0 = 必须修复（影响正确性/安全性），P1 = 强烈建议（影响可用性），P2 = 改善体验，P3 = 长期重构。

## ✅ 全部完成 (2026-05-08)

所有 23 项优化已实施完毕。Rust 编译通过、14 个后端测试通过、10 个前端测试通过、TypeScript 类型检查通过。

### 改动摘要

| 优先级 | 数量 | 状态 |
|--------|------|------|
| P0 | 4 | ✅ 全部完成 |
| P1 | 6 | ✅ 全部完成 |
| P2 | 8 | ✅ 全部完成 |
| P3 | 5 | ✅ 全部完成 |

### 关键文件变更

**新增文件 (~40)**:
- `src-tauri/src/llm/retry.rs` — 429 重试 + 指数退避
- `src-tauri/src/agents/*.rs` — 22 个 Agent 子模块（拆分自 mod.rs）
- `src/lib/web-api/*.ts` — 23 个 API 模块（拆分自 web-api.ts）
- `src/__tests__/compiler.test.ts` — 10 个前端编译器测试
- `src/locales/zh-CN.json` + `en.json` — i18n locale
- `src/components/chapter/StateMachineDiagram.tsx` — 状态机可视化
- `src-tauri/src/db/migrations_global/V007__agent_prompts.sql` — Agent Prompt 存储
- `src-tauri/src/db/migrations_global/V008__compiler_rules.sql` — 编译器规则配置

**修改文件 (~25)**:
- `src-tauri/src/llm/openai.rs` / `anthropic.rs` / `ollama.rs` — 共享 Client + 重试
- `src-tauri/src/llm/mod.rs` — LlmService 共享 Client
- `src-tauri/src/compiler/power.rs` / `visibility.rs` / `timeline.rs` / `prose.rs` / `canon.rs` — 检查器补强
- `src-tauri/src/db/mod.rs` — Arc<Mutex> + safe lock
- `src-tauri/src/commands/llm.rs` — API Key 脱敏 + 费用按模型 + 流取消
- `src-tauri/src/commands/orchestrator.rs` — 并发流水线 + poison fix
- `src-tauri/src/commands/agent.rs` — Prompt 数据库化 + CRUD
- `src-tauri/src/rag.rs` — gzip 压缩持久化
- `src-tauri/src/agent_io.rs` — Schema 校验 + confidence 修复
- `src-tauri/Cargo.toml` — flate2 + tracing 依赖

---


## P0 — 正确性与安全性

### P0-01 编译器检查器几乎全部是 stub

**现状**：8 个检查器中 6 个用硬编码关键词 `contains()` 检测，误报率极高。

| 检查器 | 检测方式 | 问题 |
|--------|---------|------|
| `PowerChecker` | 5 个关键词（"竟然能""怎么可能"…） | 任何正常叙事都触发 |
| `VisibilityChecker` | 3 个关键词（"竟然知道""不知为何"…） | 同上 |
| `TimelineChecker` | 关键词分词后匹配覆盖率 | 分词逻辑粗糙，中文分词不准 |
| `ForeshadowChecker` | 仅检查章节数差值 | 逻辑正确但太简单 |
| `ProseChecker` | 对话数<2 + 段落数<3 | 有意义的最低限 |
| `CanonChecker` | 按"不得/禁止"拆分后 contains | 可以工作但容易绕过 |

**建议**：
- `PowerChecker` / `VisibilityChecker`：改为调用 LLM 做语义判断（已有 `rewrite_agent` 先例），或引入正典中的战力等级表做数值比较
- `CanonChecker`：增加模糊匹配（编辑距离 ≤ 2）+ 上下文窗口验证（前后 50 字内是否有否定词）
- `TimelineChecker`：用 FTS5 索引替代手动分词
- `ProseChecker`：增加重复句式检测（N-gram 重复率）、段落长度方差、对话/叙述比

**涉及文件**：
- `src-tauri/src/compiler/power.rs`
- `src-tauri/src/compiler/visibility.rs`
- `src-tauri/src/compiler/timeline.rs`
- `src-tauri/src/compiler/canon.rs`
- `src-tauri/src/compiler/prose.rs`

---

### P0-02 Poisoned Mutex 静默恢复

**现状**：`orchestrator.rs:46-51` 遇到 poisoned lock 时 `e.into_inner()` 继续使用，可能操作已不一致的数据库连接。

```rust
let project_conn = match db.project.lock() {
    Ok(guard) => guard,
    Err(e) => {
        let guard = e.into_inner();
        guard // Use poisoned guard — best effort
    }
};
```

**建议**：
- 改为返回错误，让调用方决定是否重建连接
- 或在 `DbState` 层提供 `recover_connection()` 方法，poisoned 时关闭并重新打开
- 全局排查所有 `.into_inner()` 用法（当前仅此一处）

**涉及文件**：`src-tauri/src/commands/orchestrator.rs:46`

---

### P0-03 API Key 明文存储

**现状**：`LlmConfig.api_key` 以明文 JSON 存入 `global_settings` 表。

```rust
conn.execute(
    "INSERT INTO global_settings (key, value, updated_at) VALUES ('llm_config', ?1, ?2) ...",
    rusqlite::params![config_json, now],
)
```

**建议**：
- macOS：使用 `keychain` crate 存入 Keychain
- Windows：使用 `credential-manager` 存入 Credential Manager
- 跨平台 fallback：AES-256-GCM 加密后存库，密钥从机器特征派生
- 至少不要在 `get_llm_config` 返回值中包含完整 key（脱敏为 `sk-****1234`）

**涉及文件**：`src-tauri/src/commands/llm.rs:111-121`

---

### P0-04 429 无重试，流水线中断

**现状**：`openai.rs:139` 遇 429 直接 `return Err`，批量流水线中一个 Agent 失败则整条管线停止。

```rust
if status.as_u16() == 429 {
    return Err(format!("Rate limited (429): {}", status).into());
}
```

**建议**：
- 在 `LlmService` 层实现通用重试：指数退避 + jitter，最大 3 次
- 对 429 特殊处理：读取 `Retry-After` header
- 流水线层面：单个 Agent 失败后可降级（如评审专家缺失则跳过，而非整体中断）

**涉及文件**：
- `src-tauri/src/llm/openai.rs:139`
- `src-tauri/src/llm/anthropic.rs`（同理）
- `src-tauri/src/orchestrator.rs`（`route_failure` 需增加 429 路由）

---

## P1 — 可用性

### P1-01 Web 端核心功能全部不可用

**现状**：`web-api.ts` 中 25 个方法直接 throw `WebNotSupportedError`，包括：
- 所有 LLM 调用（chat / stream / agent / pipeline）
- 编译器、重写段落
- 导出（TXT/MD/DOCX/EPUB/PDF）
- 导入、备份、修史分析/执行
- 合规词增删

**建议**：
- LLM 调用：Web 端直接调 OpenAI/Anthropic API（CORS 允许或通过代理），不走 Tauri IPC
- 导出 TXT/MD：纯前端实现（拼接字符串 + Blob download）
- 编译器：将 Rust 编译器逻辑用 TypeScript 重写一份（8 个检查器逻辑简单，可行）
- 渐进式：先做 TXT/MD 导出 + 编译器，再扩展

**涉及文件**：`src/lib/web-api.ts`（25 处 throw）

---

### P1-02 批量流水线串行执行

**现状**：`run_batch_pipeline` 逐章串行 `await`，100 章 = 100 × 15 步串行。

```rust
for chapter_number in start_chapter..=end_chapter {
    let result = run_chapter_pipeline(db.clone(), llm_state.clone(), chapter_number).await?;
    results.push(result);
}
```

**建议**：
- 引入并发窗口（如 `futures::stream::buffered(3)`），允许同时运行 N 条管线
- 加入章节间依赖守卫：上一章 `archived` 后才启动下一章
- 加入限流：全局 LLM RPM 限制，避免 429

**涉及文件**：`src-tauri/src/commands/orchestrator.rs:574-581`

---

### P1-03 Agent Prompt 硬编码，修改需重新编译

**现状**：`agents/mod.rs` 1189 行，30 个 Agent 的 system/user prompt 全部是 `pub const SYSTEM: &str`。

**建议**：
- 短期：将 prompt 移入数据库表（`agent_prompts`），启动时加载，缓存到内存
- 中期：支持在 UI 中编辑 prompt（`AgentPromptEditorPage`）
- 拆分：每个 Agent 独立文件 `agents/genre_match.rs`、`agents/draft_writer.rs` 等

**涉及文件**：`src-tauri/src/agents/mod.rs`

---

### P1-04 RAG 向量索引全量 JSON 序列化

**现状**：`BookVectorStore.save_to_file` 将整个向量库序列化为 JSON 写入磁盘。100 章 × ~50 chunks × 1024 维 float = ~200MB JSON。

```rust
pub fn save_to_file(&self, path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    let json = serde_json::to_string(self)?;
    std::fs::write(path, json)?;
    Ok(())
}
```

**建议**：
- 改为二进制格式：`bincode` 或 `flatbuffers`，体积减少 60-80%
- 增量持久化：仅保存 dirty chunks，非全量覆盖
- 考虑 mmap 方案：`memmap2` + 固定宽度 float 数组，零拷贝加载
- 长期：接入 ChromaDB / SQLite-vec 扩展（已有 TODO 项 RAG-001/002）

**涉及文件**：`src-tauri/src/rag.rs:330-340`

---

### P1-05 `reqwest::Client` 每次请求新建

**现状**：LLM 三个 Provider 中 10 处 `reqwest::Client::new()`，每次 API 调用都新建连接池。

**建议**：
- 在 `LlmState` 或 `LlmService` 中持有共享 `reqwest::Client` 实例
- `Client` 内部维护连接池和 keep-alive，复用 TCP 连接
- 对批量流水线：从 10+ 次 TCP 握手降为 1 次

**涉及文件**：
- `src-tauri/src/llm/openai.rs:110,176,270`
- `src-tauri/src/llm/anthropic.rs:148,258`
- `src-tauri/src/llm/ollama.rs:128,205,229,281`

---

### P1-06 前端零测试覆盖

**现状**：仅 Rust 后端有 ~45 个 `#[test]`，前端（40,800 行）无任何测试。

**建议**：
- 核心逻辑优先：`web-db.ts` 迁移执行、`stores/` 状态流转、`api.ts` Facade 切换
- 框架：`vitest` + `@testing-library/react`
- 目标：关键路径 50%+ 覆盖率

**涉及文件**：新增 `src/__tests__/` 目录

---

## P2 — 代码质量与性能

### P2-01 `web-api.ts` 单文件 1954 行

**现状**：所有 Web 端 API 实现挤在一个文件，与 Rust 端 20+ 模块严重不对等。

**建议**：按 `commands/` 同构拆分：
- `web-api/project.ts`
- `web-api/canon.ts`
- `web-api/chapter.ts`
- `web-api/llm.ts`
- `web-api/index.ts`（re-export）

**涉及文件**：`src/lib/web-api.ts`

---

### P2-02 `agents/mod.rs` 单文件 1189 行

**现状**：30 个 Agent 的 prompt 平铺在同一个文件。

**建议**：每个 Agent 独立子模块：
- `agents/genre_match.rs`
- `agents/draft_writer.rs`
- `agents/mod.rs` 仅做 re-export

**涉及文件**：`src-tauri/src/agents/mod.rs`

---

### P2-03 DbState 全局 Mutex 粒度过粗

**现状**：`global: Mutex<Connection>` + `project: Mutex<Option<Connection>>`，所有命令串行等锁。高频操作（保存草稿 + 流水线 + RAG 检索）互相阻塞。

**统计**：`chapter.rs` 24 次 lock、`ledger.rs` 20 次、`shared_resources.rs` 14 次。

**建议**：
- 短期：读写分离——读操作用 `Mutex<rusqlite::Connection>` 不阻塞其他读（rusqlite 内部 WAL 模式）
- 中期：`RwLock` 替代 `Mutex`（rusqlite `Connection` 不实现 `Sync`，需 wrapper 或 `r2d2` 连接池）
- 长期：`tokio::task::spawn_blocking` 将 DB 操作移至专用线程，异步层用 channel 通信

**涉及文件**：`src-tauri/src/db/mod.rs`

---

### P2-04 `orchestrator.rs` clone 滥用（74 次）

**现状**：8 个专家并行分支每个都 `llm_state.clone()` + `db.clone()`，其中 `DbState` 的 `Mutex` clone 是 Arc-like 浅拷贝但仍有开销。

**建议**：
- 改 `DbState` 内部为 `Arc<Mutex<...>>`，clone 只增加引用计数
- 或将 `DbState` / `LlmState` 改为 `tauri::State` 的 `Arc` 引用，避免 clone

**涉及文件**：`src-tauri/src/commands/orchestrator.rs`

---

### P2-05 Token 费用估算硬编码

**现状**：`llm.rs:162` 费用按 GPT-4o 定价硬算，不区分 provider/model。

```rust
let cost = (total_prompt as f64 * 2.5 + total_completion as f64 * 10.0) / 1_000_000.0;
```

Ollama 本地免费，Claude 定价不同，全部按 GPT-4o 算会误导。

**建议**：
- 按 model 维护定价表（`HashMap<String, (f64, f64)>` = input/output per 1M tokens）
- Ollama 返回 $0
- 可在 `global_settings` 中维护，允许用户自定义

**涉及文件**：`src-tauri/src/commands/llm.rs:162`

---

### P2-06 Web 端迁移无校验

**现状**：`web-db.ts` 的 `runMigrations` 执行 SQL 后，`_migrations` 表写入可能因后续错误未完成，但无 readback 验证。

```typescript
for (const migration of pending) {
    db.run("BEGIN");
    try {
      // ... execute statements
      db.run("COMMIT");
    } catch (err) {
      db.run("ROLLBACK");
      throw new Error(`Migration V${migration.version} failed: ${err}`);
    }
}
```

注意：执行 SQL 后没有 `INSERT INTO _migrations` 语句——迁移永远重复执行。

**建议**：
- 每个 migration 执行后立即 `INSERT INTO _migrations`
- 启动时验证已应用版本数与文件数一致

**涉及文件**：`src/lib/web-db.ts:58-79`

---

### P2-07 `AgentOutput.from_content` 解析脆弱

**现状**：用 `serde_json::from_str` 猜测 LLM 输出格式，`confidence` 默认 fallback 0.7。不同 Agent 输出结构不同，大部分走 else 分支。

**建议**：
- 每个 Agent 声明自己的输出 schema（`JsonSchema` 或 `struct`）
- 在 `run_agent` 返回后用 schema 验证 + 提取字段
- 解析失败时 `confidence` 应为 0.0 而非 0.7

**涉及文件**：`src-tauri/src/agent_io.rs:72-97`

---

### P2-08 流式 LLM 无取消机制

**现状**：`chat_completion_stream` 启动后无法中断。用户关闭章节或切换项目时，后台仍持续接收 token 并 emit 事件。

**建议**：
- 引入 `CancellationToken`（`tokio_util::sync::CancellationToken`）
- 前端 `unlisten` 时发 cancel 信号
- `run_chapter_pipeline` 也需支持整体取消

**涉及文件**：`src-tauri/src/commands/llm.rs:184-210`

---

## P3 — 长期重构与体验

### P3-01 Agent 输出 JSON 校验 + 自动修复

**现状**：LLM 返回 JSON 格式不稳定时，`from_content` 静默 fallback，后续流程拿到残缺数据。

**建议**：
- 增加 `output_schema` 字段到 Agent 定义
- 解析失败时自动追加修复 prompt（"请严格按以下 JSON schema 输出"）重试一次
- 仍失败则标记 `needs_human`

---

### P3-02 编译器热更新

**现状**：修改编译器规则需重启应用。`default_passes()` 是编译期固定的。

**建议**：
- 编译器规则（关键词列表、阈值）移入数据库
- `CompilePass` 实现 `reload_config()` 方法
- `CanonChecker` 的禁用词列表动态加载

---

### P3-03 章节状态机可视化

**现状**：`VALID_TRANSITIONS` 在 `chapter.rs` 硬编码，前端仅显示当前状态。

**建议**：
- 前端增加状态机流程图组件（Mermaid / React Flow）
- 灰显不可达状态，高亮当前状态和合法转换

---

### P3-04 多语言支持完善

**现状**：`i18n.tsx` 存在但大部分 UI 文案硬编码中文。

**建议**：
- 提取所有硬编码中文到 `locales/zh-CN.json` / `locales/en.json`
- Agent prompt 保持中文（目标输出是中文小说），UI 文案双语

---

### P3-05 日志结构化 + 持久化

**现状**：Agent 执行日志存 SQLite（`agent_execution_logs`），但 Rust 层 `log` crate 仅输出到控制台。

**建议**：
- 统一为结构化日志（`tracing` crate 替代 `log`）
- 关键操作（迁移、编译、LLM 调用）写入 SQLite 日志表
- 前端可查的 Log Viewer

---

## 汇总

| 优先级 | 数量 | 核心关注 |
|--------|------|---------|
| P0 | 4 | 编译器质量、Mutex 安全、Key 安全、429 重试 |
| P1 | 6 | Web 端可用性、批量性能、Prompt 可配置、RAG 持久化、连接复用、测试 |
| P2 | 8 | 文件拆分、锁粒度、clone 优化、费用准确、迁移校验、解析鲁棒、流式取消 |
| P3 | 5 | 输出校验、编译器热更新、状态可视化、i18n、结构化日志 |

**建议执行顺序**：P0-04 (429 重试) → P0-02 (Mutex 安全) → P1-05 (Client 复用) → P0-01 (编译器) → P1-02 (批量并发) → P0-03 (Key 加密) → P1-04 (RAG 持久化) → 其余按需
