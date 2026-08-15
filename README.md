# 便利贴（bianlitie）

一个极简、快速、Markdown 优先的私人 Obsidian 备忘录入口，兼容 Windows、iOS 和 Android。

![Obsidian](https://img.shields.io/badge/Obsidian-1.5%2B-7c3aed)
![Version](https://img.shields.io/github/v/release/sosoyyyyy/bianlitie)
![Mobile](https://img.shields.io/badge/mobile-iOS%20%7C%20Android-1769e0)

## 功能

- 蓝白配色的独立便利贴界面，适配桌面端与手机窄屏
- 保存前手动选择「工作 / 生活 / 副业」一级分类
- 每条记录保存为 `便利贴/<分类>/` 下的独立 Markdown 文件
- 原始正文先原样保存，AI 失败不影响记录
- 本地搜索正文、文件标题、二级标签和检索关键词
- 可选使用 DeepSeek 生成二级标签与检索关键词
- 「问便利贴」先在本地检索，再让 DeepSeek 依据候选记录回答并显示可点击来源

## 使用 BRAT 安装

1. 在 Obsidian 的第三方插件市场安装并启用 **BRAT**。
2. 打开 BRAT 设置，选择 **Add Beta Plugin**。
3. 填入：

   ```text
   https://github.com/sosoyyyyy/bianlitie
   ```

4. 安装完成后，在「设置 → 第三方插件」中启用「便利贴」。
5. 点击左侧功能栏的便利贴图标，或从命令面板执行「便利贴：打开便利贴」。

BRAT 会跟踪本仓库的 GitHub Release，并在有新版本时提供更新。

## 手动安装

从最新 [Release](https://github.com/sosoyyyyy/bianlitie/releases/latest) 下载以下文件：

- `manifest.json`
- `main.js`
- `styles.css`

将它们放到 Vault 的配置目录：

```text
.obsidian/plugins/bianlitie/
```

重新加载 Obsidian 后启用插件。

## 数据格式

插件首次启用时会按需创建：

```text
便利贴/
├── 工作/
├── 生活/
└── 副业/
```

每条便利贴都是人类可直接阅读的 Markdown 文件，例如：

```markdown
---
category: 工作
created: 2026-08-16 03:00
tags:
  - 示例
keywords:
  - 示例关键词
---

原始正文内容
```

核心数据不会只保存在插件专属数据库中。

## DeepSeek 与隐私

DeepSeek 是可选能力。API Key 需要由用户在 Obsidian 的插件设置页自行填写，源码和发布文件中不包含任何 Key。

启用后：

- 保存便利贴时，插件可能将当前原文发送到 DeepSeek API，用于生成标签和检索关键词。
- 使用「问便利贴」时，插件会把本地检索到的候选记录发送到 DeepSeek API 生成回答。
- AI 不会决定「工作 / 生活 / 副业」一级分类，也不会改写原始正文。

插件自身不包含 WebDAV、云同步或账号系统。如需跨设备同步，请使用 Obsidian Sync、Remotely Save 等独立方案，并自行评估其安全性。

## 移动端兼容性

`manifest.json` 明确设置 `isDesktopOnly: false`。运行时代码只使用 Obsidian 的跨平台 Plugin API，不依赖：

- Node.js `fs` / `path`
- Electron API
- `FileSystemAdapter`
- 桌面端专属功能

## 本地开发

需要 Node.js 18 或更高版本：

```bash
npm install
npm run build
npm run check
```

生产构建会在仓库根目录生成 `main.js`。`npm run check` 会验证 manifest、必要产物与桌面专属运行时依赖。

## 发布新版本

1. 同步更新 `manifest.json`、`package.json` 和 `versions.json` 中的版本。
2. 运行 `npm run build && npm run check`。
3. 提交代码并创建与 manifest 版本完全相同的标签，例如 `0.1.1`。
4. 推送标签。GitHub Actions 会构建并发布 BRAT 所需的三个 Release 资产。

## 许可证

[0BSD](LICENSE)
