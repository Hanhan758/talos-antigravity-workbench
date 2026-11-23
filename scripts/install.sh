#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/src"
LAUNCHER_SRC="$REPO_ROOT/launcher/main.m"

APP_PATH="/Applications/Antigravity.app"
DEST_APP="$HOME/Applications/Antigravity 中文.app"
DISPLAY_NAME="Antigravity 中文"
BUNDLE_ID="local.antigravity.zh-launcher"
EXECUTABLE_NAME="AntigravityWorkbench"
NO_COMPILE=0
DRY_RUN=0

usage() {
  cat <<'EOF'
用法: ./scripts/install.sh [选项]

在 ~/Applications/ 下生成轻量 macOS 启动器，复用原版 Antigravity 图标，不改动原版应用包。

选项:
  --app <路径>        指定原版 Antigravity.app 路径（默认: /Applications/Antigravity.app）
  --dest <路径>       指定生成的启动器 .app 路径（默认: ~/Applications/Antigravity 中文.app）
  --name <名称>       指定启动器显示名称（默认: Antigravity 中文）
  --no-compile        跳过 clang 编译，使用轻量 shell 启动入口
  --dry-run           仅检查环境并打印将执行的操作，不写入文件
  -h, --help          显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) APP_PATH="$2"; shift 2 ;;
    --dest) DEST_APP="$2"; shift 2 ;;
    --name) DISPLAY_NAME="$2"; shift 2 ;;
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
  echo "错误：未找到 Node.js，请先安装 Node.js v20 及以上（例如 brew install node）。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "错误：需要 Node.js v20 及以上，当前版本：$(node -v)" >&2
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
if [[ -f "$ICON_SRC" ]]; then
  HAS_ICON=1
fi

USE_CLANG=0
if [[ "$NO_COMPILE" -eq 0 ]] && command -v clang >/dev/null 2>&1 && [[ -f "$LAUNCHER_SRC" ]]; then
  USE_CLANG=1
fi

echo "==> TALOS Antigravity Workbench 安装检查"
echo "    原版应用: $APP_PATH"
echo "    目标启动器: $DEST_APP"
echo "    复用图标: $( [[ $HAS_ICON -eq 1 ]] && echo "$ICON_SRC" || echo "未找到（将使用系统默认图标）" )"
echo "    启动入口: $( [[ $USE_CLANG -eq 1 ]] && echo "原生 Mach-O (clang)" || echo "轻量 Shell 启动脚本" )"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] 检查通过，未写入任何文件。"
  exit 0
fi

STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/talos-ag-workbench.XXXXXX")"
trap 'rm -rf "$STAGE_DIR"' EXIT

STAGE_APP="$STAGE_DIR/$(basename "$DEST_APP")"
mkdir -p "$STAGE_APP/Contents/MacOS" "$STAGE_APP/Contents/Resources"

# 复制全部运行时源码
cp "$SRC_DIR"/* "$STAGE_APP/Contents/Resources/"

# 复用原版图标
ICON_PLIST_ENTRY=""
if [[ "$HAS_ICON" -eq 1 ]]; then
  cp "$ICON_SRC" "$STAGE_APP/Contents/Resources/$ICON_FILE"
  ICON_PLIST_ENTRY=$'\t<key>CFBundleIconFile</key>\n\t<string>'"$ICON_FILE"$'</string>'
fi

# 生成 Info.plist
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
	<key>LSUIElement</key>
	<true/>
	<key>NSDocumentsFolderUsageDescription</key>
	<string>当你打开位于“文稿”中的项目时，Antigravity 工作台及已配置的项目工具会请求访问。额度查询禁止访问此文件夹。</string>
</dict>
</plist>
EOF

# 构建轻量启动入口
if [[ "$USE_CLANG" -eq 1 ]]; then
  clang -fobjc-arc -O2 -framework Cocoa "$LAUNCHER_SRC" -o "$STAGE_APP/Contents/MacOS/$EXECUTABLE_NAME"
else
  cat > "$STAGE_APP/Contents/MacOS/$EXECUTABLE_NAME" <<'SHEOF'
#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
RES_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/../Resources" && pwd)"
APP_PATH="${ANTIGRAVITY_APP_PATH:-/Applications/Antigravity.app}"
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
exec "$NODE_BIN" "$RES_DIR/launch.cjs"
SHEOF
  chmod 755 "$STAGE_APP/Contents/MacOS/$EXECUTABLE_NAME"
fi

# 本地 ad-hoc 签名，避免 Gatekeeper 异常
if command -v codesign >/dev/null 2>&1; then
  codesign --force --deep --sign - "$STAGE_APP" >/dev/null 2>&1 || true
fi

mkdir -p "$(dirname "$DEST_APP")"
rm -rf "$DEST_APP"
mv "$STAGE_APP" "$DEST_APP"
touch "$DEST_APP"

echo "✅ 安装完成：$DEST_APP"
echo "   - 原版应用未被修改，可继续正常接收官方自动更新。"
echo "   - 请先完全退出正在运行的 Antigravity，再打开「$DISPLAY_NAME」即可生效。"
echo "   - 可将其拖入程序坞（Dock）替代原图标使用。"
