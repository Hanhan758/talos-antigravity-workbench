'use strict';

const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const runFile = promisify(execFile);
const cli = path.join(os.homedir(), '.local/bin/agy');
const signature = 'anchor apple generic and identifier "cli" and certificate leaf[subject.OU] = "EQHXZ8M8AV"';
const cacheLifetime = 10 * 60 * 1000;
const groups = new Map([['gemini models', 'Gemini 模型'], ['claude and gpt models', 'Claude 与 GPT 模型']]);
const periods = new Map([['5h', 'five'], ['weekly', 'week']]);

function parseUsage(output) {
  const report = JSON.parse(output);
  if (report.status !== 'SUCCESS' || report.command?.name !== 'usage' ||
      report.num_turns !== 0 || report.usage?.total_tokens !== 0 ||
      !Array.isArray(report.command.data?.groups)) throw new Error('额度报告不可用');

  const rows = new Map();
  for (const source of report.command.data.groups) {
    const group = groups.get(String(source?.name || '').trim().toLowerCase());
    if (!group || !Array.isArray(source.buckets)) continue;
    for (const bucket of source.buckets) {
      const period = periods.get(bucket?.window);
      if (!period) continue;
      const fraction = bucket.remaining_fraction;
      const percent = Number.isFinite(fraction) && fraction >= 0 && fraction <= 1
        ? Math.floor(fraction * 100 + 1e-10) : null;
      const raw = bucket.reset_time;
      const timestamp = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)
        ? Date.parse(raw) : NaN;
      const resetAt = Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
      const key = group + '/' + period;
      const previous = rows.get(key);
      if (rows.has(key) && (!previous || previous.percent !== percent || previous.resetAt !== resetAt)) {
        rows.set(key, null);
      } else {
        rows.set(key, {group, period, percent, resetAt});
      }
    }
  }
  const items = [...rows.values()].filter(Boolean);
  if (!items.length) throw new Error('额度报告无匹配分组');
  return items;
}

// 给这次额度查询一个独立的进程组，以便在查询结束或中断时一并回收它创建的子进程。
function runQuotaCommand(options,signal) {
  return new Promise((resolve,reject) => {
    if (signal.aborted) return reject(new Error('额度查询已取消'));
    const args = ['-D','QUOTA_CLI='+cli,'-D','DOCUMENTS='+path.join(os.homedir(),'Documents'),
      '-f',path.join(__dirname,'quota-only.sb'),cli,'--disable-slash-commands=false','--settings','{"disableSlashCommands":false}',
      '-p','/usage','--output-format','json','--log-file','/dev/null','--print-timeout','25s'];
    const child = spawn('/usr/bin/sandbox-exec', args, {
      cwd:options.cwd, env:options.env, detached:true, shell:false, stdio:['ignore','pipe','ignore']
    });
    const chunks = [];
    let size=0, stopped=false, finished=false, forceTimer;
    const endGroup = sig => {
      if (!Number.isInteger(child.pid) || child.pid<=1) return;
      try { process.kill(-child.pid,sig); } catch {}
    };
    const reap = () => {
      if (forceTimer) return;
      endGroup('SIGTERM');
      forceTimer=setTimeout(()=>endGroup('SIGKILL'),350);
    };
    const abort=()=>{ stopped=true; reap(); };
    const timeout=setTimeout(abort,30000);
    signal.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',data=>{
      size+=data.length;
      if(size>192*1024) abort();
      else chunks.push(data);
    });
    child.on('exit',reap);
    function complete(code) {
      if(finished)return;
      finished=true;
      clearTimeout(timeout);
      signal.removeEventListener('abort',abort);
      if(stopped || code!==0) reject(new Error('受限额度查询未完成'));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    }
    child.once('error',()=>{reap();complete(-1);});
    child.once('close',complete);
  });
}

async function fetchQuota(signal) {
  const options = {
    cwd:'/private/var/empty',
    env:{HOME:os.homedir(), PATH:'/usr/bin:/bin:/usr/sbin:/sbin', TMPDIR:os.tmpdir(), LANG:'en_US.UTF-8'}
  };
  await runFile('/usr/bin/codesign',['--verify','--strict','-R='+signature,cli],{
    ...options,encoding:'utf8',timeout:8000,maxBuffer:192*1024,signal
  });
  return parseUsage(await runQuotaCommand(options,signal));
}

function createQuotaReader() {
  let state = {status: 'idle', items: [], seenAt: 0, expiresAt: 0};
  let active = null;
  let finishedAt = 0;
  let closed = false;

  function snapshot() {
    const stale = state.seenAt > 0 && Date.now() >= state.expiresAt;
    return {...state, status: stale && state.status === 'ready' ? 'unavailable' : state.status, stale};
  }

  function request(force = false) {
    if (closed) return Promise.resolve(false);
    if (active) return active.promise;
    const now = Date.now();
    const retryAfter = state.status === 'unavailable' ? 30000 : 15000;
    if (finishedAt && now - finishedAt < (force ? 5000 : retryAfter)) {
      return Promise.resolve(state.status === 'ready');
    }

    const attempt = {controller: new AbortController()};
    active = attempt;
    state = {...state, status: 'refreshing'};
    attempt.promise = fetchQuota(attempt.controller.signal).then(items => {
      if (active !== attempt) return false;
      const seenAt = Date.now();
      state = {status: 'ready', items, seenAt, expiresAt: seenAt + cacheLifetime};
      return true;
    }).catch(() => {
      if (active === attempt) state = {...state, status: 'unavailable'};
      return false;
    }).finally(() => {
      if (active === attempt) {
        active = null;
        finishedAt = Date.now();
      }
    });
    return attempt.promise;
  }

  function invalidate() {
    const old = active;
    active = null;
    old?.controller.abort();
    finishedAt = 0;
    state = {status: 'idle', items: [], seenAt: 0, expiresAt: 0};
  }
  function close() { closed = true; invalidate(); }
  return { snapshot, request, invalidate, close };
}

module.exports = {createQuotaReader};
