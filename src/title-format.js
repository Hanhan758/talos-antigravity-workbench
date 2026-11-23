(() => {
  'use strict';
  if (window !== window.top || location.protocol !== 'https:' || location.hostname !== '127.0.0.1' ||
      !location.port || location.username || location.password ||
      typeof window.electronNative?.getZoomLevel !== 'function' ||
      typeof window.electronNative?.setTitleBarOverlay !== 'function') return false;
  if (window.__agTitleFormat) return true;

  const kinds = [
    ['修复', /修复|修好|修正|排错|排查|调试|解决.{0,14}(?:报错|故障|崩溃)|\b(?:fix(?:ing)?|debug(?:ging)?|troubleshoot(?:ing)?)\b/i],
    ['优化', /优化|提速|改进|精简|重构|缩短|减少.{0,8}耗时|\b(?:optimi[sz](?:e|ing|ation)|improv(?:e|ing|ement)|refactor(?:ing)?|speed up)\b/i],
    ['文档', /写.{0,9}(?:说明|文档|手册|指南|报告|教程)|撰写|编写.{0,8}(?:文档|指南|教程)|整理.{0,8}(?:文档|指南|说明)|\b(?:document(?:ing)?|write (?:a |the )?(?:guide|readme|manual|report)|draft(?:ing)?)\b/i],
    ['设计', /设计|画.{0,4}(?:原型|草图)|排版|\b(?:design(?:ing)?|prototype|wireframe|layout)\b/i],
    ['发布', /发布|发版|上线|部署|\b(?:release|publish|deploy)(?:ment|ing)?\b/i],
    ['研究', /研究|调研|分析|比较|对比|解释|讲解|为什么|为何|什么是|是什么|原理|\b(?:research(?:ing)?|investigat(?:e|ing|ion)|analy[sz](?:e|ing)|compare|explain|why|what is)\b/i],
    ['探索', /探索|试试|试验|能否|能不能|是否可以|可行性|\b(?:explore|experiment|feasibility|brainstorm)\b/i],
    ['功能', /新增|新建|增加|添加|加入|加上|实现|开发|搭建|集成|接入|创建|制作|生成|支持|\b(?:create|build|implement|integrate|enable|add)(?:s|d|ing)?\b/i]
  ];
  const manual = /(?:本次|当前|这(?:个|次|条))?(?:对话|会话|聊天)(?:的)?(?:标题|名字|名称)?(?:请|就|直接)?(?:命名为|命名成|命名[:：]|取名为?|起名为?|改名为|改为|改叫|改成|叫作?|设为|定为|设置为|更名为|用[：:《「“"])|(?:^|[\n，。；])\s*(?:请)?(?:标题|对话名|会话名)\s*[:：]|(?:^|[，。；\n])\s*(?:请|帮我|把|将|直接|自定义)*(?:标题|会话名|对话名)(?:就叫|改成|改为|设为|定为|设置为|取名为|为)|(?:不要|别|无需)(?:自动)?(?:命名|改名|重命名|更改.{0,4}标题)|\b(?:name|title|rename|call)\s+(?:this|the current)\s+(?:chat|conversation|session|thread)\s+\S|\b(?:do not|don't)\s+rename\s+(?:this|the)\s+(?:chat|conversation|session|thread)/i;
  const compliant = /^(?:功能|设计|修复|优化|发布|探索|文档|研究)[｜|][^\r\n|｜]+\s*\|\s*(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/;
  const placeholder = /^(?:new (?:conversation|chat|session|thread)|untitled(?: conversation| chat)?|conversation|chat|新建(?:会话|对话|聊天)|新的?(?:会话|对话|聊天)|未命名(?:会话|对话)?|无标题|[.…]+)$/i;
  const filler = /^(?:(?:嗯+|好的?|行|可以|谢谢|没问题|继续|下一步|确认|收到|在吗|你好|您好|早上好|晚上好|开始(?:吧|工作)?|测试(?:一下)?|帮(?:我)?(?:一下|看看|分析一下)?|看看|这个|那个|处理一下|帮我解决问题|hi|hello|hey|ok(?:ay)?|yes|thanks?|continue|go ahead|please help|test)[\s，,。！!.?？～~]*)+$/i;
  const day = new Intl.DateTimeFormat('en-US', { timeZone:'Asia/Shanghai', month:'2-digit', day:'2-digit' });

  function safeTopic(value) {
    if (!value || placeholder.test(value) || filler.test(value)) return false;
    if (/(?:https?:\/\/|www\.|(?:^|\s)(?:[~\/]|[A-Za-z]:[\\/])|[\w.+-]+@[\w.-]+\.[a-z]{2,}|[A-Za-z0-9_\-]{36,}|[<>{}=]|(?:api[_ -]?key|password|密码|密钥)\s*[:：=])/i.test(value)) return false;
    return (value.match(/\p{Script=Han}/gu)?.length || 0) >= 2 || /[\p{L}\d]{3}/u.test(value);
  }

  function subject(message) {
    const clauses = message.split(/[\n。！？!?；;，,]/).map(line => line.trim());
    for (let line of clauses) {
      // 跳过格式要求、寒暄，不把这些片段作为主题。
      if (!line || filler.test(line) || /^(?:请)?(?:只需|只要|只回复|只回答|不需要|无需|输出格式|用一句话回答|用中文回答|answer (?:only|in)|respond (?:only|in))/.test(line)) continue;
      line = line.replace(/^(?:请问|请你|麻烦你?|劳烦|能否请你|请|帮我|我希望|我想要?|能不能帮我|可以帮我)+\s*/, '')
        .replace(/^(?:用(?:一句话|中文|简体中文)\s*)/, '')
        .replace(/^(?:please\s+|could you\s+|can you\s+|help me\s+)+/i,'')
        .replace(/^(?:写一份|编写一份|写一个|制作一个|写一篇|撰写一篇|研究一下|分析一下|解释一下|解释|研究|优化|修复|新增|实现|添加|设计|探索|调研|搭建)\s*/, '')
        .replace(/[。.!！?？：:，,\s]+$/u,'').trim();
      if (safeTopic(line) && !/^(?:一下|代码|问题|方案|功能|内容|项目|任务|这里|一下这个|一下这个问题|这个问题|这个功能|这段代码|it|this|that|something)$/i.test(line)) return line;
    }
    return '';
  }

  function classify(message, fallback) {
    let label = '', first = Infinity;
    for (const [kind, re] of kinds) {
      const at = message.search(re);
      if (at >= 0 && at < first) { first = at; label = kind; }
    }
    if (label) return label;
    if (fallback) return classify(fallback, '');
    if (/README|文档|手册|教程|指南/i.test(message)) return '文档';
    if (/报错|异常|bug|error|崩溃/i.test(message)) return '修复';
    return '探索';
  }

  // 名称取自原生标题、用户原话或已显示的项目名称。别名只在同时有英文原文作证时使用。
  const aliases = [
    ['Antigravity','谷歌反重力','反重力'],
    ['Anthropic','安索匹克'],['Obsidian','黑曜石'],['OpenAI','开放人工智能公司','开放人工智能'],
    ['Cloudflare','克劳德弗莱尔'],['GitHub','开源代码托管平台'],
    ['Codex','法典编程助手'],['MCP','模型上下文协议'],['AI','人工智能']
  ];
  const escapeRE = s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const namedRE = s=>new RegExp('(?<![a-zA-Z0-9_])'+escapeRE(s)+'(?![a-zA-Z0-9_])','gi');
  const latinPart = /(?:@[A-Za-z][\w.-]*\/|\.(?=[A-Z]))?[A-Za-z][A-Za-z\d_]*(?:(?:[-./][A-Za-z\d_]+)|(?:\+\+|#))*/g;
  function protectTopic(candidate,extracted,raw,existing,projectNames) {
    const source=[raw,existing], keep=[];
    function remember(n) {
      if(!n || !/[a-z]/i.test(n) || n.length>55 || !safeTopic('名称 '+n))return;
      if(keep.some(x=>x.toLowerCase()===n.toLowerCase()))return;
      keep.push(n);
    }
    // 混合中英文时，保留原句中的完整英文名称及相邻词；例如 “Talos Root Atlas UI”。
    const phrases=extracted.match(/[A-Za-z.][A-Za-z0-9_@.+#/-]*(?:[ \t]+[A-Za-z0-9][A-Za-z0-9_@.+#/-]*)*/g)||[];
    if (/\p{Script=Han}/u.test(extracted)) for(const phrase of phrases) remember(phrase.replace(/[.]+$/,''));
    for(const m of raw.matchAll(/[`“「《]([A-Za-z.][A-Za-z\d .+_#/-]{0,52})[`”」》]/g))remember(m[1]);
    for(const n of Array.isArray(projectNames)?projectNames:[]){
      if(typeof n!=='string'||n.length>55||!/[a-z]/i.test(n))continue;
      if(source.some(s=>namedRE(n).test(s)))remember(n);
    }
    for(const [key,...translations] of aliases){
      const exact=source.map(s=>s.match(namedRE(key))?.[0]).find(Boolean);if(!exact)continue;
      remember(exact);
      for(const alias of translations)candidate=candidate.split(alias).join(' '+exact+' ');
    }
    for(const m of existing.matchAll(latinPart)){
      const token=m[0];
      if (/[a-z][A-Z]|[A-Z]{2,}|[-._+#]/.test(token))remember(raw.match(namedRE(token))?.[0]||token);
    }
    // 原摘要中的未知英文名称无法可靠拆词时，宁可保留原文，也不采用已丢失名称的中文摘要。
    const ordinary = /^(?:a|an|the|and|or|in|on|for|to|of|with|from|by|create|creating|build|building|design|designing|review|reviewing|analysis|analyze|evaluate|evaluation|implementation|implement|fix|fixing|audit|research|explore|configure|configuration|setup|update|updating|optimize|optimization|architecture|introduction|copywriting|documentation|documents?|articles?|project|local|guide|file|files|system|workflow|profile|access|inquiry|concepts?|integration|import|translation|summary|planning|content|application|app|models?|test|tests|interface|plugin|prompts?|management|support|naming|message|messages|collection|structure|basic|new|study)$/i;
    if(existing && !/\p{Script=Han}/u.test(existing) && /\p{Script=Han}/u.test(raw)){
      const unfamiliar=[...existing.matchAll(latinPart)].map(m=>m[0]).filter(w=>/[A-Z]/.test(w) && !ordinary.test(w) &&
        !keep.some(n=>namedRE(w).test(n)) && !namedRE(w).test(candidate));
      if(unfamiliar.length && safeTopic(existing))candidate=existing;
    }
    const longest=keep.filter(n=>!keep.some(other=>other!==n && other.length>n.length && namedRE(n).test(other)));
    for(const n of longest)candidate=candidate.replace(namedRE(n),()=>n);
    const missing=()=>longest.filter(n=>!namedRE(n).test(candidate));
    if(missing().length && longest.every(n=>namedRE(n).test(extracted)))candidate=extracted;
    const rest=missing();
    if(rest.length)candidate+=' · '+rest.join('、');
    candidate=candidate.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069|｜]/g,' ').replace(/\s+/g,' ').trim();
    const soft=/\p{Script=Han}/u.test(candidate)?24:52;
    if(candidate.length<=soft)return candidate;
    let limit=soft;
    // 不截断标识符或多词名称；超过硬上限时保留原生标题，等待更清楚的主题。
    for(const n of longest){
      const pos=candidate.search(namedRE(n));
      if(pos>=0)limit=Math.max(limit,pos+n.length);
    }
    for(const m of candidate.matchAll(latinPart))if(m.index<limit&&m.index+m[0].length>limit)limit=m.index+m[0].length;
    if(limit>55)return '';
    const result=Array.from(candidate).slice(0,limit).join('').replace(/[\s、，,：:（(的与和及]+$/u,'').trim();
    return longest.every(n=>namedRE(n).test(result)) && result.length<=55 ? result:'';
  }

  function propose({message, nativeTitle, createdAt, projectNames=[]} = {}) {
    if (typeof message !== 'string') return {state:'wait'};
    const raw = message.slice(0,8192).trim();
    const existing = typeof nativeTitle === 'string' ? nativeTitle.trim() : '';
    if (compliant.test(existing) || compliant.test(raw) || manual.test(raw)) return {state:'skip'};
    if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt < Date.UTC(2000,0,1) || createdAt > Date.now()+300000) return {state:'wait'};
    const extracted = subject(raw);
    if (!extracted) return {state:'wait'};
    // 原生摘要通常已提炼主题。中文提问遇到英文摘要时，优先采用用户自己的中文。
    const useNative = existing.length <= 100 && safeTopic(existing) && (!/\p{Script=Han}/u.test(raw) || /\p{Script=Han}/u.test(existing));
    let topic = (useNative ? existing : extracted).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069|｜]/g,' ').replace(/\s+/g,' ').trim();
    topic = protectTopic(topic,extracted,raw,existing,projectNames);
    if (!topic) return {state:'skip'};
    if (!safeTopic(topic)) return {state:'wait'};
    const parts = day.formatToParts(createdAt);
    const mmdd = parts.find(p=>p.type==='month').value + parts.find(p=>p.type==='day').value;
    return {state:'ready', title:classify(raw, useNative ? existing : '') + '｜' + topic + ' | ' + mmdd};
  }

  Object.defineProperty(window,'__agTitleFormat',{value:Object.freeze({propose})});
  return true;
})()
