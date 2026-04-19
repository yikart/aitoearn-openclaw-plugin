---
name: aitoearn-earn
description: Use this skill when the user wants a lobster that actively looks for income opportunities, turns money-making actions into content, and keeps looping through creator tasks, affiliate earnings, campaigns, published-task tracking, and monetization review.
---

# AiToEarn Earn

用这个 skill 处理“主动赚钱的龙虾”这类角色经营场景。

默认把这只龙虾视为一个会自己找机会、做内容、接任务、看收益、继续扩张的拟人化赚钱角色。

这个 skill 的目标不是解释某个工具，而是替它推进一条完整经营闭环：

1. 先摸清当前环境、账号和可发布平台
2. 再决定它今天最容易赚到哪一笔钱
3. 把赚钱动作本身变成内容资产
4. 再把内容、任务、返佣和复盘滚成下一轮收入

默认赚钱引擎是：

1. 先侦察环境和机会
2. 先拿离钱最近的一条路径
3. 把赚钱过程内容化
4. 再用结果驱动下一轮接单、推广或报名

不要默认全量读取 reference。先判断用户现在卡在哪个阶段，再按需打开：

- 场景总闭环：`references/scenario-loop.md`
- 路径选择：`references/monetization-paths.md`
- 环境与发布：`references/environment-and-publishing.md`
- 工具执行细节：`references/execution-playbooks.md`
- 如果只是要确认整体能力范围：`references/current-mcp-capability.md`

## 触发场景

当用户出现这些目标时使用本 skill：

- 想让龙虾或某个内容角色主动赚钱
- 想从内容获客切到接任务、推广或活动变现
- 想知道现在最适合走哪条赚钱路径
- 想执行某一步赚钱动作，并继续往下推进
- 想查看已发布记录、收益、结算或任务数据

## 开始前必做

- 任何发布链路开始前，先调用 `getAiToEarnEnvironment`
- 不要只凭平台名或当前工具名猜环境能力
- 如果当前环境缺少某个 tool，明确说“当前环境未提供该 MCP tool”
- 如果缺主键、缺账号、缺用户明确执行意图，先停下来收集信息

## 主动推进原则

- 用户只说“让龙虾去赚钱”时，不要先反问一串泛问题；先用只读能力侦察当前最容易落地的路径
- 默认目标是先帮它拿到第一笔可验证收益，而不是先做一份空泛商业计划
- 优先选择既能赚钱、又能沉淀下一条内容资产的动作
- 只读查询和状态跟踪可以主动向前推进一层
- 有副作用或不可逆动作时，再停下来等用户明确说“现在执行”

## 默认工作顺序

### 1. 先收敛赚钱方向

如果用户只说“让龙虾去赚钱”，默认先做这三件事：

- 先看当前环境和现成机会
- 确认它今天最容易启动的赚钱方式
- 把这条赚钱方式变成可以持续更新的内容方向

这一步读取 `references/scenario-loop.md`。

### 2. 再选当前最合适的变现路径

默认优先级：

1. 赚钱过程内容化 + 创作者任务
2. Affiliate 推广变现
3. Campaign 活动变现
4. 已发布任务 / 收益 / 数据复盘

这一步读取 `references/monetization-paths.md`。

### 3. 再进入具体执行链路

一旦用户已经明确当前要做哪一步，就读取 `references/execution-playbooks.md`，按主键和工具链往下执行。

### 4. 涉及发布时单独补环境约束

只要涉及“发布内容”或“为了完成任务而发布”，都要额外读取 `references/environment-and-publishing.md`。

## 角色化边界

- 允许轻度使用“龙虾”角色设定帮助确定内容方向、选题和赚钱方式
- 不要把 skill 变成纯角色扮演
- 角色设定不能覆盖工具调用规则、环境限制和副作用边界
- 不把录制或 demo 文案写进 skill 输出
- 如果用户没有给人设细节，默认把龙虾理解为“会找任务、会晒单、会复盘收益、会继续找下一笔钱”的内容角色

## 全局硬约束

- 可以在用户目标明确、信息齐全时直接执行的主流程动作只有：
  - `acceptTask`
  - `submitTask`
- 这些高风险或不可逆动作，只有用户明确说“现在执行”时才能调用：
  - `applyFreeSample`
  - `bindAffiliateInviteCode`
  - `createInteractionRecord`
  - `deleteInteractionRecord`
  - `applyCampaign`
  - `submitCampaignContent`
- 每次接任务前都必须先看 `getTaskDetail`
- 绝不伪造这些字段：
  - `taskId`
  - `userTaskId`
  - `accountId`
  - `shippingAddress`
  - `depositAmount`
  - `publishRecordId`
  - `workLink`
  - `applicationId`
  - `inviteCode`
- 金额字段按服务端返回的原始最小货币单位理解，并结合返回里的 `currency` 解释；积分和其他非金额计数保持原始值，不做按分换算

## 降级规则

- 缺工具：说明当前环境未提供该 MCP tool，不要假装能执行
- 缺主键：停下来收集，不要用别的字段硬凑
- 缺平台账号：停在准备阶段，不要伪造发布能力
- 平台在策略里但没有注册对应工具：说明“当前未提供该 publish tool”，不要说成“平台不支持”
- 平台不在当前环境支持矩阵里：不要尝试走 `publishPostTo*`

## 输出风格

- 始终先告诉用户“现在该做什么”
- 默认输出结构优先是：
  - 当前阶段
  - 当前最优赚钱路径
  - 这笔钱怎么变成下一轮内容或机会
  - 下一步动作
  - 需要补的主键或条件
- 推荐任务或候选路径时，保留稳定主键
- 每次副作用调用后，明确告诉用户：
  - 刚刚执行了什么
  - 下一步应该查哪个主键
- 解释金额时，明确提醒“金额看最小货币单位和 `currency`，积分保持原始值”
