# NovelOS Longform Brand Assets

这套品牌方案围绕三个关键词展开：

- `长篇叙事`：两侧外弯的竖向笔画像展开的书页，也像长篇卷轴的两端。
- `系统编排`：中间金色连接笔画构成 `N`，象征 NovelOS 的“操作系统感”和章节流水线。
- `多 Agent 协作`：三段不同颜色的笔画组成统一结构，代表规划、生成、审校等不同能力协同。

## 色板

- `Ink Navy`：`#102033`
- `Paper Sand`：`#F7F0E2`
- `Chapter Gold`：`#F3B44C`
- `Agent Teal`：`#38D0C6`

## 文件说明

- `app-icon.svg`：桌面图标母版，适合用来生成 `icns`、`ico` 和各尺寸 PNG。
- `logo-mark.svg`：图形标，不带文字。
- `logo-horizontal.svg`：横版 logo，适合 README、发布页或启动页使用。

## 重新导出 Tauri 图标

在 [`novelos-app`](./) 目录下执行：

```bash
npm run tauri icon branding/app-icon.svg --output src-tauri/icons
```
