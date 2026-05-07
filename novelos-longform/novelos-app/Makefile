# NovelOS Longform — Makefile
# 跨平台快捷构建入口

.PHONY: dev build build-web build-mac build-win clean check

# 开发模式
dev:
	npm run tauri:dev

# 构建当前平台桌面应用
build:
	npm run tauri:build

# 构建前端 (Web)
build-web:
	./scripts/build-web.sh

# 构建 macOS 桌面应用
build-mac:
	./scripts/build-mac.sh

# 构建 Windows 桌面应用 (需在 PowerShell 中运行)
build-win:
	@echo "请在 PowerShell 中运行: .\\scripts\\build-win.ps1"

# 类型检查
check:
	npx tsc --noEmit
	cd src-tauri && cargo check

# 清理构建产物
clean:
	rm -rf dist
	rm -rf src-tauri/target
	rm -rf node_modules

# 安装依赖
install:
	npm install

# 格式化代码
fmt:
	npx prettier --write "src/**/*.{ts,tsx}"
	cd src-tauri && cargo fmt
