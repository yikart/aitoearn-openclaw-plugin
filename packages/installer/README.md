# AiToEarn OpenClaw Installer

用这个包提供 `npx` 安装体验：

```bash
npx -y @aitoearn/openclaw-plugin-cli
```

升级已通过 npm 安装的 AiToEarn OpenClaw 插件：

```bash
npx -y @aitoearn/openclaw-plugin-cli upgrade
```

运行时插件包是 `@aitoearn/openclaw-plugin`，安装与更新由宿主 `openclaw plugins install/update` 完成。
运行这个 CLI 之前，宿主环境里需要已经可以直接执行 `openclaw` 命令。
