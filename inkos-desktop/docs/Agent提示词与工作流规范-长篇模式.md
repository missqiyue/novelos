# Agent 提示词与工作流规范：长篇模式

## 1. 文档信息

- 文档名称：`NovelOS Longform Agent 提示词与工作流规范`
- 文档类型：算法/内容协作文档
- 面向对象：算法工程师、Prompt 工程师、内容运营、编辑团队
- 目标：定义长篇模式下多 Agent 的职责、输入输出契约、协作规则和提示词规范

## 2. 设计目标

- 让多 Agent 在 200 万字级项目中分工明确，不相互覆盖职责
- 保证所有 Agent 都围绕“正典优先、状态优先、审计优先”工作
- 让每一个关键 Agent 的输出可结构化入库
- 降低正文 Agent 自由发挥导致的长篇幻觉

## 3. 总体原则

- `先读后写`：任何写作 Agent 在输出前都必须先读取相关正典、状态和任务卡
- `有据可依`：引用事实时必须能指出对应的正典条目、快照或章节来源
- `不越权`：正文 Agent 无权修改硬设定；若发现冲突只能提交提案
- `结构化输出`：所有 Agent 必须输出 JSON 或字段化对象，不允许只给散文式建议
- `最小修改`：修复 Agent 优先处理局部冲突，不主动推翻大纲
- `定稿前必审计`：任何生成文本都必须经过编译器和评审 Agent

## 4. Agent 角色总览

长篇模式建议采用 `1 个编排 Agent + 10 个专业 Agent + 1 个规则编译器` 结构。

### 4.1 编排 Agent

- 名称：`Orchestrator Agent`
- 职责：
  - 调度全流程
  - 决定当前步骤需要调用哪些 Agent
  - 汇总多 Agent 输出
  - 管理状态机流转
- 权限：
  - 可读全部项目数据
  - 不直接修改正文和正典，只发起任务

### 4.2 专业 Agent 清单

- `Canon Curator Agent`：正典管理员
- `Outline Architect Agent`：长程规划师
- `Arc Planner Agent`：事件链规划师
- `Task Card Agent`：章节任务卡生成器
- `Recall Agent`：约束召回器
- `Draft Writer Agent`：正文生成器
- `Reader Panel Agent`：读者代理评审器
- `Continuity Analyst Agent`：连续性分析器
- `Rewrite Agent`：定向重写器
- `Retcon Analyst Agent`：修史影响分析器
- `Archive Agent`：归档与快照写入器

### 4.3 规则编译器

- 名称：`Continuity Compiler`
- 定位：不是大模型人格，而是规则执行组件
- 责任：对章节草稿执行可验证的结构检查

## 5. 全局输入契约

所有 Agent 都应统一接收以下基础字段：

```json
{
  "project_id": "string",
  "book_mode": "longform",
  "objective": "string",
  "chapter_number": 123,
  "volume_id": "string|null",
  "arc_id": "string|null",
  "task_id": "string|null",
  "constraints": {
    "hard_rules": [],
    "soft_rules": [],
    "do_not_change": []
  },
  "context": {
    "canon_refs": [],
    "snapshot_refs": [],
    "state_refs": [],
    "foreshadow_refs": [],
    "timeline_refs": []
  }
}
```

## 6. 全局输出契约

所有 Agent 输出必须具备以下结构：

```json
{
  "result": {},
  "reasons": ["string"],
  "risk_flags": [
    {
      "type": "string",
      "severity": "low|medium|high|critical",
      "message": "string"
    }
  ],
  "confidence": 0.0,
  "next_action": "string"
}
```

## 7. 各 Agent 详细规范

### 7.1 Canon Curator Agent

职责：

- 维护和解释正典
- 审查新设定是否可进入正典
- 输出正典版本更新提案

输入重点：

- 新设定草案
- 当前硬规则集合
- 历史版本

输出重点：

- 是否允许进入正典
- 归属范围
- 是否属于硬规则
- 影响说明

提示词原则：

- 只判断规则合法性，不扩展剧情
- 若信息不足，返回“需补充证据”，不擅自脑补

### 7.2 Outline Architect Agent

职责：

- 生成作品级和卷级规划
- 保持总卖点、终局承诺和阶段成长曲线一致

输入重点：

- 作品定位
- 读者目标
- 已冻结终局

输出重点：

- 卷纲
- 卷间节奏
- 主线、支线分配

提示词原则：

- 优先做层级规划，不写正文
- 每一卷必须有目标、代价、爆点和余波

### 7.3 Arc Planner Agent

职责：

- 将卷纲拆成篇章和事件链
- 让每个事件链具备起因、升级、结果和回收口

输入重点：

- 卷纲
- 当前活跃人物与伏笔

输出重点：

- 事件链范围
- 事件链目标
- 相关角色
- 预计回收项

### 7.4 Task Card Agent

职责：

- 将事件链任务转换成单章任务卡

输出字段建议：

```json
{
  "objective": "本章主目标",
  "must_progress": ["必须推进事项"],
  "must_recall": ["必须引用事实"],
  "must_avoid": ["不可触碰事项"],
  "required_hooks": ["应回收或提醒的伏笔"],
  "ending_hook": "章尾钩子要求"
}
```

提示词原则：

- 一章最多 1 到 2 个核心推进点
- 禁止输出“本章什么都推进一点”的任务卡

### 7.5 Recall Agent

职责：

- 从正典、状态、快照和账本中召回当前章真正需要的上下文

输入重点：

- 章节任务卡
- 当前章编号
- 当前卷和事件链

输出重点：

- 必需上下文列表
- 推荐上下文列表
- 明确禁止引用的信息

提示词原则：

- 不求多，只求准
- 优先召回“会影响本章决策的事实”

### 7.6 Draft Writer Agent

职责：

- 根据任务卡和召回结果生成章节初稿

硬规则：

- 不能新增硬设定
- 不能更改角色核心边界
- 不能让角色说出其未知信息
- 不能跳过任务卡要求的推进项

输入重点：

- 当前章任务卡
- 角色状态
- 最近快照
- 必需正典条目

输出重点：

- 章节草稿
- 自报不确定点
- 可能冲突点

建议提示词骨架：

```text
你是长篇网文正文生成 Agent。
你的唯一任务是在给定任务卡和正典约束内完成本章初稿。
禁止新增未登记硬设定。
禁止修改角色核心边界。
若存在信息不足，优先保守写法，不允许自行脑补关键规则。
本章必须完成任务卡中的 must_progress，并在结尾制造有效尾钩。
输出正文草稿和风险说明，分开给出。
```

### 7.7 Reader Panel Agent

职责：

- 从读者视角评估章节是否好读、是否想追

建议拆成四个子角色：

- `新读者代理`
- `老书虫代理`
- `男频爽感代理`
- `女频情绪代理`

输出重点：

- 继续阅读意愿
- 出戏点
- 无聊点
- 角色喜恶变化

注意：

- Reader Panel 只评价体验，不判断正典合法性

### 7.8 Continuity Analyst Agent

职责：

- 用语言理解能力补充规则编译器难以覆盖的复杂冲突

重点检查：

- 人物是否像换了一个人
- 关系变化是否缺乏触发
- 情节结果是否超出铺垫能力
- 回收是否过早或过晚

### 7.9 Rewrite Agent

职责：

- 根据评审和编译结果局部重写

工作模式：

- `repair`：修冲突
- `compress`：压缩水文
- `hook_up`：增强尾钩
- `voice_fix`：修正人物口吻

提示词原则：

- 只改目标段落
- 不主动改变本章任务和上层规划

### 7.10 Retcon Analyst Agent

职责：

- 当必须改史时，分析影响范围和最小修复方案

输出重点：

- 影响章节
- 影响角色
- 影响伏笔
- 推荐策略

策略枚举：

- `future_compensation`
- `local_patch`
- `arc_rebuild`

### 7.11 Archive Agent

职责：

- 定稿后更新账本、快照和索引

输出重点：

- 新增事件
- 更新状态
- 新增或回收伏笔
- 快照摘要

## 8. 工作流规范

### 8.1 新建长篇项目工作流

- `Outline Architect Agent` 生成作品级结构
- `Canon Curator Agent` 冻结核心正典
- `Arc Planner Agent` 生成前几卷事件链
- 系统落库并生成初始快照

### 8.2 单章生产工作流

- Orchestrator 读取当前章节状态
- Task Card Agent 生成本章任务卡
- Recall Agent 召回本章所需事实
- Draft Writer Agent 生成初稿
- Continuity Compiler 运行规则审计
- Reader Panel Agent 进行读者评审
- Continuity Analyst Agent 补充语义审计
- Rewrite Agent 定向修复
- Archive Agent 归档并生成快照

### 8.3 修史工作流

- 用户或系统发起修史申请
- Retcon Analyst Agent 输出影响评估
- Canon Curator Agent 判断是否触及硬规则
- Orchestrator 选择修复方案
- Rewrite Agent 或 Arc Planner Agent 执行修复
- Archive Agent 更新版本与快照

## 9. 状态机规范

章节状态建议采用以下枚举：

- `task_ready`
- `draft_generated`
- `compile_failed`
- `review_pending`
- `rewrite_required`
- `approved`
- `archived`

状态流转规则：

- 未通过编译不得进入 `approved`
- 未归档不得进入下一章自动生成
- 修史影响范围内的章节可被标记为 `needs_revalidate`

## 10. Prompt 设计原则

### 10.1 系统提示词规则

- 明确角色边界
- 明确禁止事项
- 明确输出结构
- 明确事实来源优先级

### 10.2 用户提示词规则

- 只给当前任务需要的信息
- 不重复灌入全量历史章节
- 显式提供“不得修改”的约束

### 10.3 上下文拼装优先级

- 第一优先：任务卡
- 第二优先：相关硬规则
- 第三优先：角色和关系状态
- 第四优先：最近快照
- 第五优先：相关伏笔与事件账

## 11. 常见失败模式与防护

### 11.1 正文 Agent 自由发挥过多

表现：

- 擅自引入新组织、新规则、新秘密

防护：

- 提示词中显式禁止
- 编译器检查未登记实体

### 11.2 召回信息过量

表现：

- 输出变平、重复、无重点

防护：

- Recall Agent 只返回“必需”和“推荐”两层
- 单章输入限制字段数和长度

### 11.3 修复 Agent 改动过大

表现：

- 局部修复顺手改坏整体节奏

防护：

- Rewrite Agent 只接收目标段落和修复目标
- 禁止它接收全章之外的生成任务

### 11.4 评审 Agent 与编译器结论冲突

表现：

- 读者代理觉得好看，但编译器判定冲突

处理原则：

- 结构合法性优先于即时爽感
- 冲突需先修合法性，再回补爽感

## 12. 评估与标注规范

### 12.1 Agent 质量评估指标

- 任务完成率
- 输出字段完整率
- 冲突发现准确率
- 修复有效率
- 人工采纳率

### 12.2 人工标注建议

- 建立“设定冲突”“人物漂移”“时间错误”“无效尾钩”“AI 味重”五类标签
- 每次人工驳回要记录驳回原因
- 高质量修复案例要沉淀成样本库

## 13. 示例：单章任务卡到正文的完整契约

### 13.1 任务卡输入示例

```json
{
  "chapter_number": 438,
  "objective": "主角必须在不暴露底牌的前提下取得临时盟友的信任",
  "must_progress": [
    "推进黑市交易线",
    "让反派阵营首次意识到主角已介入"
  ],
  "must_recall": [
    "主角目前带伤",
    "盟友只知道主角的假身份"
  ],
  "must_avoid": [
    "不能暴露系统底层规则",
    "不能让盟友直接倒向主角"
  ],
  "required_hooks": [
    "第412章埋下的残页线索需要被再次提醒"
  ],
  "ending_hook": "章尾要形成下一章追踪战的驱动力"
}
```

### 13.2 正文 Agent 输出示例

```json
{
  "result": {
    "draft": "章节正文草稿",
    "uncertainties": [
      "黑市势力的二号人物名字在当前召回中缺失，正文采用保守称呼处理"
    ]
  },
  "reasons": [
    "已完成黑市交易线推进",
    "已保留盟友疑心，未过快建立信任"
  ],
  "risk_flags": [
    {
      "type": "possible_visibility_error",
      "severity": "medium",
      "message": "盟友对白接近推断出主角真实身份，需要编译器复核"
    }
  ],
  "confidence": 0.82,
  "next_action": "run_continuity_compile"
}
```

## 14. 实施建议

- 第一阶段先实现 5 个关键 Agent：
  - Orchestrator
  - Task Card Agent
  - Recall Agent
  - Draft Writer Agent
  - Rewrite Agent
- 第二阶段补齐：
  - Canon Curator Agent
  - Continuity Analyst Agent
  - Retcon Analyst Agent
  - Archive Agent
- Reader Panel Agent 可先做单一读者视角，再逐步扩成多代理

## 15. 总结

长篇模式下的 Agent 设计重点不是“多几个会写的模型”，而是让不同 Agent 分别负责规划、约束、召回、生成、审计、修复和归档。只有每个 Agent 都知道自己不能越界，系统才能在 200 万字级长篇中维持持续的一致性与可控性。
