# AiToEarn OpenClaw Plugin

AiToEarn 社交媒体管理工具的 OpenClaw 插件。

## 安装

```bash
npx @aitoearn/openclaw-plugin
```

这个命令会自动：

1. 检查本机是否已安装 `openclaw`
2. 检查并安装 `@aitoearn/openclaw-plugin`
3. 引导输入 API Key 和环境
4. 验证连通性并写入 `plugins.entries.aitoearn.config`

## 手动安装

```bash
openclaw plugins install @aitoearn/openclaw-plugin
openclaw config set plugins.entries.aitoearn.enabled true --strict-json
openclaw config set plugins.entries.aitoearn.config.apiKey "your-api-key"
openclaw config set plugins.entries.aitoearn.config.baseUrl "https://aitoearn.ai/api"
```

如果你想使用 SecretRef，也可以改成 OpenClaw 标准写法，例如：

```bash
openclaw config set plugins.entries.aitoearn.config.apiKey \
  --ref-provider default \
  --ref-source env \
  --ref-id AITOEARN_API_KEY
```

## 获取 API Key

1. 打开 [aitoearn.ai](https://aitoearn.ai/)（国际）或 [aitoearn.cn](https://aitoearn.cn/)（中国）
2. 注册并登录
3. 点击左侧菜单 **设置**
4. 在 **API Key** 中点击创建，复制生成的 Key

## 兼容命令

```bash
openclaw aitoearn setup
```

这条命令仍可用，但后续推荐优先使用：

```bash
npx @aitoearn/openclaw-plugin
```

完成配置后，重启 Gateway：

```bash
openclaw gateway restart
```

## MCP Tools 同步

插件会在 Gateway 启动时自动从 AiToEarn MCP 拉取最新 tools，并缓存到 OpenClaw state dir。

- AiToEarn 新增或调整 tools 后，不需要升级这个插件包
- 只需要重启 Gateway，让插件在启动时重新同步
- 如果启动时远端暂时不可用，插件会优先回退到上一次成功同步的本地快照
