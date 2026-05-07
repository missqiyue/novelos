#!/usr/bin/env bash
# ============================================================
# NovelOS Longform — Web 构建脚本
# 输出: dist/ 目录（纯前端静态文件）
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "  NovelOS Longform — Web Build"
echo "========================================="

cd "$PROJECT_DIR"

# 1. 检查 Node.js
if ! command -v node &>/dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    echo "   https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低 (当前: $(node -v))，需要 18+"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# 2. 检查 npm
if ! command -v npm &>/dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi
echo "✅ npm $(npm -v)"

# 3. 安装前端依赖
echo ""
echo "📦 安装前端依赖..."
npm install --prefer-offline 2>&1 | tail -3

# 4. 构建前端
echo ""
echo "🔨 构建前端 (Vite)..."
npm run build

# 5. 验证输出
DIST_DIR="$PROJECT_DIR/dist"
if [ -d "$DIST_DIR" ]; then
    echo ""
    echo "✅ 构建成功！"
    echo ""
    echo "📁 输出目录: $DIST_DIR"
    echo "📊 文件列表:"
    ls -lh "$DIST_DIR/assets/" 2>/dev/null || true
    echo ""
    echo "💡 部署方式:"
    echo "   # 本地预览"
    echo "   npx vite preview"
    echo ""
    echo "   # 部署到 Nginx"
    echo "   cp -r dist/* /usr/share/nginx/html/"
    echo ""
    echo "   # 部署到 Vercel"
    echo "   vercel --prod"
    echo ""
    echo "⚠️  注意: Web 版需要后端 API 支持。当前构建仅输出前端静态文件。"
    echo "   完整部署需配合 Tauri HTTP 服务端模式。"
else
    echo "❌ 构建失败：dist/ 目录未生成"
    exit 1
fi
