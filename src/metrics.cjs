'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const directory = path.join(os.homedir(), '.gemini', 'antigravity', 'conversations');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cache = new Map();
const maxRows = 48;
const maxHistory = 12;
const maxBytes = 16 * 1024 * 1024;

function stat(name) {
  try { return fs.lstatSync(name); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}

// 仅保留指定编号的字段，不把字符串或原始记录传给界面。
function fields(bytes, wanted, stepKey = 0) {
  const result = new Map();
  if (!(bytes instanceof Uint8Array)) return result;
  function store(key,value) {
    if (!wanted.includes(key)) return;
    if (key !== stepKey) { result.set(key,value); return; }
    const next = maxStep(value);
    if (next !== null) result.set(key,Math.max(result.get(key) ?? -1,next));
  }
  let offset = 0;
  function varint() {
    let n = 0;
    for (let i = 0; i < 10 && offset < bytes.length; i++) {
      const byte = bytes[offset++];
      n += (byte & 127) * 2 ** (7 * i);
      if (!(byte & 128)) return n;
    }
    throw Error('invalid varint');
  }
  while (offset < bytes.length) {
    const tag = varint();
    if (!Number.isSafeInteger(tag) || tag < 8 || tag > 0xffffffff) throw Error('invalid tag');
    const key = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) {
      const value = varint();
      if (Number.isSafeInteger(value)) store(key, value);
    } else {
      let size;
      if (wire === 2) size = varint();
      else if (wire === 1) size = 8;
      else if (wire === 5) size = 4;
      else throw Error('unknown wire type');
      if (!Number.isSafeInteger(size) || size > bytes.length - offset) throw Error('invalid length');
      if (wire === 2 && wanted.includes(key)) store(key, bytes.subarray(offset, offset + size));
      offset += size;
    }
  }
  return result;
}

function count(map, key) {
  const n = map.get(key);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function duration(bytes) {
  if (!bytes) return null;
  const parts = fields(bytes, [1, 2]);
  const seconds = count(parts, 1), nanos = count(parts, 2);
  if (seconds === null && nanos === null || nanos >= 1e9) return null;
  return (seconds ?? 0) + (nanos ?? 0) / 1e9;
}

// 步骤编号可能是一个数，也可能是 packed varint 列表。
function maxStep(raw) {
  if (Number.isSafeInteger(raw)) return raw;
  if (!(raw instanceof Uint8Array)) return null;
  let best = null, value = 0, shift = 0;
  for (const byte of raw) {
    value += (byte & 127) * 2 ** shift;
    if (!Number.isSafeInteger(value) || shift > 49) return null;
    if (byte & 128) { shift += 7; continue; }
    best = best === null ? value : Math.max(best,value);
    value = 0; shift = 0;
  }
  return shift === 0 ? best : null;
}

function decode(bytes, withStep = false) {
  const top = fields(bytes, withStep ? [1,2] : [1], withStep ? 2 : 0);
  const chat = fields(top.get(1), [4, 9, 11, 12]);
  const usage = fields(chat.get(4), [2, 3, 4, 5, 9, 10]);
  const input = count(usage, 2), output = count(usage, 3);
  const cacheWrite = count(usage, 4), cacheRead = count(usage, 5);
  const inputs = [input, cacheWrite, cacheRead];
  const context = inputs.some(n => n !== null) ? inputs.reduce((sum, n) => sum + (n ?? 0), 0) : null;
  if (!(context > 0 || output > 0)) return null;
  const limits = fields(fields(chat.get(9), [10]).get(10), [4]);
  const stream = duration(chat.get(12));
  return {
    ...(withStep ? {step:maxStep(top.get(2))} : {}),
    state: 'ready', context, limit: count(limits, 4) || null, input, cacheWrite, cacheRead, output,
    think: count(usage, 9), response: count(usage, 10), ttft: duration(chat.get(11)), stream,
    speed: stream > 0 && output !== null ? output / stream : null
  };
}

function sourceFor(uuid) {
  if (typeof uuid !== 'string' || !uuidPattern.test(uuid)) return { state: 'empty' };
  const id = uuid.toLowerCase();
  const dbPath = path.join(directory, id + '.db');
  for (const dir of [path.dirname(path.dirname(directory)), path.dirname(directory), directory]) {
    const st = stat(dir);
    if (!st) return { state: 'empty' };
    if (!st.isDirectory()) return { state: 'unavailable' };
  }
  const main = stat(dbPath);
  if (!main) return { state: 'empty' };
  const wal = stat(dbPath + '-wal');
  if (![main, wal, stat(dbPath + '-shm'), stat(dbPath + '-journal')].every(s => !s || s.isFile())) {
    return { state: 'unavailable' };
  }
  if (main.size === 0 && !wal?.size) return { state: 'empty' };
  const signature = [main.ino, main.size, main.mtimeMs, wal?.ino, wal?.size, wal?.mtimeMs].join('/');
  return {id, dbPath, signature};
}

function isCancelText(raw) {
  const s = typeof raw === 'string'
    ? raw
    : Buffer.isBuffer(raw) || raw instanceof Uint8Array
    ? Buffer.from(raw.subarray(0, 256)).toString('utf8')
    : '';
  return /\b(?:cancel(?:led|ed)?|abort(?:ed)?|interrupt(?:ed)?|stopped\s+by\s+user)\b/i.test(s);
}

function extractStepStartMs(metadataBytes) {
  if (!(metadataBytes instanceof Uint8Array) || metadataBytes.length === 0) return null;
  try {
    const top = fields(metadataBytes, [1]);
    const ts = top.get(1);
    if (!(ts instanceof Uint8Array)) return null;
    const sec = fields(ts, [1]).get(1);
    if (Number.isSafeInteger(sec) && sec > 1_500_000_000 && sec < 4_000_000_000) {
      return sec * 1000;
    }
  } catch {}
  return null;
}

function deriveSessionStatus({ activeSteps = [], latestNonUserStep = null, nowMs = Date.now() } = {}) {
  const active = Array.isArray(activeSteps) ? activeSteps : [];
  if (active.length > 0) {
    const compacting = active.some(s => Number(s?.step_type) === 23);
    let newestStart = null;
    for (const step of active) {
      const ms = Number.isFinite(step?.startMs) ? step.startMs : extractStepStartMs(step?.metadata);
      if (ms !== null && (newestStart === null || ms > newestStart)) newestStart = ms;
    }
    const elapsedSec = newestStart !== null ? Math.max(0, Math.floor((nowMs - newestStart) / 1000)) : 0;
    if (elapsedSec >= 60) {
      return { state: 'waiting', kind: compacting ? 'compacting' : 'slow', elapsedSec };
    }
    return { state: 'running', kind: compacting ? 'compacting' : 'active', elapsedSec };
  }
  if (latestNonUserStep) {
    const st = Number(latestNonUserStep.status);
    const tp = Number(latestNonUserStep.step_type);
    const errRaw = latestNonUserStep.error_details;
    const hasErr = errRaw !== null && errRaw !== undefined &&
      (typeof errRaw === 'string' ? errRaw.trim().length > 0 : errRaw.length > 0);
    if ((tp === 17 || st === 4 || hasErr) && !isCancelText(errRaw)) {
      return { state: 'error', kind: 'step_error', elapsedSec: 0 };
    }
  }
  return { state: 'ready', kind: 'idle', elapsedSec: 0 };
}

function readSessionStatus(db, nowMs = Date.now()) {
  try {
    const activeSteps = db.prepare(
      'SELECT idx, step_type, status, metadata FROM steps WHERE status IN (1, 2, 8, 9, 11) ORDER BY idx DESC LIMIT 5'
    ).all();
    const latestNonUserStep = db.prepare(
      'SELECT idx, step_type, status, error_details FROM steps WHERE step_type != 14 ORDER BY idx DESC LIMIT 1'
    ).get() || null;
    return deriveSessionStatus({ activeSteps, latestNonUserStep, nowMs });
  } catch {
    return { state: 'ready', kind: 'idle', elapsedSec: 0 };
  }
}

function readMetrics(uuid, { history = false } = {}) {
  let db;
  try {
    const source = sourceFor(uuid);
    if (source.state) return source;
    const {id, dbPath, signature} = source;
    const old = cache.get(id);
    const liveState = old?.latest?.sessionStatus?.state;
    const cacheTtl = liveState === 'running' || liveState === 'waiting' ? 2000 : 15000;
    if (old?.signature === signature && Date.now() - old.at < cacheTtl && (!history || old.detail)) {
      return history ? old.detail : old.latest;
    }

    db = new DatabaseSync(dbPath, { readOnly: true, timeout: 80 });
    // 让长度、记录序号与实际字节来自同一读快照；连接在 finally 中关闭并释放快照。
    db.exec('PRAGMA query_only = ON; BEGIN');
    const sessionStatus = readSessionStatus(db);
    const recent = db.prepare('SELECT idx,length(data) AS bytes FROM gen_metadata ORDER BY idx DESC LIMIT ?').all(maxRows + 1);
    const byIndex = db.prepare('SELECT data FROM gen_metadata WHERE idx = ? AND length(data) <= ?');
    const samples = [];
    let latest = null;
    let partial = false;
    let budget = maxBytes;
    for (const { idx, bytes } of recent.slice(0, maxRows)) {
      if (!Number.isSafeInteger(bytes) || bytes <= 0) continue;
      if (bytes > budget) { partial = true; break; }
      budget -= bytes;
      try {
        const row = byIndex.get(idx, bytes);
        if (!row) { partial = true; break; }
        const metrics = decode(row.data);
        if (!metrics) continue;
        latest ??= metrics;
        if (!history) break;
        const { state, ...numbers } = metrics;
        samples.push({ idx, ...numbers });
        if (samples.length === maxHistory) break;
      } catch {
        // 更早的记录损坏时保留已核实样本，停止扫描以免把空档画成连续趋势。
        partial = true;
        break;
      }
    }
    if (recent.length > maxRows && (history ? samples.length < maxHistory : !latest)) partial = true;
    latest ??= { state: partial ? 'unavailable' : 'empty' };
    latest = { ...latest, sessionStatus };
    const detail = history ? { ...latest, history: samples.reverse(), historyPartial: partial } : null;
    const value = history ? detail : latest;
    cache.delete(id);
    cache.set(id, { signature, latest, detail, at: Date.now() });
    if (cache.size > 16) cache.delete(cache.keys().next().value);
    return value;
  } catch {
    return { state: 'unavailable' };
  } finally {
    if (db) db.close();
  }
}

module.exports = { readMetrics, sourceFor, decode, deriveSessionStatus, isCancelText, extractStepStartMs };
