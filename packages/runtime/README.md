# AiToEarn OpenClaw Plugin

AiToEarn 社交媒体管理工具的 OpenClaw 运行时插件包。

## 推荐安装

```bash
npx -y @aitoearn/openclaw-plugin-cli
```

兼容旧入口：

```bash
npx -y @aitoearn/openclaw-plugin
```

旧命令现在会转发到新的 installer 包。

升级已通过 npm 安装的插件：

```bash
npx -y @aitoearn/openclaw-plugin-cli upgrade
```

这个 CLI 会调用宿主 `openclaw plugins install/update`，并在首次安装时引导写入 `plugins.entries.aitoearn.config`。

## 直接安装运行时包

```bash
openclaw plugins install @aitoearn/openclaw-plugin
```

然后按 OpenClaw 标准方式配置：

```bash
openclaw config set plugins.entries.aitoearn.enabled true --strict-json
openclaw config set plugins.entries.aitoearn.config.apiKey "your-api-key"
openclaw config set plugins.entries.aitoearn.config.baseUrl "https://aitoearn.ai/api"
```

如果你想使用 SecretRef，也可以改成：

```bash
openclaw config set plugins.entries.aitoearn.config.apiKey \
  --ref-provider default \
  --ref-source env \
  --ref-id AITOEARN_API_KEY
```

完成配置后重启 Gateway：

```bash
openclaw gateway restart
```

## 运行时行为

插件会根据 `baseUrl` 自动判定环境并注入本地环境工具：

- `*.aitoearn.cn` => `China`
- `*.aitoearn.ai` => `Global`
- 其他域名 => `self-hosted`

启动后会注册 `getAiToEarnEnvironment`，并只注册当前环境允许的 `publishPostTo*`。

## MCP Tools 同步

插件会在 Gateway 启动时自动从 AiToEarn MCP 拉取最新 tools，并缓存到 OpenClaw state dir。

- AiToEarn 新增或调整 tools 后，不需要升级这个插件包
- 只需要重启 Gateway，让插件重新同步
- 如果启动时远端暂时不可用，插件会优先回退到上一次成功同步的本地快照
