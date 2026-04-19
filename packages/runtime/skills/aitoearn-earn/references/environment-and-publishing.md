# 环境与发布

## 何时读本文件

- 用户问某个平台能不能发
- 用户要走“为了完成任务而发布”的链路
- 用户问当前环境支持哪些发布平台
- 用户问为什么当前看不到某个 `publishPostTo*`

## 环境判断

发布类任务先看 `getAiToEarnEnvironment`，不要直接以“服务端提供了某个 `publishPostTo*`”推断当前环境可用。

- 插件按 `baseUrl` 自动判定环境：
  - `*.aitoearn.cn` => `China`
  - `*.aitoearn.ai` => `Global`
  - 其他域名 => `self_hosted`
- 插件启动时只注册当前环境允许的 `publishPostTo*`

## 环境工具字段

- `policyPlatforms`：当前环境策略允许的平台
- `registeredPublishPlatforms`：插件当前实际注册的平台
- `policyButMissingPublishPlatforms`：策略允许，但当前未提供对应 publish tool 的平台
- `unsupportedPublishPlatforms`：服务端虽然提供了 publish tool，但当前环境策略不允许，插件已过滤的平台

## 发布平台矩阵

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

## 决策规则

- 如果目标平台不在当前环境支持矩阵里：
  - 不要尝试走 `publishPostTo*`
  - 直接说明当前环境不支持该平台的 MCP 发布
  - 必要时改走已有 `workLink` 提交，或者停在内容准备阶段
- 如果目标平台在策略矩阵里，但 `registeredPublishPlatforms` 没有：
  - 明确说明这是“当前未提供该 publish tool”
  - 不要说成“平台不支持”
- `self_hosted` 默认以当前发现到的 publish tools 为准

## 发布前检查

- 先确认目标平台账号
- 先调 `getAiToEarnEnvironment`
- 先确认内容类型和素材
- 必要时先查 `publishRestrictions`
- 对 Bilibili 和 YouTube 这类需要分类的场景，先查分类工具
- 任何“为了完成任务而发布”的场景，都要把 `userTaskId` 透传到 `publishPostTo*`

## 当前可用内容与发布支撑工具

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
