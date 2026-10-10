/* Public dialog. An opaque browser session isolates conversations. */
(() => {
  "use strict";
  const config = window.TianyanAssistantConfig || {};
  const api = (config.apiBase || "").replace(/\/$/, "");
  const storageKey = "tianyan_assistant_session_v1";
  let session = null, busy = false, timer = null, opener = null, opened = false, connecting = null;
  try { session = JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch (_) {}
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const overlay = el("div", "ty-assistant-overlay");
  overlay.hidden = true;
  const panel = el("section", "ty-assistant-panel");
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "tyAssistantTitle");
  const header = el("header", "ty-assistant-header");
  const heading = el("div");
  const title = el("h2", "", config.title || "天眼 AI 助手"); title.id = "tyAssistantTitle";
  const state = el("p", "ty-assistant-state", "投顾 · 私募 · 专户 · 基金数据问答");
  heading.append(title, state);
  const close = el("button", "ty-assistant-close", "×"); close.type = "button"; close.setAttribute("aria-label", "关闭对话");
  header.append(heading, close);
  const transcript = el("div", "ty-assistant-transcript");
  transcript.setAttribute("role", "log"); transcript.setAttribute("aria-live", "polite");
  const notice = el("p", "ty-assistant-notice"); notice.hidden = true; notice.setAttribute("role", "status");
  const footer = el("div", "ty-assistant-footer");
  const form = el("form", "ty-assistant-compose");
  const label = el("label", "ty-assistant-sr-only", "输入问题"); label.htmlFor = "tyAssistantQuestion";
  const input = el("textarea"); input.id = "tyAssistantQuestion"; input.rows = 2; input.maxLength = 16000;
  input.placeholder = "输入筛选条件、产品名称或数据问题…";
  const send = el("button", "ty-assistant-primary", "发送"); send.type = "submit";
  form.append(label, input, send);
  const tools = el("div", "ty-assistant-tools");
  const logout = el("button", "ty-assistant-text-button", "新对话"); logout.type = "button";
  tools.append(logout);
  footer.append(form, tools); panel.append(header, notice, transcript, footer); overlay.append(panel);
  document.body.append(overlay);

  function persist() {
    if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
    else sessionStorage.removeItem(storageKey);
  }
  function showNotice(text) { notice.textContent = text; notice.hidden = !text; }
  function controls() {
    send.disabled = busy || !session; input.disabled = busy || !session; logout.disabled = busy || !session;
    send.textContent = busy ? "处理中" : session ? "发送" : "连接中";
  }
  async function connect() {
    if (session && session.expires_at * 1000 > Date.now()) return;
    if (connecting) return connecting;
    session = null; persist(); controls();
    connecting = request("/v1/sessions", "POST", {}).then(value => { session = value; persist(); controls(); }).finally(() => { connecting = null; });
    return connecting;
  }
  async function request(path, method = "GET", body) {
    const headers = {};
    if (session) headers.Authorization = "Bearer " + session.token;
    if (body) headers["Content-Type"] = "application/json";
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(api + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache: "no-store" });
      const value = await response.json();
      if (!response.ok) {
        if (response.status === 401 && path !== "/v1/sessions") { session = null; persist(); controls(); }
        throw new Error(value.error || "请求未完成");
      }
      return value;
    } catch (error) {
      if (error instanceof TypeError || error.name === "AbortError") throw new Error("暂时无法连接助手。已提交的任务会保留，请稍后重新打开对话。");
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function businessText(node, text) {
    // Render a small Markdown subset without innerHTML, embedded scripts or remote HTML.
    const regex = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*/g;
    let last = 0, match;
    while ((match = regex.exec(text))) {
      node.append(document.createTextNode(text.slice(last, match.index)));
      if (match[3]) node.append(el("strong", "", match[3]));
      else {
        let safe = false;
        try { const url = new URL(match[2]); safe = url.protocol === "https:" && url.hostname === "gfinvest.site"; } catch (_) {}
        if (safe) { const link = el("a", "", match[1]); link.href = match[2]; link.target = "_blank"; link.rel = "noopener noreferrer"; node.append(link); }
        else node.append(document.createTextNode(match[1]));
      }
      last = regex.lastIndex;
    }
    node.append(document.createTextNode(text.slice(last)));
  }
  async function download(task, file) {
    try {
      const response = await fetch(api + "/v1/tasks/" + task.id + "/files/" + file.id, { headers: { Authorization: "Bearer " + session.token }, cache: "no-store" });
      if (!response.ok) throw new Error("附件尚未就绪或访问已过期");
      const blob = await response.blob();
      if (blob.size !== file.size) throw new Error("附件下载不完整，请重试");
      const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
      if (Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("") !== file.sha256) throw new Error("附件校验失败，请重试");
      const url = URL.createObjectURL(blob); const link = el("a"); link.href = url; link.download = file.name;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) { showNotice(error.message); }
  }
  function render(tasks) {
    transcript.replaceChildren();
    if (!tasks.length) {
      const welcome = el("div", "ty-assistant-welcome");
      welcome.append(el("p", "ty-assistant-eyebrow", "从一个具体问题开始"), el("h3", "", "把产品筛选和评价条件说清楚"),
        el("p", "", "答复会保留数据时间、筛选口径和查看来源的链接。缺少关键条件时，助手会继续追问。"));
      for (const question of ["当前持仓中出现次数最多的权益基金，给出前十", "成立超过一年，近一年收益超过10%、成立以来最大回撤小于30%的投顾组合有哪些？"]) {
        const example = el("button", "ty-assistant-example", question); example.type = "button";
        example.onclick = () => { input.value = question; input.focus(); }; welcome.append(example);
      }
      transcript.append(welcome);
    }
    for (const task of tasks) {
      const user = el("article", "ty-assistant-message ty-assistant-user"); user.append(el("span", "ty-assistant-role", "你"), el("div", "ty-assistant-content", task.question));
      const answer = el("article", "ty-assistant-message ty-assistant-answer"); answer.append(el("span", "ty-assistant-role", "天眼助手"));
      const body = el("div", "ty-assistant-content");
      if (task.answer) businessText(body, task.answer);
      else body.append(el("p", "ty-assistant-progress", task.stage || "问题已提交"));
      answer.append(body);
      if (task.status === "clarification") {
        const options = el("div", "ty-assistant-options");
        for (const option of task.result.options || []) {
          const button = el("button", "ty-assistant-option", option); button.type = "button"; button.disabled = busy;
          button.onclick = () => { input.value = option; form.requestSubmit(); }; options.append(button);
        }
        answer.append(options);
      }
      if (task.result && task.result.business_status === "partial_artifact") answer.append(el("p", "ty-assistant-partial", "部分附件尚未生成，以上答复已说明可用范围。"));
      const files = el("div", "ty-assistant-files");
      for (const file of task.attachments || []) {
        const button = el("button", "ty-assistant-file", (file.kind === "png" ? "↓ 图片" : "↓ 数据表格") + " · " + (file.size / 1024).toFixed(0) + " KB");
        button.type = "button"; button.onclick = () => download(task, file); files.append(button);
      }
      answer.append(files); transcript.append(user, answer);
    }
    transcript.scrollTop = transcript.scrollHeight;
  }
  async function refresh() {
    if (!session || !opened) return;
    try {
      const [list, health] = await Promise.all([request("/v1/tasks"), request("/v1/health")]);
      setHealth(health.worker_online === true);
      const tasks = list.tasks.reverse(); busy = tasks.some(t => ["queued", "processing"].includes(t.status));
      if (session.pending && tasks.some(t => t.client_message_id === session.pending.client_message_id)) { delete session.pending; persist(); }
      render(tasks); controls(); showNotice("");
      state.textContent = health.worker_online ? (busy ? "本地助手正在处理，请稍等" : "助手在线 · 可以继续提问") : "后台不在线，请联系mjx启动ai助手服务";
      timer = setTimeout(refresh, busy ? 3000 : 15000);
    } catch (error) {
      showNotice(error.message);
      if (!session && opened) { try { await connect(); timer = setTimeout(refresh, 100); } catch (connectionError) { showNotice(connectionError.message); timer = setTimeout(open, 6000); } }
      else if (session) timer = setTimeout(refresh, 6000);
    }
  }
  async function open() {
    opener = document.activeElement; overlay.hidden = false; opened = true; document.body.classList.add("ty-assistant-open");
    controls();
    if (!api) { showNotice("助手连接正在配置，暂未开放提问。"); return; }
    render([]); state.textContent = "正在连接助手…";
    try { clearTimeout(timer); await connect(); await refresh(); input.focus(); }
    catch (error) { showNotice(error.message); if (opened) timer = setTimeout(open, 6000); }
  }
  function hide() { overlay.hidden = true; opened = false; clearTimeout(timer); document.body.classList.remove("ty-assistant-open"); if (opener) opener.focus(); }
  close.onclick = hide; overlay.onclick = event => { if (event.target === overlay) hide(); };
  panel.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); hide(); }
    if (event.key === "Tab") {
      const focusables = [...panel.querySelectorAll("button:not([disabled]),input,textarea,a[href]")].filter(n => n.getClientRects().length);
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  form.onsubmit = async event => {
    event.preventDefault(); if (busy || !session || !input.value.trim()) return;
    busy = true; controls(); clearTimeout(timer);
    const payload = session.pending && session.pending.question === input.value.trim() ? session.pending : { question: input.value.trim(), client_message_id: crypto.randomUUID() };
    session.pending = payload; persist();
    try { await request("/v1/tasks", "POST", payload); delete session.pending; persist(); input.value = ""; await refresh(); }
    catch (error) { busy = false; controls(); showNotice(error.message); if (session) timer = setTimeout(refresh, 4000); else timer = setTimeout(open, 1000); }
  };
  input.onkeydown = event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } };
  logout.onclick = () => { clearTimeout(timer); session = null; persist(); busy = false; input.value = ""; showNotice(""); open(); };
  const existingTriggers = [...document.querySelectorAll("[data-tianyan-assistant]")];
  if (existingTriggers.length) {
    for (const trigger of existingTriggers) { trigger.type = "button"; trigger.onclick = open; }
  } else {
    const trigger = el("button", "nav-link ty-assistant-trigger", "AI助手");
    trigger.type = "button"; trigger.dataset.tianyanAssistant = ""; trigger.onclick = open;
    const nav = document.querySelector(".topbar .nav,.siteNav,header.top nav,.actions");
    if (nav) nav.append(trigger); else { trigger.classList.add("ty-assistant-floating"); document.body.append(trigger); }
  }
  window.TianyanAssistant = { open, close: hide };
  const statusLabel=el('span','ty-assistant-status-label','检测中');
  const statusDot=el('span','ty-assistant-status-dot');statusDot.setAttribute('aria-hidden','true');
  const indicators=[];
  for(const trigger of document.querySelectorAll('[data-tianyan-assistant]')){
    const dot=statusDot.cloneNode(true),label=statusLabel.cloneNode(true);trigger.append(dot,label);indicators.push({trigger,dot,label});
  }
  const healthBadge=el('span','ty-assistant-health');healthBadge.setAttribute('role','status');
  healthBadge.append(statusDot,statusLabel);heading.append(healthBadge);
  indicators.push({trigger:healthBadge,dot:statusDot,label:statusLabel});
  function setHealth(online){
    for(const {trigger,label} of indicators){trigger.dataset.online=String(online);label.textContent=online?'在线':'离线';trigger.title=online?'AI助手后台在线':'后台不在线，请联系mjx启动ai助手服务';}
    healthBadge.setAttribute('aria-label',online?'AI助手后台在线':'后台不在线，请联系mjx启动ai助手服务');
    if(!online)state.textContent='后台不在线，请联系mjx启动ai助手服务';
    else if(state.textContent.startsWith('后台不在线'))state.textContent='助手在线 · 可以继续提问';
  }
  async function checkHealth(){
    try{const response=await fetch(api+'/v1/health',{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!response.ok)throw Error('health');const health=await response.json();setHealth(health.worker_online===true);}
    catch{setHealth(false);}
  }
  if(api){checkHealth();setInterval(()=>{if(!document.hidden)checkHealth();},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkHealth();});}
  else setHealth(false);
})();
