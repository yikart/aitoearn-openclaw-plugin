# AiToEarn 当前可用 MCP 能力

本文件面向用户说明 AiToEarn 当前可用的赚钱相关 MCP 能力，供 `aitoearn-earn` skill 执行时参考。

注意：

- 插件会在启动时按 `baseUrl` 自动判定 `China / Global / self_hosted`
- 插件会本地注册 `getAiToEarnEnvironment`
- 插件不会把服务端提供的全部 `publishPostTo*` 原样注册出来，而是会按环境过滤

## 能力概览

## MCP 发布平台策略与注册规则

发布类任务先看 `getAiToEarnEnvironment`，不要直接以“服务端提供了某个 `publishPostTo*`”推断当前环境可用。

### China

China 策略仅支持这些平台的 MCP 发布：

- 抖音
- 快手
- 哔哩哔哩
- 微信公众号

补充说明：

- 小红书当前不支持 MCP 发布
- `douyin` 属于 China 策略允许平台，但当前未提供 `publishPostToDouyin`

### Global

Global 策略仅支持这些平台的 MCP 发布：

- TikTok
- YouTube
- Twitter
- Facebook
- Instagram
- Threads
- Pinterest
- LinkedIn

补充说明：

- `linkedin` 属于 Global 策略允许平台，但当前未提供 `publishPostToLinkedIn`

### 环境工具字段说明

- `policyPlatforms`：当前环境策略允许的平台
- `registeredPublishPlatforms`：插件当前实际注册的平台
- `policyButMissingPublishPlatforms`：策略允许，但当前未提供对应 publish tool 的平台
- `unsupportedPublishPlatforms`：服务端虽然提供了 publish tool，但当前环境策略不允许，插件已过滤的平台

## 当前可用的赚钱相关 tools

### 任务市场与接单

- `listTaskMarket`
- `getTaskDetail`
- `acceptTask`

说明：

- 以上工具可用于浏览任务、查看详情和接任务

### 我的任务与提交

- `listMyUserTasks`
- `getMyUserTaskDetail`
- `submitTask`

说明：

- `submitTask` 支持两种模式：
  - `userTaskId + workLink`
  - `userTaskId + publishRecordId`

### 样品单

- `applyFreeSample`
- `listMySampleOrders`
- `getMySampleOrderDetail`

说明：

- 样品单相关工具当前可用

### Affiliate

- `getAffiliateLink`
- `bindAffiliateInviteCode`
- `getAffiliateOverview`
- `listAffiliateCommissions`
- `getAffiliateSettlement`

说明：

- 以上工具覆盖推广链接、邀请码、返佣总览、返佣明细与结算信息

### 已发布任务

- `listMyPublishedTasks`
- `getMyPublishedTaskDetail`

说明：

- 以上工具覆盖 `My Tasks -> Published` 列表与详情

### 互动任务证据

- `createInteractionRecord`
- `listInteractionRecords`
- `deleteInteractionRecord`

说明：

- 以上工具覆盖互动任务证据的创建、查询与删除

### Campaign 探店/活动

- `listCampaignMarket`
- `getCampaignDetail`
- `applyCampaign`
- `listMyCampaignApplications`
- `getCampaignVerifyCode`
- `submitCampaignContent`

说明：

- 以上工具覆盖活动浏览、详情、报名、核销码与作品提交

### 任务统计与推广作品

- `getTaskPostsDataCube`
- `getTaskPostsTrend`
- `listPromotionPosts`
- `getPromotionPostDetail`
- `getPromotionPostTrend`

说明：

- 以上工具覆盖任务统计、推广作品列表、详情与趋势

## 支撑完成任务的已有内容工具

### 素材与爬取

- `createCrawlTask`
- `getCrawlTaskStatus`
- `createMedia`
- `listMedia`
- `listMediaGroups`
- `getMediaGroupInfoByName`

### 草稿与 AI 生成

- `createDraft`
- `listDrafts`
- `getDraftDetail`
- `deleteDraft`
- `listDraftGroups`
- `getDraftGroupInfoByName`
- `getDraftGenerationPricing`
- `createVideoDraft`
- `createImageTextDraft`
- `getDraftTaskStatus`

### 账号与发布

- `getAccountGroupList`
- `getAccountListByGroupId`
- `getAllAccounts`
- `getAccountDetail`
- `publishRestrictions`
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
- `getPublishingTaskStatus`

说明：

- 上面是当前可用的 publish tools，不等于当前插件在任意环境都会注册
- 实际可调用集合以 `getAiToEarnEnvironment.registeredPublishPlatforms` 和当前工具注册结果为准

## 当前 skill 支持的闭环

### 普通任务

1. 浏览任务市场
2. 查看任务详情
3. 接任务
4. 查询我的任务
5. 准备内容
6. 发布或直接提供作品链接
7. 提交任务

### 样品任务

1. 查看任务详情
2. 携带地址和押金信息接任务
3. 申请免费样品
4. 查询样品单

### Affiliate

1. 查询推广链接
2. 绑定邀请码
3. 查询返佣总览
4. 查询返佣明细
5. 查询结算信息

### 已发布任务

1. 查询 `My Tasks -> Published`
2. 查询单个已发布任务详情

### 互动任务

1. 创建互动证据
2. 查询互动证据列表
3. 删除误记录

### Campaign 活动

1. 浏览活动市场
2. 查看活动详情
3. 报名活动
4. 查询我的报名
5. 查询核销码
6. 提交活动作品

### 任务统计

1. 查询任务聚合统计
2. 查询任务趋势
3. 查询推广作品列表
4. 查询推广作品详情
5. 查询推广作品趋势

## 环境差异处理

如果当前 `baseUrl` 对应的环境还没同步到同一批 tools，skill 应明确说明：

- 这是环境差异，不是产品能力缺失
- 完整接口契约已经整理在 `docs/aitoearn-monetization-mcp-spec.md`
- 有工具就执行，缺工具就降级说明

## 执行规则

- 只有 `acceptTask`、`submitTask` 这类主流程动作可以在用户目标明确时直接执行
- `bindAffiliateInviteCode`、`applyFreeSample`、`createInteractionRecord`、`deleteInteractionRecord`、`applyCampaign`、`submitCampaignContent` 必须有用户明确执行意图
- 但每次接任务前必须先看 `getTaskDetail`
- 不要伪造主键或用户内容
- 如果用户缺素材或作品链接，优先复用当前已有内容工具，不要直接结束流程
- 做发布类任务时，先按环境判断平台是否支持 MCP 发布：
  - `China` 只走抖音、快手、哔哩哔哩、微信公众号
  - `Global` 只走 TikTok、YouTube、Twitter、Facebook、Instagram、Threads、Pinterest、LinkedIn
  - 小红书不走 MCP 发布链路
- 如果 `policyPlatforms` 包含平台，但 `registeredPublishPlatforms` 不包含：
  - 说明当前未提供对应 publish tool
  - 不要伪造本地能力
