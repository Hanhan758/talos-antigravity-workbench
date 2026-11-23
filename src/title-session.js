(() => {
  'use strict';
  if (window !== window.top || location.protocol !== 'https:' || location.hostname !== '127.0.0.1' || !location.port ||
      location.username || location.password || typeof window.electronNative?.getZoomLevel !== 'function' ||
      typeof window.electronNative?.setTitleBarOverlay !== 'function') return false;
  if (window.__agNewChatNames) return true;
  const valid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
  const editor = '[contenteditable="true"],textarea,[role="textbox"]';
  const composer = '[id="antigravity.agentSidePanelInputBox"]';
  const newControl = '[data-testid="new-conversation-button"],[data-testid="app-icon-new-conversation-button"]';
  const titleEditor = '[data-testid="inline-edit-input"],[data-testid="rename-conversation-input"]';
  const userMsg = '[data-testid="user-message-content"]';
  const viewSel = '[data-testid="conversation-view"]';
  const side = '[data-testid="side-question-tab-content"],[data-testid="side-question-tab-composer"]';
  const rowSel = '[data-testid="conversation-row-sidebar"][data-cascade-id]';
  const norm = v => String(v || '').replace(/[\u200b-\u200d\ufeff]/g,'').replace(/\s+/g,' ').trim().slice(0,4096);
  const shown = e => e?.isConnected && e.getClientRects().length && !e.closest(side);
  const named = new Map();
  const retired = new Set();
  const retire = id => { named.delete(id); retired.add(id); };
  let draft = null, last = 'watching', handled = 0;
  const bus = new BroadcastChannel('ag-local-new-chat-titles-v1');

  const current = () => window.__agNativeRename.currentId();
  function listed() {
    return new Set([...document.querySelectorAll(rowSel)].map(e => e.dataset.cascadeId.toLowerCase()));
  }
  function arm(explicit) {
    draft = {since:Date.now(), known:listed(), explicit, message:'', sentAt:0, confirmed:false};
    last = 'draft';
  }
  function ignore(id) {
    if (!valid.test(id || '')) return;
    retire(id);
    if (draft) draft.known.add(id);
    last = 'manual';
  }
  document.addEventListener('ag-native-manual-title',e=>{
    const id=e.detail?.id;
    if (valid.test(id || '')) { ignore(id); bus.postMessage({manual:id}); }
  });
  bus.onmessage = e => { if (e.data?.manual) ignore(e.data.manual); };
  function manual(el) {
    const id = el?.closest(rowSel)?.dataset.cascadeId?.toLowerCase() || current();
    if (id) { ignore(id); bus.postMessage({manual:id}); }
  }
  function draftField(target) {
    const box = target?.closest(composer);
    if (!box || box.closest(side)) return null;
    const field = target.closest(editor) || [...box.querySelectorAll(editor)].find(shown);
    return field && !field.closest(side) ? field : null;
  }
  function capture(target, submitted) {
    const field = draftField(target);
    if (!field) return;
    const id = current(), record = named.get(id);
    if (id && !record && (!draft?.explicit || draft.known.has(id))) return;
    // Do not inspect historical chats. Only read the current user's draft before a new send.
    if (!draft && !record) {
      if (id) return;
      arm(false);
    }
    const msg = norm(field.value || field.innerText || field.textContent);
    if (!msg) return;
    if (record) {
      if (submitted && !record.saving) record.nextMessage=msg;
      return;
    }
    if (draft.confirmed && !submitted) return;
    draft.message = msg;
    draft.sentAt = Date.now();
    if (submitted) { draft.confirmed = true; last='submitted'; }
  }
  document.addEventListener('keydown',e=>{
    if (!e.isTrusted || e.isComposing || e.repeat) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase()==='n' && !e.shiftKey) { arm(true); return; }
    if (e.target.closest?.(titleEditor)) { manual(e.target); return; }
    if (e.key==='Enter' && !e.shiftKey && !e.altKey) capture(e.target,true);
  },true);
  document.addEventListener('input',e=>{
    if (!e.isTrusted) return;
    if (e.target.closest?.(titleEditor)) manual(e.target);
    else capture(e.target,false);
  },true);
  function pointer(e) {
    if (!e.isTrusted || !e.target?.closest) return;
    const el = e.target;
    if (el.closest(newControl)) {
      if (e.type==='pointerdown' || !draft?.explicit || Date.now()-draft.since>1000) arm(true);
    } else if (el.closest('[data-testid="conversation-rename-menu-item"],'+titleEditor)) {
      manual(el);
    } else if (el.closest('[data-testid="send-button"]')) {
      capture(el,true);
    } else if (draft && el.closest(rowSel) && e.type==='pointerdown') {
      // Explicit navigation to another thread cannot complete a pending creation.
      draft = null;
    }
  }
  document.addEventListener('pointerdown',pointer,true);
  document.addEventListener('click',pointer,true);
  document.addEventListener('dblclick',e=>{if(e.isTrusted && e.target.closest?.(rowSel)) manual(e.target);},true);
  function messages(id) {
    const view = [...document.querySelectorAll(viewSel)].find(el => shown(el) && (!el.dataset.cascadeId || el.dataset.cascadeId.toLowerCase()===id));
    return [...(view || document).querySelectorAll(userMsg)].filter(shown);
  }
  function unchanged(record) { return named.get(record.id)===record && current()===record.id; }
  function consider(record) {
    if (record.saving || !unchanged(record) || Date.now() < (record.nextTry || 0)) return;
    if (window.__agNativeRename.wasManuallyEdited(record.id)) { ignore(record.id); return; }
    const old = window.__agNativeRename.currentTitle(record.id);
    if (typeof old!=='string' || !old.trim() || /^(?:untitled(?: conversation)?|new conversation|未命名(?:对话|会话)?|无标题(?:对话|会话)?|新建对话)$/i.test(old.trim())) {last='waiting-native';return;}
    if (((record.baseline || record.observed) && (record.baseline || record.observed)!==old) || /^(?:功能|设计|修复|优化|发布|探索|文档|研究)｜[^|｜]+ \| \d{4}$/.test(old)) {
      ignore(record.id); return;
    }
    // 原生标题可能先显示首句预览，再异步替换为摘要；仅在稳定后才锁定预期值。
    const seed = norm(record.first || record.message);
    const clean = norm(old).replace(/(?:…|\.\.\.)$/,'');
    if (!record.baseline && clean.length>0 && seed.startsWith(clean) && clean!==record.approvedNative) {
      if (record.seedTitle!==clean) {record.seedTitle=clean;record.seedAt=Date.now();}
      if (Date.now()-record.seedAt<20000) {last='waiting-summary';return;}
    }
    if (record.observed!==old) {record.observed=old;record.observedAt=Date.now();return;}
    if (Date.now()-record.observedAt<1200) return;
    record.baseline=old;
    if (record.nextMessage && messages(record.id).some(el=>norm(el.innerText)===record.nextMessage)) {
      record.message=record.nextMessage; record.nextMessage=null; record.followup=true;
    }
    const projectNames=[...document.querySelectorAll('[data-testid="project-header"]')].map(n=>{
      const label=n.querySelector('.truncate,[data-testid="project-name"]');
      return (label?.textContent||n.getAttribute('title')||'').trim();
    }).filter(Boolean);
    const choice=window.__agTitleFormat.propose({projectNames,message:record.message,nativeTitle:record.followup?'':old,createdAt:record.createdAt});
    if (choice.state==='skip') {retire(record.id);last='skipped';return;}
    if (choice.state!=='ready') {last='waiting-topic';return;}
    if (!document.hasFocus()) return;
    record.saving=true; last='saving';
    void window.__agNativeRename.rename(record.id,old,choice.title).then(result=>{
      if (!named.has(record.id)) return;
      last=result?.status || 'unconfirmed';
      if (last==='saved') handled++;
      if (last==='unavailable') {
        record.saving=false;
        record.nextTry=Date.now()+Math.min(30000,2000*2**Math.min(4,record.tries++));
      } else retire(record.id);
    }).catch(()=>{ retire(record.id);last='unconfirmed'; });
  }
  function probe() {
    const id=current();
    if (id && named.has(id)) consider(named.get(id));
    if (draft && draft.sentAt && Date.now()-draft.sentAt>180000) {draft=null; last='draft-expired';}
    if (draft?.message && id && !draft.known.has(id) && !named.has(id)) {
      const first=messages(id)[0];
      // Native acceptance is the proof of submission, including send paths that don't dispatch a click.
      if (first && norm(first.innerText || first.textContent)===draft.message) {
        return {id,first:draft.message,since:draft.since,sentAt:draft.sentAt,phase:'check-creation',handled};
      }
    }
    const record=named.get(id);
    return {activeId:id, currentTracked:!!record, baseline:record?.baseline, phase:last,handled, awaiting:!!draft?.message, hasRoute:!!id,
      hasFirst:!!(draft?.message && id && messages(id)[0]), listedBefore:!!(draft && id && draft.known.has(id))};
  }
  function admit(id,birth) {
    if (!draft || current()!==id || draft.known.has(id)) return;
    if (birth===false) { draft=null;last='existing';return; }
    if (!Number.isFinite(birth)) return;
    const accepted=messages(id)[0];
    if (!accepted || norm(accepted.innerText || accepted.textContent)!==draft.message) return;
    if (named.size>=32) named.delete(named.keys().next().value);
    named.set(id,{id,first:draft.message,message:draft.message,createdAt:birth,tries:0,saving:false});
    draft=null;last='new';
    consider(named.get(id));
  }
  function evidence(id) {
    if (retired.has(id) || window.__agNativeRename.wasManuallyEdited(id) || current()!==id) return null;
    const nodes=messages(id);
    const first=norm(nodes[0]?.innerText || nodes[0]?.textContent);
    const old=window.__agNativeRename.currentTitle(id);
    return first && old ? {first,old} : null;
  }
  function resume(id,birth,old,first) {
    const e=evidence(id);
    if (!e || e.old!==old || e.first!==first || named.has(id)) return false;
    named.set(id,{id,first,message:first,createdAt:birth,baseline:old,approvedNative:old,tries:0,saving:false});
    draft=null; last='resumed';
    return true;
  }
  function collect() {
    const result=probe(); result.retired=[...retired]; retired.clear(); return result;
  }
  Object.defineProperty(window,'__agNewChatNames',{value:Object.freeze({probe,admit,collect,evidence,resume})});
  return true;
})()
