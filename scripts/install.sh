#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/src"
LAUNCHER_SRC="$REPO_ROOT/launcher/main.m"

APP_PATH="/Applications/Antigravity.app"
DEST_APP="$HOME/Applications/Antigravity 中文.app"
RUNTIME_DIR="$HOME/Library/Application Support/talos-antigravity-workbench/runtime"
DISPLAY_NAME="Antigravity 中文"
BUNDLE_ID="local.antigravity.zh-launcher"
EXECUTABLE_NAME="AntigravityWorkbench"
SIGN_IDENTITY="-"
NO_COMPILE=0
REBUILD_LAUNCHER=0
DRY_RUN=0

usage() {
  cat <<'EOF'
用法: ./scripts/install.sh [选项]

在 ~/Applications/ 下生成轻量 macOS 启动器，复用原版 Antigravity 图标，不改动原版应用包。
运行时源码部署在独立目录（~/Library/Application Support/talos-antigravity-workbench/runtime），
后续更新主题、汉化或脚本不会重签启动器 .app，避免 macOS TCC（文稿/桌面授权）反复弹窗。

选项:
  --app <路径>          指定原版 Antigravity.app 路径（默认: /Applications/Antigravity.app）
  --dest <路径>         指定生成的启动器 .app 路径（默认: ~/Applications/Antigravity 中文.app）
  --runtime <路径>      指定运行时脚本部署目录（默认: ~/Library/Application Support/talos-antigravity-workbench/runtime）
  --name <名称>         指定启动器显示名称（默认: Antigravity 中文）
  --sign <签名身份>     指定 codesign 签名身份（默认: - 本地 ad-hoc；可填本机自签证书名进一步固定 TCC 身份）
  --rebuild-launcher    强制重建并重签启动器 .app（即使启动器外壳未变化）
  --no-compile          跳过 clang 编译，使用轻量 shell 启动入口
  --dry-run             仅检查环境并打印将执行的操作，不写入文件
  -h, --help            显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) APP_PATH="$2"; shift 2 ;;
    --dest) DEST_APP="$2"; shift 2 ;;
    --runtime) RUNTIME_DIR="$2"; shift 2 ;;
    --name) DISPLAY_NAME="$2"; shift 2 ;;
    --sign) SIGN_IDENTITY="$2"; shift 2 ;;
    --rebuild-launcher) REBUILD_LAUNCHER=1; shift ;;
    --no-compile) NO_COMPILE=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "错误：当前安装脚本仅支持 macOS。" >&2
  exit 1
fi

if [[ ! -d "$APP_PATH" ]]; then
  echo "错误：未找到原版 Antigravity 应用：$APP_PATH" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js，请先安装 Node.js v22.5 及以上（例如 brew install node）。" >&2
  exit 1
fi

if ! node -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "错误：当前 Node.js ($(node -v)) 不支持内置 node:sqlite，请升级到 Node.js v22.5 及以上。" >&2
  exit 1
fi

# 复用原版 Antigravity 图标（不随仓库分发原版图标，安装时从本机原包读取）
ICON_FILE="$(defaults read "$APP_PATH/Contents/Info.plist" CFBundleIconFile 2>/dev/null || true)"
if [[ -z "$ICON_FILE" ]]; then
  ICON_FILE="icon.icns"
fi
if [[ "$ICON_FILE" != *.icns && -f "$APP_PATH/Contents/Resources/${ICON_FILE}.icns" ]]; then
  ICON_FILE="${ICON_FILE}.icns"
fi
ICON_SRC="$APP_PATH/Contents/Resources/$ICON_FILE"
HAS_ICON=0
ICON_HASH="none"
if [[ -f "$ICON_SRC" ]]; then
  HAS_ICON=1
  ICON_HASH="$(shasum -a 256 "$ICON_SRC" | awk '{print $1}')"
fi

USE_CLANG=0
if [[ "$NO_COMPILE" -eq 0 ]] && command -v clang >/dev/null 2>&1 && [[ -f "$LAUNCHER_SRC" ]]; then
  USE_CLANG=1
fi

LAUNCHER_HASH="$(
  {
    printf '%s\n' "$APP_PATH" "$RUNTIME_DIR" "$DISPLAY_NAME" "$BUNDLE_ID" "$EXECUTABLE_NAME" "$SIGN_IDENTITY" "$USE_CLANG" "$ICON_FILE" "$ICON_HASH"
    [[ -f "$LAUNCHER_SRC" ]] && cat "$LAUNCHER_SRC"
  } | shasum -a 256 | awk '{print $1}'
)"

HASH_FILE="$(dirname "$RUNTIME_DIR")/launcher.sha256"
NEED_BUILD_APP=1
if [[ "$REBUILD_LAUNCHER" -eq 0 && -d "$DEST_APP" && -f "$HASH_FILE" ]]; then
  SAVED_HASH="$(cat "$HASH_FILE" 2>/dev/null || true)"
  if [[ "$SAVED_HASH" == "$LAUNCHER_HASH" ]] && codesign --verify --deep --strict "$DEST_APP" >/dev/null 2>&1; then
    NEED_BUILD_APP=0
  fi
fi

echo "==> TALOS Antigravity Workbench 安装检查"
echo "    原版应用: $APP_PATH"
echo "    运行时目录: $RUNTIME_DIR"
echo "    目标启动器: $DEST_APP"
echo "    复用图标: $( [[ $HAS_ICON -eq 1 ]] && echo "$ICON_SRC" || echo "未找到（将使用系统默认图标）" )"
echo "    启动器外壳: $( [[ $NEED_BUILD_APP -eq 0 ]] && echo "复用现有签名外壳（保持 CDHash 不变，避免重复 TCC 弹窗）" || ( [[ $USE_CLANG -eq 1 ]] && echo "构建原生 Mach-O (clang)" || echo "构建轻量 Shell 启动脚本" ) )"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] 检查通过，未写入任何文件。"
  exit 0
fi

# 1. 原子更新运行时源码目录（不触碰 .app 签名）
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/talos-ag-workbench.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

mkdir -p "$(dirname "$RUNTIME_DIR")"
STAGE_RUNTIME="$STAGE_DIR/runtime"
mkdir -p "$STAGE_RUNTIME"
cp "$SRC_DIR"/* "$STAGE_RUNTIME/"
rm -rf "$RUNTIME_DIR"
mv "$STAGE_RUNTIME" "$RUNTIME_DIR"

# 2. 仅在首次安装、启动器外壳变更或 --rebuild-launcher 时构建并签名 .app
if [[ "$NEED_BUILD_APP" -eq 1 ]]; then
  STAGE_APP="$STAGE_DIR/$(basename "$DEST_APP")"
  mkdir -p "$STAGE_APP/Contents/MacOS" "$STAGE_APP/Contents/Resources"

  ICON_PLIST_ENTRY=""
  if [[ "$HAS_ICON" -eq 1 ]]; then
    cp "$ICON_SRC" "$STAGE_APP/Contents/Resources/$ICON_FILE"
    ICON_PLIST_ENTRY=$'\t<key>CFBundleIconFile</key>\n\t<string>'"$ICON_FILE"$'</string>'
  fi

  cat > "$STAGE_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>${DISPLAY_NAME}</string>
	<key>CFBundleExecutable</key>
	<string>${EXECUTABLE_NAME}</string>
${ICON_PLIST_ENTRY}
	<key>CFBundleIdentifier</key>
	<string>${BUNDLE_ID}</string>
	<key>CFBundleName</key>
	<string>${DISPLAY_NAME}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>AGWAppPath</key>
	<string>${APP_PATH}</string>
	<key>AGWRuntimeDir</key>
	<string>${RUNTIME_DIR}</string>
	<key>LSUIElement</key>
	<true/>
	<key>NSDocumentsFolderUsageDescription</key>
	<string>当你打开位于“文稿”中的项目时，Antigravity 工作台及已配置的项目工具会请求访问。额度查询禁止访问此文件夹。</string>
</dict>
</plist>
EOF

  if [[ "$USE_CLANG" -eq 1 ]]; then
    clang -fobjc-arc -O2 -framework Cocoa "$LAUNCHER_SRC" -o "$STAGE_APP/Contents/MacOS/$EXECUTABLE_NAME"
  else
    cat > "$STAGE_APP/Contents/MacOS/$EXECUTABLE_NAME" <<'SHEOF'
#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
RES_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/../Resources" && pwd)"
PLIST="$SCRIPT_DIR/../Info.plist"
PLIST_RUNTIME="$(/usr/bin/defaults read "$PLIST" AGWRuntimeDir 2>/dev/null || true)"
PLIST_APP="$(/usr/bin/defaults read "$PLIST" AGWAppPath 2>/dev/null || true)"
RUNTIME_DIR="${TALOS_AGW_RUNTIME:-${PLIST_RUNTIME:-$HOME/Library/Application Support/talos-antigravity-workbench/runtime}}"
LAUNCH_SCRIPT="$RUNTIME_DIR/launch.cjs"
[ -f "$LAUNCH_SCRIPT" ] || LAUNCH_SCRIPT="$RES_DIR/launch.cjs"
APP_PATH="${ANTIGRAVITY_APP_PATH:-${PLIST_APP:-/Applications/Antigravity.app}}"
if [ ! -d "$APP_PATH" ]; then
  /usr/bin/osascript -e 'display alert "未找到原版 Antigravity" message "请先安装 Google Antigravity。"' >/dev/null 2>&1 || true
  exit 1
fi
if /usr/bin/pgrep -x "Antigravity" >/dev/null 2>&1; then
  /usr/bin/open -a "$APP_PATH"
  exit 0
fi
NODE_BIN=""
for cand in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  if [ -x "$cand" ]; then NODE_BIN="$cand"; break; fi
done
if [ -z "$NODE_BIN" ]; then
  NODE_BIN="$(/bin/zsh -lc 'command -v node' 2>/dev/null || true)"
fi
if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  /usr/bin/osascript -e 'display alert "未找到 Node.js" message "请先安装 Node.js v20 及以上。"' >/dev/null 2>&1 || true
  exit 1
fi
export ANTIGRAVITY_APP_PATH="$APP_PATH"
exec "$NODE_BIN" "$LAUNCH_SCRIPT"
SHEOF
    chmod 755 "$STAGE_APP/Contents/MacOS/$EXECUTABLE_NAME"
  fi

  if command -v codesign >/dev/null 2>&1; then
    codesign --force --deep --sign "$SIGN_IDENTITY" "$STAGE_APP" >/dev/null 2>&1 || true
  fi

  mkdir -p "$(dirname "$DEST_APP")"
  rm -rf "$DEST_APP"
  mv "$STAGE_APP" "$DEST_APP"
  touch "$DEST_APP"
  printf '%s\n' "$LAUNCHER_HASH" > "$HASH_FILE"
fi

echo "✅ 安装完成：$DEST_APP"
echo "   - 运行时脚本目录：$RUNTIME_DIR"
echo "   - 原版应用未被修改，可继续正常接收官方自动更新。"
echo "   - 后续更新主题/汉化脚本不会重签启动器 .app，避免 macOS 重复弹出「文稿」权限提示。"
echo "   - 请先完全退出正在运行的 Antigravity，再打开「${DISPLAY_NAME}」即可生效。"
