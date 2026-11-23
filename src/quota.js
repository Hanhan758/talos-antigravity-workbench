(() => {
  'use strict';
  if (window !== window.top || location.protocol !== 'https:' || location.hostname !== '127.0.0.1' ||
      !location.port || location.username || location.password ||
      typeof window.electronNative?.getZoomLevel !== 'function' ||
      typeof window.electronNative?.setTitleBarOverlay !== 'function') return false;
  if (window.__agQuotaSummary) return true;

  const blank = () => ({items:[], status:'idle', seenAt:0, expiresAt:0});
  let snapshot = blank();
  let refreshRequest = null;
  let clearRequested = false;

  function get() {
    const selector = document.querySelector('[id="antigravity.agentSidePanelInputBox"] [data-testid="model-selector-trigger"]') ||
      document.querySelector('[data-testid="model-selector-trigger"]');
    const model = selector?.textContent || '';
    const selectedGroup = /\bgemini\b/i.test(model) ? 'Gemini 模型' : /\b(?:claude|gpt)\b/i.test(model) ? 'Claude 与 GPT 模型' : null;
    return {...snapshot,selectedGroup,status: refreshRequest ? 'refreshing' : snapshot.status};
  }
  function refresh(force=false) {
    if (force || !refreshRequest) refreshRequest = force ? 'force' : 'open';
    return true;
  }
  function takeRequest(open) {
    const clear = clearRequested;
    clearRequested = false;
    const requested = open ? refreshRequest : null;
    if (open) refreshRequest = null;
    return {requested,clear};
  }

  document.addEventListener('click',event=>{
    const el = event.target.closest?.('button,[role="button"],[role="menuitem"],a[href]');
    if (!el || el.closest('#ag-local-context-card,[data-markdown-root],.prose,.markdown,[contenteditable="true"]')) return;
    const names = [el.getAttribute('aria-label'),el.getAttribute('title'),el.textContent?.trim()];
    if (names.some(s=>['Sign Out','Sign out','Switch account','退出登录','切换账号'].includes(s))) {
      snapshot = blank(); refreshRequest = null; clearRequested = true;
    }
  },true);
  Object.defineProperty(window,'__agQuotaSummary',{value:Object.freeze({
    get, refresh, takeRequest,
    apply(value) { if (!clearRequested) snapshot = value; }
  })});
  return true;
})()
