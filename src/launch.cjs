'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');

const bundle = path.resolve(process.env.ANTIGRAVITY_APP_PATH || '/Applications/Antigravity.app');
const executable = path.join(bundle, 'Contents/MacOS/Antigravity');
const profile = path.join(os.homedir(), 'Library/Caches/antigravity-local-zh');
const statusPath = path.join(profile, 'status.json');
const script = fs.readFileSync(path.join(__dirname, 'localization.js'), 'utf8').trim().replace(/;$/, '');
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
const panelScript = fs.readFileSync(path.join(__dirname, 'panel.js'), 'utf8').trim().replace(/;$/, '');
const quotaScript = fs.readFileSync(path.join(__dirname, 'quota.js'), 'utf8').trim();
const appearancePref = require('./appearance-pref.cjs');
const displayProfile = require('./profile-display.cjs');
const appearanceSource = fs.readFileSync(path.join(__dirname,'appearance.js'),'utf8')
  .replace('__AG_ACCOUNT_FOOTER__',()=>fs.readFileSync(path.join(__dirname,'account-footer.js'),'utf8').trim())
  .replace('__AG_WORKSPACE_LAYOUT__',()=>fs.readFileSync(path.join(__dirname,'workspace-layout.js'),'utf8').trim())
  .replace('__AG_APPEARANCE_CSS__',()=>JSON.stringify(['appearance.css','workspace-layout.css'].map(name=>fs.readFileSync(path.join(__dirname,name),'utf8')).join('\n')));
const themeSessions = new Map();
const { summaryFor } = require('./turn-usage.cjs');
const { readMetrics } = require('./metrics.cjs');
const { createQuotaReader } = require('./quota-cli.cjs');
const profileStat = fs.lstatSync(profile);
if (!profileStat.isDirectory() || profileStat.uid !== process.getuid() || (profileStat.mode & 0o077)) {
  throw new Error('状态目录必须是当前用户独享的目录');
}

// 已运行的原版应用需要用户自行正常退出，避免打断会话。
const running = execFileSync('/bin/ps', ['-ax', '-o', 'pid=,comm='], { encoding: 'utf8' })
  .split('\n').map(line => line.trim().match(/^(\d+)\s+(.+)$/))
  .find(entry => entry && entry[2] === executable);
if (running) return;

const app = spawn(executable, ['--remote-debugging-pipe'], {
  stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'],
  cwd: os.homedir()
});
const namingStartedAt = Date.now();
const namingOwners = new Map();
const receipts = require('./title-receipts.cjs').createReceipts(profile);
const namingScript = ['title-format.js','native-rename.js','title-session.js'].map(name =>
  fs.readFileSync(path.join(__dirname,name),'utf8').trim() + ';'
).join('\n');
const quotaReader = createQuotaReader();
let nextQuotaRetry = 0;
const sendPipe = app.stdio[3];
const receivePipe = app.stdio[4];
const pending = new Map();
const sessions = new Map();
let sequence = 0;
let previous = '';
let finished = false;

const safeExamples = new Set(['系统设置', '设置', '新建对话', '项目管理', '对话管理', '常规设置', '知识工作', '权限', '取消', '插件', '新建项目', '打开项目', '归档', '历史记录', '收件箱', '搜索', '新对话', '自定义', '工作区', '快捷键', '打开文件夹', '软件工程', '对话', '项目', '新建会话', '开始使用', '下一步', '继续', '跳过']);

function writeStatus(phase, pages = 0, labelsFound = 0, examples = [], panel = {}, naming = null, appearance = null) {
  const snapshot = { phase, appPid: app.pid || null, pages, labelsFound, examples, panel, naming, appearance };
  const key = JSON.stringify(snapshot);
  if (previous === key) return;
  const temporary = statusPath + '.' + randomUUID();
  try {
    fs.writeFileSync(temporary, JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() }) + '\n', {
      flag: 'wx', mode: 0o600
    });
    fs.renameSync(temporary, statusPath);
    previous = key;
  } catch {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

function request(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    if (finished || sendPipe.destroyed) return reject(new Error('管道已关闭'));
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('应用响应超时'));
    }, 4000);
    pending.set(id, message => {
      clearTimeout(timer);
      if (message.error) reject(new Error('应用未接受请求'));
      else resolve(message.result);
    });
    sendPipe.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });
}

receivePipe.setEncoding('utf8');
let buffer = '';
receivePipe.on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\0')) !== -1) {
    const packet = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    let message;
    try { message = JSON.parse(packet); } catch { continue; }
    const callback = pending.get(message.id);
    if (callback) {
      pending.delete(message.id);
      callback(message);
    } else if (message.method === 'Runtime.bindingCalled' && message.params?.name === '__agLocalAppearanceChanged' &&
        (message.params.payload === 'selection' || message.params.payload === 'language' || message.params.payload === 'quota')) {
      const entry = themeSessions.get(message.sessionId);
      if (entry) {
        syncAppearance(message.sessionId,entry.url)
          .then(() => {
            if (message.params.payload === 'quota') {
              if (appearancePref.getQuota() !== 'on') quotaReader.invalidate();
              return refreshPanel(message.sessionId, entry.url);
            }
          })
          .catch(()=>{});
      }
    } else if (message.method === 'Target.detachedFromTarget') {
      themeSessions.delete(message.params.sessionId);
      for (const [id, session] of sessions) {
        if (session === message.params.sessionId) sessions.delete(id);
      }
    }
  }
});
sendPipe.on('error', () => {});
receivePipe.on('error', () => {});

// 只接受本地应用页面。页面切换时，在执行词典前再次校验 URL 与工作台特征。
function allowedPage(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === '127.0.0.1' &&
      Boolean(url.port) && !url.username && !url.password;
  } catch { return false; }
}

const isHost = `window === window.top && document.body &&
  typeof window.electronNative?.getZoomLevel === 'function' &&
  typeof window.electronNative?.setTitleBarOverlay === 'function'`;

async function evaluate(sessionId, url, body) {
  const expression = `(() => { if (location.href !== ${JSON.stringify(url)} || !(${isHost})) return null; ${body} })()`;
  const result = await request('Runtime.evaluate', { expression, returnByValue: true, silent: true }, sessionId);
  return result.exceptionDetails ? null : result.result?.value;
}

async function refreshPanel(session, targetUrl) {
  const quotaReady = await evaluate(session,targetUrl,'return !!window.__agQuotaSummary;');
  if (quotaReady === false) await evaluate(session,targetUrl,`return (${quotaScript});`);
  let info = await evaluate(session, targetUrl,
    "return window.__agContextPanel ? window.__agContextPanel.get() : 'mount';");
  if (info === 'mount') {
    info = await evaluate(session, targetUrl,
      `(${panelScript}); return window.__agContextPanel?.get() ?? null;`);
  }
  const intent = await evaluate(session,targetUrl,
    `return window.__agQuotaSummary?.takeRequest(${info?.mounted === true && info?.pageVisible === true}) ?? null;`);
  if (intent?.clear) { quotaReader.invalidate(); nextQuotaRetry = 0; }
  if (!info?.mounted) return { mounted: false };
  if (info.pageVisible) {
    if (appearancePref.getQuota() !== 'on') {
      quotaReader.invalidate();
      await evaluate(session,targetUrl,`window.__agQuotaSummary?.apply(${JSON.stringify({status:'disabled',items:[],seenAt:0,expiresAt:0,stale:false,source:'cli'})}); return true;`);
    } else {
      const now = Date.now();
      const snapshot = quotaReader.snapshot();
      const expiredWindow = snapshot.items.some(row => row.resetAt && row.resetAt <= now);
      const needsUpdate = !snapshot.seenAt || now - snapshot.seenAt >= 120000 || expiredWindow;
      if (intent?.requested || (needsUpdate && now >= nextQuotaRetry)) {
        quotaReader.request(intent?.requested === 'force');
        nextQuotaRetry = now + 60000;
      }
      await evaluate(session,targetUrl,`window.__agQuotaSummary?.apply(${JSON.stringify({...quotaReader.snapshot(),source:'cli'})}); return true;`);
    }
  }
  const id = info.id || null;
  const latest = id ? readMetrics(id) : { state: 'empty' };
  const data = id && info.open && info.showUsage && info.pageVisible ? {...latest, usage:summaryFor(id)} : latest;
  const result = await evaluate(session, targetUrl,
    `const panel = window.__agContextPanel;
     if (!panel || panel.get().id !== ${JSON.stringify(id)}) return null;
     panel.update(${JSON.stringify(id)}, ${JSON.stringify(data)});
     const current = panel.get();
     const observedQuotas = window.__agQuotaSummary?.get()?.items ?? [];
     const button = document.getElementById('ag-local-context-trigger');
     const card = document.getElementById('ag-local-context-card');
     const composer = document.querySelector('[id="antigravity.agentSidePanelInputBox"]') || button?.parentElement;
     const br = button?.getBoundingClientRect(), cr = composer?.getBoundingClientRect(), dr = card?.getBoundingClientRect();
     const mid = r => r.left + r.width / 2;
     const mr = (composer?.querySelector('[data-testid="model-selector-trigger"]') || document.querySelector('[data-testid="model-selector-trigger"]'))?.getBoundingClientRect();
     return { mounted: current.mounted === true, open: current.open === true,
       rowDeltaY: br && mr ? Math.round((br.top+br.height/2)-(mr.top+mr.height/2)) : null,
       modelGap: br && mr ? Math.round(br.left-mr.right) : null,
       ringSize: button?.querySelector('.ag-mini-dial')?.offsetWidth,
       triggerOffset: br && cr ? Math.round(mid(br) - mid(cr)) : null,
       rightGap: current.open && dr ? Math.round(innerWidth - dr.right) : null,
       bottomGap: current.open && dr ? Math.round(innerHeight - dr.bottom) : null,
       cardWidth: current.open && dr ? Math.round(dr.width) : null,
       cardHeight: current.open && dr ? Math.round(dr.height) : null,
       toolbarRings: button?.querySelectorAll('[data-summary-ring]').length || 0,
       toolbarPercentages: button ? [...button.querySelectorAll('.ag-mini-dial')].filter(el => el.textContent.endsWith('%')).length : 0,
       quotaWindows: observedQuotas.length,
       resetTimes: observedQuotas.filter(row => Number.isFinite(row.resetAt)).length,
       quotaStatus: window.__agQuotaSummary?.get()?.status,
       resetLabels: current.open && card ? [...card.querySelectorAll('[data-ag-chart^="quota-"] .ag-small')].filter(el=>/后重置|到重置时间/.test(el.textContent || '')).length : 0,
       usageDetail: current.open && current.showUsage ? (card?.querySelector('.ag-usage-table') ? 'rounds' : card?.querySelectorAll('.ag-usage-section').length >= 3 ? 'summary' : 'waiting') : null,
       chartCount: current.open && card ? card.querySelectorAll('[data-ag-chart]').length : 0 };`);
  return result?.mounted ? { ...result, state: id ? data.state : 'no-session' } : { mounted: false };
}

// Only stat a candidate produced by an observed first submission. Historical databases are never title sources.
function newConversationBirth(candidate, owner) {
  const {id,since,sentAt} = candidate;
  const now = Date.now();
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id) ||
      !Number.isFinite(since) || !Number.isFinite(sentAt) || since<namingStartedAt-1000 ||
      sentAt<since || sentAt>now+1000 || now-sentAt>180000) return false;
  const other = namingOwners.get(id);
  if (other && other!==owner) return false;
  const file = path.join(os.homedir(),'.gemini','antigravity','conversations',id+'.db');
  const stat = fs.lstatSync(file,{throwIfNoEntry:false});
  if (!stat) return null;
  const birth = stat.birthtimeMs;
  if (!stat.isFile() || stat.uid!==process.getuid() || !Number.isFinite(birth) ||
      birth<namingStartedAt || birth<since-1500 || birth>now+1000) return false;
  namingOwners.set(id,owner);
  return birth;
}

async function syncNewTitle(session, targetUrl) {
  const value = await evaluate(session,targetUrl,
    "return window.__agNewChatNames ? window.__agNewChatNames.collect() : 'mount';");
  if (value==='mount') {
    await evaluate(session,targetUrl,namingScript + '\nreturn true;');
    return {phase:'watching',handled:0};
  }
  if (!value) return null;
  for (const id of value.retired || []) { receipts.forget(id); namingOwners.delete(id); }
  if (value.baseline && value.currentTracked) receipts.observe(value.activeId,value.baseline);
  if (value.phase==='check-creation') {
    const birth=newConversationBirth(value,session);
    if (birth!==null) {
      await evaluate(session,targetUrl,
        `window.__agNewChatNames.admit(${JSON.stringify(value.id)},${JSON.stringify(birth)}); return true;`);
      if (birth!==false) receipts.remember(value.id,birth,value.first);
    }
  } else if (value.activeId && !value.currentTracked && !namingOwners.has(value.activeId)) {
    const id=value.activeId, receipt=receipts.get(id);
    if (receipt?.titleHash) {
      const e=await evaluate(session,targetUrl,`return window.__agNewChatNames.evidence(${JSON.stringify(id)});`);
      if (e) {
        if (receipts.digest(e.old)!==receipt.titleHash || receipts.digest(e.first)!==receipt.firstHash) {
          receipts.forget(id);
        } else {
          const resumed=await evaluate(session,targetUrl,
            `return window.__agNewChatNames.resume(${JSON.stringify(id)},${JSON.stringify(receipt.birth)},${JSON.stringify(e.old)},${JSON.stringify(e.first)});`);
          if (resumed) namingOwners.set(id,session);
        }
      }
    }
  }
  const {phase,handled,awaiting,hasRoute,hasFirst,listedBefore}=value;
  return {phase,handled,awaiting,hasRoute,hasFirst,listedBefore};
}

async function syncAppearance(session,url) {
  let entry=themeSessions.get(session);
  if (!entry) {
    entry={url};
    themeSessions.set(session,entry);
    await request('Runtime.addBinding',{name:'__agLocalAppearanceChanged'},session).catch(()=>{});
  }
  entry.url=url;
  const read=await evaluate(session,url,"return window.__agLocalAppearance?.snapshot() ?? 'mount';");
  if (read==='mount') {
    const code=appearanceSource.replace('__AG_INITIAL_APPEARANCE__',()=>JSON.stringify(appearancePref.get()))
      .replace('__AG_INITIAL_LANG__',()=>JSON.stringify(appearancePref.getLang()))
      .replace('__AG_INITIAL_QUOTA__',()=>JSON.stringify(appearancePref.getQuota()))
      .replace('__AG_ACCOUNT_CONTEXT__',()=>JSON.stringify(displayProfile.context()));
    return evaluate(session,url,`return (${code.trim().replace(/;$/,'')});`);
  }
  if (!read) return null;
  const evidence = read.account?.source==='settings-profile' || entry.hadProfile
    ? await evaluate(session,url,'return window.__agLocalAppearance?.takeProfile() ?? null;') : null;
  if (evidence) displayProfile.record(evidence);
  entry.hadProfile=!!read.account?.known;
  const ctx=displayProfile.context();
  const displayKey=JSON.stringify([ctx.hint,ctx.profile?.name,ctx.profile?.email,!!ctx.profile?.photo]);
  if(entry.displayKey!==displayKey){
    entry.displayKey=displayKey;
    await evaluate(session,url,`window.__agLocalAppearance?.acceptProfile(${JSON.stringify(ctx)});return true;`);
  }
  const choice=read.pending;
  const validChoice=choice && typeof choice.id==='string' && choice.id.length===36 && ['claude','codex','google'].includes(choice.mode);
  const ok=!validChoice || appearancePref.save(choice.mode);
  const langChoice=read.pendingLang;
  const validLangChoice=langChoice && typeof langChoice.id==='string' && langChoice.id.length===36 && ['zh','en'].includes(langChoice.lang);
  const langOk=!validLangChoice || appearancePref.saveLang(langChoice.lang);
  const quotaChoice=read.pendingQuota;
  const validQuotaChoice=quotaChoice && typeof quotaChoice.id==='string' && quotaChoice.id.length===36 && ['on','off'].includes(quotaChoice.quota);
  const quotaOk=!validQuotaChoice || appearancePref.saveQuota(quotaChoice.quota);
  const currentLang=appearancePref.getLang();
  const currentQuota=appearancePref.getQuota();
  const args=[appearancePref.get(),validChoice ? choice.id : null,!ok,currentLang,validLangChoice ? langChoice.id : null,!langOk,currentQuota,validQuotaChoice ? quotaChoice.id : null,!quotaOk].map(v=>JSON.stringify(v)).join(',');
  return evaluate(session,url,`window.__agLocalZhControl?.setLang(${JSON.stringify(currentLang)});const theme=window.__agLocalAppearance;if(!theme)return null;theme.reconcile(${args});return theme.snapshot();`);
}

async function localize(target) {
  let session = sessions.get(target.targetId);
  if (!session) {
    session = (await request('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    sessions.set(target.targetId, session);
  }
  // 先同步外观与语言偏好，避免轮询用旧语言覆盖刚点击的新语言。
  const appearance=await syncAppearance(session,target.url).catch(()=>null);
  const summarize = `return { applied: state?.applied === true, labels: Array.isArray(state?.labels) ? state.labels.slice(0, 100) : [] };`;
  let state = await evaluate(session, target.url,
    `if (typeof window.__agLocalZhStatus !== 'function') return 'mount'; window.__agLocalZhControl?.setLang(${JSON.stringify(appearancePref.getLang())}); const state = window.__agLocalZhStatus(); ${summarize}`);
  if (state === 'mount') {
    state = await evaluate(session, target.url, `const state = (${script.replace('__AG_INITIAL_LANG__', JSON.stringify(appearancePref.getLang()))}); ${summarize}`);
  }
  const naming = await syncNewTitle(session,target.url).catch(()=>({phase:'unavailable'}));
  const panel = await refreshPanel(session, target.url).catch(() => ({ mounted: false }));
  return { labels: state?.applied ? state.labels : [], panel, naming, appearance };
}

async function check() {
  if (finished) return;
  try {
    const { targetInfos } = await request('Target.getTargets');
    const pages = targetInfos.filter(t => t.type === 'page' && allowedPage(t.url));
    const current = new Set(pages.map(t => t.targetId));
    for (const [id, sessionId] of sessions) {
      if (!current.has(id)) {
        sessions.delete(id);
        themeSessions.delete(sessionId);
        await request('Target.detachFromTarget', { sessionId }).catch(() => {});
      }
    }
    const results = await Promise.allSettled(pages.map(localize));
    const windows = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    const labels = new Set(windows.flatMap(w => w.labels));
    const panel = windows.find(w => w.panel.mounted && w.panel.open)?.panel || windows.find(w => w.panel.mounted)?.panel || { mounted: false };
    const naming = windows.find(w=>w.naming?.phase && w.naming.phase!=='watching')?.naming || windows.find(w=>w.naming)?.naming;
    const examples = [...labels].filter(label => safeExamples.has(label)).slice(0, 6);
    if (!finished) writeStatus(labels.size ? 'localized' : 'checking', pages.length, labels.size, examples, panel, naming, windows.find(w=>w.appearance)?.appearance ?? null);
  } catch {
    if (!finished) writeStatus('checking');
  } finally {
    if (!finished) setTimeout(check, 2200);
  }
}

function finish(phase) {
  if (finished) return;
  finished = true;
  quotaReader.close();
  for (const callback of pending.values()) callback({ error: true });
  pending.clear();
  writeStatus(phase);
}

app.once('error', () => finish('launch-failed'));
app.once('exit', () => finish('closed'));
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => { finish('terminated'); process.exit(0); });
}
writeStatus('starting');
check();
