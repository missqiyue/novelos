#!/usr/bin/env bash
# ============================================================
# NovelOS Longform — macOS 桌面应用构建脚本
# 输出: .dmg 安装包 + .app 应用包
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================="
echo "  NovelOS Longform — macOS Build"
echo "========================================="

cd "$PROJECT_DIR"

# 1. 检查操作系统
if [[ "$(uname)" != "Darwin" ]]; then
    echo "❌ 此脚本仅支持 macOS"
    exit 1
fi
echo "✅ macOS $(sw_vers -productVersion)"

# 2. 检查 Xcode Command Line Tools
if ! xcode-select -p &>/dev/null; then
    echo "⚠️  未检测到 Xcode Command Line Tools，正在安装..."
    xcode-select --install
    echo "⏳ 请等待 Xcode CLT 安装完成后重新运行此脚本"
    exit 1
fi
echo "✅ Xcode CLT 已安装"

# 3. 检查 Rust
if ! command -v rustc &>/dev/null; then
    echo "⚠️  Rust 未安装，正在安装..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi
RUST_VERSION=$(rustc --version | awk '{print $2}')
echo "✅ Rust $RUST_VERSION"

# 4. 检查 Node.js
if ! command -v node &>/dev/null; then
    echo "❌ Node.js 未安装，请先安装 Node.js 18+"
    echo "   https://nodejs.org/ 或 brew install node"
    exit 1
fi
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低 (当前: $(node -v))，需要 18+"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# 5. 检查 npm
if ! command -v npm &>/dev/null; then
    echo "❌ npm 未安装"
    exit 1
fi
echo "✅ npm $(npm -v)"

# 6. 安装前端依赖
echo ""
echo "📦 安装前端依赖..."
npm install --prefer-offline 2>&1 | tail -3

# 7. 检查 Tauri CLI
echo ""
echo "🔍 检查 Tauri CLI..."
if ! npx tauri --version &>/dev/null; then
    echo "⚠️  Tauri CLI 不可用，将在 npm install 中自动安装"
fi

# 8. 构建应用
echo ""
echo "🔨 构建 NovelOS Longform (Release)..."
echo "   这可能需要几分钟（首次构建会下载和编译 Rust 依赖）..."
npm run tauri:build 2>&1 | tail -20

# 9. 检查构建产物
echo ""
ARCH=$(uname -m)
BUNDLE_DIR="$PROJECT_DIR/src-tauri/target/release/bundle"

echo "📋 检查构建产物..."

if [ -d "$BUNDLE_DIR/dmg" ]; then
    DMG_FILE=$(find "$BUNDLE_DIR/dmg" -name "*.dmg" -type f | head -1)
    if [ -n "$DMG_FILE" ]; then
        DMG_SIZE=$(du -h "$DMG_FILE" | awk '{print $1}')
        echo "✅ DMG: $DMG_FILE ($DMG_SIZE)"
    fi
fi

if [ -d "$BUNDLE_DIR/macos" ]; then
    APP_FILE=$(find "$BUNDLE_DIR/macos" -name "*.app" -type d | head -1)
    if [ -n "$APP_FILE" ]; then
        APP_SIZE=$(du -sh "$APP_FILE" | awk '{print $1}')
        echo "✅ App: $APP_FILE ($APP_SIZE)"
    fi
fi

# 10. 输出使用说明
echo ""
echo "========================================="
echo "  ✅ macOS 构建完成！"
echo "========================================="
echo ""
echo "📁 构建产物目录: $BUNDLE_DIR"
echo ""
echo "💡 安装方式:"
echo "   # 方式 1: DMG 安装"
echo "   open \"$BUNDLE_DIR/dmg/\""
echo "   # 将 NovelOS Longform 拖入 Applications"
echo ""
echo "   # 方式 2: 直接运行 App"
echo "   open \"$BUNDLE_DIR/macos/NovelOS Longform.app\""
echo ""
echo "⚠️  首次打开可能提示「无法验证开发者」，请:"
echo "   系统设置 → 隐私与安全性 → 仍要打开"
echo ""
echo "   或命令行:"
echo "   xattr -cr \"$BUNDLE_DIR/macos/NovelOS Longform.app\""
