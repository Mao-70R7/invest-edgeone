(() => {
  const P = window.PrivateFund || {};
  const pack = window.__PRIVATE_FUND_CATALOG__;
  const root = document.getElementById("mainContent");
  if (!root) return;
  if (!pack || !pack.overview || !Array.isArray(pack.rows)) {
    root.innerHTML = '<section class="empty-panel">数据暂不可用</section>';
    return;
  }

  const overview = pack.overview;
  const count = (value) => Number(value || 0).toLocaleString("zh-CN");
  const pct = (value, total) => total ? `${(Number(value || 0) / total * 100).toFixed(1)}%` : "0.0%";

  function listHref(type, id) {
    const params = new URLSearchParams();
    if (type === "source") params.set("source", id);
    if (type === "strategy") params.set("strategy", id);
    if (type === "query") params.set("q", id);
    return `./products.html?${params.toString()}`;
  }

  function barList(items, { type, limit = 12, gffunds = false } = {}) {
    const visible = (items || []).slice(0, limit);
    const max = Math.max(1, ...visible.map((item) => Number(item.count || 0)));
    return `<div class="overview-bars">${visible.map((item, index) => {
      const isGffunds = gffunds && item.id === "gffunds_highend";
      return `<a class="overview-bar ${isGffunds ? "is-gffunds" : ""}" href="${P.esc(listHref(type, item.id))}">
        <span class="overview-bar-rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="overview-bar-label">${P.esc(item.label)}</span>
        <i><b style="width:${Math.max(1.5, Number(item.count || 0) / max * 100).toFixed(2)}%"></b></i>
        <strong>${count(item.count)}</strong>
      </a>`;
    }).join("")}</div>`;
  }

  function panel(title, body, extraClass = "") {
    return `<section class="panel overview-panel ${extraClass}"><div class="panel-head"><h2>${P.esc(title)}</h2></div>${body}</section>`;
  }

  function miniList(items) {
    const total = (items || []).reduce((sum, item) => sum + Number(item.count || 0), 0);
    return `<div class="composition-list">${(items || []).slice(0, 8).map((item) => `<div><span>${P.esc(item.label)}</span><i><b style="width:${pct(item.count, total)}"></b></i><strong>${count(item.count)}</strong></div>`).join("")}</div>`;
  }

  const X=window.PrivateFundExperience;
  const freshness=X.freshness(pack.rows);
  const inception=X.inceptionYears(pack.rows,freshness.asOf);
  const inceptionNote=`按全部渠道产品的成立日期统计，已识别 ${count(inception.valid)} 只；“其他年份”为 ${inception.currentYear-5} 年及以前。`+
    (inception.missing?`成立日期未披露 ${count(inception.missing)} 只，未计入年份分组。`:'')+
    (inception.invalid||inception.future?`日期无效或晚于统计日 ${count(inception.invalid+inception.future)} 只，未计入。`:'');
  const latestPerformance=pack.rows.map(X.latestDate).filter(d=>d && X.stamp(d)<=X.stamp(freshness.asOf)).sort().at(-1);
  let selectedDay=Math.max(0,freshness.days.slice(0,30).findLastIndex(b=>b.total>0));
  const dayLabel=b=>b.date||`其他（${freshness.dayStart}之前 / 日期缺失或异常）`;
  const dayDescription=b=>`${dayLabel(b)}，共${count(b.total)}只；`+freshness.sources.map(s=>`${s.label}${count(b.counts[s.id])}只`).join('，');
  function countsHtml(b) {
    return freshness.sources.map(s=>`<span><i style="background:${s.color}"></i>${s.label}<b>${count(b.counts[s.id])}</b></span>`).join('')+`<span>合计<b>${count(b.total)}</b></span>`;
  }
  function freshnessPanel() {
    const legend=freshness.sources.map(s=>`<span><i style="background:${s.color}"></i>${s.label} <b>${count(freshness.bySource[s.id])}</b></span>`).join('');
    const table=`<table class="freshness-table"><caption>日期区间汇总 · 起止日均包含</caption><thead><tr><th>最新净值日期</th>${freshness.sources.map(s=>`<th><i style="background:${s.color}"></i>${s.label}</th>`).join('')}<th>合计</th></tr></thead><tbody>${freshness.intervals.filter(b=>b.startDate||b.total||b.id==='undated').map(b=>`<tr data-interval="${b.id}"><th>${b.startDate?`${b.startDate}<small>至 ${b.endDate}</small>`:b.label}</th>${freshness.sources.map(s=>`<td>${count(b.counts[s.id])}</td>`).join('')}<td><strong>${count(b.total)}</strong></td></tr>`).join('')}</tbody><tfoot><tr><th>合计</th>${freshness.sources.map(s=>`<td>${count(freshness.bySource[s.id])}</td>`).join('')}<td><strong>${count(freshness.total)}</strong></td></tr></tfoot></table>`;
    return `<section class="panel freshness-panel"><div class="panel-head"><h2>最新净值日期分布</h2><span>最近30天 + 其他 · ${count(freshness.total)}只</span></div><div class="freshness-legend">${legend}</div><div class="freshness-layout"><div class="freshness-plot"><svg id="freshnessChart" role="group" aria-labelledby="freshnessTitle freshnessDescription"></svg><div id="freshnessTooltip" class="freshness-tooltip" role="tooltip" hidden></div><div class="freshness-inspector"><div class="freshness-date-control"><button type="button" id="freshnessPrevious" aria-label="查看上一日期">‹</button><select id="freshnessDay" aria-label="选择净值日期查看具体数量">${freshness.days.map((b,i)=>`<option value="${i}"${i===selectedDay?' selected':''}>${P.esc(b.date||'其他')} · ${count(b.total)}只</option>`).join('')}</select><button type="button" id="freshnessNext" aria-label="查看下一日期">›</button></div><div id="freshnessReadout" class="freshness-counts" aria-live="polite"></div></div><p class="freshness-help">悬停或点击柱体查看数量；也可选择日期，或聚焦图表后用左右键切换。</p></div>${table}</div><p class="freshness-note">截至北京时间 ${freshness.asOf}，按每只产品最新净值与可用业绩披露日期中较新者统计，不按采集时间统计。日柱覆盖 ${freshness.dayStart} 至 ${freshness.asOf}（含当天）；“其他”含更早日期、日期缺失${count(freshness.missing)}只${freshness.future?`、未来日期${count(freshness.future)}只`:''}。右表按日期区间汇总，缺失或异常日期单列。两种分组均互不重复、总数一致。仅计排排网、格上、广发基金，其他渠道${count(freshness.excluded)}只未计入；跨渠道记录不合并。</p></section>`;
  }
  function drawFreshness() {
    const el=document.getElementById('freshnessChart');if(!el)return;
    const W=Math.max(300,Math.round(el.parentElement.clientWidth)),H=330,L=44,R=16,T=28,B=56;
    const max=Math.max(1,...freshness.days.map(b=>b.total)), magnitude=10**Math.floor(Math.log10(max)), step=Math.max(1,Math.ceil(max/4/magnitude*10)*magnitude/10), top=step*4;
    const plotH=H-T-B, slot=(W-L-R)/31, width=slot*.72, y=n=>H-B-n/top*plotH;
    const labelled=new Set(freshness.days.map((b,i)=>({total:b.total,i})).filter(b=>b.total).sort((a,b)=>b.total-a.total).slice(0,W<500?3:8).map(b=>b.i));
    let svg=`<title id="freshnessTitle">最近30天最新净值日期分布，三渠道堆叠柱状图</title><desc id="freshnessDescription">${freshness.dayStart}至${freshness.asOf}，另设其他，共${freshness.total}只产品。排排网绿色、格上黄色、广发基金红色。悬停、点击或左右键查看具体数量，下方日期选择器提供同等操作。</desc>`;
    for(let i=0;i<=4;i++){const v=step*i;svg+=`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#e3e8ec" stroke-width=".75"/><text x="${L-7}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#74818b">${Math.round(v)}</text>`;}
    svg+=`<text x="${L}" y="14" font-size="11" fill="#74818b">产品数（只）</text>`;
    svg+=`<line x1="${L+slot*30}" x2="${L+slot*30}" y1="${T}" y2="${H-B}" stroke="#cbd4da" stroke-dasharray="3 3"/>`;
    freshness.days.forEach((b,index)=>{const cx=L+slot*(index+.5);let acc=0;svg+=`<g tabindex="${index===selectedDay?0:-1}" role="button" aria-label="${P.esc(dayDescription(b))}" aria-pressed="${index===selectedDay}" data-index="${index}" data-bucket="${b.id}" data-total="${b.total}"><rect class="freshness-hit" x="${L+slot*index}" y="${T}" width="${slot}" height="${plotH}" fill="transparent"/>`;
      freshness.sources.forEach(s=>{const n=b.counts[s.id],height=n/top*plotH;svg+=`<rect x="${cx-width/2}" y="${y(acc+n)}" width="${width}" height="${height}" fill="${s.color}" data-source="${s.id}" data-count="${n}"/>`;acc+=n;});
      if(labelled.has(index))svg+=`<text x="${cx}" y="${y(b.total)-7}" text-anchor="middle" font-size="11" font-weight="700" fill="#304553">${count(b.total)}</text>`;
      if(index===29 || index===30 || (index<26 && index%(W<500?7:5)===0))svg+=`<text x="${cx}" y="${H-B+(index===30?43:22)}" text-anchor="${index===30?'end':'middle'}" font-size="11" fill="#425765">${b.label}</text>`;
      svg+='</g>';
    });
    el.setAttribute('viewBox',`0 0 ${W} ${H}`);el.innerHTML=svg;el.dataset.total=freshness.total;el.dataset.asOf=freshness.asOf;
    selectDay(selectedDay);hideTooltip();
  }
  function hideTooltip(){const tip=document.getElementById('freshnessTooltip');if(tip)tip.hidden=true;}
  function selectDay(index, focus=false) {
    selectedDay=Math.max(0,Math.min(30,index));const b=freshness.days[selectedDay];
    document.getElementById('freshnessDay').value=selectedDay;
    const readout=document.getElementById('freshnessReadout');readout.innerHTML=countsHtml(b);readout.setAttribute('aria-label',dayDescription(b));readout.dataset.date=b.id;
    document.getElementById('freshnessPrevious').disabled=selectedDay===0;
    document.getElementById('freshnessNext').disabled=selectedDay===30;
    document.querySelectorAll('#freshnessChart g[data-index]').forEach(g=>{const active=Number(g.dataset.index)===selectedDay;g.setAttribute('aria-pressed',String(active));g.setAttribute('tabindex',active?'0':'-1');if(active&&focus)g.focus();});
  }
  function showTooltip(group,event) {
    const index=Number(group.dataset.index),tip=document.getElementById('freshnessTooltip'),plot=tip.parentElement.getBoundingClientRect(),box=group.getBoundingClientRect();
    tip.innerHTML=`<strong>${P.esc(dayLabel(freshness.days[index]))}</strong><div class="freshness-counts">${countsHtml(freshness.days[index])}</div>`;tip.hidden=false;
    const x=event?.clientX??(box.left+box.width/2),y=event?.clientY??(plot.top+80);
    tip.style.left=`${Math.max(4,Math.min(plot.width-tip.offsetWidth-4,x-plot.left+14))}px`;
    tip.style.top=`${Math.max(22,Math.min(330-tip.offsetHeight-4,y-plot.top-tip.offsetHeight-12))}px`;
  }
  function bindFreshness() {
    const el=document.getElementById('freshnessChart'),groupOf=e=>e.target.closest('g[data-index]');
    el.addEventListener('pointermove',e=>{const g=groupOf(e);if(g&&e.pointerType!=='touch')showTooltip(g,e);else hideTooltip();});
    el.addEventListener('pointerleave',hideTooltip);
    el.addEventListener('click',e=>{const g=groupOf(e);if(g){selectDay(Number(g.dataset.index));hideTooltip();}});
    el.addEventListener('focusin',e=>{const g=groupOf(e);if(g){selectDay(Number(g.dataset.index));showTooltip(g);}});
    el.addEventListener('focusout',hideTooltip);
    el.addEventListener('keydown',e=>{const changes={ArrowLeft:selectedDay-1,ArrowRight:selectedDay+1,Home:0,End:30};if(e.key in changes){e.preventDefault();selectDay(changes[e.key],true);}else if(e.key==='Escape')hideTooltip();else if(e.key==='Enter'||e.key===' '){e.preventDefault();selectDay(selectedDay);hideTooltip();}});
    document.getElementById('freshnessDay').addEventListener('change',e=>{selectDay(Number(e.target.value));hideTooltip();});
    document.getElementById('freshnessPrevious').addEventListener('click',()=>{selectDay(selectedDay-1);hideTooltip();});
    document.getElementById('freshnessNext').addEventListener('click',()=>{selectDay(selectedDay+1);hideTooltip();});
  }

  const gffundsRows = pack.rows.filter((row) => row.source === "gffunds_highend");
  const gffundsManagers = new Set(gffundsRows.flatMap((row) => row.managers || []).filter(Boolean));
  const gffundsStrategies = new Set(gffundsRows.map((row) => row.strategy1).filter(Boolean));
  const gffundsNav = gffundsRows.filter((row) => P.number(row.latestNav) !== null).length;
  const gffundsMetrics = gffundsRows.filter((row) => Object.keys(row.metrics || {}).length).length;
  const gffundsAnalysis = gffundsRows.filter((row) => Number(row.analysisPointCount || 0) >= 2).length;
  const gffundsDerived = gffundsRows.filter((row) => Number(row.derivedMetricCount || 0) > 0).length;

  root.innerHTML = `
    <section class="page-heading">
      <div><span class="eyebrow">TIANYAN PRIVATE FUND</span><h1>数据总览</h1></div>
      <div class="overview-asof"><div title="当前页面数据快照生成时间，不等于净值披露时间"><span>数据更新时间</span><time>${P.esc(P.formatDateTime(pack.meta.generatedAt))}</time></div><div><span>最新业绩时间</span><time>${P.esc(latestPerformance||'未披露')}</time></div></div>
    </section>
    <section class="overview-kpis" aria-label="私募核心统计">
      <div><span>产品</span><strong>${count(overview.productCount)}</strong></div>
      <div><span>渠道</span><strong>${count(overview.channelCount)}</strong></div>
      <div><span>管理人</span><strong>${count(overview.companyCount)}</strong></div>
      <div><span>基金经理</span><strong>${count(overview.managerCount)}</strong></div>
      <div><span>产品类型</span><strong>${count(overview.strategyCount)}</strong></div>
      <div class="is-gffunds"><span>广发产品</span><strong>${count(overview.gffundsProductCount)}</strong></div>
    </section>
    ${freshnessPanel()}
    <section class="gffunds-focus is-gffunds" data-gffunds-highlight="true">
      <div class="gffunds-focus-title"><span class="gf-monogram">GF</span><div><span>广发基金</span><h2>高端理财</h2></div></div>
      <div class="gffunds-focus-metrics">
        <div><span>产品</span><strong>${count(gffundsRows.length)}</strong></div>
        <div><span>基金经理</span><strong>${count(gffundsManagers.size)}</strong></div>
        <div><span>产品类型</span><strong>${count(gffundsStrategies.size)}</strong></div>
        <div><span>最新净值</span><strong>${count(gffundsNav)}</strong></div>
        <div><span>业绩指标</span><strong>${count(gffundsMetrics)}</strong></div>
        <div><span>完整业绩序列</span><strong>${count(gffundsAnalysis)}</strong></div>
        <div><span>衍生指标</span><strong>${count(gffundsDerived)}</strong></div>
      </div>
      <a class="primary-link" href="${listHref("source", "gffunds_highend")}">查看广发产品</a>
    </section>
    <div class="overview-grid">
      ${panel("渠道分布", barList(overview.channels, { type: "source", limit: 10, gffunds: true }))}
      ${panel("管理人分布", barList(overview.companies, { type: "query", limit: 12 }))}
      ${panel("产品类型", barList(overview.strategies, { type: "strategy", limit: 12 }))}
      ${panel("基金经理", barList(overview.managers, { type: "query", limit: 12 }))}
    </div>
    <div class="overview-grid overview-grid-compact">
      ${panel("成立年份", miniList(inception.buckets)+`<p class="composition-note">${P.esc(inceptionNote)}</p>`, "inception-year-panel")}
      ${panel("风险等级", miniList(overview.riskLevels))}
      ${panel("数据覆盖", `<div class="coverage-grid">
        <a href="./products.html"><span>产品目录</span><strong>${count(overview.productCount)}</strong><small>100.0%</small></a>
        <a href="./products.html?data=ready"><span>业绩指标</span><strong>${count(overview.metricProductCount)}</strong><small>${pct(overview.metricProductCount, overview.productCount)}</small></a>
        <a href="./products.html"><span>最新净值</span><strong>${count(overview.latestNavProductCount)}</strong><small>${pct(overview.latestNavProductCount, overview.productCount)}</small></a>
        <a href="./products.html"><span>完整业绩序列</span><strong>${count(overview.analysisSeriesProductCount)}</strong><small>${pct(overview.analysisSeriesProductCount, overview.productCount)}</small></a>
        <a href="./products.html"><span>衍生分析指标</span><strong>${count(overview.derivedMetricProductCount)}</strong><small>${pct(overview.derivedMetricProductCount, overview.productCount)}</small></a>
      </div>`, "overview-panel-wide")}
    </div>`;
  drawFreshness();
  bindFreshness();
  let resizeFrame;addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(drawFreshness);});
  document.body.dataset.ready = "true";
})();
