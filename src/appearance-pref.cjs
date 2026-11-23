'use strict';
const {spawnSync}=require('node:child_process');
const domain='local.antigravity.zh-launcher';
const key='WorkspaceAppearance';
const langKey='InterfaceLanguage';
const quotaKey='QuotaEnabled';
const valid=mode=>['google','claude','codex'].includes(mode);
const validLang=lang=>['zh','en'].includes(lang);
const validQuota=v=>['on','off'].includes(v);

const saved=spawnSync('/usr/bin/defaults',['read',domain,key],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let mode=(saved.stdout||'').trim();
if(!valid(mode)) mode='google';

const savedLang=spawnSync('/usr/bin/defaults',['read',domain,langKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let lang=(savedLang.stdout||'').trim();
if(!validLang(lang)) lang='zh';

const savedQuota=spawnSync('/usr/bin/defaults',['read',domain,quotaKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let quota=(savedQuota.stdout||'').trim();
if(!validQuota(quota)) quota='on';

function save(next) {
  if(!valid(next)) return false;
  if(next===mode) return true;
  const result=spawnSync('/usr/bin/defaults',['write',domain,key,'-string',next],{timeout:1500,stdio:'ignore'});
  if(result.status!==0) return false;
  mode=next; return true;
}
function saveLang(next) {
  if(!validLang(next)) return false;
  if(next===lang) return true;
  const result=spawnSync('/usr/bin/defaults',['write',domain,langKey,'-string',next],{timeout:1500,stdio:'ignore'});
  if(result.status!==0) return false;
  lang=next; return true;
}
function saveQuota(next) {
  if(!validQuota(next)) return false;
  if(next===quota) return true;
  const result=spawnSync('/usr/bin/defaults',['write',domain,quotaKey,'-string',next],{timeout:1500,stdio:'ignore'});
  if(result.status!==0) return false;
  quota=next; return true;
}
module.exports={get:()=>mode,save,getLang:()=>lang,saveLang,getQuota:()=>quota,saveQuota};