/* Source-native money-market performance: never normalized into a NAV return. */
(() => {
  let selected='income_per_10000';
  window.PrivateFundIncome={render(product,range,redraw){
    const series=product.incomeSeries||[];
    if(!series.length)return false;
    const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const item=series.find(s=>s.code===selected)||series[0];selected=item.code;
    const history=window.PrivateFundExperience;
    const all=(item.points||[]).filter(p=>history.stamp(p.date)!==null&&Number.isFinite(p.value)).sort((a,b)=>a.date.localeCompare(b.date));
    const end=history.stamp(all.at(-1)?.date),months={'3m':3,'6m':6,'1y':12,'3y':36};
    const start=end===null||range==='since'?null:range==='ytd'?Date.UTC(new Date(end).getUTCFullYear()-1,11,31):months[range]?history.shiftMonths(end,-months[range]):null;
    const points=all.filter(p=>start===null||history.stamp(p.date)>=start);
    const svg=$('#lineChart'),empty=$('#chartEmpty'),tip=$('#chartTooltip'),peer=$('#curvePeer');
    peer.hidden=true;if(peer.previousElementSibling?.tagName==='LABEL')peer.previousElementSibling.hidden=true;
    svg.closest('section').querySelector('h2').textContent='货币型产品业绩走势';
    svg.setAttribute('aria-label',`${item.label}走势图，${item.unit}`);
    $('#chartLegend').innerHTML=`<label>业绩指标 <select id="incomeMetric" aria-label="货币型业绩指标">${series.map(s=>`<option value="${esc(s.code)}" ${s.code===selected?'selected':''}>${esc(s.label)}（${esc(s.unit)}）</option>`).join('')}</select></label><span>最新：${esc(all.at(-1)?.raw??'—')} ${esc(item.unit)}</span>`;
    $('#incomeMetric').onchange=e=>{selected=e.target.value;redraw()};
    $('#curveRange').textContent=points.length?`${points[0].date} 至 ${points.at(-1).date} · ${points.length}点`:'暂无所选区间数据';
    svg.dataset.targetPoints=points.length;svg.dataset.incomeMetric=item.code;svg.dataset.range=range;
    $('#chartBasis').textContent=`${item.label}来源原值，单位${item.unit}；仅连接真实披露日期。七日年化是年化指标，不是持有期累计收益。`;
    $('#chartBasis').nextElementSibling.textContent='滑动或触控查看日期及来源原值';
    tip.style.display='none';empty.style.display=points.length>=2?'none':'flex';
    if(points.length<2){empty.textContent='所选区间不足2个披露点';svg.innerHTML='';return true}
    const W=Math.max(300,Math.round(svg.clientWidth||920)),H=330,L=64,R=15,T=20,B=38;
    const first=Date.parse(points[0].date),last=Date.parse(points.at(-1).date),values=points.map(p=>p.value);
    const low=Math.min(...values),high=Math.max(...values),pad=Math.max((high-low)*.1,Math.abs(high)*.02,.001),min=low-pad,max=high+pad;
    const x=d=>L+(Date.parse(d)-first)/(last-first)*(W-L-R),y=v=>T+(max-v)/(max-min)*(H-T-B);
    let content='';
    for(let i=0;i<5;i++){const v=max-i*(max-min)/4,yy=y(v);content+=`<line x1="${L}" y1="${yy}" x2="${W-R}" y2="${yy}" stroke="#e4e7eb"/><text x="${L-7}" y="${yy+4}" text-anchor="end" font-size="11" fill="#667388">${v.toFixed(item.code==='income_per_10000'?4:2)}${item.unit==='%'?'%':''}</text>`}
    [points[0],points[Math.floor(points.length/2)],points.at(-1)].forEach((p,i)=>content+=`<text x="${x(p.date)}" y="${H-10}" text-anchor="${i===0?'start':i===2?'end':'middle'}" font-size="11" fill="#667388">${p.date}</text>`);
    content+=`<polyline data-series="income" points="${points.map(p=>`${x(p.date).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')}" fill="none" stroke="#294c73" stroke-width="2"/><circle id="incomeDot" r="4" fill="#fff" stroke="#294c73" visibility="hidden"/>`;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.innerHTML=content;
    const show=index=>{const p=points[index],dot=$('#incomeDot');dot.setAttribute('cx',x(p.date));dot.setAttribute('cy',y(p.value));dot.setAttribute('visibility','visible');tip.innerHTML=`<b>${esc(p.date)}</b>${esc(item.label)}：${esc(p.raw??p.value)} ${esc(item.unit)}`;tip.style.display='block';tip.style.left='72px';tip.style.top='12px'};
    const move=e=>{const rect=svg.getBoundingClientRect(),t=first+Math.max(0,Math.min(1,((e.clientX-rect.left)/rect.width*W-L)/(W-L-R)))*(last-first);let idx=0;for(let i=1;i<points.length;i++)if(Math.abs(Date.parse(points[i].date)-t)<Math.abs(Date.parse(points[idx].date)-t))idx=i;show(idx)};
    svg.onpointermove=move;svg.onpointerdown=move;svg.onpointerleave=()=>{tip.style.display='none';$('#incomeDot').setAttribute('visibility','hidden')};
    let index=points.length-1;svg.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();index=e.key==='Home'?0:e.key==='End'?points.length-1:Math.max(0,Math.min(points.length-1,index+(e.key==='ArrowLeft'?-1:1)));show(index)};
    return true;
  }};
})();
