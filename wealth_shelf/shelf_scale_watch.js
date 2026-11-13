/* One source/product/share per row. Each return carries its own dates/basis. */
window.ShelfWatch = (() => {
  'use strict';
  const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (v,n=2) => v == null ? '—' : Number(v).toLocaleString('zh-CN',{minimumFractionDigits:n,maximumFractionDigits:n});
  const pct = v => v == null ? '—' : (v>0?'+':'')+fmt(v*100)+'%';
  const basis = {adjusted_nav:'同源复权净值',unit_no_dividend_evidence:'同源单位净值；区间未见累计净值差异',howbuy_official_period_return_percent_verified:'好买官方区间收益；百分比单位已核验',cicc_independently_reviewed_interval_adjusted_NAV:'中金单快照复权净值；区间独立核验'};
  let D, channel, page=0, chosen=[];
  const $ = s => document.querySelector(s);
  function subset() {
    const min=$('#watch-size').value, status=$('#watch-status').value, q=$('#watch-search').value.trim().toLowerCase();
    const onlyPrivate=channel==='ciccwm_app' && $('#scope')?.value==='private';
    return D.products.filter(p => p.source_id===channel && (!onlyPrivate || p.is_private_manager))
      .filter(p => min==='large'?p.scale!=null && p.scale>=1:min==='known'?p.scale!=null:min==='missing'?p.scale==null && p.scale_status_code==='not_disclosed':p.scale==null && p.scale_status_code!=='not_disclosed')
      .filter(p => !q || [p.code,p.name,p.company,p.category,...p.labels.map(l=>l.label)].join(' ').toLowerCase().includes(q))
      .filter(p => status==='updated' ? (p.latest_nav||'')>'2026-10-30' : status==='not-updated' ? !(p.latest_nav && p.latest_nav>'2026-10-30') : status==='gaps' ? D.periods.some(k=>!p.returns[k.id]) : true)
      .sort((a,b)=>(b.scale??-Infinity)-(a.scale??-Infinity) || a.code.localeCompare(b.code,'zh'));
  }
  function returnCell(p,k) {
    const fresh=p.returns[k], old=p.return_references?.[k], v=fresh||old;
    if (!v) { const reason=p.return_gaps[k]||'该区间尚无通过核验的收益', pending=/冲突|待核|差异|复权|隔离|哈希|身份|口径|不一致/.test(reason);return `<td class="watch-gap"><details><summary>— <span>${pending?'口径待核':'数据缺失'}</span></summary><div>${esc(reason)}<br>不以其他渠道、其他份额或成立以来收益补齐。</div></details></td>`; }
    const cls=v.value>0?'watch-positive':v.value<0?'watch-negative':'watch-neutral';
    return `<td><details><summary><b class="${cls}">${pct(v.value)}</b>${old?'<span class="watch-stale">历史参考</span>':''}<small>截至 ${esc(v.end)}</small></summary><div>实际区间 ${esc(v.start)} 至 ${esc(v.end)}<br>${esc(basis[v.basis]||v.basis)}${old?'<br>期末距观察日超过10天，不纳入当前收益统计。':''}</div></details></td>`;
  }
  function render() {
    chosen=subset();page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(chosen.length/25)-1)));
    const name=D.channels.find(c=>c.id===channel).name;
    const all=D.products.filter(p=>p.source_id===channel && !(channel==='ciccwm_app' && $('#scope')?.value==='private' && !p.is_private_manager));
    const known=all.filter(p=>p.scale!=null), big=known.filter(p=>p.scale>=1), updated=big.filter(p=>(p.latest_nav||'')>'2026-10-30'), withYtd=big.filter(p=>p.returns.ytd);
    $('#watch-title').textContent='有规模产品业绩跟踪 · '+name;
    const scopeNote=channel==='ciccwm_app'?(document.querySelector('#scope')?.value==='private'?' 当前仅展示官方私募管理人子集。':' 当前为原高端理财货架；上述大规模产品中，官方私募管理人子集 '+fmt(big.filter(p=>p.is_private_manager).length,0)+'只。'):'';
    $('#watch-summary').textContent=`已核验规模 ${fmt(known.length,0)}只；其中 ≥1亿元 ${fmt(big.length,0)}只，10月30日后净值更新 ${fmt(updated.length,0)}只，今年以来有效收益 ${fmt(withYtd.length,0)}只。未更新不等于经营风险，需结合来源状态核查。${scopeNote}`;
    $('#watch-count').textContent=`匹配 ${fmt(chosen.length,0)}只 · 第 ${page+1}/${Math.max(1,Math.ceil(chosen.length/25))}页 · 默认规模降序`;
    $('#watch-body').innerHTML=chosen.slice(page*25,page*25+25).map(p=>`<tr><td><b>${esc(p.name)}</b><small>${esc(p.code)} · ${esc(p.category)}</small><small>${esc(p.company)}</small><small>产品状态：${esc(p.product_status||p.sale_status||'未披露')}</small></td><td><b>${fmt(p.scale,3)}</b><small>亿元</small>${p.scale==null?'<small>未纳入规模合计</small>':''}</td><td>${esc(p.scale_date)}<small>${esc(p.scale_freshness)}</small><details><summary>规模口径</summary><div>${esc(p.scale_status_note)}${p.scale_scope_note?'<br>'+esc(p.scale_scope_note):''}</div></details></td><td>${esc(p.latest_nav)}<small>${p.latest_nav?(p.latest_nav>'2026-10-30'?'10/30后已更新':'10/30后未见更新'):'净值日期缺失'}</small></td>${D.periods.map(k=>returnCell(p,k.id)).join('')}</tr>`).join('') || `<tr><td colspan="12" class="watch-empty">当前条件下暂无产品。可切换规模范围或清除搜索。</td></tr>`;
    $('#watch-prev').disabled=page===0;$('#watch-next').disabled=(page+1)*25>=chosen.length;
  }
  function exportRows() {
    // Download the entire matched set, never only the current page.
    const headers=['渠道','产品代码','产品名称','管理机构','产品类别','产品状态','最新规模_亿元','规模披露日期','规模状态','最新净值日期'];
    D.periods.forEach(k=>headers.push(k.name+'_收益率百分数',k.name+'_期初日期',k.name+'_期末日期',k.name+'_状态',k.name+'_口径或缺口'));
    const rows=chosen.map(p=>{
      const r=[D.channels.find(c=>c.id===p.source_id).name,p.code,p.name,p.company,p.category,p.product_status||p.sale_status||'未披露',p.scale,p.scale_date,p.scale_status_note,p.latest_nav];
      D.periods.forEach(k=>{const f=p.returns[k.id],v=f||p.return_references?.[k.id];r.push(v?v.value*100:null,v?.start,v?.end,f?'有效':v?'历史参考，期末超过10天':'缺失或待核实',v?(basis[v.basis]||v.basis):p.return_gaps[k.id]);});return r;
    });
    const quote=v=>{let s=String(v??'');if(typeof v==='string' && /^[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    const csv='\ufeff'+[headers,...rows].map(r=>r.map(quote).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})), a=document.createElement('a');a.href=url;a.download=D.channels.find(c=>c.id===channel).name+'_有规模产品业绩跟踪_'+D.as_of+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function mount(data) {
    D=data;channel=D.channels[0].id;
    $('#watch-head').innerHTML='<th>产品／管理机构</th><th>最新规模</th><th>规模披露日期</th><th>最新净值日期</th>'+D.periods.map(k=>`<th>${esc(k.name)}</th>`).join('');
    $('#watch-method').textContent=`观察截止 ${D.as_of}。各渠道、产品和份额独立；规模使用最新已核验披露值，各单品日期不同，不代表渠道保有量。收益单元格可展开查看实际起止日及口径；期末距观察日超过10天仅作历史参考。缺失及待核实不补零、不拼接，源净值有更新不代表所有区间收益可算。`;
    document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('button[data-src]');if(b){channel=b.dataset.src;page=0;render();}});
    document.getElementById('tabs').addEventListener('keydown',()=>setTimeout(()=>{const b=document.querySelector('#tabs button[aria-selected="true"]');if(b){channel=b.dataset.src;page=0;render();}},0));
    $('#scope')?.addEventListener('change',()=>{page=0;render();});
    ['watch-size','watch-status'].forEach(id=>$('#'+id).onchange=()=>{page=0;render();});
    $('#watch-search').oninput=()=>{page=0;render();};$('#watch-prev').onclick=()=>{page--;render();};$('#watch-next').onclick=()=>{page++;render();};$('#watch-export').onclick=exportRows;
    window.shelfWatchDebug={get rows(){return chosen;},get channel(){return channel;},get data(){return D;}};
    render();
  }
  return {mount};
})();
