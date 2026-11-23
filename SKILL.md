---
name: talos-antigravity-workbench
description: 在 macOS 上无侵入安装、更新或卸载 TALOS Antigravity 桌面工作台轻量启动器（简体中文/英文实时切换、Google/Claude/Codex 三套主题与布局、三环额度统计、新对话自动命名）。
---

# TALOS Antigravity 桌面工作台安装指南（Agent Skill）

当用户希望在自己的 macOS 上安装、更新或卸载本仓库提供的 Antigravity 桌面工作台增强启动器时，按以下步骤执行：

## 1. 环境预检

确认以下前提：
- 系统为 macOS（`uname -s` 为 `Darwin`）
- 已安装原版 `/Applications/Antigravity.app`（或用户指定的路径）
- 已安装 Node.js v22.13 及以上（免实验参数支持内置 `node:sqlite`，可通过 `node -e "require('node:sqlite')"` 验证）

## 2. 执行安装或更新

在仓库根目录执行：

```bash
bash ./scripts/install.sh --dry-run
bash ./scripts/install.sh
```

- 脚本不会修改 `/Applications/Antigravity.app`。
- 会自动从本机原版应用复用图标，并在 `~/Applications/Antigravity 中文.app` 生成本地签名启动器。
- 已有主题与语言偏好保存在 macOS `defaults` 域 `local.antigravity.zh-launcher`，更新重装时会自动保留。

## 3. 生效与验证

- 提醒用户**先完全退出**正在运行的 Antigravity，再打开 `~/Applications/Antigravity 中文.app`。
- 在应用内打开 **系统设置 → 外观界面**，确认出现「工作台主题」与「界面语言（EN / 中文）」两行控件。

## 4. 卸载

```bash
bash ./scripts/uninstall.sh
```

如需一并清理缓存与偏好，追加 `--purge-cache --purge-prefs`。
