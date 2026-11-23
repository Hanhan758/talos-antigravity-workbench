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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST_APP="$2"; shift 2 ;;
    --runtime) RUNTIME_ROOT="$2"; shift 2 ;;
    --purge-cache) PURGE_CACHE=1; shift ;;
    --purge-prefs) PURGE_PREFS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage; exit 1 ;;
  esac
done

is_managed_manifest() {
  local mf="$1"
  [[ -f "$mf" ]] && grep -q '"managed_by"[[:space:]]*:[[:space:]]*"talos-antigravity-workbench"' "$mf"
}

validate_app_target() {
  local target="$1"
  [[ ! -e "$target" ]] && return 0
  if [[ "$target" == "/" || "$target" == "/Applications" || "$target" == "/Applications/Antigravity.app" || "$target" == "$HOME" ]]; then
    echo "错误：拒绝卸载受保护路径：$target" >&2
    exit 1
  fi
  local bid
  bid="$(/usr/bin/defaults read "$target/Contents/Info.plist" CFBundleIdentifier 2>/dev/null || true)"
  if ! is_managed_manifest "$target/Contents/Resources/$MANIFEST_NAME" && [[ "$bid" != "$BUNDLE_ID" ]]; then
    echo "错误：目标不是本项目托管的启动器（拒绝删除）：$target" >&2
    exit 1
  fi
}

validate_runtime_target() {
  local target="$1"
  [[ ! -e "$target" ]] && return 0
  if [[ "$target" == "/" || "$target" == "$HOME" || "$target" == "$HOME/Library" || "$target" == "$HOME/Library/Application Support" ]]; then
    echo "错误：拒绝卸载受保护路径：$target" >&2
    exit 1
  fi
  if ! is_managed_manifest "$target/$MANIFEST_NAME" && ! is_managed_manifest "$target/runtime/$MANIFEST_NAME"; then
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
  echo "[dry-run] 将移除运行时：$RUNTIME_ROOT"
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

if [[ -d "$RUNTIME_ROOT" ]]; then
  rm -rf "$RUNTIME_ROOT"
  echo "✅ 已移除运行时：$RUNTIME_ROOT"
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
