import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(repoRoot, 'src');

const { loadI18nDict, loadI18nOverrides, loadCustomCss } = require(path.join(srcDir, 'user-overrides.cjs'));
const { deriveSessionStatus, isCancelText, extractStepStartMs } = require(path.join(srcDir, 'metrics.cjs'));

function encodeVarint(n) {
  const out = [];
  let v = n;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return Buffer.from(out);
}

function encodeMetadataTimestamp(sec) {
  const inner = Buffer.concat([encodeVarint((1 << 3) | 0), encodeVarint(sec)]);
  return Buffer.concat([encodeVarint((1 << 3) | 2), encodeVarint(inner.length), inner]);
}

test('user-overrides loads valid i18n overrides and custom.css while rejecting symlinks & malformed JSON', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-user-ov-'));
  try {
    const userDir = path.join(tmp, 'user');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'i18n.override.json'), JSON.stringify({
      Settings: '我的设置',
      InvalidNum: 123,
      CustomTerm: '自定义词条'
    }));
    fs.writeFileSync(path.join(userDir, 'custom.css'), '.custom { color: red; }');

    const ov = loadI18nOverrides(userDir);
    assert.equal(ov.Settings, '我的设置');
    assert.equal(ov.CustomTerm, '自定义词条');
    assert.equal(ov.InvalidNum, undefined);

    const merged = loadI18nDict(path.join(srcDir, 'i18n.json'), userDir);
    assert.equal(merged.Settings, '我的设置');
    assert.equal(merged.CustomTerm, '自定义词条');
    assert.equal(merged['New Conversation'], '新建对话');
    assert.equal(loadCustomCss(userDir), '.custom { color: red; }');

    // Malformed JSON falls back cleanly
    fs.writeFileSync(path.join(userDir, 'i18n.override.json'), '{bad json');
    assert.deepEqual(loadI18nOverrides(userDir), {});

    // Symlink must be rejected
    const targetFile = path.join(tmp, 'real.css');
    fs.writeFileSync(targetFile, 'body {}');
    fs.unlinkSync(path.join(userDir, 'custom.css'));
    fs.symlinkSync(targetFile, path.join(userDir, 'custom.css'));
    assert.equal(loadCustomCss(userDir), '');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('deriveSessionStatus accurately distinguishes ready, running, compacting, waiting, error, and user cancel', () => {
  const nowSec = 1_795_445_000;
  const nowMs = nowSec * 1000;

  assert.deepEqual(deriveSessionStatus({ activeSteps: [], latestNonUserStep: null, nowMs }), {
    state: 'ready', kind: 'idle', elapsedSec: 0
  });

  // Running < 60s
  const recentMeta = encodeMetadataTimestamp(nowSec - 12);
  assert.equal(extractStepStartMs(recentMeta), (nowSec - 12) * 1000);
  assert.deepEqual(
    deriveSessionStatus({ activeSteps: [{ idx: 5, step_type: 15, status: 2, metadata: recentMeta }], nowMs }),
    { state: 'running', kind: 'active', elapsedSec: 12 }
  );

  // Compacting step (step_type 23)
  assert.deepEqual(
    deriveSessionStatus({ activeSteps: [{ idx: 6, step_type: 23, status: 2, metadata: recentMeta }], nowMs }),
    { state: 'running', kind: 'compacting', elapsedSec: 12 }
  );

  // Waiting >= 60s
  const oldMeta = encodeMetadataTimestamp(nowSec - 75);
  assert.deepEqual(
    deriveSessionStatus({ activeSteps: [{ idx: 7, step_type: 15, status: 2, metadata: oldMeta }], nowMs }),
    { state: 'waiting', kind: 'slow', elapsedSec: 75 }
  );

  // Real terminal error
  assert.deepEqual(
    deriveSessionStatus({ activeSteps: [], latestNonUserStep: { idx: 8, step_type: 17, status: 4, error_details: 'Rate limit exceeded' }, nowMs }),
    { state: 'error', kind: 'step_error', elapsedSec: 0 }
  );

  // User cancel stays ready
  assert.equal(isCancelText('Request cancelled by user'), true);
  assert.deepEqual(
    deriveSessionStatus({ activeSteps: [], latestNonUserStep: { idx: 9, step_type: 17, status: 4, error_details: 'Stopped by user' }, nowMs }),
    { state: 'ready', kind: 'idle', elapsedSec: 0 }
  );
});

test('localization translates dynamic quota exhausted & AI Credits banners while preserving model names', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(srcDir, 'i18n.json'), 'utf8'));
  const raw = fs.readFileSync(path.join(srcDir, 'localization.js'), 'utf8');
  const fnMatch = raw.match(/const RE_QUOTA_RESET_SWITCH =[\s\S]*?function translateQuotaBannerZh\(trimmed\) \{[\s\S]*?\n    \}/);
  assert.ok(fnMatch, 'translateQuotaBannerZh helper must exist in localization.js');

  const translateQuotaBannerZh = vm.runInNewContext(`(() => {\n${fnMatch[0]}\nreturn translateQuotaBannerZh;\n})()`);

  assert.equal(
    translateQuotaBannerZh('Your quota for Gemini 4 Neon (High) will reset on Nov 24, 3:00 PM. Switch to another available model to continue.'),
    'Gemini 4 Neon (High) 的配额将于 Nov 24, 3:00 PM 重置。请切换至其他可用模型继续。'
  );
  assert.equal(
    translateQuotaBannerZh('Your quota for this model has been reached. Switch to another available model to continue.'),
    '该模型的配额已用尽。请切换至其他可用模型继续。'
  );
  assert.equal(
    translateQuotaBannerZh("You need at least 20 AI Credits to send messages. To continue using Claude Opus 5.5 now, purchase more AI Credits. Your plan's baseline quota will refresh on Nov 25. You can upgrade to a higher Google AI Ultra plan to receive the highest rate limits."),
    '发送消息至少需要 20 AI 积分。如需立即继续使用 Claude Opus 5.5，请购买更多 AI 积分。您的套餐基础配额将于 Nov 25 刷新。您可升级至更高级别的 Google AI Ultra 套餐以获得最高速率限制。'
  );
  assert.equal(
    translateQuotaBannerZh('To continue using Gemini 3.8 Flash now, enable AI Credit overages.'),
    '如需立即继续使用 Gemini 3.8 Flash，请开启 AI 积分超额计费。'
  );
  assert.ok(Object.keys(dict).length >= 1910);
  assert.equal(dict['Swarm'], '蜂群协作');
  assert.equal(dict['Leaving Soon'], '即将下线');
  // 确认 localization.js 不再存在重复的 firstUpper === 'T' 死分支
  const tBranches = raw.match(/else if\s*\(firstUpper === 'T'\)/g) || [];
  assert.equal(tBranches.length, 1, 'firstUpper === "T" must only appear once so To continue banners are reachable');
});

test('appearance-pref validates font presets and exposes getFont/saveFont', () => {
  const pref = require(path.join(srcDir, 'appearance-pref.cjs'));
  assert.equal(pref.validFont('default'), true);
  assert.equal(pref.validFont('sans'), true);
  assert.equal(pref.validFont('serif'), true);
  assert.equal(pref.validFont('mono'), true);
  assert.equal(pref.validFont('comic-sans'), false);
  assert.ok(['default', 'sans', 'serif', 'mono'].includes(pref.getFont()));
});

test('turn-usage aggregates stream speed fields and panel includes sparkline & EN labels', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { aggregate } = require(path.join(srcDir, 'turn-usage.cjs'));
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type INTEGER); CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB);');
  db.prepare('INSERT INTO steps (idx, step_type) VALUES (?, ?)').run(1, 14);
  // 构造最小合法 gen_metadata protobuf：usage(input=1000, output=200, cacheRead=400), stream=2s, step=2
  const fieldVarint = (k, v) => Buffer.concat([encodeVarint((k << 3) | 0), encodeVarint(v)]);
  const fieldBytes = (k, b) => Buffer.concat([encodeVarint((k << 3) | 2), encodeVarint(b.length), b]);
  const usageBuf = Buffer.concat([fieldVarint(2, 1000), fieldVarint(3, 200), fieldVarint(5, 400)]);
  const durBuf = Buffer.concat([fieldVarint(1, 2), fieldVarint(2, 0)]);
  const chatBuf = Buffer.concat([fieldBytes(4, usageBuf), fieldBytes(11, durBuf), fieldBytes(12, durBuf)]);
  const topBuf = Buffer.concat([fieldBytes(1, chatBuf), fieldVarint(2, 2)]);
  db.prepare('INSERT INTO gen_metadata (idx, data) VALUES (?, ?)').run(1, topBuf);
  const res = aggregate(db);
  db.close();
  assert.equal(res.state, 'ready');
  assert.equal(res.session.streamOut, 200);
  assert.equal(res.session.streamSec, 2);

  const panelRaw = fs.readFileSync(path.join(srcDir, 'panel.js'), 'utf8');
  assert.match(panelRaw, /ag-spark/);
  assert.match(panelRaw, /平均生成速度/);
  assert.match(panelRaw, /'Overview'/);
  assert.match(panelRaw, /'Breakdown'/);
  assert.match(panelRaw, /'Quota'/);
  assert.match(panelRaw, /openTab/);
  assert.match(panelRaw, /ag-qsegs/);
  assert.match(panelRaw, /ag-qdots/);
  assert.match(panelRaw, /ag-qgauge-svg/);
  assert.match(panelRaw, /ag-pane-badge/);
  assert.match(panelRaw, /等效 API 费用/);
  assert.match(panelRaw, /子代理 \/ Swarm 派发/);
});

test('pricing estimates equivalent API cost and cache savings accurately', () => {
  const { matchPricing, estimateCost } = require(path.join(srcDir, 'pricing.cjs'));
  assert.equal(matchPricing('Gemini 4 Neon (Medium)')?.id, 'gemini-pro');
  assert.equal(matchPricing('Claude Sonnet 4.5')?.id, 'claude-sonnet');
  assert.equal(matchPricing('Unknown Local Model'), null);

  // 1M total input (800k cacheRead + 200k uncached), 100k output on Gemini Pro ($1.25 / $0.3125 / $10)
  const res = estimateCost('Gemini 4 Neon (High)', { input: 1_000_000, cacheRead: 800_000, output: 100_000 });
  assert.ok(res);
  assert.equal(res.rateId, 'gemini-pro');
  // 0.2*1.25 + 0.8*0.3125 + 0.1*10 = 0.25 + 0.25 + 1.0 = 1.5
  assert.equal(res.totalUsd, 1.5);
  // saved = 0.8 * (1.25 - 0.3125) = 0.75
  assert.equal(res.savedUsd, 0.75);
});

test('turn-usage counts has_subtrajectory steps when present and supports hot-reload hooks', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { aggregate } = require(path.join(srcDir, 'turn-usage.cjs'));
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type INTEGER, has_subtrajectory INTEGER); CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB);');
  db.prepare('INSERT INTO steps (idx, step_type, has_subtrajectory) VALUES (?, ?, ?)').run(1, 14, 0);
  db.prepare('INSERT INTO steps (idx, step_type, has_subtrajectory) VALUES (?, ?, ?)').run(2, 132, 1);
  db.prepare('INSERT INTO steps (idx, step_type, has_subtrajectory) VALUES (?, ?, ?)').run(3, 132, 1);
  const res = aggregate(db);
  db.close();
  assert.equal(res.subagentSteps, 2);

  const locRaw = fs.readFileSync(path.join(srcDir, 'localization.js'), 'utf8');
  const appRaw = fs.readFileSync(path.join(srcDir, 'appearance.js'), 'utf8');
  const launchRaw = fs.readFileSync(path.join(srcDir, 'launch.cjs'), 'utf8');
  assert.match(locRaw, /updateDict/);
  assert.match(appRaw, /setCustomCss/);
  assert.match(launchRaw, /startUserWatcher/);
});

test('notify triggers background completion, waiting, and error notifications without firing on quick foreground runs', () => {
  const { createStatusNotifier } = require(path.join(srcDir, 'notify.cjs'));
  const sent = [];
  const notifier = createStatusNotifier({ send: e => sent.push(e), minRunMs: 8000 });

  // Quick foreground run (< 8s): no notification
  notifier.observe('s1', { state: 'ready' }, { pageVisible: true, nowMs: 1000 });
  notifier.observe('s1', { state: 'running' }, { pageVisible: true, nowMs: 2000 });
  notifier.observe('s1', { state: 'ready' }, { pageVisible: true, nowMs: 5000 });
  assert.equal(sent.length, 0);

  // Background long run (>= 8s): fires completed notification
  notifier.observe('s1', { state: 'running' }, { pageVisible: false, nowMs: 10000 });
  notifier.observe('s1', { state: 'ready' }, { pageVisible: false, nowMs: 25000 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].kind, 'completed');

  // Waiting in background fires waiting notification
  notifier.observe('s1', { state: 'running' }, { pageVisible: false, nowMs: 30000 });
  notifier.observe('s1', { state: 'waiting', kind: 'slow' }, { pageVisible: false, nowMs: 95000 });
  assert.equal(sent.length, 2);
  assert.equal(sent[1].kind, 'waiting');

  // Error fires even when visible
  notifier.observe('s1', { state: 'error' }, { pageVisible: true, nowMs: 96000 });
  assert.equal(sent.length, 3);
  assert.equal(sent[2].kind, 'error');
});

test('loadSnippets returns defaults or valid user snippets and new preferences validate correctly', () => {
  const { loadSnippets, DEFAULT_SNIPPETS } = require(path.join(srcDir, 'user-overrides.cjs'));
  const pref = require(path.join(srcDir, 'appearance-pref.cjs'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agw-snip-'));
  try {
    assert.deepEqual(loadSnippets(tmp), DEFAULT_SNIPPETS);
    fs.writeFileSync(path.join(tmp, 'snippets.json'), JSON.stringify([
      { title: '代码审查', text: '请帮我做安全与性能审查' },
      { title: '', text: 'ignored' }
    ]));
    const loaded = loadSnippets(tmp);
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].title, '代码审查');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  assert.equal(pref.validWidth('focus'), true);
  assert.equal(pref.validWidth('huge'), false);
  assert.equal(pref.validSend('cmd-enter'), true);
  assert.equal(pref.validNotify('on'), true);

  const extrasRaw = fs.readFileSync(path.join(srcDir, 'workbench-extras.js'), 'utf8');
  const panelRaw = fs.readFileSync(path.join(srcDir, 'panel.js'), 'utf8');
  assert.match(extrasRaw, /ag-outline-rail/);
  assert.match(extrasRaw, /ag-snippet-drawer/);
  assert.match(panelRaw, /Copy Sanitized Report/);
});
