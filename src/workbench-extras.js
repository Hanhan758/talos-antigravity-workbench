((initialSnippets, initialSendShortcut) => {
  'use strict';
  if (window !== window.top || !document.body || location.protocol !== 'https:' || location.hostname !== '127.0.0.1' ||
      !location.port || typeof window.electronNative?.getZoomLevel !== 'function' ||
      typeof window.electronNative?.setTitleBarOverlay !== 'function') return null;
  if (window.__agWorkbenchExtras) return { mounted: true };

  const sideDeny = '[data-testid="side-question-tab-content"],[data-testid="side-question-tab-composer"],[data-aw-owned]';
  const vis = el => !!(el?.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const isEn = () => window.__agLocalZhControl?.getLang?.() === 'en';

  const style = node('style');
  style.id = 'ag-workbench-extras-style';
  style.textContent = `
    #ag-outline-rail {
      position:fixed;right:10px;top:50%;transform:translateY(-50%);z-index:2147483640;
      display:flex;flex-direction:column;align-items:flex-end;gap:5px;padding:6px 4px;
      border-radius:12px;transition:background-color .16s ease
    }
    #ag-outline-rail[hidden] {display:none!important}
    #ag-outline-rail:hover {background:color-mix(in srgb,var(--aw-panel,Canvas) 88%,transparent);box-shadow:0 4px 16px #0002;border:1px solid var(--aw-line,#d8dce2)}
    #ag-outline-rail .ag-ol-item {
      display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;cursor:pointer;
      padding:2px 4px;border-radius:6px;color:var(--aw-ink,inherit);font:400 11px/1.35 -apple-system,"PingFang SC",sans-serif;max-width:210px
    }
    #ag-outline-rail .ag-ol-item:hover {background:color-mix(in srgb,var(--aw-accent,#4285f4) 12%,transparent)}
    #ag-outline-rail .ag-ol-text {display:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right}
    #ag-outline-rail:hover .ag-ol-text {display:inline-block}
    #ag-outline-rail .ag-ol-dot {width:7px;height:7px;border-radius:50%;flex:none;background:color-mix(in srgb,var(--aw-accent,#4285f4) 45%,transparent);transition:transform .14s ease,background-color .14s ease}
    #ag-outline-rail .ag-ol-item:hover .ag-ol-dot {transform:scale(1.3);background:var(--aw-accent,#4285f4)}
    [data-ag-ol-flash] {outline:2px solid var(--aw-accent,#4285f4)!important;outline-offset:4px;border-radius:8px;transition:outline-color .4s ease}
    #ag-snippet-btn {
      position:fixed;right:14px;bottom:14px;z-index:2147483641;width:28px;height:28px;border-radius:50%;
      border:1px solid var(--aw-line,#d8dce2);background:var(--aw-panel,Canvas);color:var(--aw-ink,CanvasText);
      display:grid;place-items:center;cursor:pointer;font:600 12px/1 -apple-system,sans-serif;
      box-shadow:0 2px 8px #0002;opacity:.76;transition:opacity .15s ease,transform .15s ease
    }
    #ag-snippet-btn:hover,#ag-snippet-btn[aria-expanded="true"] {opacity:1;transform:translateY(-1px)}
    #ag-snippet-drawer {
      position:fixed;right:16px;bottom:52px;z-index:2147483645;width:min(300px,calc(100vw - 24px));
      max-height:min(360px,calc(100vh - 80px));display:flex;flex-direction:column;gap:6px;
      padding:10px;border-radius:14px;border:1px solid var(--aw-line,#d8dce2);
      background:var(--aw-panel,Canvas);color:var(--aw-ink,CanvasText);
      box-shadow:0 6px 24px #0003;font:400 12px/1.4 -apple-system,"PingFang SC",sans-serif
    }
    #ag-snippet-drawer[hidden] {display:none!important}
    #ag-snippet-drawer .ag-sn-head {display:flex;align-items:center;justify-content:space-between;font-weight:600;font-size:12px}
    #ag-snippet-drawer .ag-sn-hint {font-size:10px;color:var(--aw-soft,#686d75);font-weight:400}
    #ag-snippet-drawer .ag-sn-search {width:100%;box-sizing:border-box;padding:5px 8px;border-radius:7px;border:1px solid var(--aw-line,#d8dce2);background:transparent;color:inherit;font:inherit}
    #ag-snippet-drawer .ag-sn-list {display:grid;gap:4px;overflow:auto;max-height:240px}
    #ag-snippet-drawer .ag-sn-item {
      border:1px solid transparent;border-radius:8px;padding:6px 8px;background:color-mix(in srgb,currentColor 4%,transparent);
      text-align:left;cursor:pointer;color:inherit;display:grid;gap:2px;font:inherit
    }
    #ag-snippet-drawer .ag-sn-item:hover {border-color:color-mix(in srgb,var(--aw-accent,#4285f4) 45%,transparent);background:color-mix(in srgb,var(--aw-accent,#4285f4) 10%,transparent)}
    #ag-snippet-drawer .ag-sn-item b {font-size:11.5px;font-weight:600}
    #ag-snippet-drawer .ag-sn-item small {font-size:10.5px;color:var(--aw-soft,#686d75);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  `;
  document.head.append(style);

  // 1. 长对话悬浮目录（Outline）
  const rail = node('nav');
  rail.id = 'ag-outline-rail';
  rail.dataset.awOwned = '';
  rail.hidden = true;
  rail.setAttribute('aria-label', '对话轮次目录');
  document.body.append(rail);
  let lastOutlineSig = '';

  function collectTurns() {
    const raw = [...document.querySelectorAll('[data-testid="user-message-content"], .agy-user-bubble')]
      .filter(el => vis(el) && !el.closest(sideDeny));
    const unique = [];
    for (const el of raw) {
      if (unique.some(u => u.contains(el) || el.contains(u))) continue;
      const text = clean(el.textContent);
      if (!text) continue;
      unique.push(el);
    }
    return unique;
  }

  function refreshOutline() {
    const turns = collectTurns();
    if (turns.length < 2) {
      rail.hidden = true;
      lastOutlineSig = '';
      return;
    }
    const items = turns.slice(-24).map((el, idx) => ({
      el,
      num: turns.length > 24 ? (turns.length - 24 + idx + 1) : (idx + 1),
      label: clean(el.textContent).slice(0, 26)
    }));
    const sig = items.map(i => i.num + ':' + i.label).join('|');
    rail.hidden = false;
    if (sig === lastOutlineSig) return;
    lastOutlineSig = sig;
    rail.replaceChildren();
    for (const item of items) {
      const btn = node('button', 'ag-ol-item');
      btn.type = 'button';
      btn.title = `#${item.num} ${item.label}`;
      btn.append(node('span', 'ag-ol-text', `#${item.num} ${item.label}`), node('span', 'ag-ol-dot'));
      btn.addEventListener('click', () => {
        if (!item.el.isConnected) return;
        item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        item.el.setAttribute('data-ag-ol-flash', '');
        setTimeout(() => item.el.removeAttribute('data-ag-ol-flash'), 1200);
      });
      rail.append(btn);
    }
  }

  // 2. 本地 Prompt 片段抽屉（Cmd+Shift+/ 或按钮呼出）
  let snippets = Array.isArray(initialSnippets) ? initialSnippets : [];
  const snBtn = node('button', '', '⌘/');
  snBtn.id = 'ag-snippet-btn';
  snBtn.type = 'button';
  snBtn.dataset.awOwned = '';
  snBtn.setAttribute('aria-expanded', 'false');
  snBtn.title = 'Prompt 片段抽屉 (Cmd+Shift+/)';
  document.body.append(snBtn);

  const drawer = node('section');
  drawer.id = 'ag-snippet-drawer';
  drawer.dataset.awOwned = '';
  drawer.hidden = true;
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Prompt 片段');
  const snHead = node('div', 'ag-sn-head');
  const snTitle = node('span', '', 'Prompt 片段');
  const snHint = node('span', 'ag-sn-hint', 'user/snippets.json');
  snHead.append(snTitle, snHint);
  const snSearch = node('input', 'ag-sn-search');
  snSearch.type = 'search';
  snSearch.placeholder = '搜索片段…';
  const snList = node('div', 'ag-sn-list');
  drawer.append(snHead, snSearch, snList);
  document.body.append(drawer);

  function insertIntoComposer(text) {
    const editor = document.querySelector('[id="antigravity.agentSidePanelInputBox"] [data-lexical-editor="true"]') ||
      document.querySelector('[contenteditable="true"]:not([data-aw-owned])');
    if (!editor) return false;
    editor.focus();
    try {
      document.execCommand('insertText', false, text);
      return true;
    } catch {
      return false;
    }
  }

  function renderSnippets() {
    const en = isEn();
    snTitle.textContent = en ? 'Prompt Snippets' : 'Prompt 片段';
    snSearch.placeholder = en ? 'Filter snippets…' : '搜索片段…';
    snBtn.title = en ? 'Prompt Snippets (Cmd+Shift+/)' : 'Prompt 片段抽屉 (Cmd+Shift+/)';
    const q = clean(snSearch.value).toLowerCase();
    const filtered = snippets.filter(s => !q || s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q));
    snList.replaceChildren();
    if (!filtered.length) {
      snList.append(node('small', 'ag-sn-hint', en ? 'No matching snippets.' : '暂无匹配片段。'));
      return;
    }
    for (const s of filtered) {
      const btn = node('button', 'ag-sn-item');
      btn.type = 'button';
      btn.append(node('b', '', s.title), node('small', '', s.text));
      btn.addEventListener('click', () => {
        drawer.hidden = true;
        snBtn.setAttribute('aria-expanded', 'false');
        insertIntoComposer(s.text);
      });
      snList.append(btn);
    }
  }

  function toggleDrawer(force) {
    const next = typeof force === 'boolean' ? force : drawer.hidden;
    drawer.hidden = !next;
    snBtn.setAttribute('aria-expanded', String(next));
    if (next) {
      snSearch.value = '';
      renderSnippets();
      snSearch.focus();
    }
  }

  snBtn.addEventListener('click', e => { e.stopPropagation(); toggleDrawer(); });
  snSearch.addEventListener('input', renderSnippets);
  snSearch.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); toggleDrawer(false); }
    else if (e.key === 'Enter') {
      const first = snList.querySelector('.ag-sn-item');
      if (first) { e.preventDefault(); first.click(); }
    }
  });
  document.addEventListener('pointerdown', e => {
    if (!drawer.hidden && !drawer.contains(e.target) && !snBtn.contains(e.target)) toggleDrawer(false);
  }, true);

  // 3. 防误发快捷键拦截（Cmd+Enter 发送 / Enter 换行）与全局 Cmd+Shift+/ 呼出片段
  let sendMode = initialSendShortcut === 'cmd-enter' ? 'cmd-enter' : 'enter';
  document.addEventListener('keydown', e => {
    if (e.metaKey && e.shiftKey && (e.key === '/' || e.key === '?')) {
      e.preventDefault();
      e.stopPropagation();
      toggleDrawer();
      return;
    }
    if (sendMode !== 'cmd-enter' || e.isComposing) return;
    const editor = e.target?.closest?.('[id="antigravity.agentSidePanelInputBox"] [data-lexical-editor="true"]');
    if (!editor || e.key !== 'Enter') return;
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      try { document.execCommand('insertLineBreak'); } catch {}
    } else if (e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const sendBtn = document.querySelector('button[data-testid="send-button"]:not(:disabled), button.agy-send-button:not(:disabled)');
      if (sendBtn) sendBtn.click();
    }
  }, true);

  let outlineTimer = null;
  const obs = new MutationObserver(() => {
    if (outlineTimer) return;
    outlineTimer = setTimeout(() => { outlineTimer = null; refreshOutline(); }, 450);
  });
  obs.observe(document.body, { childList: true, subtree: true });
  refreshOutline();

  window.__agWorkbenchExtras = Object.freeze({
    setSnippets(next) {
      if (Array.isArray(next)) { snippets = next; if (!drawer.hidden) renderSnippets(); }
      return true;
    },
    setSendShortcut(next) {
      sendMode = next === 'cmd-enter' ? 'cmd-enter' : 'enter';
      return sendMode;
    },
    getStatus: () => ({ outlineTurns: collectTurns().length, snippetsCount: snippets.length, sendMode })
  });
  return { mounted: true };
})(__AG_INITIAL_SNIPPETS__, __AG_INITIAL_SEND_SHORTCUT__)
