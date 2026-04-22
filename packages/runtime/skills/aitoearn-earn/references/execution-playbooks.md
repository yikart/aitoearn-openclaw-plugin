# 执行 Playbooks

## 何时读本文件

- 已经确定当前要走哪条赚钱路径
- 需要具体工具链、关键主键和执行顺序

## 0. 从零开始时的主动侦察

当用户只说“让龙虾开始赚钱”，但还没指定具体路径时，先做只读侦察，不要直接问一串泛问题。

推荐顺序：

1. `getAiToEarnEnvironment`
2. `listTaskMarket`
3. `getAffiliateLink`
4. `getAffiliateOverview`
5. 如果用户明确关心活动，或角色更适合活动型内容，再看 `listCampaignMarket`

侦察后立刻收敛成一句明确建议：

- 今天先赚哪一笔钱
- 为什么这条路离钱最近
- 这一步怎么顺手变成内容资产
- 下一步需要哪个主键或确认

不要把任务、Affiliate、Campaign 三条路同时铺开成长清单。默认只选一条主线推进。

## 1. 创作者任务

### 浏览任务

1. 调 `listTaskMarket`
2. 优先按这些维度筛选和排序：
   - 明确指定的平台
   - 明确指定的任务类型
   - 奖励更高
   - 名额还充足
   - 更容易顺手产出可复用内容
3. 给出精简推荐，并保留 `taskId`
4. 默认把公开市场任务视为可按 `taskId` 直连接单，不要先假设缺 `opportunityId` 或 `materialId`
5. 组织 `acceptTask` 参数时，先收敛成“最小真实参数集”；没有真实值的字段都不要传。空字符串、只含空格的字符串、空数组，以及展开后全为空白值的空对象字段都直接省略

### 查看详情再接单

1. 调 `getTaskDetail`
2. 检查任务类型、平台、奖励，以及详情里是否明确要求指定账号、样品地址、押金或样品模式；如果平台是小红书，不把后端账号绑定当作默认检查项
3. 如果详情没有明确阻断项，默认下一步就是按 `taskId` 准备调 `acceptTask`
4. 只有详情明确要求，或 `acceptTask` 实际报错时，才补其他字段；但如果平台是小红书且报错是 `Account not found`，不要补账号，直接视为后端当前错误拦截

接单时按任务类型补齐参数：

- 公开市场普通任务：
  - 默认只需要 `taskId`
  - 如果平台是小红书，默认只传 `taskId`；不要先调 `getAccountGroupList`、`getAccountListByGroupId`、`getAllAccounts`、`getAccountDetail`，也不要补 `accountId`
  - 如果平台是小红书且 `acceptTask` 返回 `Account not found`，明确说明这是后端当前错误地按账号拦截了接单；完成小红书任务本身不需要任何账号，不要再建议绑定账号
  - 如果任务详情明确要求账号，或用户明确指定发布账号，补 `accountId`
  - 不要因为 schema 里存在 `opportunityId` 或 `materialId`，就提前告诉用户“现在卡在这两个字段”
- 样品任务：
  - 默认先保留 `taskId`
  - 根据任务详情或实际报错补 `shippingAddress`
  - 根据任务详情或实际报错补 `depositAmount`
  - 根据任务详情或实际报错补 `sampleMode`
- 如果任何条件性字段当前只有空字符串、空格、空数组或空白占位值，不要传占位值；缺值就省略，等任务详情或实际报错再补
- 所有待传字段都必须有真实来源；来源只能是用户明确提供、任务详情、上一个工具返回或当前页面实际读取。不要为了过 schema 或“先试一下”编造值

推荐任务后的下一步动作只允许收敛成这几类：

- `可直接尝试接取`：已有 `taskId`，且详情未发现明确阻断
- `需补账号`：仅适用于非小红书，且详情明确要求账号，或用户明确指定要用某个账号执行
- `需补样品信息`：样品任务明确要求地址、押金或样品模式
- `需按实际报错再补字段`：详情没有明确额外要求，但接单后若接口报缺字段，再按报错补
- `后端当前错误拦截接单`：仅适用于小红书 `acceptTask` 返回 `Account not found`；这时应明确说明完成小红书任务本身不需要任何账号

### 查询我的任务

1. 优先调 `listMyUserTasks`
2. 用户指定某个任务后再调 `getMyUserTaskDetail`

### 任务类型决策

- `promotion`
  - 按普通发布/提交链路处理
  - 优先走 `publishPostTo*` 或 `workLink -> submitTask`
  - 如果平台是小红书，且当前没有可走的 MCP 发布 tool，但存在 `browser` tool，则改走小红书 browser 发布链路
- `sample`
  - 按样品任务链路处理
  - 关注 `shippingAddress`、`depositAmount`、`sampleMode`
- `interaction`
  - 优先走互动证据链路
  - 如果当前环境提供 `submitInteractionTask`，且任务详情或 tool description 明确这是 screenshot-based interaction，再走截图上传 + `submitInteractionTask`
  - 只有当详情明确还需要 `workLink` 或 `publishRecordId` 时，才继续走 `submitTask`
- `brand_comment`
  - 视为评论型互动任务
  - 优先补 `commentContent`、`commentTime`
  - 如果平台是小红书，先调 `getBrandCommentTargetWork` 拿目标作品和提交元数据，再走 browser 评论 + 截图上传 + `submitBrandCommentTask`
- `follow_account`
  - 不要自动伪造 `workLink`
  - 如果当前环境没有专用完成工具，就说明缺口并停止在证据收集阶段
  - 如果平台是小红书，不要默认走截图提交流程；只有任务详情或 tool description 明确要求截图时，才考虑专用 submit tool

### 小红书 browser-assisted 任务

适用条件：

- 任务平台是小红书
- 当前没有可走的小红书 MCP 发布链路或专用站点 tool
- 当前环境存在 `browser` tool

开始前顺序固定为：

1. `getTaskDetail`
2. 确认这是评论、点赞、收藏、关注、发布中的哪一类
3. 如果当前还没接单，先按最小真实参数集准备 `acceptTask`；默认只传真实存在的字段。小红书任务不要先查后端账号绑定，也不要补 `accountId`
4. 如果小红书 `acceptTask` 返回 `Account not found`，停下来说明这是后端当前错误拦截接单，不要改写成“需要账号”或继续补 `accountId`
5. 检查是否已经有 `userTaskId`
6. 如果任务类型是 `brand_comment`，先调用 `getBrandCommentTargetWork`
7. 读取 `browser-login.md` 判登录态
8. 已登录则直接继续；未登录才停下来等用户手动登录

评论型小红书任务：

1. 如果任务类型是 `brand_comment`，先调 `getBrandCommentTargetWork`，至少传 `taskId`
2. `brand_comment` 提交所需的 `dataId`、`dataDid`、`source`、`sourceDataId` 优先沿用 `getBrandCommentTargetWork` 返回的真实值
3. `brand_comment` 只用 `getBrandCommentTargetWork` 返回的真实 `workLink` 打开目标作品页；如果调用后仍没有真实 `workLink`，就停止，不要改走搜索或猜测目标作品
4. 如果是非 `brand_comment` 的评论型任务，只能用任务详情或上游工具返回的真实 `workLink` 打开目标作品页；缺真实链接时同样停止
5. 在 browser 打开目标作品页
6. 每次导航后重新 `snapshot`
7. 用户明确说“现在执行”后，再做评论
8. 动作完成后立即 `screenshot`
9. 如果当前环境没有 `uploadAssetFromPath`，停下来说明当前没法把截图上传成可提交的 URL
10. 调 `uploadAssetFromPath`
11. 参数固定带：
   - `filePath`
   - `type: "temp"`
12. 使用返回里的确认后资产 `url` 作为截图 URL
13. 如果任务类型是 `brand_comment`，优先调用 `submitBrandCommentTask`
14. 组织 `submitBrandCommentTask` 参数时，`dataId`、`dataDid`、`source`、`sourceDataId`、`workLink` 都只传真实值；优先沿用 `getBrandCommentTargetWork` 已返回或已解析出的字段，不要手拼或重猜
15. 如果任务详情或当前注册 tool description 明确这是 screenshot-based `interaction`，调用 `submitInteractionTask`
16. 不要把评论截图默认写进 `createInteractionRecord`，也不要再走 `submitTask`

非评论型小红书互动任务：

1. 先确认任务详情或上游工具已经给出了真实目标作品页链接
2. 如果当前没有真实目标作品页链接，停下来说明当前还缺真实 `workLink`，不要改走搜索或猜测目标页
3. 在 browser 打开真实目标作品页
4. 每次导航后重新 `snapshot`
5. 用户明确说“现在执行”后，再做点赞、收藏、关注
6. 不要默认截图
7. 只有任务详情或当前注册 tool description 明确要求截图时，才走专用 screenshot-based submit tool
8. 如果当前环境没有明确的后续 submit tool，就停下来说明当前还缺明确提交能力，不要强行套评论截图流程

发布型小红书任务：

1. 先准备真实图片或视频素材
2. 不做后端账号检查，不调用 `getAccount*`，也不补 `accountId`
3. 检查登录态
4. 打开小红书发布入口
5. 用 browser 上传素材、填写标题和正文
6. 用户明确说“现在执行”后，再点击发布
7. 发布完成后优先获取真实 `workLink`
8. 有真实 `workLink` 才继续 `submitTask`
9. 拿不到真实 `workLink` 就停止，不要拿截图兜底，也不要猜测链接

### 完成并提交普通任务

- 已有作品链接：
  - 直接 `submitTask`
  - 参数：`userTaskId + workLink`
- 还没有作品链接，但需要在 AiToEarn 内发帖：
  - 先准备内容
  - 先根据草稿类型、素材结果和任务上下文判断这是视频还是图片内容
  - 再先清洗媒体字段；空字符串、空白值、明显占位值、`.invalid` 域名 URL、以及 `https://placeholder.invalid/remove-me` 一律当成不存在
  - 视频内容只传真实视频字段，不传图片字段；图片内容只传真实图片字段，不传视频字段
  - `imgUrlList` 过滤后如果为空，就整个字段都删掉；不要传 `imgUrlList: [\"https://placeholder.invalid/remove-me\"]` 这种占位数组
  - 再发布，并把 `userTaskId` 一并透传给 `publishPostTo*`
  - 用 `getPublishingTaskStatus` 跟进发布结果
  - 如果发布结果只给 `flowId`，再用 `getMyPublishedTaskDetail(flowId)` 反查 `publishRecordId`
  - 再 `submitTask`
- 还没有作品链接，但平台是小红书，且只能靠 browser 发帖：
  - 先按小红书 browser 发布链路完成发布
  - 发布后优先查真实 `workLink`
  - 只有拿到 `workLink` 时才继续 `submitTask`
  - 如果拿不到 `workLink`，不要继续提交，也不要用截图兜底或手拼链接

发布阶段额外规则：

- 所有待传字段都必须有真实来源；不要为了通过接口校验临时编一个看起来像真的值
- 视频任务如果当前只有真实视频 URL，没有真实图片 URL，就不要再尝试补 `imgUrlList`
- 图片任务如果清洗后没有真实图片 URL，直接说明“缺少真实图片素材”，不要继续拿占位值重试
- 如果发布接口因为图片 / 视频互斥规则报错，不要再用占位图或默认图继续试
- 没拿到 `flowId` 前，不要口头说“发布成功”
- 小红书 browser 发布没拿到真实 `workLink` 前，不要口头说“已经可以提交任务”

完成后补一句：

- 这次任务结果后续还能复用成什么内容或证明材料
- 下一轮适合继续接类似任务，还是转到 Affiliate / 复盘

### 样品单

1. 接单时先补齐样品地址和押金相关信息
2. 用户明确要求申请免费样品时再调 `applyFreeSample`
3. 后续用 `listMySampleOrders` 和 `getMySampleOrderDetail` 跟进

## 2. Affiliate 与已发布任务

### Affiliate

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
- 如果龙虾刚完成任务、刚拿到样品体验、刚沉淀出可讲述案例，优先建议把这些结果顺手接到 Affiliate 变现

### 已发布任务

1. 列表：`listMyPublishedTasks`
2. 详情：`getMyPublishedTaskDetail`

处理规则：

- 用户有 `userTaskId` 时优先用它查详情
- 其次可以用 `publishRecordId` 或 `flowId`
- 如果用户要核对某次提交是否已经形成已发布作品，这一组工具优先级高于普通 `listMyUserTasks`
- `listMyPublishedTasks.time` 的业务语义是 `[startTime, endTime]`

## 3. 互动证据

1. 记录证据：`createInteractionRecord`
2. 查询历史证据：`listInteractionRecords`
3. 删除误记录：`deleteInteractionRecord`

处理规则：

- 至少确认 `accountId`、`platform`、`worksId`
- 只有在任务详情、用户输入或已有工具结果里真实给出了 `accountId` 时才传；不要为了补证据记录去猜账号 ID
- 有评论动作时优先补 `commentContent` 和 `commentTime`
- 有点赞/收藏动作时补对应时间字段
- 小红书评论任务优先走截图上传 + 对应 submit tool；`createInteractionRecord` 只在任务详情或用户明确需要额外留证时才用
- `deleteInteractionRecord` 只有用户明确说要删除哪条记录时才执行

## 4. Campaign 活动

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

## 5. 数据分析

用户要看任务数据或推广作品数据时：

- 任务聚合统计：`getTaskPostsDataCube`
- 任务七日趋势：`getTaskPostsTrend`
- 推广作品列表：`listPromotionPosts`
- 推广作品详情：`getPromotionPostDetail`
- 推广作品趋势：`getPromotionPostTrend`

分析后不要只报数字，要补一句：

- 这只龙虾下一轮更该继续哪条赚钱路径
- 哪类内容或任务最值得继续放大

## 金额提醒

- `reward`
- `depositAmount`
- `pending`
- `settled`
- `paymentAmount`
- `commissionAmount`

除积分外，以上金额、收益、钱包、佣金、结算字段都按分为单位理解（即最小货币单位，如 cents / fen），并结合返回里的 `currency` 解释；不要擅自把它们当成主货币单位。

输出时先换算再说：

- `reward: 100` + `currency: USD` => `1usd`
- `reward: 50` + `currency: USD` => `0.5usd`
- `reward: 5` + `currency: USD` => `0.05usd`
- `amount: 1234` + `currency: USD` => `12.34usd`

默认只输出换算后的金额字符串，不要补“原始值”“按分解释”这类说明。只有用户明确要求原始值时，才单独给原始值。
