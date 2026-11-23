(({choose,getMode,getLang,getSettings,names,namesEn,initialAccount})=>{
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const box=node('div');box.id='ag-local-theme-sidebar';box.dataset.awOwned='';
  const open=node('button');open.id='aw-account-control';open.type='button';open.setAttribute('aria-label','打开账号设置');
  const avatar=node('span','aw-avatar'), labels=node('span','aw-account-lines'), name=node('span','aw-account-name'), email=node('span','aw-account-email');
  avatar.setAttribute('aria-hidden','true'); labels.append(name,email);open.append(avatar,labels);
  // 三个识别标志来自 LobeHub Icons；授权随 BRAND-ICONS-LICENSE 一同分发。
  const marks={"google":[["M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z","#4285F4"],["M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z","#34A853"],["M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z","#FBBC05"],["M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z","#EB4335"]],"claude":[["M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z","currentColor"]],"codex":[["M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z","currentColor"]]};
  const vendors={google:'Google',claude:'Anthropic',codex:'OpenAI'};
  const ns='http://www.w3.org/2000/svg';
  function shape(tag,attrs) {
    const n=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attrs))n.setAttribute(key,value);
    return n;
  }
  function paletteButton(label) {
    const b=node('button','aw-palette-button');b.type='button';b.setAttribute('aria-label',label);
    b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls','aw-account-menu');
    const svg=shape('svg',{viewBox:'0 0 24 24','aria-hidden':'true',fill:'none'});
    svg.append(shape('path',{d:'M13 3a9 9 0 1 0 0 18h1.1a2.2 2.2 0 0 0 1.35-3.95 1.6 1.6 0 0 1 .97-2.85h1.8A3.8 3.8 0 0 0 22 10.4C22 6.4 17.6 3 13 3Z',
      stroke:'currentColor','stroke-width':'1.65','stroke-linejoin':'round'}));
    for(const [cx,cy,fill] of [[6.8,12.3,'#34A853'],[8.8,8.1,'#4285F4'],[13.3,6.9,'#EA4335'],[17.4,9,'#FBBC04']])
      svg.append(shape('circle',{cx,cy,r:'1.45',fill}));
    b.append(svg); b.addEventListener('click',()=>showFor(b));return b;
  }
  const toggle=paletteButton('选择外观主题');
  const cardToggle=paletteButton('统计卡中的工作台外观主题');
  box.append(open,toggle);
  const menu=node('div');menu.id='aw-account-menu';menu.dataset.awOwned='';menu.hidden=true;
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','工作台外观');document.body.append(menu);
  let anchor=toggle;
  const options=new Map();
  const mail=/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;
  const clean=s=>(s||'').trim().replace(/\s+/g,' ');
  const visible=e=>!!e?.isConnected&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
  const deny='[data-aw-owned],[data-markdown-root],.markdown,.prose,#ag-local-context-card,[contenteditable="true"]';
  let profile=null,hint='',seenNative=false,greeting='',source='',avatarKey='',nativeImage=null,nativeImageSrc='',dirty=false,forget=false;
  function safePic(raw) {
    if(typeof raw!=='string')return '';
    if(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(raw)&&raw.length<=45000)return raw;
    try{const u=new URL(raw);return u.protocol==='https:' && /(^|\.)googleusercontent\.com$/i.test(u.hostname) &&
      !u.username&&!u.password&&!u.search&&!u.hash && u.href.length<=1600?u.href:'';}catch{return '';}
  }
  function cache(ctx) {
    const next=typeof ctx?.hint==='string'&&mail.test(ctx.hint)?ctx.hint.trim().toLowerCase():'';
    if(hint && next!==hint){profile=null;greeting='';seenNative=false;dirty=false;source='';}
    hint=next;
    const p=ctx?.profile;
    if(!seenNative && !profile && p && next && p.email?.toLowerCase()===next && typeof p.name==='string'){
      profile={name:p.name,email:p.email,photo:safePic(p.photo)};source='verified-cache';
    }
  }
  cache(initialAccount);
  function photo(img){
    if(!img||!img.complete||img.naturalWidth<=0)return '';
    if(img===nativeImage && nativeImageSrc===img.currentSrc && profile?.photo)return profile.photo;
    nativeImage=img;nativeImageSrc=img.currentSrc;
    try{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(img,0,0,64,64);return safePic(c.toDataURL('image/png'));}
    catch{return safePic(img.currentSrc||img.src);}
  }
  function scanNative(){
    // 只检查 Google 自己的设置容器中已呈现的资料行。不会把对话里出现的邮箱当成账号。
    const scopes=[...document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"],[data-testid*="settings"]')].filter(n=>
      visible(n)&&!n.closest(deny)&&n.querySelector('button,[role="button"]') &&
      (n.matches('dialog,[role="dialog"],[aria-modal="true"]')||n.querySelector('[class~="group/nav-item"]')));
    const nav=document.querySelector('[class~="group/nav-item"]');
    if(nav && !nav.closest(deny)){
      let n=nav;
      for(let i=0;i<6 && n && n!==document.body;i++,n=n.parentElement){
        if(n.querySelectorAll('[class~="group/nav-item"]').length>1 && visible(n))scopes.push(n);
      }
    }
    for(const scope of new Set(scopes)){
      if(![...scope.querySelectorAll('button,[role="button"],h1,h2')].some(n=>/^(General|Models|Settings|系统设置|模型配置|常规设置)$/i.test(clean(n.textContent))))continue;
      for(const leaf of scope.querySelectorAll('span,small,p,div')){
        if(leaf.childElementCount||!visible(leaf)||leaf.closest(deny))continue;
        const address=clean(leaf.textContent);if(address.length>254||!mail.test(address))continue;
        for(let row=leaf.parentElement;row&&scope.contains(row);row=row.parentElement){
          const br=row.getBoundingClientRect();if(br.height>100 || br.width>500)break;
          const texts=[...row.querySelectorAll('span,strong,b,p,div')].filter(n=>!n.childElementCount&&visible(n)).map(n=>clean(n.textContent));
          const nick=texts.find(t=>t && t!==address && t.length<=72 && !t.includes('@') && !/[<>]/.test(t) && !/^(account|email|账户|账号|邮箱)$/i.test(t));
          if(!nick)continue;
          const accountRow=row.closest('button,[role="button"]');
          const container=accountRow && scope.contains(accountRow)&&accountRow.getBoundingClientRect().height<=100?accountRow:row;
          let img=container.querySelector('img');
          // 有些版本的头像与两行文字互为兄弟节点。
          if(!img && container.parentElement && scope.contains(container.parentElement) && container.parentElement.getBoundingClientRect().height<=92)img=container.parentElement.querySelector('img');
          if(hint && hint!==address.toLowerCase() && profile?.email!==address)profile=null;
          const pic=photo(img) || (profile?.email===address?profile.photo:'');
          if(profile?.name!==nick || profile?.email!==address || profile?.photo!==pic){
            profile={name:nick,email:address,photo:pic};dirty=true;
          }
          seenNative=true;source='settings-profile';return;
        }
      }
    }
  }
  function scanGreeting(){
    const container=document.querySelector('[data-testid="home-greeting"]')||document.querySelector('[data-testid="home-splash-content"]');
    if(!container||container.closest(deny))return;
    const candidates=[container,...container.querySelectorAll('h1,h2,p,span,div')];
    for(const item of candidates){
      const t=clean(item.textContent);if(t.length>350)continue;
      const m=t.match(/^(?:Welcome back|Welcome|Good to see you|Nice to see you|Good morning|Good afternoon|Good evening|Hey there|Hey|Hello|Hi)[,，]\s*([^.!?。！？,，]{1,72})(?:[.!?。！]|$)/i)
        ||t.match(/^(?:欢迎回来|早上好|下午好|晚上好|你好)[，,、]\s*([^，。！？！]{1,72})(?:[，。！？！]|$)/);
      if(m){greeting=clean(m[1]);if(!profile)source='greeting';return;}
    }
  }
  function render(){
    const isEn = typeof getLang==='function' && getLang()==='en';
    const labelMap = isEn && namesEn ? namesEn : names;
    const shownName=profile?.name||greeting||(isEn?'Account Settings':'账号设置'),shownEmail=profile?.email||(greeting?hint:'');
    if(name.textContent!==shownName)name.textContent=shownName;
    if(email.textContent!==shownEmail)email.textContent=shownEmail;email.hidden=!shownEmail;
    const pic=profile?.photo||'';
    const key=pic||'initial:'+shownName;
    if(key!==avatarKey){
      avatarKey=key;avatar.replaceChildren();
      if(pic){const im=node('img');im.alt='';im.referrerPolicy='no-referrer';im.src=pic;
        im.onerror=()=>{if(im.parentElement===avatar)avatar.textContent=Array.from(shownName)[0]||'◉';};avatar.append(im);}
      else avatar.textContent=(profile||greeting)?Array.from(shownName)[0].toLocaleUpperCase():'◉';
    }
    open.title=shownName+(isEn?' · Open Settings':' · 打开系统设置');
    toggle.title=cardToggle.title=(isEn?'Switch Theme · ':'切换主题 · ')+labelMap[getMode()];
    for(const [key,b] of options){
      b.setAttribute('aria-checked',String(key===getMode()));
      b.title=vendors[key]+' · '+labelMap[key];
      b.setAttribute('aria-label',labelMap[key]);
    }
    if(!menu.hidden)position();
  }
  function update(){scanNative();if(!profile)scanGreeting();render();}
  function position(){
    if(!visible(anchor)){hide();return;}
    const rect=anchor.getBoundingClientRect();
    const group=menu.getBoundingClientRect();
    const left=Math.max(8,Math.min(innerWidth-group.width-8,rect.right-group.width));
    const y=rect.top>=group.height+12 ? rect.top-group.height-6 : Math.min(innerHeight-8-group.height,rect.bottom+6);
    menu.style.left=Math.round(left)+'px';menu.style.top=Math.round(Math.max(8,y))+'px';
  }
  function hide(focus=false){
    menu.hidden=true;
    for(const b of [toggle,cardToggle])b.setAttribute('aria-expanded','false');
    if(focus&&visible(anchor))anchor.focus({preventScroll:true});
  }
  function showFor(button) {
    if(!menu.hidden && button===anchor){hide(true);return;}
    hide(); anchor=button;render();menu.hidden=false;position();
    button.setAttribute('aria-expanded','true');options.get(getMode())?.focus({preventScroll:true});
  }
  for(const [key,title] of Object.entries(names)) {
    const b=node('button','aw-brand-choice');b.type='button';b.dataset.awMode=key;b.setAttribute('role','menuitemradio');
    b.setAttribute('aria-label',title);b.title=vendors[key]+' · '+title;
    const svg=shape('svg',{viewBox:'0 0 24 24','aria-hidden':'true','data-aw-brand':vendors[key],'fill-rule':'evenodd'});
    for(const [d,fill] of marks[key])svg.append(shape('path',{d,fill}));
    const check=shape('svg',{viewBox:'0 0 12 12','class':'aw-choice-check','aria-hidden':'true'});
    check.append(shape('path',{d:'m2.5 6.1 2.3 2.2 4.7-4.8',fill:'none',stroke:'#fff','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round'}));
    b.append(svg,check);b.addEventListener('click',()=>{hide();choose(key);if(visible(anchor))anchor.focus({preventScroll:true});});
    options.set(key,b);menu.append(b);
  }
  open.addEventListener('click',()=>{hide();getSettings()?.click();});
  document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!toggle.contains(e.target)&&!cardToggle.contains(e.target))hide();},true);
  document.addEventListener('click',e=>{
    const n=e.target.closest?.('button,[role="menuitem"],a');if(n&&!n.closest(deny)&&/^(Sign out|Switch account|退出登录|切换账号)$/i.test(clean(n.textContent))){
      profile=null;greeting=hint=source='';dirty=false;forget=true;seenNative=false;nativeImage=null;render();
    }
  },true);
  menu.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide(true);return;}
    if(e.key==='Tab'){hide();return;}
    if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;
    e.preventDefault();const all=[...options.values()],i=all.indexOf(document.activeElement);
    all[e.key==='Home'?0:e.key==='End'?all.length-1:(i+(['ArrowDown','ArrowRight'].includes(e.key)?1:-1)+all.length)%all.length].focus();
  });
  window.addEventListener('resize',()=>{if(!menu.hidden)position();});
  window.addEventListener('scroll',()=>{if(!menu.hidden)position();},true);
  return {element:box,cardToggle,update,hide,cache,
    take(){if(forget){forget=false;return {clear:true};}if(!dirty||!seenNative)return null;dirty=false;return {profile};},
    info:()=>({known:!!(profile||greeting),email:!!email.textContent,source,actualImage:!!avatar.querySelector('img')?.naturalWidth,menuOpen:!menu.hidden,
      picker:!menu.hidden?(anchor===cardToggle?'card':'sidebar'):null, logos:menu.querySelectorAll('svg[data-aw-brand]').length})};
})
