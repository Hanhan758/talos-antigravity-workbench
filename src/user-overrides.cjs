'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_OVERRIDE_JSON_BYTES = 512 * 1024;
const MAX_CUSTOM_CSS_BYTES = 256 * 1024;

function defaultUserDir(runtimeDir = __dirname) {
  return path.resolve(runtimeDir, '..', 'user');
}

function readSafeUserFile(filePath, maxBytes) {
  try {
    const dirStat = fs.lstatSync(path.dirname(filePath), { throwIfNoEntry: false });
    if (!dirStat || !dirStat.isDirectory() || dirStat.isSymbolicLink()) return null;
    if (typeof process.getuid === 'function' && dirStat.uid !== process.getuid()) return null;

    const st = fs.lstatSync(filePath, { throwIfNoEntry: false });
    if (!st || !st.isFile() || st.isSymbolicLink()) return null;
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) return null;
    if (st.size <= 0 || st.size > maxBytes) return null;

    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function loadI18nOverrides(userDir = defaultUserDir()) {
  const raw = readSafeUserFile(path.join(userDir, 'i18n.override.json'), MAX_OVERRIDE_JSON_BYTES);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = Object.create(null);
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === 'string' && k.length > 0 && typeof v === 'string') {
        out[k] = v;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function loadI18nDict(baseDictPath = path.join(__dirname, 'i18n.json'), userDir = defaultUserDir()) {
  const base = JSON.parse(fs.readFileSync(baseDictPath, 'utf8'));
  const overrides = loadI18nOverrides(userDir);
  return Object.assign(Object.create(null), base, overrides);
}

function loadCustomCss(userDir = defaultUserDir()) {
  const raw = readSafeUserFile(path.join(userDir, 'custom.css'), MAX_CUSTOM_CSS_BYTES);
  return typeof raw === 'string' ? raw : '';
}

const DEFAULT_SNIPPETS = [
  { title: '先给结论', text: '请先给核心结论与依据，再展开细节，保持简洁。' },
  { title: '只读分析不改文件', text: '请先只读分析问题根因并给出方案，暂不修改任何文件。' },
  { title: '补测试并全量验证', text: '请为本次改动补充单元测试，运行全量测试确认通过后再汇报。' },
  { title: '生成变更摘要', text: '请按模块总结本次改动清单、验证情况与潜在风险。' }
];

function loadSnippets(userDir = defaultUserDir()) {
  const raw = readSafeUserFile(path.join(userDir, 'snippets.json'), MAX_CUSTOM_CSS_BYTES);
  if (!raw) return DEFAULT_SNIPPETS;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SNIPPETS;
    const valid = parsed
      .filter(item => item && typeof item.title === 'string' && item.title.trim() && typeof item.text === 'string' && item.text.trim())
      .slice(0, 60)
      .map(item => ({ title: item.title.trim().slice(0, 48), text: item.text.slice(0, 4000) }));
    return valid.length ? valid : DEFAULT_SNIPPETS;
  } catch {
    return DEFAULT_SNIPPETS;
  }
}

module.exports = {
  defaultUserDir,
  loadI18nOverrides,
  loadI18nDict,
  loadCustomCss,
  loadSnippets,
  DEFAULT_SNIPPETS
};
