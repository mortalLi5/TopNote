# TopNote · 顶部笔记

一个从 Windows 屏幕顶部展开的学习笔记与分组备忘录工具。

TopNote 把记录动作放到视线正上方：鼠标移到屏幕顶部中央即可展开窗口，学习笔记按日期保存，备忘录支持工作、学习、生活等分组，窗口支持移动、全屏、深色和浅色主题。

## 下载

前往 [TopNote 宣传页](https://topnote.fuzzylion.chatgpt.site) 下载 Windows 安装包，或打开本仓库的 [Releases](https://github.com/mortalLi5/TopNote/releases) 页面。

## 功能

- 顶部中央悬浮触发，悬停展开
- 每日学习笔记和自动保存
- Markdown 编辑、代码块和快捷键
- 可命名的每日笔记
- 支持分组的备忘录
- 深色 / 浅色主题
- 可移动、可调整大小、可全屏的圆角窗口

## 本地开发

```bash
npm install
npm run dev
```

构建 Windows 安装包：

```bash
npm run dist
```

## 数据位置

笔记和备忘录保存在用户文档目录的 `顶部笔记` 文件夹中，窗口状态保存在 `%APPDATA%\topnote`，更新应用不会覆盖已有数据。

## 宣传页源码

`website/` 是静态宣传页的源码快照，线上版本位于 [topnote.fuzzylion.chatgpt.site](https://topnote.fuzzylion.chatgpt.site)。
