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
5. 组织 `acceptTask` 参数时，没有真实值的字段都不要传。空字符串、只含空格的字符串、空数组，以及展开后全为空白值的空对象字段都直接省略

### 查看详情再接单

1. 调 `getTaskDetail`
2. 检查任务类型、平台、奖励，以及详情里是否明确要求指定账号、样品地址、押金或样品模式
3. 如果详情没有明确阻断项，默认下一步就是按 `taskId` 准备调 `acceptTask`
4. 只有详情明确要求，或 `acceptTask` 实际报错时，才补其他字段

接单时按任务类型补齐参数：

- 公开市场普通任务：
  - 默认只需要 `taskId`
  - 如果任务详情明确要求账号，或用户明确指定发布账号，补 `accountId`
  - 不要因为 schema 里存在 `opportunityId` 或 `materialId`，就提前告诉用户“现在卡在这两个字段”
- 样品任务：
  - 默认先保留 `taskId`
  - 根据任务详情或实际报错补 `shippingAddress`
  - 根据任务详情或实际报错补 `depositAmount`
  - 根据任务详情或实际报错补 `sampleMode`
- 如果任何条件性字段当前只有空字符串、空格、空数组或空白占位值，不要传占位值；缺值就省略，等任务详情或实际报错再补

推荐任务后的下一步动作只允许收敛成这几类：

- `可直接尝试接取`：已有 `taskId`，且详情未发现明确阻断
- `需补账号`：详情明确要求账号，或用户明确指定要用某个账号执行
- `需补样品信息`：样品任务明确要求地址、押金或样品模式
- `需按实际报错再补字段`：详情没有明确额外要求，但接单后若接口报缺字段，再按报错补

### 查询我的任务

1. 优先调 `listMyUserTasks`
2. 用户指定某个任务后再调 `getMyUserTaskDetail`

### 任务类型决策

- `promotion`
  - 按普通发布/提交链路处理
  - 优先走 `publishPostTo*` 或 `workLink -> submitTask`
- `sample`
  - 按样品任务链路处理
  - 关注 `shippingAddress`、`depositAmount`、`sampleMode`
- `interaction`
  - 优先走互动证据链路
  - 只有当详情明确还需要 `workLink` 或 `publishRecordId` 时，才继续走 `submitTask`
- `brand_comment`
  - 视为评论型互动任务
  - 优先补 `commentContent`、`commentTime`
- `follow_account`
  - 不要自动伪造 `workLink`
  - 如果当前环境没有专用完成工具，就说明缺口并停止在证据收集阶段

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

发布阶段额外规则：

- 视频任务如果当前只有真实视频 URL，没有真实图片 URL，就不要再尝试补 `imgUrlList`
- 图片任务如果清洗后没有真实图片 URL，直接说明“缺少真实图片素材”，不要继续拿占位值重试
- 如果发布接口因为图片 / 视频互斥规则报错，不要再用占位图或默认图继续试
- 没拿到 `flowId` 前，不要口头说“发布成功”

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
- 有评论动作时优先补 `commentContent` 和 `commentTime`
- 有点赞/收藏动作时补对应时间字段
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

- `reward: 100` + `currency: USD` => `1 USD`
- `reward: 50` + `currency: USD` => `0.5 USD`
- `amount: 1234` + `currency: USD` => `12.34 USD`

如果要同时保留原始值，写成“原始值 100，按分解释为 1 USD”，不要直接说“100 USD”。
