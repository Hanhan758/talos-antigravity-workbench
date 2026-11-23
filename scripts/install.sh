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
MANIFEST_NAME=".talos-agw-managed.json"
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

require_arg() {
  if [[ "$2" -lt 2 ]]; then
    echo "错误：选项 $1 缺少参数值。" >&2
    usage
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app) require_arg "$1" $#; APP_PATH="$2"; shift 2 ;;
    --dest) require_arg "$1" $#; DEST_APP="$2"; shift 2 ;;
    --runtime) require_arg "$1" $#; RUNTIME_DIR="$2"; shift 2 ;;
    --name) require_arg "$1" $#; DISPLAY_NAME="$2"; shift 2 ;;
    --sign) require_arg "$1" $#; SIGN_IDENTITY="$2"; shift 2 ;;
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

GOOGLE_REQ='anchor apple generic and identifier "com.google.antigravity" and certificate leaf[subject.OU] = "EQHXZ8M8AV"'
if ! /usr/bin/codesign --verify --strict -R="$GOOGLE_REQ" "$APP_PATH" >/dev/null 2>&1; then
  echo "错误：目标应用未通过 Google LLC (EQHXZ8M8AV) / com.google.antigravity 签名校验：$APP_PATH" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js，请先安装 Node.js v22.13 及以上（例如 brew install node）。" >&2
  exit 1
fi

NODE_BIN="$(command -v node)"
if ! "$NODE_BIN" -e "require('node:sqlite')" >/dev/null 2>&1; then
  echo "错误：当前 Node.js ($("$NODE_BIN" -v)) 不支持免实验开关的内置 node:sqlite，请升级到 Node.js v22.13 及以上。" >&2
  exit 1
fi

# 拒绝符号链接目标（防止穿透覆盖）
strip_trailing_slash() {
  local p="$1"
  while [[ "$p" != "/" && "$p" == */ ]]; do p="${p%/}"; done
  printf '%s' "$p"
}

RAW_DEST="$(strip_trailing_slash "$DEST_APP")"
RAW_RUNTIME="$(strip_trailing_slash "$RUNTIME_DIR")"
if [[ -L "$RAW_DEST" ]]; then
  echo "错误：--dest 不能是符号链接：$DEST_APP" >&2
  exit 1
fi
if [[ -L "$RAW_RUNTIME" ]]; then
  echo "错误：--runtime 不能是符号链接：$RUNTIME_DIR" >&2
  exit 1
fi

# 路径规范化与归属安全校验（禁止覆盖原版 App、系统目录或非本项目托管的无关目录）
normalize_path() {
  "$NODE_BIN" -e '
    const fs=require("node:fs"), p=require("node:path");
    let cur=p.resolve(process.argv[1]);
    const tail=[];
    while(true){
      try{ console.log(p.join(fs.realpathSync(cur), ...tail.reverse())); break; }
      catch{
        const parent=p.dirname(cur);
        if(parent===cur){ console.log(p.join(cur, ...tail.reverse())); break; }
        tail.push(p.basename(cur)); cur=parent;
      }
    }
  ' "$1"
}

xml_escape() {
  "$NODE_BIN" -e 'const s=process.argv[1];console.log(s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'\''/g,"&apos;"));' "$1"
}

REAL_APP="$(normalize_path "$APP_PATH")"
REAL_DEST="$(normalize_path "$RAW_DEST")"
REAL_RUNTIME="$(normalize_path "$RAW_RUNTIME")"
REAL_HOME="$(normalize_path "$HOME")"

reject_dangerous_target() {
  local label="$1"
  local target="$2"
  case "$target" in
    "/"|"/Applications"|"/System"|"/Library"|"/Users"|"$REAL_HOME"|"$REAL_HOME/Applications"|"$REAL_HOME/Library"|"$REAL_HOME/Library/Application Support"|"$REAL_APP")
      echo "错误：拒绝操作受保护路径（${label}）：$target" >&2
      exit 1
      ;;
  esac
  if [[ "$target" == "$REAL_APP/"* ]]; then
    echo "错误：拒绝写入原版应用内部（${label}）：$target" >&2
    exit 1
  fi
}

reject_dangerous_target "--dest" "$REAL_DEST"
reject_dangerous_target "--runtime" "$REAL_RUNTIME"

if [[ "$REAL_DEST" != *.app ]]; then
  echo "错误：--dest 必须以 .app 结尾：$DEST_APP" >&2
  exit 1
fi

if [[ "$REAL_DEST" == "$REAL_RUNTIME" || "$REAL_DEST" == "$REAL_RUNTIME/"* || "$REAL_RUNTIME" == "$REAL_DEST/"* ]]; then
  echo "错误：--dest 与 --runtime 不能互相包含或相同。" >&2
  exit 1
fi

# 校验通过后统一使用规范化绝对路径，避免相对路径或尾斜杠写入 Info.plist
APP_PATH="$REAL_APP"
DEST_APP="$REAL_DEST"
RUNTIME_DIR="$REAL_RUNTIME"

is_managed_manifest() {
  local mf="$1"
  [[ -f "$mf" ]] && "$NODE_BIN" -e 'const fs=require("node:fs");try{const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.exit(j&&j.managed_by==="talos-antigravity-workbench"?0:1);}catch{process.exit(1);}' "$mf"
}

is_legacy_runtime_dir() {
  local dir="$1"
  [[ -f "$dir/launch.cjs" && -f "$dir/appearance-pref.cjs" && -f "$dir/localization.js" ]] &&
    grep -q "local\.antigravity\.zh-launcher" "$dir/appearance-pref.cjs" 2>/dev/null
}

if [[ -e "$DEST_APP" ]]; then
  EXISTING_BID="$(/usr/bin/defaults read "$DEST_APP/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || true)"
  if ! is_managed_manifest "$DEST_APP/Contents/Resources/$MANIFEST_NAME" && [[ "$EXISTING_BID" != "$BUNDLE_ID" ]]; then
    echo "错误：目标启动器已存在但不是本项目托管的启动器（拒绝覆盖）：$DEST_APP" >&2
    exit 1
  fi
fi

if [[ -e "$RUNTIME_DIR" ]]; then
  if ! is_managed_manifest "$RUNTIME_DIR/$MANIFEST_NAME" && ! is_legacy_runtime_dir "$RUNTIME_DIR"; then
    echo "错误：目标运行时目录已存在但缺少本项目归属清单（拒绝覆盖）：$RUNTIME_DIR" >&2
    exit 1
  fi
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
    printf '%s\n' "$APP_PATH" "$RUNTIME_DIR" "$NODE_BIN" "$DISPLAY_NAME" "$BUNDLE_ID" "$EXECUTABLE_NAME" "$SIGN_IDENTITY" "$USE_CLANG" "$ICON_FILE" "$ICON_HASH"
    [[ -f "$LAUNCHER_SRC" ]] && cat "$LAUNCHER_SRC"
  } | shasum -a 256 | awk '{print $1}'
)"

HASH_FILE="$(dirname "$RUNTIME_DIR")/launcher.sha256"
NEED_BUILD_APP=1
if [[ "$REBUILD_LAUNCHER" -eq 0 && -d "$DEST_APP" && -f "$HASH_FILE" ]]; then
  SAVED_HASH="$(cat "$HASH_FILE" 2>/dev/null || true)"
  if [[ "$SAVED_HASH" == "$LAUNCHER_HASH" ]] && /usr/bin/codesign --verify --deep --strict "$DEST_APP" >/dev/null 2>&1; then
    NEED_BUILD_APP=0
  fi
fi

echo "==> TALOS Antigravity Workbench 安装检查"
echo "    原版应用: $APP_PATH (Google 官方签名已验证)"
echo "    Node 运行时: $NODE_BIN ($("$NODE_BIN" -v))"
echo "    运行时目录: $RUNTIME_DIR"
echo "    目标启动器: $DEST_APP"
echo "    复用图标: $( [[ $HAS_ICON -eq 1 ]] && echo "$ICON_SRC" || echo "未找到（将使用系统默认图标）" )"
echo "    启动器外壳: $( [[ $NEED_BUILD_APP -eq 0 ]] && echo "复用现有签名外壳（保持 CDHash 不变，避免重复 TCC 弹窗）" || ( [[ $USE_CLANG -eq 1 ]] && echo "构建原生 Mach-O (clang)" || echo "构建轻量 Shell 启动脚本" ) )"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] 检查通过，未写入任何文件。"
  exit 0
fi

# 同卷暂存准备（全部构建与签名校验通过后才切换，任何失败均自动回滚保留旧版）
RUNTIME_PARENT="$(dirname "$RUNTIME_DIR")"
DEST_PARENT="$(dirname "$DEST_APP")"
mkdir -p "$RUNTIME_PARENT" "$DEST_PARENT"

STAGE_RUNTIME="$(mktemp -d "$RUNTIME_PARENT/.talos-agw-runtime-stage.XXXXXX")"
STAGE_APP_DIR=""
BACKUP_RUNTIME=""
BACKUP_APP=""

cleanup_on_exit() {
  local rc=$?
  if [[ $rc -ne 0 ]]; then
    echo "错误：安装/更新未完成，正在恢复旧版本..." >&2
    if [[ -n "$BACKUP_APP" && -e "$BACKUP_APP" ]]; then
      rm -rf "$DEST_APP"
      mv "$BACKUP_APP" "$DEST_APP" || true
    fi
    if [[ -n "$BACKUP_RUNTIME" && -e "$BACKUP_RUNTIME" ]]; then
      rm -rf "$RUNTIME_DIR"
      mv "$BACKUP_RUNTIME" "$RUNTIME_DIR" || true
    fi
  else
    [[ -n "$BACKUP_APP" && -e "$BACKUP_APP" ]] && rm -rf "$BACKUP_APP" || true
    [[ -n "$BACKUP_RUNTIME" && -e "$BACKUP_RUNTIME" ]] && rm -rf "$BACKUP_RUNTIME" || true
  fi
  [[ -n "$STAGE_RUNTIME" && -e "$STAGE_RUNTIME" ]] && rm -rf "$STAGE_RUNTIME" || true
  [[ -n "$STAGE_APP_DIR" && -e "$STAGE_APP_DIR" ]] && rm -rf "$STAGE_APP_DIR" || true
}
trap cleanup_on_exit EXIT

# 1. 准备新运行时源码 + 归属清单（尚未触碰旧安装）
cp "$SRC_DIR"/* "$STAGE_RUNTIME/"
cat > "$STAGE_RUNTIME/$MANIFEST_NAME" <<EOF
{
  "managed_by": "talos-antigravity-workbench",
  "kind": "runtime",
  "schema_version": 1
}
EOF

# 2. 若需构建启动器，先在同卷暂存目录完成编译、XML 校验、签名与严格验签（失败直接中断，不破坏旧版）
STAGE_APP=""
if [[ "$NEED_BUILD_APP" -eq 1 ]]; then
  STAGE_APP_DIR="$(mktemp -d "$DEST_PARENT/.talos-agw-app-stage.XXXXXX")"
  STAGE_APP="$STAGE_APP_DIR/$(basename "$DEST_APP")"
  mkdir -p "$STAGE_APP/Contents/MacOS" "$STAGE_APP/Contents/Resources"

  cat > "$STAGE_APP/Contents/Resources/$MANIFEST_NAME" <<EOF
{
  "managed_by": "talos-antigravity-workbench",
  "kind": "launcher-app",
  "bundle_id": "${BUNDLE_ID}",
  "schema_version": 1
}
EOF

  ESC_DISPLAY_NAME="$(xml_escape "$DISPLAY_NAME")"
  ESC_EXECUTABLE_NAME="$(xml_escape "$EXECUTABLE_NAME")"
  ESC_BUNDLE_ID="$(xml_escape "$BUNDLE_ID")"
  ESC_APP_PATH="$(xml_escape "$APP_PATH")"
  ESC_RUNTIME_DIR="$(xml_escape "$RUNTIME_DIR")"
  ESC_NODE_BIN="$(xml_escape "$NODE_BIN")"

  ICON_PLIST_ENTRY=""
  if [[ "$HAS_ICON" -eq 1 ]]; then
    cp "$ICON_SRC" "$STAGE_APP/Contents/Resources/$ICON_FILE"
    ESC_ICON_FILE="$(xml_escape "$ICON_FILE")"
    ICON_PLIST_ENTRY=$'\t<key>CFBundleIconFile</key>\n\t<string>'"${ESC_ICON_FILE}"$'</string>'
  fi

  cat > "$STAGE_APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDisplayName</key>
	<string>${ESC_DISPLAY_NAME}</string>
	<key>CFBundleExecutable</key>
	<string>${ESC_EXECUTABLE_NAME}</string>
${ICON_PLIST_ENTRY}
	<key>CFBundleIdentifier</key>
	<string>${ESC_BUNDLE_ID}</string>
	<key>CFBundleName</key>
	<string>${ESC_DISPLAY_NAME}</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>AGWAppPath</key>
	<string>${ESC_APP_PATH}</string>
	<key>AGWRuntimeDir</key>
	<string>${ESC_RUNTIME_DIR}</string>
	<key>AGWNodePath</key>
	<string>${ESC_NODE_BIN}</string>
	<key>LSUIElement</key>
	<true/>
	<key>NSDocumentsFolderUsageDescription</key>
	<string>当你打开位于“文稿”中的项目时，Antigravity 工作台及已配置的项目工具会请求访问。额度查询禁止访问此文件夹。</string>
</dict>
</plist>
EOF

  /usr/bin/plutil -lint "$STAGE_APP/Contents/Info.plist" >/dev/null

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
PLIST_NODE="$(/usr/bin/defaults read "$PLIST" AGWNodePath 2>/dev/null || true)"
RUNTIME_DIR="${TALOS_AGW_RUNTIME:-${PLIST_RUNTIME:-$HOME/Library/Application Support/talos-antigravity-workbench/runtime}}"
LAUNCH_SCRIPT="$RUNTIME_DIR/launch.cjs"
[ -f "$LAUNCH_SCRIPT" ] || LAUNCH_SCRIPT="$RES_DIR/launch.cjs"
APP_PATH="${ANTIGRAVITY_APP_PATH:-${PLIST_APP:-/Applications/Antigravity.app}}"
if [ ! -d "$APP_PATH" ]; then
  /usr/bin/osascript -e 'display alert "未找到原版 Antigravity" message "请先安装 Google Antigravity。"' >/dev/null 2>&1 || true
  exit 1
fi
GOOGLE_REQ='anchor apple generic and identifier "com.google.antigravity" and certificate leaf[subject.OU] = "EQHXZ8M8AV"'
if ! /usr/bin/codesign --verify --strict -R="$GOOGLE_REQ" "$APP_PATH" >/dev/null 2>&1; then
  /usr/bin/osascript -e 'display alert "原版 Antigravity 官方签名校验未通过" message "目标应用未通过 Google LLC (EQHXZ8M8AV) 签名校验，启动器已停止启动。"' >/dev/null 2>&1 || true
  exit 1
fi
if /usr/bin/pgrep -x "Antigravity" >/dev/null 2>&1; then
  /usr/bin/open -b "com.google.antigravity" >/dev/null 2>&1 || /usr/bin/open -a "$APP_PATH"
  exit 0
fi
NODE_BIN=""
ZSH_NODE="$(/bin/zsh -lc 'command -v node' 2>/dev/null || true)"
for cand in "$PLIST_NODE" /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node "$ZSH_NODE"; do
  if [ -n "$cand" ] && [ -x "$cand" ] && "$cand" -e "require('node:sqlite')" >/dev/null 2>&1; then
    NODE_BIN="$cand"
    break
  fi
done
if [ -z "$NODE_BIN" ]; then
  /usr/bin/osascript -e 'display alert "Node.js 运行时不可用" message "需要支持内置 node:sqlite 的 Node.js v22.13 及以上，请升级后重跑 install.sh。"' >/dev/null 2>&1 || true
  exit 1
fi
if [ ! -f "$LAUNCH_SCRIPT" ]; then
  /usr/bin/osascript -e 'display alert "启动器文件不完整" message "缺少运行时 launch.cjs，请重新运行 install.sh 安装。"' >/dev/null 2>&1 || true
  exit 1
fi
cd "$HOME"
export ANTIGRAVITY_APP_PATH="$APP_PATH"
exec "$NODE_BIN" "$LAUNCH_SCRIPT"
SHEOF
    chmod 755 "$STAGE_APP/Contents/MacOS/$EXECUTABLE_NAME"
  fi

  # 严格签名并验签：签名失败必须中止安装，绝不吞错！
  /usr/bin/codesign --force --deep --sign "$SIGN_IDENTITY" "$STAGE_APP"
  /usr/bin/codesign --verify --deep --strict "$STAGE_APP"
fi

# 3. 全部校验通过后执行同卷原子切换（先备份旧版再替换）
if [[ -e "$RUNTIME_DIR" ]]; then
  BACKUP_RUNTIME="$RUNTIME_PARENT/.talos-agw-runtime-backup.$$"
  mv "$RUNTIME_DIR" "$BACKUP_RUNTIME"
fi
mv "$STAGE_RUNTIME" "$RUNTIME_DIR"
STAGE_RUNTIME=""

if [[ "$NEED_BUILD_APP" -eq 1 ]]; then
  if [[ -e "$DEST_APP" ]]; then
    BACKUP_APP="$DEST_PARENT/.talos-agw-app-backup.$$"
    mv "$DEST_APP" "$BACKUP_APP"
  fi
  mv "$STAGE_APP" "$DEST_APP"
  touch "$DEST_APP"
  printf '%s\n' "$LAUNCHER_HASH" > "$HASH_FILE"
fi

echo "✅ 安装完成：$DEST_APP"
echo "   - 运行时脚本目录：$RUNTIME_DIR"
echo "   - 原版应用未被修改，可继续正常接收官方自动更新。"
echo "   - 后续更新主题/汉化脚本不会重签启动器 .app，避免 macOS 重复弹出「文稿」权限提示。"
echo "   - 请先完全退出正在运行的 Antigravity，再打开「${DISPLAY_NAME}」即可生效。"
