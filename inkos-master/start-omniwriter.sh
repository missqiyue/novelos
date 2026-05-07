#!/bin/bash

# ==========================================
# OmniWriter 一键启动脚本
# ==========================================

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}       启动 OmniWriter 自动化流水线       ${NC}"
echo -e "${BLUE}==========================================${NC}"

# 获取当前脚本所在目录作为项目根目录
ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RAG_SERVER_DIR="$ROOT_DIR/packages/rag-server"
BOOK_DIR="$ROOT_DIR/my-first-book"

# 1. 检查 Python 依赖并启动 RAG 微服务
echo -e "\n${GREEN}[1/3] 正在启动 Python RAG 微服务 (端口 8088)...${NC}"
cd "$RAG_SERVER_DIR" || exit 1

# 如果存在虚拟环境，优先激活
if [ -d "venv" ]; then
    source venv/bin/activate
    echo "已激活 Python 虚拟环境"
fi

# 在后台启动 Uvicorn (使用 python3 -m 避免 pip 找不到命令)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload > rag_server.log 2>&1 &
RAG_PID=$!
echo "RAG 微服务已在后台启动 (PID: $RAG_PID)"

# 2. 检查并准备书籍目录
echo -e "\n${GREEN}[2/3] 正在检查/初始化书籍目录...${NC}"
if [ ! -d "$BOOK_DIR" ]; then
    echo "未找到书籍目录，正在创建 my-first-book..."
    mkdir -p "$BOOK_DIR"
    cd "$BOOK_DIR" || exit 1
    # 初始化一本新书
    node ../packages/cli/dist/index.js init . > /dev/null 2>&1
else
    cd "$BOOK_DIR" || exit 1
    echo "已进入书籍目录: $BOOK_DIR"
fi

# 检查 4567 端口是否被占用，如果有则清理
PORT_PID=$(lsof -t -i:4567 2>/dev/null)
if [ -n "$PORT_PID" ]; then
    echo -e "${RED}发现 4567 端口被占用 (PID: $PORT_PID)，正在清理...${NC}"
    kill -9 $PORT_PID
    sleep 1
fi

# 3. 启动 Inkos Studio
echo -e "\n${GREEN}[3/3] 正在启动 Inkos Studio (端口 4567)...${NC}"
echo -e "你可以随时按 ${RED}Ctrl+C${NC} 停止所有服务。\n"

# 捕获 Ctrl+C (SIGINT) 信号，优雅地关闭后台的 RAG 服务
trap "echo -e '\n${RED}正在停止所有服务...${NC}'; kill $RAG_PID; exit" INT

# 在前台启动 Studio (这样终端能看到实时的 Log)
# 注入环境变量，告诉 Node.js 去 8088 端口找 RAG 服务
# 优先使用 pnpm dlx 替代 npx，因为系统环境里可能没有全局安装 tsx
RAG_API_URL="http://localhost:8088" node ../packages/cli/dist/index.js studio
