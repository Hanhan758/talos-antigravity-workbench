#!/usr/bin/env bash
set -euo pipefail

DEST_APP="$HOME/Applications/Antigravity 中文.app"
RUNTIME_ROOT="$HOME/Library/Application Support/talos-antigravity-workbench"
PURGE_CACHE=0
PURGE_PREFS=0
DRY_RUN=0

usage() {
  cat <<'EOF'
用法: ./scripts/uninstall.sh [选项]

卸载本机生成的 Antigravity 轻量启动器与运行时目录（不会影响原版 /Applications/Antigravity.app）。

选项:
  --dest <路径>       指定要卸载的启动器 .app 路径（默认: ~/Applications/Antigravity 中文.app）
  --runtime <路径>    指定要卸载的运行时目录（默认: ~/Library/Application Support/talos-antigravity-workbench）
  --purge-cache       同时清理运行状态缓存（~/Library/Caches/antigravity-local-zh）
  --purge-prefs       同时清理主题与语言偏好（defaults delete local.antigravity.zh-launcher）
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

CACHE_DIR="$HOME/Library/Caches/antigravity-local-zh"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] 将卸载启动器：$DEST_APP"
  echo "[dry-run] 将移除运行时：$RUNTIME_ROOT"
  [[ "$PURGE_CACHE" -eq 1 ]] && echo "[dry-run] 将清理缓存：$CACHE_DIR"
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

if [[ "$PURGE_CACHE" -eq 1 && -d "$CACHE_DIR" ]]; then
  rm -rf "$CACHE_DIR"
  echo "✅ 已清理缓存：$CACHE_DIR"
fi

if [[ "$PURGE_PREFS" -eq 1 ]]; then
  defaults delete local.antigravity.zh-launcher >/dev/null 2>&1 || true
  echo "✅ 已清理主题与语言偏好。"
fi
