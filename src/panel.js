(() => {
  'use strict';
  if (window.top !== window || location.protocol !== 'https:' || location.hostname !== '127.0.0.1' ||
      !location.port || location.username || location.password ||
      typeof window.electronNative?.getZoomLevel !== 'function' ||
      typeof window.electronNative?.setTitleBarOverlay !== 'function') return null;
  if (window.__agContextPanel) return window.__agContextPanel.get();
  if (!document.body) return null;

  const side = '[data-testid="side-question-tab-content"],[data-testid="side-question-tab-composer"]';
  const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const canonical = value => uuid.test(value || '') ? value.toLowerCase() : null;
  const visible = element => element?.isConnected && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const main = selector => [...document.querySelectorAll(selector)].find(el => visible(el) && !el.closest(side));
  const modelSelector = '[data-testid="model-selector-trigger"]';
  const findModel = () => main('[id="antigravity.agentSidePanelInputBox"] ' + modelSelector) || main(modelSelector);
  const num = value => Number.isFinite(value) && value >= 0;
  const number = new Intl.NumberFormat('zh-CN', {maximumFractionDigits: 0});
  const node = (tag, text) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };

  function conversationId() {
    const route = canonical(location.pathname.match(/(?:^|\/)c\/([^/]+)(?:\/|$)/i)?.[1]);
    const view = canonical(main('[data-testid="conversation-view"][data-cascade-id]')?.dataset.cascadeId);
    if (route) return view && view !== route ? null : route;
    if (main('[data-testid="home-greeting"],[data-testid="home-splash-content"]')) return null;
    return view || canonical(main('[data-testid="conversation-row-sidebar"][data-selected="true"][data-cascade-id]')?.dataset.cascadeId);
  }

  const style = node('style');
  style.textContent = `
    #ag-local-context-trigger {
      display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;
      border:0;border-radius:15px;padding:0 2px;color:inherit;background:transparent;cursor:pointer;
      font:500 10px/1.1 Roboto,"Helvetica Neue","PingFang SC",sans-serif;white-space:nowrap;
      font-variant-numeric:tabular-nums
    }
    #ag-local-context-trigger:hover,#ag-local-context-trigger[aria-expanded="true"] {
      background:color-mix(in srgb,currentColor 6%,transparent)
    }
    #ag-local-context-trigger .ag-mini {display:inline-flex;align-items:center;gap:3px}
    #ag-local-context-trigger .ag-mini-dial {
      display:grid;place-items:center;position:relative;width:26px;height:26px;flex:none;
      font:600 8px/1 Roboto,"Helvetica Neue",Arial,sans-serif;letter-spacing:-.35px;font-variant-numeric:tabular-nums
    }
    #ag-local-context-trigger .ag-mini-dial::before {
      content:"";position:absolute;inset:0;border-radius:50%;
      background:conic-gradient(var(--ag-mini-color) var(--ag-mini-sweep,0%),color-mix(in srgb,currentColor 16%,transparent) 0);
      mask:radial-gradient(farthest-side,transparent calc(100% - 2px),black calc(100% - 1.5px));
      pointer-events:none
    }
    #ag-local-context-trigger .ag-mini-label {display:grid;gap:0;text-align:left;font-size:9px;line-height:1.08}
    #ag-local-context-trigger .ag-mini-label small {font:inherit;opacity:.74}
    #ag-local-context-trigger[data-compact] {gap:4px;padding-inline:1px}
    #ag-local-context-trigger[data-compact] .ag-mini {gap:2px}
    #ag-local-context-trigger[data-compact] .ag-mini-label {font-size:8.5px}
    #ag-local-context-trigger[data-compact] .ag-mini-label > * {display:none}
    #ag-local-context-trigger[data-compact] .ag-mini-label::after {content:attr(data-short)}
    [data-ag-context-model] {min-width:0!important;max-width:var(--ag-model-cap)!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ag-local-context-card {
      --ag-fg:#202124;--ag-muted:#515861;--ag-surface:#fff;--ag-line:#e2e6ed;
      --ag-input:#4285F4;--ag-output:#EA4335;--ag-cache:#34A853;--ag-quota-week:#FBBC04;
      --ag-thinking:#A142F4;--ag-latency:#F9AB00;--ag-speed:#12B5CB;
      --ag-primary:#1967d2;--ag-track:#e8f0fe;--ag-fill:#4285f4;
      position:fixed;inset:auto 16px 16px auto;z-index:2147483646;box-sizing:border-box;
      width:min(296px,calc(100vw - 24px));max-height:calc(100vh - 24px);margin:0;
      overflow:auto;overscroll-behavior:contain;padding:10px 14px 11px;border:1px solid var(--ag-line);
      border-radius:16px;box-shadow:0 2px 6px #20212420,0 8px 22px #20212414;
      background:var(--ag-surface);color:var(--ag-fg);
      font:400 12px/1.45 Roboto,"Helvetica Neue","PingFang SC",sans-serif;font-variant-numeric:tabular-nums;
      text-align:left;letter-spacing:normal;outline:none
    }
    #ag-local-context-card[data-theme="dark"] {
      --ag-fg:#e8eaed;--ag-muted:#bdc1c6;--ag-surface:#292a2d;--ag-line:#474a50;
      --ag-input:#669DF6;--ag-output:#FF7066;--ag-cache:#51C878;--ag-quota-week:#FFCA28;
      --ag-thinking:#C58AF9;--ag-latency:#FFB940;--ag-speed:#40CCDE;
      --ag-primary:#8ab4f8;--ag-track:#394454;--ag-fill:#8ab4f8;color-scheme:dark
    }
    #ag-local-context-card[hidden]{display:none!important}
    #ag-local-context-card header {display:flex;align-items:center;justify-content:space-between;margin:0 0 4px;padding:0}
    #ag-local-context-card header strong {font-size:13px;line-height:20px;font-weight:600;color:var(--ag-fg)}
    #ag-local-context-card .ag-close {display:grid;place-items:center;cursor:pointer;border:0;border-radius:50%;color:var(--ag-muted);background:transparent;width:28px;height:28px;margin:-3px -5px -3px 0;padding:0;font:400 21px/1 Roboto,Arial,sans-serif}
    #ag-local-context-card .ag-close:hover {background:color-mix(in srgb,var(--ag-fg) 8%,transparent)}
    #ag-local-context-card .ag-close:focus-visible,#ag-local-context-trigger:focus-visible {outline:2px solid #4285f4;outline-offset:2px}
    #ag-local-context-card .ag-major,#ag-local-context-card .ag-minor {display:grid;gap:4px;align-items:stretch}
    #ag-local-context-card .ag-major {grid-template-columns:repeat(3,minmax(0,1fr));margin-top:7px}
    #ag-local-context-card .ag-minor {grid-template-columns:repeat(3,minmax(0,1fr));margin-top:8px;padding-top:8px;border-top:1px solid var(--ag-line);row-gap:8px}
    #ag-local-context-card .ag-reading {font:inherit;color:var(--ag-fg);display:flex;flex-direction:column;align-items:center;gap:2px;text-align:center;
      border:0;border-radius:8px;background:transparent;padding:2px;min-width:0;cursor:pointer}
    #ag-local-context-card .ag-major .ag-reading {padding:6px 3px;background:color-mix(in srgb,var(--ring) 11%,var(--ag-surface))}
    #ag-local-context-card .ag-reading:hover,#ag-local-context-card .ag-reading[aria-pressed="true"] {background:color-mix(in srgb,var(--ring) 12%,var(--ag-surface))}
    #ag-local-context-card .ag-reading:focus-visible {outline:2px solid var(--ring);outline-offset:1px}
    #ag-local-context-card .ag-dial {height:42px;width:42px;border-radius:50%;display:grid;place-items:center;
      background:conic-gradient(var(--ring) var(--turn),var(--ag-line) 0);color:var(--ag-fg)}
    #ag-local-context-card .ag-major .ag-dial {height:48px;width:48px}
    #ag-local-context-card .ag-dial span {width:calc(100% - 9px);height:calc(100% - 9px);display:grid;place-items:center;
      border-radius:50%;background:var(--ag-surface);font-size:10px;font-weight:650;white-space:nowrap}
    #ag-local-context-card .ag-major .ag-dial span {font-size:11px}
    #ag-local-context-card .ag-name {font-size:10.5px;font-weight:550;line-height:15px}
    #ag-local-context-card .ag-small {font-size:10px;line-height:14px;color:var(--ag-muted);max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    #ag-local-context-card .ag-major [data-ag-chart^="quota-"] .ag-small {white-space:normal;text-wrap:balance;line-height:1.3}
    #ag-local-context-card .ag-sync:disabled {opacity:.6;cursor:default}
    #ag-local-context-card .ag-explain {margin:6px 0 0;padding:6px 8px;font-size:11px;line-height:1.5;color:var(--ag-fg);background:color-mix(in srgb,var(--ag-fg) 5%,transparent);border-radius:6px}
    #ag-local-context-card .ag-quota-info {display:flex;align-items:center;gap:5px;margin-top:5px;min-height:20px}
    #ag-local-context-card .ag-quota-info small {min-width:0;color:var(--ag-muted);font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
    #ag-local-context-card .ag-sync {flex:none;white-space:nowrap;border:0;background:transparent;color:var(--ag-primary);font-family:inherit;font-weight:550;font-size:10.5px;line-height:18px;padding:0 2px;cursor:pointer;border-radius:3px;margin-left:auto}
    #ag-local-context-card .ag-sync:hover {text-decoration:underline}
    #ag-local-context-card .ag-sync:focus-visible {outline:2px solid var(--ag-primary);outline-offset:1px}
    #ag-local-context-card .ag-select {display:block;background:var(--ag-surface);color:var(--ag-fg);border:1px solid var(--ag-line);border-radius:6px;font:inherit;font-size:11px;padding:2px 4px;margin:0;min-width:0;max-width:48%}
    #ag-local-context-card .ag-view-switch {display:flex;align-items:center;gap:3px;margin:5px 0 7px}
    #ag-local-context-card .ag-view-switch button {background:transparent;border:0;color:var(--ag-muted);border-radius:12px;padding:3px 9px;cursor:pointer;font:500 11px/16px Roboto,"PingFang SC",sans-serif}
    #ag-local-context-card .ag-view-switch button[aria-pressed=true] {background:var(--ag-track);color:var(--ag-primary)}
    #ag-local-context-card .ag-usage-section {padding:6px 0;border-top:1px solid var(--ag-line)}
    #ag-local-context-card .ag-usage-heading {font-family:inherit;font-weight:600;font-size:12px;line-height:18px;margin:0 0 4px;color:var(--ag-fg)}
    #ag-local-context-card .ag-usage-row {display:flex;gap:8px;justify-content:space-between;margin:2px 0;color:var(--ag-muted);font-size:11px}
    #ag-local-context-card .ag-usage-row b {color:var(--ag-fg);font-weight:550;text-align:right}
    #ag-local-context-card .ag-usage-table {border-collapse:collapse;width:100%;font:inherit;font-size:10.5px;font-variant-numeric:tabular-nums}
    #ag-local-context-card .ag-usage-table th,#ag-local-context-card .ag-usage-table td {padding:3px 1px;text-align:right}
    #ag-local-context-card .ag-usage-table th {font-weight:500;color:var(--ag-muted)}
    #ag-local-context-card .ag-usage-table :is(th,td):first-child {text-align:left}
    @media (max-width:280px) {#ag-local-context-card .ag-minor {grid-template-columns:repeat(2,minmax(0,1fr))}}
    #ag-local-context-card .ag-empty {margin:7px 0 2px;color:var(--ag-muted)}
  `;
  document.head.append(style);
  const button = node('button');
  button.type = 'button';
  button.id = 'ag-local-context-trigger';
  button.title = '查看当前对话的上下文统计';
  button.setAttribute('aria-label','上下文统计');
  button.setAttribute('aria-controls','ag-local-context-card');
  button.setAttribute('aria-expanded','false');
  button.setAttribute('aria-haspopup','dialog');
  function miniDial(key,caption,kind,color) {
    const mini = node('span');
    mini.className = 'ag-mini';
    mini.dataset.summaryRing = key;
    mini.style.setProperty('--ag-mini-color',color);
    const value = node('span','—');
    value.className = 'ag-mini-dial';
    const label = node('span');
    label.className = 'ag-mini-label';
    label.dataset.short = {capacity:'上下文',five:'5h',week:'周'}[key];
    label.append(node('span',caption),node('small',kind));
    mini.append(value,label);
    button.append(mini);
    return (percent,group='',overrideColor=color) => {
      const shown = num(percent) ? Number(percent.toFixed(1))+'%' : '—';
      if (value.textContent !== shown) {
        value.textContent = shown;
        mini.style.setProperty('--ag-mini-sweep', num(percent) ? Math.min(100,percent)+'%' : '0%');
      }
      if (key==='capacity') mini.toggleAttribute('data-aw-warning',num(percent) && percent>=75);
      if (mini.style.getPropertyValue('--ag-mini-color') !== overrideColor) mini.style.setProperty('--ag-mini-color',overrideColor);
      const help=(group ? group+' · ' : '')+caption+kind+' '+shown;
      if (mini.title !== help) mini.title = help;
      return help;
    };
  }
  const miniContext = miniDial('capacity','上下文','占用','#4285f4');
  const miniFive = miniDial('five','5小时','剩余','#34a853');
  const miniWeek = miniDial('week','每周','剩余','#fbbc04');
  const card = node('section');
  card.id = 'ag-local-context-card';
  card.tabIndex = -1;
  card.setAttribute('role','dialog');
  card.setAttribute('aria-label','上下文统计');
  card.hidden = true;
  const top = node('header');
  const closeButton = node('button','×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label','关闭统计面板');
  closeButton.className = 'ag-close';
  const headerTitle = node('strong','用量与额度');
  top.append(headerTitle,closeButton);
  const details = node('div');
  details.className = 'ag-body';
  let showUsage=false;
  const views=styled('div','ag-view-switch');
  views.setAttribute('role','group'); views.setAttribute('aria-label','统计视图');
  const overview=node('button','实时概览'), breakdown=node('button','用量明细');
  for (const b of [overview,breakdown]) {
    b.type='button'; b.setAttribute('aria-pressed',String(b===overview));
    b.addEventListener('click',()=>{
      showUsage=b===breakdown; explainedKey='';
      draw(); position();
    });
    views.append(b);
  }
  card.append(top, views, details);
  document.body.append(card);
  let open = false;
  let activeId;
  let data = null;
  let signature = '';

  const fmt = value => number.format(value);
  function styled(tag, cls, text) {
    const el = node(tag, text);
    el.className = cls;
    return el;
  }

  const token = value => num(value) ? fmt(value) + ' token' : '未提供';
  const secs = value => num(value) ? value.toFixed(2) + ' s' : '未提供';
  const portion = (part, total) => num(part) && num(total) && total > 0 ? 100 * part / total : null;
  let pickedGroup = '';
  let requestPending = false;
  let requestFailed = false;
  let quotaStatus = 'idle';
  let staleSnapshot = false;
  let explainedKey = '';
  let quotaSignature = '';
  let selectedGroup = '';
  let groupRows = [];
  let seenAt = 0;
  function refreshQuota() {
    const source = window.__agQuotaSummary?.get?.() || {};
    const now = Date.now();
    const rows = (Array.isArray(source.items) ? source.items : [])
      .filter(q=>typeof q?.group==='string' && q.group.trim() && (q.period==='five'||q.period==='week'))
      .map(q=>({
        group:q.group, period:q.period,
        percent:num(q.percent) && q.percent<=100 ? q.percent : null,
        resetAt:Number.isFinite(q.resetAt) && q.resetAt>0 && q.resetAt<=8.64e15 ? q.resetAt : null
      }));
    const selected = typeof source.selectedGroup==='string' ? source.selectedGroup : '';
    const updated = num(source.seenAt) && source.seenAt>0 ? source.seenAt : 0;
    const status = requestFailed ? 'unavailable' : requestPending ? 'refreshing' : source.status || (rows.length ? 'ready' : 'idle');
    const expiresAt = Number.isFinite(source.expiresAt) ? source.expiresAt : updated + 10*60*1000;
    const isStale = rows.length>0 && (!updated || source.stale===true || now>=expiresAt);
    const countdowns = rows.map(row => resetCountdown(row.resetAt,now));
    const lang = window.__agLocalZhControl?.getLang?.() === 'en' ? 'en' : 'zh';
    const sig = JSON.stringify([lang,rows,selected,updated,status,isStale,countdowns]);
    if (sig === quotaSignature) return false;
    quotaSignature = sig;
    quotaStatus = status;
    staleSnapshot = isStale;
    groupRows = rows;
    selectedGroup = selected;
    seenAt = updated;
    if (!rows.some(q=>q.group===pickedGroup)) pickedGroup='';
    return true;
  }
  function resetCountdown(resetAt,now) {
    if (!resetAt) return '重置时间未提供';
    const remaining = resetAt-now;
    if (remaining<=0) return '已到重置时间';
    if (remaining<60000) return '不到1分钟后重置';
    const minutes = Math.floor(remaining/60000);
    const hours = Math.floor(minutes/60);
    if (hours>=24) return Math.floor(hours/24)+'天'+(hours%24 ? hours%24+'小时' : '')+'后重置';
    if (hours) return hours+'小时'+(minutes%60 ? minutes%60+'分' : '')+'后重置';
    return minutes+'分钟后重置';
  }
  async function requestQuota(force=false) {
    if (requestPending || quotaStatus === 'disabled') return;
    requestPending = true;
    requestFailed = false;
    try {
      const api = window.__agQuotaSummary;
      if (typeof api?.refresh !== 'function') throw new Error('额度服务未就绪');
      const pending = force ? api.refresh(true) : api.refresh();
      if (open) draw();
      if ((await pending) === false) requestFailed = true;
    } catch {
      requestFailed = true;
    } finally {
      requestPending = false;
      if (open) { draw(); position(); }
    }
  }
  function readTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  }

  function dial(key,name,percent,value,color,help) {
    const item = styled('button','ag-reading');
    item.type = 'button';
    item.dataset.agChart = key;
    item.style.setProperty('--ring', color);
    item.style.setProperty('--turn',(num(percent) ? Math.min(100,percent) : 0) + '%');
    item.title = help;
    item.setAttribute('aria-pressed',String(explainedKey === key));
    const formatted = num(percent) ? Number(percent.toFixed(1)) + '%' : '—';
    item.setAttribute('aria-label',name + ' ' + formatted + '。' + help);
    const ring = styled('span','ag-dial');
    ring.setAttribute('aria-hidden','true');
    ring.append(node('span',formatted));
    item.append(ring,styled('span','ag-name',name),styled('span','ag-small',value));
    return item;
  }

  function drawUsage() {
    details.replaceChildren();
    const note = message => styled('p','ag-empty',message);
    if (!activeId) { details.append(note('打开对话后可查看调用明细。')); return; }
    function section(label) {
      const box=styled('section','ag-usage-section');
      box.append(styled('h4','ag-usage-heading',label));
      details.append(box);
      return box;
    }
    function line(box, label, value, help) {
      const row=styled('div','ag-usage-row');
      if (help) row.title=help;
      row.append(node('span',label),node('b',value)); box.append(row);
    }
    const last=section('最近一次有用量的调用');
    if (data?.state==='ready') {
      line(last,'输入 / 输出 token',(num(data.context)?fmt(data.context):'—')+' / '+(num(data.output)?fmt(data.output):'—'),
        '输入含新增输入、缓存写入和缓存读取。');
      const duration=num(data.ttft)&&num(data.stream)?data.ttft+data.stream:0;
      line(last,'流式 / 含首字等待', (num(data.speed)?data.speed.toFixed(1):'—')+' / '+
        (duration>0&&num(data.output)?(data.output/duration).toFixed(1):'—')+' tok/s',
        '同一输出量，分别除以流式耗时及首字等待加流式耗时。');
    } else last.append(note('暂无可用的调用数据。'));
    const usage=data?.usage;
    if (usage?.state!=='ready') {
      details.append(note(usage?.state==='unavailable'?'暂时无法读取轮次统计。':usage?.state==='empty'?'尚无调用记录。':'正在读取本轮与会话用量…'));
      return;
    }
    const total = (g,key) => !g[key+'N'] ? '—' : (g[key+'N']<g.calls?'≥':'')+fmt(g[key]);
    const cachePct = g=>g.cacheN && g.input>0 && g.inputN===g.calls ? (g.cacheN<g.calls?'≥':'')+(100*g.cacheRead/g.input).toFixed(1)+'%' : '—';
    function summary(box,g) {
      line(box,'模型调用',fmt(g.calls)+' 次');
      line(box,'累计输入 / 输出 token',total(g,'input')+' / '+total(g,'output'),
        '同一上下文被多次送入模型时，每次都计入输入。≥ 表示部分调用缺少该字段。');
      line(box,'缓存读取占比',cachePct(g),'缓存读取量合计除以含缓存输入量合计。≥ 表示部分调用缺少缓存数据，当前值为下限。');
      if (g.timed) line(box,'调用耗时合计',(g.timed<g.calls?'≥':'')+g.duration.toFixed(1)+' s',
        '合计已记录的首字等待和流式耗时。工具运行、调用之间的等待另计。');
    }
    const current=usage.turns[0];
    const round=section(current?'本轮 · 第 '+current.number+' 轮':'本轮');
    if (current?.calls) summary(round,current);
    else round.append(note('本轮尚无可归属的模型调用。'));
    const session=section((usage.partial?'已读取记录小计':'会话累计')+' · '+fmt(usage.turnCount)+' 轮');
    summary(session,usage.session);
    if (usage.partial || usage.unmapped) {
      const msgs=[];
      if (usage.partial) msgs.push('部分记录超出读取范围或无法解析，合计仅含已读取记录。');
      if (usage.unmapped) msgs.push(fmt(usage.unmapped)+' 次调用无法归属到具体轮次，仅计入会话统计。');
      session.append(note(msgs.join(' ')));
    }
    const past=usage.turns.slice(1);
    if (past.length) {
      const box=section('此前各轮');
      const table=styled('table','ag-usage-table');
      const head=node('thead'), tr=node('tr');
      for (const name of ['轮次','调用','输入 token','输出 token']) {
        const th=node('th',name); th.scope='col'; tr.append(th);
      }
      head.append(tr); const body=node('tbody');
      for (const g of past) {
        const row=node('tr');
        for (const v of [String(g.number),String(g.calls),total(g,'input'),total(g,'output')]) row.append(node('td',v));
        body.append(row);
      }
      table.append(head,body); box.append(table);
    }
  }

  function draw() {
    const ready = data?.state === 'ready';
    const used = ready ? portion(data.context,data.limit) : null;
    const color = num(used) && used >= 90 ? '#ea4335' : num(used) && used >= 75 ? '#f9ab00' : 'var(--ag-fill)';
    refreshQuota();
    const groups = [...new Set(groupRows.map(q=>q.group))];
    const selected = groups.includes(selectedGroup) ? selectedGroup : '';
    const group = pickedGroup || selected || (groups.length===1 ? groups[0] : '');
    const now = Date.now();
    const quotaFor = period => {
      const matches = groupRows.filter(q=>q.group===group && q.period===period);
      const first = matches[0];
      const resetAt = first && matches.every(q=>q.resetAt===first.resetAt) ? first.resetAt : null;
      const expired = matches.some(q=>q.resetAt && q.resetAt<=now);
      const value = first && !expired && !staleSnapshot && matches.every(q=>q.percent===first.percent) ? first.percent : null;
      return {value,resetAt};
    };
    const five = quotaFor('five'), week = quotaFor('week');
    const description = [
      miniContext(used,'',color === 'var(--ag-fill)' ? '#4285f4' : color),
      miniFive(five.value,group),miniWeek(week.value,group)
    ].join('，');
    if (button.getAttribute('aria-description') !== description) button.setAttribute('aria-description',description);
    if (!open) return;
    overview.setAttribute('aria-pressed',String(!showUsage));
    breakdown.setAttribute('aria-pressed',String(showUsage));
    if (showUsage) { drawUsage(); return; }
    const focusKey = details.contains(document.activeElement) ? document.activeElement.dataset.agChart : '';
    const focusPicker = document.activeElement?.classList.contains('ag-select');
    const focusSync = document.activeElement?.classList.contains('ag-sync');
    details.replaceChildren();
    const major = styled('div','ag-major');
    const remaining = num(data?.context) && num(data?.limit) && data.limit > 0 ? Math.max(0,data.limit-data.context) : null;
    const contextHelp = '已用 ' + token(data?.context) + '，模型上限 ' + token(data?.limit) + '，剩余 ' + token(remaining) + '。';
    major.append(dial('capacity','上下文已用',used,token(data?.context),color, contextHelp));
    function quotaRing(period,name,tint,reading) {
      const {value,resetAt} = reading;
      const hint = group ? group + '的' + name + '额度。' : groups.length ? '选择额度模型组。' : '等待后台读取额度。';
      const explanation = hint + (num(value) ? '上次读取的剩余额度为 ' + Number(value.toFixed(1)) + '%。' : '尚无可确认的剩余百分比。')
        + (resetAt ? '下次重置时间（本地）' + readTime(resetAt) + '。' : '');
      return dial('quota-'+period,name+'剩余',value,resetCountdown(resetAt,now),tint,explanation);
    }
    major.append(quotaRing('five','5 小时','var(--ag-cache)',five),quotaRing('week','每周','var(--ag-quota-week)',week));
    details.append(major);
    const quotaInfo = styled('div','ag-quota-info');
    if (groups.length>1) {
      const chooser = styled('select','ag-select');
      chooser.setAttribute('aria-label','选择额度模型组');
      const placeholder = node('option',selected ? '当前模型组 · '+selected : '选择额度模型组');
      placeholder.value='';chooser.append(placeholder);
      for (const name of groups) {
        const opt=node('option',name);opt.value=name;chooser.append(opt);
      }
      chooser.value=pickedGroup;quotaInfo.append(chooser);
    } else if (groups.length===1) {
      quotaInfo.append(node('small','额度组 · '+group));
    }
    const isEn = window.__agLocalZhControl?.getLang?.() === 'en';
    const wantTitle = isEn ? 'Usage & CLI Quota' : '用量与额度';
    if (headerTitle.textContent !== wantTitle) headerTitle.textContent = wantTitle;
    const readout = quotaStatus==='disabled' ? (isEn ? 'CLI quota disabled in Appearance' : 'CLI 额度查询已在外观设置中关闭')
      : quotaStatus==='refreshing' ? (isEn ? 'Syncing CLI quota…' : '正在同步 CLI 账号额度…')
      : staleSnapshot ? (isEn ? 'CLI quota cache expired' : 'CLI 额度缓存已过期')
      : quotaStatus==='unavailable' ? (seenAt && groups.length ? (isEn ? 'CLI cache from '+readTime(seenAt) : '暂用 CLI 缓存（'+readTime(seenAt)+'）') : (isEn ? 'CLI quota unavailable' : 'CLI 额度暂不可用'))
      : seenAt && groups.length ? (isEn ? 'CLI account · '+readTime(seenAt) : 'CLI 账号额度 · '+readTime(seenAt))
      : (isEn ? 'Waiting for CLI quota' : '等待 CLI 账号额度');
    const stamp = node('small',readout);
    stamp.title = isEn ? readout + ' (Source: agy /usage CLI account)' : readout + '（数据来自本机 agy /usage 登录账号）';
    stamp.setAttribute('aria-live','polite');
    const syncQuota = styled('button','ag-sync',isEn ? 'Sync CLI' : '同步额度');
    syncQuota.type = 'button';
    syncQuota.disabled = quotaStatus==='refreshing' || quotaStatus==='disabled';
    syncQuota.title = isEn ? 'Refresh CLI account quota (agy /usage)' : '后台刷新 CLI 账号模型额度（agy /usage）';
    quotaInfo.append(stamp,syncQuota);
    details.append(quotaInfo);
    if (ready) {
      const minor = styled('div','ag-minor');
      const stream = num(data.stream) ? data.stream : num(data.output) && num(data.speed) && data.speed>0 ? data.output/data.speed : null;
      const totalTime = num(data.ttft) && num(stream) ? data.ttft + stream : null;
      const inputHelp = '本次输入总量 ' + token(data.context) + '，其中新增 ' + token(data.input) + '、缓存写入 ' + token(data.cacheWrite) + '、缓存读取 ' + token(data.cacheRead) + '。';
      const outputHelp = '本次输出总量 ' + token(data.output) + '，其中思考 ' + token(data.think) + '、回复 ' + token(data.response) + '。';
      const timeHelp = '按首字等待与流式生成的合计耗时计算。等待 ' + secs(data.ttft) + '，生成 ' + secs(stream) + '。';
      minor.append(
        dial('input','新增占输入',portion(data.input,data.context),token(data.input),'var(--ag-input)',inputHelp),
        dial('cache','缓存读占输入',portion(data.cacheRead,data.context),token(data.cacheRead),'var(--ag-cache)',inputHelp),
        dial('think','思考占输出',portion(data.think,data.output),token(data.think),'var(--ag-thinking)',outputHelp),
        dial('reply','回复占输出',portion(data.response,data.output),token(data.response),'var(--ag-output)',outputHelp),
        dial('wait','首字等待占时',portion(data.ttft,totalTime),secs(data.ttft),'var(--ag-latency)',timeHelp),
        dial('generate','流式生成占时',portion(stream,totalTime),num(data.speed) ? data.speed.toFixed(1) + ' tok/s' : secs(stream),'var(--ag-speed)',timeHelp)
      );
      details.append(minor);
    } else {
      const message = !activeId ? '打开对话可查看调用统计。' : data?.state === 'unavailable' ? '暂时无法读取用量。'
        : data?.state === 'empty' ? '等待首次用量记录。' : '正在读取用量…';
      details.append(styled('p','ag-empty',message));
    }
    if (explainedKey) {
      const active = [...details.querySelectorAll('[data-ag-chart]')].find(b=>b.dataset.agChart===explainedKey);
      if (active) details.append(styled('p','ag-explain',active.title));
    }
    if (focusKey) [...details.querySelectorAll('[data-ag-chart]')].find(e=>e.dataset.agChart===focusKey)?.focus({preventScroll:true});
    if (focusPicker) details.querySelector('.ag-select')?.focus({preventScroll:true});
    if (focusSync) details.querySelector('.ag-sync')?.focus({preventScroll:true});
  }
  details.addEventListener('click',async e=>{
    if (e.target.closest?.('button.ag-sync')) {
      await requestQuota(true);
      return;
    }
    const target=e.target.closest?.('button[data-ag-chart]');
    if (!target) return;
    explainedKey = explainedKey === target.dataset.agChart ? '' : target.dataset.agChart;
    draw(); position();
  });
  details.addEventListener('change',e=>{
    if (!e.target.classList.contains('ag-select')) return;
    pickedGroup=e.target.value;
    explainedKey='';
    draw(); position();
  });

  // 在模型与右侧控件的实测空隙内尽量居中。
  const offsets = node('style');
  offsets.textContent = '[data-ag-context-position]{position:relative} #ag-local-context-trigger[data-ag-context-float]{position:absolute;transform:translate(-50%,-50%);margin:0;z-index:1}';
  document.head.append(offsets);
  let toolbar = null;
  let cappedModel = null;
  function releaseModel() {
    if (!cappedModel) return;
    cappedModel.removeAttribute('data-ag-context-model');
    cappedModel.style.removeProperty('--ag-model-cap');
    cappedModel = null;
  }
  let composer = null;
  let observedBox = null;
  function placeButton(model) {
    const modelRect = model.getBoundingClientRect();
    const box = model.closest('[id="antigravity.agentSidePanelInputBox"]');
    let row = null;
    for (let parent = model.parentElement, level = 0; parent && parent !== document.body && level < 9; parent = parent.parentElement, level++) {
      const rect = parent.getBoundingClientRect();
      const nearWidth = box ? rect.width >= box.clientWidth * 0.82 : rect.width >= modelRect.width + 120;
      if (nearWidth && rect.height <= Math.max(62, modelRect.height * 2) && parent.querySelectorAll('button,[role="button"]').length >= 2) {
        row = parent;
        break;
      }
      if (parent === box) break;
    }
    row ||= box || model.parentElement;
    const base = box || row;
    if (toolbar !== row) {
      toolbar?.removeAttribute('data-ag-context-position');
      toolbar = row;
    }
    composer = base;
    if (observedBox !== base) {
      resize.disconnect();
      resize.observe(base);
      if (row !== base) resize.observe(row);
      observedBox = base;
    }
    if (cappedModel !== model) { releaseModel(); cappedModel = model; }
    if (getComputedStyle(row).position === 'static') row.setAttribute('data-ag-context-position','');
    if (button.parentElement !== row) row.append(button);
    button.setAttribute('data-ag-context-float','');
    const frame = base.getBoundingClientRect();
    button.toggleAttribute('data-compact',frame.width < 540);
    const controls = [...row.querySelectorAll('button,[role="button"],a[href],input,select,[tabindex="0"]')].filter(el =>
      el !== button && !button.contains(el) && !el.contains(button) &&
      el !== model && !model.contains(el) && !el.contains(model) && visible(el));
    const edge = 4;
    function bounds() {
      const line = row.getBoundingClientRect();
      const m = model.getBoundingClientRect();
      const cy = m.top + m.height / 2;
      let right = Math.min(frame.right,line.right) - edge;
      for (const el of controls) {
        const rect = el.getBoundingClientRect();
        if (rect.width && rect.left > m.left + 3 && rect.top < cy + 4 && rect.bottom > cy - 4) {
          right = Math.min(right,rect.left - edge);
        }
      }
      return {line,m,cy,right};
    }
    let {line,m,cy,right} = bounds();
    const scale = line.width / (row.offsetWidth || line.width) || 1;
    if (right - m.right - edge < button.getBoundingClientRect().width && frame.width < 680) {
      button.setAttribute('data-compact','');
    }
    const strip = button.getBoundingClientRect().width;
    // 宽度上限只在确实会发生碰撞时压缩长模型名，选择器仍然可以点击。
    const cap = Math.max(28,Math.floor((right-m.left-strip-edge*2)/scale));
    const capStyle = cap + 'px';
    if (model.style.getPropertyValue('--ag-model-cap') !== capStyle) model.style.setProperty('--ag-model-cap',capStyle);
    if (!model.hasAttribute('data-ag-context-model')) model.setAttribute('data-ag-context-model','');
    ({line,m,cy,right} = bounds());
    const left = Math.max(m.right + edge,line.left + edge);
    const ideal = frame.left + frame.width/2;
    const x = Math.max(left + strip/2,Math.min(ideal,right - strip/2));
    const ratioX = row.offsetWidth / line.width || 1;
    const ratioY = row.offsetHeight / line.height || 1;
    button.style.left = ((x-line.left)*ratioX-row.clientLeft+row.scrollLeft)+'px';
    button.style.top = ((cy-line.top)*ratioY-row.clientTop+row.scrollTop)+'px';
  }

  function position() {
    if (!open || !visible(button)) return;
    const edge = innerWidth < 600 ? 12 : 16;
    const frame = (composer || button).getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const left = innerWidth - edge - rect.width;
    const touchesComposer = left < frame.right + 6 && innerWidth - edge > frame.left
      && innerHeight - edge > frame.top && innerHeight - edge - rect.height < frame.bottom;
    const preferredBottom = touchesComposer ? Math.max(edge, innerHeight - frame.top + 8) : edge;
    card.style.right = edge + 'px';
    card.style.bottom = Math.max(edge, Math.min(preferredBottom,innerHeight - rect.height - edge)) + 'px';
  }

  function close(restoreFocus=false) {
    if (!open) return;
    open = false;
    showUsage = false;
    explainedKey = '';
    button.setAttribute('aria-expanded','false');
    card.hidden = true;
    if (restoreFocus) button.focus();
  }

  function sync() {
    const anchor = findModel();
    if (anchor) {
      placeButton(anchor);
    } else {
      close();
      if (button.isConnected) button.remove();
      releaseModel();
      toolbar?.removeAttribute('data-ag-context-position');
      resize.disconnect();
      observedBox = composer = toolbar = null;
    }
    const id = anchor ? conversationId() : null;
    if (id !== activeId) {
      activeId = id;
      data = null;
      signature = '';
      draw();
    }
    if (refreshQuota()) draw();
    if (open) position();
    return {id:activeId, mounted:visible(button) === true, pageVisible:document.visibilityState !== 'hidden', open, showUsage};
  }

  function update(id,payload) {
    const state = sync();
    if (!state.mounted || !activeId || id !== activeId || !payload) return state;
    const next = JSON.stringify(payload);
    if (next !== signature) {
      data = payload;
      signature = next;
      draw();
      position();
    }
    return state;
  }

  button.addEventListener('click', event => {
    event.stopPropagation();
    if (open) return close(true);
    sync();
    if (!visible(button)) return;
    open = true;
    button.setAttribute('aria-expanded','true');
    const rgb = getComputedStyle(button).color.match(/[\d.]+/g)?.slice(0,3).map(Number);
    card.dataset.theme = rgb?.length === 3 && rgb[0]*0.21+rgb[1]*0.72+rgb[2]*0.07 > 145 ? 'dark' : 'light';
    card.hidden = false;
    draw();
    position();
    card.focus({preventScroll:true});
    void requestQuota();
  });
  closeButton.addEventListener('click',() => close(true));
  document.addEventListener('pointerdown',e => { if (open && !card.contains(e.target) && !button.contains(e.target) && !e.target.closest?.('#aw-account-menu')) close(); },true);
  document.addEventListener('keydown',e => { if(open && e.key === 'Escape' && !e.target.closest?.('#aw-account-menu')){ e.preventDefault(); e.stopPropagation(); close(true); } },true);
  window.addEventListener('resize',position);
  window.addEventListener('scroll',position,true);
  let queued = false;
  function scheduleSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sync(); });
  }
  window.addEventListener('popstate',scheduleSync);
  window.navigation?.addEventListener('currententrychange',scheduleSync);
  const obs = new MutationObserver(records => {
    if (open && records.some(r=>r.target !== button && !card.contains(r.target))) scheduleSync();
  });
  obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-cascade-id','data-selected']});
  const resize = new ResizeObserver(scheduleSync);
  window.__agContextPanel = Object.freeze({get:sync,update});
  return sync();
})()
