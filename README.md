# AiToEarn OpenClaw Monorepo

这个仓库现在拆成三个部分：

- `packages/runtime`：真正发布给 OpenClaw 的运行时插件包 `@aitoearn/openclaw-plugin`
- `packages/installer`：负责 `npx` 安装与配置引导的 CLI 包 `@aitoearn/openclaw-plugin-cli`
- `packages/shared`：内部共享的 setup / config / MCP 客户端逻辑，不单独发布

常用命令：

```bash
npm test
npm run build
```
