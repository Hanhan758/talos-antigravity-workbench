'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const { sourceFor, decode } = require('./metrics.cjs');

function totals() {
  return { calls:0, input:0, inputN:0, output:0, outputN:0,
    cacheRead:0, cacheN:0, duration:0, timed:0, streamOut:0, streamSec:0 };
}

function add(sum, row) {
  sum.calls++;
  if (row.context !== null) { sum.input += row.context; sum.inputN++; }
  if (row.output !== null) { sum.output += row.output; sum.outputN++; }
  if (row.context !== null && row.cacheRead !== null) {
    sum.cacheRead += row.cacheRead; sum.cacheN++;
  }
  if (row.ttft !== null && row.stream !== null) {
    sum.duration += row.ttft + row.stream; sum.timed++;
  }
  if (row.output !== null && row.stream !== null && row.stream > 0) {
    sum.streamOut += row.output; sum.streamSec += row.stream;
  }
}

function roundIndex(starts, step) {
  if (step === null) return -1;
  let lo = 0, hi = starts.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (starts[mid] <= step) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

function aggregate(db) {
  const session = totals();
  const starts = db.prepare('SELECT idx FROM steps WHERE step_type=14 ORDER BY idx').all().map(row=>row.idx);
  const recent = new Map();
  const profile = db.prepare('SELECT data FROM gen_metadata WHERE idx=? AND length(data)=?');
  const maxRows = 16000;
  let budget = 128 * 1024 * 1024, missing = 0, unmapped = 0, scanned = 0, bounded = false;
  const rows = db.prepare('SELECT idx,length(data) AS bytes FROM gen_metadata ORDER BY idx DESC LIMIT ?');
  for (const {idx,bytes} of rows.iterate(maxRows + 1)) {
    if (++scanned > maxRows || bytes > budget) { bounded = true; break; }
    if (!bytes) continue;
    if (bytes > 16 * 1024 * 1024) { missing++; continue; }
    budget -= bytes;
    let item;
    try { item = decode(profile.get(idx,bytes).data, true); }
    catch { missing++; continue; }
    if (!item) continue;
    add(session,item);
    const i = roundIndex(starts,item.step);
    if (i < 0) { unmapped++; continue; }
    // 面板只展示最近的轮次，整段会话累计仍计入所有已读取的调用。
    if (i < starts.length-8) continue;
    if (!recent.has(i)) recent.set(i,totals());
    add(recent.get(i),item);
  }
  const turns = starts.slice(-8).map((_,i,tail)=>{
    const index = starts.length-tail.length+i;
    return {number:index+1,...(recent.get(index) || totals())};
  }).reverse();
  let subagentSteps = 0;
  try {
    const row = db.prepare('SELECT count(*) AS c FROM steps WHERE has_subtrajectory = 1').get();
    if (row && Number.isSafeInteger(row.c) && row.c > 0) subagentSteps = row.c;
  } catch {}
  return {state:'ready',session,turnCount:starts.length,turns,unmapped,subagentSteps,partial:bounded || missing>0};
}

function readSnapshot(uuid) {
  const src = sourceFor(uuid);
  if (src.state) return src;
  const db = new DatabaseSync(src.dbPath,{readOnly:true,timeout:180});
  try { db.exec('PRAGMA query_only=ON; BEGIN'); return aggregate(db); }
  finally { db.close(); }
}

if (!isMainThread) {
  try { parentPort.postMessage(readSnapshot(workerData)); }
  catch { parentPort.postMessage({state:'unavailable'}); }
}

// 仅在用户展开明细时扫描，放在工作线程中，不占用界面同步和额度刷新。
const entries = new Map();
function summaryFor(uuid) {
  let src;
  try { src=sourceFor(uuid); } catch { return {state:'unavailable'}; }
  if (src.state) return src;
  const now=Date.now(), saved=entries.get(src.id);
  if (saved && (saved.pending || now-saved.at<10000 ||
      (saved.signature===src.signature && saved.result.state==='ready'))) return saved.result;
  if ([...entries.values()].filter(x=>x.pending).length>=2) return {state:'loading'};
  const entry={pending:true, at:now, signature:src.signature, result:{state:'loading'}};
  entries.delete(src.id); entries.set(src.id,entry);
  if (entries.size>8) {
    const disposable=[...entries].find(([,v])=>!v.pending);
    if (disposable) entries.delete(disposable[0]);
  }
  const worker=new Worker(__filename,{workerData:src.id});
  const finish=result=>{if(entry.pending){entry.pending=false;entry.at=Date.now();entry.result=result;}};
  worker.once('message',finish);
  worker.once('error',()=>finish({state:'unavailable'}));
  worker.once('exit',()=>finish({state:'unavailable'}));
  worker.unref();
  return entry.result;
}

module.exports={summaryFor,aggregate};
