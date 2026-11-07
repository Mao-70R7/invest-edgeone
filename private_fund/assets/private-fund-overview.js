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
  // Same confirmed-risk dictionary as the filter panel, including unknowns.
  const riskField=window.PrivateFundFilters.fields.find(f=>f.id==='risk');
  const riskCounts=new Map();
  for(const row of pack.rows){
    row.riskLevel=riskField.get(row)||'未确认 / 未披露';
    riskCounts.set(row.riskLevel,(riskCounts.get(row.riskLevel)||0)+1);
  }
  overview.riskLevels=[...riskCounts].sort(([a],[b])=>a.localeCompare(b)).map(([id,count])=>({id,label:id,count}));
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
      const gfCount=pack.rows.filter(r=>r.source==='gffunds_highend'&&(type==='source'?item.id===r.source:type==='strategy'?item.id===r.strategy1:type==='query'?(item.id===r.company||(r.managers||[]).includes(item.id)):false)).length;
      const gfShare=item.count?Math.min(100,gfCount/item.count*100):0;
      const isGffunds = (gffunds && item.id === "gffunds_highend") || (gfCount>0&&gfCount===item.count);
      return `<a class="overview-bar ${isGffunds ? "is-gffunds" : ""}" href="${P.esc(listHref(type, item.id))}">
        <span class="overview-bar-rank">${String(index + 1).padStart(2, "0")}</span>
        <span class="overview-bar-label">${P.esc(item.label)}</span>
        <i title="广发 ${gfCount} / 合计 ${item.count}只"><b style="width:${Math.max(1.5, Number(item.count || 0) / max * 100).toFixed(2)}%;background:linear-gradient(to right,#B72F32 ${gfShare}%,#597b89 ${gfShare}%)"></b></i>
        <strong>${count(item.count)}</strong>
      </a>`;
    }).join("")}</div>`;
  }

  function panel(title, body, extraClass = "") {
    return `<section class="panel overview-panel ${extraClass}"><div class="panel-head"><h2>${P.esc(title)}</h2></div>${body}</section>`;
  }

  function miniList(items, dimension) {
    const total = (items || []).reduce((sum, item) => sum + Number(item.count || 0), 0);
    return `<div class="composition-list">${(items || []).slice(0, 8).map(item=>{const selected=pack.rows.filter(r=>dimension==='risk'?String(r.riskLevel||'未披露')===item.id:(()=>{const d=X.stamp(r.inceptionDate||r.filterFacts?.firstDate);if(d===null||d>X.stamp(freshness.asOf))return false;const year=String(new Date(d).getUTCFullYear());return item.id==='other'?Number(year)<inception.currentYear-4:year===item.id;})());return `<div><span>${P.esc(item.label)}</span><i style="display:flex">${X.sources.map(s=>{const n=selected.filter(r=>r.source===s.id).length;return `<b style="width:${pct(n,total)};background:${s.color}" title="${s.label}：${n}只"></b>`;}).join('')}</i><strong>${count(item.count)}</strong></div>`;}).join('')}</div><p class="composition-note">颜色与净值日期图渠道一致；广发红色。</p>`;
  }

  const X=window.PrivateFundExperience;
  const snapshotDay=String(pack.meta.generatedAt || '').slice(0,10);
  const freshness=X.freshness(pack.rows,X.stamp(snapshotDay)===null ? X.today() : snapshotDay);
  const inception=X.inceptionYears(pack.rows,freshness.asOf);
  const inceptionNote=`优先按披露成立日期统计，缺失时以首个净值日补充（不代表真实成立日），已识别 ${count(inception.valid)} 只；“其他年份”为 ${inception.currentYear-5} 年及以前。`+
    (inception.missing?`成立日及净值起点均缺失 ${count(inception.missing)} 只，未计入年份分组。`:'')+
    (inception.invalid||inception.future?`日期无效或晚于统计日 ${count(inception.invalid+inception.future)} 只，未计入。`:'');
  const referenceDay=X.stamp(freshness.asOf);
  const sevenDayStart=referenceDay-6*86400000;
  const emptyPerformance=()=>({latestDate:null,recent:0,recentSeven:0});
  const performanceBySource=new Map();
  for(const product of pack.rows){
    const stats=performanceBySource.get(product.source) || emptyPerformance();
    const latest=[product.latestNavDate,product.analysisLatestDate].filter(value=>{
      const day=X.stamp(value);
      return day!==null && day<=referenceDay;
    }).map(value=>value.slice(0,10)).sort().at(-1);
    if(latest){
      if(!stats.latestDate || latest>stats.latestDate) stats.latestDate=latest;
      if(latest>=freshness.dayStart) stats.recent++;
      if(X.stamp(latest)>=sevenDayStart) stats.recentSeven++;
    }
    performanceBySource.set(product.source,stats);
  }
  const latestPerformance=[...performanceBySource.values()].map(stats=>stats.latestDate).filter(Boolean).sort().at(-1);

  function channelPanel(){
    const total={count:0,recent:0,recentSeven:0,latestDate:latestPerformance,scale:pack.channelScale ? {products:0,recentProducts:0,latestDate:null,unitUnconfirmed:0,amountProducts:0,totalYuan:null} : null};
    const channels=[...overview.channels.filter(channel=>channel.id==='gffunds_highend'),
      ...overview.channels.filter(channel=>channel.id!=='gffunds_highend')];
    const rows=channels.map(channel=>{
      const stats=performanceBySource.get(channel.id) || emptyPerformance();
      const scale=pack.channelScale?.[channel.id];
      total.count+=channel.count;
      total.recent+=stats.recent;
      total.recentSeven+=stats.recentSeven;
      if(scale && total.scale){
        total.scale.products+=scale.products;
        total.scale.recentProducts+=scale.recentProducts;
        total.scale.unitUnconfirmed+=scale.unitUnconfirmed;
        total.scale.amountProducts+=scale.amountProducts||0;
        if(scale.totalYuan!=null) total.scale.totalYuan=(total.scale.totalYuan||0)+Number(scale.totalYuan);
        if(scale.latestDate && (!total.scale.latestDate || scale.latestDate>total.scale.latestDate)) total.scale.latestDate=scale.latestDate;
      }
      return {...channel,...stats,scale};
    });
    const amount=(value)=>value==null?'—':(Number(value)/100000000).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
    const cell=(label,value,style='')=>`<td role="cell" class="${style}"><span class="mobile-metric-label" aria-hidden="true">${label}</span><span>${value}</span></td>`;
    const rowHtml=({id,label,count:products,recent,recentSeven,latestDate,scale})=>`<tr role="row" data-channel="${P.esc(id||'total')}">
      <th scope="row" role="rowheader">${id?`<a href="${P.esc(listHref('source',id))}">${P.esc(label)}</a>`:'合计'}</th>
      ${cell('产品数',count(products))}
      ${cell('最新业绩日',P.esc(latestDate||'—'),'group-start')}
      ${cell('近7日有业绩',`${count(recentSeven)} <small>${pct(recentSeven,products)}</small>`)}
      ${cell('近30日有业绩',`${count(recent)} <small>${pct(recent,products)}</small>`)}
      ${cell('披露规模产品',scale?`${count(scale.products)} <small>${pct(scale.products,products)}</small>${scale.unitUnconfirmed?`<small class="channel-scale-note">单位待核 ${count(scale.unitUnconfirmed)} 只</small>`:''}`:'—','group-start')}
      ${cell('最新规模披露日',P.esc(scale?.latestDate||'—'))}
      ${cell('近30日披露规模',scale?count(scale.recentProducts):'—')}
      ${cell('披露规模（亿元）',`<strong>${amount(scale?.totalYuan)}</strong>${scale?.amountProducts?`<small class="channel-scale-note">${count(scale.amountProducts)} 只计入金额</small>`:''}`,'channel-amount')}</tr>`;
    return `<section class="panel channel-coverage" aria-labelledby="channelCoverageTitle">
      <div class="panel-head"><h2 id="channelCoverageTitle">各渠道数据新鲜度与规模</h2><span>统计截至 ${freshness.asOf}</span></div>
      <div class="channel-table-wrap">
        <table class="channel-coverage-table" role="table"><thead role="rowgroup">
          <tr class="channel-table-groups" role="row"><th scope="colgroup" role="columnheader" colspan="2">产品覆盖</th><th scope="colgroup" role="columnheader" colspan="3">业绩新鲜度</th><th scope="colgroup" role="columnheader" colspan="4">规模披露</th></tr>
          <tr role="row"><th scope="col" role="columnheader">渠道</th><th scope="col" role="columnheader">产品数</th><th class="group-start" scope="col" role="columnheader">最新业绩日</th><th scope="col" role="columnheader">近7日<br>有业绩</th><th scope="col" role="columnheader">近30日<br>有业绩</th><th class="group-start" scope="col" role="columnheader">披露规模产品<br><small>数量 / 占比</small></th><th scope="col" role="columnheader">最新规模<br>披露日</th><th scope="col" role="columnheader">近30日<br>披露规模</th><th scope="col" role="columnheader">披露规模<br>（亿元）</th></tr>
        </thead><tbody role="rowgroup">${rowHtml(total)}${rows.map(rowHtml).join('')}</tbody></table>
      </div>
      <p class="freshness-note">按本页各渠道产品代码统计，占比以该行产品数为分母。近7日、近30日均含快照当日，业绩日取最新净值与可用业绩序列的较晚日期。披露规模产品数含单位或份额待核记录，金额仅汇总每只产品最近一条单位和归属可确认的规模。合计为各渠道披露额相加，跨渠道可能重复，且各产品披露日不同。</p>
      ${pack.channelScale && rows.some(row=>row.scale?.amountProducts!==undefined)?'':'<p class="freshness-note">当前页面快照尚未生成可加总规模。</p>'}
    </section>`;
  }
  let selectedDay=Math.max(0,freshness.days.slice(0,30).findLastIndex(b=>b.total>0));
  const dayLabel=b=>b.date||`其他（${freshness.dayStart}之前 / 日期缺失或异常）`;
  const dayDescription=b=>`${dayLabel(b)}，共${count(b.total)}只；`+freshness.sources.map(s=>`${s.label}${count(b.counts[s.id])}只`).join('，');
  function countsHtml(b) {
    return freshness.sources.map(s=>`<span><i style="background:${s.color}"></i>${s.label}<b>${count(b.counts[s.id])}</b></span>`).join('')+`<span>合计<b>${count(b.total)}</b></span>`;
  }
  function freshnessPanel() {
    const legend=freshness.sources.map(s=>`<span><i style="background:${s.color}"></i>${s.label} <b>${count(freshness.bySource[s.id])}</b></span>`).join('');
    const total=`<tr class="interval-total"><th scope="row">合计</th>${freshness.sources.map(s=>`<td>${count(freshness.bySource[s.id])}</td>`).join('')}<td><strong>${count(freshness.total)}</strong></td></tr>`;
    const table=`<table class="freshness-table"><caption>日期区间汇总 · 起止日均包含</caption><thead><tr><th>最新业绩日期</th>${freshness.sources.map(s=>`<th><i style="background:${s.color}"></i>${s.label}</th>`).join('')}<th>合计</th></tr></thead><tbody>${total}${freshness.intervals.filter(b=>b.startDate||b.total||b.id==='undated').map(b=>`<tr data-interval="${b.id}"><th>${b.startDate?`${b.startDate}<small>至 ${b.endDate}</small>`:b.label}</th>${freshness.sources.map(s=>`<td>${count(b.counts[s.id])}</td>`).join('')}<td><strong>${count(b.total)}</strong></td></tr>`).join('')}</tbody></table>`;
    return `<section class="panel freshness-panel"><div class="panel-head"><h2>最新净值日期分布</h2><span>最近30天 + 其他 · ${count(freshness.total)}只</span></div><div class="freshness-legend">${legend}</div><div class="freshness-layout"><div class="freshness-plot"><svg id="freshnessChart" role="group" aria-labelledby="freshnessTitle freshnessDescription"></svg><div id="freshnessTooltip" class="freshness-tooltip" role="tooltip" hidden></div><p class="freshness-help">悬停或点击柱体查看数量，也可使用日期选择器。</p></div><aside class="freshness-inspector"><div class="freshness-date-control"><button type="button" id="freshnessPrevious" aria-label="查看上一日期">‹</button><select id="freshnessDay" aria-label="选择净值日期查看具体数量">${freshness.days.map((b,i)=>`<option value="${i}"${i===selectedDay?' selected':''}>${P.esc(b.date||'其他日期')}</option>`).join('')}</select><button type="button" id="freshnessNext" aria-label="查看下一日期">›</button></div><div id="freshnessReadout" class="freshness-counts" aria-live="polite"></div></aside></div><details class="freshness-breakdown"><summary>查看日期区间与各渠道明细</summary><div class="table-wrap">${table}</div></details><p class="freshness-note">截至北京时间 ${freshness.asOf}，按每只产品最新净值与可用业绩披露日期中较新者统计，不按采集时间统计。日柱覆盖 ${freshness.dayStart} 至 ${freshness.asOf}（含当天）；“其他”含更早日期、日期缺失${count(freshness.missing)}只${freshness.future?`、未来日期${count(freshness.future)}只`:''}。展开明细按日期区间汇总，缺失或异常日期单列。两种分组均互不重复、总数一致。仅计排排网、格上、广发基金，其他渠道${count(freshness.excluded)}只未计入；跨渠道记录不合并。</p></section>`;
  }
  function drawFreshness() {
    const el=document.getElementById('freshnessChart');if(!el)return;
    const W=Math.max(300,Math.round(el.parentElement.clientWidth)),H=330,L=44,R=16,T=28,B=56;
    const max=Math.max(1,...freshness.days.map(b=>b.total)), magnitude=10**Math.floor(Math.log10(max)), step=Math.max(1,Math.ceil(max/4/magnitude*10)*magnitude/10), top=step*4;
    const plotH=H-T-B, slot=(W-L-R)/31, width=slot*.72, y=n=>H-B-n/top*plotH;
    const labelled=new Set(freshness.days.map((b,i)=>({total:b.total,i})).filter(b=>b.total).sort((a,b)=>b.total-a.total).slice(0,W<500?3:8).map(b=>b.i));
    let svg=`<title id="freshnessTitle">最近30天最新业绩日期分布</title><desc id="freshnessDescription">${freshness.dayStart}至${freshness.asOf}，另设其他，共${freshness.total}只产品。悬停、点击或左右键查看具体数量，下方日期选择器提供同等操作。</desc>`;
    for(let i=0;i<=4;i++){const v=step*i;svg+=`<line x1="${L}" y1="${y(v)}" x2="${W-R}" y2="${y(v)}" stroke="#e3e8ec" stroke-width=".75"/><text x="${L-7}" y="${y(v)+4}" text-anchor="end" font-size="11" fill="#74818b">${Math.round(v)}</text>`;}
    svg+=`<text x="${L}" y="14" font-size="11" fill="#74818b">产品数（只）</text>`;
    svg+=`<line x1="${L+slot*30}" x2="${L+slot*30}" y1="${T}" y2="${H-B}" stroke="#cbd4da" stroke-dasharray="3 3"/>`;
    freshness.days.forEach((b,index)=>{const cx=L+slot*(index+.5);let acc=0;svg+=`<g tabindex="${index===selectedDay?0:-1}" role="button" aria-label="${P.esc(dayDescription(b))}" aria-pressed="${index===selectedDay}" data-index="${index}" data-bucket="${b.id}" data-total="${b.total}"><rect class="freshness-hit" x="${L+slot*index}" y="${T}" width="${slot}" height="${plotH}" fill="transparent"/>`;
      freshness.sources.forEach(s=>{const n=b.counts[s.id],height=n/top*plotH;svg+=`<rect x="${cx-width/2}" y="${y(acc+n)}" width="${width}" height="${height}" fill="${s.color}" data-source="${s.id}" data-count="${n}"/>`;acc+=n;});
      if(labelled.has(index))svg+=`<text x="${cx}" y="${y(b.total)-7}" text-anchor="middle" font-size="11" font-weight="700" fill="#304553">${count(b.total)}</text>`;
      if(index===29 || index===30 || (index<26 && index%(W<500?7:5)===0))svg+=`<text x="${cx}" y="${H-B+(index===30?43:22)}" text-anchor="${index===30?'end':'middle'}" font-size="11" fill="#425765">${b.label}</text>`;
      svg+='</g>';
    });
    svg=svg.replace('三渠道堆叠柱状图','全渠道堆叠柱状图');
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
      <div><span class="eyebrow">TIANYAN / 数据观察</span><h1>数据总览</h1><p class="report-lead">一览产品覆盖、披露时效与策略分布。</p></div>
      <div class="overview-asof"><div title="当前页面数据快照生成时间，不等于净值披露时间"><span>数据更新时间</span><time>${P.esc(P.formatDateTime(pack.meta.generatedAt))}</time></div><div><span>最新业绩时间</span><time>${P.esc(latestPerformance||'未披露')}</time></div></div>
    </section>
    <section class="overview-kpis" aria-label="私募核心统计">
      <div><span>产品</span><strong>${count(overview.productCount)}</strong></div>
      <div><span>渠道</span><strong>${count(overview.channelCount)}</strong></div>
      <div><span>管理人</span><strong>${count(overview.companyCount)}</strong></div>
      <div><span>基金经理</span><strong>${count(overview.managerCount)}</strong></div>
    </section>
    <nav class="report-links" aria-label="数据探索"><a href="./products.html">查看全部产品 ↗</a><a href="./awards.html">查看获奖记录 ↗</a><span>${count(overview.strategyCount)} 类产品</span><a href="${listHref("source", "gffunds_highend")}">广发基金 ${count(gffundsRows.length)} 只 ↗</a></nav>
    ${channelPanel()}
    <details class="freshness-breakdown" id="freshnessTrend"><summary>展开业绩日期分布图</summary>${freshnessPanel()}</details>
    <div class="overview-grid">
      ${panel("渠道分布", barList(overview.channels, { type: "source", limit: 10, gffunds: true }))}
      ${panel("管理人分布", barList(overview.companies, { type: "query", limit: 12 }))}
      ${panel("产品类型", barList(overview.strategies, { type: "strategy", limit: 12 }))}
      ${panel("基金经理", barList(overview.managers, { type: "query", limit: 12 }))}
    </div>
    <div class="overview-grid overview-grid-compact">
      ${panel("成立年份", miniList(inception.buckets,'inception')+`<p class="composition-note">${P.esc(inceptionNote)}</p>`, "inception-year-panel")}
      ${panel("风险等级", miniList(overview.riskLevels,'risk'))}
      ${panel("数据覆盖", `<div class="coverage-grid">
        <a href="./products.html"><span>产品目录</span><strong>${count(overview.productCount)}</strong><small>100.0%</small></a>
        <a href="./products.html?data=ready"><span>业绩指标</span><strong>${count(overview.metricProductCount)}</strong><small>${pct(overview.metricProductCount, overview.productCount)}</small></a>
        <a href="./products.html"><span>最新净值</span><strong>${count(overview.latestNavProductCount)}</strong><small>${pct(overview.latestNavProductCount, overview.productCount)}</small></a>
        <a href="./products.html"><span>可用业绩序列</span><strong>${count(overview.analysisSeriesProductCount)}</strong><small>${pct(overview.analysisSeriesProductCount, overview.productCount)}</small></a>
        <a href="./products.html"><span>衍生分析指标</span><strong>${count(overview.derivedMetricProductCount)}</strong><small>${pct(overview.derivedMetricProductCount, overview.productCount)}</small></a>
      </div>`, "overview-panel-wide")}
    </div>`;
  const coverageHost=document.createElement('section');
  coverageHost.className='panel filter-coverage-panel';
  const baseFilters=window.PrivateFundFilters, asOf=pack.meta.generatedAt.slice(0,10);
  const F={...baseFilters,coverage:(f,rows,date)=>pack.coverageSnapshot?.[f.id]?.[rows===pack.rows?'*':rows[0]?.source]||baseFilters.coverage(f,rows,date)};
  const sourceRows=X.sources.map(s=>({...s,rows:pack.rows.filter(r=>r.source===s.id)}));
  const coverageFields=[
    {id:'historyReady',label:'历史业绩可用',group:'指标筛选',get:r=>Number(r.analysisPointCount)>=2?'已覆盖':null,note:'至少两个有效业绩点，可展示历史走势及计算区间收益；不等于自成立以来无遗漏。'},
    ...F.fields.filter(f=>!['institution','region','currency'].includes(f.id))
  ];
  const coverageGroups=F.groups;
  coverageHost.innerHTML=`<div class="panel-head"><h2>指标与筛选字段覆盖率</h2><span>全部渠道 · 不含好买</span></div><p class="coverage-method">每条横条共用 0—100% 刻度，标注可用产品数 / 该渠道页面产品数。缺失、无法计算与口径未确认不计可用，数值 0 计入。排名采用本库共同月末同类样本，非排排网官方榜单；超额默认按沪深300共同历史计算，币种未知时属于未调整汇率的原币相对表现。成立以来采用完整可用净值期，不保证覆盖真实成立日。比例不表示数据已完全核实。</p>${coverageGroups.map(group=>`<details class="coverage-section"><summary>${group} · ${coverageFields.filter(f=>f.group===group).length}项</summary><div class="field-coverage-grid">${coverageFields.filter(f=>f.group===group).map(f=>`<article class="field-coverage"><h3>${P.esc(f.label)} <span>${F.coverage(f,pack.rows,asOf).pct.toFixed(1)}%</span></h3>${sourceRows.map(s=>{const c=F.coverage(f,s.rows,asOf);return `<div class="coverage-channel${s.id==='gffunds_highend'?' is-gffunds':''}"><span>${s.label}</span><i><b style="width:${c.pct}%;background:${s.color}"></b></i><strong>${c.total?c.pct.toFixed(1)+'%':'—'}<small>${c.count.toLocaleString()} / ${c.total.toLocaleString()}</small></strong></div>`;}).join('')}${f.note?`<p>${P.esc(f.note)}</p>`:''}</article>`).join('')}</div></details>`).join('')}`;
  root.appendChild(coverageHost);
  const chartNote=document.querySelector('.freshness-panel .freshness-note');
  chartNote.textContent=chartNote.textContent.replace(/仅计排排网、格上、广发基金，其他渠道.*?只未计入；/,`图表覆盖 ${freshness.sources.filter(s=>freshness.bySource[s.id]).map(s=>s.label).join('、')}，其他渠道请见上表。`);
  document.querySelectorAll('.freshness-table tr').forEach(tr=>{const cells=tr.querySelectorAll('th,td');if(cells[3])cells[3].classList.add('is-gffunds');});
  drawFreshness();
  bindFreshness();
  document.getElementById('freshnessTrend').addEventListener('toggle',drawFreshness);
  let resizeFrame;addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(drawFreshness);});
  document.body.dataset.ready = "true";
})();
