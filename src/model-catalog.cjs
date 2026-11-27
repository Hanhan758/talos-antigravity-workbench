'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');

function resolveCli() {
  const candidates = [
    process.env.ANTIGRAVITY_CLI_PATH,
    path.join(os.homedir(), '.local/bin/agy'),
    '/opt/homebrew/bin/agy',
    '/usr/local/bin/agy'
  ].filter(Boolean);
  for (const cand of candidates) {
    try { fs.accessSync(cand, fs.constants.X_OK); return cand; } catch {}
  }
  return null;
}

function parseAgyModelsOutput(stdout) {
  const lines = String(stdout || '').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line.includes('\t')) continue;
    const parts = line.trim().split(/\t+/);
    if (parts.length < 2) continue;
    const display = (parts[1] || '').trim();
    if (display && display.length <= 90) out.push(display);
  }
  return out;
}

function readCachedCatalog(cachePath) {
  if (!cachePath) return [];
  try {
    const stat = fs.lstatSync(cachePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) return [];
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (!Array.isArray(data?.models)) return [];
    return data.models.filter(x => typeof x === 'string' && x.trim().length > 0 && x.length <= 90);
  } catch {
    return [];
  }
}

function writeCachedCatalog(cachePath, models) {
  if (!cachePath || !Array.isArray(models) || models.length < 2) return;
  const tmp = `${cachePath}.${randomUUID()}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify({ models, updatedAt: new Date().toISOString() }) + '\n', {
      flag: 'wx', mode: 0o600
    });
    fs.renameSync(tmp, cachePath);
  } catch {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

function readAgyModelsCatalog(cachePath = null) {
  return new Promise(resolve => {
    const cli = resolveCli();
    if (!cli) return resolve([]);
    execFile(cli, ['models'], { timeout: 20000, encoding: 'utf8' }, (err, stdout) => {
      if (err || !stdout) return resolve([]);
      const parsed = parseAgyModelsOutput(stdout);
      if (parsed.length >= 2 && cachePath) writeCachedCatalog(cachePath, parsed);
      resolve(parsed);
    });
  });
}

module.exports = { resolveCli, parseAgyModelsOutput, readCachedCatalog, writeCachedCatalog, readAgyModelsCatalog };
