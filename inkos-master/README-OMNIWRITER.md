# OmniWriter 快速启动指南

本文档介绍如何使用一键脚本启动 OmniWriter 的双通道服务（Python RAG 引擎 + Node.js 可视化控制台）。

## 1. 为什么需要一键脚本？

OmniWriter 是一个混合架构的系统，它包含了：
- **Python RAG 微服务 (海马体引擎)**：负责向量化索引、上下文召回和逆向工程分析。
- **Inkos Studio (上帝视角面板)**：基于 Node.js 和 React 构建的自动化流水线总控台。

直接手动启动需要分别在两个终端输入冗长的命令，并且很容易出现端口占用（尤其是当你在本地有其他项目占用了 `8000` 或 `5173` 端口时）。

为了解决这些问题，我们提供了 `start-omniwriter.sh` 脚本。它能够：
1. **自动避开端口冲突**：将 Python 服务挂载在 `8088` 端口，Inkos Studio 挂载在 `4567` 端口。
2. **自动检测与初始化**：如果本地没有名为 `my-first-book` 的小说项目，它会自动帮你初始化一本。
3. **优雅的进程管理**：当你按下 `Ctrl+C` 退出控制台时，它会自动帮你清理掉后台静默运行的 Python 进程，防止出现幽灵进程锁死端口。

---

## 2. 如何使用

### 步骤一：进入项目根目录
首先，你需要进入 `inkos-master` 目录：
```bash
cd /Volumes/MOVE/AI/work/writing/自动化/inkos-master
```

### 步骤二：赋予脚本执行权限（仅首次需要）
```bash
chmod +x start-omniwriter.sh
```

### 步骤三：一键启动
直接在终端执行以下命令：
```bash
./start-omniwriter.sh
```

### 步骤四：访问上帝视角面板
看到终端输出 `Starting InkOS Studio on http://localhost:4567` 后，打开你的浏览器访问：
👉 **http://localhost:4567**

在左侧边栏点击 **“全景上帝视角”** 图标（眼睛形状），即可开始体验包括手术刀编辑、伏笔星图、爆款克隆等四大革命性面板。

---

## 3. 常见问题排查 (FAQ)

### Q1: 脚本提示 `command not found: python3` 或 `ModuleNotFoundError: No module named 'fastapi'`？
这说明你的 Python 环境缺少运行 RAG 微服务所需的依赖。
**解决办法**：手动安装一次依赖（仅需执行一次）：
```bash
cd packages/rag-server
python3 -m pip install -r requirements.txt
```

### Q2: 浏览器打开 http://localhost:4567 一直转圈或者白屏？
可能是 Node.js 端在编译或者依赖未安装完整。
**解决办法**：确保你在 `inkos-master` 根目录下执行过以下命令安装和编译依赖：
```bash
pnpm install
pnpm build
```

### Q3: 启动脚本后，报错 `listen EADDRINUSE: address already in use :::4567`？
这说明你上一次运行的 Inkos Studio 进程卡死了，没有被正确关闭，导致端口依然被占用。
**解决办法**：强制清理占用 `4567` 端口的幽灵进程：
```bash
lsof -i:4567 -t | xargs kill -9
```
然后再次运行 `./start-omniwriter.sh` 即可。

---

## 4. 退出服务

当你完成创作想要关闭系统时，只需要在运行脚本的那个终端窗口里按下键盘的：
**`Ctrl + C`**

脚本会自动捕捉这个退出信号，打印出“正在停止所有服务...”，并帮你把 Python 的后台引擎一起安全关闭。