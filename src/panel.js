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
    #ag-local-context-trigger .ag-status-dot {
      width:6px;height:6px;border-radius:50%;flex:none;margin-right:1px;
      background:#4285f4;opacity:.92;transition:background .2s ease
    }
    #ag-local-context-trigger .ag-status-dot[data-status="running"] {
      background:#4285f4;animation:ag-dot-pulse 1.4s ease-in-out infinite
    }
    #ag-local-context-trigger .ag-status-dot[data-status="waiting"] {
      background:#f9ab00;animation:ag-dot-pulse 2.2s ease-in-out infinite
    }
    #ag-local-context-trigger .ag-status-dot[data-status="error"] {
      background:#ea4335;animation:ag-dot-pulse 1.1s ease-in-out infinite
    }
    @keyframes ag-dot-pulse {0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.82)}}
    #ag-local-context-card .ag-head-left {display:inline-flex;align-items:center;gap:6px;min-width:0}
    #ag-local-context-card .ag-status-pill {
      display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;
      font-size:10px;font-weight:550;line-height:16px;white-space:nowrap;
      background:color-mix(in srgb,var(--ag-status-c,#4285f4) 13%,transparent);color:var(--ag-status-c,#4285f4)
    }
    #ag-local-context-card .ag-status-pill::before {
      content:"";width:5px;height:5px;border-radius:50%;background:currentColor;flex:none
    }
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
    #ag-local-context-card .ag-major.ag-major-quota {grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    #ag-local-context-card .ag-hero {display:flex;align-items:center;gap:12px;margin-top:7px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--ag-fill) 9%,var(--ag-surface))}
    #ag-local-context-card .ag-hero .ag-reading {padding:0;background:transparent!important;flex:none}
    #ag-local-context-card .ag-hero-meta {display:grid;gap:2px;min-width:0;flex:1;font-size:11px;color:var(--ag-muted)}
    #ag-local-context-card .ag-hero-meta b {color:var(--ag-fg);font-weight:600}
    #ag-local-context-card .ag-qstyle-bar {display:flex;align-items:center;justify-content:space-between;gap:6px;margin:5px 0 7px}
    #ag-local-context-card .ag-qpool-tag {display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--ag-fg);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ag-local-context-card .ag-qpool-dot {width:6px;height:6px;border-radius:50%;background:linear-gradient(135deg,#10b981,#3b82f6);flex:none}
    #ag-local-context-card .ag-qstyle-pills {display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:color-mix(in srgb,var(--ag-fg) 6%,transparent);flex:none}
    #ag-local-context-card .ag-qstyle-pills button {border:0;background:transparent;color:var(--ag-muted);border-radius:6px;padding:2px 6px;font:500 10px/15px inherit;cursor:pointer;transition:background-color .14s ease,color .14s ease}
    #ag-local-context-card .ag-qstyle-pills button[aria-pressed="true"] {background:var(--ag-surface);color:var(--ag-fg);box-shadow:0 1px 2px #0002}
    #ag-local-context-card .ag-qstack {display:grid;gap:7px}
    #ag-local-context-card .ag-qgrid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
    #ag-local-context-card .ag-qcard {
      font:inherit;color:var(--ag-fg);text-align:left;cursor:pointer;box-sizing:border-box;width:100%;
      border:1px solid color-mix(in srgb,var(--q-c) 24%,var(--ag-line));border-radius:11px;padding:8px 10px;
      background:color-mix(in srgb,var(--q-c) 7%,var(--ag-surface));transition:background-color .15s ease,border-color .15s ease
    }
    #ag-local-context-card .ag-qcard:hover,#ag-local-context-card .ag-qcard[aria-pressed="true"] {
      border-color:color-mix(in srgb,var(--q-c) 52%,var(--ag-line));
      background:color-mix(in srgb,var(--q-c) 11%,var(--ag-surface))
    }
    #ag-local-context-card .ag-qrow-head {display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-bottom:6px}
    #ag-local-context-card .ag-qrow-left {display:inline-flex;align-items:baseline;gap:6px}
    #ag-local-context-card .ag-qbadge {font-size:10px;font-weight:600;padding:1px 5px;border-radius:5px;background:color-mix(in srgb,var(--q-c) 16%,transparent);color:var(--q-c)}
    #ag-local-context-card .ag-qpct {font-size:14px;font-weight:700;letter-spacing:-.2px;color:var(--ag-fg)}
    #ag-local-context-card .ag-qsub {font-size:10px;color:var(--ag-muted);white-space:nowrap}
    #ag-local-context-card .ag-qsegs {display:grid;grid-template-columns:repeat(5,1fr);gap:4px}
    #ag-local-context-card .ag-qseg {height:6px;border-radius:3px;background:color-mix(in srgb,var(--ag-fg) 10%,transparent);overflow:hidden}
    #ag-local-context-card .ag-qseg-fill {height:100%;border-radius:3px;background:linear-gradient(90deg,var(--q-c),var(--q-c2))}
    #ag-local-context-card .ag-qdots {display:grid;grid-template-columns:repeat(20,1fr);gap:3px;align-items:center}
    #ag-local-context-card .ag-qdot {aspect-ratio:1;border-radius:50%;background:color-mix(in srgb,var(--ag-fg) 11%,transparent)}
    #ag-local-context-card .ag-qdot.on {background:linear-gradient(135deg,var(--q-c),var(--q-c2));box-shadow:0 0 4px color-mix(in srgb,var(--q-c) 45%,transparent)}
    #ag-local-context-card .ag-qring-card {display:flex;align-items:center;gap:8px;padding:9px 8px}
    #ag-local-context-card .ag-qring {width:36px;height:36px;border-radius:50%;flex:none;display:grid;place-items:center;background:conic-gradient(var(--q-c) var(--turn),color-mix(in srgb,var(--ag-fg) 12%,transparent) 0)}
    #ag-local-context-card .ag-qring span {width:26px;height:26px;border-radius:50%;background:var(--ag-surface)}
    #ag-local-context-card .ag-qring-meta {display:grid;gap:1px;min-width:0}
    #ag-local-context-card .ag-qgauge-card {display:flex;flex-direction:column;align-items:center;text-align:center;gap:2px;padding:8px 6px}
    #ag-local-context-card .ag-qgauge-svg {width:72px;height:40px;display:block;overflow:visible}
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
    #ag-local-context-card .ag-trend {margin-top:8px;padding-top:7px;border-top:1px solid var(--ag-line)}
    #ag-local-context-card .ag-trend-head {display:flex;align-items:center;justify-content:space-between;font-size:10.5px;color:var(--ag-muted);margin-bottom:4px}
    #ag-local-context-card .ag-trend-head b {color:var(--ag-fg);font-weight:550}
    #ag-local-context-card .ag-spark {display:block;width:100%;height:30px;overflow:visible}
    #ag-local-context-card .ag-empty {margin:7px 0 2px;color:var(--ag-muted)}
    .ag-pane-badge {
      display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:999px;
      font:500 10px/14px Roboto,"Helvetica Neue","PingFang SC",sans-serif;font-variant-numeric:tabular-nums;
      color:inherit;background:color-mix(in srgb,currentColor 7%,transparent);
      position:absolute;top:6px;right:10px;z-index:20;pointer-events:auto;user-select:none
    }
    .ag-pane-badge .ag-pane-dot {width:5px;height:5px;border-radius:50%;background:#4285f4;flex:none}
    .ag-pane-badge .ag-pane-dot[data-status="running"] {background:#4285f4;animation:ag-dot-pulse 1.4s ease-in-out infinite}
    .ag-pane-badge .ag-pane-dot[data-status="waiting"] {background:#f9ab00;animation:ag-dot-pulse 2.2s ease-in-out infinite}
    .ag-pane-badge .ag-pane-dot[data-status="error"] {background:#ea4335;animation:ag-dot-pulse 1.1s ease-in-out infinite}
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
  function miniDial(key,caption,kind,color,captionEn,kindEn,shortEn) {
    const mini = node('span');
    mini.className = 'ag-mini';
    mini.dataset.summaryRing = key;
    mini.style.setProperty('--ag-mini-color',color);
    const value = node('span','—');
    value.className = 'ag-mini-dial';
    const label = node('span');
    label.className = 'ag-mini-label';
    const shortZh = {capacity:'上下文',five:'5h',week:'周'}[key];
    label.dataset.short = shortZh;
    const capEl = node('span',caption), kindEl = node('small',kind);
    label.append(capEl,kindEl);
    mini.append(value,label);
    button.append(mini);
    return (percent,group='',overrideColor=color,isEn=false) => {
      const shown = num(percent) ? Number(percent.toFixed(1))+'%' : '—';
      if (value.textContent !== shown) {
        value.textContent = shown;
        mini.style.setProperty('--ag-mini-sweep', num(percent) ? Math.min(100,percent)+'%' : '0%');
      }
      const wantCap = isEn ? captionEn : caption;
      const wantKind = isEn ? kindEn : kind;
      const wantShort = isEn ? shortEn : shortZh;
      if (capEl.textContent !== wantCap) capEl.textContent = wantCap;
      if (kindEl.textContent !== wantKind) kindEl.textContent = wantKind;
      if (label.dataset.short !== wantShort) label.dataset.short = wantShort;
      if (key==='capacity') mini.toggleAttribute('data-aw-warning',num(percent) && percent>=75);
      if (mini.style.getPropertyValue('--ag-mini-color') !== overrideColor) mini.style.setProperty('--ag-mini-color',overrideColor);
      const help=(group ? group+' · ' : '')+wantCap+(isEn?' ':'')+wantKind+' '+shown;
      if (mini.title !== help) mini.title = help;
      return help;
    };
  }
  const statusDot = node('span');
  statusDot.className = 'ag-status-dot';
  statusDot.dataset.status = 'ready';
  statusDot.setAttribute('aria-hidden', 'true');
  button.append(statusDot);
  const miniContext = miniDial('capacity','上下文','占用','#4285f4','Context','Used','Ctx');
  const miniFive = miniDial('five','5小时','剩余','#34a853','5h','Left','5h');
  const miniWeek = miniDial('week','每周','剩余','#fbbc04','Week','Left','Wk');
  const card = node('section');
  card.id = 'ag-local-context-card';
  card.tabIndex = -1;
  card.setAttribute('role','dialog');
  card.setAttribute('aria-label','上下文统计');
  card.hidden = true;
  const top = node('header');
  const headLeft = styled('div','ag-head-left');
  const closeButton = node('button','×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label','关闭统计面板');
  closeButton.className = 'ag-close';
  const headerTitle = node('strong','用量与额度');
  const statusPill = styled('span','ag-status-pill','就绪');
  headLeft.append(headerTitle,statusPill);
  top.append(headLeft,closeButton);
  const details = node('div');
  details.className = 'ag-body';
  let activeTab='overview';
  let quotaStyle = (() => {
    try { const v = localStorage.getItem('ag-local-quota-style'); return ['segments','rings','gauge','dots'].includes(v) ? v : 'segments'; }
    catch { return 'segments'; }
  })();
  function setQuotaStyle(next) {
    if (!['segments','rings','gauge','dots'].includes(next) || next === quotaStyle) return;
    quotaStyle = next;
    try { localStorage.setItem('ag-local-quota-style', next); } catch {}
    draw(); position();
  }
  const views=styled('div','ag-view-switch');
  views.setAttribute('role','group'); views.setAttribute('aria-label','统计视图');
  const overview=node('button','概览'), breakdown=node('button','明细'), quotaTab=node('button','额度');
  const tabPairs=[[overview,'overview'],[breakdown,'usage'],[quotaTab,'quota']];
  for (const [b, key] of tabPairs) {
    b.type='button'; b.dataset.agTab=key; b.setAttribute('aria-pressed',String(key===activeTab));
    b.addEventListener('click',()=>{
      activeTab=key; explainedKey='';
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
      if (g.streamOut > 0 && g.streamSec > 0) line(box,'平均生成速度',(g.streamOut/g.streamSec).toFixed(1)+' tok/s',
        '已记录流式输出总量除以流式生成总时长。');
    }
    const fmtUsd = v => !Number.isFinite(v) ? '—' : v < 0.001 ? '<$0.001' : '$' + v.toFixed(v >= 1 ? 2 : 3);
    const current=usage.turns[0];
    const round=section(current?'本轮 · 第 '+current.number+' 轮':'本轮');
    if (current?.calls) {
      summary(round,current);
      if (usage.cost?.turn) {
        line(round,'等效 API 费用（参考）',fmtUsd(usage.cost.turn.totalUsd) + (usage.cost.turn.savedUsd > 0 ? '（缓存省 ' + fmtUsd(usage.cost.turn.savedUsd) + '）' : ''),
          '按本地静态参考单价估算，仅作相对消耗参考，非真实账单。');
      }
    }
    else round.append(note('本轮尚无可归属的模型调用。'));
    const session=section((usage.partial?'已读取记录小计':'会话累计')+' · '+fmt(usage.turnCount)+' 轮');
    summary(session,usage.session);
    if (usage.cost?.session) {
      line(session,'等效 API 费用（参考）',fmtUsd(usage.cost.session.totalUsd) + (usage.cost.session.savedUsd > 0 ? '（缓存省 ' + fmtUsd(usage.cost.session.savedUsd) + '）' : ''),
        '按本地静态参考单价估算，仅作相对消耗参考，非真实账单。');
    }
    if (usage.subagentSteps > 0) {
      line(session,'子代理 / Swarm 派发',fmt(usage.subagentSteps)+' 次',
        '当前会话中触发子轨迹（Subagent / Swarm）的步骤次数。');
    }
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

  function formatSessionStatus(raw, isEn) {
    const st = raw?.state || 'ready';
    const kind = raw?.kind || 'idle';
    const sec = Number.isFinite(raw?.elapsedSec) && raw.elapsedSec > 0 ? raw.elapsedSec : 0;
    if (st === 'error') {
      return { state: 'error', color: '#ea4335', label: isEn ? 'Error' : '执行异常' };
    }
    if (st === 'waiting') {
      const waitTxt = sec ? (isEn ? `Waiting ${sec}s` : `等待响应 ${sec}s`) : (isEn ? 'Waiting' : '等待响应');
      return { state: 'waiting', color: '#f9ab00', label: kind === 'compacting' ? (isEn ? `Compacting ${sec}s` : `压缩中 ${sec}s`) : waitTxt };
    }
    if (st === 'running') {
      return { state: 'running', color: '#4285f4', label: kind === 'compacting' ? (isEn ? 'Compacting' : '压缩上下文中') : (isEn ? 'Running' : '执行中') };
    }
    return { state: 'ready', color: '#4285f4', label: isEn ? 'Ready' : '就绪' };
  }

  function draw() {
    const ready = data?.state === 'ready';
    const isEn = window.__agLocalZhControl?.getLang?.() === 'en';
    const sess = formatSessionStatus(activeId ? data?.sessionStatus : null, isEn);
    if (statusDot.dataset.status !== sess.state) statusDot.dataset.status = sess.state;
    const dotTitle = (isEn ? 'Session: ' : '会话状态：') + sess.label;
    if (statusDot.title !== dotTitle) statusDot.title = dotTitle;
    if (statusPill.textContent !== sess.label) statusPill.textContent = sess.label;
    if (statusPill.style.getPropertyValue('--ag-status-c') !== sess.color) statusPill.style.setProperty('--ag-status-c', sess.color);
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
      miniContext(used,'',color === 'var(--ag-fill)' ? '#4285f4' : color,isEn),
      miniFive(five.value,group,'#34a853',isEn),miniWeek(week.value,group,'#fbbc04',isEn)
    ].join(isEn ? ', ' : '，');
    if (button.getAttribute('aria-description') !== description) button.setAttribute('aria-description',description);
    const ovText = isEn ? 'Overview' : '概览', brText = isEn ? 'Breakdown' : '明细', qtText = isEn ? 'Quota' : '额度';
    if (overview.textContent !== ovText) overview.textContent = ovText;
    if (breakdown.textContent !== brText) breakdown.textContent = brText;
    if (quotaTab.textContent !== qtText) quotaTab.textContent = qtText;
    const wantTitle = isEn ? 'Usage & CLI Quota' : '用量与额度';
    if (headerTitle.textContent !== wantTitle) headerTitle.textContent = wantTitle;
    if (!open) return;
    overview.setAttribute('aria-pressed',String(activeTab==='overview'));
    breakdown.setAttribute('aria-pressed',String(activeTab==='usage'));
    quotaTab.setAttribute('aria-pressed',String(activeTab==='quota'));
    if (activeTab==='usage') { drawUsage(); return; }
    const focusKey = details.contains(document.activeElement) ? document.activeElement.dataset.agChart : '';
    const focusPicker = document.activeElement?.classList.contains('ag-select');
    const focusSync = document.activeElement?.classList.contains('ag-sync');
    details.replaceChildren();
    function quotaPalette(period, value) {
      if (num(value) && value <= 10) return ['#ef4444', '#f87171'];
      if (num(value) && value <= 25) return ['#f59e0b', '#fbbf24'];
      return period === 'five' ? ['#10b981', '#34d399'] : ['#3b82f6', '#38bdf8'];
    }
    function quotaMeta(period, name, reading) {
      const { value, resetAt } = reading;
      const rw = window.__agQuotaSummary?.get?.()?.runway;
      const rwH = period === 'five' ? rw?.fiveHours : rw?.weekHours;
      const rwTxt = Number.isFinite(rwH) ? (isEn ? `~${rwH}h left at current pace. ` : `按当前速率约可用 ${rwH} 小时。`) : '';
      const hint = group ? (isEn ? `${group} ${name} quota. ` : `${group}的${name}额度。`) : (groups.length ? (isEn ? 'Select a quota group. ' : '选择额度模型组。') : (isEn ? 'Waiting for quota. ' : '等待后台读取额度。'));
      const explanation = hint + (num(value) ? (isEn ? `Remaining ${Number(value.toFixed(1))}%. ` : `上次读取的剩余额度为 ${Number(value.toFixed(1))}%。`) : (isEn ? 'No confirmed percentage yet. ' : '尚无可确认的剩余百分比。'))
        + rwTxt + (resetAt ? (isEn ? `Resets ${readTime(resetAt)}.` : `下次重置时间（本地）${readTime(resetAt)}。`) : '');
      const sub = Number.isFinite(rwH) ? (isEn ? `~${rwH}h left` : `约可用 ${rwH}h`) : resetCountdown(resetAt, now);
      const pctNum = num(value) ? Math.max(0, Math.min(100, value)) : 0;
      const pctTxt = num(value) ? Number(value.toFixed(1)) + '%' : '—';
      const [c1, c2] = quotaPalette(period, value);
      return { key: 'quota-' + period, tag: period === 'five' ? '5h' : (isEn ? '7d' : '周'), name, pctNum, pctTxt, hasVal: num(value), sub, explanation, c1, c2 };
    }
    function buildQuotaCard(meta) {
      const cardBtn = styled('button', 'ag-qcard');
      cardBtn.type = 'button';
      cardBtn.dataset.agChart = meta.key;
      cardBtn.title = meta.explanation;
      cardBtn.setAttribute('aria-pressed', String(explainedKey === meta.key));
      cardBtn.style.setProperty('--q-c', meta.c1);
      cardBtn.style.setProperty('--q-c2', meta.c2);
      if (quotaStyle === 'segments' || quotaStyle === 'dots') {
        const head = styled('div', 'ag-qrow-head');
        const left = styled('span', 'ag-qrow-left');
        left.append(styled('span', 'ag-qbadge', meta.tag), styled('span', 'ag-qpct', meta.pctTxt));
        head.append(left, styled('span', 'ag-qsub', meta.sub));
        cardBtn.append(head);
        if (quotaStyle === 'segments') {
          const segs = styled('div', 'ag-qsegs');
          for (let i = 0; i < 5; i++) {
            const seg = styled('span', 'ag-qseg');
            const fillPct = meta.hasVal ? Math.max(0, Math.min(100, (meta.pctNum - i * 20) * 5)) : 0;
            const fill = styled('div', 'ag-qseg-fill');
            fill.style.width = fillPct + '%';
            seg.append(fill);
            segs.append(seg);
          }
          cardBtn.append(segs);
        } else {
          const dots = styled('div', 'ag-qdots');
          const lit = meta.hasVal ? Math.round(meta.pctNum / 5) : 0;
          for (let i = 0; i < 20; i++) {
            dots.append(styled('span', i < lit ? 'ag-qdot on' : 'ag-qdot'));
          }
          cardBtn.append(dots);
        }
      } else if (quotaStyle === 'rings') {
        cardBtn.classList.add('ag-qring-card');
        const ring = styled('span', 'ag-qring');
        ring.style.setProperty('--turn', (meta.hasVal ? meta.pctNum : 0) + '%');
        ring.append(node('span'));
        const info = styled('span', 'ag-qring-meta');
        const topRow = styled('span', 'ag-qrow-left');
        topRow.append(styled('span', 'ag-qbadge', meta.tag), styled('span', 'ag-qpct', meta.pctTxt));
        info.append(topRow, styled('span', 'ag-qsub', meta.sub));
        cardBtn.append(ring, info);
      } else {
        cardBtn.classList.add('ag-qgauge-card');
        const svgNs = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('class', 'ag-qgauge-svg');
        svg.setAttribute('viewBox', '0 0 72 40');
        svg.setAttribute('aria-hidden', 'true');
        const bg = document.createElementNS(svgNs, 'path');
        bg.setAttribute('d', 'M 8 36 A 28 28 0 0 1 64 36');
        bg.setAttribute('fill', 'none');
        bg.setAttribute('stroke', 'currentColor');
        bg.setAttribute('stroke-opacity', '0.14');
        bg.setAttribute('stroke-width', '5');
        bg.setAttribute('stroke-linecap', 'round');
        const fg = document.createElementNS(svgNs, 'path');
        fg.setAttribute('d', 'M 8 36 A 28 28 0 0 1 64 36');
        fg.setAttribute('fill', 'none');
        fg.setAttribute('stroke', meta.c1);
        fg.setAttribute('stroke-width', '5');
        fg.setAttribute('stroke-linecap', 'round');
        const arcLen = Math.PI * 28;
        const dash = meta.hasVal ? (arcLen * meta.pctNum) / 100 : 0;
        fg.setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${arcLen.toFixed(1)}`);
        svg.append(bg, fg);
        const topRow = styled('span', 'ag-qrow-left');
        topRow.append(styled('span', 'ag-qbadge', meta.tag), styled('span', 'ag-qpct', meta.pctTxt));
        cardBtn.append(svg, topRow, styled('span', 'ag-qsub', meta.sub));
      }
      return cardBtn;
    }
    if (activeTab==='quota') {
      const styleBar = styled('div', 'ag-qstyle-bar');
      const poolTag = styled('span', 'ag-qpool-tag');
      poolTag.append(styled('span', 'ag-qpool-dot'), node('span', group || (isEn ? 'CLI Quota Pool' : 'CLI 额度池')));
      const pills = styled('div', 'ag-qstyle-pills');
      pills.setAttribute('role', 'group');
      pills.setAttribute('aria-label', isEn ? 'Quota style' : '额度图形样式');
      const styleDefs = isEn
        ? [['segments','Seg'],['rings','Ring'],['gauge','Gauge'],['dots','Dots']]
        : [['segments','分段'],['rings','双环'],['gauge','仪表'],['dots','点阵']];
      for (const [key, label] of styleDefs) {
        const b = node('button', label);
        b.type = 'button';
        b.dataset.agQstyle = key;
        b.setAttribute('aria-pressed', String(quotaStyle === key));
        pills.append(b);
      }
      styleBar.append(poolTag, pills);
      details.append(styleBar);

      const m5 = quotaMeta('five', isEn ? '5h' : '5 小时', five);
      const m7 = quotaMeta('week', isEn ? 'Weekly' : '每周', week);
      const box = styled('div', (quotaStyle === 'rings' || quotaStyle === 'gauge') ? 'ag-qgrid' : 'ag-qstack');
      box.append(buildQuotaCard(m5), buildQuotaCard(m7));
      details.append(box);
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
      if (explainedKey) {
        const active = [...details.querySelectorAll('[data-ag-chart]')].find(b=>b.dataset.agChart===explainedKey);
        if (active) details.append(styled('p','ag-explain',active.title));
      }
      if (focusKey) [...details.querySelectorAll('[data-ag-chart]')].find(e=>e.dataset.agChart===focusKey)?.focus({preventScroll:true});
      if (focusPicker) details.querySelector('.ag-select')?.focus({preventScroll:true});
      if (focusSync) details.querySelector('.ag-sync')?.focus({preventScroll:true});
      return;
    }
    const hero = styled('div','ag-hero');
    const remaining = num(data?.context) && num(data?.limit) && data.limit > 0 ? Math.max(0,data.limit-data.context) : null;
    const contextHelp = '已用 ' + token(data?.context) + '，模型上限 ' + token(data?.limit) + '，剩余 ' + token(remaining) + '。';
    hero.append(dial('capacity',isEn?'Context':'上下文已用',used,'',color, contextHelp));
    const heroMeta = styled('div','ag-hero-meta');
    const metaLine = (k, v) => { const r = node('div'); r.append(node('span', k + '：'), node('b', v)); return r; };
    heroMeta.append(
      metaLine(isEn?'Used':'已用上下文', token(data?.context)),
      metaLine(isEn?'Limit':'模型上限', token(data?.limit)),
      metaLine(isEn?'Remaining':'剩余可用', token(remaining))
    );
    hero.append(heroMeta);
    details.append(hero);
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
      const pts = Array.isArray(data.history) ? data.history.filter(h => num(h?.context)) : [];
      if (pts.length >= 2) {
        const trend = styled('div','ag-trend');
        const head = styled('div','ag-trend-head');
        const firstCtx = pts[0].context, lastCtx = pts[pts.length - 1].context;
        const delta = lastCtx - firstCtx;
        const deltaTxt = (delta >= 0 ? '+' : '') + fmt(delta);
        head.append(
          node('span', isEn ? `Context trend (${pts.length} calls)` : `上下文趋势（近 ${pts.length} 次调用）`),
          node('b', deltaTxt + ' tok')
        );
        const w = 260, h = 28, pad = 2;
        const maxVal = Math.max(...pts.map(p => p.context), num(data.limit) ? data.limit * 0.15 : 1, 1);
        const minVal = Math.min(...pts.map(p => p.context));
        const span = Math.max(maxVal - minVal, 1);
        const coords = pts.map((p, i) => {
          const x = pad + (i / (pts.length - 1)) * (w - pad * 2);
          const y = h - pad - ((p.context - minVal) / span) * (h - pad * 2);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(' ');
        const svgNs = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNs, 'svg');
        svg.setAttribute('class', 'ag-spark');
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.setAttribute('aria-hidden', 'true');
        const lineEl = document.createElementNS(svgNs, 'polyline');
        lineEl.setAttribute('fill', 'none');
        lineEl.setAttribute('stroke', color);
        lineEl.setAttribute('stroke-width', '1.8');
        lineEl.setAttribute('stroke-linecap', 'round');
        lineEl.setAttribute('stroke-linejoin', 'round');
        lineEl.setAttribute('points', coords);
        svg.append(lineEl);
        trend.append(head, svg);
        details.append(trend);
      }
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
    const qStyleBtn = e.target.closest?.('button[data-ag-qstyle]');
    if (qStyleBtn) {
      setQuotaStyle(qStyleBtn.dataset.agQstyle);
      return;
    }
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
    activeTab = 'overview';
    explainedKey = '';
    button.setAttribute('aria-expanded','false');
    card.hidden = true;
    if (restoreFocus) button.focus();
  }

  const paneBadges = new Map();
  function collectSecondaryPanes() {
    const found = new Map();
    const candidates = [
      ...document.querySelectorAll('[data-testid="conversation-view"][data-cascade-id]'),
      ...document.querySelectorAll('[data-testid="side-question-tab-content"][data-cascade-id]')
    ];
    for (const el of candidates) {
      if (!visible(el)) continue;
      const cid = canonical(el.dataset.cascadeId);
      if (!cid || cid === activeId || found.has(cid)) continue;
      found.set(cid, el);
      if (found.size >= 4) break;
    }
    for (const [cid, badge] of paneBadges) {
      if (!found.has(cid)) { badge.remove(); paneBadges.delete(cid); }
    }
    return found;
  }

  function updateSecondaryBadges(secondaryMap) {
    const panes = collectSecondaryPanes();
    const isEn = window.__agLocalZhControl?.getLang?.() === 'en';
    for (const [cid, container] of panes) {
      let badge = paneBadges.get(cid);
      if (!badge) {
        badge = styled('span', 'ag-pane-badge');
        badge.dataset.awOwned = '';
        const dot = styled('span', 'ag-pane-dot');
        const txt = node('span', '—');
        badge.append(dot, txt);
        paneBadges.set(cid, badge);
      }
      if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
      if (badge.parentElement !== container) container.append(badge);
      const m = secondaryMap?.[cid];
      const sess = formatSessionStatus(m?.sessionStatus, isEn);
      const pct = m?.state === 'ready' ? portion(m.context, m.limit) : null;
      const dot = badge.firstElementChild;
      const txt = badge.lastElementChild;
      if (dot.dataset.status !== sess.state) dot.dataset.status = sess.state;
      const label = (isEn ? 'Ctx ' : '上下文 ') + (num(pct) ? Number(pct.toFixed(1)) + '%' : '—');
      if (txt.textContent !== label) txt.textContent = label;
      badge.title = `${sess.label} · ${token(m?.context)} / ${token(m?.limit)}`;
    }
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
    const secondaryIds = [...collectSecondaryPanes().keys()];
    const modelName = (anchor?.textContent || '').trim().slice(0, 80);
    return {id:activeId, modelName, secondaryIds, tab:activeTab, mounted:visible(button) === true, pageVisible:document.visibilityState !== 'hidden', open, showUsage:activeTab==='usage'};
  }

  function update(id,payload,secondaryMap) {
    const state = sync();
    if (secondaryMap) updateSecondaryBadges(secondaryMap);
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

  function openTab(tab = 'overview') {
    const target = ['overview', 'usage', 'quota'].includes(tab) ? tab : 'overview';
    sync();
    if (!visible(button)) return false;
    if (open && activeTab === target) { close(true); return true; }
    activeTab = target;
    explainedKey = '';
    open = true;
    button.setAttribute('aria-expanded','true');
    const rgb = getComputedStyle(button).color.match(/[\d.]+/g)?.slice(0,3).map(Number);
    card.dataset.theme = rgb?.length === 3 && rgb[0]*0.21+rgb[1]*0.72+rgb[2]*0.07 > 145 ? 'dark' : 'light';
    card.hidden = false;
    draw();
    position();
    card.focus({preventScroll:true});
    void requestQuota();
    return true;
  }

  button.addEventListener('click', event => {
    event.stopPropagation();
    const ringKey = event.target?.closest?.('[data-summary-ring]')?.dataset?.summaryRing;
    const wantTab = ringKey === 'five' || ringKey === 'week' ? 'quota' : 'overview';
    openTab(wantTab);
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
  window.__agContextPanel = Object.freeze({get:sync,update,openTab});
  return sync();
})()
