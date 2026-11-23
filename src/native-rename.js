(() => {
  'use strict';
  if (window !== window.top || location.protocol !== 'https:' || location.hostname !== '127.0.0.1' ||
      !location.port || location.username || location.password ||
      typeof window.electronNative?.getZoomLevel !== 'function' ||
      typeof window.electronNative?.setTitleBarOverlay !== 'function') return false;
  if (window.__agNativeRename) return true;

  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const rowSel = '[data-testid="conversation-row-sidebar"][data-cascade-id]';
  const inlineSel = '[data-testid="inline-edit-input"]';
  const modalInput = '[data-testid="rename-conversation-input"]';
  const segmentSel = '[data-testid="breadcrumb-segment"]';
  const viewSel = '[data-testid="conversation-view"][data-cascade-id]';
  const foreign = '[data-testid="side-question-tab-content"],[data-testid="subagent-node"],[data-markdown-root],.prose,.markdown,[data-testid="user-message-content"]';
  const visible = el => !!el?.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
  const manual = new Set();
  let busy = false;

  function currentId() {
    const route = location.pathname.match(/(?:^|\/)c\/([0-9a-f-]{36})(?:\/|$)/i)?.[1]?.toLowerCase();
    const body = [...document.querySelectorAll(viewSel)].find(el=>!el.closest(foreign) && visible(el));
    const view = body?.dataset.cascadeId?.toLowerCase();
    if (route && uuid.test(route)) return view && uuid.test(view) && route !== view ? null : route;
    return uuid.test(view || '') ? view : null;
  }
  function hasAccessibleTitle(el, title) {
    // 侧栏通常直接使用标题。面包屑的无障碍名称还会添加“Conversation:”说明前缀。
    // 只对已知标题做整串匹配，不剥掉用户标题本身可能含有的同名字首。
    return ['data-ag-orig-aria-label','aria-label'].some(attr => {
      const value = el?.getAttribute(attr)?.trim();
      return value === title || (value && /^(?:Conversation|对话|会话)\s*[:：]\s*/i.test(value) &&
        value.replace(/^(?:Conversation|对话|会话)\s*[:：]\s*/i,'') === title);
    });
  }
  function rowTarget(id) {
    if (!uuid.test(id || '') || id !== currentId()) return null;
    const row = [...document.querySelectorAll(rowSel)].find(el=>el.dataset.cascadeId?.toLowerCase() === id && visible(el) && !el.closest(foreign));
    const link = row?.querySelector(':scope > a[href][aria-label]');
    if (link && visible(link)) {
      const literal = row.querySelector('span.truncate.inline-block.text-left')?.textContent?.trim();
      return {root:row, opener:link, title:literal || link.getAttribute('data-ag-orig-aria-label')?.trim() || link.getAttribute('aria-label')?.trim(), gesture:'dblclick'};
    }
    // 主界面侧栏折叠时，只接触明确承担“编辑对话标题”动作的面包屑。
    for (const seg of document.querySelectorAll('nav ' + segmentSel)) {
      if (!visible(seg) || seg.closest(foreign)) continue;
      const description = (seg.getAttribute('aria-describedby') || '').split(/\s+/)
        .map(ref=>document.getElementById(ref)?.textContent || '').join(' ').trim();
      if (!/^(Edits the conversation title|编辑对话标题|编辑会话标题)[.。]?$/i.test(description)) continue;
      const title = seg.querySelector('span.truncate.inline-block')?.textContent?.trim();
      if (title) return {root:seg, opener:seg, title, gesture:'click'};
    }
    return null;
  }
  function currentTitle(id) { return rowTarget(id)?.title || null; }

  function manualEdit(e) {
    if (!e.isTrusted || !(e.target instanceof Element) || e.target.closest(foreign)) return;
    const el = e.target;
    const row = el.closest(rowSel);
    const breadcrumb = el.closest(segmentSel);
    let id = null;
    if (e.type === 'dblclick' && row) id = row.dataset.cascadeId;
    if (e.type === 'click' && el.closest('[data-testid="conversation-rename-menu-item"]')) id = currentId();
    if ((e.type === 'input' || e.type === 'beforeinput' || e.type === 'keydown') &&
        el.matches(inlineSel + ',' + modalInput)) {
      if (row) id = row.dataset.cascadeId;
      else if (breadcrumb || el.matches(modalInput)) id = currentId();
    }
    if (id && uuid.test(id)) {
      id = id.toLowerCase();
      manual.add(id);
      document.dispatchEvent(new CustomEvent('ag-native-manual-title', {detail:{id}}));
    }
  }
  for (const type of ['dblclick','click','beforeinput','input','keydown']) document.addEventListener(type,manualEdit,true);

  // UI 通过 React 受控 input 保存。读回采用独立侧栏链接标签，避开行内编辑器的乐观值。
  async function rename(id, expected, title) {
    if (!uuid.test(id || '') || typeof expected !== 'string' || !expected.trim() || typeof title !== 'string' ||
        title.length > 70 || !/^(功能|设计|修复|优化|发布|探索|文档|研究)｜[^\r\n|｜]{1,55} \| \d{4}$/.test(title)) return {status:'unavailable'};
    if (busy || manual.has(id)) return {status:'cancelled'};
    const target = rowTarget(id);
    if (!target || !document.hasFocus() || document.querySelector(inlineSel+','+modalInput)) return {status:'unavailable'};
    if (target.title !== expected) return {status:'changed'};
    const previous = document.activeElement;
    if (previous?.matches?.('input,textarea,[contenteditable="true"]') &&
        (previous.value?.trim() || previous.textContent?.trim())) return {status:'unavailable'};
    let interrupted = false, editor = null, submitted = false;
    const interrupt = e => { if (e.isTrusted) interrupted=true; };
    const inputEvents = ['pointerdown','keydown','beforeinput','compositionstart','wheel'];
    for (const type of inputEvents) document.addEventListener(type,interrupt,true);
    try {
      busy = true;
      target.opener.dispatchEvent(new MouseEvent(target.gesture,{bubbles:true,cancelable:true,button:0,detail:target.gesture==='dblclick'?2:1}));
      for (let i=0;i<20&&!editor;i++) {
        editor=target.root.querySelector(inlineSel);
        if (!editor) await wait(25);
      }
      if (!editor) return {status:'unavailable'};
      if (interrupted || manual.has(id) || currentId() !== id || !editor.isConnected || !document.hasFocus()) return {status:'cancelled'};
      if (editor.value !== expected) return {status:'changed'};
      const link = target.root.querySelector(':scope > a[aria-label]');
      if (link && !hasAccessibleTitle(link,expected)) return {status:'changed'};
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(editor,title);
      editor.dispatchEvent(new Event('input',{bubbles:true}));
      // 让 React 刷新受控值，保持一次同步的提交窗口，避免 blur 触发提交竞态。
      await Promise.resolve();
      if (interrupted || manual.has(id) || currentId()!==id || !editor.isConnected || editor.value!==title) return {status:'cancelled'};
      editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,cancelable:true}));
      submitted = true;
      for (let i=0;i<24;i++) {
        await wait(55);
        if (currentId()!==id || manual.has(id)) break;
        const after = rowTarget(id);
        const confirmed = after?.title === title && (after.gesture !== 'dblclick' || hasAccessibleTitle(after.opener,title));
        if (confirmed && !after.root.querySelector(inlineSel)) return {status:'saved'};
      }
      return {status:'unconfirmed'};
    } finally {
      for (const type of inputEvents) document.removeEventListener(type,interrupt,true);
      if (!submitted && !interrupted && editor?.isConnected && !manual.has(id))
        editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));
      if (!interrupted && currentId()===id && previous?.isConnected &&
          (document.activeElement===document.body || target.root.contains(document.activeElement)))
        previous.focus?.({preventScroll:true});
      busy=false;
    }
  }
  Object.defineProperty(window,'__agNativeRename',{value:Object.freeze({
    currentTitle,rename,currentId,wasManuallyEdited:id=>manual.has(id)
  })});
  return true;
})()
