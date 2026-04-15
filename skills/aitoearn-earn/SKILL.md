---
name: aitoearn-earn
description: Use this skill when the user wants to make money on AiToEarn through creator tasks, affiliate income, published task tracking, interaction evidence workflows, campaign applications, or related monetization analytics.
---

# AiToEarn Earn

用这个 skill 处理 AiToEarn 创作者赚钱任务。

先读 `references/current-mcp-capability.md`，再开始执行。

进入任何“发布”链路前，先调用 `getAiToEarnEnvironment`，不要只凭平台名或当前工具列表猜当前环境。

## 适用范围

优先覆盖完整 AiToEarn 赚钱面：

- 浏览任务市场
- 查看任务详情
- 接任务
- 查询我的任务
- 提交普通任务
- 跟进样品单
- 查看 `My Tasks -> Published`
- 处理 Affiliate 推广链接、绑定邀请码、返佣与结算
- 记录与查询互动任务证据
- 浏览探店/活动市场、报名活动、提交活动作品
- 查询任务统计、推广作品详情与趋势

如果当前环境没有同步某个 tool，要明确说明“当前环境未暴露该 MCP tool”，不要假装能执行。

## 发布平台矩阵

做“为了完成任务而发布”时，先按环境判定平台：

- 插件会按 `baseUrl` 自动判定环境：
  - `*.aitoearn.cn` => `China`
  - `*.aitoearn.ai` => `Global`
  - 其他域名 => `self_hosted`
- 插件启动时会只注册当前环境允许的 `publishPostTo*`
- 判断发布能力时优先看 `getAiToEarnEnvironment`
- `policyPlatforms` 表示该环境策略允许的平台
- `registeredPublishPlatforms` 表示当前插件实际注册的平台
- `policyButMissingPublishPlatforms` 表示策略允许，但当前没有提供对应 publish tool
- `unsupportedPublishPlatforms` 表示服务端虽然提供了 publish tool，但当前环境策略不允许，所以插件已过滤

- `China` 版仅支持这些平台的 MCP 发布：
  - 抖音
  - 快手
  - 哔哩哔哩
  - 微信公众号
- `China` 版补充：
  - 小红书不支持 MCP 发布
- `Global` 版仅支持这些平台的 MCP 发布：
  - TikTok
  - YouTube
  - Twitter
  - Facebook
  - Instagram
  - Threads
  - Pinterest
  - LinkedIn

如果任务目标平台不在当前环境支持矩阵里：

- 不要尝试走 `publishPostTo*`
- 直接说明当前环境不支持该平台的 MCP 发布
- 必要时改走已有 `workLink` 提交，或者停在内容准备阶段

如果目标平台在策略矩阵里，但 `registeredPublishPlatforms` 没有：

- 明确说明这是“当前未提供该 publish tool”
- 不要说成“平台不支持”

## 核心规则

- 这些主流程动作在用户已经明确表达目标时，可以在信息齐全后直接执行，不再额外二次确认：
  - `acceptTask`
  - `submitTask`
- 这些高风险或不可逆动作，只有用户明确说“现在执行”时才能调用，不能只因信息齐全就自动执行：
  - `applyFreeSample`
  - `bindAffiliateInviteCode`
  - `createInteractionRecord`
  - `deleteInteractionRecord`
  - `applyCampaign`
  - `submitCampaignContent`
- 但不能盲执行。每次接任务前都必须先看 `getTaskDetail`。
- 绝不伪造 `taskId`、`userTaskId`、`accountId`、`shippingAddress`、`depositAmount`、`publishRecordId`、`workLink`、`applicationId`、`inviteCode`。
- 如果缺少执行所需字段，先收集字段，再继续。
- 如果用户没有指定任务，默认先从 `listTaskMarket` 里筛选推荐。
- 如果用户没有成品内容，但希望完成任务，允许串联当前已有的内容工具和发布工具。
- 如果当前对话涉及多个赚钱面，优先按用户目标分流：
  - 创作者接单赚钱：任务市场、我的任务、发布、提交
  - 推广返佣赚钱：Affiliate
  - 探店或活动赚钱：Campaign

## 默认工作流

### 1. 浏览任务

用户说想赚钱、接单、找任务时：

1. 调 `listTaskMarket`
2. 优先按这些维度筛选和排序：
   - 明确指定的平台
   - 明确指定的任务类型
   - 奖励更高
   - 名额还充足
3. 给出精简推荐，并保留 `taskId`

### 2. 查看详情再接单

用户决定某个任务后：

1. 调 `getTaskDetail`
2. 检查任务类型、平台、奖励、是否需要指定账号或样品地址
3. 只有在必要信息齐全时才调 `acceptTask`

接单时按任务类型补齐参数：

- 普通任务：
  - 最少需要 `taskId`
  - 如果任务要求账号，补 `accountId`
- 样品任务：
  - 根据需要补 `shippingAddress`
  - 根据需要补 `depositAmount`
  - 根据需要补 `sampleMode`

### 3. 查询我的任务

用户问“我接了哪些任务”“当前进度怎样”时：

1. 优先调 `listMyUserTasks`
2. 用户指定某个任务后再调 `getMyUserTaskDetail`

### 4. 任务类型决策

在接任务或执行任务前，先按 `type` 决定工具链，不要把所有任务都默认走 `submitTask`：

- `promotion`
  - 按普通发布/提交链路处理
  - 优先走 `publishPostTo*` 或 `workLink -> submitTask`
- `sample`
  - 按样品任务链路处理
  - 关注 `shippingAddress`、`depositAmount`、`sampleMode`
- `interaction`
  - 优先走互动证据链路：`createInteractionRecord`、`listInteractionRecords`
  - 只有当 `getTaskDetail` 或 `getMyUserTaskDetail` 明确表明该任务还需要 `workLink` 或 `publishRecordId` 时，才继续走 `submitTask`
- `brand_comment`
  - 视为评论型互动任务
  - 优先补 `commentContent`、`commentTime`，再走互动证据链路
  - 只有详情明确要求普通提交时才走 `submitTask`
- `follow_account`
  - 不要自动伪造 `workLink`
  - 先看 `getTaskDetail` 或 `getMyUserTaskDetail` 是否给出明确完成方式
  - 如果当前环境没有专用完成工具，就明确说明缺口并停止在证据收集或人工确认阶段

### 5. 完成并提交普通任务

当用户要完成普通任务时，优先走这两条路径之一：

- 已有作品链接：
  - 直接 `submitTask`，传 `userTaskId + workLink`
- 还没有作品链接，但需要在 AiToEarn 内发帖：
  - 先准备内容
  - 再发布，并把 `userTaskId` 一并透传给 `publishPostTo*`
  - 用 `getPublishingTaskStatus` 跟进发布结果
  - 如果发布结果只给 `flowId`，再用 `getMyPublishedTaskDetail(flowId)` 反查 `publishRecordId`
  - 再 `submitTask`

### 6. 内容准备与发布

如果用户没有现成内容，可以按场景串联现有工具：

- 需要从社媒链接取素材：
  - `createCrawlTask`
  - `getCrawlTaskStatus`
- 需要 AI 生成草稿：
  - `getDraftGenerationPricing`
  - `createVideoDraft`
  - `createImageTextDraft`
  - `getDraftTaskStatus`
- 需要手动组织素材或草稿：
  - `createMedia`
  - `createDraft`
  - `listDrafts`
  - `getDraftDetail`

发布时按平台使用对应工具：

- `publishPostToBilibili`
- `publishPostToWxGzh`
- `publishPostToYoutube`
- `publishPostToPinterest`
- `publishPostToThreads`
- `publishPostToTiktok`
- `publishPostToFacebook`
- `publishPostToInstagram`
- `publishPostToKwai`
- `publishPostToTwitter`

发布前规则：

- 先确认目标平台账号
- 先调 `getAiToEarnEnvironment`，确认当前环境与实际已注册 publish tools
- 先确认内容类型和素材
- 必要时先查限制：`publishRestrictions`
- 对 Bilibili 和 YouTube 这类需要分类的场景，先查分类工具
- 任何“为了完成任务而发布”的场景，都要把 `userTaskId` 透传到 `publishPostTo*`
- 如果平台不在当前环境支持矩阵里，不要硬走发布工具

### 7. 样品单

如果任务是样品任务：

1. 接单时先补齐样品地址和押金相关信息
2. 用户明确要求申请免费样品时再调 `applyFreeSample`
3. 后续用 `listMySampleOrders` 和 `getMySampleOrderDetail` 跟进

### 8. Affiliate

用户问推广链接、邀请码、返佣、结算时：

1. 查询推广链接：`getAffiliateLink`
2. 绑定邀请码：`bindAffiliateInviteCode`
3. 看推广总览：`getAffiliateOverview`
4. 看返佣明细：`listAffiliateCommissions`
5. 看结算信息：`getAffiliateSettlement`

处理规则：

- 用户要“怎么推广我赚钱链接”时，优先先给 `inviteLink`
- 用户问收益时，先给 `getAffiliateOverview`，再按需要下钻 `listAffiliateCommissions`
- 用户问“可提现吗”时，重点解释 `getAffiliateSettlement` 里的 `pending` 与 `settled`
- `bindAffiliateInviteCode` 只有用户明确要绑定某个邀请码时才执行

### 9. 已发布任务

用户要看 `My Tasks -> Published` 或某个已发布任务详情时：

1. 列表：`listMyPublishedTasks`
2. 详情：`getMyPublishedTaskDetail`

处理规则：

- 用户有 `userTaskId` 时优先用它查详情
- 其次可以用 `publishRecordId` 或 `flowId`
- 如果用户要核对某次提交是否已经形成已发布作品，这一组工具优先级高于普通 `listMyUserTasks`

### 10. 互动任务证据

用户要做互动任务时：

1. 记录证据：`createInteractionRecord`
2. 查询历史证据：`listInteractionRecords`
3. 删除误记录：`deleteInteractionRecord`

处理规则：

- 至少确认 `accountId`、`platform`、`worksId`
- 有评论动作时优先补 `commentContent` 和 `commentTime`
- 有点赞/收藏动作时补对应时间字段
- `deleteInteractionRecord` 只有用户明确说要删除哪条记录时才执行

### 11. Campaign 探店/活动

用户要浏览或参与活动时：

1. 浏览市场：`listCampaignMarket`
2. 查看详情：`getCampaignDetail`
3. 报名：`applyCampaign`
4. 查询我的报名：`listMyCampaignApplications`
5. 查核销码：`getCampaignVerifyCode`
6. 提交作品：`submitCampaignContent`

处理规则：

- 报名前必须先看活动详情
- 报名需要时补齐 `platforms` 数组里的账号信息
- `applyCampaign` 只有用户明确说要报名时才执行
- 提交作品时至少保证 `applicationId + workLink`
- `submitCampaignContent` 只有用户明确说要提交该活动作品时才执行

### 12. 任务统计与推广作品分析

用户要看任务数据或推广作品数据时：

- 任务聚合统计：`getTaskPostsDataCube`
- 任务七日趋势：`getTaskPostsTrend`
- 推广作品列表：`listPromotionPosts`
- 推广作品详情：`getPromotionPostDetail`
- 推广作品趋势：`getPromotionPostTrend`

## 降级规则

- 如果当前环境缺少某个 Affiliate、Published、Interaction、Campaign 或统计 tool：
  - 明确说明“当前环境未同步该工具”
  - 如用户问完整定义，指向仓库文档：`docs/aitoearn-monetization-mcp-spec.md`
- 如果任务、活动或互动证据需要的主键不完整：
  - 停下来收集主键
  - 不要用别的工具硬凑

## 输出风格

- 始终先给用户当前步骤与结论
- 每次推荐任务时保留 `taskId`
- 每次副作用调用后，明确告诉用户：
  - 刚刚执行了什么
  - 下一步应该查哪个主键
- 当能力缺失时，明确说“当前环境未提供该 MCP tool”，不要说“平台不支持”
