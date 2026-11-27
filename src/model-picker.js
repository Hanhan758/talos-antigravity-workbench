((initialEnabled, initialCliModels) => {
  'use strict';
  if (window !== window.top || !document.body || location.protocol !== 'https:' || location.hostname !== '127.0.0.1' ||
      !location.port || typeof window.electronNative?.getZoomLevel !== 'function' ||
      typeof window.electronNative?.setTitleBarOverlay !== 'function') return null;
  if (window.__agModelPicker) return { mounted: true };

  let enabled = initialEnabled !== 'native';
  let bypassNativeClick = false;
  let applyingSelection = false;
  let pendingSelection = null;
  let open = false;
  let view = 'effort'; // 'effort' | 'models'
  let catalog = [];
  let catalogSource = 'none';
  let catalogVersion = 0;
  let activeBase = '';
  let activeEffortIdx = 1;
  let bloomSerial = 0;
  let statusNote = '';
  let quickChips = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem('ag-codex-quick-chips') || '[]');
      return Array.isArray(raw) ? raw.filter(x => x && typeof x.base === 'string').slice(0, 3) : [];
    } catch { return []; }
  })();

  const isEn = () => window.__agLocalZhControl?.getLang?.() === 'en';
  const clean = s => (s || '').replace(/\s+/g, ' ').trim();
  const vis = el => !!(el?.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  const node = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  // 色相从蓝 216.6° 单调推进至紫罗兰 263.9°，亮/暗双套 WCAG 验证色阶（借鉴 Codex 桌面端实测规范）
  const STANDARD_TIERS = [
    { key: 'low', en: 'Low', zh: '轻度', match: /^(?:low|light|轻度|低)$/i, rank: 1, fillLight: '#3a83f7', inkLight: '#2f6fd0', fillDark: '#448dff', inkDark: '#76aafe', peak: false },
    { key: 'medium', en: 'Medium', zh: '中', match: /^(?:medium|med|标准|中等|中)$/i, rank: 2, fillLight: '#4a72f2', inkLight: '#3a55b8', fillDark: '#6e90ff', inkDark: '#8ba7ff', peak: false },
    { key: 'high', en: 'High', zh: '高', match: /^(?:high|高|深度)$/i, rank: 3, fillLight: '#5f5ce8', inkLight: '#4a3fc0', fillDark: '#928fff', inkDark: '#a4a2ff', peak: false },
    { key: 'xhigh', en: 'XHigh', zh: 'Ultra', match: /^(?:extra[\s_-]*high|x[\s_-]*high|ultra|max|极高|超高|极限)$/i, rank: 4, fillLight: '#914ef6', inkLight: '#8b46ee', fillDark: '#bd91ff', inkDark: '#c39bff', peak: true }
  ];

  function resolveTier(raw) {
    const t = clean(raw);
    if (!t) return null;
    if (/extra[\s_-]*high|x[\s_-]*high|ultra|max|超高|极高|极限/i.test(t)) return STANDARD_TIERS[3];
    if (/(?:^|[\s(（])high(?:$|[\s)）])|深度|高/i.test(t) && !/extra|x[\s_-]*high|ultra|超|极/i.test(t)) return STANDARD_TIERS[2];
    if (/(?:^|[\s(（])med(?:ium)?(?:$|[\s)）])|标准|中等|中/i.test(t)) return STANDARD_TIERS[1];
    if (/(?:^|[\s(（])low(?:$|[\s)）])|light|轻度|低/i.test(t)) return STANDARD_TIERS[0];
    return null;
  }

  function detectProvider(name) {
    if (/gemini/i.test(name)) return 'Google';
    if (/claude|opus|sonnet|haiku/i.test(name)) return 'Anthropic';
    if (/gpt|o[134]|codex/i.test(name)) return 'OpenAI';
    if (/orchestrator/i.test(name)) return 'Orchestrator';
    return 'Other';
  }

  function parseModelOption(rawText, hasSubmenu = false) {
    let text = clean(rawText);
    if (!text || text.length > 100) return null;
    if (/^(?:models?|模型|select model|选择模型|orchestrator settings|查看用量|view usage)$/i.test(text)) return null;
    text = text.replace(/(?:\s*(?:New|Beta|Preview|Deprecated|Leaving\s*Soon|即将下线|新|推荐|提示|ⓘ|ℹ))+\s*$/gi, '').trim();
    if (!text) return null;

    let base = text;
    let tier = null;
    const mParen = text.match(/^(.+?)\s*[（(]([^()（）]{1,24})[)）]$/);
    if (mParen && resolveTier(mParen[2])) {
      base = clean(mParen[1]);
      tier = resolveTier(mParen[2]);
    } else {
      const mSuffix = text.match(/^(.+?)\s*(Extra[\s_-]*High|X[\s_-]*High|High|Medium|Low|Ultra|Max|轻度|标准|极高|超高)\s*$/i);
      if (mSuffix && mSuffix[1].trim().length >= 3) {
        base = clean(mSuffix[1]);
        tier = resolveTier(mSuffix[2]);
      }
    }
    base = base.replace(/(?:\s*(?:New|即将下线|Leaving\s*Soon|提示))+\s*$/gi, '').trim();
    if (!base) return null;
    return { base, provider: detectProvider(base), tier, hasSubmenu: !!hasSubmenu, rawText: clean(rawText) };
  }

  function buildCatalog(items, source = 'cli') {
    const map = new Map();
    for (const item of items) {
      const raw = typeof item === 'string' ? item : item?.text;
      const hasSub = typeof item === 'object' && !!item?.hasSubmenu;
      const parsed = parseModelOption(raw, hasSub);
      if (!parsed) continue;
      if (parsed.provider === 'Orchestrator') continue;
      if (!map.has(parsed.base)) {
        map.set(parsed.base, { base: parsed.base, provider: parsed.provider, hasSubmenu: parsed.hasSubmenu, efforts: [] });
      }
      const entry = map.get(parsed.base);
      if (parsed.hasSubmenu) entry.hasSubmenu = true;
      if (parsed.tier && !entry.efforts.some(e => e.key === parsed.tier.key)) {
        entry.efforts.push({ ...parsed.tier, rawText: parsed.rawText });
      }
    }
    const out = [];
    for (const entry of map.values()) {
      if (entry.efforts.length === 0) {
        entry.efforts = [{ ...STANDARD_TIERS[1], rawText: entry.base }];
      } else if (source !== 'cli' && entry.efforts.length === 1) {
        // DOM 一级菜单每个模型仅渲染 1 行（如 "Gemini 4 Neon High New"），在 agy models 尚未返回前
        // 保留多档推理滑条：带括号固定档位的单档模型（如 GPT-OSS 120B (Medium)）保持 1 档，其余按模型族展开
        const rawFirst = entry.efforts[0].rawText || '';
        const looksFixedSingle = /\((?:low|medium|high|xhigh)\)/i.test(rawFirst) && !entry.hasSubmenu;
        if (!looksFixedSingle) {
          const isFourTier = /\b(?:neon|hydrogen)\b/i.test(entry.base) || entry.efforts[0].peak;
          const tiers = isFourTier ? STANDARD_TIERS : STANDARD_TIERS.slice(0, 3);
          entry.efforts = tiers.map(t => ({ ...t, rawText: `${entry.base} ${t.en}` }));
        }
      } else {
        entry.efforts.sort((a, b) => a.rank - b.rank);
      }
      out.push(entry);
    }
    return out;
  }

  // 若后台通过 agy models（或本地缓存）提供了精确目录，启动即拥有 100% 真实的每个模型精确档位数（1 / 3 / 4 档）
  if (Array.isArray(initialCliModels) && initialCliModels.length >= 2) {
    catalog = buildCatalog(initialCliModels, 'cli');
    catalogSource = 'cli';
    catalogVersion = 1;
  }

  // 确定性 16 颗星尘粒子（低差异序列，避免重绘乱跳）
  const PHI = 0.6180339887498949;
  const hash01 = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const SPARKS = Array.from({ length: 16 }, (_, i) => ({
    top: (14 + hash01(i * 11 + 5) * 72).toFixed(1) + '%',
    b: (0.48 + 0.52 * hash01(i * 7 + 3)).toFixed(2),
    dur: (2.2 + hash01(i * 13 + 1) * 2.4).toFixed(2) + 's',
    delay: (-((i * PHI) % 1) * 3.8).toFixed(2) + 's'
  }));
  const BLOOM_MOTES = [
    { x0: -4, y0: -2, x1: -44, y1: -16, sz: 4.5, bd: '.52s', del: '0s' },
    { x0: -3, y0: 2, x1: -40, y1: 18, sz: 4, bd: '.56s', del: '.03s' },
    { x0: -6, y0: -4, x1: -30, y1: -22, sz: 3.5, bd: '.48s', del: '.02s' },
    { x0: -5, y0: 4, x1: -28, y1: 21, sz: 3.5, bd: '.54s', del: '.04s' },
    { x0: -7, y0: 0, x1: -48, y1: 2, sz: 4, bd: '.60s', del: '.01s' },
    { x0: -2, y0: -1, x1: -22, y1: -10, sz: 3, bd: '.46s', del: '.05s' }
  ];

  const style = node('style');
  style.id = 'ag-codex-model-picker-style';
  style.textContent = `
    #ag-codex-picker-card {
      --cmp-bg:var(--aw-panel,#ffffff);--cmp-fg:var(--aw-ink,#18181b);--cmp-muted:var(--aw-soft,#71717a);
      --cmp-line:var(--aw-line,#e4e4e7);--cmp-rail-base:#e8e7e8;--cmp-knob:#ffffff;
      --cmp-fill:#4a72f2;--cmp-ink:#3a55b8;
      --cmp-peak-grad:linear-gradient(90deg,#3b83f6 0%,#3d7bf3 18%,#6473fa 40%,#9375fd 58%,#a779fe 70%,#845af9 86%,#7448ee 100%);
      position:fixed;z-index:2147483647;width:364px;max-width:calc(100vw - 24px);box-sizing:border-box;
      border-radius:18px;border:1px solid var(--cmp-line);background:var(--cmp-bg);color:var(--cmp-fg);
      box-shadow:0 14px 40px rgb(0 0 0 / 16%),0 2px 8px rgb(0 0 0 / 7%);pointer-events:auto!important;
      padding:14px 18px 15px;font:400 13px/1.45 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      transform-origin:bottom left;animation:ag-cmp-pop .18s cubic-bezier(.16,1,.3,1);user-select:none
    }
    #ag-codex-picker-card[data-theme="dark"] {
      --cmp-bg:var(--aw-panel,#232428);--cmp-fg:var(--aw-ink,#f4f4f5);--cmp-muted:var(--aw-soft,#a1a1aa);
      --cmp-line:var(--aw-line,#3b3d45);--cmp-rail-base:#232324;--cmp-knob:#f9fafb;
      --cmp-peak-grad:linear-gradient(90deg,#3e89ff 0%,#518dff 20%,#7c8aff 42%,#a084ff 58%,#b085ff 74%,#ae91ff 88%,#b296fe 100%);
      color-scheme:dark
    }
    #ag-codex-picker-card[data-peak="true"] {border-color:color-mix(in srgb,#914ef6 36%,var(--cmp-line))}
    #ag-codex-picker-card[hidden] {display:none!important}
    @keyframes ag-cmp-pop {from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes ag-cmp-flow {from{background-position:0 0}to{background-position:100% 0}}
    @keyframes ag-cmp-shimmer {from{transform:translateX(-45%)}to{transform:translateX(45%)}}
    @keyframes ag-cmp-drift {0%{left:-4%;opacity:0}8%{opacity:var(--b,1)}92%{opacity:var(--b,1)}100%{left:104%;opacity:0}}
    @keyframes ag-cmp-burst {0%{opacity:0;transform:translate(var(--x0),var(--y0)) scale(.4)}18%{opacity:.95}100%{opacity:0;transform:translate(var(--x1),var(--y1)) scale(.5)}}
    @keyframes ag-cmp-halo {0%{opacity:.55;transform:scale(.24)}100%{opacity:0;transform:scale(1.55)}}
    #ag-codex-picker-card .cmp-head {display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px}
    #ag-codex-picker-card .cmp-icon-btn {
      width:28px;height:28px;border-radius:8px;border:0;background:transparent;color:var(--cmp-muted);
      display:grid;place-items:center;cursor:pointer;padding:0;font-size:15px;transition:background-color .14s ease,color .14s ease
    }
    #ag-codex-picker-card .cmp-icon-btn:hover {background:color-mix(in srgb,currentColor 10%,transparent);color:var(--cmp-fg)}
    #ag-codex-picker-card .cmp-icon-btn[aria-pressed="true"] {color:#f59e0b}
    #ag-codex-picker-card .cmp-effort-title {
      font-size:19px;font-weight:750;letter-spacing:-.25px;text-align:center;flex:1;
      color:var(--cmp-ink);transition:color .2s ease
    }
    #ag-codex-picker-card .cmp-model-btn {
      display:inline-flex;align-items:center;justify-content:center;gap:5px;margin:0 auto 14px;width:100%;
      border:0;background:transparent;color:var(--cmp-muted);cursor:pointer;font:500 13px/1.35 inherit;
      padding:3px 8px;border-radius:8px;transition:background-color .14s ease,color .14s ease
    }
    #ag-codex-picker-card .cmp-model-btn:hover {background:color-mix(in srgb,currentColor 7%,transparent);color:var(--cmp-fg)}
    /* 逐帧实测 Codex 滑轨：轨道 28px，圆钮 32px（凸出 2px），轻染色未填轨道突出已填进度对比 */
    #ag-codex-picker-card .cmp-rail {
      position:relative;height:28px;border-radius:16px;margin:4px 0 2px;
      background:color-mix(in srgb,var(--cmp-fill) 12%,var(--cmp-rail-base));
      touch-action:none;cursor:pointer;transition:background-color .22s ease
    }
    #ag-codex-picker-card .cmp-rail::before {content:"";position:absolute;inset:-7px -4px;border-radius:20px}
    #ag-codex-picker-card .cmp-fill,
    #ag-codex-picker-card .cmp-sparks {
      position:absolute;inset:0 auto 0 0;border-radius:14px 0 0 14px;overflow:hidden;pointer-events:none;
      width:calc((100% - 32px) * var(--cmp-pos, 0) + 16px);
      transition:width .22s cubic-bezier(.22,1,.36,1)
    }
    #ag-codex-picker-card .cmp-fill {background:var(--cmp-fill)}
    #ag-codex-picker-card[data-peak="true"] .cmp-fill {
      background:var(--cmp-peak-grad);background-size:155% 100%;
      animation:ag-cmp-flow 3.8s ease-in-out infinite alternate
    }
    #ag-codex-picker-card[data-peak="true"] .cmp-fill::before {
      content:"";position:absolute;inset:-10px -40px;
      background:linear-gradient(100deg,transparent 18%,#ffffff08 35%,#ffffff34 48%,#ffffff08 66%,transparent 84%);
      animation:ag-cmp-shimmer 4.5s ease-in-out infinite alternate
    }
    #ag-codex-picker-card .cmp-sparks {opacity:0;transition:width .22s cubic-bezier(.22,1,.36,1),opacity .22s ease}
    #ag-codex-picker-card[data-peak="true"] .cmp-sparks {opacity:1}
    #ag-codex-picker-card .cmp-sp {
      position:absolute;width:3px;height:3px;border-radius:50%;background:#ffffff;
      box-shadow:0 0 5px #f3e8ff;transform:scale(var(--b,1));
      animation:ag-cmp-drift var(--dur,3s) linear infinite;animation-delay:var(--delay,0s)
    }
    #ag-codex-picker-card .cmp-dot {
      position:absolute;top:12px;left:calc((100% - 32px) * var(--cmp-tick, 0) + 16px);
      width:4px;height:4px;margin-left:-2px;border-radius:50%;pointer-events:none;z-index:1;
      background:color-mix(in srgb,var(--cmp-fg) 28%,transparent);transition:background-color .18s ease,opacity .18s ease
    }
    #ag-codex-picker-card .cmp-dot.passed {background:rgb(255 255 255 / 72%)}
    #ag-codex-picker-card[data-peak="true"] .cmp-dot {opacity:0}
    #ag-codex-picker-card .cmp-bloom {position:absolute;left:calc(100% - 16px);top:14px;width:0;height:0;pointer-events:none;z-index:3}
    #ag-codex-picker-card .cmp-bp {
      position:absolute;left:0;top:0;width:var(--sz);height:var(--sz);margin-top:calc(var(--sz) * -.5);margin-left:calc(var(--sz) * -.5);
      border-radius:50%;background:#c9a9fb;box-shadow:0 0 6px #c9a9fb;opacity:0;
      animation:ag-cmp-burst var(--bd) cubic-bezier(.15,.72,.25,1) var(--del) 1 both
    }
    #ag-codex-picker-card .cmp-halo {
      position:absolute;left:0;top:0;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;
      background:radial-gradient(circle,#c9a9fb 0%,transparent 66%);opacity:0;animation:ag-cmp-halo .5s ease-out 1 both
    }
    #ag-codex-picker-card .cmp-knob {
      position:absolute;left:calc((100% - 32px) * var(--cmp-pos, 0));top:-2px;width:32px;height:32px;border-radius:50%;
      background:var(--cmp-knob);box-shadow:0 2px 8px rgb(0 0 0 / 24%),0 0 0 .5px rgb(0 0 0 / 8%);
      pointer-events:none;z-index:2;transform:scale(1);transform-origin:50% 50%;
      transition:left .22s cubic-bezier(.22,1,.36,1),transform .34s cubic-bezier(.34,1.56,.64,1)
    }
    #ag-codex-picker-card .cmp-rail.dragging {cursor:grabbing}
    #ag-codex-picker-card .cmp-rail.dragging .cmp-knob {transform:scale(1.16);transition:transform .14s cubic-bezier(.2,.9,.3,1.2)}
    #ag-codex-picker-card .cmp-rail.dragging .cmp-fill,
    #ag-codex-picker-card .cmp-rail.dragging .cmp-sparks {transition:none}
    #ag-codex-picker-card .cmp-tier-labels {display:grid;margin-top:10px;font-size:11.5px;color:var(--cmp-muted)}
    #ag-codex-picker-card .cmp-tier-labels button {
      border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:3px 2px;border-radius:6px;
      text-align:center;transition:color .14s ease,background-color .14s ease
    }
    #ag-codex-picker-card .cmp-tier-labels button[aria-current="true"] {color:var(--cmp-ink);font-weight:650}
    #ag-codex-picker-card .cmp-tier-labels button:hover {background:color-mix(in srgb,currentColor 8%,transparent)}
    #ag-codex-picker-card .cmp-status {margin-top:6px;text-align:center;font-size:11px;min-height:15px;color:var(--cmp-muted)}
    #ag-codex-picker-card .cmp-quick-bar {display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--cmp-line)}
    #ag-codex-picker-card .cmp-chip {
      display:inline-flex;align-items:center;gap:5px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);
      background:color-mix(in srgb,currentColor 4%,transparent);color:var(--cmp-fg);border-radius:999px;
      padding:3px 9px;font:500 11px/16px inherit;cursor:pointer;transition:background-color .14s ease,transform .12s ease
    }
    #ag-codex-picker-card .cmp-chip:hover {background:color-mix(in srgb,var(--chip-c,#3b82f6) 14%,transparent);transform:translateY(-1px)}
    #ag-codex-picker-card .cmp-chip-dot {width:6px;height:6px;border-radius:50%;background:var(--chip-c,#3b82f6);flex:none}
    #ag-codex-picker-card .cmp-search {
      width:100%;box-sizing:border-box;padding:8px 11px;margin:8px 0 10px;border-radius:10px;
      border:1px solid var(--cmp-line);background:color-mix(in srgb,currentColor 4%,transparent);
      color:var(--cmp-fg);font:inherit;outline:none
    }
    #ag-codex-picker-card .cmp-search:focus {border-color:#3a83f7}
    #ag-codex-picker-card .cmp-list {max-height:280px;overflow:auto;display:grid;gap:3px}
    #ag-codex-picker-card .cmp-group {font-size:11px;font-weight:600;color:var(--cmp-muted);padding:7px 8px 3px;letter-spacing:.3px}
    #ag-codex-picker-card .cmp-row {
      display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;
      background:transparent;color:var(--cmp-fg);padding:8px 10px;border-radius:9px;cursor:pointer;
      font:450 13px/1.35 inherit;text-align:left;transition:background-color .12s ease
    }
    #ag-codex-picker-card .cmp-row:hover {background:color-mix(in srgb,var(--aw-accent,#3a83f7) 11%,transparent)}
    #ag-codex-picker-card .cmp-row[aria-selected="true"] {background:color-mix(in srgb,var(--aw-accent,#3a83f7) 14%,transparent);font-weight:600}
    #ag-codex-picker-card .cmp-row-left {display:inline-flex;align-items:center;gap:7px;min-width:0}
    #ag-codex-picker-card .cmp-row-name {overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #ag-codex-picker-card .cmp-tier-pill {font-size:10.5px;padding:1px 6px;border-radius:6px;flex:none;background:color-mix(in srgb,currentColor 8%,transparent);color:var(--cmp-muted)}
    html[data-ag-probing-model="1"] [data-radix-popper-content-wrapper],
    html[data-ag-probing-model="1"] [role="menu"],
    html[data-ag-probing-model="1"] [role="listbox"] {opacity:0!important}
    html[data-ag-codex-picker-open="1"] [data-radix-popper-content-wrapper]:not([data-aw-owned]) {display:none!important}
  `;
  document.head.append(style);

  const card = node('section');
  card.id = 'ag-codex-picker-card';
  card.dataset.awOwned = '';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Codex 模型与推理强度选择器');
  document.body.append(card);

  function findTrigger() {
    return document.querySelector('[id="antigravity.agentSidePanelInputBox"] [data-testid="model-selector-trigger"]') ||
      document.querySelector('[data-testid="model-selector-trigger"]');
  }

  function saveChips() {
    try { localStorage.setItem('ag-codex-quick-chips', JSON.stringify(quickChips.slice(0, 3))); } catch {}
  }

  function waitFor(checkFn, timeoutMs = 500, stepMs = 25) {
    return new Promise(resolve => {
      const deadline = performance.now() + timeoutMs;
      (function tick() {
        const res = checkFn();
        if (res) return resolve(res);
        if (performance.now() >= deadline) return resolve(null);
        setTimeout(tick, stepMs);
      })();
    });
  }

  function queryNativeItems() {
    const raw = [...document.querySelectorAll('[data-radix-collection-item],[role="option"],[role="menuitem"],[role="menuitemradio"],[data-radix-popper-content-wrapper] button,[role="menu"] button')];
    const unique = [];
    for (const el of raw) {
      if (el.closest('#ag-codex-picker-card') || !vis(el)) continue;
      if (unique.some(u => u === el || u.contains(el))) continue;
      // 跳过纯图标小按钮（如 info ⓘ 按钮）
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 18) continue;
      if (!clean(el.textContent)) continue;
      unique.push(el);
    }
    return unique;
  }

  // Radix DropdownMenuTrigger 只需单次 pointerdown 即可展开，不可再跟 trigger.click() 造成二次反转关闭
  async function ensureNativeMenuOpen(trigger) {
    if (queryNativeItems().length > 0) return queryNativeItems();
    const tr = trigger.getBoundingClientRect();
    const tx = tr.left + tr.width / 2, ty = tr.top + tr.height / 2;
    bypassNativeClick = true;
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: tx, clientY: ty, pointerType: 'mouse', isPrimary: true }));
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: tx, clientY: ty }));
    trigger.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, clientX: tx, clientY: ty, pointerType: 'mouse', isPrimary: true }));
    bypassNativeClick = false;
    let items = await waitFor(() => { const l = queryNativeItems(); return l.length ? l : null; }, 220, 20);
    if (!items) {
      bypassNativeClick = true;
      trigger.click();
      bypassNativeClick = false;
      items = await waitFor(() => { const l = queryNativeItems(); return l.length ? l : null; }, 320, 25);
    }
    return items;
  }

  function dismissNativeMenu() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
  }

  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

  function activateItem(el) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    try { el.focus({ preventScroll: true }); } catch {}
    el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: cx, clientY: cy, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, button: 0, clientX: cx, clientY: cy, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: cx, clientY: cy }));
    if (el.isConnected) el.click();
    // 兜底：若 React 合成事件仍未关闭菜单，尝试调用 __reactProps$ 上的 onSelect
    if (el.isConnected) {
      try {
        const pk = Object.keys(el).find(k => k.startsWith('__reactProps$'));
        const props = pk && el[pk];
        if (props && typeof props.onSelect === 'function') props.onSelect(new CustomEvent('select', { cancelable: true }));
      } catch {}
    }
  }

  function matchTierText(rawText, tierObj) {
    const t = clean(rawText).toLowerCase();
    if (!t || !tierObj) return false;
    const isPeakText = /extra[\s_-]*high|x[\s_-]*high|ultra|max|超高|极高|极限/.test(t);
    if (tierObj.key === 'xhigh') return isPeakText;
    if (isPeakText) return false;
    if (tierObj.key === 'high') return /high|深度|高/.test(t);
    if (tierObj.key === 'medium') return /medium|med\b|标准|中等|中/.test(t);
    if (tierObj.key === 'low') return /low|light|轻度|低/.test(t);
    return tierObj.match.test(t);
  }

  async function probeNativeCatalog(trigger) {
    applyingSelection = true;
    document.documentElement.setAttribute('data-ag-probing-model', '1');
    try {
      const items = await ensureNativeMenuOpen(trigger);
      const found = (items || []).map(opt => ({
        text: clean(opt.textContent),
        hasSubmenu: !!(opt.getAttribute('aria-haspopup') || opt.querySelector('svg.lucide-chevron-right,[data-icon="chevron-right"]'))
      })).filter(x => x.text);
      dismissNativeMenu();
      return found;
    } finally {
      setTimeout(() => {
        document.documentElement.removeAttribute('data-ag-probing-model');
        applyingSelection = false;
      }, 50);
    }
  }

  async function applyNativeSelection(baseName, tierObj) {
    const trigger = findTrigger();
    if (!trigger) return false;
    if (applyingSelection) {
      pendingSelection = { baseName, tierObj };
      return false;
    }
    applyingSelection = true;
    statusNote = isEn() ? 'Switching…' : '正在切换…';
    const statusEl = card.querySelector('.cmp-status');
    if (statusEl) statusEl.textContent = statusNote;

    document.documentElement.removeAttribute('data-ag-codex-picker-open');
    document.documentElement.setAttribute('data-ag-probing-model', '1');
    let switched = false;
    let failReason = '';
    try {
      const allOpts = await ensureNativeMenuOpen(trigger);
      if (!allOpts) { failReason = 'menu-not-open'; dismissNativeMenu(); return false; }

      // 1. 若原生菜单本身为平铺多项，直接点对应项
      const sameBaseRows = allOpts.filter(o => parseModelOption(o.textContent, false)?.base?.toLowerCase() === baseName.toLowerCase());
      if (sameBaseRows.length > 1 && tierObj) {
        const flatMatch = sameBaseRows.find(o => matchTierText(o.textContent, tierObj));
        if (flatMatch) { activateItem(flatMatch); switched = true; return true; }
      }

      // 2. Antigravity 2.35.2 二级菜单：定位对应基础模型父行
      const parentRow = sameBaseRows[0] || allOpts.find(o => {
        const p = parseModelOption(o.textContent, true);
        return p && p.base.toLowerCase() === baseName.toLowerCase();
      }) || allOpts.find(o => clean(o.textContent).toLowerCase().includes(baseName.toLowerCase()));
      if (!parentRow) { failReason = `no-row(${allOpts.length})`; dismissNativeMenu(); return false; }

      const entry = catalog.find(m => m.base.toLowerCase() === baseName.toLowerCase());
      if (!tierObj || (entry && entry.efforts.length <= 1)) {
        activateItem(parentRow);
        switched = true;
        return true;
      }

      // 等待 FloatingUI 完成位置计算，避免首帧读到 (0,0) 坐标
      await nextFrame();
      await nextFrame();

      // 3. Radix DropdownMenuSubTrigger 源码级标准展开：带 relatedTarget 的 mouseover + 2px 位移 pointermove + ArrowRight
      const beforeSet = new Set(allOpts);
      const beforePortals = new Set([...document.querySelectorAll('[data-radix-popper-content-wrapper],[role="menu"],[role="listbox"]')]);
      const findFreshSubItems = () => {
        const fresh = queryNativeItems().filter(el => !beforeSet.has(el));
        if (fresh.length) return fresh;
        const extra = [];
        for (const portal of document.querySelectorAll('[data-radix-popper-content-wrapper],[role="menu"],[role="listbox"]')) {
          if (beforePortals.has(portal) || portal.closest('#ag-codex-picker-card') || !vis(portal)) continue;
          for (const c of portal.querySelectorAll('[data-radix-collection-item],[role="menuitem"],[role="menuitemradio"],[role="option"],button,[tabindex]')) {
            if (!vis(c) || !clean(c.textContent)) continue;
            if (!extra.some(u => u === c || u.contains(c))) extra.push(c);
          }
        }
        return extra.length ? extra : null;
      };
      const rect = parentRow.getBoundingClientRect();
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      parentRow.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: cx, clientY: cy, pointerType: 'mouse', isPrimary: true, relatedTarget: document.body }));
      parentRow.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false, clientX: cx, clientY: cy, pointerType: 'mouse', isPrimary: true, relatedTarget: document.body }));
      parentRow.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: cx, clientY: cy, relatedTarget: document.body }));
      parentRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: cx, clientY: cy, relatedTarget: document.body }));
      parentRow.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: cx, clientY: cy, pointerType: 'mouse', isPrimary: true }));
      try { parentRow.focus({ preventScroll: true }); } catch {}
      await new Promise(r => setTimeout(r, 30));
      parentRow.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: cx + 2, clientY: cy, pointerType: 'mouse', isPrimary: true }));
      parentRow.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));

      let nextOpts = await waitFor(findFreshSubItems, 300, 25);

      // 若悬停+ArrowRight 尚未展开（例如点击下钻式菜单），补一次点击展开子菜单
      if (!nextOpts) {
        parentRow.click();
        nextOpts = await waitFor(findFreshSubItems, 300, 25);
      }

      if (!nextOpts) {
        failReason = 'submenu-not-open';
        dismissNativeMenu();
        return false;
      }
      const tierTarget = nextOpts.find(o => matchTierText(o.textContent, tierObj))
        || nextOpts.find(o => matchTierText(o.getAttribute('aria-label') || '', tierObj));
      if (tierTarget) {
        activateItem(tierTarget);
        switched = true;
        return true;
      }
      failReason = `no-tier(${nextOpts.map(o => clean(o.textContent).slice(0, 10)).join('/')})`;
      dismissNativeMenu();
      return false;
    } finally {
      setTimeout(() => {
        if (queryNativeItems().length > 0) dismissNativeMenu();
        document.documentElement.removeAttribute('data-ag-probing-model');
        if (open) document.documentElement.setAttribute('data-ag-codex-picker-open', '1');
        applyingSelection = false;
        const liveText = clean(trigger.textContent);
        statusNote = switched
          ? (isEn() ? `Active: ${liveText}` : `已切换：${liveText}`)
          : (isEn() ? `Switch failed (${failReason})` : `切换未生效（${failReason}）`);
        const el = card.querySelector('.cmp-status');
        if (el) el.textContent = statusNote;
        if (pendingSelection) {
          const next = pendingSelection;
          pendingSelection = null;
          void applyNativeSelection(next.baseName, next.tierObj);
        }
      }, 130);
    }
  }

  function positionCard() {
    const trigger = findTrigger();
    if (!open || !trigger || !vis(trigger)) return;
    const composer = trigger.closest('[id="antigravity.agentSidePanelInputBox"]');
    const anchorRect = (composer && vis(composer)) ? composer.getBoundingClientRect() : trigger.getBoundingClientRect();
    const tr = trigger.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const left = Math.max(12, Math.min(innerWidth - cr.width - 12, tr.left));
    const top = anchorRect.top >= cr.height + 16 ? anchorRect.top - cr.height - 10 : Math.max(12, tr.top - cr.height - 10);
    card.style.left = Math.round(left) + 'px';
    card.style.top = Math.round(Math.max(12, top)) + 'px';
  }

  function closeCard() {
    if (!open) return;
    open = false;
    statusNote = '';
    card.hidden = true;
    document.documentElement.removeAttribute('data-ag-codex-picker-open');
  }

  function currentEntry() {
    return catalog.find(m => m.base === activeBase) || catalog[0] || null;
  }

  function triggerBloom(railEl) {
    railEl.querySelector('.cmp-bloom')?.remove();
    const bloom = node('div', 'cmp-bloom');
    bloom.dataset.serial = String(++bloomSerial);
    bloom.append(node('span', 'cmp-halo'));
    for (const m of BLOOM_MOTES) {
      const bp = node('span', 'cmp-bp');
      bp.style.setProperty('--x0', m.x0 + 'px');
      bp.style.setProperty('--y0', m.y0 + 'px');
      bp.style.setProperty('--x1', m.x1 + 'px');
      bp.style.setProperty('--y1', m.y1 + 'px');
      bp.style.setProperty('--sz', m.sz + 'px');
      bp.style.setProperty('--bd', m.bd);
      bp.style.setProperty('--del', m.del);
      bloom.append(bp);
    }
    railEl.append(bloom);
  }

  function renderCard() {
    const en = isEn();
    const dark = card.dataset.theme === 'dark';
    const entry = currentEntry();
    if (!entry) { closeCard(); return; }
    const effs = entry.efforts;
    activeEffortIdx = Math.max(0, Math.min(effs.length - 1, activeEffortIdx));
    const eff = effs[activeEffortIdx];
    card.replaceChildren();

    const applyPalette = tier => {
      card.style.setProperty('--cmp-fill', dark ? tier.fillDark : tier.fillLight);
      card.style.setProperty('--cmp-ink', dark ? tier.inkDark : tier.inkLight);
      card.dataset.peak = String(!!tier.peak);
    };
    applyPalette(eff);

    if (view === 'effort') {
      const head = node('div', 'cmp-head');
      const pinBtn = node('button', 'cmp-icon-btn', '★');
      pinBtn.type = 'button';
      const isPinned = quickChips.some(c => c.base === entry.base && c.tierKey === eff.key);
      pinBtn.setAttribute('aria-pressed', String(isPinned));
      pinBtn.title = en ? 'Pin to Quick-Switch bar (max 3)' : '收藏至底部快切栏（最多 3 个）';
      pinBtn.addEventListener('click', () => {
        if (isPinned) quickChips = quickChips.filter(c => !(c.base === entry.base && c.tierKey === eff.key));
        else quickChips = [{ base: entry.base, tierKey: eff.key, color: eff.fillLight, zh: eff.zh, en: eff.en }, ...quickChips.filter(c => !(c.base === entry.base && c.tierKey === eff.key))].slice(0, 3);
        saveChips();
        renderCard();
      });

      const title = node('div', 'cmp-effort-title', en ? eff.en : eff.zh);
      const nativeBtn = node('button', 'cmp-icon-btn', '↺');
      nativeBtn.type = 'button';
      nativeBtn.title = en ? 'Open Native Model Menu' : '打开原版模型菜单';
      nativeBtn.addEventListener('click', () => {
        closeCard();
        const t = findTrigger();
        if (t) void ensureNativeMenuOpen(t);
      });
      head.append(pinBtn, title, nativeBtn);

      const modelBtn = node('button', 'cmp-model-btn', `${entry.base}  ›`);
      modelBtn.type = 'button';
      modelBtn.title = en ? 'Switch Base Model' : '切换基础模型';
      modelBtn.addEventListener('click', () => { view = 'models'; renderCard(); positionCard(); });

      card.append(head, modelBtn);

      if (effs.length > 1) {
        const rail = node('div', 'cmp-rail');
        const fill = node('div', 'cmp-fill');
        const sparks = node('div', 'cmp-sparks');
        for (const sp of SPARKS) {
          const el = node('span', 'cmp-sp');
          el.style.top = sp.top;
          el.style.setProperty('--b', sp.b);
          el.style.setProperty('--dur', sp.dur);
          el.style.setProperty('--delay', sp.delay);
          sparks.append(el);
        }
        const dotEls = effs.map((_, i) => {
          const d = node('span', 'cmp-dot');
          const tick = effs.length > 1 ? i / (effs.length - 1) : 0;
          d.style.setProperty('--cmp-tick', String(tick));
          return d;
        });
        const knob = node('div', 'cmp-knob');
        // 正确绘制顺序：底轨 -> 填色条 -> 星尘 -> 刻度点（位于填色之上）-> 圆钮
        rail.append(fill, sparks, ...dotEls, knob);

        const labelRow = node('div', 'cmp-tier-labels');
        labelRow.style.gridTemplateColumns = `repeat(${effs.length}, 1fr)`;
        const labelBtns = effs.map((t, i) => {
          const b = node('button', '', en ? t.en : t.zh);
          b.type = 'button';
          b.addEventListener('click', () => {
            const wasPeak = !!effs[activeEffortIdx]?.peak;
            activeEffortIdx = i;
            setPos(i / (effs.length - 1), i, !wasPeak && !!effs[i].peak);
            void applyNativeSelection(entry.base, effs[i]);
          });
          labelRow.append(b);
          return b;
        });

        // 连续浮点位置驱动：点击轨道或档位时走平滑过渡，拖动时 1:1 丝滑跟手，松手磁吸目标刻度
        const setPos = (posFloat, snapIdx, fireBloom = false) => {
          const clamped = Math.max(0, Math.min(1, posFloat));
          rail.style.setProperty('--cmp-pos', clamped.toFixed(4));
          const cur = effs[snapIdx];
          title.textContent = en ? cur.en : cur.zh;
          applyPalette(cur);
          dotEls.forEach((d, i) => d.classList.toggle('passed', i <= snapIdx));
          labelBtns.forEach((b, i) => b.setAttribute('aria-current', String(i === snapIdx)));
          if (!cur.peak) rail.querySelector('.cmp-bloom')?.remove();
          else if (fireBloom) triggerBloom(rail);
        };
        card._setEffortIdx = nextIdx => {
          const wasPeak = !!effs[activeEffortIdx]?.peak;
          activeEffortIdx = Math.max(0, Math.min(effs.length - 1, nextIdx));
          setPos(activeEffortIdx / (effs.length - 1), activeEffortIdx, !wasPeak && !!effs[activeEffortIdx].peak);
        };
        setPos(activeEffortIdx / (effs.length - 1), activeEffortIdx, false);

        const posFromClientX = cx => {
          const r = rail.getBoundingClientRect();
          return Math.max(0, Math.min(1, (cx - r.left - 16) / Math.max(1, r.width - 32)));
        };

        let gesture = null;
        const onWinMove = e => {
          if (!gesture || (gesture.pointerId != null && e.pointerId !== gesture.pointerId)) return;
          if (!gesture.moved && Math.abs(e.clientX - gesture.downX) > 4) {
            gesture.moved = true;
            rail.classList.add('dragging');
          }
          if (!gesture.moved) return;
          const p = posFromClientX(e.clientX);
          const idx = Math.round(p * (effs.length - 1));
          const hitPeak = idx !== gesture.lastIdx && !!effs[idx].peak;
          gesture.lastIdx = idx;
          setPos(p, idx, hitPeak);
        };
        const clearWinListeners = () => {
          window.removeEventListener('pointermove', onWinMove, true);
          window.removeEventListener('pointerup', onWinUp, true);
          window.removeEventListener('pointercancel', onWinCancel, true);
        };
        const onWinUp = e => {
          if (!gesture || (gesture.pointerId != null && e.pointerId !== gesture.pointerId)) return;
          const g = gesture;
          gesture = null;
          clearWinListeners();
          rail.classList.remove('dragging');
          const p = Number.isFinite(e.clientX) ? posFromClientX(e.clientX) : g.lastIdx / (effs.length - 1);
          const idx = Math.round(p * (effs.length - 1));
          const wasPeak = !!effs[activeEffortIdx]?.peak;
          activeEffortIdx = idx;
          setPos(idx / (effs.length - 1), idx, !wasPeak && !!effs[idx].peak);
          void applyNativeSelection(entry.base, effs[idx]);
        };
        const onWinCancel = e => {
          if (!gesture || (gesture.pointerId != null && e.pointerId !== gesture.pointerId)) return;
          gesture = null;
          clearWinListeners();
          rail.classList.remove('dragging');
          setPos(activeEffortIdx / (effs.length - 1), activeEffortIdx, false);
        };
        rail.addEventListener('pointerdown', e => {
          if (e.button !== 0) return;
          e.preventDefault();
          const r = rail.getBoundingClientRect();
          const curKnobX = r.left + 16 + (activeEffortIdx / (effs.length - 1)) * Math.max(1, r.width - 32);
          const grabbedKnob = Math.abs(e.clientX - curKnobX) <= 18;
          const p = posFromClientX(e.clientX);
          const idx = Math.round(p * (effs.length - 1));
          gesture = { pointerId: e.pointerId, downX: e.clientX, moved: grabbedKnob, lastIdx: idx };
          try { rail.setPointerCapture?.(e.pointerId); } catch {}
          window.addEventListener('pointermove', onWinMove, true);
          window.addEventListener('pointerup', onWinUp, true);
          window.addEventListener('pointercancel', onWinCancel, true);
          if (grabbedKnob) {
            // 按住圆钮拖动：立即放大圆钮并关闭宽度过渡，实现 1:1 实时跟手
            rail.classList.add('dragging');
            setPos(p, idx, false);
          } else {
            // 直接点击轨道目标刻度（无论升高还是回退低档）：保持平滑过渡，让进度条与圆钮丝滑滑过去
            const wasPeak = !!effs[activeEffortIdx]?.peak;
            setPos(idx / (effs.length - 1), idx, !wasPeak && !!effs[idx].peak);
          }
        });
        card.append(rail, labelRow);
      } else {
        const applyBtn = node('button', 'cmp-model-btn', en ? 'Apply Model' : '确认使用此模型');
        applyBtn.type = 'button';
        applyBtn.addEventListener('click', () => void applyNativeSelection(entry.base, null));
        card.append(applyBtn);
      }

      card.append(node('div', 'cmp-status', statusNote));

      if (quickChips.length) {
        const qbar = node('div', 'cmp-quick-bar');
        for (const item of quickChips.slice(0, 3)) {
          const chip = node('button', 'cmp-chip');
          chip.type = 'button';
          chip.style.setProperty('--chip-c', item.color || '#3a83f7');
          const shortBase = item.base.replace(/^Gemini\s+/i, 'G').replace(/^Claude\s+/i, '');
          chip.append(node('span', 'cmp-chip-dot'), node('span', '', `${shortBase} · ${en ? item.en : item.zh}`));
          chip.addEventListener('click', () => {
            const targetTier = STANDARD_TIERS.find(t => t.key === item.tierKey) || null;
            activeBase = item.base;
            const ent = currentEntry();
            if (ent && targetTier) {
              const idx = ent.efforts.findIndex(e => e.key === targetTier.key);
              if (idx >= 0) activeEffortIdx = idx;
            }
            renderCard();
            void applyNativeSelection(item.base, targetTier);
          });
          qbar.append(chip);
        }
        card.append(qbar);
      }
      return;
    }

    // 二级面板：按厂商分组的模型列表 + 搜索
    const head = node('div', 'cmp-head');
    const backBtn = node('button', 'cmp-icon-btn', '‹');
    backBtn.type = 'button';
    backBtn.title = en ? 'Back' : '返回推理滑条';
    backBtn.addEventListener('click', () => { view = 'effort'; renderCard(); positionCard(); });
    const listTitle = node('div', 'cmp-effort-title', en ? 'Select Model' : '切换模型');
    listTitle.style.color = 'var(--cmp-fg)';
    listTitle.style.fontSize = '14px';
    const nativeBtn = node('button', 'cmp-icon-btn', '↺');
    nativeBtn.type = 'button';
    nativeBtn.title = en ? 'Open Native Menu' : '打开原版菜单';
    nativeBtn.addEventListener('click', () => {
      closeCard();
      const t = findTrigger();
      if (t) void ensureNativeMenuOpen(t);
    });
    head.append(backBtn, listTitle, nativeBtn);

    const search = node('input', 'cmp-search');
    search.type = 'search';
    search.placeholder = en ? 'Search models…' : '搜索模型…';
    const list = node('div', 'cmp-list');

    const drawList = () => {
      const q = clean(search.value).toLowerCase();
      list.replaceChildren();
      const byProv = new Map();
      for (const m of catalog) {
        if (q && !m.base.toLowerCase().includes(q) && !m.provider.toLowerCase().includes(q)) continue;
        if (!byProv.has(m.provider)) byProv.set(m.provider, []);
        byProv.get(m.provider).push(m);
      }
      for (const [prov, rows] of byProv) {
        list.append(node('div', 'cmp-group', prov));
        for (const m of rows) {
          const row = node('button', 'cmp-row');
          row.type = 'button';
          row.setAttribute('aria-selected', String(m.base === activeBase));
          const left = node('span', 'cmp-row-left');
          left.append(node('span', 'cmp-row-name', m.base));
          if (m.efforts.length > 1) {
            left.append(node('span', 'cmp-tier-pill', en ? `${m.efforts.length} tiers` : `${m.efforts.length} 档`));
          }
          row.append(left, node('span', '', m.base === activeBase ? '✓' : '›'));
          row.addEventListener('click', () => {
            activeBase = m.base;
            activeEffortIdx = Math.min(activeEffortIdx, m.efforts.length - 1);
            statusNote = '';
            view = 'effort';
            renderCard();
            positionCard();
            void applyNativeSelection(m.base, m.efforts.length > 1 ? m.efforts[activeEffortIdx] : null);
          });
          list.append(row);
        }
      }
    };
    search.addEventListener('input', drawList);
    drawList();
    card.append(head, search, list);
    setTimeout(() => search.focus(), 20);
  }

  async function openForTrigger(trigger) {
    if (open) { closeCard(); return; }
    if (!catalog.length) {
      const items = await probeNativeCatalog(trigger);
      catalog = buildCatalog(items, 'dom');
      catalogSource = 'dom';
    }
    if (catalog.length < 2) {
      void ensureNativeMenuOpen(trigger);
      return;
    }
    const curParsed = parseModelOption(trigger.textContent || '', true);
    const matched = curParsed && catalog.find(m => m.base.toLowerCase() === curParsed.base.toLowerCase());
    if (matched) {
      activeBase = matched.base;
      const idx = curParsed.tier ? matched.efforts.findIndex(e => e.key === curParsed.tier.key) : 1;
      activeEffortIdx = idx >= 0 ? idx : Math.min(1, matched.efforts.length - 1);
    } else {
      activeBase = catalog[0].base;
      activeEffortIdx = Math.min(1, catalog[0].efforts.length - 1);
    }
    const rgb = getComputedStyle(trigger).color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    card.dataset.theme = rgb?.length === 3 && rgb[0] * 0.21 + rgb[1] * 0.72 + rgb[2] * 0.07 > 145 ? 'dark' : 'light';
    statusNote = '';
    view = 'effort';
    open = true;
    document.documentElement.setAttribute('data-ag-codex-picker-open', '1');
    card.hidden = false;
    renderCard();
    positionCard();
  }

  for (const evtName of ['pointerdown', 'mousedown']) {
    document.addEventListener(evtName, e => {
      if (!enabled || bypassNativeClick) return;
      const trigger = e.target?.closest?.('[data-testid="model-selector-trigger"]');
      if (!trigger) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
  }

  document.addEventListener('click', e => {
    if (!enabled || bypassNativeClick) return;
    const trigger = e.target?.closest?.('[data-testid="model-selector-trigger"]');
    if (!trigger) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void openForTrigger(trigger);
  }, true);

  document.addEventListener('pointerdown', e => {
    if (applyingSelection || bypassNativeClick) return;
    if (open && !card.contains(e.target) && !e.target?.closest?.('[data-testid="model-selector-trigger"]')) closeCard();
  }, true);

  document.addEventListener('keydown', e => {
    if (!open || applyingSelection) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeCard(); return; }
    if (view === 'effort') {
      const entry = currentEntry();
      if (!entry || entry.efforts.length <= 1) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        const nextIdx = e.key === 'Home' ? 0 : e.key === 'End' ? entry.efforts.length - 1
          : Math.max(0, Math.min(entry.efforts.length - 1, activeEffortIdx + (e.key === 'ArrowRight' ? 1 : -1)));
        if (typeof card._setEffortIdx === 'function') card._setEffortIdx(nextIdx);
        else { activeEffortIdx = nextIdx; renderCard(); }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        void applyNativeSelection(entry.base, entry.efforts[activeEffortIdx]);
      }
    }
  }, true);

  window.addEventListener('resize', positionCard);

  window.__agModelPicker = Object.freeze({
    setEnabled(next) { enabled = next !== false; if (!enabled) closeCard(); return enabled; },
    setCatalog(items, source = 'cli', version = 0) {
      if (Array.isArray(items) && items.length >= 2) {
        const prevSig = JSON.stringify(catalog.map(m => [m.base, m.efforts.map(e => e.key)]));
        const prevKey = currentEntry()?.efforts?.[activeEffortIdx]?.key || null;
        const nextCatalog = buildCatalog(items, source);
        const nextSig = JSON.stringify(nextCatalog.map(m => [m.base, m.efforts.map(e => e.key)]));
        catalog = nextCatalog;
        catalogSource = source;
        catalogVersion = version;
        const matched = catalog.find(m => m.base.toLowerCase() === activeBase.toLowerCase());
        if (matched && prevKey) {
          const idx = matched.efforts.findIndex(e => e.key === prevKey);
          if (idx >= 0) activeEffortIdx = idx;
        }
        if (open && prevSig !== nextSig) { renderCard(); positionCard(); }
      }
      return catalog.length;
    },
    parseModelOption,
    buildCatalog,
    getStatus: () => ({ enabled, open, catalogCount: catalog.length, catalogSource, catalogVersion, quickChips: quickChips.length })
  });
  return { mounted: true };
})(__AG_INITIAL_MODEL_PICKER__, __AG_INITIAL_CLI_MODELS__)
