# AiToEarn OpenClaw Plugin

AiToEarn 社交媒体管理工具的 OpenClaw 插件。

## 一键安装

```bash
npx -y @aitoearn/openclaw-plugin
```

这个命令会自动：

1. 将当前插件包安装到 OpenClaw 的扩展目录
2. 自动检测是否为已有安装
3. 首次安装时引导输入 API Key 和环境
4. 验证连通性
5. 写入 `plugins.entries.aitoearn.config`

## 手动配置

```bash
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

如果你的 npm 版本会在首次执行时提示确认安装包，统一使用：

```bash
npx -y @aitoearn/openclaw-plugin
```

升级插件：

```bash
npx -y @aitoearn/openclaw-plugin upgrade
```

再次执行默认命令时，如果检测到已有 `aitoearn` 配置，会自动按升级处理并跳过 setup。

完成配置后，重启 Gateway：

```bash
openclaw gateway restart
```

插件会根据 `baseUrl` 自动判定环境并注入本地环境工具：

- `*.aitoearn.cn` => `China`
- `*.aitoearn.ai` => `Global`
- 其他域名 => `self-hosted`

启动后会注册 `getAiToEarnEnvironment`，并且只注册当前环境允许的 `publishPostTo*`。

## MCP Tools 同步

插件会在 Gateway 启动时自动从 AiToEarn MCP 拉取最新 tools，并缓存到 OpenClaw state dir。

- AiToEarn 新增或调整 tools 后，不需要升级这个插件包
- 只需要重启 Gateway，让插件在启动时重新同步
- 如果启动时远端暂时不可用，插件会优先回退到上一次成功同步的本地快照
