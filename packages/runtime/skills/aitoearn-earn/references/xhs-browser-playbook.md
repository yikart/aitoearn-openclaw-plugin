# 小红书 Browser Playbook

## 何时读本文件

- 任务平台是小红书
- 需要在小红书里评论、点赞、收藏、关注
- 需要在小红书里发笔记或发布作品
- 需要对小红书页面截图取证

## 先说约束

- 小红书当前没有 MCP 发布；站内动作和发布默认靠 `browser` tool 补齐
- 小红书接任务和发布都不走后端账号链路；不要先调 `getAccount*` 检查是否已绑定账号
- 小红书接任务默认不需要任何账号，也不需要 `accountId`
- 小红书 `acceptTask` 如果报 `Account not found`，要明确这是后端当前错误拦截接单，不代表完成任务需要账号
- 先判登录态；已登录就继续，未登录才读取 `browser-login.md`
- 当前仓库没有小红书专用 tool；不要假装有 `getSearchWorks`、`commentWork`
- `brand_comment` 任务开始评论前，先调 `getBrandCommentTargetWork` 取目标作品和提交元数据
- 小红书默认只有评论任务需要截图；发布任务不需要截图，发布完成标准是拿到真实 `workLink`
- 小红书评论截图不是 `submitTask` 参数；截图必须走本地工具 `uploadAssetFromPath`
- 所有待传字段都必须有真实来源；不要为了过 schema、绕过报错或凑请求体去编造值
- 每次导航、打开详情、切换弹层或发布后，都重新 `snapshot`；旧 `ref` 在导航后不稳定
- 评论、点赞、收藏、关注、发布都必须等用户明确说“现在执行”

## 默认工具策略

- 读取页面结构：优先 `snapshot`
- 读取复杂 DOM 数据、虚拟列表、评论列表：用 `act kind="evaluate"`
- 点按钮、输文字、等待页面状态：优先 `act`
- 评论截图取证：用 `screenshot`
- 评论目标作品获取：`brand_comment` 任务先用 `getBrandCommentTargetWork`
- 截图 URL 上传：只通过 `uploadAssetFromPath`
- 小红书发帖素材上传：使用 browser 的页面文件上传能力，把本地媒体文件传给网页上传控件；这和 `uploadAssetFromPath` 不是同一类上传

## 评论任务先取目标作品

默认只对 `brand_comment` 任务启用这条链路。

固定流程：

1. 先调 `getBrandCommentTargetWork`
2. 参数至少带：
   - `taskId`
3. 只有在你要把上一个目标标成 `lose` 并切下一个目标时，才额外带：
   - `dataDid`
   - `status`
4. 只用返回里的真实 `workLink` 作为 browser 要打开的目标作品页
5. `dataId`、`dataDid`、`source`、`sourceDataId` 保留给后续 `submitBrandCommentTask`

停止条件：

- 当前环境没有 `getBrandCommentTargetWork`
- 调用后仍没有真实 `workLink`

出现这些情况时：

- 停在目标获取阶段
- 明确说明当前还拿不到可评论的真实作品链接
- 不要改走搜索页兜底，不要手拼或猜测目标链接

## 关键词搜索作品

这个能力只用于人工核对、非任务探索，或用户明确要求搜索。

它不是 `brand_comment` 评论任务的默认取目标方式，不能替代 `getBrandCommentTargetWork`。

搜索页 URL：

`https://www.xiaohongshu.com/search_result?keyword=$关键词&source=web_search_result_notes`

搜索后优先做这几步：

1. `open` 或 `navigate` 到搜索页
2. `wait` 到列表渲染
3. `snapshot`
4. 需要结构化结果时，用 `evaluate` 读取当前页作品列表

读取当前页作品列表示例：

```js
return Array.from(document.querySelectorAll('.feeds-container > section'))
  .map((v) => ({
    title: v.querySelector('.title span')?.innerText?.trim() ?? '',
    author: v.querySelector('.name-time-wrapper .name')?.innerText?.trim() ?? '',
    authorLink: v.querySelector('.card-bottom-wrapper > a')?.href ?? '',
    workLink: v.querySelector('.cover')?.href ?? '',
  }))
  .filter((v) => v.workLink);
```

## 搜索筛选

筛选面板适合用 `evaluate` 读取，再按下标执行。

读取筛选状态示例：

```js
return await (async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const real = (n, c) => [...(n?.children || [])].filter(
    (e) => e.classList.contains(c) && !e.hasAttribute('button-hp-installed')
  );
  const txt = (e) => (e?.textContent || '').replace(/\s+/g, '');
  const open = async () => {
    const el = document.querySelector('.filter');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent('mouseenter', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      relatedTarget: document.body
    }));
    for (let i = 0; i < 20; i++) {
      const panel = document.querySelector('.filter-panel>.filter-container');
      if (panel) return panel;
      await wait(60);
    }
    return null;
  };
  const p = await open();
  if (!p) return { ok: false, reason: 'no filter panel' };
  return {
    ok: true,
    f: [...p.querySelectorAll('.filters-wrapper>.filters')].map((g) => {
      const x = real(g.querySelector('.tag-container'), 'tags');
      return [txt(g.firstElementChild), x.findIndex((e) => e.classList.contains('active')), x.map(txt)];
    }),
    a: real(p.querySelector('.operation-container'), 'operation').map(txt)
  };
})()
```

规则：

- 先读状态，再按下标选择
- 忽略带 `button-hp-installed` 的隐藏节点
- 不要按文本重扫整个 DOM 做模糊点击

## 分页和虚拟列表

小红书搜索列表是虚拟列表。默认做法：

1. 先读取当前批次作品
2. 用 `evaluate` 把页面滚到第 15 个卡片附近
3. 再次读取列表并按 `workLink` 去重

滚动示例：

```js
return await (async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const readList = () => Array.from(document.querySelectorAll('.feeds-container > section'))
    .map((v) => ({
      title: v.querySelector('.title span')?.innerText?.trim() ?? '',
      author: v.querySelector('.name-time-wrapper .name')?.innerText?.trim() ?? '',
      workLink: v.querySelector('.cover')?.href ?? ''
    }))
    .filter((v) => v.workLink);

  const getKey = (item) => item.workLink || `${item.title}__${item.author}`;
  const before = readList();
  if (before.length < 15) return { ok: false, reason: 'list < 15', before };
  const anchor = document.querySelector('.feeds-container > section:nth-child(15)');
  if (!anchor) return { ok: false, reason: 'no anchor', before };
  const beforeKeys = new Set(before.map(getKey));
  const top = window.scrollY + anchor.getBoundingClientRect().top - 120;
  window.scrollTo(0, Math.max(0, top));

  let after = [];
  for (let i = 0; i < 20; i++) {
    await wait(200);
    after = readList();
    if (after.some((item) => !beforeKeys.has(getKey(item)))) break;
  }

  const map = new Map();
  [...before, ...after].forEach((item) => map.set(getKey(item), item));
  const list = [...map.values()];
  return { ok: list.length > before.length, list };
})()
```

## 作品详情

打开详情后，先 `snapshot`，再按需要用 `evaluate` 读取结构化信息。

详情读取示例：

```js
return {
  isFollow: document.querySelector('.note-detail-follow-btn')?.innerText === '已关注',
  authorLink: document.querySelector('.info > a')?.href ?? '',
  authorName: document.querySelector('.username')?.innerText ?? '',
  editTime: document.querySelector('.date')?.innerText ?? '',
  desc: document.querySelector('#detail-desc')?.innerText ?? '',
  title: document.querySelector('#detail-title')?.innerText ?? '',
  likeCount: +(document.querySelector('.like-wrapper .count')?.innerText ?? 0),
  collectCount: +(document.querySelector('#note-page-collect-board-guide .count')?.innerText ?? 0),
  commentCount: +(document.querySelector('.chat-wrapper .count')?.innerText ?? 0)
};
```

## 评论列表

一级评论读取示例：

```js
return Array.from(document.querySelectorAll('.parent-comment')).map((v) => ({
  author: v.querySelector('.author .name')?.innerText ?? '',
  authorLink: v.querySelector('.author a')?.href ?? '',
  content: v.querySelector('.right > .content')?.innerText ?? '',
  count: v.querySelector('.count')?.innerText ?? '',
  commentTime: v.querySelector('.date span:first-child')?.innerText ?? '',
  ip: v.querySelector('.date span:last-child')?.innerText ?? ''
}));
```

查看更多评论：

- 用 `evaluate` 执行 `document.querySelector('.note-scroller')?.scroll(0, 9999999)`
- 看到 `.end-container` 说明没有更多
- 如果评论长度没增加且没有 `.loading`，可以视为当前批次已加载完成

## 评论

默认优先用 `snapshot` + `click` + `type` + `click` 完成。

推荐流程：

1. 先确保已经通过 `getBrandCommentTargetWork`、任务详情或上游工具拿到了真实 `workLink`
2. 打开作品详情并 `snapshot`
3. 生成与作品内容相关的评论文本
4. 等用户明确说“现在执行”
5. 点击评论入口
6. 输入评论
7. 点击发送
8. 重新读取评论列表或页面状态验证成功
9. `screenshot` 留证
10. 把截图文件上传成截图 URL
11. 再按任务类型调用对应的 screenshot-based submit tool

如果普通点击/输入失败，再回退到页内脚本：

```js
return await (async () => {
  return new Promise((resolve) => {
    document.querySelector('.chat-wrapper')?.click();
    setTimeout(() => {
      const el = document.querySelector('#content-textarea');
      if (!el) return resolve({ ok: false, reason: 'no textarea' });
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, $comment);
      setTimeout(() => {
        const btn = document.querySelector('.right-btn-area .submit');
        if (!btn) return resolve({ ok: false, reason: 'no submit' });
        btn.click();
        setTimeout(() => {
          resolve({
            ok: document.querySelectorAll('.parent-comment .content')[0]?.innerText === $comment
          });
        }, 1000);
      }, 10);
    }, 10);
  });
})()
```

## 评论截图上传

适用条件：

- 当前任务是小红书评论任务
- 当前已经拿到了评论成功后的截图
- 当前环境存在 `uploadAssetFromPath`

固定流程：

1. 从截图结果里拿到本地文件路径
2. 调 `uploadAssetFromPath`
3. 参数固定带：
   - `filePath`
   - `type: "temp"`
4. 使用返回里的确认后资产 `url` 作为截图 URL

提交规则：

- `brand_comment`：优先调用 `submitBrandCommentTask`
- `brand_comment` 提交里的 `dataId`、`dataDid`、`source`、`sourceDataId`、`workLink` 优先沿用 `getBrandCommentTargetWork` 返回的真实值；不要自己补、自己猜或手拼链接
- screenshot-based `interaction`：调用 `submitInteractionTask`
- 不要把评论截图默认交给 `submitTask`
- 不要把评论截图默认写进 `createInteractionRecord`
- `screenshotUrl` / `screenshotUrls` 只能用 `uploadAssetFromPath` 返回的真实 URL；不要伪造截图 URL

如果当前环境没有 `uploadAssetFromPath`：

- 停在“截图已生成”阶段
- 明确说明当前还无法把截图上传成 `screenshotUrl`
- 不要伪造截图 URL

## 点赞、收藏、关注

这些动作都必须等用户明确说“现在执行”。当前 skill 不默认要求对这些动作截图。

点赞示例：

```js
return await (async () => {
  return new Promise((resolve) => {
    const getLike = () => document.querySelector('.interact-container .like-wrapper .like-icon use')?.href?.baseVal === '#liked';
    if (!getLike()) document.querySelector('.interact-container .like-wrapper')?.click();
    setTimeout(() => resolve({ like: getLike() }), 1000);
  });
})()
```

收藏示例：

```js
return await (async () => {
  return new Promise((resolve) => {
    const getCollect = () => document.querySelector('.interact-container #note-page-collect-board-guide use')?.href?.baseVal === 'collected';
    if (!getCollect()) document.querySelector('.interact-container #note-page-collect-board-guide')?.click();
    setTimeout(() => resolve({ collect: getCollect() }), 1000);
  });
})()
```

详情页关注示例：

```js
return await (async () => {
  return new Promise((resolve) => {
    const getFollow = () => document.querySelector('.interaction-container .author-wrapper .note-detail-follow-btn button')?.innerText === '已关注';
    if (!getFollow()) document.querySelector('.interaction-container .author-wrapper .note-detail-follow-btn button')?.click();
    setTimeout(() => resolve({ follow: getFollow() }), 1000);
  });
})()
```

作者主页关注示例：

```js
return await (async () => {
  return new Promise((resolve) => {
    const getFollow = () => document.querySelector('.info-right-area button')?.innerText === '已关注';
    if (!getFollow()) document.querySelector('.info-right-area button')?.click();
    setTimeout(() => resolve({ follow: getFollow() }), 1000);
  });
})()
```

## 小红书发布

适用条件：

- 平台是小红书
- 当前没有可走的 MCP 发布链路
- 当前存在 `browser` tool
- 用户可手动登录，且已准备好真实图片或视频素材

默认流程：

1. 先判登录态
2. 不做后端账号检查，不调用 `getAccount*`，也不补 `accountId`
3. 打开小红书发布入口
4. 根据任务内容判断走图文还是视频
5. 使用 browser 的页面文件上传能力，把本地图片或视频文件传给小红书网页的上传控件
6. 等待媒体处理完成
7. 用 `snapshot` / `type` / `fill` 填标题、正文、标签
8. 等用户明确说“现在执行”
9. 点击发布
10. `wait` 到发布结果页、作品详情页或可复制作品链接的状态

发布成功后的提交规则：

- 小红书发布不需要截图
- `workLink` 只能来自发布成功后的真实页面结果或可验证的真实跳转结果；不要手拼链接、猜链接或伪造链接
- 如果拿到了真实 `workLink`，再回到 AiToEarn 主链路走 `submitTask`
- 如果拿不到真实 `workLink`，停止提交，不要拿截图兜底

## 评论任务截图取证

这些节点适合截图：

- 评论成功之后

截图输出时要同时告诉用户：

- 现在截图对应的是哪个动作
- 这张截图还不是最终可提交 URL
- 下一步是调用 `uploadAssetFromPath` 上传截图，再调用对应的 screenshot-based submit tool
