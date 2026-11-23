'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const dir=path.join(os.homedir(),'Library','Application Support','Antigravity 中文启动器');
const file=path.join(dir,'display-profile.json');
const native=path.join(os.homedir(),'Library','Application Support','Antigravity','app_storage.json');
const email=/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
let cached=null,hint='',checked=0,disabled=false,nativeStamp='';
function valid(p) {
  if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>72||/[<>\r\n]/.test(p.name)||
      typeof p.email!=='string'||p.email.length>254||!email.test(p.email)||typeof p.photo!=='string')return null;
  let pic='';
  if(p.photo.length<=45000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.photo))pic=p.photo;
  else if(p.photo.length<=1600){try{const u=new URL(p.photo);if(u.protocol==='https:'&&/(^|\.)googleusercontent\.com$/i.test(u.hostname)&&!u.username&&!u.password&&!u.hash&&!u.search)pic=u.href;}catch{}}
  return {name:p.name.trim(),email:p.email.trim(),photo:pic};
}
function safeDir(){const d=fs.lstatSync(dir);return d.isDirectory()&&d.uid===process.getuid()&&(d.mode&0o077)===0;}
try{const st=fs.lstatSync(file);if(safeDir()&&st.isFile()&&st.uid===process.getuid()&&!(st.mode&0o077)&&st.size<50000)cached=valid(JSON.parse(fs.readFileSync(file,'utf8')));}catch{}
function context(){
  if(Date.now()-checked>5000){
    checked=Date.now();let addr=hint;
    try{
      const st=fs.lstatSync(native);const stamp=[st.ino,st.size,st.mtimeMs].join('/');
      if(stamp!==nativeStamp) {
        nativeStamp=stamp;addr='';
        if(st.isFile()&&st.size<=4*1024*1024) {
          const raw=fs.readFileSync(native,'utf8');
          const match=raw.match(/"agy\.onboarding\.lastLoginUsername"\s*:\s*("(?:\\.|[^"\\])*")/);
          const value=match ? JSON.parse(match[1]) : '';
          if(typeof value==='string'&&email.test(value))addr=value.trim().toLowerCase();
        }
      }
    }catch{addr='';nativeStamp='';}
    if(hint!==addr)disabled=false;
    hint=addr;
  }
  return {hint:disabled?'':hint,profile:!disabled && hint&&cached?.email.toLowerCase()===hint?cached:null};
}
function record(evidence) {
  if(!evidence)return;
  if(evidence.clear){disabled=true;cached=null;}
  const p=evidence.clear?null:valid(evidence.profile);
  if(!evidence.clear && (!p||p.email.toLowerCase()!==context().hint && !(disabled && p.email.toLowerCase()===hint)))return;
  if(p){cached=p;disabled=false;}
  try{
    fs.mkdirSync(dir,{recursive:true,mode:0o700});if(!safeDir())return;
    const tmp=path.join(dir,'.profile-'+randomUUID());fs.writeFileSync(tmp,JSON.stringify(p),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);
  }catch{}
}
module.exports={context,record};
