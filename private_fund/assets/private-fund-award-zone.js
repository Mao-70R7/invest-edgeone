/* Public award register: direct recipients, explicit verification, bounded DOM. */
(() => {
  const root=document.getElementById('mainContent'), pack=window.__PRIVATE_FUND_AWARD_ZONE__;
  if(!root)return;
  root.classList.add('awards-page');
  if(!pack?.meta?.available){root.innerHTML='<section class="empty-panel">获奖名单尚未生成，请先更新页面数据。</section>';return;}
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses={cross_checked:'交叉核验',text_verified:'正文核验',recipient_text_verified:'获奖对象核验',source_extracted:'来源提取',needs_review:'待核对',secondary_text_pending:'二手名单待核'};
  const params=new URLSearchParams(location.search), rows=pack.rows, size=30;
  const state={brand:params.get('brand')||'',year:params.get('year')||'',type:params.get('type')||'',status:params.get('status')||'',match:params.get('match')||'',q:params.get('q')||'',page:Math.max(1,Number(params.get('page'))||1),...Object.fromEntries(Object.entries(window.PrivateFundAwardScatter.defaults).map(([k,v])=>[k,params.get(k)||v]))};
  const unique=k=>[...new Set(rows.map(r=>r[k]).filter(v=>v!=null&&v!==''))].sort((a,b)=>k==='year'?b-a:String(a).localeCompare(String(b),'zh-CN'));
  const n=v=>Number(v).toLocaleString('zh-CN');
  function select(k,label,values,labels={}){return `<label>${label}<select name="${k}"><option value="">全部</option>${values.map(v=>`<option value="${esc(v)}">${esc(labels[v]||v)}</option>`).join('')}</select></label>`;}
  root.innerHTML=`<section class="award-heading"><div><p class="award-eyebrow">AWARDS / 获奖记录</p><h1>获奖专区</h1><p>机构、经理、产品三个视角，观察获奖次数与风险收益。</p></div><small>数据快照<br>${esc(pack.meta.generatedAt||'—')}<br>匹配快照 ${esc(pack.meta.matchedAt||'未建立')}</small></section>
    <section class="award-kpis" aria-label="全库获奖记录统计">${[['全部记录',rows.length],['公司奖',rows.filter(r=>r.type==='公司').length],['经理奖',rows.filter(r=>r.type==='经理').length],['产品奖',rows.filter(r=>r.type==='产品').length]].map(([s,v])=>`<div><span>${s}</span><strong>${n(v)}<small>条</small></strong></div>`).join('')}</section>
    <section class="panel award-matrix-panel"><div class="panel-head"><h2>奖项 × 公布年份</h2><span>点击数量筛选名单 · 记录数，非去重获奖人数</span></div><div class="award-matrix-scroll" id="awardMatrix"></div></section>
    <section class="panel"><form id="awardFilters" class="award-filters" aria-label="获奖名单筛选"><label class="award-search">获奖对象 / 所属公司 / 奖项关键词<input name="q" type="search" placeholder="输入名称或奖项关键词" autocomplete="off"></label>${select('brand','奖项',unique('brand'))}${select('year','公布年份',unique('year'))}${select('type','获奖对象',unique('type'))}${select('status','核验状态',unique('status'),statuses)}${select('match','入库匹配',['matched','unmatched','linked'],{matched:'已匹配对象',unmatched:'未匹配对象',linked:'可查看产品'})}<button type="button" id="awardReset">重置</button></form><div id="awardScatterBoards"></div><h2 class="aw-register-title">获奖明细</h2><p id="awardResult" role="status" aria-live="polite"></p><div id="awardTable"></div><div class="award-pagination"><button id="awardPrevious" type="button">上一页</button><span id="awardPage"></span><button id="awardNext" type="button">下一页</button></div></section>
    <details class="award-method"><summary>名单口径与核验说明</summary><p>${esc(pack.meta.method)}</p><p>一条记录对应一名直接获奖对象的一项奖。相同对象跨年份、跨奖项获奖分别保留；公司、经理与产品不合并计数。公布年份是榜单发布年份，评价年度和评价年限为奖项原始口径，未披露时显示“—”。</p><p>“来源提取”表示已从来源获取，不等于完成独立核验。“正文核验”“获奖对象核验”“交叉核验”分别保留实际状态；“待核对”“二手名单待核”不视为已确认。未匹配只表示尚未关联本库对象，不代表未获奖；已匹配也不代表业绩完整。</p><p>机构奖不下传至旗下产品。仅直接产品奖且对应产品在本次页面目录内时提供产品详情入口。年份矩阵显示当前库已收集范围；“—”表示本库无记录，不代表当年未颁奖。</p><p>仅用于内部研究，不构成任何投资建议。</p></details>`;
  const form=document.getElementById('awardFilters');
  let periodExplicit=Boolean(params.get('period'));
  const scatter=window.PrivateFundAwardScatter.mount(document.getElementById('awardScatterBoards'),pack.scatter,(k,v)=>{
    state[k]=v;
    if(k==='period')periodExplicit=true;
    if(!periodExplicit&&((k==='x'&&v==='volatility')||(k==='y'&&v==='annual_return')))state.period='since';
    state.page=1;render(true);
  });
  root.querySelector('.award-matrix-panel').before(root.querySelector('#awardFilters').closest('.panel'));
  const secondary=[...form.querySelectorAll('label')].filter(el=>['type','status','match'].includes(el.querySelector('select')?.name));
  const advanced=document.createElement('details');advanced.className='aw-list-filters';advanced.innerHTML='<summary>更多名单条件</summary><div></div>';secondary.forEach(el=>advanced.lastElementChild.append(el));form.insertBefore(advanced,document.getElementById('awardReset'));

  const time=v=>v?String(v).replace('T',' ').slice(0,16):'未建立';
  root.querySelector('.award-heading small').innerHTML=`数据快照 ${esc(time(pack.meta.generatedAt))}<br>匹配快照 ${esc(time(pack.meta.matchedAt))}`;
  function sync(){for(const el of form.elements)if(el.name)el.value=state[el.name]||'';}
  function matches(r,skip=[]){return ['brand','year','type','status'].every(k=>skip.includes(k)||!state[k]||String(r[k])===state[k])&&(!state.q||[r.recipient,r.company,r.category,r.strategy,r.series].join(' ').toLowerCase().includes(state.q.toLowerCase()))&&(!state.match||(state.match==='matched'?r.matched:state.match==='unmatched'?!r.matched:r.productKeys?.length));}
  function render(push=false){
    const filtered=rows.filter(r=>matches(r)), totalPages=Math.max(1,Math.ceil(filtered.length/size));state.page=Math.min(totalPages,Math.max(1,state.page));
    if(push){const p=new URLSearchParams();for(const [k,v]of Object.entries(state))if(v&&(k!=='page'||v!==1))p.set(k,v);history.pushState(null,'',location.pathname+(p.size?'?'+p:''));}
    sync();scatter.render(filtered,state);const selected=rows.filter(r=>matches(r,['brand','year'])), years=unique('year'), brands=unique('brand');
    document.getElementById('awardMatrix').innerHTML=`<table class="award-matrix"><caption class="sr-only">各奖项按公布年份统计，点击格子筛选</caption><thead><tr><th>奖项</th>${years.map(y=>`<th>${y}</th>`).join('')}</tr></thead><tbody>${brands.map(b=>`<tr><th>${esc(b)}</th>${years.map(y=>{const count=selected.filter(r=>r.brand===b&&r.year===y).length;return `<td>${count?`<button type="button" data-brand="${esc(b)}" data-year="${y}" aria-label="${esc(b)} ${y}年 ${count}条" aria-pressed="${state.brand===b&&state.year===String(y)}">${n(count)}</button>`:'<span title="本库暂无记录">—</span>'}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
    document.getElementById('awardResult').textContent=`当前 ${n(filtered.length)} 条 / 全库 ${n(rows.length)} 条 · 公布年份 ${state.year||'全部'} · ${state.brand||'全部奖项'} · ${state.type||'全部获奖对象'}`;
    const visible=filtered.slice((state.page-1)*size,state.page*size);
    document.getElementById('awardTable').innerHTML=visible.length?`<div class="award-table-scroll"><table class="award-table"><caption class="sr-only">获奖名单</caption><thead><tr><th>获奖对象</th><th>奖项 / 类别</th><th>公布 / 评价</th><th>核验 / 匹配</th><th>来源</th></tr></thead><tbody>${visible.map(r=>`<tr class="${/广发基金/.test(r.company||'')?'award-gf':''}"><td><span class="award-kind">${esc(r.type)}</span><strong>${esc(r.recipient||'名称待核')}</strong>${r.type!=='公司'&&r.company?`<small>${esc(r.company)}</small>`:''}${(r.productKeys||[]).map((key,i)=>`<a href="./detail.html?id=${encodeURIComponent(key)}">查看产品${r.productKeys.length>1?' '+(i+1):''} ↗</a>`).join('')}</td><td><strong>${esc(r.brand)} · ${esc(r.series||'')}</strong><small>${esc(r.category||'类别未披露')}</small>${r.strategy?`<small>${esc(r.strategy)}</small>`:''}</td><td>${esc(r.year)}<small>评价年度 ${esc(r.evaluationYear||'—')}</small><small>评价年限 ${r.periodYears?esc(r.periodYears)+'年':'—'}</small></td><td><span class="award-status ${['needs_review','secondary_text_pending'].includes(r.status)?'pending':''}">${esc(statuses[r.status]||'状态待核')}</span><small>${r.matched?'已匹配对象':'未匹配对象'}${r.type==='产品'&&r.matched&&!r.productKeys?.length?' · 本次页面无产品入口':''}</small></td><td>${/^https?:\/\//i.test(r.url||'')?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>`:'来源链接未提供'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-panel">没有符合当前条件的记录，可清空关键词或重置筛选。</div>';
    document.getElementById('awardPage').textContent=`${state.page} / ${totalPages} 页 · 每页 ${size} 条`;
    document.getElementById('awardPrevious').disabled=state.page<=1;document.getElementById('awardNext').disabled=state.page>=totalPages;
    // Sorting just the visible page would falsely imply a full-register sort.
    root.querySelectorAll('table').forEach(t=>{t.dataset.externalSort='true';});
  }
  form.addEventListener('submit',e=>e.preventDefault());
  form.addEventListener('change',e=>{if(e.target.name){state[e.target.name]=e.target.value;state.page=1;render(true);}});
  let timer;form.q.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.q=form.q.value.trim();state.page=1;render(true);},180);});
  document.getElementById('awardReset').onclick=()=>{clearTimeout(timer);periodExplicit=false;for(const k in state)state[k]=k==='page'?1:(window.PrivateFundAwardScatter.defaults[k]||'');render(true);};
  document.getElementById('awardMatrix').onclick=e=>{const b=e.target.closest('[data-brand]');if(b){state.brand=b.dataset.brand;state.year=b.dataset.year;state.page=1;render(true);}};
  for(const [id,delta]of [['awardPrevious',-1],['awardNext',1]])document.getElementById(id).onclick=()=>{state.page+=delta;render(true);document.getElementById('awardResult').scrollIntoView({block:'nearest'});};
  addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);periodExplicit=Boolean(p.get('period'));for(const k in state)state[k]=k==='page'?Math.max(1,Number(p.get(k))||1):p.get(k)||'';render();});
  render();document.body.dataset.ready='true';
})();
