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
- 如果 `registeredPublishPlatforms` 包含 `douyin`，默认优先走 `publishPostToDouyin`
- 如果目标平台是小红书，且当前环境存在 `browser` tool，可以改走 browser-assisted 发布或互动链路

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
- 如果目标平台是小红书：
  - 不要尝试走 `publishPostTo*`
  - 当前存在 `browser` tool 时，改走 browser-assisted
  - 不要先调 `getAccount*` 检查后端账号是否已绑定
  - 不要把任何账号或 `accountId` 当成小红书接任务或发布的默认前置
  - 当前没有 `browser` tool 时，停在内容准备或任务准备阶段
- `self_hosted` 默认以当前发现到的 publish tools 为准

## 发布前检查

- 先调 `getAiToEarnEnvironment`
- 先确认内容类型和素材
- 如果目标平台不是小红书，按任务详情和当前环境决定是否需要账号；只有真实存在的账号信息才传
- 如果目标平台是小红书，不做后端账号检查；只确认 `browser` tool 和 browser 登录态，已经登录就继续，未登录再引导登录
- 如果小红书 `acceptTask` 返回 `Account not found`，把它视为后端当前错误拦截，不要据此得出“完成小红书任务需要账号”
- 所有待传字段都必须有真实来源；来源只能是用户明确提供、任务详情、上一个工具返回或当前页面实际读取
- `schema required` 不等于可以编造；缺真实值时停止并说明缺口，不要伪造参数绕过
- 先把媒体参数按内容类型收敛：视频只保留视频字段，图片只保留图片字段；不要为了满足 schema 混传互斥媒体字段
- 先清洗所有媒体 URL 和 URL 数组字段，只保留真实值；空字符串、空白值、明显占位值、`.invalid` 域名 URL、以及 `https://placeholder.invalid/remove-me` 都直接删掉
- `imgUrlList` 只要过滤后没有真实图片 URL，就整个字段都不要传；它不能用来塞占位图，也不能在视频发布里拿占位值凑必填
- 必要时先查 `publishRestrictions`
- 对 Bilibili 和 YouTube 这类需要分类的场景，先查分类工具
- 任何“为了完成任务而发布”的场景，都要把 `userTaskId` 透传到 `publishPostTo*`

## 媒体参数规则

- 视频草稿、视频素材、或任务上下文明确是视频内容时：
  - 只传真实视频字段
  - 不传图片数组字段，除非 tool description 明确说该字段是视频封面且允许和视频并存
  - 如果 `imgUrlList` 里只有占位值，例如 `https://placeholder.invalid/remove-me`，视为“没有图片”，不是“有封面”
- 图片或图文内容时：
  - 只传真实图片字段
  - `imgUrlList` 过滤后为空，就视为缺少真实图片素材，停止发布
- 如果 tool / schema 同时表现出“要图片”和“视频图片不能并传”的矛盾：
  - 不要用占位 `imgUrlList` 重试
  - 不要把视频和图片混传
  - 直接说明这是工具侧参数冲突，当前不能靠伪造参数绕过
- 小红书 browser 发布不依赖后端账号绑定，也不需要 `accountId`
- 小红书 browser 发布完成标准是拿到真实 `workLink`
- 不要把截图纳入小红书发布提交链路，也不要拿截图替代 `workLink`

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
- `publishPostToDouyin`
- `publishPostToTwitter`
- `getPublishingTaskStatus`
