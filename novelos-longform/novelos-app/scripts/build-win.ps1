# ============================================================
# NovelOS Longform — Windows 桌面应用构建脚本
# 输出: .msi + .exe (NSIS) 安装包
# ============================================================
# 使用方式: PowerShell 中执行
#   .\scripts\build-win.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$PROJECT_DIR = Split-Path -Parent $SCRIPT_DIR

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  NovelOS Longform — Windows Build" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

Set-Location $PROJECT_DIR

# 1. 检查操作系统
if (-not $IsWindows -and -not ($env:OS -eq "Windows_NT")) {
    Write-Host "❌ 此脚本仅支持 Windows" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Windows $([System.Environment]::OSVersion.Version)" -ForegroundColor Green

# 2. 检查 Rust
$rustExe = Get-Command rustc -ErrorAction SilentlyContinue
if (-not $rustExe) {
    Write-Host "⚠️  Rust 未安装" -ForegroundColor Yellow
    Write-Host "   正在下载 rustup-init.exe..."
    $rustupUrl = "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"
    $rustupPath = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupPath -UseBasicParsing
    Write-Host "   正在安装 Rust (默认安装)..."
    & $rustupPath -y
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
    RefreshEnvPath 2>$null
}
$rustVersion = & rustc --version 2>$null
if ($rustVersion) {
    Write-Host "✅ $rustVersion" -ForegroundColor Green
} else {
    Write-Host "❌ Rust 安装失败，请手动安装: https://rustup.rs" -ForegroundColor Red
    exit 1
}

# 3. 检查 MSVC 构建工具
$clExe = Get-Command cl -ErrorAction SilentlyContinue
if (-not $clExe) {
    Write-Host "⚠️  未检测到 MSVC 编译器" -ForegroundColor Yellow
    Write-Host "   Tauri 需要 Visual Studio Build Tools" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   安装方式 (选择其一):" -ForegroundColor Yellow
    Write-Host "   1. Visual Studio Build Tools:" -ForegroundColor Yellow
    Write-Host "      https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor Yellow
    Write-Host "      勾选「C++ 桌面开发」工作负载" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   2. winget:" -ForegroundColor Yellow
    Write-Host "      winget install Microsoft.VisualStudio.2022.BuildTools" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   3. 如果已安装 VS，请从 Developer Command Prompt 运行此脚本" -ForegroundColor Yellow

    # 尝试自动检测已安装的 Build Tools
    $vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $vsPath = & $vsWhere -latest -property installationPath 2>$null
        if ($vsPath) {
            Write-Host ""
            Write-Host "   检测到 Visual Studio: $vsPath" -ForegroundColor Cyan
            Write-Host "   尝试加载 MSVC 环境..." -ForegroundColor Cyan

            # 查找 vcvarsall.bat
            $vcvarsall = Get-ChildItem -Path $vsPath -Recurse -Filter "vcvarsall.bat" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($vcvarsall) {
                Write-Host "   找到: $($vcvarsall.FullName)" -ForegroundColor Cyan
                Write-Host "   请从 Developer Command Prompt for VS 重新运行此脚本" -ForegroundColor Yellow
            }
        }
    }
    exit 1
}
Write-Host "✅ MSVC 编译器可用" -ForegroundColor Green

# 4. 检查 Node.js
$nodeExe = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeExe) {
    Write-Host "❌ Node.js 未安装，请安装 Node.js 18+" -ForegroundColor Red
    Write-Host "   https://nodejs.org/ 或 winget install OpenJS.NodeJS.LTS" -ForegroundColor Yellow
    exit 1
}
$nodeVersion = (node -v) -replace 'v','' -split '\.' | Select-Object -First 1
if ([int]$nodeVersion -lt 18) {
    Write-Host "❌ Node.js 版本过低 (当前: $(node -v))，需要 18+" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node.js $(node -v)" -ForegroundColor Green

# 5. 检查 npm
$npmExe = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmExe) {
    Write-Host "❌ npm 未安装" -ForegroundColor Red
    exit 1
}
Write-Host "✅ npm $(npm -v)" -ForegroundColor Green

# 6. 安装前端依赖
Write-Host ""
Write-Host "📦 安装前端依赖..." -ForegroundColor Cyan
npm install --prefer-offline 2>&1 | Select-Object -Last 3

# 7. 构建应用
Write-Host ""
Write-Host "🔨 构建 NovelOS Longform (Release)..." -ForegroundColor Cyan
Write-Host "   这可能需要几分钟（首次构建会下载和编译 Rust 依赖）..." -ForegroundColor DarkGray
npm run tauri:build 2>&1 | Select-Object -Last 20

# 8. 检查构建产物
Write-Host ""
$bundleDir = "$PROJECT_DIR\src-tauri\target\release\bundle"

Write-Host "📋 检查构建产物..." -ForegroundColor Cyan

if (Test-Path "$bundleDir\msi") {
    $msiFile = Get-ChildItem -Path "$bundleDir\msi" -Filter "*.msi" -Recurse | Select-Object -First 1
    if ($msiFile) {
        $msiSize = [math]::Round($msiFile.Length / 1MB, 1)
        Write-Host "✅ MSI: $($msiFile.FullName) ($msiSize MB)" -ForegroundColor Green
    }
}

if (Test-Path "$bundleDir\nsis") {
    $exeFile = Get-ChildItem -Path "$bundleDir\nsis" -Filter "*-setup.exe" -Recurse | Select-Object -First 1
    if ($exeFile) {
        $exeSize = [math]::Round($exeFile.Length / 1MB, 1)
        Write-Host "✅ EXE: $($exeFile.FullName) ($exeSize MB)" -ForegroundColor Green
    }
}

# 9. 输出使用说明
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  ✅ Windows 构建完成！" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📁 构建产物目录: $bundleDir" -ForegroundColor White
Write-Host ""
Write-Host "💡 安装方式:" -ForegroundColor Yellow
Write-Host "   # 方式 1: MSI 安装包"
Write-Host "   explorer `"$bundleDir\msi`""
Write-Host ""
Write-Host "   # 方式 2: NSIS 安装包 (推荐)"
Write-Host "   explorer `"$bundleDir\nsis`""
Write-Host ""
Write-Host "   # 直接运行 (免安装)"
Write-Host "   & `"$PROJECT_DIR\src-tauri\target\release\NovelOS Longform.exe`""
