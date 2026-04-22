# AiToEarn 赚钱场景索引

本文件只做场景导航，不承载完整执行细节。

## 使用方式

- 不要默认全量读取所有 reference
- 先判断用户现在处于赚钱闭环的哪一阶段，再读取对应文档
- 如果只是要确认当前场景结构、能力范围和 reference 分工，再看本文件

## 当前 skill 的目标场景

这是一个“主动赚钱的龙虾”场景型 skill。

目标不是单纯回答某个工具怎么用，而是帮助一个拟人化角色持续推进这条闭环：

1. 判断当前环境和可发布平台
2. 判断今天最容易赚到哪一笔钱
3. 把赚钱动作本身变成内容资产
4. 执行任务、推广或报名动作
5. 跟踪已发布记录、收益和数据
6. 给出下一轮优化建议

默认经营思路是：

1. 先侦察环境和机会
2. 先拿离钱最近的一条路径
3. 再把赚钱过程内容化
4. 用结果继续滚动下一轮机会

## 按阶段读取 reference

- 场景总闭环、默认工作顺序、输出结构：
  - `scenario-loop.md`
- 选哪条赚钱路径、各路径进入条件与优先级：
  - `monetization-paths.md`
- 环境判断、平台矩阵、发布前检查：
  - `environment-and-publishing.md`
- 具体工具执行链路和关键主键：
  - `execution-playbooks.md`
- 小红书登录态与 browser 约束：
  - `browser-login.md`
- 小红书 browser 站内执行、评论截图上传与发布提交：
  - `xhs-browser-playbook.md`

## 当前覆盖的赚钱能力

- 创作者任务：浏览任务、接任务、提交任务、样品单
- 小红书 browser-assisted：登录态检测、品牌评论目标获取、搜索、详情、互动、评论截图上传、发布 `workLink` 提交
- 品牌评论任务目标获取能力已存在：`getBrandCommentTargetWork`
- 截图型任务提交能力已存在：`submitInteractionTask`、`submitBrandCommentTask`、`submitFollowAccountTask`
- 当前 skill 默认只把小红书评论任务走截图上传链路；follow-account 是否走截图提交流程，以任务详情和 tool description 为准
- Affiliate：推广链接、邀请码、返佣总览、返佣明细、结算
- 已发布任务：`My Tasks -> Published` 列表与详情
- 互动证据：创建、查询、删除互动记录
- Campaign：活动市场、报名、核销码、活动作品提交
- 数据分析：任务数据、推广作品详情与趋势

## 通用提醒

- 发布链路开始前先调 `getAiToEarnEnvironment`
- 抖音如果出现在 `registeredPublishPlatforms` 里，默认优先走 MCP / `publishPostToDouyin`
- 小红书没有 MCP 发布；只有在当前存在 `browser` tool 时，才走 browser-assisted 链路
- 小红书接任务和发布都不走后端账号检查；不要先调 `getAccount*`，也不要把任何账号或 `accountId` 当成默认前置
- 小红书 `acceptTask` 如果返回 `Account not found`，要明确这是后端当前把接单错误拦到了账号校验上，不代表完成小红书任务需要账号
- 小红书链路开始前先判登录态；已经登录就继续，不要重复引导登录
- `brand_comment` 任务开始评论前，先调 `getBrandCommentTargetWork(taskId)` 取目标作品；只用返回里的真实 `workLink` 进入评论页
- 如果 `getBrandCommentTargetWork` 调用后仍没有真实 `workLink`，就停在目标获取阶段；不要改走搜索或手动猜链接
- 当前有本地工具 `uploadAssetFromPath`；评论截图必须走这个工具，不把上传动作当成 AiToEarn MCP 远端 tool
- 小红书评论任务提交时，`uploadAssetFromPath` 返回里的确认后资产 `url` 才是可提交的 `screenshotUrl` / `screenshotUrls`
- 小红书发布任务只用真实 `workLink`；不要把截图带进发布提交链路
- 当前环境缺少某个 tool 时，要明确说“当前环境未提供该 MCP tool”
- 当前 `acceptTask` 的默认理解是：公开市场接单主键为 `taskId`，其余字段按任务条件补齐
- 如果任务平台是小红书，`acceptTask` 默认按最小真实参数集推进；通常只传 `taskId`，不额外查账号绑定，不补 `accountId`
- 如果小红书 `acceptTask` 被 `Account not found` 拦下，停下来说明这是后端当前阻塞，不要把它解读成“需补账号”
- 不要因为 schema 里存在 `opportunityId` 或 `materialId`，就提前把它们当成默认阻断项
- 所有条件性参数都按“没有真实值就不传”处理；不要传空字符串、空白占位值、空数组或全空对象
- 所有待传字段都必须有真实来源；`schema required` 也不代表可以编造
- 所有发布工具都遵守同一条媒体规则：按真实内容类型互斥传参，不为满足 schema 混传图片和视频字段
- 所有媒体 URL 字段都必须剔除占位值；`.invalid` 域名 URL 和 `https://placeholder.invalid/remove-me` 一律视为不存在，`imgUrlList` 没有真实图就整个不传
- `submitTask` 不用于 screenshot-based interaction / brand-comment；评论截图任务优先走 `submitInteractionTask` 或 `submitBrandCommentTask`
- 除积分外，其余金额、收益、钱包、佣金、结算相关字段都按分为单位理解（即最小货币单位，如 cents / fen），并结合返回里的 `currency` 解释；不要擅自把它们当成主货币单位
- 对外输出金额时，默认只给换算后的金额字符串：例如 `reward: 100` + `currency: USD` 输出 `1usd`
- 不要补“原始值”“按分解释”这类说明；除非用户明确要求原始值
- 具体执行时以当前已注册 tool 的 `description`、`inputSchema` 和环境结果为准
