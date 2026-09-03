(() => {
  const P = window.PrivateFund || {};
  const pack = window.__PRIVATE_FUND_CATALOG__;
  const root = document.getElementById("mainContent");
  if (!root) return;
  if (!pack || !Array.isArray(pack.rows)) {
    root.innerHTML = '<section class="empty-panel">数据暂不可用</section>';
    return;
  }

  const rows = pack.rows;
  const metrics = (pack.metrics || []).filter((metric) => Number(metric.coverageTotal || 0) > 0);
  const metricMap = new Map(metrics.map((metric) => [metric.code, metric]));
  const xMetrics = metrics.filter(m => m.group === 'return');
  const yMetrics = metrics.filter(m => m.group === 'risk');
  const strategies = [...new Set(rows.map((row) => P.clean(row.strategy1)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const sourceOrder = ["gffunds_highend", "geshang", "simuwang", "howbuy"];
  const state = {
    query: "", source: "", strategy: "", dataState: "all",
    xMetric: pack.meta.defaultXMetric || metrics[0]?.code || "",
    yMetric: pack.meta.defaultYMetric || metrics[1]?.code || metrics[0]?.code || "",
    selected: "", page: 1, pageSize: 60, focus: true, cardOpen: true,
  };
  let currentFiltered = [];
  let scatterHits = [];
  let keyboardIndex = -1;
  let resizeObserver = null;

  function applyParams() {
    const params = P.params();
    state.query = P.clean(params.get("q"));
    state.source = P.clean(params.get("source"));
    state.strategy = P.clean(params.get("strategy"));
    state.dataState = ["all", "ready", "missing"].includes(params.get("data")) ? params.get("data") : "all";
    state.xMetric = xMetrics.some(m => m.code === params.get("x")) ? params.get("x") : (pack.meta.defaultXMetric || xMetrics[0]?.code || "");
    state.yMetric = yMetrics.some(m => m.code === params.get("y")) ? params.get("y") : (pack.meta.defaultYMetric || yMetrics[0]?.code || "");
    state.selected = rows.some(r=>r.key===params.get("selected")) ? params.get("selected") : "";
    state.focus = params.get('view') !== 'all';
    state.cardOpen = params.get('card') !== 'folded';
    state.page = Math.max(1, Number(params.get("page")) || 1);
  }
  applyParams();

  function metricLabel(code) {
    return metricMap.get(code)?.label || code || "未选择";
  }

  function metricValue(row, code) {
    return P.number(row?.metrics?.[code]?.value);
  }

  function isPlottable(row) {
    return metricValue(row, state.xMetric) !== null && metricValue(row, state.yMetric) !== null;
  }

  function normalizeSearch(value) {
    return P.clean(value).toLocaleLowerCase("zh-CN").replace(/\s+/g, "");
  }

  function filterRows() {
    const query = normalizeSearch(state.query);
    return rows.filter((row) => {
      if (state.source && row.source !== state.source) return false;
      if (state.strategy && P.clean(row.strategy1) !== state.strategy) return false;
      const ready = isPlottable(row);
      if (state.dataState === "ready" && !ready) return false;
      if (state.dataState === "missing" && ready) return false;
      if (!query) return true;
      const haystack = normalizeSearch([
        row.name, row.fullName, row.id, row.registrationNumber, row.company,
        ...(row.managers || []), row.strategy1, row.strategy2, row.strategy3,
      ].join(" "));
      return haystack.includes(query);
    });
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    const set = (key, value, empty = "") => value && value !== empty ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    set("q", state.query);
    set("source", state.source);
    set("strategy", state.strategy);
    set("data", state.dataState, "all");
    set("x", state.xMetric, pack.meta.defaultXMetric);
    set("y", state.yMetric, pack.meta.defaultYMetric);
    set("selected", state.selected);
    set('view', state.focus ? '' : 'all');
    set('card', state.selected && !state.cardOpen ? 'folded' : '');
    if (state.page > 1) url.searchParams.set("page", String(state.page)); else url.searchParams.delete("page");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  function option(value, label, selected) {
    return `<option value="${P.esc(value)}"${value === selected ? " selected" : ""}>${P.esc(label)}</option>`;
  }

  function sourceCountText() {
    return sourceOrder.map((source) => `${P.sourceColors[source]?.label || source} ${Number(pack.meta.sourceCounts?.[source] || 0).toLocaleString("zh-CN")}`).join(" · ");
  }

  root.innerHTML = `
    <section class="page-heading">
      <div><span class="eyebrow">PRIVATE FUND</span><h1>私募筛选</h1></div>
      <div class="asof-block"><strong>${rows.length.toLocaleString("zh-CN")}</strong><span>${P.esc(sourceCountText())}</span><time>${P.esc(P.formatDateTime(pack.meta.latestObservedAt))}</time></div>
    </section>
    <section id="productListPanel" class="panel" aria-labelledby="filterTitle">
      <div class="panel-head"><h2 id="filterTitle">产品列表</h2><span id="filterCount" class="panel-count"></span></div>
      <div class="filter-panel">
        <div class="filter-grid">
          <label class="field"><span>产品 / 管理人 / 经理 / 备案号</span><input id="productSearch" type="search" autocomplete="off" placeholder="输入产品、机构或经理" value="${P.esc(state.query)}"></label>
          <label class="field"><span>数据来源</span><select id="sourceFilter">${option("", "全部来源", state.source)}${sourceOrder.map((id) => option(id, P.sourceColors[id]?.label || id, state.source)).join("")}</select></label>
          <label class="field"><span>主策略</span><select id="strategyFilter">${option("", "全部策略", state.strategy)}${strategies.map((value) => option(value, value, state.strategy)).join("")}</select></label>
          <label class="field"><span>指标状态</span><select id="dataFilter">${option("all", "全部产品", state.dataState)}${option("ready", "所选两指标齐全", state.dataState)}${option("missing", "所选指标暂缺", state.dataState)}</select></label>
          <button id="resetFilters" class="secondary-button" type="button">重置</button>
        </div>
      </div>
      <div id="summaryStrip" class="summary-strip"></div>
      <div class="table-wrap">
        <table class="product-table">
          <thead><tr><th>产品</th><th>来源</th><th>管理人 / 经理</th><th>策略</th><th>成立日</th><th>最新业绩 / 序列</th><th id="xTableHead"></th><th id="yTableHead"></th><th>坐标状态</th></tr></thead>
          <tbody id="productTableBody"></tbody>
        </table>
      </div>
      <div id="pager" class="pager"></div>
    </section>
    <section id="scatterPanel" class="panel" aria-labelledby="scatterTitle">
      <div class="panel-head"><h2 id="scatterTitle">全部产品业绩点阵</h2><span id="scatterCount" class="panel-count"></span></div>
      <div class="scatter-toolbar">
        <label class="field"><span>X 轴 · 区间收益</span><select id="xMetric">${xMetrics.map((metric) => option(metric.code, `${metric.label} · ${metric.coverageTotal}只`, state.xMetric)).join("")}</select></label>
        <label class="field"><span>Y 轴 · 风险指标</span><select id="yMetric">${yMetrics.map((metric) => option(metric.code, `${metric.label} · ${metric.coverageTotal}只`, state.yMetric)).join("")}</select></label>
        <div class="scatter-view-controls" role="group" aria-label="点阵视图"><button type="button" id="focusView">聚焦主分布</button><button type="button" id="allView">全样本</button></div>
      </div>
      <div class="scatter-guide"><div class="legend-row"><span class="legend-item"><i class="legend-mark" style="--mark:#c52a30"></i>广发产品</span><span class="legend-item"><i class="legend-mark" style="--mark:#929aa2"></i>其他产品</span><span class="legend-item"><i class="selected-key"></i>当前选中</span></div><span id="viewNote"></span></div>
      <p id="quadrantRule" class="quadrant-rule"></p>
      <div id="scatterStage" class="scatter-stage">
        <canvas id="performanceScatter" height="540" tabindex="0" role="img" aria-describedby="scatterAccessibleSummary"></canvas>
        <div id="scatterTooltip" class="chart-tooltip" hidden></div>
      </div>
      <p id="scatterAccessibleSummary" class="sr-only"></p>
      <div id="missingSummary" class="missing-summary"></div>
      <details class="comparability-note"><summary>日期与比较口径</summary><p>${P.esc(pack.meta.comparability?.warning || '')} 指标取各产品最新业绩日，实际日期见产品卡。象限仅表示当前筛选样本的相对高低，并非绝对优劣。聚焦视图分别取各轴2.5%—97.5%分位范围，并纳入当前选中产品；未删除数据。</p></details>
    </section>`;
  const scatterPanel = document.getElementById('scatterPanel');
  root.insertBefore(scatterPanel, root.children[1]);
  const filterDisclosure=document.createElement('details');
  filterDisclosure.className='filter-disclosure';filterDisclosure.open=window.innerWidth>760;
  filterDisclosure.innerHTML='<summary>筛选产品 <span id="activeFilters"></span></summary>';
  filterDisclosure.appendChild(root.querySelector('.filter-panel'));
  scatterPanel.insertBefore(filterDisclosure, scatterPanel.querySelector('.scatter-toolbar'));
  const selectionPanel=document.createElement('section');selectionPanel.id='selectedProductPanel';
  selectionPanel.setAttribute('aria-label','当前选中产品');
  root.insertBefore(selectionPanel,document.getElementById('productListPanel'));

  const elements = {
    search: document.getElementById("productSearch"), source: document.getElementById("sourceFilter"),
    strategy: document.getElementById("strategyFilter"), data: document.getElementById("dataFilter"),
    reset: document.getElementById("resetFilters"), count: document.getElementById("filterCount"),
    summary: document.getElementById("summaryStrip"), body: document.getElementById("productTableBody"),
    pager: document.getElementById("pager"), xHead: document.getElementById("xTableHead"), yHead: document.getElementById("yTableHead"),
    xMetric: document.getElementById("xMetric"), yMetric: document.getElementById("yMetric"),
    scatterCount: document.getElementById("scatterCount"), canvas: document.getElementById("performanceScatter"),
    tooltip: document.getElementById("scatterTooltip"), summaryText: document.getElementById("scatterAccessibleSummary"),
  };

  function renderSummary(filtered) {
    const ready = filtered.filter(isPlottable).length;
    const sourceCount = new Set(filtered.map((row) => row.source)).size;
    const managerCount = new Set(filtered.map((row) => P.clean(row.company)).filter(Boolean)).size;
    const analysisCount = filtered.filter((row) => Number(row.analysisPointCount || 0) >= 2).length;
    const derivedCount = filtered.filter((row) => Number(row.derivedMetricCount || 0) > 0).length;
    const metrics = [
      ["筛选产品", filtered.length.toLocaleString("zh-CN")],
      ["二维坐标", ready.toLocaleString("zh-CN")],
      ["指标缺失", (filtered.length - ready).toLocaleString("zh-CN")],
      ["管理人机构", managerCount.toLocaleString("zh-CN")],
      ["可用序列 / 衍生指标", `${analysisCount.toLocaleString("zh-CN")} / ${derivedCount.toLocaleString("zh-CN")}`],
      ["数据来源", sourceCount.toLocaleString("zh-CN")],
    ];
    elements.summary.innerHTML = metrics.map(([label, value]) => `<div class="summary-metric"><span>${P.esc(label)}</span><strong>${P.esc(value)}</strong></div>`).join("");
  }

  function renderMetricCell(row, code) {
    const metric = row.metrics?.[code];
    if (!metric || P.number(metric.value) === null) {const reason=P.missingReason(row,code);return `<span class="metric-raw is-missing">—</span><span class="cell-sub metric-missing" title="${P.esc(reason.message)}">${P.esc(reason.label)}</span>`;}
    return `<span class="metric-raw ${P.metricTone(code,metric.value)}" title="${P.esc([metric.windowStart,metric.windowEnd,metric.formula].filter(Boolean).join(' · '))}">${P.esc(P.formatNumber(metric.value, 2))}${metric.unit === 'percent' ? '%' : ''}</span><span class="cell-sub">${P.esc(P.formatDate(metric.asOf))} · ${metric.origin === 'calculated' ? '历史计算' : '来源披露'}</span>`;
  }

  function renderSelectedCard() {
    const row=rows.find(r=>r.key===state.selected);
    if(!row){selectionPanel.innerHTML='<div class="selection-hint">点选图中的产品，或点击列表行，查看产品关键指标卡。</div>';return;}
    const codes=[...new Set([state.xMetric,state.yMetric,'return_1m','return_3m','return_6m','return_ytd','return_1y','return_since','drawdown_1y','volatility_1y','sharpe_1y'])];
    selectionPanel.innerHTML=`<details class="selected-product-card" ${state.cardOpen?'open':''}><summary><div><span class="selection-eyebrow">当前选中 · ${P.esc(P.sourceColors[row.source]?.label || row.source)}</span><a class="selected-product-name" href="${P.esc(P.detailHref(row.key,location.search.slice(1)))}">${P.esc(row.name||row.id)} ↗</a><span class="cell-sub">${P.esc(row.id)} · ${P.esc(row.strategy1||'策略未披露')}</span></div><span class="selection-toggle"><span class="when-open">收起指标</span><span class="when-closed">展开指标</span>⌄</span></summary><div class="selection-basics">${[['成立日期',row.inceptionDate],['基金经理',(row.managers||[]).join('、')],['管理机构',row.company],['业绩截止',row.analysisLatestDate||row.latestNavDate]].map(([label,value])=>`<div><span>${label}</span><strong>${P.esc(value||'未披露')}</strong></div>`).join('')}</div><div class="selection-metrics">${codes.map(code=>`<div><span class="selection-metric-label">${P.esc(metricLabel(code))}</span>${renderMetricCell(row,code)}${!row.metrics?.[code]?`<small>${P.esc(P.missingReason(row,code).message)}</small>`:''}</div>`).join('')}</div></details>`;
    const details=selectionPanel.querySelector('details');
    details.querySelector('summary').addEventListener('click',event=>{
      if(event.target.closest('a'))return;
      event.preventDefault();
      state.cardOpen=!details.open;details.open=state.cardOpen;syncUrl();
    });
    details.addEventListener('toggle',()=>{
      if(!details.isConnected)return;
      state.cardOpen=details.open;syncUrl();
    });
    selectionPanel.querySelector('a').addEventListener('click',event=>event.stopPropagation());
  }

  function selectProduct(key, moveToCard=false) {
    state.selected=key;state.cardOpen=true;
    const index=currentFiltered.findIndex(r=>r.key===key);
    if(index>=0)state.page=Math.floor(index/state.pageSize)+1;
    syncUrl();renderSelectedCard();renderTable(currentFiltered);renderScatter(currentFiltered);
    if(moveToCard)selectionPanel.scrollIntoView({block:'start',behavior:'auto'});
    const row=rows.find(r=>r.key===key);P.announce(`已选择 ${row?.name||key}，产品卡位于列表上方。`);
  }

  function renderTable(filtered) {
    const pages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);
    elements.xHead.textContent = metricLabel(state.xMetric);
    elements.yHead.textContent = metricLabel(state.yMetric);
    const backQuery = window.location.search.replace(/^\?/, "");
    elements.body.innerHTML = pageRows.map((row) => {
      const ready = isPlottable(row);
      const company = P.clean(row.company) || "未披露管理人";
      const managers = (row.managers || []).join("、");
      return `<tr data-key="${P.esc(row.key)}" tabindex="0" aria-selected="${row.key === state.selected}" class="${row.key === state.selected ? "is-selected " : ""}${row.source === "gffunds_highend" ? "is-gffunds" : ""}">
        <td><a class="product-link" href="${P.esc(P.detailHref(row.key, backQuery))}">${P.esc(row.name || row.id)}</a><span class="cell-sub">${P.esc(row.id)}${row.registrationNumber ? ` · ${P.esc(row.registrationNumber)}` : ""}</span></td>
        <td>${P.sourceBadge(row.source)}</td>
        <td>${P.esc(company)}${managers ? `<span class="cell-sub">经理：${P.esc(managers)}</span>` : ""}</td>
        <td>${P.esc(row.strategy1 || "未分类")}<span class="cell-sub">${P.esc(row.strategy2 || row.strategy3 || "")}</span></td>
        <td>${P.esc(P.formatDate(row.inceptionDate))}</td>
        <td>${P.esc(P.formatDate(row.analysisLatestDate || row.latestNavDate))}<span class="cell-sub">${Number(row.analysisPointCount || 0).toLocaleString("zh-CN")}点${row.derivedMetricCount ? ` · ${Number(row.derivedMetricCount).toLocaleString("zh-CN")}项衍生指标` : ""}</span></td>
        <td>${renderMetricCell(row, state.xMetric)}</td><td>${renderMetricCell(row, state.yMetric)}</td>
        <td><span class="data-state ${ready ? "is-ready" : ""}">${ready ? "可绘制" : "所选指标暂缺"}</span></td>
      </tr>`;
    }).join("") || '<tr><td colspan="9">没有符合条件的产品。</td></tr>';
    elements.pager.innerHTML = `<span>第 ${state.page.toLocaleString("zh-CN")} / ${pages.toLocaleString("zh-CN")} 页 · 每页 ${state.pageSize} 条</span><div class="pager-actions"><button type="button" data-page="prev" ${state.page <= 1 ? "disabled" : ""}>上一页</button><button type="button" data-page="next" ${state.page >= pages ? "disabled" : ""}>下一页</button></div>`;
  }

  function renderScatter(filtered) {
    const canvas=elements.canvas, width=Math.max(300,Math.round(canvas.clientWidth||900)), height=Math.max(480,Math.round(canvas.clientHeight||600));
    const dpr=Math.min(2,window.devicePixelRatio||1), ctx=canvas.getContext('2d');
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    const model=P.scatterModel(filtered,state.xMetric,state.yMetric,state.focus,state.selected);
    const missing=filtered.filter(r=>!isPlottable(r)), small=width<600;
    const L=small?48:64,R=width-22,T=48,B=height-122;
    const sx=v=>L+(v-model.xDomain[0])/(model.xDomain[1]-model.xDomain[0])*(R-L);
    const sy=v=>B-(v-model.yDomain[0])/(model.yDomain[1]-model.yDomain[0])*(B-T);
    const fmt=(v,code)=>`${P.formatNumber(v,2)}${metricMap.get(code)?.unit==='percent'?'%':''}`;
    const yName=state.yMetric.startsWith('drawdown')?'回撤':state.yMetric.startsWith('volatility')?'波动':'夏普';
    const mx=sx(model.xMedian),my=sy(model.yMedian);
    scatterHits=[];
    ctx.textBaseline='middle';ctx.font='12px "Microsoft YaHei",sans-serif';ctx.fillStyle='#48545e';ctx.textAlign='left';
    ctx.fillText(`${metricLabel(state.yMetric)}${metricMap.get(state.yMetric)?.unit==='percent'?' (%)':''}`,L,20);
    if(model.valid.length){
      if(model.valid.length>=2){
        ctx.fillStyle='rgba(197,42,48,.035)';
        ctx.fillRect(mx,model.higherYBetter?T:my,R-mx,model.higherYBetter?my-T:B-my);
        ctx.fillStyle='rgba(22,132,91,.035)';
        ctx.fillRect(L,model.higherYBetter?my:T,mx-L,model.higherYBetter?B-my:my-T);
      }
      ctx.font='11px "Segoe UI","Microsoft YaHei",sans-serif';
      const ticks=small?3:4;
      for(let i=0;i<=ticks;i++){
        const t=i/ticks,xx=L+t*(R-L),yy=B-t*(B-T);
        ctx.strokeStyle='#e8ecef';ctx.lineWidth=1;ctx.setLineDash([]);
        ctx.beginPath();ctx.moveTo(xx,T);ctx.lineTo(xx,B);ctx.moveTo(L,yy);ctx.lineTo(R,yy);ctx.stroke();
        ctx.fillStyle='#75808a';ctx.textAlign='center';
        ctx.fillText(P.formatNumber(model.xDomain[0]+t*(model.xDomain[1]-model.xDomain[0]),1),xx,B+17);
        ctx.textAlign='right';ctx.fillText(P.formatNumber(model.yDomain[0]+t*(model.yDomain[1]-model.yDomain[0]),1),L-7,yy);
      }
      if(model.valid.length>=2){
        ctx.setLineDash([6,5]);ctx.strokeStyle='#64717d';ctx.lineWidth=1.25;
        ctx.beginPath();ctx.moveTo(mx,T);ctx.lineTo(mx,B);ctx.moveTo(L,my);ctx.lineTo(R,my);ctx.stroke();ctx.setLineDash([]);
      }
      const ordered=[...model.visible].sort((a,b)=>Number(a.source==='gffunds_highend')-Number(b.source==='gffunds_highend'));
      const point=(row,selected=false)=>{
        const x=sx(metricValue(row,state.xMetric)),y=sy(metricValue(row,state.yMetric)),gf=row.source==='gffunds_highend';
        ctx.globalAlpha=selected?1:gf?.95:.40;ctx.fillStyle=gf?'#c52a30':'#929aa2';ctx.beginPath();ctx.arc(x,y,selected?5:gf?3.8:1.5,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
        if(gf||selected){ctx.strokeStyle='#fff';ctx.lineWidth=.8;ctx.stroke();}
        if(selected){ctx.strokeStyle='#142431';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.stroke();canvas.dataset.selectedX=String(x);canvas.dataset.selectedY=String(y);}
        return {x,y,row,kind:'plot'};
      };
      ordered.forEach(r=>scatterHits.push(point(r)));
      const chosen=ordered.find(r=>r.key===state.selected);if(chosen)point(chosen,true);
      if(model.valid.length>=2){
        const labels=[
          ['low_bad',false,!model.higherYBetter],['high_bad',true,!model.higherYBetter],
          ['low_good',false,model.higherYBetter],['high_good',true,model.higherYBetter]
        ];
        labels.forEach(([key,right,top])=>{
          const high=key.startsWith('high'),good=key.endsWith('good');
          const text=small?`${high?'高':'低'}收 · ${good===model.higherYBetter?'高':'低'}${yName}`:`较${high?'高':'低'}收益 · 较${good===model.higherYBetter?'高':'低'}${yName}`;
          const count=`${model.counts[key].toLocaleString('zh-CN')}只`;
          ctx.font=`600 ${small?11:12}px "Microsoft YaHei",sans-serif`;
          const w=Math.max(ctx.measureText(text).width,ctx.measureText(count).width)+14, x=right?R-w-7:L+7,y=top?T+7:B-47;
          ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(x,y,w,39);
          ctx.fillStyle=key==='high_good'?'#a72831':key==='low_bad'?'#197653':'#56616b';ctx.textAlign='left';
          ctx.fillText(text,x+7,y+11);ctx.font='11px "Segoe UI",sans-serif';ctx.fillText(count,x+7,y+28);
        });
      }
    }else{
      ctx.fillStyle='#75808a';ctx.textAlign='center';ctx.fillText('所选指标暂无可绘制产品',width/2,(T+B)/2);
      ctx.fillText('请切换指标，或查看下方缺失原因',width/2,(T+B)/2+25);
    }
    ctx.font='11px "Microsoft YaHei",sans-serif';ctx.fillStyle='#48545e';ctx.textAlign='center';
    ctx.fillText(`${metricLabel(state.xMetric)}${metricMap.get(state.xMetric)?.unit==='percent'?' (%)':''}`,width/2,B+38);
    const bandTop=height-65, bandHeight=49;
    ctx.fillStyle='#f6f7f8';ctx.fillRect(L,bandTop,R-L,bandHeight);ctx.fillStyle='#68747e';ctx.textAlign='left';
    ctx.fillText(`指标暂缺 ${missing.length.toLocaleString('zh-CN')}只 · 可点选查看原因`,L+7,bandTop+11);
    const cols=Math.max(1,Math.floor((R-L-14)/2.5)),nr=Math.max(1,Math.ceil(missing.length/cols)),pitch=Math.min(2.5,23/nr);
    missing.forEach((row,i)=>{
      const x=L+7+i%cols*2.5,y=bandTop+24+Math.floor(i/cols)*pitch;
      ctx.fillStyle=row.source==='gffunds_highend'?'#c52a30':'#929aa2';ctx.globalAlpha=.65;ctx.fillRect(x,y,1.4,1.4);ctx.globalAlpha=1;
      scatterHits.push({x:x+.7,y:y+.7,row,kind:'missing'});
      if(row.key===state.selected){ctx.strokeStyle='#142431';ctx.strokeRect(x-3,y-3,7.4,7.4);}
    });
    const reasonNames={inception_short:'成立时间不足',history_short:'可用历史不足',no_series:'历史序列缺失',anchor_missing:'区间起点缺净值',monthly_insufficient:'月度样本不足',zero_denominator:'分母为零',calculation_unavailable:'其他计算条件不足'};
    const counts={};
    missing.forEach(row=>{
      const reasons=[state.xMetric,state.yMetric].filter(c=>!row.metrics?.[c]).map(c=>P.missingReason(row,c));
      const primary=reasons.find(r=>r.code==='inception_short')||reasons[0];
      if(primary)counts[primary.code]=(counts[primary.code]||0)+1;
    });
    document.getElementById('missingSummary').innerHTML=`<strong>缺失原因</strong>${Object.entries(counts).map(([c,n])=>`<span>${reasonNames[c]||c} <b>${n.toLocaleString('zh-CN')}</b></span>`).join('')||'<span>当前两个指标均齐全</span>'}<small>按每只产品的主要原因归类；具体条件见产品卡。</small>`;
    document.getElementById('focusView').setAttribute('aria-pressed',String(state.focus));
    document.getElementById('allView').setAttribute('aria-pressed',String(!state.focus));
    document.getElementById('viewNote').textContent=`${state.focus&&model.valid.length>40?'主分布视图':'全样本视图'} · 视窗内${model.visible.length}只${model.outside.length?` / 视窗外${model.outside.length}只（广发${model.outside.filter(r=>r.source==='gffunds_highend').length}只）`:''}`;
    document.getElementById('quadrantRule').innerHTML=model.valid.length>=2?`虚线＝当前筛选样本中位数：收益 <b class="${P.metricTone(state.xMetric,model.xMedian)}">${fmt(model.xMedian,state.xMetric)}</b> / ${yName} <b class="${P.metricTone(state.yMetric,model.yMedian)}">${fmt(model.yMedian,state.yMetric)}</b>。${model.higherYBetter?'右上':'右下'}为相对高收益、${model.higherYBetter?'高夏普':'低'+yName}区；象限计数包含视窗外产品。`:'有效样本不足2只，不进行四象限比较。';
    elements.scatterCount.textContent=`可绘制 ${model.valid.length.toLocaleString('zh-CN')} · 指标暂缺 ${missing.length.toLocaleString('zh-CN')}`;
    const accessible=`${metricLabel(state.xMetric)}与${metricLabel(state.yMetric)}。广发红点、其他灰点。筛选${filtered.length}只，可绘制${model.valid.length}只，视窗内${model.visible.length}只，视窗外${model.outside.length}只，指标缺失${missing.length}只。虚线采用全筛选样本中位数。`;
    canvas.setAttribute('aria-label',accessible);elements.summaryText.textContent=accessible;
    Object.assign(canvas.dataset,{visibleCount:String(model.visible.length),outsideCount:String(model.outside.length),xMedian:String(model.xMedian),yMedian:String(model.yMedian),redCount:String(model.visible.filter(r=>r.source==='gffunds_highend').length),grayCount:String(model.visible.filter(r=>r.source!=='gffunds_highend').length),selected:state.selected});
  }

  function render({ announce = false } = {}) {
    currentFiltered = filterRows();
    const readyCount = currentFiltered.filter(isPlottable).length;
    syncUrl();
    elements.count.textContent = `${currentFiltered.length.toLocaleString("zh-CN")} / ${rows.length.toLocaleString("zh-CN")} 个产品`;
    renderSummary(currentFiltered);
    renderSelectedCard();
    renderTable(currentFiltered);
    renderScatter(currentFiltered);
    document.getElementById('activeFilters').textContent=[state.query,P.sourceColors[state.source]?.label,state.strategy].filter(Boolean).join(' · ')||'全部产品';
    if (announce) P.announce(`筛选后 ${currentFiltered.length} 个产品，${readyCount} 个进入二维坐标。`);
  }

  function updateFilter(key, value) {
    state[key] = value;
    state.page = 1;
    if (state.selected && !filterRows().some((row) => row.key === state.selected)) state.selected = "";
    render({ announce: true });
  }

  let searchTimer = null;
  elements.search.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => updateFilter("query", elements.search.value), 160);
  });
  elements.source.addEventListener("change", () => updateFilter("source", elements.source.value));
  elements.strategy.addEventListener("change", () => updateFilter("strategy", elements.strategy.value));
  elements.data.addEventListener("change", () => updateFilter("dataState", elements.data.value));
  elements.xMetric.addEventListener("change", () => updateFilter("xMetric", elements.xMetric.value));
  elements.yMetric.addEventListener("change", () => updateFilter("yMetric", elements.yMetric.value));
  document.getElementById('focusView').addEventListener('click',()=>{state.focus=true;renderScatter(currentFiltered);syncUrl();});
  document.getElementById('allView').addEventListener('click',()=>{state.focus=false;renderScatter(currentFiltered);syncUrl();});
  elements.reset.addEventListener("click", () => {
    Object.assign(state, { query: "", source: "", strategy: "", dataState: "all", xMetric: pack.meta.defaultXMetric, yMetric: pack.meta.defaultYMetric, selected: "", page: 1,focus:true,cardOpen:true });
    elements.search.value = ""; elements.source.value = ""; elements.strategy.value = ""; elements.data.value = "all"; elements.xMetric.value = state.xMetric; elements.yMetric.value = state.yMetric;
    render({ announce: true });
  });
  elements.pager.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-page]");
    if (!button || button.disabled) return;
    state.page += button.dataset.page === "next" ? 1 : -1;
    renderTable(currentFiltered); syncUrl();
    elements.body.closest(".table-wrap").scrollTop = 0;
  });
  elements.body.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    const rowNode = event.target.closest("tr[data-key]");
    if (!rowNode) return;
    selectProduct(rowNode.dataset.key,true);
  });
  elements.body.addEventListener('keydown',event=>{
    if(!['Enter',' '].includes(event.key)||event.target.closest('a'))return;
    const rowNode=event.target.closest('tr[data-key]');
    if(!rowNode)return;
    event.preventDefault();selectProduct(rowNode.dataset.key,true);
    selectionPanel.querySelector('summary')?.focus();
  });

  function nearestHit(event) {
    const rect = elements.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let best = null;
    let bestDistance = event.pointerType==='touch' ? 484 : 121;
    for (const hit of scatterHits) {
      const distance = ((hit.x - x) ** 2 + (hit.y - y) ** 2) * (hit.row.source==='gffunds_highend' ? .8 : 1);
      if (distance <= bestDistance) { bestDistance = distance; best = hit; }
    }
    return best ? { ...best, pointerX: x, pointerY: y } : null;
  }

  function showTooltip(hit) {
    if (!hit) { elements.tooltip.hidden = true; return; }
    const row = hit.row;
    const x = row.metrics?.[state.xMetric];
    const y = row.metrics?.[state.yMetric];
    const tipMetric = (metric, code) => `${P.esc(metricLabel(code))}：${metric ? `<b class="${P.metricTone(code,metric.value)}">${P.esc(P.formatNumber(metric.value, 2))}${metric.unit === 'percent' ? '%' : ''}</b>` : P.esc(P.missingReason(row,code).label)}<br>${metric ? P.esc(`${metric.windowStart || '来源'} — ${metric.windowEnd || metric.asOf || '--'} · ${metric.origin === 'calculated' ? '历史计算' : '来源披露'}`) : P.esc(P.missingReason(row,code).message)}`;
    elements.tooltip.innerHTML = `<strong>${P.esc(row.name || row.id)}</strong><span>${P.esc(P.sourceColors[row.source]?.label || row.source)} · ${P.esc(row.company || "管理人未披露")}</span><span>${tipMetric(x, state.xMetric)}</span><span>${tipMetric(y, state.yMetric)}</span>`;
    elements.tooltip.hidden = false;
    const stageRect = elements.canvas.parentElement.getBoundingClientRect();
    const left = Math.max(8,Math.min(stageRect.width - elements.tooltip.offsetWidth - 8, hit.pointerX + 16));
    const top = Math.max(8,Math.min(stageRect.height-elements.tooltip.offsetHeight-8,hit.pointerY-30));
    elements.tooltip.style.left = `${left}px`;
    elements.tooltip.style.top = `${top}px`;
  }

  elements.canvas.addEventListener("pointermove", (event) => showTooltip(nearestHit(event)));
  elements.canvas.addEventListener("pointerleave", () => showTooltip(null));
  elements.canvas.addEventListener("click", (event) => {
    const hit = nearestHit(event);
    if (!hit) return;
    showTooltip(null);selectProduct(hit.row.key,true);
  });
  elements.canvas.addEventListener("keydown", (event) => {
    if (!["ArrowRight", "ArrowLeft", "Enter"].includes(event.key) || !scatterHits.length) return;
    event.preventDefault();
    if (event.key === "Enter") {
      const row = rows.find(r=>r.key===state.selected) || scatterHits[Math.max(0, keyboardIndex)]?.row;
      if (row) window.location.href = P.detailHref(row.key, window.location.search.replace(/^\?/, ""));
      return;
    }
    keyboardIndex = scatterHits.findIndex(hit=>hit.row.key===state.selected);
    keyboardIndex = (keyboardIndex + (event.key === "ArrowRight" ? 1 : -1) + scatterHits.length) % scatterHits.length;
    const row = scatterHits[keyboardIndex].row;
    selectProduct(row.key);
    P.announce(`${row.name || row.id}，${keyboardIndex + 1}/${scatterHits.length}`);
  });

  resizeObserver = new ResizeObserver(() => window.requestAnimationFrame(() => renderScatter(currentFiltered)));
  resizeObserver.observe(elements.canvas.parentElement);
  window.addEventListener("popstate", () => {
    window.clearTimeout(searchTimer);applyParams();
    elements.search.value=state.query;elements.source.value=state.source;elements.strategy.value=state.strategy;
    elements.data.value=state.dataState;elements.xMetric.value=state.xMetric;elements.yMetric.value=state.yMetric;
    render();
  });
  render();
  document.body.dataset.ready = "true";
})();
