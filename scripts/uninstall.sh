#!/usr/bin/env bash
set -euo pipefail

DEST_APP="$HOME/Applications/Antigravity 中文.app"
RUNTIME_ROOT="$HOME/Library/Application Support/talos-antigravity-workbench"
BUNDLE_ID="local.antigravity.zh-launcher"
MANIFEST_NAME=".talos-agw-managed.json"
PURGE_CACHE=0
PURGE_PREFS=0
DRY_RUN=0

usage() {
  cat <<'EOF'
用法: ./scripts/uninstall.sh [选项]

卸载本机生成的 Antigravity 轻量启动器与运行时目录（仅删除带本项目归属清单的产物，不会影响原版 /Applications/Antigravity.app 或其他目录）。

选项:
  --dest <路径>       指定要卸载的启动器 .app 路径（默认: ~/Applications/Antigravity 中文.app）
  --runtime <路径>    指定要卸载的运行时根目录（默认: ~/Library/Application Support/talos-antigravity-workbench）
  --purge-cache       同时清理运行状态与账号展示缓存
  --purge-prefs       同时清理主题、语言与额度开关偏好（defaults delete local.antigravity.zh-launcher）
  --dry-run           仅打印将要删除的项目，不实际删除
  -h, --help          显示帮助
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
    --dest) require_arg "$1" $#; DEST_APP="$2"; shift 2 ;;
    --runtime) require_arg "$1" $#; RUNTIME_ROOT="$2"; shift 2 ;;
    --purge-cache) PURGE_CACHE=1; shift ;;
    --purge-prefs) PURGE_PREFS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 1 ;;
  esac
done

strip_trailing_slash() {
  local p="$1"
  while [[ "$p" != "/" && "$p" == */ ]]; do p="${p%/}"; done
  printf '%s' "$p"
}

normalize_path() {
  local raw="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import os,sys; p=os.path.abspath(sys.argv[1]); print(os.path.realpath(p) if os.path.exists(p) else os.path.normpath(p))' "$raw"
  elif command -v node >/dev/null 2>&1; then
    node -e 'const fs=require("node:fs"),p=require("node:path");const abs=p.resolve(process.argv[1]);try{console.log(fs.realpathSync(abs));}catch{console.log(abs);}' "$raw"
  else
    strip_trailing_slash "$raw"
  fi
}

is_managed_manifest() {
  local mf="$1"
  [[ -f "$mf" && ! -L "$mf" ]] && grep -q '"managed_by"[[:space:]]*:[[:space:]]*"talos-antigravity-workbench"' "$mf"
}

RAW_DEST="$(strip_trailing_slash "$DEST_APP")"
RAW_RUNTIME="$(strip_trailing_slash "$RUNTIME_ROOT")"
REAL_HOME="$(normalize_path "$HOME")"
REAL_ORIG_APP="$(normalize_path "/Applications/Antigravity.app")"

if [[ -L "$RAW_DEST" ]]; then
  echo "错误：拒绝卸载符号链接目标：$DEST_APP" >&2
  exit 1
fi
if [[ -L "$RAW_RUNTIME" ]]; then
  echo "错误：拒绝卸载符号链接目标：$RUNTIME_ROOT" >&2
  exit 1
fi

DEST_APP="$(normalize_path "$RAW_DEST")"
RUNTIME_ROOT="$(normalize_path "$RAW_RUNTIME")"

reject_protected() {
  local target="$1"
  case "$target" in
    "/"|"/Applications"|"/System"|"/Library"|"/Users"|"$REAL_HOME"|"$REAL_HOME/Applications"|"$REAL_HOME/Library"|"$REAL_HOME/Library/Application Support"|"$REAL_ORIG_APP")
      echo "错误：拒绝卸载受保护路径：$target" >&2
      exit 1
      ;;
  esac
  if [[ "$target" == "$REAL_ORIG_APP/"* ]]; then
    echo "错误：拒绝卸载原版应用内部路径：$target" >&2
    exit 1
  fi
}

validate_app_target() {
  local target="$1"
  reject_protected "$target"
  [[ ! -e "$target" ]] && return 0
  local bid
  bid="$(/usr/bin/defaults read "$target/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || true)"
  if ! is_managed_manifest "$target/Contents/Resources/$MANIFEST_NAME" && [[ "$bid" != "$BUNDLE_ID" ]]; then
    echo "错误：目标不是本项目托管的启动器（拒绝删除）：$target" >&2
    exit 1
  fi
}

RUNTIME_DELETE_MODE="none"
validate_runtime_target() {
  local target="$1"
  reject_protected "$target"
  [[ ! -e "$target" ]] && return 0
  if is_managed_manifest "$target/$MANIFEST_NAME"; then
    RUNTIME_DELETE_MODE="direct"
  elif is_managed_manifest "$target/runtime/$MANIFEST_NAME"; then
    RUNTIME_DELETE_MODE="subdir"
  else
    echo "错误：目标目录缺少本项目归属清单（拒绝删除）：$target" >&2
    exit 1
  fi
}

validate_app_target "$DEST_APP"
validate_runtime_target "$RUNTIME_ROOT"

CACHE_DIR="$HOME/Library/Caches/antigravity-local-zh"
PROFILE_CACHE_DIR="$HOME/Library/Application Support/Antigravity 中文启动器"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] 将卸载启动器：$DEST_APP"
  if [[ "$RUNTIME_DELETE_MODE" == "direct" ]]; then
    echo "[dry-run] 将移除运行时目录：$RUNTIME_ROOT"
  elif [[ "$RUNTIME_DELETE_MODE" == "subdir" ]]; then
    echo "[dry-run] 将移除运行时子目录：$RUNTIME_ROOT/runtime（若父目录为空再清理）"
  fi
  [[ "$PURGE_CACHE" -eq 1 ]] && echo "[dry-run] 将清理缓存：$CACHE_DIR 与 $PROFILE_CACHE_DIR"
  [[ "$PURGE_PREFS" -eq 1 ]] && echo "[dry-run] 将清理偏好：local.antigravity.zh-launcher"
  exit 0
fi

if [[ -d "$DEST_APP" ]]; then
  rm -rf "$DEST_APP"
  echo "✅ 已移除启动器：$DEST_APP"
else
  echo "ℹ️  未找到启动器：$DEST_APP"
fi

if [[ "$RUNTIME_DELETE_MODE" == "direct" && -d "$RUNTIME_ROOT" ]]; then
  rm -rf "$RUNTIME_ROOT"
  echo "✅ 已移除运行时：$RUNTIME_ROOT"
elif [[ "$RUNTIME_DELETE_MODE" == "subdir" && -d "$RUNTIME_ROOT/runtime" ]]; then
  rm -rf "$RUNTIME_ROOT/runtime"
  rm -f "$RUNTIME_ROOT/launcher.sha256"
  rmdir "$RUNTIME_ROOT" 2>/dev/null || true
  echo "✅ 已移除运行时：$RUNTIME_ROOT/runtime"
fi

if [[ "$PURGE_CACHE" -eq 1 ]]; then
  if [[ -d "$CACHE_DIR" ]]; then
    rm -rf "$CACHE_DIR"
    echo "✅ 已清理缓存：$CACHE_DIR"
  fi
  if [[ -d "$PROFILE_CACHE_DIR" ]]; then
    rm -rf "$PROFILE_CACHE_DIR"
    echo "✅ 已清理账号展示缓存：$PROFILE_CACHE_DIR"
  fi
fi

if [[ "$PURGE_PREFS" -eq 1 ]]; then
  defaults delete local.antigravity.zh-launcher >/dev/null 2>&1 || true
  echo "✅ 已清理主题、语言与额度偏好。"
fi
