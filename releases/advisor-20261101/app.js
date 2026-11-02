'use strict';
(() => {
const data=window.ADVISOR_VERIFIED_RELEASE, $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>v===null||v===undefined||!Number.isFinite(v)?'—':(v>0?'+':'')+v.toFixed(2)+'%';
const cls=v=>v===null||v===undefined||!Number.isFinite(v)||v===0?'neutral':v>0?'positive':'negative';
const strategies=data?.strategies??[], byId=new Map(strategies.map(s=>[s.id,s]));
const index=s=>new Map(s.points.map(p=>[p[0],p]));
const indices=new Map(strategies.map(s=>[s.id,index(s)]));
const interval=(s,from,to)=>{const m=indices.get(s.id),a=m.get(from),b=m.get(to);return !a||!b||from>=to||a[1]<=0?null:(b[1]/a[1]-1)*100;};
function chart(target,series,from,to){
 const valid=series.map(s=>({s,points:s.points.filter(p=>p[0]>=from&&p[0]<=to)})).filter(v=>v.points.length>1);
 if(!valid.length){target.textContent='所选窗口缺少可展示的来源观察。';return;}
 const common=valid[0].points.map(p=>p[0]).filter(d=>valid.every(v=>indices.get(v.s.id).has(d)));
 if(common.length<2){target.textContent='共同观察日期不足。';return;}
 const values=valid.map(v=>{const m=indices.get(v.s.id),base=m.get(common[0])[1];return common.map(d=>m.get(d)[1]/base*100);});
 const W=920,H=340,L=60,R=22,T=20,B=50,all=values.flat(),lo0=Math.min(...all),hi0=Math.max(...all),pad=Math.max((hi0-lo0)*.12,.2),lo=lo0-pad,hi=hi0+pad;
 const x=i=>L+i/(common.length-1)*(W-L-R),y=v=>T+(hi-v)/(hi-lo)*(H-T-B),colors=['#17324D','#758CA0'];
 let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(common[0])}至${esc(common.at(-1))}的收益曲线，首日重置100">`;
 for(let k=0;k<5;k++){const v=lo+(hi-lo)*k/4;svg+=`<line x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}" stroke="#DCE2E7"/><text x="${L-10}" y="${y(v)+4}" text-anchor="end" fill="#66717E" font-size="12">${v.toFixed(1)}</text>`;}
 values.forEach((v,k)=>{svg+=`<polyline fill="none" stroke="${colors[k]}" stroke-width="2.5" points="${v.map((n,i)=>x(i).toFixed(2)+','+y(n).toFixed(2)).join(' ')}"/>`;});
 svg+=`<text x="${L}" y="${H-18}" fill="#66717E" font-size="12">${esc(common[0])}</text><text x="${W-R}" y="${H-18}" text-anchor="end" fill="#66717E" font-size="12">${esc(common.at(-1))}</text></svg>`;
 target.innerHTML=svg+valid.map((v,k)=>`<span class="note" style="margin-right:20px;color:${colors[k]}">● ${esc(v.s.name)}</span>`).join('');
}
function showDetail(id){const s=byId.get(id);$('detail').hidden=false;$('detailName').textContent=s.name+' · '+s.code;const first=s.points[0],last=s.points.at(-1);$('detailNote').textContent=`来源观察：${first[0]} 至 ${last[0]} · ${s.points.length.toLocaleString()} 个点 · ${s.status}`;const from=s.points.find(p=>p[0]>=data.window.from)?.[0]??first[0];chart($('detailChart'),[s],from,last[0]);$('detailStats').innerHTML=`<p>源披露累计收益（截至 ${esc(last[0])}） <strong class="${cls(last[2])}">${pct(last[2])}</strong></p><p>统一窗口收益 <strong class="${cls(interval(s,data.window.from,data.window.to))}">${pct(interval(s,data.window.from,data.window.to))}</strong></p>`;}
function renderList(){let rows=strategies.filter(s=>(s.name+' '+s.code).toLowerCase().includes($('search').value.toLowerCase()));const sort=$('sort').value;rows.sort((a,b)=>sort==='return'?((interval(b,data.window.from,data.window.to)??-Infinity)-(interval(a,data.window.from,data.window.to)??-Infinity)):sort==='date'?b.latestDate.localeCompare(a.latestDate):a.name.localeCompare(b.name,'zh-CN'));$('listNote').textContent=`本版完整范围 ${strategies.length} 个策略；当前筛选 ${rows.length} 个。统一窗口 ${data.window.from} 至 ${data.window.to}。`;$('strategies').innerHTML=rows.map(s=>{const value=interval(s,data.window.from,data.window.to);return `<tr><td>${esc(s.name)}<small>${esc(s.code)}</small></td><td>${esc(s.latestDate)}</td><td class="${cls(value)}">${pct(value)}</td><td>${esc(s.status)}</td><td><button class="detail-button" data-id="${esc(s.id)}">查看</button></td></tr>`;}).join('');document.querySelectorAll('.detail-button').forEach(b=>b.onclick=()=>showDetail(b.dataset.id));}
function compare(){const a=byId.get($('compareA').value),b=byId.get($('compareB').value),from=$('from').value,to=$('to').value;const va=interval(a,from,to),vb=interval(b,from,to);$('compareNote').textContent=`统计窗口 ${from} 至 ${to}。`;if(va===null||vb===null){$('compareChart').textContent='缺少准确起止日来源观察，当前窗口不可比较。';$('compareStats').innerHTML='';return;}chart($('compareChart'),[a,b],from,to);$('compareStats').innerHTML=[a,b].map((s,i)=>`<p>${esc(s.name)} <strong class="${cls(i?vb:va)}">${pct(i?vb:va)}</strong></p>`).join('');}
try{
 if(!data||data.contract!=='advisor_verified_page_v1'||!strategies.length)throw Error('数据包未通过本版结构检查');
 $('buildDate').textContent=`数据版 ${data.asof} · 发布批次 ${data.buildId}`;$('versionLabel').textContent=data.buildId;
 $('strategyCount').textContent=strategies.length;$('freshCount').textContent=strategies.filter(s=>s.latestDate===data.asof).length;$('eventCount').textContent=data.events.length;$('deltaCount').textContent=data.events.reduce((n,e)=>n+e.funds.length,0);
 const ranked=strategies.map(s=>({s,value:interval(s,data.window.from,data.window.to)})).filter(x=>x.value!==null).sort((a,b)=>b.value-a.value);$('rankingNote').textContent=`区间：${data.window.from} 至 ${data.window.to} · 可比策略 ${ranked.length} / ${strategies.length} · 单位 % · 中线为0`;
 const top=ranked.slice(0,10),max=Math.max(...top.map(x=>Math.abs(x.value)),.01);$('rankChart').innerHTML=top.map((x,i)=>`<div class="rank-row"><span>${i+1}. ${esc(x.s.name)}</span><div class="rank-track"><div class="rank-fill" style="width:${Math.abs(x.value)/max*50}%;left:${x.value>=0?50:50-Math.abs(x.value)/max*50}%;background:${x.value>=0?'#B72F32':'#17744B'}"></div></div><strong class="rank-value ${cls(x.value)}">${pct(x.value)}</strong></div>`).join('');
 $('eventCards').innerHTML=data.events.map(e=>`<article class="event"><h3>${esc(e.name)} · ${esc(e.date)}</h3><p class="note">代码 ${esc(e.code)} · 上次调仓 ${esc(e.previousDate??'—')} · ${esc(e.reason??'未披露原因')}</p><p class="note">调前合计 ${e.beforeTotal.toFixed(2)}% · 调后合计 ${e.afterTotal.toFixed(2)}% · ${e.funds.length} 条完整基金明细</p><div class="table-wrap"><table><thead><tr><th>基金 / 代码</th><th>调前 %</th><th>调后 %</th><th>变化（百分点）</th><th>动作</th></tr></thead><tbody>${e.funds.map(f=>`<tr><td>${esc(f.name)}<small>${esc(f.code)}</small></td><td>${f.before.toFixed(2)}</td><td>${f.after.toFixed(2)}</td><td>${f.delta>0?'+':''}${f.delta.toFixed(2)}</td><td>${esc(f.action)}</td></tr>`).join('')}</tbody></table></div></article>`).join('');
 document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==b.dataset.view);document.querySelectorAll('nav button').forEach(x=>x.setAttribute('aria-selected',String(x===b)));});
 for(const id of ['compareA','compareB'])$(id).innerHTML=strategies.map(s=>`<option value="${esc(s.id)}">${esc(s.name)} · ${esc(s.code)}</option>`).join('');
 $('compareA').value=byId.has('gffunds__GFJJ000001')?'gffunds__GFJJ000001':strategies[0].id;$('compareB').value=byId.has('gffunds__GFJJ003101')?'gffunds__GFJJ003101':strategies[1].id;
 $('from').value=data.window.from;$('to').value=data.window.to;$('runCompare').onclick=compare;$('search').oninput=renderList;$('sort').onchange=renderList;renderList();compare();
 window.__advisorReleaseReady={buildId:data.buildId,strategies:strategies.length,events:data.events.length,rankedStrategies:ranked.length};
}catch(error){$('error').hidden=false;$('error').textContent='数据暂未能完整展示：'+error.message;}
})();
