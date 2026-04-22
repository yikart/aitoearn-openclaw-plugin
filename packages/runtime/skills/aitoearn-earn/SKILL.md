---
name: aitoearn-earn
description: Use this skill when the user wants a lobster that actively looks for income opportunities, turns money-making actions into content, keeps looping through creator tasks, affiliate earnings, campaigns, published-task tracking, and monetization review, or needs Xiaohongshu task completion via the browser tool while routing Douyin creator tasks through MCP tools first.
---

# AiToEarn Earn

用这个 skill 处理“主动赚钱的龙虾”这类角色经营场景。

默认把这只龙虾视为一个会自己找机会、做内容、接任务、看收益、继续扩张的拟人化赚钱角色。

这个 skill 的目标不是解释某个工具，而是替它推进一条完整经营闭环：

1. 先摸清当前环境、任务主键和可执行平台
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
- 小红书登录与 browser 约束：`references/browser-login.md`
- 小红书 browser 站内执行：`references/xhs-browser-playbook.md`
- 如果只是要确认整体能力范围：`references/current-mcp-capability.md`

## 触发场景

当用户出现这些目标时使用本 skill：

- 想让龙虾或某个内容角色主动赚钱
- 想从内容获客切到接任务、推广或活动变现
- 想知道现在最适合走哪条赚钱路径
- 想执行某一步赚钱动作，并继续往下推进
- 想查看已发布记录、收益、结算或任务数据
- 想完成小红书任务，但当前只能靠 `browser` tool 补站内动作或发布
- 想确认小红书是否已登录、需要不需要先引导在 browser 里登录
- 想做抖音任务、抖音发布或抖音账号链路，并希望优先走 China 环境 MCP

## 开始前必做

- 任何发布链路开始前，先调用 `getAiToEarnEnvironment`
- 不要只凭平台名或当前工具名猜环境能力
- 如果当前环境缺少某个 tool，明确说“当前环境未提供该 MCP tool”
- 如果缺默认必填主键（如 `taskId`、`userTaskId`）或缺用户明确执行意图，先停下来收集信息
- 小红书链路开始前，先判断当前是否存在 `browser` tool
- 小红书接任务和发布都不以前置后端账号检查为条件；不要先调 `getAccount*` 看是否已绑定账号
- 小红书链路一律先判登录态；已经登录就继续，不要重复输出整段登录引导
- 任何准备传给 MCP、HTTP 或 browser 提交链路的字段，都必须有真实来源：只能来自用户明确提供、任务详情、上一个工具返回或当前页面实际读取
- `schema required` 不等于可以编造值；缺真实值时应该停止并收集信息，而不是伪造参数继续调用
- 绝不索要账号密码、验证码或 Cookie；登录只能让用户在 browser 里手动完成

## 主动推进原则

- 用户只说“让龙虾去赚钱”时，不要先反问一串泛问题；先用只读能力侦察当前最容易落地的路径
- 默认目标是先帮它拿到第一笔可验证收益，而不是先做一份空泛商业计划
- 优先选择既能赚钱、又能沉淀下一条内容资产的动作
- 只读查询和状态跟踪可以主动向前推进一层
- 小红书任务如果当前缺 MCP 发布或专用站点 tool，但存在 `browser` tool，可以主动推进到登录态检测、页面读取和取证准备
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

### 5. 涉及小红书时补 browser 链路

只要任务平台是小红书，或用户明确说要在小红书里评论、点赞、收藏、关注、发笔记、截图取证，都要额外读取：

- `references/browser-login.md`
- `references/xhs-browser-playbook.md`

## 角色化边界

- 允许轻度使用“龙虾”角色设定帮助确定内容方向、选题和赚钱方式
- 不要把 skill 变成纯角色扮演
- 角色设定不能覆盖工具调用规则、环境限制和副作用边界
- 不把录制或 demo 文案写进 skill 输出
- 如果用户没有给人设细节，默认把龙虾理解为“会找任务、会晒单、会复盘收益、会继续找下一笔钱”的内容角色

## 全局硬约束

- 可以在用户目标明确、信息齐全时直接执行的 AiToEarn 主流程动作只有：
  - `acceptTask`
  - `submitTask`
  - `submitInteractionTask`
  - `submitBrandCommentTask`
- `browser` 的只读动作可以主动推进：
  - 打开页面
  - `snapshot`
  - `act kind="wait"`
  - `act kind="evaluate"`
  - `screenshot`
- `browser` 的这些有副作用动作，只有用户明确说“现在执行”时才能做：
  - 评论
  - 点赞
  - 收藏
  - 关注
  - 发布作品
  - 最终点击提交或发布按钮
- 这些高风险或不可逆 MCP 动作，只有用户明确说“现在执行”时才能调用：
  - `applyFreeSample`
  - `bindAffiliateInviteCode`
  - `createInteractionRecord`
  - `deleteInteractionRecord`
  - `applyCampaign`
  - `submitCampaignContent`
- 抖音任务默认优先走 China 环境 MCP / `publishPostToDouyin`；不要因为小红书需要 browser 补链路，就把抖音也默认改走 browser
- 小红书当前没有 MCP 发布；只有在当前环境存在 `browser` tool 时，才允许走 browser-assisted 链路
- 小红书接任务默认不需要任何账号，也不需要 `accountId`；不要先调 `getAccountGroupList`、`getAccountListByGroupId`、`getAllAccounts`、`getAccountDetail` 检查是否已绑定账号
- 小红书 `acceptTask` 如果报 `Account not found`，也不要改口说“完成任务需要账号”；这说明后端当前把接单错误地拦到了账号校验上，不改变“小红书任务完成本身不需要任何账号”这条规则
- 小红书发布相当于直接操作浏览器发布，不走后端发布账号链路；开始前只检查 `browser` tool 和登录态
- 小红书链路里，先检测登录态，再决定是否引导登录；已登录时不要重复讲登录步骤
- `browser` 不提供小红书业务幂等，不要假装当前环境有这些工具：
  - `getSearchWorks`
  - `commentWork`
  - `openWork`
  - `getComments`
- 小红书默认只有评论任务需要截图；发布任务不需要截图，完成标准是拿到真实 `workLink`
- `brand_comment` 任务在打开小红书页面前，先调用 `getBrandCommentTargetWork` 取评论目标作品和提交所需元数据
- `brand_comment` 任务只能用 `getBrandCommentTargetWork` 或任务详情 / 上游工具返回的真实 `workLink` 进入评论页；拿不到真实 `workLink` 时停止，不要改走搜索或猜测目标作品
- 小红书评论任务的截图不是 `submitTask` 参数；截图必须先走本地上传工具 `uploadAssetFromPath`，拿到确认后的资产 URL，再调用对应的 screenshot-based submit tool
- 当前已确认：
  - `getBrandCommentTargetWork` 用于 brand-comment 评论目标获取
  - `submitTask` 不用于 screenshot-based interaction / brand-comment
  - `submitInteractionTask` 用于 screenshot-based interaction
  - `submitBrandCommentTask` 用于 brand-comment
- 每次接任务前都必须先看 `getTaskDetail`
- 公开市场创作者任务默认按 `listTaskMarket -> getTaskDetail -> acceptTask` 推进
- 在这条主线里，`acceptTask` 默认主键是 `taskId`
- 如果任务平台是小红书，`acceptTask` 默认按最小真实参数集推进；通常只传 `taskId`，不额外查账号绑定，也不补 `accountId`
- `accountId`、`opportunityId`、`materialId`、`shippingAddress`、`depositAmount`、`sampleMode` 等都属于条件性字段；只有任务详情明确要求，或实际调用报错明确指出缺少这些字段时才补。对小红书来说，`Account not found` 不属于补 `accountId` 的依据
- 所有参数都遵守同一条规则：没有真实值就不要传。空字符串、只含空格的字符串、空数组、以及像 `shippingAddress` 这样展开后全为空白值的空对象，都直接省略整个字段
- 字段来源不明时，直接停下来说明缺口；不要为了“先试一下”编一个看起来像真的值
- 示例：不要传 `materialId: " "`、`opportunityId: " "`，也不要传内容全为空白的 `shippingAddress`
- 所有发布参数都先按真实内容类型收敛：视频内容只传视频字段，图片内容只传图片字段；不要为了“凑 schema”同时传互斥的图片和视频字段
- 所有媒体 URL 和 URL 数组字段都先做真实值过滤，再决定是否传参；空字符串、空白字符串、明显占位值、`.invalid` 域名 URL、以及 `https://placeholder.invalid/remove-me` 这类占位链接，都视为不存在
- `imgUrlList` 必须特别严格处理：过滤后如果没有真实图片 URL，就整个字段都不要传；`imgUrlList: [\"https://placeholder.invalid/remove-me\"]` 视为“空字段”，不是“有一张图”
- 不允许为了通过发布校验伪造媒体值：不要补默认图、不要补占位图、不要补占位 URL，也不要把占位 `imgUrlList` 和真实视频字段混传
- 不要因为 schema 里存在某个字段，就提前告诉用户“现在卡在这个字段”
- 不允许为了通过 schema、绕过报错或凑齐请求体而编造任意可选字段
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
- 除积分外，其余金额、收益、钱包、佣金、结算相关字段都按分为单位理解（即最小货币单位，如 cents / fen），并结合返回里的 `currency` 解释；不要擅自把它们当成主货币单位
- 向用户复述任务奖励、佣金或结算金额时，必须先换算后再说
- 默认只输出换算后的金额字符串，不要补“原始值”“按分解释”这类说明
- 示例：`reward: 100` 且 `currency: USD`，输出 `1usd`；`reward: 50` 且 `currency: USD`，输出 `0.5usd`；`reward: 5` 且 `currency: USD`，输出 `0.05usd`
- 只有用户明确要求原始值时，才单独给原始值；默认不要主动补充换算过程

## 降级规则

- 缺工具：说明当前环境未提供该 MCP tool，不要假装能执行
- 缺默认必填主键：停下来收集，不要用别的字段硬凑
- 可选字段条件不明：先按 `taskId` 主线推进，不要把 `opportunityId` 或 `materialId` 提前说成阻断项
- 组织 tool 参数时，没有真实值的字段直接删掉；不要把“占位空值”传给 agent
- 小红书缺 `browser` tool：停在任务准备阶段，明确说当前没法补站内动作或发布
- 小红书接任务或发布时，不要因为没查到后端账号而停止；只有缺 `browser`、缺登录态、缺真实素材或缺真实 `workLink` 时才停止
- 小红书 `acceptTask` 如果被后端以 `Account not found` 拦下：停在“后端当前错误拦截接单”阶段，明确说完成小红书任务本身不需要任何账号；不要改写成“需补账号”或“先绑定小红书账号”
- `brand_comment` 任务如果当前没有 `getBrandCommentTargetWork`，或调用后仍拿不到真实 `workLink`：停在目标获取阶段，不要自己搜索目标作品页
- 小红书评论任务如果当前没有 `uploadAssetFromPath`：停在已截图阶段，明确说当前还不能把截图上传成可提交的 URL
- 小红书发布任务如果拿不到真实 `workLink`：停止提交，不要拿截图兜底
- 发布字段在清洗占位值后如果为空，直接停止并明确说“当前缺少真实媒体 URL / 当前参数仍是占位值”，不要继续重试占位值方案
- 视频发布如果只拿到真实视频素材，就不要再传 `imgUrlList`；图片发布如果 `imgUrlList` 过滤后为空，也不要伪造图片参数
- 非小红书 MCP 发布链路缺平台账号：停在准备阶段，不要伪造发布能力
- 平台在策略里但没有注册对应工具：说明“当前未提供该 publish tool”，不要说成“平台不支持”
- 平台不在当前环境支持矩阵里：不要尝试走 `publishPostTo*`

## 输出风格

- 始终先告诉用户“现在该做什么”
- 默认输出结构优先是：
  - 当前阶段
  - 当前最优赚钱路径
  - 这笔钱怎么变成下一轮内容或机会
  - 下一步动作
  - 已确认需要补的主键或条件
- 推荐任务或候选路径时，保留稳定主键
- 推荐公开市场任务时，默认把下一步写成“可按 `taskId` 尝试接单”；只有详情或实际报错明确要求时，才改写成“需补账号”“需补样品信息”或别的已确认条件
- 小红书任务推荐下一步时，不要把“先查账号是否绑定”“需补 `accountId`”写成默认前置
- 小红书 `acceptTask` 如果返回 `Account not found`，对外表述必须收敛成“后端当前错误拦截了接单，但完成小红书任务本身不需要任何账号”，不要表述成“需要账号才能完成”
- 每次副作用调用后，明确告诉用户：
  - 刚刚执行了什么
  - 下一步应该查哪个主键
- 解释金额时，默认只输出换算后的金额字符串，例如 `0.05usd`
