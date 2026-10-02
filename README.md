# dsh-ai-launcher

右侧栏「AI 网页」启动面板 —— 在 DeepSeek Harness 的右侧 Sidebar 里一键打开常用 AI 网页版。

内置 12 个站点：DeepSeek、豆包、通义千问、ChatGPT、Kimi、智谱清言、腾讯元宝、文心一言、Claude、Gemini、Copilot、Grok。内置站点和自定义站点都可以删除，删掉的内置站点能一键恢复。

## 安装

Web 侧栏 → **插件** → **添加插件**，输入仓库地址；或命令行：

```bash
dsh plugin --profile web add github:Qiannianyuxie/dsh-ai-launcher
```

装好后把它选入组合包（插件页打开开关，或在 profile 的 `package.json` 里把它追加进 `dsh.profile.bundles`），然后重启或等 HMR 生效。

本地开发时也可以直接指向源码目录：

```bash
dsh plugin --profile web add /path/to/dsh-ai-launcher
```

## 用法

右侧栏「开始」页会出现 **AI 网页** 入口框；打开后是一格一格的站点卡片：

- **点卡片** → 在右侧栏内置「浏览器」页签里打开，站点留在对话旁边，和「浏览器」入口是同一条路径（`ctx.sidebarRight.openTab("browser", …)`）。
- **卡片角落 ↗** → 改在系统浏览器新标签页打开。只在侧栏页签真的可用时才画——此时主点击走侧栏，这个按钮才有意义；侧栏不可用时主点击本身已经开新标签，就不重复画。
- **卡片角落 ×** → 删除站点，**内置站点一样能删**。删除只是隐藏（记进 `removed`），头栏会出现**恢复默认**，点一下全部找回。
- **添加站点** → 填名称和网址，存在浏览器 `localStorage`（键 `dsh-ai-launcher.v1`），只存本机。

### 打开方式的降级链

正常路径是侧栏。只有一种情况会退回新标签页：右侧栏没有可用的浏览器页签（`ui-sidebar-browser` 未启用，或当前没有会话）。这时点击仍然有反应，不会给你一个点了没反应的死控件——smoke 测试两条路径都覆盖了。

### 关于 iframe 白板

DeepSeek、ChatGPT、豆包这些站点大多下发 `X-Frame-Options` / `CSP frame-ancestors`。**Desktop 端不受影响**：内置浏览器走 Electron `<webview>`，是独立的 guest 进程，不是 iframe。**纯 Web 端**才会撞这条限制——如果侧栏里显示白板，用角落的 ↗ 改走系统浏览器。

Web profile 里内置浏览器默认关闭，要启用就在 profile 的 `cordis.patch.yml` 加：

```yaml
- id: ui-sidebar-browser
  disabled: false
```

Desktop profile 默认就是开的，无需改动。

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半部，空实现：本插件不碰宿主进程 |
| `client.js` | 浏览器半部：注册 tab 类型、guide 入口、面板正文 |
| `cordis.patch.yml` | 把插件行插进 roster |
| `package.json` | `dsh.bundle.patch` + `dsh.client` 声明 |
| `locale/*.json` | 插件页显示的标题与描述 |

无构建步骤，无第三方依赖（React 用页面模块表里那一份）。

## License

MIT
