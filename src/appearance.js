((css, initialCustomCss, initialMode, initialLang, initialQuota, initialFont, initialWidth, initialSend, initialNotify, initialPicker, initialAccount) => {
  'use strict';
  if (window !== window.top || !document.body || location.protocol !== 'https:' || location.hostname !== '127.0.0.1' ||
      !location.port || typeof window.electronNative?.getZoomLevel !== 'function' ||
      typeof window.electronNative?.setTitleBarOverlay !== 'function') return null;
  if (window.__agLocalAppearance) return window.__agLocalAppearance.snapshot();
  const layout=(__AG_WORKSPACE_LAYOUT__)();
  const root = document.documentElement;
  const names = {google:'Google 原生',claude:'Claude 风格',codex:'Codex 风格'};
  const namesEn = {google:'Google',claude:'Claude',codex:'Codex'};
  const valid = mode => Object.hasOwn(names,mode);
  const validLang = lang => lang==='zh' || lang==='en';
  const validQuota = v => v==='on' || v==='off';
  const validFont = v => ['default','sans','serif','mono'].includes(v);
  const validWidth = v => ['default','focus','wide','full'].includes(v);
  const validSend = v => v==='enter' || v==='cmd-enter';
  const validNotify = v => v==='on' || v==='off';
  const validPicker = v => v==='codex' || v==='native';
  const style = document.createElement('style');
  style.id = 'ag-local-appearance-style';
  style.textContent = css;
  document.head.append(style);
  const customStyle = document.createElement('style');
  customStyle.id = 'ag-local-custom-style';
  customStyle.textContent = typeof initialCustomCss === 'string' ? initialCustomCss : '';
  document.head.append(customStyle);
  let current = valid(initialMode) ? initialMode : 'google';
  let currentLang = validLang(initialLang) ? initialLang : (window.__agLocalZhControl?.getLang?.() || 'zh');
  let currentQuota = validQuota(initialQuota) ? initialQuota : 'on';
  let currentFont = validFont(initialFont) ? initialFont : 'default';
  let currentWidth = validWidth(initialWidth) ? initialWidth : 'default';
  let currentSend = validSend(initialSend) ? initialSend : 'enter';
  let currentNotify = validNotify(initialNotify) ? initialNotify : 'on';
  let currentPicker = validPicker(initialPicker) ? initialPicker : 'codex';
  let pending = null, saveError = false, pendingLang = null, langSaveError = false, pendingQuota = null, quotaSaveError = false, pendingFont = null, fontSaveError = false, pendingWidth = null, widthSaveError = false, pendingSend = null, sendSaveError = false, pendingNotify = null, notifySaveError = false, pendingPicker = null, pickerSaveError = false, settingAnchor = null;
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  const shown = el => el?.isConnected && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';

  function tone() {
    const b=document.body;
    const explicit=[...b.classList, ...root.classList, b.dataset.theme, root.dataset.theme].filter(Boolean);
    if (explicit.some(s=>/^(dark|theme-dark|dark-theme)$/i.test(s))) return 'dark';
    if (explicit.some(s=>/^(light|theme-light|light-theme)$/i.test(s))) return 'light';
    const declared=b.style.colorScheme || root.style.colorScheme;
    if (declared==='dark' || declared==='light') return declared;
    try {
      const chosen=localStorage.getItem('theme-mode');
      if (chosen==='dark'||chosen==='light') return chosen;
    } catch {}
    return scheme.matches ? 'dark' : 'light';
  }

  function paint() {
    if (current==='google') {
      root.removeAttribute('data-ag-appearance'); root.removeAttribute('data-ag-tone');
    } else {
      if (root.dataset.agAppearance!==current) root.dataset.agAppearance=current;
      const actualTone=tone();
      if (root.dataset.agTone!==actualTone) root.dataset.agTone=actualTone;
    }
    if (currentFont==='default') {
      root.removeAttribute('data-ag-font');
    } else if (root.dataset.agFont!==currentFont) {
      root.dataset.agFont=currentFont;
    }
    if (currentWidth==='default') {
      root.removeAttribute('data-ag-width');
    } else if (root.dataset.agWidth!==currentWidth) {
      root.dataset.agWidth=currentWidth;
    }
    if(saveError) account.cardToggle.title='外观偏好尚未保存';
  }
  function choose(mode) {
    if(!valid(mode) || mode===current && !saveError) return;
    current=mode;
    pending={id:crypto.randomUUID(),mode};
    saveError=false; paint(); mount();
    try { window.__agLocalAppearanceChanged?.('selection'); } catch {}
  }
  function chooseLang(lang) {
    if(!validLang(lang) || lang===currentLang && !langSaveError) return;
    currentLang=lang;
    pendingLang={id:crypto.randomUUID(),lang};
    langSaveError=false;
    try { window.__agLocalZhControl?.setLang(lang); } catch {}
    mount();
    try { window.__agLocalAppearanceChanged?.('language'); } catch {}
  }
  function chooseQuota(next) {
    if(!validQuota(next) || next===currentQuota && !quotaSaveError) return;
    currentQuota=next;
    pendingQuota={id:crypto.randomUUID(),quota:next};
    quotaSaveError=false;
    if(next==='off') {
      try { window.__agQuotaSummary?.apply({status:'disabled',items:[],seenAt:0,expiresAt:0,stale:false,source:'cli'}); } catch {}
    }
    renderSettingsRows();
    try { window.__agLocalAppearanceChanged?.('quota'); } catch {}
  }
  function chooseFont(next) {
    if(!validFont(next) || next===currentFont && !fontSaveError) return;
    currentFont=next;
    pendingFont={id:crypto.randomUUID(),font:next};
    fontSaveError=false;
    paint();
    renderSettingsRows();
    try { window.__agLocalAppearanceChanged?.('font'); } catch {}
  }
  function chooseWidth(next) {
    if(!validWidth(next) || next===currentWidth && !widthSaveError) return;
    currentWidth=next;
    pendingWidth={id:crypto.randomUUID(),width:next};
    widthSaveError=false;
    paint();
    renderSettingsRows();
    try { window.__agLocalAppearanceChanged?.('width'); } catch {}
  }
  function chooseSend(next) {
    if(!validSend(next) || next===currentSend && !sendSaveError) return;
    currentSend=next;
    pendingSend={id:crypto.randomUUID(),send:next};
    sendSaveError=false;
    try { window.__agWorkbenchExtras?.setSendShortcut?.(next); } catch {}
    renderSettingsRows();
    try { window.__agLocalAppearanceChanged?.('send'); } catch {}
  }
  function chooseNotify(next) {
    if(!validNotify(next) || next===currentNotify && !notifySaveError) return;
    currentNotify=next;
    pendingNotify={id:crypto.randomUUID(),notify:next};
    notifySaveError=false;
    renderSettingsRows();
    try { window.__agLocalAppearanceChanged?.('notify'); } catch {}
  }
  function choosePicker(next) {
    if(!validPicker(next) || next===currentPicker && !pickerSaveError) return;
    currentPicker=next;
    pendingPicker={id:crypto.randomUUID(),picker:next};
    pickerSaveError=false;
    try { window.__agModelPicker?.setEnabled?.(next === 'codex'); } catch {}
    renderSettingsRows();
    try { window.__agLocalAppearanceChanged?.('picker'); } catch {}
  }
  const account=(__AG_ACCOUNT_FOOTER__)({choose,getMode:()=>current,getLang:()=>currentLang,getSettings:()=>layout.settingsTarget(settingAnchor),names,namesEn,initialAccount});
  const side=account.element,cardSlot=document.createElement('span');
  cardSlot.id='ag-local-theme-card-slot';cardSlot.append(account.cardToggle);

  // 设置页「外观界面」卡片内的主题与语言切换行。
  const brandMarks={
    google:[['M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z','#4285F4'],['M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z','#34A853'],['M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z','#FBBC05'],['M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z','#EB4335']],
    claude:[['M13.827 3.52h3.603L24 20h-3.603l-6.57-16.48zm-7.258 0h3.767L16.906 20h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm4.132 9.959L8.453 7.687 6.205 13.48H10.7z','currentColor']],
    codex:[['M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z','currentColor']]
  };
  const svgNs='http://www.w3.org/2000/svg';
  const themeRow=document.createElement('div');
  themeRow.id='aw-settings-theme-row';themeRow.className='aw-settings-row';themeRow.dataset.awOwned='';
  const themeLabel=document.createElement('span');themeLabel.className='aw-settings-label';
  const themeGroup=document.createElement('div');themeGroup.className='aw-settings-pill';themeGroup.setAttribute('role','radiogroup');
  const themeButtons=new Map();
  for(const mode of ['google','claude','codex']) {
    const btn=document.createElement('button');btn.type='button';btn.className='aw-settings-pill-btn aw-settings-theme-btn';
    btn.dataset.awMode=mode;btn.setAttribute('role','radio');
    const svg=document.createElementNS(svgNs,'svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('fill-rule','evenodd');
    for(const [d,fill] of brandMarks[mode]) {
      const p=document.createElementNS(svgNs,'path');p.setAttribute('d',d);p.setAttribute('fill',fill);svg.append(p);
    }
    const txt=document.createElement('span');txt.className='aw-settings-theme-name';
    btn.append(svg,txt);
    btn.addEventListener('click',()=>choose(mode));
    themeButtons.set(mode,{btn,txt});themeGroup.append(btn);
  }
  themeRow.append(themeLabel,themeGroup);

  const langRow=document.createElement('div');
  langRow.id='aw-settings-lang-row';langRow.className='aw-settings-row';langRow.dataset.awOwned='';
  const langLabel=document.createElement('span');langLabel.className='aw-settings-label';
  const langGroup=document.createElement('div');langGroup.className='aw-settings-pill';langGroup.setAttribute('role','radiogroup');
  const langButtons=new Map();
  for(const [code,caption] of [['en','EN'],['zh','中文']]) {
    const btn=document.createElement('button');btn.type='button';btn.className='aw-settings-pill-btn';
    btn.dataset.awLang=code;btn.setAttribute('role','radio');btn.textContent=caption;
    btn.addEventListener('click',()=>chooseLang(code));
    langButtons.set(code,btn);langGroup.append(btn);
  }
  langRow.append(langLabel,langGroup);

  const quotaRow=document.createElement('div');
  quotaRow.id='aw-settings-quota-row';quotaRow.className='aw-settings-row';quotaRow.dataset.awOwned='';
  const quotaLabel=document.createElement('span');quotaLabel.className='aw-settings-label';
  const quotaGroup=document.createElement('div');quotaGroup.className='aw-settings-pill';quotaGroup.setAttribute('role','radiogroup');
  const quotaButtons=new Map();
  for(const code of ['on','off']) {
    const btn=document.createElement('button');btn.type='button';btn.className='aw-settings-pill-btn';
    btn.dataset.awQuota=code;btn.setAttribute('role','radio');
    btn.addEventListener('click',()=>chooseQuota(code));
    quotaButtons.set(code,btn);quotaGroup.append(btn);
  }
  quotaRow.append(quotaLabel,quotaGroup);

  const fontRow=document.createElement('div');
  fontRow.id='aw-settings-font-row';fontRow.className='aw-settings-row';fontRow.dataset.awOwned='';
  const fontLabel=document.createElement('span');fontLabel.className='aw-settings-label';
  const fontGroup=document.createElement('div');fontGroup.className='aw-settings-pill';fontGroup.setAttribute('role','radiogroup');
  const fontButtons=new Map();
  for(const code of ['default','sans','serif','mono']) {
    const btn=document.createElement('button');btn.type='button';btn.className='aw-settings-pill-btn';
    btn.dataset.awFont=code;btn.setAttribute('role','radio');
    btn.addEventListener('click',()=>chooseFont(code));
    fontButtons.set(code,btn);fontGroup.append(btn);
  }
  fontRow.append(fontLabel,fontGroup);

  function makePillRow(id, codes, onChoose) {
    const row=document.createElement('div');row.id=id;row.className='aw-settings-row';row.dataset.awOwned='';
    const label=document.createElement('span');label.className='aw-settings-label';
    const group=document.createElement('div');group.className='aw-settings-pill';group.setAttribute('role','radiogroup');
    const map=new Map();
    for(const c of codes) {
      const btn=document.createElement('button');btn.type='button';btn.className='aw-settings-pill-btn';
      btn.setAttribute('role','radio');btn.addEventListener('click',()=>onChoose(c));
      map.set(c,btn);group.append(btn);
    }
    row.append(label,group);
    return {row,label,group,map};
  }
  const widthCtl=makePillRow('aw-settings-width-row',['default','focus','wide','full'],chooseWidth);
  const sendCtl=makePillRow('aw-settings-send-row',['enter','cmd-enter'],chooseSend);
  const notifyCtl=makePillRow('aw-settings-notify-row',['on','off'],chooseNotify);
  const pickerCtl=makePillRow('aw-settings-picker-row',['codex','native'],choosePicker);

  const setText=(el,val)=>{if(el.textContent!==val)el.textContent=val;};
  const setAttr=(el,k,val)=>{if(el.getAttribute(k)!==val)el.setAttribute(k,val);};
  const setTitle=(el,val)=>{if(el.title!==val)el.title=val;};

  function renderSettingsRows() {
    const zh=currentLang==='zh';
    const tLabel=zh?'工作台主题':'Workspace Theme';
    setText(themeLabel,tLabel);
    setAttr(themeGroup,'aria-label',tLabel);
    for(const [mode,{btn,txt}] of themeButtons) {
      setAttr(btn,'aria-checked',String(mode===current));
      setTitle(btn,zh?names[mode]:namesEn[mode]);
      setText(txt,mode==='google'?(zh?'原生':'Google'):(mode==='claude'?'Claude':'Codex'));
    }
    const lLabel=zh?'界面语言':'Interface Language';
    setText(langLabel,lLabel);
    setAttr(langGroup,'aria-label',lLabel);
    for(const [code,btn] of langButtons) {
      setAttr(btn,'aria-checked',String(code===currentLang));
      setTitle(btn,code==='zh'?(zh?'切换为简体中文':'Switch to Simplified Chinese'):(zh?'切换为英文原版':'Switch to English'));
    }
    const qLabel=zh?'CLI 额度查询':'CLI Quota Polling';
    setText(quotaLabel,qLabel);
    setAttr(quotaGroup,'aria-label',qLabel);
    for(const [code,btn] of quotaButtons) {
      setAttr(btn,'aria-checked',String(code===currentQuota));
      setText(btn,code==='on'?(zh?'开启':'On'):(zh?'关闭':'Off'));
      setTitle(btn,code==='on'?(zh?'通过本机 agy /usage 同步 CLI 账号额度':'Sync CLI account quota via agy /usage'):(zh?'关闭后台 CLI 额度查询':'Disable background CLI quota polling'));
    }
    const fLabel=zh?'阅读字体':'Reading Font';
    setText(fontLabel,fLabel);
    setAttr(fontGroup,'aria-label',fLabel);
    const fNamesZh={default:'默认',sans:'无衬线',serif:'衬线',mono:'等宽'};
    const fNamesEn={default:'Default',sans:'Sans',serif:'Serif',mono:'Mono'};
    for(const [code,btn] of fontButtons) {
      setAttr(btn,'aria-checked',String(code===currentFont));
      setText(btn,zh?fNamesZh[code]:fNamesEn[code]);
      setTitle(btn,zh?('界面与对话字体：'+fNamesZh[code]):('Interface & prose font: '+fNamesEn[code]));
    }
    const wLabel=zh?'阅读宽度':'Reading Width';
    setText(widthCtl.label,wLabel);setAttr(widthCtl.group,'aria-label',wLabel);
    const wZh={default:'默认',focus:'专注',wide:'宽屏',full:'铺满'}, wEn={default:'Default',focus:'Focus',wide:'Wide',full:'Full'};
    for(const [c,btn] of widthCtl.map){setAttr(btn,'aria-checked',String(c===currentWidth));setText(btn,zh?wZh[c]:wEn[c]);}
    const sLabel=zh?'发送快捷键':'Send Shortcut';
    setText(sendCtl.label,sLabel);setAttr(sendCtl.group,'aria-label',sLabel);
    const sZh={enter:'Enter','cmd-enter':'⌘+Enter'}, sEn={enter:'Enter','cmd-enter':'⌘+Enter'};
    for(const [c,btn] of sendCtl.map){setAttr(btn,'aria-checked',String(c===currentSend));setText(btn,zh?sZh[c]:sEn[c]);setTitle(btn,c==='cmd-enter'?(zh?'Enter 换行，Cmd+Enter 发送（防误发）':'Enter for newline, Cmd+Enter to send'):(zh?'默认 Enter 发送':'Default Enter to send'));}
    const nLabel=zh?'任务完成通知':'Task Notifications';
    setText(notifyCtl.label,nLabel);setAttr(notifyCtl.group,'aria-label',nLabel);
    for(const [c,btn] of notifyCtl.map){setAttr(btn,'aria-checked',String(c===currentNotify));setText(btn,c==='on'?(zh?'开启':'On'):(zh?'关闭':'Off'));}
    const pLabel=zh?'模型选择器':'Model Picker';
    setText(pickerCtl.label,pLabel);setAttr(pickerCtl.group,'aria-label',pLabel);
    for(const [c,btn] of pickerCtl.map){setAttr(btn,'aria-checked',String(c===currentPicker));setText(btn,c==='codex'?(zh?'Codex 炫酷':'Codex'):(zh?'原版':'Native'));}
  }

  function findAppearanceCard() {
    const deny='[data-aw-owned],[data-markdown-root],.markdown,.prose,#ag-local-context-card,[contenteditable="true"]';
    const leaves=[...document.querySelectorAll('span,div,p,label,h3,h4')].filter(el=>
      !el.childElementCount && !el.closest(deny) && shown(el));
    const themeLeaves=leaves.filter(el=>/^(Theme|Theme Mode|主题模式)$/i.test((el.textContent||'').trim()));
    const bottomLeaves=leaves.filter(el=>/^(Font Size|字号|Contrast|对比度)$/i.test((el.textContent||'').trim()));
    if(!themeLeaves.length || !bottomLeaves.length) return null;
    for(const tLeaf of themeLeaves) {
      for(const bLeaf of bottomLeaves) {
        let p=tLeaf.parentElement;
        for(let d=0;p && d<8 && p!==document.body;d++,p=p.parentElement) {
          if(!p.contains(bLeaf)) continue;
          const direct=el=>{let c=el;while(c&&c.parentElement!==p)c=c.parentElement;return c;};
          const tRow=direct(tLeaf), bRow=direct(bLeaf);
          if(tRow && bRow && tRow!==bRow && p.children.length>=2 && p.children.length<=12) {
            const rect=p.getBoundingClientRect();
            if(rect.width>=260 && rect.height>=80) {
              const rows=[...p.children].filter(c=>!c.hasAttribute('data-aw-owned'));
              return {card:p,themeRow:tRow,lastRow:rows[rows.length-1]||bRow};
            }
          }
          break;
        }
      }
    }
    return null;
  }

  function mountSettingsRows() {
    renderSettingsRows();
    if(themeRow.isConnected && langRow.isConnected && quotaRow.isConnected && fontRow.isConnected && widthCtl.row.isConnected && sendCtl.row.isConnected && notifyCtl.row.isConnected && pickerCtl.row.isConnected) return;
    if(!/settings/i.test(location.pathname+location.hash) &&
       !document.querySelector('dialog[open],[role="dialog"],[aria-modal="true"],[data-testid*="settings"],[class~="group/nav-item"]')) return;
    const target=findAppearanceCard();
    if(!target) return;
    const {card,themeRow:nativeThemeRow,lastRow}=target;
    const cs=getComputedStyle(nativeThemeRow);
    const padL=cs.paddingLeft, padR=cs.paddingRight;
    if(padL && padL!=='0px') {
      for(const r of [themeRow,langRow,quotaRow,fontRow,widthCtl.row,sendCtl.row,notifyCtl.row,pickerCtl.row]) {
        r.style.paddingLeft=padL; r.style.paddingRight=padR||padL;
      }
    }
    if(themeRow.parentElement!==card || themeRow.previousElementSibling!==nativeThemeRow) {
      nativeThemeRow.insertAdjacentElement('afterend',themeRow);
    }
    const chain=[lastRow,langRow,quotaRow,fontRow,widthCtl.row,sendCtl.row,notifyCtl.row,pickerCtl.row];
    for(let i=1;i<chain.length;i++) {
      if(chain[i].parentElement!==card || chain[i].previousElementSibling!==chain[i-1]) {
        chain[i-1].insertAdjacentElement('afterend',chain[i]);
      }
    }
  }

  function sidebarSettings() {
    if(shown(settingAnchor) || (settingAnchor?.isConnected && settingAnchor.matches('[data-aw-command="settings"],[data-aw-account-settings]'))) return settingAnchor;
    for(const el of document.querySelectorAll('button,[role="button"],a[href*="settings"]')) {
      if(el.closest('[data-aw-owned]')) continue;
      if (!['Settings','Global Settings','系统设置','设置','全局设置'].includes((el.getAttribute('aria-label')||'').trim()) &&
          !['Settings','Global Settings','系统设置','设置','全局设置'].includes((el.textContent||'').trim())) continue;
      const r=el.getBoundingClientRect();
      if((shown(el) || current==='codex' && el.closest('aside,[data-aw-sidebar],[class*="sidebar" i]')) && r.left<Math.min(300,innerWidth*.3) && r.top>innerHeight*.55 && r.width>65 && r.height<68 && !el.closest('[role="dialog"]')) return settingAnchor=el;
    }
    return null;
  }
  let replacement=null;
  function restoreSettings() {
    replacement?.anchor.removeAttribute('data-aw-account-settings');
    replacement=null;
  }
  function mount() {
    if(replacement && (current!=='google'||!replacement.anchor.isConnected))restoreSettings();
    const header=document.querySelector('#ag-local-context-card header');
    if(header && cardSlot.parentElement!==header) header.insertBefore(cardSlot,header.querySelector('.ag-close'));
    const anchor=sidebarSettings();
    layout.sync(current,anchor);
    account.update();
    const area=layout.container();
    if(area) {
      if(side.parentElement!==area)area.append(side);
      mountSettingsRows();
      if(!style.isConnected) document.head.append(style);
      return;
    }
    // 保留原生按钮来响应账号行的设置操作，仅在替代入口已挂载时隐藏这一行。
    if(current==='google' && replacement?.anchor===anchor && replacement?.host?.isConnected &&
       replacement.group.parentElement===replacement.host && side.parentElement===replacement.host) {
      mountSettingsRows();
      return;
    }
    if(replacement)restoreSettings();
    let group=anchor, host=null;
    for(let n=0;group?.parentElement && n<5;n++,group=group.parentElement) {
      const parent=group.parentElement, geom=group.getBoundingClientRect(), rect=parent.getBoundingClientRect();
      if(geom.height>94 || rect.width>Math.min(innerWidth*(innerWidth<620?.85:.55),490) || rect.width<125) break;
      const st=getComputedStyle(parent);
      if(st.display.includes('flex') && st.flexDirection==='column' || st.display==='block' && geom.width>=rect.width*.65) {
        host=parent;break;
      }
    }
    if(host) {
      if(side.parentElement!==host || side.nextElementSibling!==group) host.insertBefore(side,group);
      if(current==='google' && anchor && side.isConnected){
        replacement={anchor,group,host};anchor.setAttribute('data-aw-account-settings','');
      }
    } else if(side.isConnected) side.remove();
    mountSettingsRows();
    if(!style.isConnected) document.head.append(style);
  }
  layout.setRefresh(mount);
  function reconcile(mode,ack=null,failed=false,lang=null,langAck=null,langFailed=false,quota=null,quotaAck=null,quotaFailed=false,font=null,fontAck=null,fontFailed=false,width=null,widthAck=null,widthFailed=false,send=null,sendAck=null,sendFailed=false,notify=null,notifyAck=null,notifyFailed=false,picker=null,pickerAck=null,pickerFailed=false) {
    if(ack && pending?.id===ack) { if(failed) saveError=true; else {pending=null;saveError=false;} }
    if(!pending && valid(mode)) current=mode;
    if(langAck && pendingLang?.id===langAck) { if(langFailed) langSaveError=true; else {pendingLang=null;langSaveError=false;} }
    if(!pendingLang && validLang(lang) && lang!==currentLang) { currentLang=lang; try { window.__agLocalZhControl?.setLang(lang); } catch {} }
    if(quotaAck && pendingQuota?.id===quotaAck) { if(quotaFailed) quotaSaveError=true; else {pendingQuota=null;quotaSaveError=false;} }
    if(!pendingQuota && validQuota(quota) && quota!==currentQuota) currentQuota=quota;
    if(fontAck && pendingFont?.id===fontAck) { if(fontFailed) fontSaveError=true; else {pendingFont=null;fontSaveError=false;} }
    if(!pendingFont && validFont(font) && font!==currentFont) currentFont=font;
    if(widthAck && pendingWidth?.id===widthAck) { if(widthFailed) widthSaveError=true; else {pendingWidth=null;widthSaveError=false;} }
    if(!pendingWidth && validWidth(width) && width!==currentWidth) currentWidth=width;
    if(sendAck && pendingSend?.id===sendAck) { if(sendFailed) sendSaveError=true; else {pendingSend=null;sendSaveError=false;} }
    if(!pendingSend && validSend(send) && send!==currentSend) { currentSend=send; try { window.__agWorkbenchExtras?.setSendShortcut?.(send); } catch {} }
    if(notifyAck && pendingNotify?.id===notifyAck) { if(notifyFailed) notifySaveError=true; else {pendingNotify=null;notifySaveError=false;} }
    if(!pendingNotify && validNotify(notify) && notify!==currentNotify) currentNotify=notify;
    if(pickerAck && pendingPicker?.id===pickerAck) { if(pickerFailed) pickerSaveError=true; else {pendingPicker=null;pickerSaveError=false;} }
    if(!pendingPicker && validPicker(picker) && picker!==currentPicker) { currentPicker=picker; try { window.__agModelPicker?.setEnabled?.(picker === 'codex'); } catch {} }
    paint(); mount();
  }
  function snapshot() {
    const styles=getComputedStyle(document.body);
    const card=document.getElementById('ag-local-context-card');
    const composer=document.querySelector('[id="antigravity.agentSidePanelInputBox"]');
    const selector=composer?.querySelector('[data-testid="model-selector-trigger"]');
    const paragraph=[...document.querySelectorAll('[data-markdown-root] p,.prose p,.markdown p')].find(shown);
    return {mode:current,lang:currentLang,quota:currentQuota,font:currentFont,width:currentWidth,send:currentSend,notify:currentNotify,picker:currentPicker,tone:tone(), pending, pendingLang, pendingQuota, pendingFont, pendingWidth, pendingSend, pendingNotify, pendingPicker, structure:layout.status(), settingsRowHidden:!!settingAnchor?.isConnected && !shown(settingAnchor), settingsInjected:!!(themeRow.isConnected && langRow.isConnected && quotaRow.isConnected && fontRow.isConnected && widthCtl.row.isConnected && sendCtl.row.isConnected && notifyCtl.row.isConnected && pickerCtl.row.isConnected), account:account.info(), sidebar:!!shown(side), cardEntry:!!cardSlot.isConnected,
      pageColor:styles.getPropertyValue('--background').trim().slice(0,64),
      sidebarColor:styles.getPropertyValue('--sidebar').trim().slice(0,64),
      composerColor:composer?getComputedStyle(composer).backgroundColor:null,
      composerRadius:composer?getComputedStyle(composer).borderTopLeftRadius:null,
      modelColor:selector?getComputedStyle(selector).color:null,
      readingFont:paragraph?getComputedStyle(paragraph).fontFamily.slice(0,100):null,
      cardColor:card?getComputedStyle(card).backgroundColor:null,
      accent:card?getComputedStyle(card).getPropertyValue('--ag-primary').trim().slice(0,64):null};
  }
  let settingsMountTimer=null;
  const settingsObserver=new MutationObserver(mutations=>{
    if(settingsMountTimer || (themeRow.isConnected && langRow.isConnected && quotaRow.isConnected && fontRow.isConnected && widthCtl.row.isConnected && sendCtl.row.isConnected && notifyCtl.row.isConnected && pickerCtl.row.isConnected)) return;
    const external=mutations.some(m=>!(m.target instanceof Element && m.target.closest?.('[data-aw-owned]')));
    if(!external) return;
    settingsMountTimer=setTimeout(()=>{settingsMountTimer=null;mountSettingsRows();},140);
  });
  settingsObserver.observe(document.body,{childList:true,subtree:true});
  const observer=new MutationObserver(()=>{if(current!=='google') paint();});
  for(const el of [root,document.body]) observer.observe(el,{attributes:true,attributeFilter:['class','style','data-theme','data-agy-theme']});
  scheme.addEventListener('change',paint);
  function setCustomCss(nextCss) {
    const val = typeof nextCss === 'string' ? nextCss : '';
    if (customStyle.textContent !== val) customStyle.textContent = val;
    if (!customStyle.isConnected) document.head.append(customStyle);
    return true;
  }
  window.__agLocalAppearance=Object.freeze({reconcile,snapshot,takeProfile:account.take,acceptProfile:account.cache,setCustomCss});
  paint(); mount(); return snapshot();
})(__AG_APPEARANCE_CSS__,__AG_CUSTOM_CSS__,__AG_INITIAL_APPEARANCE__,__AG_INITIAL_LANG__,__AG_INITIAL_QUOTA__,__AG_INITIAL_FONT__,__AG_INITIAL_WIDTH__,__AG_INITIAL_SEND__,__AG_INITIAL_NOTIFY__,__AG_INITIAL_PICKER__,__AG_ACCOUNT_CONTEXT__)
