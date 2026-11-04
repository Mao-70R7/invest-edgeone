/* Public dialog. An opaque browser session isolates conversations. */
(() => {
  "use strict";
  const config = window.TianyanAssistantConfig || {};
  const api = (config.apiBase || "").replace(/\/$/, "");
  const storageKey = "tianyan_assistant_session_v1";
  let session = null, busy = false, timer = null, opener = null, opened = false, connecting = null;
  let submitting = false, workerOnline = null, taskConnectionOk = true, activeTasks = [], generation = 0, refreshId = 0;
  const renderedStates = new Map();
  const active = task => ["queued", "processing"].includes(task.status);
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
    try {
      if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
      else sessionStorage.removeItem(storageKey);
    } catch (_) {} // Storage restrictions must never lock the composer.
  }
  function showNotice(text) { notice.textContent = text; notice.hidden = !text; }
  function controls() {
    busy = submitting || (workerOnline === true && taskConnectionOk && activeTasks.some(active));
    send.disabled = busy; input.disabled = false; logout.disabled = false;
    send.textContent = submitting ? "发送中" : busy ? "处理中" : "发送";
  }
  async function connect() {
    if (session && session.expires_at * 1000 > Date.now()) return;
    if (connecting) return connecting;
    session = null; persist(); controls();
    const version = generation;
    const pending = request("/v1/sessions", "POST", {}).then(value => {
      if (version !== generation) return;
      session = value; persist(); controls();
    }).finally(() => { if (connecting === pending) connecting = null; });
    connecting = pending; return pending;
  }
  async function request(path, method = "GET", body) {
    const headers = {};
    const owner = session;
    if (owner) headers.Authorization = "Bearer " + owner.token;
    if (body) headers["Content-Type"] = "application/json";
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), path === "/v1/health" ? 6000 : 12000);
    try {
      const response = await fetch(api + path, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: controller.signal, cache: "no-store" });
      let value;
      try { value = await response.json(); }
      catch (error) { if (error.name === "AbortError") throw error; throw new Error("助手服务返回异常，问题内容已保留，请重试或新建对话。"); }
      if (!response.ok) {
        if (response.status === 401 && path !== "/v1/sessions" && session === owner) { session = null; persist(); controls(); }
        throw new Error(value.error || "请求未完成");
      }
      return value;
    } catch (error) {
      if (error instanceof TypeError || error.name === "AbortError") throw new Error("助手连接超时或暂时不可用。问题内容已保留，可重试或点击新对话。");
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function safeResultURL(value) {
    try { const u = new URL(value); return u.protocol === "https:" && u.hostname === "gfinvest.site" && !u.username && !u.password && (!u.port || u.port === "443"); } catch (_) { return false; }
  }
  function resultLink(label, url) {
    if (!safeResultURL(url)) return null;
    const a = el("a", "ty-result-link", label); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; return a;
  }
  function plotResult(chart) {
    if (!chart || !["line", "bar"].includes(chart.kind) || !Array.isArray(chart.points) || !chart.points.length || chart.points.length > 400) return null;
    const points = chart.points;
    if (points.some(p => !Array.isArray(p) || typeof p[1] !== "number" || !Number.isFinite(p[1]))) return null;
    const fig = el("figure", "ty-result-chart"); fig.append(el("figcaption", "", chart.title + " · " + chart.unit));
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    const compactBars = chart.kind === "bar" && window.matchMedia("(max-width:640px)").matches;
    const width = compactBars ? 360 : 640, height = chart.kind === "bar" ? Math.max(170, points.length * 36 + 30) : 220;
    svg.setAttribute("viewBox", "0 0 " + width + " " + height); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", chart.title);
    const node = (tag, attributes, content) => {
      const n = document.createElementNS(ns, tag); for (const key in attributes) n.setAttribute(key, attributes[key]);
      if (content !== undefined) n.textContent = content; svg.append(n); return n;
    };
    if (chart.kind === "line") {
      const values = points.map(p => p[1]), lo = Math.min(0, ...values), hi = Math.max(0, ...values), span = hi - lo || 1;
      const y = v => 180 - (v - lo) / span * 145, x = i => 52 + i / Math.max(1, points.length - 1) * 530;
      node("line", { x1: 52, x2: 590, y1: y(0), y2: y(0), stroke: "#DCE2E7" });
      node("polyline", { points: points.map((p, i) => x(i) + "," + y(p[1])).join(" "), fill: "none", stroke: "#17324D", "stroke-width": 2.5 });
      node("text", { x: 6, y: 38, fill: "#66717E", "font-size": 12 }, hi.toFixed(2) + "%");
      node("text", { x: 6, y: 183, fill: "#66717E", "font-size": 12 }, lo.toFixed(2) + "%");
      node("text", { x: 52, y: 209, fill: "#66717E", "font-size": 12 }, points[0][0]);
      node("text", { x: 590, y: 209, fill: "#66717E", "font-size": 12, "text-anchor": "end" }, points[points.length - 1][0]);
      const last = values[values.length - 1];
      node("text", { x: 635, y: 20, fill: last > 0 ? "#B72F32" : last < 0 ? "#17744B" : "#66717E", "font-size": 14, "text-anchor": "end" }, last.toFixed(2) + "%");
    } else {
      const hasNegative = points.some(p => p[1] < 0);
      const extent = Math.max(...points.map(p => Math.abs(p[1])), 1), zero = compactBars ? (hasNegative ? 245 : 195) : (hasNegative ? 360 : 280);
      node("line", { x1: zero, x2: zero, y1: 12, y2: height - 12, stroke: "#DCE2E7" });
      points.forEach((p, i) => {
        const y = i * 36 + 30, w = Math.abs(p[1]) / extent * (compactBars ? (hasNegative ? 55 : 100) : (hasNegative ? 180 : 270));
        const labelLimit = compactBars ? 13 : 19;
        const name = node("text", { x: 8, y: y + 4, fill: "#17324D", "font-size": compactBars ? 12 : 13 }, p[0].length > labelLimit ? p[0].slice(0, labelLimit - 1) + "…" : p[0]);
        const tip = document.createElementNS(ns, "title"); tip.textContent = p[0]; name.append(tip);
        const color = p[1] === 0 ? "#758CA0" : chart.semantics === "drawdown" ? "#17744B" : chart.semantics === "return" ? (p[1] > 0 ? "#B72F32" : "#17744B") : "#758CA0";
        node("rect", { x: p[1] >= 0 ? zero : zero - w, y: y - 11, width: Math.max(.5, w), height: 18, fill: color });
        const value = chart.format === "integer" ? p[1].toLocaleString("zh-CN", {maximumFractionDigits:0}) : p[1].toFixed(2);
        node("text", { x: width - 12, y: y + 4, fill: color, "font-size": 12, "text-anchor": "end" }, (chart.semantics === "return" && p[1] > 0 ? "+" : "") + value + (chart.unit === "%" ? "%" : ""));
      });
    }
    fig.append(svg); return fig;
  }
  function renderPresentation(body, data, task) {
    if (!data || data.version !== 1 || !["product_screen", "product_detail", "business_weekly"].includes(data.template) ||
        !Array.isArray(data.sections) || !data.sections.length || data.sections.length > 12) return false;
    const card = el("div", "ty-result"); card.dataset.template = data.template;
    card.append(el("p", "ty-result-eyebrow", "天眼数据 · " + data.title));
    if (data.summary) card.append(el("p", "ty-result-summary", data.summary));
    const critical = (data.notes || []).filter(n => /待核|缺失|缺口|非精确|补齐|未知|不可比/.test(n));
    if (critical.length) card.append(el("p", "ty-result-boundary", critical.slice(0, 3).join("；")));
    for (const section of data.sections) {
      if (!Array.isArray(section.columns) || !Array.isArray(section.rows) || section.rows.length > 40 || section.columns.length > 12 ||
          section.rows.some(r => !Array.isArray(r.cells) || r.cells.length !== section.columns.length)) return false;
      const block = el("section", "ty-result-section"); block.append(el("h3", "", section.title));
      if (section.scope) { const scope = el("details", "ty-result-scope"); scope.append(el("summary", "", "筛选范围与口径"), el("p", "", section.scope)); block.append(scope); }
      if (section.total > section.rows.length) block.append(el("p", "ty-result-count", "共 " + section.total + " 条，本段展示 " + section.rows.length + " 条"));
      if (!section.rows.length) block.append(el("p", "ty-result-empty", "本次范围内暂无可完整核对的记录；请结合覆盖说明查看。"));
      else if (section.rows.length === 1 && data.template !== "product_screen") {
        const row = section.rows[0], metrics = el("div", "ty-result-metrics"), facts = el("dl", "ty-result-facts");
        let metricCount = 0;
        row.cells.forEach((item, i) => {
          if (section.columns[i].numeric && metricCount < 4) {
            const metric = el("div", "ty-result-metric");
            metric.append(el("span", "ty-result-metric-label", section.columns[i].label),
              el("strong", "ty-result-" + (["positive", "negative", "neutral"].includes(item.tone) ? item.tone : "neutral"), item.display));
            metrics.append(metric); metricCount++;
          } else {
            facts.append(el("dt", "", section.columns[i].label), el("dd", "", item.display));
          }
        });
        if (metricCount) block.append(metrics); if (facts.children.length) block.append(facts);
        const detail = resultLink("查看产品详情", row.detail_url); if (detail) block.append(detail);
        const related = resultLink(row.related_label || "关联产品", row.related_url); if (related) block.append(related);
      } else {
        const wrap = el("div", "ty-result-table-wrap"), table = el("table", "ty-result-table"), head = el("thead"), hr = el("tr"), tbody = el("tbody");
        let order = section.rows.slice(), sortIndex = -1, descending = true;
        const draw = () => {
          tbody.replaceChildren();
          for (const row of order) {
            const tr = el("tr");
            row.cells.forEach((item, i) => {
              const td = el("td", section.columns[i].numeric ? "ty-result-number" : "");
              td.dataset.label = section.columns[i].label;
              const span = el("span", "ty-result-" + (["positive", "negative", "neutral"].includes(item.tone) ? item.tone : "neutral"), item.display);
              td.append(span); tr.append(td);
            });
            if (section.rows.some(r => r.detail_url || r.related_url)) {
              const td = el("td", "ty-result-action"); td.dataset.label = "查看"; const a = resultLink(row.detail_url ? "查看详情" : row.related_label || "关联产品", row.detail_url || row.related_url); if (a) td.append(a); tr.append(td);
            }
            tbody.append(tr);
          }
        };
        section.columns.forEach((c, i) => {
          const th = el("th", c.numeric ? "ty-result-number" : ""), button = el("button", "ty-result-sort", c.label);
          button.type = "button"; button.title = "按此列排序";
          button.onclick = () => {
            descending = sortIndex === i ? !descending : true; sortIndex = i;
            order.sort((a, b) => {
              const x = a.cells[i].value, y = b.cells[i].value;
              if (x === null) return y === null ? 0 : 1; if (y === null) return -1;
              return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "zh-CN")) * (descending ? -1 : 1);
            }); draw();
          };
          th.append(button); hr.append(th);
        });
        if (section.rows.some(r => r.detail_url || r.related_url)) hr.append(el("th", "", "查看"));
        head.append(hr); table.append(head, tbody); wrap.append(table); block.append(wrap); draw();
      }
      const list = resultLink("查看全部结果", section.list_url); if (list) block.append(list);
      card.append(block);
    }
    const chart = plotResult(data.chart);
    if (chart) { const first = card.querySelector(".ty-result-section"); card.insertBefore(chart, first || null); }
    const details = el("details", "ty-result-methods"); details.append(el("summary", "", "数据说明与完整文字答复"));
    for (const note of data.notes || []) details.append(el("p", "", note));
    const fallback = el("div", "ty-result-fallback"); businessText(fallback, task.answer); details.append(fallback); card.append(details);
    if (data.followups && data.followups.length) {
      const followups = el("div", "ty-assistant-options");
      for (const q of data.followups.slice(0, 2)) {
        const b = el("button", "ty-assistant-option", q); b.type = "button";
        b.onclick = () => { input.value = q; input.focus(); }; followups.append(b);
      }
      card.append(followups);
    }
    body.classList.add("ty-assistant-structured"); body.append(card); return true;
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
    const keepBottom = transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 80;
    const previousScroll = transcript.scrollTop;
    transcript.replaceChildren();
    let newlyCompleted = null;
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
      if (task.answer) {
        let rendered = false;
        try { rendered = renderPresentation(body, task.result && task.result.presentation, task); } catch (_) {}
        if (!rendered) { body.replaceChildren(); businessText(body, task.answer); }
      }
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
      if (task.answer && renderedStates.get(task.id) !== task.status) newlyCompleted = answer;
      renderedStates.set(task.id, task.status);
    }
    const target = keepBottom && newlyCompleted ?
      transcript.scrollTop + newlyCompleted.getBoundingClientRect().top - transcript.getBoundingClientRect().top - 8 :
      keepBottom ? transcript.scrollHeight : previousScroll;
    transcript.scrollTo({top:Math.max(0,target),behavior:"instant"});
  }
  async function refresh() {
    if (!session || !opened) return;
    clearTimeout(timer);
    const owner = session, version = generation, id = ++refreshId;
    const current = () => (!session || session === owner) && generation === version && refreshId === id;
    try {
      const [list, health] = await Promise.allSettled([request("/v1/tasks"), request("/v1/health")]);
      if (!current()) return;
      setHealth(health.status === "fulfilled" && health.value.worker_online === true);
      if (list.status === "rejected") throw list.reason;
      taskConnectionOk = true;
      const tasks = list.value.tasks.slice().reverse(); activeTasks = tasks.filter(active);
      if (session.pending && tasks.some(t => t.client_message_id === session.pending.client_message_id)) { delete session.pending; persist(); }
      controls(); render(tasks);
      showNotice(workerOnline ? "" : "后台暂不可用，您可以继续编辑问题或点击新对话。服务恢复后重试。");
      state.textContent = workerOnline ? (busy ? "本地助手正在处理，可先编辑下一题或新建对话" : "助手在线 · 可以继续提问") : "后台不在线，请联系mjx启动ai助手服务";
      if (opened) timer = setTimeout(refresh, activeTasks.length ? 3000 : 15000);
    } catch (error) {
      if (generation !== version || refreshId !== id || (session && session !== owner)) return;
      taskConnectionOk = false; setHealth(false); controls();
      showNotice(error.message);
      if (!session && opened) { try { await connect(); timer = setTimeout(refresh, 100); } catch (connectionError) { showNotice(connectionError.message); timer = setTimeout(open, 6000); } }
      else if (session && opened) timer = setTimeout(refresh, 6000);
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
    event.preventDefault(); if (busy || !input.value.trim()) return;
    const version = generation, question = input.value.trim();
    submitting = true; controls(); clearTimeout(timer); ++refreshId;
    let owner = null;
    try {
      await connect(); if (generation !== version) return;
      owner = session;
      const health = await request("/v1/health"); if (generation !== version || session !== owner) return;
      setHealth(health.worker_online === true);
      if (!workerOnline) throw new Error("后台暂不可用，本次问题尚未发送，内容已保留。服务恢复后可重试，也可点击新对话。");
      const payload = session.pending && session.pending.question === question ? session.pending : { question, client_message_id: crypto.randomUUID() };
      session.pending = payload; persist();
      const task = await request("/v1/tasks", "POST", payload);
      if (generation !== version || session !== owner) return;
      delete session.pending; persist();
      // The user may already be drafting their next question while sending.
      if (input.value.trim() === question) input.value = "";
      activeTasks = active(task) ? [task] : []; taskConnectionOk = true; submitting = false; controls(); await refresh();
    } catch (error) {
      if (generation !== version || (owner && session && owner !== session)) return;
      taskConnectionOk = false; setHealth(false); showNotice(error.message);
      if (opened) timer = setTimeout(session ? refresh : open, 4000);
    } finally {
      if (generation === version) { submitting = false; controls(); }
    }
  };
  input.onkeydown = event => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } };
  logout.onclick = () => {
    clearTimeout(timer); ++generation; ++refreshId; connecting = null;
    session = null; activeTasks = []; submitting = false; workerOnline = null; taskConnectionOk = true; persist();
    showNotice(""); controls(); open();
  };
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
    workerOnline = online; controls();
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
