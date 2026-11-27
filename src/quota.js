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
  const historyMap = new Map();

  function recordSamples(value) {
    if (!value || !Array.isArray(value.items) || !Number.isFinite(value.seenAt) || value.seenAt <= 0) return;
    for (const row of value.items) {
      if (!row?.group || !row?.period || !Number.isFinite(row.percent)) continue;
      const key = row.group + '|' + row.period;
      const arr = historyMap.get(key) || [];
      const last = arr[arr.length - 1];
      if (!last || last.at !== value.seenAt || last.pct !== row.percent) {
        arr.push({ at: value.seenAt, pct: row.percent });
        if (arr.length > 24) arr.shift();
        historyMap.set(key, arr);
      }
    }
  }

  function runwayHours(group, period) {
    if (!group) return null;
    const arr = historyMap.get(group + '|' + period);
    if (!arr || arr.length < 2) return null;
    const first = arr[0], last = arr[arr.length - 1];
    const dtMin = (last.at - first.at) / 60000;
    const drop = first.pct - last.pct;
    if (dtMin < 5 || drop < 0.5 || last.pct <= 0) return null;
    const ratePerHour = drop / (dtMin / 60);
    if (ratePerHour <= 0) return null;
    return Math.min(168, Number((last.pct / ratePerHour).toFixed(1)));
  }

  function get() {
    const selector = document.querySelector('[id="antigravity.agentSidePanelInputBox"] [data-testid="model-selector-trigger"]') ||
      document.querySelector('[data-testid="model-selector-trigger"]');
    const model = selector?.textContent || '';
    const selectedGroup = /\bgemini\b/i.test(model) ? 'Gemini 模型' : /\b(?:claude|gpt)\b/i.test(model) ? 'Claude 与 GPT 模型' : null;
    const groups = [...new Set((snapshot.items || []).map(r => r.group).filter(Boolean))];
    const activeGroup = selectedGroup && groups.includes(selectedGroup) ? selectedGroup : (groups.length === 1 ? groups[0] : null);
    const runway = activeGroup ? { fiveHours: runwayHours(activeGroup, 'five'), weekHours: runwayHours(activeGroup, 'week') } : null;
    return {...snapshot,selectedGroup,runway,status: refreshRequest ? 'refreshing' : snapshot.status};
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
    apply(value) { if (!clearRequested) { snapshot = value; recordSamples(value); } }
  })});
  return true;
})()
