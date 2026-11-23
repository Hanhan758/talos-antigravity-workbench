'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {createHash,randomUUID} = require('node:crypto');
const digest = value => createHash('sha256').update(value,'utf8').digest('hex');
const isId = value => typeof value==='string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const isHash = value => typeof value==='string' && /^[a-f0-9]{64}$/.test(value);

// 只保留已确认新建、仍待命名的会话凭据。重开时标题和首条消息必须同时匹配。
function createReceipts(directory) {
  const file = path.join(directory,'pending-titles.json');
  let records = new Map();
  try {
    const stat = fs.lstatSync(file);
    if (stat.isFile() && stat.uid===process.getuid() && !(stat.mode&0o077) && stat.size<=65536) {
      const rows=JSON.parse(fs.readFileSync(file,'utf8'));
      if (Array.isArray(rows)) for (const row of rows.slice(-64)) {
        if (row && isId(row.id) && Number.isFinite(row.birth) && isHash(row.firstHash) && (!row.titleHash || isHash(row.titleHash)))
          records.set(row.id,row);
      }
    }
  } catch {}
  function commit() {
    const temporary = path.join(directory,'.pending-titles-'+randomUUID());
    fs.writeFileSync(temporary,JSON.stringify([...records.values()])+'\n',{flag:'wx',mode:0o600});
    fs.renameSync(temporary,file);
  }
  function remember(id,birth,first) {
    if (!isId(id) || records.has(id) || typeof first!=='string' || !first.trim()) return;
    if (records.size>=64) records.delete(records.keys().next().value);
    records.set(id,{id,birth,firstHash:digest(first),titleHash:null});
    commit();
  }
  function observe(id,title) {
    const r=records.get(id);
    if (r && title && !r.titleHash) { r.titleHash=digest(title); commit(); }
  }
  function forget(id) { if (records.delete(id)) commit(); }
  return {remember,observe,forget,get:id=>records.get(id),digest};
}
module.exports={createReceipts};
