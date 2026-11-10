'use strict';

async function loadAttributionView() {
  const status = document.getElementById('viewerStatus');
  if (!['http:', 'https:'].includes(location.protocol)) return;
  status.textContent = '正在加载策略归因…';
  try {
    async function loadJson(path) {
      const response = await fetch(path, {credentials: 'same-origin'});
      if (!response.ok) throw new Error('归因数据暂不可用。');
      return response.json();
    }
    const catalog = (await loadJson("data/catalog.6bef1dbd61aa59bf.json")).strategies;
    const requested = new URL(location.href).searchParams.get('strategy');
    const entry = requested === null ? catalog[0] : catalog.find(item => item.id === requested);
    if (!entry) throw new Error('该策略尚未接入归因页面。');
    const response = await fetch(entry.path, {credentials: 'same-origin'});
    if (!response.ok) throw new Error('归因数据暂不可用。');
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Static hosts may pass through the gzip bytes or transparently decode them.
    const json = bytes[0] === 31 && bytes[1] === 139
      ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')))
      : new Response(bytes);
    const payload = await json.json();
    if (payload.portfolios.length !== 1 || payload.portfolios[0].id !== entry.id) throw new Error('策略数据身份不一致。');
    if (payload.fundReplay && new URL(location.href).searchParams.get('view') !== 'assets') {
      renderFundReplay(payload, catalog, entry);
    } else if (payload.portfolios[0].mode === 'fund_replay') {
      renderFundReplay(payload, catalog, entry);
    } else {
      renderAttributionView(payload, catalog, entry);
    }
    status.hidden = true;
  } catch (error) {
    document.getElementById('viewerContent').hidden = true;
    status.textContent = error.message;
  }
}

function selectAttribution(entries, entry) {
  const selector = document.getElementById('portfolio');
  selector.replaceChildren(...entries.map(item => new Option(item.mode ? `${item.name} · 模型测算` : item.name, item.id)));
  selector.value = entry.id;
  selector.onchange = () => {
    const url = new URL(location.href);
    url.searchParams.set('strategy', selector.value);
    url.searchParams.delete('view');
    location.assign(url);
  };
}

function modelViews(payload, current) {
  if (!payload.fundReplay?.portfolio) return;
  const tabs = document.createElement('p');
  tabs.className = 'replay-tabs';
  for (const [key, label] of [['replay','逐日基金回放'],['assets','资产配置归因']]) {
    const link = document.createElement('a');
    const url = new URL(location.href);
    url.searchParams.set('view', key);
    link.href = url;
    link.textContent = label;
    if (key === current) link.setAttribute('aria-current','page');
    tabs.append(link);
  }
  document.getElementById('strategyLead').after(tabs);
}

function renderAttributionView(DATA, catalog, entry) {
  const payload = DATA;
  const modelView = ['shared_model','bank_model'].includes(DATA.portfolios[0].mode);
  function setupViewer(entries, content) {
    $('viewerContent').hidden = false;
    $('strategyName').textContent = `${entry.name} · 业绩归因`;
    $('strategyLead').textContent = `${entry.start} — ${entry.end} · ${modelView ? DATA.portfolios[0].badge : '已验收实采样例'}`;
    document.title = `${entry.name} · 天眼业绩归因`;
    $('strategyNotes').innerHTML = content.weightSection + content.sensitivitySection;
    if (modelView) {
      $('curveChart').setAttribute('aria-label', '共享模型净值、参考基准与累计超额');
      $('waterfall').setAttribute('aria-label', '参考基准加资产配置加基金相对影子等于模型收益');
      document.querySelector('#curves .section-heading + .note').textContent = '左轴为模型和参考基准归一化净值，右轴为累计超额。鼠标或方向键可查看每个观察日。';
      document.querySelector('#attribution > .note').textContent = '参考基准按固定权重重建。配置和基金相对影子贡献使用报告暴露、代理指数及上一交易日共享模型仓位。';
      document.querySelector('#allocationDetail + .note').textContent = '纯配置 = 资产影子 − 同组代理重建基准；基准口径差 = 同组代理重建基准 − 参考基准。';
      document.querySelector('#evidence .method p').innerHTML = '<b>P / Z</b>：共享模型仓位与基金净值回放；<b>B</b>：固定权重参考基准；<b>M</b>：报告暴露与资产代理形成的影子；<b>Q</b>：基准资产权重与同组代理。';
    }
    selectAttribution(entries, entry);
    modelViews(content, 'assets');
  }
  'use strict';

function pct(value, sign=true) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Number((value * 100).toFixed(2));
  return `${sign && rounded > 0 ? '+' : ''}${rounded.toFixed(2)}%`;
}

const val = value => `<span class="${cls(value)}">${pct(value)}</span>`;
const col = value => color(value);

function axisStep(span) {
  const approximate = span / 5;
  const unit = 10 ** Math.floor(Math.log10(approximate));
  return ([1, 2, 5, 10].find(value => value * unit >= approximate) || 10) * unit;
}

function frameworkMetrics() {
  const curve = summary.curves;
  let peak = curve[0], worstPeak = peak, trough = peak, worst = 0;
  for (const point of curve) {
    if (point.p > peak.p) peak = point;
    const drawdown = (1 + point.p) / (1 + peak.p) - 1;
    if (drawdown < worst) {
      worst = drawdown;
      worstPeak = peak;
      trough = point;
    }
  }
  const recovery = worst < 0 ? curve.find(point => point.date > trough.date && point.p >= worstPeak.p - 1e-14)?.date ?? null : null;
  function volatility(key) {
    if (rows.length < 2) return null;
    const average = rows.reduce((total, row) => total + row[key], 0) / rows.length;
    const squared = rows.reduce((total, row) => total + (row[key] - average) ** 2, 0);
    return Math.sqrt(squared / (rows.length - 1) * 250);
  }
  return {
    return: summary.portfolio, benchmark_return: summary.benchmark, excess: summary.excess,
    max_drawdown: {value: worst, peak: worstPeak.date, trough: trough.date, recovery},
    volatility: volatility('p'), benchmark_volatility: volatility('b')
  };
}

function renderFrameworkMetrics() {
  const metrics = frameworkMetrics(), drawdown = metrics.max_drawdown;
  const rows = [
    [modelView?'模型收益':'组合收益', pct(metrics.return), `期末净值 ${(1 + metrics.return).toFixed(4)}`, cls(metrics.return)],
    ['基准收益', pct(metrics.benchmark_return), modelView?'固定权重重建参考曲线':'官方基准曲线', cls(metrics.benchmark_return)],
    ['累计超额', pct(metrics.excess), modelView?'模型收益减参考基准':'组合收益减官方基准', cls(metrics.excess)],
    ['最大回撤', pct(drawdown.value), drawdown.value < 0 ? `${drawdown.peak.slice(5)} → ${drawdown.trough.slice(5)}` : '区间内无回撤', cls(drawdown.value)],
    ['年化波动率', pct(metrics.volatility, false), `基准 ${pct(metrics.benchmark_volatility, false)}`, ''],
    ['回撤修复', drawdown.value === 0 ? '无回撤' : drawdown.recovery ?? '尚未修复', '恢复至该次前高', '']
  ];
  $('kpis').innerHTML = rows.map(([label, value, note, tone]) => `<div><div class="kpi-label">${label}</div><div class="value ${tone}">${value}</div><p class="note">${note}</p></div>`).join('');
}

function calendarMonthsBefore(day, months) {
  const [year, month, date] = day.split('-').map(Number);
  const lastOfMonth = new Date(Date.UTC(year, month - months, 0));
  lastOfMonth.setUTCDate(Math.min(date, lastOfMonth.getUTCDate()));
  return lastOfMonth.toISOString().slice(0, 10);
}

function bindQuickRanges() {
  const buttons = [...$('quickRanges').querySelectorAll('[data-range]')];
  const notice = $('quickRangeNotice');
  function select(button) {
    buttons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    notice.textContent = '';
  }
  for (const button of buttons) {
    button.addEventListener('click', () => {
      const dates = [...$('start').options].map(option => option.value);
      const end = dates.at(-1);
      const target = button.dataset.range === 'ytd'
        ? `${end.slice(0, 4)}-01-01`
        : calendarMonthsBefore(end, Number(button.dataset.range));
      // The start is a NAV observation inside the requested calendar window.
      const start = dates.slice(0, -1).find(day => day >= target);
      if (!start) {
        select(null);
        notice.textContent = '该区间内不足两个净值日，已保留当前日期。';
        return;
      }
      select(button);
      $('start').value = start;
      $('end').value = end;
      if (target < dates[0]) notice.textContent = `历史从 ${dates[0]} 起，已采用全部可用净值。`;
      render();
    });
  }
  for (const id of ['portfolio', 'start', 'end', 'reset']) {
    $(id).addEventListener(id === 'reset' ? 'click' : 'change', () => select(null));
  }
}

// Same exact geometric identities as the Python engine; tested against every shipped full window.

const $=id=>document.getElementById(id), esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,n=2)=>x===null||!Number.isFinite(x)?'—':`${x>0?'+':''}${(x*100).toFixed(n)}`;
const cls=x=>x>1e-12?'positive':x< -1e-12?'negative':'neutral';
const color=x=>x>1e-12?'#B72F32':x< -1e-12?'#17744B':'#66717E';
const series=[['p','披露组合','#17324D'],['b','官方基准','#81909e'],['m','资产影子','#477c9e'],['z','基金回放','#a68558'],['q','重建基准','#8c8094']];
let current, summary, rows, rangeStart, rangeEnd, shown=new Set(['p','b','m','z']);
const geo=rs=>rs.reduce((a,r)=>a*(1+r),1)-1;
function contrib(parts,returns){let o={};parts.forEach((r,i)=>{new Set([...Object.keys(o),...Object.keys(r)]).forEach(k=>o[k]=(o[k]||0)*(1+returns[i])+(r[k]||0));});return o;}
function link(parts,left,right){let tail=Array(right.length+1).fill(1),o={},prefix=1;for(let i=right.length-1;i>=0;i--)tail[i]=tail[i+1]*(1+right[i]);parts.forEach((r,i)=>{Object.entries(r).forEach(([k,v])=>o[k]=(o[k]||0)+prefix*v*tail[i+1]);prefix*=1+left[i];});return o;}
function summarize(ds,start){let totals={};['p','b','m','q','z'].forEach(k=>totals[k]=geo(ds.map(r=>r[k])));let lv={p:1,b:1,m:1,q:1,z:1},curves=[{date:start,p:0,b:0,m:0,q:0,z:0}],peak=1,dd=0;ds.forEach(r=>{Object.keys(lv).forEach(k=>lv[k]*=1+r[k]);peak=Math.max(peak,lv.p);dd=Math.min(dd,lv.p/peak-1);curves.push({date:r.date,...Object.fromEntries(Object.entries(lv).map(([k,v])=>[k,v-1]))});});return {start,end:ds.at(-1).date,observations:ds.length,portfolio:totals.p,benchmark:totals.b,shadow:totals.m,rebuiltBenchmark:totals.q,replay:totals.z,excess:totals.p-totals.b,allocation:totals.m-totals.b,implementation:totals.p-totals.m,pureAllocation:totals.m-totals.q,benchmarkGap:totals.q-totals.b,residual:totals.p-totals.z,maxDrawdown:dd,curves,marketContributions:contrib(ds.map(r=>r.market),ds.map(r=>r.m)),allocationContributions:link(ds.map(r=>r.allocationParts),ds.map(r=>r.m),ds.map(r=>r.q)),fundContributions:contrib(ds.map(r=>r.fundPieces),ds.map(r=>r.z)),fundImplementation:link(ds.map(r=>r.fundImplementation),ds.map(r=>r.z),ds.map(r=>r.m)),replayRmseBp:Math.sqrt(ds.reduce((s,r)=>s+(r.p-r.z)**2,0)/ds.length)*10000};}
function options(){const dates=[current.daily[0].previousDate,...current.daily.map(r=>r.date)];['start','end'].forEach(id=>$(id).innerHTML=dates.map(d=>`<option value="${d}">${d}</option>`).join(''));$('start').value=dates[0];$('end').value=dates.at(-1);}
function selectPortfolio(){current=DATA.portfolios.find(p=>p.id===$('portfolio').value);options();$('fundSearch').value='';render();}
function render(){rangeStart=$('start').value;rangeEnd=$('end').value;if(rangeStart>=rangeEnd){$('rangeError').textContent='结束日须晚于起始日；下方保留上次有效区间。';return;}$('rangeError').textContent='';rows=current.daily.filter(r=>r.date>rangeStart&&r.date<=rangeEnd);summary=summarize(rows,rangeStart);$('badge').textContent=current.badge;$('period').textContent=`${rangeStart} — ${rangeEnd} · ${rows.length} 个收益区间 · ${current.funds.length} 只基金`;
 const s=summary;$('conclusion').innerHTML=`${modelView?'模型收益':'组合收益'} <b class="${cls(s.portfolio)}">${fmt(s.portfolio)}%</b>，相对${modelView?'参考基准':'官方基准'} <b class="${cls(s.excess)}">${fmt(s.excess)} 个百分点</b>。配置贡献 ${fmt(s.allocation)}，基金实施 ${fmt(s.implementation)} 个百分点。`;
 $('boundary').textContent=modelView?current.badge+'。客户实际净值、申赎、成交及投顾费用未进入计算。':current.mode==='collected'?`天眼实采数据：报告原件已核验。快照间仓位按净值漂移估算，披露与基金回放残差 ${fmt(s.residual,4)} 个百分点；本结果尚不具备生产归因准入。`:'冻结样例：用于复现原方案数值。其报告与指数来自方案包，不能代表天眼已采集覆盖或正式业务验收。';
 renderFrameworkMetrics();
 $('legend').innerHTML='<span><i style="background:#A93443"></i>'+(modelView?'模型净值':'组合净值')+'</span><span><i style="background:#949EAC"></i>'+(modelView?'参考基准净值':'官方基准净值')+'</span><span><i style="background:#F3DDE0"></i>正超额</span><span><i style="background:#DCEEE7"></i>负超额</span>';
 drawCurve();drawWaterfall();
 $('curveNote').textContent=modelView?`模型净值由基金回放形成；资产影子使用 ${current.indexDescription}。`:`基金回放逐日收益与披露收益的均方根差：${s.replayRmseBp.toFixed(3)} bp。影子使用 ${current.indexDescription}。`;
 $('reconcile').innerHTML=`<span>三项合计：<b class="${cls(s.portfolio)}">${fmt(s.benchmark+s.allocation+s.implementation)}%</b></span><span>基金相对影子：${fmt(s.replay-s.shadow)} 个百分点</span>${modelView?'':'<span>披露 / 回放残差：'+fmt(s.residual,4)+' 个百分点</span>'}`;
 let max=Math.max(...Object.values(s.marketContributions).map(Math.abs),.000001);$('assetBars').innerHTML=DATA.classes.map(k=>{let v=s.marketContributions[k]||0,w=rows.reduce((t,r)=>t+r.assetWeights[k],0)/rows.length;return `<div class="asset-row"><span>${esc(DATA.classNames[k])}<br><small>平均权重 ${(w*100).toFixed(2)}%</small></span><div class="axis"><i style="background:${color(v)};width:${Math.abs(v)/max*48}%;${v>=0?'left:50%':'right:50%'}"></i></div><b class="${cls(v)}">${fmt(v)}</b></div>`;}).join('');
 $('allocationDetail').innerHTML=[['纯资产配置',s.pureAllocation],['基准口径差',s.benchmarkGap],['资产配置合计',s.allocation]].map(([n,v])=>`<div class="detail-row"><span>${n}</span><b class="${cls(v)}">${fmt(v)} 个百分点</b></div>`).join('');renderFunds();
 $('quality').innerHTML=[['报告可得性',current.quality.reports],['历史仓位',current.quality.weights],['基金收益',current.quality.nav],['基准匹配',current.quality.baseline]].map(([a,b])=>`<div><strong>${a}</strong>${esc(b)}</div>`).join('');$('limitations').innerHTML=current.limitations.map(x=>`<li>${esc(x)}</li>`).join('');$('weightMethod').textContent=`权重方法：${current.weightMethod}。仓位锚点：${current.anchorDate}；所选期初权重合计 ${(Object.values(rows[0].weights).reduce((a,b)=>a+b,0)*100).toFixed(4)}%。基金按准确份额代码分开。`;
 $('sourceInfo').innerHTML=`对象：${esc(current.id)} / ${modelView?'广发银行模型':current.mode==='collected'?'广发基金直销渠道':'原方案冻结样本'}<br>基准：${esc(current.benchmarkText)}<br>来源：天眼主库冻结数据<br>生成时间：${esc(DATA.generatedAt)}。保存的是本次读库冻结快照，后续日更不会自动改变该页。`;
 let evidence=[...new Map(rows.flatMap(d=>Object.entries(d.reports).map(([c,r])=>[c+r.reportDate+r.disclosureDate,{code:c,...r}]))).values()];$('reportRows').innerHTML=evidence.map(r=>`<tr><td>${esc(r.code)}</td><td>${esc(r.reportDate)}<br>${esc(r.disclosureDate)}</td><td>${esc(r.method)}<br>净资产：${r.denominator?Number(r.denominator).toLocaleString('zh-CN',{maximumFractionDigits:2})+' 元':'见原输入'}</td><td>${r.pdfSha256?'原件 SHA-256 已核验':r.reportDate===null&&modelView?'货币基金现金代理':'待核验'}</td></tr>`).join('');$('footerText').textContent=`数据冻结：${DATA.generatedAt.slice(0,19).replace('T',' ')}。计算版本 ${DATA.version}。\n正收益 / 正贡献为红，负收益 / 负贡献 / 回撤为绿；权重、残差和来源状态不作能力评价。`;
 window.__attributionState={portfolio:current.id,summary,metrics:frameworkMetrics(),rows};
}
function drawCurve(){
 const p={name:current.name,nav:summary.curves.map(r=>({date:r.date,nav:1+r.p,benchmark_nav:1+r.b}))},nav=p.nav,w=Math.max(330,$('curveChart').clientWidth),mobile=w<580,h=mobile?300:345;
 const pad={l:mobile?48:59,r:mobile?53:64,t:29,b:36},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;
 const pn=nav.map(r=>r.nav/nav[0].nav),bn=nav.map(r=>r.benchmark_nav/nav[0].benchmark_nav),ex=pn.map((v,i)=>v-bn[i]);
 const mn=Math.min(...pn,...bn),mx=Math.max(...pn,...bn),span=Math.max(mx-mn,.0001),lo=mn-span*.1,hi=mx+span*.12;
 const es=Math.max(Math.max(...ex)-Math.min(...ex),.0005),el=Math.min(0,...ex)-.1*es,eh=Math.max(0,...ex)+.62*es;
 const x=i=>pad.l+i/(nav.length-1)*pw,y=v=>pad.t+(hi-v)/(hi-lo)*ph,ey=v=>pad.t+(eh-v)/(eh-el)*ph;
 const txt=(xx,yy,text,anchor='middle',fill='#748091',size=mobile?10:11)=>`<text x="${xx}" y="${yy}" fill="${fill}" text-anchor="${anchor}" font-size="${size}">${esc(text)}</text>`;
 let svg=`<svg id="mainSvg" viewBox="0 0 ${w} ${h}" role="img" tabindex="0" aria-label="${esc(p.name)}归一化净值与累计超额；可用左右方向键查看日期"><rect width="${w}" height="${h}" fill="white"/>`;
 svg+=txt(pad.l,13,'净值（期初 = 1）','start')+txt(w-pad.r,13,'累计超额（%）','end');
 // Insert linear zero crossings before clipping the two signed area polygons.
 const points=[{x:x(0),v:ex[0]}];
 for(let i=1;i<nav.length;i++){if(ex[i-1]*ex[i]<0){const t=-ex[i-1]/(ex[i]-ex[i-1]);points.push({x:x(i-1)+t*(x(i)-x(i-1)),v:0});}points.push({x:x(i),v:ex[i]});}
 for(const [sign,fill] of [[1,'#F3DDE0'],[-1,'#DCEEE7']]){const ps=points.map(q=>`${q.x},${ey(sign>0?Math.max(q.v,0):Math.min(q.v,0))}`).join(' L');svg+=`<path data-area="${sign>0?'positive':'negative'}" d="M${x(0)},${ey(0)} L${ps} L${x(nav.length-1)},${ey(0)} Z" fill="${fill}" stroke="none"/>`;}
 const navStep=axisStep(hi-lo);
 for(let v=Math.ceil(lo/navStep)*navStep;v<=hi+1e-10;v+=navStep){const yy=y(v);svg+=`<line x1="${pad.l}" y1="${yy}" x2="${w-pad.r}" y2="${yy}" stroke="#ECEFF3"/>`+txt(pad.l-8,yy+4,v.toFixed(3),'end');}
 const exStep=axisStep(eh-el),exMin=Math.ceil(el/exStep)*exStep,exMax=eh;
 for(let v=exMin;v<=exMax+1e-10;v+=exStep)if(v>=el&&v<=eh)svg+=txt(w-pad.r+8,ey(v)+4,pct(v,false),'start');
 svg+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${ey(0)}" y2="${ey(0)}" stroke="#BAC3CF" stroke-dasharray="3 4"/>`;
 const ticks=[...new Set(Array.from({length:6},(_,i)=>Math.round(i*(nav.length-1)/5)))];
 for(const i of ticks)svg+=txt(x(i),h-10,nav[i].date.slice(5));
 for(const [values,c,width] of [[bn,'#949EAC',1.9],[pn,'#A93443',2.4]])svg+=`<path d="${values.map((v,i)=>(i?'L':'M')+x(i)+','+y(v)).join(' ')}" fill="none" stroke="${c}" stroke-width="${width}" stroke-linejoin="round"/>`;
 svg+=`<line id="chartCursor" x1="${x(nav.length-1)}" x2="${x(nav.length-1)}" y1="${pad.t}" y2="${h-pad.b}" stroke="#9caab7" stroke-dasharray="2 4" opacity=".6"/><circle id="chartDot" cx="${x(nav.length-1)}" cy="${y(pn.at(-1))}" r="3" fill="#A93443"/></svg>`;
 $('curveChart').innerHTML=svg;
 let selected=nav.length-1;
 const read=i=>{selected=Math.max(0,Math.min(nav.length-1,i));$('chartReadout').innerHTML=`${nav[selected].date}　组合 ${pn[selected].toFixed(4)}　基准 ${bn[selected].toFixed(4)}　累计超额 ${val(ex[selected])}`;const c=$('chartCursor');c.setAttribute('x1',x(selected));c.setAttribute('x2',x(selected));$('chartDot').setAttribute('cx',x(selected));$('chartDot').setAttribute('cy',y(pn[selected]));};
 $('mainSvg').onpointermove=e=>{const r=e.currentTarget.getBoundingClientRect();read(Math.round(((e.clientX-r.left)*w/r.width-pad.l)/pw*(nav.length-1)));};
 $('mainSvg').onpointerleave=()=>read(nav.length-1);
 $('mainSvg').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();read(selected+(e.key==='ArrowRight'?1:-1));}};
 read(selected);
}

function drawWaterfall(){
 const a={benchmark_return:summary.benchmark,allocation:summary.allocation,implementation:summary.implementation,portfolio_return:summary.portfolio},w=Math.max(330,$('waterfall').clientWidth),mobile=w<580,h=mobile?290:330,pad={l:mobile?44:60,r:18,t:30,b:57};
 const parts=[a.benchmark_return,a.allocation,a.implementation],ends=[];let running=0;parts.forEach(v=>{ends.push([running,running+v]);running+=v;});ends.push([0,a.portfolio_return]);
 const min=Math.min(0,...ends.flat()),max=Math.max(0,...ends.flat()),span=Math.max(max-min,.0001),lo=min<0?min-span*.13:0,hi=max+span*.27;
 const y=v=>pad.t+(hi-v)/(hi-lo)*(h-pad.t-pad.b),step=(w-pad.l-pad.r)/4,x=i=>pad.l+step*(i+.5),bw=step*.52;
 let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="战略配置 ${pct(parts[0])}，资产配置 ${pct(parts[1])}，${modelView?'基金相对影子贡献':'基金优选与产品实现'} ${pct(parts[2])}，总收益 ${pct(a.portfolio_return)}"><rect width="${w}" height="${h}" fill="white"/>`;
 const tickStep=axisStep(hi-lo);
 for(let v=Math.ceil(lo/tickStep)*tickStep;v<=hi+1e-10;v+=tickStep)svg+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${y(v)}" y2="${y(v)}" stroke="#ECEFF3"/><text x="${pad.l-7}" y="${y(v)+4}" text-anchor="end" font-size="${mobile?9:11}" fill="#748091">${pct(v,false)}</text>`;
 const labels=[[modelView?'参考基准':'战略配置',modelView?'':'（业绩基准）'],['资产配置','（配置偏离）'],[modelView?'基金相对':'基金优选',modelView?'影子贡献':'与产品实现'],[modelView?'模型总收益':'组合总收益','']];
 ends.forEach(([from,to],i)=>{const delta=to-from,c=delta<0?'#258269':['#D79198','#CC707A','#BF4E5D','#A93443'][i],top=y(Math.max(from,to)),height=Math.abs(y(from)-y(to));svg+=`<rect data-waterfall-bar="${i}" data-start="${from}" data-end="${to}" x="${x(i)-bw/2}" y="${top}" width="${bw}" height="${height}" fill="${c}"/>`;
 if(i<3)svg+=`<line x1="${x(i)+bw/2}" x2="${x(i+1)-bw/2}" y1="${y(to)}" y2="${y(to)}" stroke="#AEBFD1" stroke-dasharray="4 3"/>`;
 svg+=`<text x="${x(i)}" y="${top-11}" text-anchor="middle" font-size="${mobile?13:17}" font-weight="700" fill="${col(delta)}">${pct(delta)}</text>`;
 labels[i].forEach((t,j)=>svg+=`<text x="${x(i)}" y="${h-29+j*17}" text-anchor="middle" font-size="${mobile?10:13}" fill="#536576">${t}</text>`);
 });$('waterfall').innerHTML=svg+'</svg>';
}

function fundRows(){return current.funds.map(f=>{let c=f.code;return {...f,weight:rows[0].weights[c]||0,ret:geo(rows.map(r=>r.fundReturns[c]||0)),contribution:summary.fundContributions[c]||0,implementation:summary.fundImplementation[c]||0,report:rows.at(-1).reports[c]};});}
function renderFunds(){let fs=fundRows(),q=$('fundSearch').value.toLowerCase(),sort=$('fundSort').value;fs=fs.filter(f=>(f.code+f.name).toLowerCase().includes(q)).sort((a,b)=>b[sort]-a[sort]);$('fundTable').querySelector('tbody').innerHTML=fs.length?fs.map(f=>`<tr><td>${esc(f.name)}<small>${esc(f.code)}</small></td><td class="num">${(f.weight*100).toFixed(2)}%</td><td class="num ${cls(f.ret)}">${fmt(f.ret)}%</td><td class="num ${cls(f.contribution)}">${fmt(f.contribution)}</td><td class="num ${cls(f.implementation)}">${fmt(f.implementation)}</td><td>${esc(f.report?.reportDate)}<br>公告 ${esc(f.report?.disclosureDate)}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">没有符合条件的基金</td></tr>';$('fundNote').textContent=`显示 ${fs.length} / ${current.funds.length} 只基金。回放贡献合计 ${fmt(summary.replay)}%，相对影子贡献合计 ${fmt(summary.replay-summary.shadow)} 个百分点；搜索仅筛选表格。`;$('residualNote').textContent=modelView?'模型收益等于基金回放收益。缺少各期披露净值，实际收益残差不可计算。':`披露收益 ${fmt(summary.portfolio)}% = 基金回放 ${fmt(summary.replay)}% + 残差 ${fmt(summary.residual)} 个百分点。残差单列，不分摊给基金。基金相对影子贡献与残差共同构成“基金实施”。`;}
setupViewer(catalog, payload);
$('start').onchange=render;
$('end').onchange=render;
$('reset').onclick=()=>{options();render();};
$('fundSearch').oninput=renderFunds;
$('fundSort').onchange=renderFunds;
window.attributionMath={summarize};
selectPortfolio();
window.addEventListener('resize',()=>{if(summary){drawCurve();drawWaterfall();}});

bindQuickRanges();

}

function renderFundReplay(payload, catalog, entry) {
  const $ = id => document.getElementById(id);
  const {portfolio = payload.portfolios[0], receipt} = payload.fundReplay;
  const days = [receipt.replayStart, ...portfolio.daily.map(row => row.date)];
  const names = new Map(portfolio.funds.map(fund => [fund.code, fund.name]));
  const tone = n => n == null || Math.abs(n)<0.00005 ? 'neutral' : n > 0 ? 'positive' : 'negative';
  const pct = (n, signed=true) => n == null ? '—' : tone(n)==='neutral' ? '0.00%' : `${signed && n > 0 ? '+' : ''}${(n*100).toFixed(2)}%`;
  let inspectedDate;
  const narrowChart=matchMedia('(max-width: 600px)');
  const vol = values => {
    if (values.length < 2) return null;
    const mean = values.reduce((sum,v) => sum+v,0)/values.length;
    return Math.sqrt(values.reduce((sum,v) => sum+(v-mean)**2,0)*250/(values.length-1));
  };
  function make(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }
  function drawChart(points, shownDays, rows) {
    const width=narrowChart.matches?430:720;
    const left=narrowChart.matches?54:66;
    const right=width-20;
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox',`0 0 ${width} 310`);
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label','模型净值与参考基准净值，可滑动查看每日数据');
    svg.style.width='100%';
    const levels = points.flat();
    const lower = Math.min(...levels)-0.001, upper = Math.max(...levels)+0.001;
    function draw(tag, attributes, label) {
      const node = document.createElementNS(svg.namespaceURI,tag);
      Object.entries(attributes).forEach(([key,value]) => node.setAttribute(key,value));
      if (label) node.textContent=label;
      svg.append(node);
      return node;
    }
    for(let step=0;step<5;step++) {
      const y = 22+step*62;
      draw('line',{x1:left,x2:right,y1:y,y2:y,stroke:'#E4E9EE'});
      draw('text',{x:4,y:y+5,fill:'#526178','font-size':15},(upper-(upper-lower)*step/4).toFixed(3));
    }
    const x = index => left+(right-left)*index/(points.length-1);
    const y = value => 22+248*(upper-value)/(upper-lower);
    for (const [series, color] of [[0,'#17324D'],[1,'#758CA0']]) {
      const values=points.map((row,i) => `${x(i)},${y(row[series])}`);
      draw('polyline',{points:values.join(' '),fill:'none',stroke:color,'stroke-width':2.8});
    }
    draw('text',{x:left,y:297,fill:'#526178','font-size':15},$('start').value);
    draw('text',{x:right,y:297,fill:'#526178','font-size':15,'text-anchor':'end'},$('end').value);
    const line=draw('line',{y1:22,y2:270,stroke:'#8495A7','stroke-dasharray':'4 4'});
    const dots=['#17324D','#758CA0'].map(fill=>draw('circle',{r:5,fill,stroke:'#fff','stroke-width':2}));
    const slider=make('input','');
    slider.type='range';
    slider.min='0'; slider.max=String(points.length-1); slider.step='1';
    slider.id='replayDaySlider';
    slider.setAttribute('aria-label','查看回放日期');
    const controls=make('div','');
    controls.className='replay-scrubber';
    controls.append(make('span','逐日查看'),slider);
    const readout=$('chartReadout');
    readout.className='replay-readout';
    readout.setAttribute('aria-live','off');
    const caption=make('strong','');
    caption.id='replayInspectionDate';
    const grid=make('dl','');
    const names=['模型净值','基准净值','模型当日收益','基准当日收益','模型累计收益','基准累计收益','累计超额'];
    const fields=names.map(name=>{
      const item=make('div','');
      const value=make('dd','');
      item.append(make('dt',name),value); grid.append(item);
      return value;
    });
    readout.replaceChildren(caption,grid);
    const update = index => {
      const day=shownDays[index], [model,base]=points[index];
      const daily=rows[index-1];
      inspectedDate=day;
      slider.value=String(index);
      slider.setAttribute('aria-valuetext',`${day}，模型累计收益 ${pct(model-1)}，累计超额 ${pct(model-base)}`);
      caption.textContent=day;
      const values=[model,base,daily?.p,daily?.b,model-1,base-1,model-base];
      fields.forEach((field,i)=>{
        field.textContent=i<2?values[i].toFixed(4):pct(values[i]);
        field.className=i<2?'neutral':tone(values[i]);
      });
      line.setAttribute('x1',x(index)); line.setAttribute('x2',x(index));
      dots.forEach((dot,i)=>{dot.setAttribute('cx',x(index));dot.setAttribute('cy',y(points[index][i]));});
    };
    function inspect(event) {
      const matrix=svg.getScreenCTM();
      if (!matrix) return;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
      update(Math.max(0,Math.min(points.length-1,Math.round((point.x-left)/(right-left)*(points.length-1)))));
    }
    svg.addEventListener('pointerdown',event=>{if(event.isPrimary)inspect(event);});
    svg.addEventListener('pointermove',event=>{if(event.isPrimary && (event.pointerType==='mouse'||event.buttons>0))inspect(event);});
    slider.addEventListener('input',()=>update(Number(slider.value)));
    $('curveChart').classList.add('replay-curve');
    $('curveChart').removeAttribute('role');
    $('curveChart').replaceChildren(svg,controls);
    const retained=shownDays.indexOf(inspectedDate);
    update(retained<0?points.length-1:retained);
  }
  function render() {
    let first=days.indexOf($('start').value), last=days.indexOf($('end').value);
    if (first>=last) {
      first=Math.max(0,last-1);
      last=Math.max(1,last);
      $('start').value=days[first];
      $('end').value=days[last];
    }
    const rows=portfolio.daily.slice(first,last);
    let nav=1, bench=1, peak=1, drawdown=0;
    const points=[[1,1]], contribution=new Map();
    for (const row of rows) {
      nav*=1+row.p;
      bench*=1+row.b;
      peak=Math.max(peak,nav);
      drawdown=Math.min(drawdown,nav/peak-1);
      points.push([nav,bench]);
      for (const code of new Set([...contribution.keys(),...Object.keys(row.fundPieces)])) {
        contribution.set(code,(contribution.get(code) || 0)*(1+row.p)+(row.fundPieces[code] || 0));
      }
    }
    const metrics = [['模型收益',nav-1],['参考基准收益',bench-1],['累计超额',nav-bench],
      ['最大回撤',drawdown],['模型年化波动',vol(rows.map(r=>r.p))],['基准年化波动',vol(rows.map(r=>r.b))]];
    $('kpis').replaceChildren(...metrics.map(([label,value],i) => {
      const card=make('div','');
      card.className='kpi';
      const metric=make('strong',pct(value,i<4));
      metric.className=i>=4 ? 'neutral' : tone(value);
      card.dataset.tone=metric.className;
      card.append(make('span',label),metric);
      return card;
    }));
    drawChart(points,days.slice(first,last+1),rows);
    const search=$('fundSearch').value.trim().toLowerCase();
    const basis=$('fundSort').value;
    const startWeights=rows[0].weights;
    const sorted=[...contribution].filter(([code]) => `${names.get(code)} ${code}`.toLowerCase().includes(search))
      .sort((a,b) => basis==='weight' ? (startWeights[b[0]] || 0)-(startWeights[a[0]] || 0) : b[1]-a[1]);
    $('fundTable').tBodies[0].replaceChildren(...sorted.map(([code,value]) => {
      const tr=make('tr','');
      tr.append(make('td',`${names.get(code)} ${code}`),make('td',`${((startWeights[code] || 0)*100).toFixed(2)}%`),
        make('td',`${value>=0?'+':''}${(value*100).toFixed(4)}`));
      tr.lastChild.className='num '+tone(value);
      return tr;
    }));
    $('fundNote').textContent=`共 ${rows.length} 个收益区间。基金贡献逐日复利联结，合计等于模型收益。`;
  }
  $('viewerContent').hidden=false;
  $('strategyName').textContent=`${entry.name} · 业绩归因`;
  $('strategyLead').textContent=`${receipt.replayStart} — ${receipt.replayEnd} · ${portfolio.badge} · 仓位更新至 ${receipt.holdingDate}`;
  document.title=`${entry.name} · 天眼业绩归因`;
  selectAttribution(catalog,entry);
  modelViews(payload,'replay');
  for (const id of ['attribution','strategyNotes','evidence','interpretation','readiness']) if ($(id)) $(id).hidden=true;
  document.querySelectorAll('a[href="#attribution"],a[href="#weightCoverage"],a[href="#sensitivity"],a[href="#evidence"]').forEach(link => link.hidden=true);
  document.querySelector('#curves h2').textContent='模型净值与参考基准';
  document.querySelector('#curves .section-heading + .note').textContent=portfolio.benchmarkText+'。净值从 1 开始。悬停、触屏滑动或用滑块方向键可查看逐日指标。年化波动按 250 个交易日计算。';
  $('legend').textContent='深蓝线　模型净值　　蓝灰线　参考基准';
  $('chartReadout').hidden=false;
  $('curveChart').setAttribute('aria-label','模型净值与参考基准');
  $('curveNote').textContent=portfolio.weightMethod+(receipt.fullInterval ? ` 资产配置归因覆盖 ${receipt.fullInterval.join(' 至 ')}。` : ' 当时可得的基金报告或资产映射未满足完整资产归因条件。');
  $('residualNote').textContent='模型收益包含所持基金的净值变动。客户实际交易、申赎及投顾费用未进入计算。';
  $('fundSort').replaceChildren(new Option('按回放贡献','contribution'),new Option('按期初权重','weight'));
  const head=$('fundTable').tHead.rows[0];
  head.replaceChildren(...['基金 / 准确份额','期初权重','回放贡献（百分点）'].map(name=>make('th',name)));
  const fill=() => {
    for (const key of ['start','end']) $(key).replaceChildren(...days.map(d=>new Option(d,d)));
    $('start').value=days[0]; $('end').value=days.at(-1);
  };
  fill(); render();
  narrowChart.addEventListener('change',render);
  for (const id of ['start','end','fundSort']) $(id).onchange=render;
  $('fundSearch').oninput=render;
  $('reset').onclick=()=>{fill();render();};
  $('quickRanges').querySelectorAll('button').forEach(button=>{
    button.onclick=()=>{
      const end=days.at(-1);
      const date=new Date(end+'T00:00:00Z');
      if(button.dataset.range==='ytd') date.setUTCMonth(0,1);
      else {
        const day=date.getUTCDate();
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth()-Number(button.dataset.range));
        const month=date.getUTCMonth();
        date.setUTCDate(day);
        if(date.getUTCMonth()!==month) date.setUTCDate(0);
      }
      const requested=date.toISOString().slice(0,10);
      $('start').value=days.find(d=>d>=requested && d<end) || days[0];
      $('end').value=end;
      $('quickRangeNotice').textContent=requested<days[0]?'已用最早可用净值日':'';
      $('quickRanges').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      render();
    };
  });
}

loadAttributionView();
