/* Guangfa-only public attribution chapters for the shared product detail page. */
(() => {
  'use strict';
  const SOURCE_ID='gffunds_highend';
  const RED='#B72F32',GREEN='#17744B',NAVY='#163A63',GRID='#E1E6EC',MUTED='#6B7787';
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const finite=value=>typeof value==='number'&&Number.isFinite(value);
  const show=value=>value==null||value===''?'—':esc(value);
  const pct=value=>finite(value)?`${value>=0?'+':''}${(value*100).toFixed(2)}%`:'—';
  const num=(value,digits=4)=>finite(value)?value.toFixed(digits):'—';
  const tone=value=>!finite(value)||value===0?'neutral':value>0?'positive':'negative';
  const periodStatus=status=>({complete:'周期覆盖完整',partial:'当前仅覆盖周期部分',history_short:'净值历史不足'}[status]||'数据不足');
  const sortPeriods=rows=>(rows||[]).slice().sort((a,b)=>String(b?.periodEnd||'').localeCompare(String(a?.periodEnd||''))||String(b?.announcementDate||'').localeCompare(String(a?.announcementDate||'')));
  const empty=message=>`<div class="gf-attr-empty">${esc(message)}</div>`;
  const table=(headers,rows,minimum='760px')=>`<div class="gf-attr-table-wrap"><table class="gf-attr-table" style="min-width:${minimum}"><thead><tr>${headers.map(item=>`<th>${esc(item)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  function annualSection(payload){
    const periods=(payload.annualPeriods||[]).slice().sort((a,b)=>Number(b.year)-Number(a.year));
    const options=periods.map((row,index)=>`<option value="${esc(row.year)}" ${index===0?'selected':''}>${esc(row.year)}年${row.latestDate?.endsWith('-12-31')?'':'（截至 '+esc(row.latestDate)+'）'}</option>`).join('');
    return `<section class="card section gf-attr-section" data-gf-chapter="annualComparison"><div class="head"><div><div class="gf-attr-index">01 · 广发增强</div><h2>年度曲线：产品业绩 vs 披露持仓估算</h2></div><div class="controls">${periods.length?`<label for="gfAnnualSelect">年度</label><select id="gfAnnualSelect">${options}</select>`:''}</div></div><div class="gf-attr-body"><div class="gf-attr-legend"><span><i style="background:${RED}"></i>产品业绩</span><span><i style="background:${NAVY}"></i>披露持仓估算</span></div>${periods.length?'<div class="gf-attr-chart"><svg id="gfAnnualChart" viewBox="0 0 920 270" preserveAspectRatio="none" role="img" aria-label="年度产品业绩与披露持仓估算对比"></svg></div>':empty('当前没有足够的完整可观测净值点生成年度曲线。')}<p class="gf-attr-note">产品曲线按当年首个有效净值点归一。${esc(payload.scope?.holdingScopeNote||'')} ${esc(payload.scope?.marketAttributionReason||'')}</p></div></section>`;
  }
  function postNavSection(payload){
    const projection=payload.postNavProjection||{},available=payload.scope?.marketAttributionAvailable===true&&(projection.curve||[]).length>1;
    const content=available?'<div class="gf-attr-chart"><svg id="gfPostNavChart" viewBox="0 0 920 250" preserveAspectRatio="none" role="img" aria-label="最新净值日后的披露持仓估算走势"></svg></div>':empty(projection.message||payload.scope?.marketAttributionReason||'暂无可核验估算数据。');
    return `<section class="card section gf-attr-section" data-gf-chapter="postNavProjection"><div class="head"><div><div class="gf-attr-index">02 · 广发增强</div><h2>最新净值日后持仓估算走势</h2></div><div class="headNote">净值截止 ${show(projection.latestNavDate)} · 持仓披露 ${show(projection.latestPositionDate)}</div></div><div class="gf-attr-body">${content}<p class="gf-attr-note">该章节只允许使用报告披露持仓及其后可核验的公开收盘价；不把估算曲线当作产品真实净值。</p></div></section>`;
  }
  function quarterlySection(payload){
    const rows=payload.quarterlyPeriods||[];
    return `<section class="card section gf-attr-section" data-gf-chapter="quarterlyComparison"><div class="head"><div><div class="gf-attr-index">季度独立对比 · 广发增强</div><h2>季度曲线：产品业绩 vs 披露持仓估算</h2></div><div class="controls"><label for="gfQuarterSelect">季度</label><select id="gfQuarterSelect">${rows.map(r=>`<option value="${esc(r.key)}">${esc(r.label)}</option>`).join('')}</select></div></div><div class="gf-attr-body">${rows.length?'<div id="gfQuarterSummary" class="gf-attr-note"></div><div class="gf-attr-chart"><svg id="gfQuarterChart" viewBox="0 0 920 270" role="img" aria-label="季度产品业绩与披露持仓估算对比"></svg></div>':empty('暂无季度可观测业绩。')}<p class="gf-attr-note">季度独立列示，不依赖是否匹配定期报告。优先使用季初前14天内最后净值作为基点，否则使用季内首个有效点并注明部分覆盖；不补造季初净值。${esc(payload.scope?.marketAttributionReason||'')}</p></div></section>`;
  }
  function reportPeriodSection(payload){
    const rows=sortPeriods(payload.reportPeriods).map(row=>`<tr data-period-end="${esc(row.periodEnd)}"><td><b>${show(row.compareLabel)}</b><small>对应 ${show(row.reportPeriod)}</small></td><td>${show(row.announcementDate)}</td><td>${show(row.compareStart)} 至 ${show(row.compareEnd)}<small>实际 ${show(row.actualStartDate)} 至 ${show(row.actualEndDate)}</small></td><td class="${tone(row.productReturn)}">${pct(row.productReturn)}</td><td>${pct(row.holdingReturn)}</td><td>${pct(row.difference)}</td><td>${esc(periodStatus(row.status))}<small>${row.disclosedHoldingCount?`匹配${row.disclosedHoldingCount}项披露持仓`:'未匹配该期持仓明细'}</small></td></tr>`);
    return `<section class="card section gf-attr-section" data-gf-chapter="reportPeriodComparison"><div class="head"><div><div class="gf-attr-index">03 · 广发增强</div><h2>报告周期对比：产品业绩 vs 披露持仓估算</h2></div><div class="headNote">按报告期从近到远倒序</div></div><div class="gf-attr-body">${rows.length?table(['后续观察周期','报告公告日','业务区间 / 实际净值区间','产品业绩','披露持仓估算','差异','覆盖状态'],rows,'1120px'):empty('尚未匹配到可识别报告期。')}<p class="gf-attr-note">报告期持仓用于观察下一季度，不包含后续真实调仓、未披露资产、现金、衍生品、费用及申赎影响。</p></div></section>`;
  }
  function rangeSection(payload){
    const rows=(payload.commonRanges||[]).map(row=>`<tr><td><b>${show(row.label)}</b></td><td>${show(row.targetStartDate)}</td><td>${show(row.actualStartDate)} 至 ${show(row.actualEndDate)}</td><td class="${tone(row.productReturn)}">${pct(row.productReturn)}</td><td>${pct(row.holdingReturn)}</td><td>${row.status==='available'?'可计算':'历史不足'}</td></tr>`);
    return `<section class="card section gf-attr-section" data-gf-chapter="commonRanges"><div class="head"><div><div class="gf-attr-index">04 · 广发增强</div><h2>常用区间收益参考</h2></div><div class="headNote">实际端点同时列示，不补齐缺失历史</div></div><div class="gf-attr-body">${rows.length?table(['区间','目标起点','实际净值端点','产品收益','披露持仓估算','状态'],rows,'880px'):empty('当前净值历史不足，无法形成区间收益。')}</div></section>`;
  }
  function holdingsSection(payload){
    const rows=(payload.latestHoldings||[]).map((row,index)=>`<tr><td>${index+1}</td><td><b>${show(row.securityName)}</b><small>${show(row.theme)}</small></td><td>${show(row.securityId)}</td><td>${pct(row.weight)}</td><td>${show(row.latestMarketDate)}</td><td class="${tone(row.dayReturn)}">${pct(row.dayReturn)}</td><td class="${tone(row.weekReturn)}">${pct(row.weekReturn)}</td><td class="${tone(row.monthReturn)}">${pct(row.monthReturn)}</td><td class="${tone(row.quarterReturn)}">${pct(row.quarterReturn)}</td></tr>`);
    const summary=payload.latestHoldingSummary||{};
    return `<section class="card section gf-attr-section" data-gf-chapter="latestHoldings"><div class="head"><div><div class="gf-attr-index">06 · 广发增强</div><h2>最新公开持仓穿透</h2></div><div class="headNote">报告期末 ${show(summary.positionDate)} · 公告日 ${show(summary.announcementDate)} · ${show(summary.holdingCount)}项 · 已披露权重 ${pct(summary.disclosedWeight)}</div></div><div class="gf-attr-body">${rows.length?table(['排名','持仓 / 主题线索','代码','披露权重','最新行情日','日涨跌','周涨跌','月涨跌','季度涨跌'],rows,'1040px'):empty('当前产品没有已匹配的公开持仓证据。')}<p class="gf-attr-note">${esc(payload.scope?.holdingScopeNote||'')} 行情列为“—”表示尚无可核验输入，不表示涨跌为零。</p></div></section>`;
  }
  function peersSection(payload){
    const rows=(payload.similarProducts||[]).map(row=>`<tr><td><a href="./detail.html?id=${encodeURIComponent(row.key||'')}">${show(row.name)}</a><small>${show(row.id)}</small></td><td>${show(row.basis)}</td><td>${show((row.commonManagers||[]).join('、'))}</td><td>${show(row.strategyType)}</td><td>${show(row.latestDate)}</td><td class="${tone(row.return1y)}">${pct(row.return1y)}</td></tr>`);
    return `<section class="card section gf-attr-section" data-gf-chapter="similarProducts"><div class="head"><div><div class="gf-attr-index">07 · 广发增强</div><h2>同经理相似产品</h2></div><div class="headNote">同经理优先；同策略类型排在前面</div></div><div class="gf-attr-body">${rows.length?table(['相似产品','关系依据','共同经理','策略类型','业绩截止','近1年收益'],rows,'900px'):empty('当前没有匹配到同经理的其他广发高端理财产品。')}<p class="gf-attr-note">相似产品仅用于产品族参照，不代表持仓一致，也不替代当前产品的实际披露。</p></div></section>`;
  }
  function evidenceSection(payload){
    const e=payload.evidence||{};
    const rows=[
      ['完整可观测业绩',`${show(e.analysisPointCount)}个有效点，${show(e.analysisFirstDate)} 至 ${show(e.analysisLatestDate)}`],
      ['公开净值明细',`${show(e.publicNavRowCount)}条；最近一年列表仅使用可公开页面记录`],
      ['定期报告',`${show(e.periodicReportCount)}份已识别报告；文档文件不随静态页面再分发`],
      ['公开持仓',`${show(e.latestDisclosedHoldingCount)}项，持仓报告期末 ${show(e.latestPositionDate)}`],
      ['估算行情范围',`${show(payload.scope?.marketCoverage?.firstDate)} 至 ${show(payload.scope?.marketCoverage?.latestDate)}；行情最新日期 ${show(e.marketQuoteLatestDate)}`],
      ['基金经理',`${show((e.managerNames||[]).join('、'))}（${show(e.managerCount)}人）`],
      ['业绩口径',show(e.performanceSeries)],['持仓边界',show(e.holdingEvidence)],['行情与归因',show(e.marketEvidence)],
    ].map(row=>`<tr><td><b>${row[0]}</b></td><td>${row[1]}</td></tr>`);
    return `<section class="card section gf-attr-section" data-gf-chapter="evidence"><div class="head"><div><div class="gf-attr-index">08 · 广发增强</div><h2>证据与数据质量</h2></div><div class="headNote">事实、估算与缺口分开列示</div></div><div class="gf-attr-body">${table(['证据项','当前页面口径'],rows,'720px')}</div></section>`;
  }
  function reportsSection(payload){
    const rows=sortPeriods(payload.reports).map(row=>`<tr><td><b>${show(row.title)}</b></td><td>${show(row.reportPeriod)}</td><td>${show(row.periodEnd)}</td><td>${show(row.announcementDate)}</td><td>${row.documentAvailable?'已识别；文件未随页面分发':'—'}</td></tr>`);
    return `<section class="card section gf-attr-section" data-gf-chapter="recentReports"><div class="head"><div><div class="gf-attr-index">09 · 广发增强</div><h2>近期报告</h2></div><div class="headNote">公告日与报告期末分开</div></div><div class="gf-attr-body">${rows.length?table(['报告名称','报告周期','报告期末','公告日期','文档状态'],rows,'920px'):empty('当前没有匹配到公开定期报告。')}</div></section>`;
  }
  function navSection(payload){
    const navRows=payload.navRows||[];
    const rows=navRows.map((row,index)=>`<tr class="gf-nav-row" data-nav-index="${index}" ${index>=20?'hidden':''}><td>${show(row.date)}</td><td>${num(row.unitNav)}</td><td>${num(row.accumulatedNav)}</td><td class="${tone(row.dailyReturn)}">${pct(row.dailyReturn)}</td></tr>`);
    const pager=navRows.length>20?`<div class="gf-attr-pager"><span id="gfNavStatus">已显示 20 / ${navRows.length} 条</span><button id="gfNavMore" type="button">再显示20条</button></div>`:'';
    return `<section class="card section gf-attr-section" data-gf-chapter="recentNav"><div class="head"><div><div class="gf-attr-index">10 · 广发增强</div><h2>最近一年净值列表</h2></div><div class="headNote">按净值日期倒序；每次20条</div></div><div class="gf-attr-body">${rows.length?table(['净值日期','单位净值','累计净值','相邻披露点涨跌'],rows,'680px'):empty('最近一年没有可公开展示的原始净值明细。')}${pager}<p class="gf-attr-note">相邻披露点涨跌不是自然日收益；周频或不定期披露之间可能跨越多个交易日。</p></div></section>`;
  }
  function render(payload){
    if(!payload||payload.sourceId!==SOURCE_ID)return'';
    return `<div class="gf-attr-root"><section class="gf-attr-scope" role="note"><b>广发高端理财增强分析</b><span>保留上方天眼私募详情，并补充公开报告、披露持仓和产品族证据。估算项与真实净值严格分开。</span></section>${annualSection(payload)}${quarterlySection(payload)}${postNavSection(payload)}${reportPeriodSection(payload)}${rangeSection(payload)}${holdingsSection(payload)}${peersSection(payload)}${evidenceSection(payload)}${reportsSection(payload)}${navSection(payload)}</div>`;
  }
  function drawChart(svgId,series){
    const svg=document.getElementById(svgId);if(!svg)return;
    const width=Math.max(320,svg.clientWidth||920),height=270;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
    const usable=(series||[]).map(item=>({...item,points:(item.points||[]).filter(point=>finite(point.value)&&/^\d{4}-\d{2}-\d{2}$/.test(point.date))})).filter(item=>item.points.length>1);
    if(!usable.length){svg.innerHTML=`<text x="${width/2}" y="135" text-anchor="middle" fill="#6B7787">当前没有足够数据绘图</text>`;return}
    const all=usable.flatMap(item=>item.points.map(point=>({x:Date.parse(point.date+'T00:00:00Z'),y:point.value}))),xs=all.map(point=>point.x),ys=all.map(point=>point.y).concat([0]);
    const minX=Math.min(...xs),maxX=Math.max(...xs),rawMin=Math.min(...ys),rawMax=Math.max(...ys),span=Math.max(rawMax-rawMin,.01),minY=rawMin-span*.12,maxY=rawMax+span*.12;
    const left=64,right=18,top=18,bottom=38,px=x=>left+(x-minX)/(maxX-minX||1)*(width-left-right),py=y=>top+(maxY-y)/(maxY-minY||1)*(height-top-bottom);
    let html='';for(let index=0;index<5;index++){const value=minY+(maxY-minY)*index/4,y=py(value);html+=`<line x1="${left}" x2="${width-right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GRID}"/><text x="${left-8}" y="${(y+4).toFixed(1)}" text-anchor="end" fill="${MUTED}" font-size="11">${(value*100).toFixed(1)}%</text>`}
    if(minY<=0&&maxY>=0)html+=`<line x1="${left}" x2="${width-right}" y1="${py(0).toFixed(1)}" y2="${py(0).toFixed(1)}" stroke="#9BA6B2" stroke-dasharray="4 4"/>`;
    for(const item of usable){const path=item.points.map((point,index)=>`${index?'L':'M'}${px(Date.parse(point.date+'T00:00:00Z')).toFixed(1)},${py(point.value).toFixed(1)}`).join(' ');html+=`<path d="${path}" fill="none" stroke="${item.color}" stroke-width="2.5" vector-effect="non-scaling-stroke"/>`}
    const dates=[minX,(minX+maxX)/2,maxX].map(t=>new Date(t).toISOString().slice(0,10));dates.forEach((value,index)=>{const x=left+(width-left-right)*index/2;html+=`<text x="${x}" y="${height-12}" text-anchor="${index===0?'start':index===2?'end':'middle'}" fill="${MUTED}" font-size="11">${esc(value)}</text>`});svg.innerHTML=html;
  }
  function activate(payload){
    if(!payload||payload.sourceId!==SOURCE_ID)return;
    const annual=payload.annualPeriods||[],select=document.getElementById('gfAnnualSelect');
    const drawAnnual=()=>{const row=annual.find(item=>String(item.year)===String(select?.value))||annual[0];interactiveChart('gfAnnualChart',row?[{name:'产品业绩',points:row.productCurve,color:RED},{name:'披露持仓估算',points:row.holdingCurve,color:NAVY}]:[])};
    if(select)select.onchange=drawAnnual;drawAnnual();
    const quarters=payload.quarterlyPeriods||[],quarterSelect=document.getElementById('gfQuarterSelect');
    const drawQuarter=()=>{const row=quarters.find(r=>r.key===quarterSelect?.value)||quarters[0];if(!row)return;
      const summary=document.getElementById('gfQuarterSummary');if(summary)summary.innerHTML=`${esc(row.label)} · 实际 ${show(row.firstDate)} 至 ${show(row.latestDate)} · ${esc(periodStatus(row.status))}<br>产品业绩（净值计算） <b class="${tone(row.productReturn)}">${pct(row.productReturn)}</b> ｜ 披露持仓估算 ${pct(row.holdingReturn)} ｜ 报告披露收益 ${pct(finite(row.reportedReturn)?row.reportedReturn/100:null)}<br>估算区间 ${show(row.holdingFirstDate)} 至 ${show(row.holdingLatestDate)} · 最低可计价披露权重 ${pct(row.holdingMinCoverage)}。报告披露收益与净值计算可能存在分红、端点及统计口径差异，分别展示，不强制拉齐。`;
      interactiveChart('gfQuarterChart',[{name:'产品业绩',points:row.productCurve,color:RED},{name:'披露持仓估算',points:row.holdingCurve,color:NAVY}]);};
    if(quarterSelect)quarterSelect.onchange=drawQuarter;drawQuarter();
    if(payload.scope?.marketAttributionAvailable)interactiveChart('gfPostNavChart',[{name:'披露持仓估算',points:payload.postNavProjection?.curve||[],color:NAVY}]);
    const more=document.getElementById('gfNavMore');if(more)more.onclick=()=>{const hidden=[...document.querySelectorAll('.gf-nav-row[hidden]')];hidden.slice(0,20).forEach(row=>row.hidden=false);const remaining=[...document.querySelectorAll('.gf-nav-row[hidden]')].length,total=(payload.navRows||[]).length,shown=total-remaining;document.getElementById('gfNavStatus').textContent=`已显示 ${shown} / ${total} 条`;if(!remaining)more.remove()};
  }
  function interactiveChart(id,series){
    const svg=document.getElementById(id);if(!svg)return;
    svg._gfHoverCleanup?.();
    svg.onpointermove=svg.onpointerleave=svg.onpointerdown=svg.onpointerup=svg.onpointercancel=null;
    const dates=[...new Set(series.flatMap(s=>(s.points||[]).filter(p=>finite(p.value)).map(p=>p.date)))].sort();
    let controls=document.getElementById(id+'Controls');
    if(!controls){controls=document.createElement('div');controls.id=id+'Controls';controls.className='gf-chart-controls';svg.parentElement.after(controls);}
    if(dates.length<2){controls.textContent='有效点不足，暂不能滑动。';drawChart(id,series);return;}
    controls.innerHTML=`<div class="gf-chart-window" aria-live="polite"></div><div class="gf-chart-sliders"><label>起点 <input type="range" aria-label="${id}时间起点" min="0" max="${dates.length-1}" value="0"></label><label>终点 <input type="range" aria-label="${id}时间终点" min="0" max="${dates.length-1}" value="${dates.length-1}"></label><button type="button">显示全部</button></div><div class="gf-chart-readout">鼠标移到曲线上即可在光标旁查看当日数据；滑块可缩放时间范围。</div>`;
    const [start,end]=controls.querySelectorAll('input'),note=controls.querySelector('.gf-chart-window');
    const tooltip=document.createElement('div');tooltip.id=id+'Tooltip';tooltip.className='gf-chart-tooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;
    tooltip.style.cssText='position:fixed;z-index:10000;pointer-events:none;background:#fff;color:#17324D;border:1px solid #CBD5E1;border-radius:4px;padding:10px 12px;font:13px/1.7 system-ui,sans-serif;box-shadow:0 3px 12px #17324D26;max-width:calc(100vw - 16px);box-sizing:border-box';
    svg.parentElement.append(tooltip);
    const hideHover=()=>{tooltip.hidden=true;svg.querySelector('[data-gf-hover]')?.remove();};
    window.addEventListener('scroll',hideHover,true);
    svg._gfHoverCleanup=()=>{window.removeEventListener('scroll',hideHover,true);tooltip.remove();svg._gfResize?.disconnect();};
    const update=()=>{hideHover();const a=+start.value,b=+end.value;drawChart(id,series.map(s=>({...s,points:(s.points||[]).filter(p=>p.date>=dates[a]&&p.date<=dates[b])})));note.textContent=`显示 ${dates[a]} 至 ${dates[b]} · ${b-a+1} / ${dates.length}个日期 · 收益基点保持原周期不变`;};
    start.oninput=()=>{if(+start.value>=+end.value)start.value=+end.value-1;update();};
    end.oninput=()=>{if(+end.value<=+start.value)end.value=+start.value+1;update();};
    controls.querySelector('button').onclick=()=>{start.value=0;end.value=dates.length-1;update();};
    let drag=null;svg.style.touchAction='pan-y';
    svg.onpointerdown=e=>{drag={x:e.clientX,a:+start.value,b:+end.value};svg.setPointerCapture?.(e.pointerId);};
    svg.onpointerup=()=>{drag=null;};
    svg.onpointerleave=svg.onpointercancel=()=>{drag=null;hideHover();};
    svg.onpointermove=e=>{const box=svg.getBoundingClientRect();if(drag){const span=drag.b-drag.a,delta=Math.round((drag.x-e.clientX)/box.width*(span+1));const a=Math.max(0,Math.min(dates.length-1-span,drag.a+delta));start.value=a;end.value=a+span;update();}
      const a=+start.value,b=+end.value,w=svg.viewBox.baseVal.width,ratio=Math.max(0,Math.min(1,((e.clientX-box.left)/box.width*w-64)/(w-82)));const time=Date.parse(dates[a])+ratio*(Date.parse(dates[b])-Date.parse(dates[a]));
      const date=dates.slice(a,b+1).reduce((best,d)=>Math.abs(Date.parse(d)-time)<Math.abs(Date.parse(best)-time)?d:best,dates[a]);
      tooltip.innerHTML=`<b>${esc(date)}</b>`+series.map(s=>{const value=(s.points||[]).find(p=>p.date===date)?.value;const color=!finite(value)||value===0?MUTED:value>0?RED:GREEN;return `<div><span style="color:${s.color}">●</span> ${esc(s.name||'业绩')} <b style="color:${color}">${finite(value)?pct(value):'—（该日无数据）'}</b></div>`;}).join('');
      tooltip.hidden=false;
      const size=tooltip.getBoundingClientRect();
      const left=e.clientX+16+size.width>innerWidth-8?e.clientX-size.width-16:e.clientX+16;
      const top=e.clientY+16+size.height>innerHeight-8?e.clientY-size.height-16:e.clientY+16;
      tooltip.style.left=Math.max(8,Math.min(left,innerWidth-size.width-8))+'px';
      tooltip.style.top=Math.max(8,Math.min(top,innerHeight-size.height-8))+'px';
      svg.querySelector('[data-gf-hover]')?.remove();
      const x=64+(Date.parse(date)-Date.parse(dates[a]))/(Date.parse(dates[b])-Date.parse(dates[a])||1)*(w-82);
      svg.insertAdjacentHTML('beforeend',`<g data-gf-hover="true" pointer-events="none"><line x1="${x}" x2="${x}" y1="18" y2="232" stroke="${MUTED}" stroke-dasharray="4 3"/></g>`);
    };svg._gfResize?.disconnect();if(typeof ResizeObserver!=='undefined'){svg._gfResize=new ResizeObserver(update);svg._gfResize.observe(svg);}update();
  }
  window.PrivateFundGffundsDetail={render,activate,sortPeriods};
})();
