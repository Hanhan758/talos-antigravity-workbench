'use strict';
const {spawnSync}=require('node:child_process');
const domain='local.antigravity.zh-launcher';
const key='WorkspaceAppearance';
const langKey='InterfaceLanguage';
const quotaKey='QuotaEnabled';
const fontKey='InterfaceFont';
const widthKey='ReadingWidth';
const sendKey='SendShortcut';
const notifyKey='NotifyEnabled';
const pickerKey='ModelPicker';
const valid=mode=>['google','claude','codex'].includes(mode);
const validLang=lang=>['zh','en'].includes(lang);
const validQuota=v=>['on','off'].includes(v);
const validFont=v=>['default','sans','serif','mono'].includes(v);
const validWidth=v=>['default','focus','wide','full'].includes(v);
const validSend=v=>['enter','cmd-enter'].includes(v);
const validNotify=v=>['on','off'].includes(v);
const validPicker=v=>['codex','native'].includes(v);

const saved=spawnSync('/usr/bin/defaults',['read',domain,key],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let mode=(saved.stdout||'').trim();
if(!valid(mode)) mode='google';

const savedLang=spawnSync('/usr/bin/defaults',['read',domain,langKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let lang=(savedLang.stdout||'').trim();
if(!validLang(lang)) lang='zh';

const savedQuota=spawnSync('/usr/bin/defaults',['read',domain,quotaKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let quota=(savedQuota.stdout||'').trim();
if(!validQuota(quota)) quota='on';

const savedFont=spawnSync('/usr/bin/defaults',['read',domain,fontKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let font=(savedFont.stdout||'').trim();
if(!validFont(font)) font='default';

const savedWidth=spawnSync('/usr/bin/defaults',['read',domain,widthKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let width=(savedWidth.stdout||'').trim();
if(!validWidth(width)) width='default';

const savedSend=spawnSync('/usr/bin/defaults',['read',domain,sendKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let sendShortcut=(savedSend.stdout||'').trim();
if(!validSend(sendShortcut)) sendShortcut='enter';

const savedNotify=spawnSync('/usr/bin/defaults',['read',domain,notifyKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let notify=(savedNotify.stdout||'').trim();
if(!validNotify(notify)) notify='on';

const savedPicker=spawnSync('/usr/bin/defaults',['read',domain,pickerKey],{encoding:'utf8',timeout:1200,stdio:['ignore','pipe','ignore']});
let picker=(savedPicker.stdout||'').trim();
if(!validPicker(picker)) picker='codex';

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
function saveFont(next) {
  if(!validFont(next)) return false;
  if(next===font) return true;
  const result=spawnSync('/usr/bin/defaults',['write',domain,fontKey,'-string',next],{timeout:1500,stdio:'ignore'});
  if(result.status!==0) return false;
  font=next; return true;
}
function saveWidth(next) {
  if(!validWidth(next)) return false;
  if(next===width) return true;
  const result=spawnSync('/usr/bin/defaults',['write',domain,widthKey,'-string',next],{timeout:1500,stdio:'ignore'});
  if(result.status!==0) return false;
  width=next; return true;
}
function saveSend(next) {
  if(!validSend(next)) return false;
  if(next===sendShortcut) return true;
  const result=spawnSync('/usr/bin/defaults',['write',domain,sendKey,'-string',next],{timeout:1500,stdio:'ignore'});
  if(result.status!==0) return false;
  sendShortcut=next; return true;
}
function saveNotify(next) {
  if(!validNotify(next)) return false;
  if(next===notify) return true;
  const result=spawnSync('/usr/bin/defaults',['write',domain,notifyKey,'-string',next],{timeout:1500,stdio:'ignore'});
  if(result.status!==0) return false;
  notify=next; return true;
}
function savePicker(next) {
  if(!validPicker(next)) return false;
  if(next===picker) return true;
  const result=spawnSync('/usr/bin/defaults',['write',domain,pickerKey,'-string',next],{timeout:1500,stdio:'ignore'});
  if(result.status!==0) return false;
  picker=next; return true;
}
module.exports={
  get:()=>mode,save,
  getLang:()=>lang,saveLang,
  getQuota:()=>quota,saveQuota,
  getFont:()=>font,saveFont,validFont,
  getWidth:()=>width,saveWidth,validWidth,
  getSend:()=>sendShortcut,saveSend,validSend,
  getNotify:()=>notify,saveNotify,validNotify,
  getPicker:()=>picker,savePicker,validPicker
};