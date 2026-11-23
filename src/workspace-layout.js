(() => {
  const own='[data-aw-owned]';
  const ctrl='button,a,[role="button"],[role="link"],[tabindex="0"],[class*="cursor-pointer"]';
  const rows='[data-testid="conversation-row-sidebar"]', projects='[data-testid="project-header"]';
  const editor='[id="antigravity.agentSidePanelInputBox"]';
  const words={new:['New Conversation','New chat','新建对话','新聊天'], automation:['Automations','自动化任务','自动化'],
    custom:['Customizations','技能与自定义','自定义'], settings:['Settings','Global Settings','系统设置','设置','全局设置']};
  const blocked='[role="dialog"],dialog,[contenteditable="true"],[data-markdown-root],.prose,.markdown';
  const txt=e=>(e?.textContent||'').trim().replace(/\s+/g,' ');
  const vis=e=>!!(e?.isConnected && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden');
  const el=(tag,cls,text)=>{let n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const paths={
    chat:'M4 4h16v12H9l-5 4z', add:'M12 5v14M5 12h14', search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    folder:'M3 7V5h6l2 2h10v12H3z', clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
    grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    use:'M19 18a9 9 0 1 1 2-6M12 12l6-4', pin:'M8 3h8l-1 6 3 4H6l3-4zM12 13v8',
    settings:'M4 7h16M4 17h16M8 4v6M16 14v6', branch:'M7 5v14M7 14c7 0 10-2 10-8',
    arrow:'M8 4l8 8-8 8'
  };
  function icon(key) {
    const ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');
    s.setAttribute('viewBox','0 0 24 24');s.setAttribute('aria-hidden','true');s.setAttribute('fill','none');
    s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.65');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');
    p.setAttribute('d',paths[key]);s.append(p);return s;
  }
  function action(key,label,onClick,compact=false) {
    const n=el('button','aw-act');n.type='button';n.title=label;n.setAttribute('aria-label',label);
    n.append(icon(key));if(!compact)n.append(el('span','aw-label',label));
    n.addEventListener('click',onClick);return n;
  }
  function findAction(base,key,allowHidden=false) {
    const saved=base.querySelector('[data-aw-command="'+key+'"]');
    if(saved?.isConnected)return saved;
    for(const n of base.querySelectorAll(ctrl)){
      if(n.closest(own+','+blocked+','+rows) || (!allowHidden && !vis(n)))continue;
      const r=n.getBoundingClientRect();if(r.left>Math.min(470,innerWidth*.52)||r.height>68||r.width>490)continue;
      if([n.getAttribute('aria-label'),n.getAttribute('title'),txt(n)].some(v=>words[key].includes(v)))return n;
    }
    return null;
  }
  function locate(settings) {
    if(!settings?.isConnected)return null;
    const start=findAction(document,'new') || document.querySelector(rows) || document.querySelector(projects);
    if(!start)return null;
    for(let n=settings.parentElement;n&&n!==document.body;n=n.parentElement){
      if(!n.contains(start))continue;
      const r=n.getBoundingClientRect();
      if(r.width>=145 && r.width<=Math.min(520,innerWidth*.8) && r.height>=220 && r.left<120)return n;
    }
    return null;
  }
  const wrapper=el('div','aw-sidebar-head'),rail=el('nav','aw-rail'),home=el('section','aw-home');
  for(const n of [wrapper,rail,home])n.setAttribute('data-aw-owned','');
  rail.setAttribute('aria-label','工作台快捷导航');home.setAttribute('aria-label','工作环境');
  const title=el('header','aw-heading');title.append(el('strong','','对话'));
  const commands=el('nav','aw-commands');commands.setAttribute('aria-label','侧栏操作');
  const filter=el('input','aw-filter');filter.type='search';filter.placeholder='筛选侧栏会话';filter.setAttribute('aria-label','筛选侧栏会话');filter.hidden=true;
  const fav=el('section','aw-pinned');fav.setAttribute('aria-label','置顶会话');
  wrapper.append(title,commands,filter,fav);
  let host=null, mode='google', topKey='', homeKey='', rawButtons={},favKey='',homeSlot=null;
  // 原生侧栏决定开合状态。折叠后，将同一组快捷按钮和账号入口移出它的隐藏容器。
  const dock=el('div','aw-folded-dock');dock.dataset.awOwned='';
  let reserved=null, rememberedHost=null, toggleHint=null, maybeToggle=null, wasWide=null, queued=false;
  let onLayoutChange=()=>{}, observedHost=null;
  const knownKeys=new Set();
  function exposed(n) {
    if(!n || !vis(n) || n.closest('[inert],[aria-hidden="true"],[hidden]'))return false;
    let {left,right}=n.getBoundingClientRect();
    left=Math.max(0,left);right=Math.min(innerWidth,right);
    for(let p=n.parentElement;p&&p!==document.body;p=p.parentElement) {
      if(/hidden|clip|auto|scroll/.test(getComputedStyle(p).overflowX)){
        const r=p.getBoundingClientRect();left=Math.max(left,r.left);right=Math.min(right,r.right);
      }
    }
    return right-left>=125;
  }
  function schedule() {
    if(queued)return;queued=true;
    requestAnimationFrame(()=>{queued=false;onLayoutChange();});
  }
  const monitor=new MutationObserver(schedule);
  const measure=new ResizeObserver(schedule);
  function observeSidebar(n){
    if(n===observedHost)return;
    monitor.disconnect();measure.disconnect();observedHost=n;
    for(let p=n;p && p!==document.body;p=p.parentElement){
      monitor.observe(p,{attributes:true,attributeFilter:['hidden','aria-hidden','style','class','data-state','inert']});
      measure.observe(p);
    }
  }
  function nativeToggle() {
    if(toggleHint?.isConnected && vis(toggleHint))return toggleHint;
    for(const n of document.querySelectorAll('button,[role="button"]')){
      if(n.closest(own+','+blocked)||!vis(n))continue;
      const r=n.getBoundingClientRect();
      if(r.left>Math.min(450,innerWidth/2)||r.top>90||r.height>58)continue;
      const labels=['aria-label','title','data-testid','data-tooltip','data-ag-orig-title','data-ag-orig-aria-label'].map(a=>n.getAttribute(a)||'');
      if(labels.some(s=>/(?:toggle|show|hide|expand|collapse)[\s_-]*(?:left[\s_-]*)?side[\s_-]*bar|side[\s_-]*bar[\s_-]*(?:toggle|trigger)|(?:切换|展开|折叠|显示|隐藏)侧边栏/i.test(s))||
        n.querySelector('svg.lucide-panel-left,svg.lucide-panel-left-close,svg.lucide-panel-left-open,[data-icon="panel-left"]'))return toggleHint=n;
    }
    return null;
  }
  document.addEventListener('click',evt=>{
    if(mode!=='codex')return;
    const n=evt.target.closest?.('button,[role="button"]');
    if(!n||n.closest(own+','+blocked))return;
    const r=n.getBoundingClientRect();
    if(r.top<70 && r.left<Math.min(400,innerWidth*.5)){maybeToggle={n,time:performance.now()};schedule();setTimeout(schedule,260);}
  },true);
  document.addEventListener('transitionend',e=>{if(mode==='codex' && host && (e.target===host||e.target.contains?.(host)))schedule();},true);

  function unreserve(){
    if(reserved){reserved.removeAttribute('data-aw-rail-room');reserved=null;}
    document.body.removeAttribute('data-aw-rail-room-fallback');dock.remove();
  }
  function makeRoom(){
    const anchor=document.querySelector(editor)||document.querySelector('[data-main-content-body],[data-testid="conversation-view"],main');
    if(reserved?.isConnected && (!anchor||reserved.contains(anchor)))return;
    if(reserved)reserved.removeAttribute('data-aw-rail-room');reserved=null;
    let candidate=null;
    for(let p=anchor;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){
      const r=p.getBoundingClientRect();
      if(r.left>=-4 && r.left<64 && r.width>=innerWidth*.78 && r.height>=innerHeight*.62 && r.top<90) {
        if(!candidate || r.top>=24)candidate=p;
      }
    }
    reserved=candidate;
    if(candidate)candidate.setAttribute('data-aw-rail-room','');
    document.body.toggleAttribute('data-aw-rail-room-fallback',!candidate);
  }
  function expandThen(run) {
    const toggle=nativeToggle();if(!toggle)return false;
    toggle.click();
    const end=performance.now()+1800;
    function attempt(){
      const actual=locate(findAction(document,'settings')||rawButtons.settings)||host;
      if(actual?.isConnected && exposed(actual)){onLayoutChange();run();return;}
      if(mode==='codex' && performance.now()<end)setTimeout(attempt,60);
    }
    setTimeout(attempt,30);return true;
  }
  function openProjects(){
    if(dock.isConnected){expandThen(()=>focusEntry(firstProject()));}
    else focusEntry(firstProject());
  }
  function direct(key) {
    const source=rawButtons[key];
    if(source?.isConnected && !source.disabled && !source.closest('[inert]')){source.click();return;}
    if(dock.isConnected)expandThen(()=>{const replacement=rawButtons[key];if(replacement?.isConnected&&!replacement.disabled)replacement.click();});
  }

  function nativeRows(){return host?[...host.querySelectorAll(rows)].filter(r=>!r.closest(own)):[];}
  function filterRows(){
    const word=filter.value.trim().toLocaleLowerCase();
    for(const r of nativeRows())r.toggleAttribute('data-aw-filtered',!!word&&!(rowTitle(r)||txt(r)).toLocaleLowerCase().includes(word));
  }
  function search(){
    filter.hidden=!filter.hidden;
    if(filter.hidden){filter.value='';filterRows();}else filter.focus();
  }
  filter.addEventListener('input',filterRows);
  filter.addEventListener('keydown',e=>{if(e.key==='Escape'){filter.hidden=true;filter.value='';filterRows();wrapper.querySelector('[data-aw-search]')?.focus();e.stopPropagation();}});
  title.append(action('search','筛选侧栏会话',search,true));
  title.lastElementChild.dataset.awSearch='1';
  function firstProject(){return host?.querySelector(projects) || nativeRows()[0];}
  function focusEntry(target) {
    if(!target)return;
    if(target.getAttribute('aria-expanded')==='false')target.click();
    target.scrollIntoView({block:'nearest'});target.setAttribute('data-aw-focus','');
    setTimeout(()=>target.removeAttribute('data-aw-focus'),1300);
  }
  function navTo(key){direct(key);}
  function stats(){document.getElementById('ag-local-context-trigger')?.click();}
  function drawNav() {
    const isEn = () => window.__agLocalZhControl?.getLang?.() === 'en';
    const langTag = isEn() ? 'en' : 'zh';
    const entries=['new','automation','custom'].filter(k=>rawButtons[k] || (dock.isConnected && knownKeys.has(k)));
    const hasProjects=!!firstProject() || (dock.isConnected && !!nativeToggle()),hasStats=!!document.getElementById('ag-local-context-trigger');
    const key=[mode,langTag,dock.isConnected,...entries,hasProjects,hasStats].join('-');
    if(key===topKey)return;topKey=key;
    rail.replaceChildren();commands.replaceChildren();
    const add=(parent,k,label,fn,small,awKey)=>{const b=action(k,label,fn,small);if(awKey)b.dataset.awKey=awKey;parent.append(b);return b;};
    if(mode==='codex'){
      if(entries.includes('new')) add(rail,'chat',isEn()?'Home':'对话首页',()=>navTo('new'),true,'home');
      if(hasProjects)add(rail,'folder',isEn()?'Projects':'定位项目',openProjects,true,'projects');
      if(entries.includes('automation'))add(rail,'clock',isEn()?'Automations':'自动化任务',()=>navTo('automation'),true,'automation');
      if(entries.includes('custom'))add(rail,'grid',isEn()?'Customizations':'技能与自定义',()=>navTo('custom'),true,'custom');
      const foot=el('div','aw-rail-foot');
      if(hasStats)add(foot,'use',isEn()?'Open Usage':'打开用量统计',stats,true,'usage');

      rail.append(foot);
      for(const n of rail.querySelectorAll('button')) n.dataset.awDest=n.getAttribute('aria-label');
      if(rawButtons.new)add(commands,'add',isEn()?'New Chat':'新建对话',()=>navTo('new'));
    } else {
      if(rawButtons.new)add(commands,'add',isEn()?'New Chat':'新建对话',()=>navTo('new'));
      const searchBtn=action('search',isEn()?'Search':'搜索',search);searchBtn.dataset.awSearch='1';commands.append(searchBtn);
      if(hasProjects)add(commands,'folder',isEn()?'Projects':'项目',()=>focusEntry(firstProject()));
      if(rawButtons.custom)add(commands,'grid',isEn()?'Customizations':'技能与自定义',()=>navTo('custom'));
      if(rawButtons.automation)add(commands,'clock',isEn()?'Automations':'自动化任务',()=>navTo('automation'));
    }
  }
  function rowId(r){
    return (r?.dataset?.cascadeId || r?.querySelector?.('a[href*="/c/"]')?.getAttribute('href')?.match(/\/c\/([0-9a-f-]{36})/i)?.[1] || '').toLowerCase();
  }
  function rowTitle(r){
    const n=r.querySelector('a[href*="/c/"],span.truncate,[class~="truncate"]');
    return (n?.getAttribute('title')||txt(n)||r.getAttribute('aria-label')||'').trim();
  }
  function pinned(){
    const list=nativeRows().filter(r=>r.matches('[data-pinned="true"],[aria-roledescription="pinned"]')||
      r.querySelector('[data-testid*="unpin"],[aria-label="Unpin"],[aria-label="取消置顶"],[title="取消置顶"],svg.lucide-pin'));
    return list;
  }
  function pins(){
    if(mode!=='codex'){fav.hidden=true;return;}
    // 上游已有置顶分组时保留其原始行和菜单，避免重复。
    const heading=[...host.querySelectorAll('h2,h3,h4,button,[role="heading"],span')].find(n=>!n.closest(own+','+rows)&&n.childElementCount===0&&['Pinned','Pinned Conversations','置顶','置顶对话'].includes(txt(n))&&vis(n));
    if(heading){fav.hidden=true;return;}
    const list=pinned();
    const isEn = window.__agLocalZhControl?.getLang?.() === 'en';
    const items=list.map((r,index)=>({id:rowId(r),title:rowTitle(r),index})).filter(it=>it.title);
    const k=JSON.stringify([isEn?'en':'zh',items]);
    if(k!==favKey){favKey=k;fav.replaceChildren(el('h4','',isEn?'Pinned':'置顶'));
      items.forEach(item=>{fav.append(action('pin',item.title,()=>{
        const currentPinned=pinned();
        const r=(item.id && currentPinned.find(e=>rowId(e)===item.id)) ||
          currentPinned.find((e,idx)=>idx===item.index && rowTitle(e)===item.title) ||
          currentPinned.find(e=>rowTitle(e)===item.title);
        (r?.querySelector('a[href*="/c/"],[role="link"],button')||r)?.click();
      }));});
    }
    fav.hidden=!items.length;
  }
  function controlLabel(n) {return (txt(n)||n?.getAttribute('aria-label')||n?.title||'').trim().slice(0,85);}
  // 参考图的主体为 12 × 8 格。直接在界面中绘制，透出页面背景，避免位图缩放变糊。
  function homeCompanion() {
    const ns='http://www.w3.org/2000/svg';
    const make=(tag,attrs,parent)=>{
      const n=document.createElementNS(ns,tag);
      for(const [key,value] of Object.entries(attrs))n.setAttribute(key,value);
      if(parent)parent.append(n);
      return n;
    };
    const svg=make('svg',{viewBox:'0 0 12 8',class:'aw-home-companion','aria-hidden':'true',focusable:'false',fill:'#d87656'});
    const body=make('g',{class:'aw-companion-body'},svg);
    make('path',{d:'M2 0h8v6H2z'},body);
    make('path',{class:'aw-companion-arms',d:'M0 2h2v2H0zM10 2h2v2h-2z'},body);
    make('path',{class:'aw-companion-eyes',d:'M3 1h1v1H3zM8 1h1v1H8z',fill:'#000'},body);
    make('path',{class:'aw-companion-feet-a',d:'M2 5h1v3H2zM7 5h1v3H7z'},svg);
    make('path',{class:'aw-companion-feet-b',d:'M4 5h1v3H4zM9 5h1v3H9z'},svg);
    return svg;
  }
  // 独立于会重建内容的卡片；保留同一 SVG 的动效相位。
  const companion=homeCompanion();

  function updateHome(){
    const ids=['project-selector-trigger','location-selector-trigger','project-branch-picker'];
    const composer=[...document.querySelectorAll(editor)].find(vis);
    const greeting=document.querySelector('[data-testid="home-greeting"]') || document.querySelector('[data-testid="home-splash-content"]');
    if(mode!=='claude'||!composer||!greeting||/\/c\/[a-f\d-]{36}/i.test(location.pathname)){
      home.remove();homeSlot?.removeAttribute('data-aw-greeting');homeSlot=null;return;
    }
    let anchor=greeting;
    if(anchor.contains(composer))anchor=anchor.querySelector('[data-testid="home-greeting"],h1,h2') || null;
    if(!anchor || anchor.contains(composer) || !anchor.parentElement){home.remove();homeSlot?.removeAttribute('data-aw-greeting');homeSlot=null;return;}
    const triggers=ids.map(id=>composer.querySelector('[data-testid="'+id+'"]')).filter(n=>n&&vis(n));
    const nativeProjects=host?[...host.querySelectorAll(projects)].filter(n=>!n.closest(own)).slice(0,3):[];
    if(!triggers.length&&!nativeProjects.length){home.remove();homeSlot?.removeAttribute('data-aw-greeting');homeSlot=null;return;}
    const key=JSON.stringify([triggers.map(controlLabel),nativeProjects.map(controlLabel)]);
    if(key!==homeKey){homeKey=key;home.replaceChildren();
      const group=el('div','aw-home-card'), links=el('div','aw-home-card');
      for(const n of nativeProjects){
        const name=controlLabel(n);if(!name)continue;
        group.append(action('folder',name,()=>{const h=[...(host?.querySelectorAll(projects)||[])].find(e=>controlLabel(e)===name);focusEntry(h);}));
        group.lastElementChild.title='查看项目会话 · '+name;
      }
      for(const n of triggers){
        const id=n.getAttribute('data-testid'),symbol=id==='project-branch-picker'?'branch':'folder';
        const prefix=id==='location-selector-trigger'?'工作位置':id==='project-branch-picker'?'工作分支':'工作项目';
        const btn=action(symbol,prefix+' · '+controlLabel(n),()=>[...document.querySelectorAll(editor)].find(vis)?.querySelector('[data-testid="'+id+'"]')?.click());
        btn.append(icon('arrow'));links.append(btn);
      }
      if(group.children.length)home.append(group);
      if(links.children.length)home.append(links);
    }
    if(home.firstElementChild?.classList.contains('aw-home-card') && companion.parentElement!==home)home.append(companion);
    if(homeSlot!==anchor){homeSlot?.removeAttribute('data-aw-greeting');homeSlot=anchor;}
    if(home.parentElement!==anchor.parentElement || home.previousElementSibling!==anchor)anchor.after(home);
    if(!anchor.querySelector(ctrl)&&!anchor.matches(ctrl))anchor.setAttribute('data-aw-greeting','');
  }
  function clean(){
    unreserve();observeSidebar(null);wasWide=null;maybeToggle=null;rememberedHost=null;knownKeys.clear();
    for(const n of [wrapper,rail,home]) n.remove();
    if(host){
      host.removeAttribute('data-aw-sidebar');host.style.removeProperty('--aw-top-chrome');host.removeAttribute('data-aw-relative');
      for(const n of host.querySelectorAll('[data-aw-command],[data-aw-filtered]')){
        n.removeAttribute('data-aw-command');n.removeAttribute('data-aw-filtered');
      }
    }
    homeSlot?.removeAttribute('data-aw-greeting');
    host=null;homeSlot=null;rawButtons={};topKey=homeKey=favKey='';filter.hidden=true;filter.value='';
  }
  function updateRailState(){
      const route=location.pathname.toLowerCase();
      const activeKey = /automat/.test(route)?'automation':/customiz|plugin/.test(route)?'custom':/settings/.test(route)?'settings':'home';
      const isEn = window.__agLocalZhControl?.getLang?.() === 'en';
      if(mode==='codex') for(const n of rail.querySelectorAll('[data-aw-key]')){
        if(n.dataset.awKey===activeKey)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');
      }
      if(mode==='codex') {
        const quota=rail.querySelector('.aw-rail-foot button');
        const raw=document.querySelector('#ag-local-context-trigger [data-summary-ring="five"] .ag-mini-dial')?.textContent.trim();
        const pct=/^(?:100|\d{1,2})(?:\.\d+)?%$/.test(raw || '') ? raw : '';
        if(quota) {
          quota.classList.toggle('aw-quota-ring',!!pct);
          if(pct){quota.style.setProperty('--aw-remaining',pct);quota.title=isEn?('5h left '+pct+' · Open Usage'):('5 小时剩余 '+pct+' · 打开用量统计');}
          else quota.title=isEn?'Open Usage':'打开用量统计';
        }
      }
  }
  function sync(next,settings){
    if(next==='google'){if(host||home.isConnected||dock.isConnected)clean();mode=next;return;}
    const side=locate(settings);
    if(next==='codex'){
      if(mode!==next){clean();mode=next;}
      if(side && rememberedHost && rememberedHost!==side) {
        rememberedHost.removeAttribute('data-aw-sidebar');rememberedHost.removeAttribute('data-aw-relative');rememberedHost.style.removeProperty('--aw-top-chrome');
        for(const n of rememberedHost.querySelectorAll('[data-aw-command],[data-aw-filtered]')){n.removeAttribute('data-aw-command');n.removeAttribute('data-aw-filtered');}
      }
      if(side)rememberedHost=side;
      const n=side || (rememberedHost?.isConnected ? rememberedHost : null);
      const wide=!!n && exposed(n);
      if(wasWide!==null && wasWide!==wide && maybeToggle?.n.isConnected && performance.now()-maybeToggle.time<700){
        toggleHint=maybeToggle.n;maybeToggle=null;
      }
      wasWide=wide;
      if(!wide && (n || rememberedHost || nativeToggle())){
        host=n;observeSidebar(n);
        if(!dock.isConnected)document.body.append(dock);
        if(rail.parentElement!==dock)dock.append(rail);
        if(host)for(const k of Object.keys(words)){
          const original=k==='settings'?settings:findAction(host,k,true);
          if(original){rawButtons[k]=original;knownKeys.add(k);}
        }
        if(!host && !knownKeys.size && nativeToggle())['new','automation','custom'].forEach(k=>knownKeys.add(k));
        makeRoom();drawNav();updateRailState();
        return;
      }
      unreserve();host=n;observeSidebar(n);
    } else {
      if(host!==side||mode!==next){clean();host=side;mode=next;}
    }
    if(host && vis(host)){
      host.dataset.awSidebar=mode;
      const topOffset=Math.min(42,Math.max(0,40-host.getBoundingClientRect().top))+'px';
      if(host.style.getPropertyValue('--aw-top-chrome')!==topOffset)host.style.setProperty('--aw-top-chrome',topOffset);
      if(getComputedStyle(host).position==='static')host.dataset.awRelative='';
      for(const key of Object.keys(words)){
        const n=key==='settings'?settings:findAction(host,key);
        if(n){n.dataset.awCommand=key;rawButtons[key]=n;knownKeys.add(key);}else delete rawButtons[key];
      }
      let ref=rawButtons.new || rawButtons.automation || firstProject();
      if(ref){
        while(ref.parentElement && ref.parentElement!==host)ref=ref.parentElement;
        if(ref.parentElement===host && wrapper.parentElement!==host)host.insertBefore(wrapper,ref);
      }
      if(mode==='codex' && rail.parentElement!==host)host.append(rail);
      if(mode==='claude' && rail.isConnected)rail.remove();
      drawNav();pins();
      updateRailState();
      if(!filter.hidden)filterRows();
    }
    updateHome();
  }
  function status(){
    const r=rail.getBoundingClientRect(), h=wrapper.getBoundingClientRect(), view=host?.getBoundingClientRect();
    return {layout:mode, foldedRail:dock.isConnected, toggleKnown:mode==='codex'&&!!nativeToggle(), room:reserved?Math.round(reserved.getBoundingClientRect().left):null, rail:!!vis(rail), railWidth:Math.round(r.width), nav:!!vis(wrapper),
      columns:mode==='codex'&&vis(rail)&&vis(wrapper)&&h.left>=r.right-2?2:vis(wrapper)?1:0,
      actions:vis(wrapper)?commands.children.length:0,railActions:vis(rail)?rail.querySelectorAll('button').length:0,projects:host?.querySelectorAll(projects).length||0,
      homeCards:vis(home)?home.querySelectorAll(':scope > .aw-home-card').length:0,
      companion:vis(companion) && mode==='claude',sidebarWidth:view?Math.round(view.width):0,
      nativePins:!fav.hidden?fav.querySelectorAll('button').length:0, search:!filter.hidden,
      homeEntry:!!document.querySelector('[data-testid="home-greeting"],[data-testid="home-splash-content"]'),
      projectControls:document.querySelectorAll(editor+' [data-testid*="project"]').length,
      listRows:nativeRows().length,actionsBound:Object.keys(rawButtons).sort().join(',')};
  }
  return {sync,status,setRefresh:f=>{onLayoutChange=f;},settingsTarget:n=>dock.isConnected?{click:()=>direct('settings')}:n,
    container:()=>dock.isConnected?dock:mode!=='google'&&wrapper.isConnected?host:null};
})
