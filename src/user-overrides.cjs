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

module.exports = {
  defaultUserDir,
  loadI18nOverrides,
  loadI18nDict,
  loadCustomCss
};
